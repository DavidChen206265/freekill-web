# Web-Only Roadmap · 近期执行计划

> 2026-06-11 建立,2026-06-11 经源码审计修订。依据:当前 `PROGRESS.md`、`freekill_web_implementation_plan.md`、2026-06-10 全量 audit 报告、Web-only 转向判断,以及对 `freekill-asio` C++/SQL/Lua 源码的逐符号审计。
>
> 决策变化:放弃“原版 asio 不改 + Qt/Web 混连”目标,在 **`freekill-web-asio` 独立 fork 仓库**(`https://github.com/DavidChen206265/freekill-web-asio`,项目内目录 `freekill-web-asio/`)维护 Web-only 改动;`freekill-asio/` 保留为只读 diff 基线。保留原版 Lua 规则与客户端 VM,但服务端/网关/资源发布按 Web 产品优化。

## 审计结论(2026-06-11,先读后写)

对 Codex 初版计划逐符号核实,结论:**方向正确,服务端/DB 层符号几乎全部命中,但有 1 处治理冲突、1 处架构缺口、2 处工作量误标**,已在下方修订。源码锚点:

- ✅ `AuthManager::checkMd5()` 真实存在,`auth.cpp:251-265`,**单一调用点**,加 `checkClientMd5` 开关是 3 处小改(struct + loadConf + 1 个 if 守卫)。
- ✅ `Room::isOutdated()`(`room.cpp:381`)/`RoomThread::isOutdated()`(`roomthread.cpp:187`)真实存在,但**被 6+ 处生命周期调用**且有副作用(命中即清 `md5=""` 使后续永远 outdate)——不是小开关,见 W0-3。
- ✅ `SetServerSettings` 在 `user_manager.cpp:211-218`,当前是 positional CBOR 数组 `{motd, hiddenPacks, enabledFeatures}`,**追加字段安全**(不可中插)。
- ✅ `globalSaves(uid,key,data)` 表 + 完整异步 C++ API(`serverplayer.cpp:376-423`)真实可用;`gameSaves`/`userinfo`/`usergameinfo`/`pWinRate`/`gWinRate`/`runRate` 名称全部命中。
- ⚠️ `friendinfo` 表存在(`init.sql:50-54`)但**零引用、无任何现成逻辑**——W2-3 是空表上的绿地开发,不是“接好友逻辑”。
- ⚠️ `tempBan` 真名 `Server::temporarilyBan`(`server.cpp:292`),默认 20 分钟,2 处触发点(`room.cpp:269` 换房 / `room.cpp:665` 掉线),gating 确实局部。
- ⚠️ AI(P4)路径对(`lua/lunarltk/server/ai/`),但 SmartAI 策略注册被 stub 成 no-op(`smart_ai.lua:165/201/217` 全是 `do return end`),**无 `aiLevel` 概念、无 self-play harness**——是研究级长线,非“小改 + 填模板”。

## 当前事实

- M2/M3/M4 已完成并真机验收通过:基础身份局可玩、断线重连/旁观可用、交互补全、视觉动画音频可用。
- M5-a/b/c 已部分完成:单局 MiscStatus/标记区、utility+standard_ex+sp 加载、QmlMark 文本、ChooseSkillBox、MD5 算法和 PWA 缓存。
- 旧路线的剩余项“Qt↔Web 混连”和“客户端 MD5 严格对齐”不再作为目标。
- audit 真缺口集中在:扩展弹窗/标记查看、i18n、Web 产品化账户/大厅/资料库/回放、生产化和少量 UI bug。

## 工作纪律

1. 仍然 **先读后写**:UI/交互动手前读对应 QML/Lua/计划节;可照搬的坐标/数据结构/动画语义必须照搬。
2. VM 仍是状态真相源;React 不重算规则。
3. 服务端 fork 改动只做小而确定的开关/API,不重写房间线程、Lua 规则、CBOR 路由。
4. 每个切片修一项验一项;涉及共享包或网关/服务端协议时跑相关单测 + 至少一个真 asio/Web E2E。
5. 每段实质工作结束执行 `.codex/workflows/sync.md`(或 Claude `/sync`)。
6. **terminal 里直接给用户看的回复用简体中文。**

## P0 · Web-Only 服务端小 fork

目标:用最少服务端修改移除当前最大运维/扩展摩擦。**按风险/工作量重排序**:先做真正局部的 MD5 登录开关与 manifest,再做触面较深的房间过期 gating。

### W0-0 建立 fork 仓库与边界(前置)

- 把 `freekill-asio` 源码推入项目内 `freekill-web-asio/`(git 跟踪)+ 远端 `https://github.com/DavidChen206265/freekill-web-asio`;`freekill-asio/` 留作只读 diff 基线。
- 更新 `CLAUDE.md`/`AGENTS.md`/`project-state.mjs` 的仓库布局与 TRACKED 列表、Docker 构建源(指向 fork)。
- 所有 W0 配置加在 `ServerConfig`(`server.h:17-35`)+ `loadConf()`(`server.cpp:223-261`),默认值保持上游兼容:
  - `checkClientMd5: true`(默认开,Web 部署关)
  - `invalidateRoomsOnPackageChange: true`(默认开,Web 部署关)
  - `tempBanByIp: true`(默认开,Web 部署关)
  - `webOnly: false`(默认关)
- 验收:默认兼容旧配置启动;Web-only 配置(全部按上表反转)能启动并登录。

### W0-1 跳过 MD5 登录校验(局部,先做)

源码点(单一):`AuthManager::checkMd5()` `auth.cpp:255` 的 `server.getMd5() != md5_str` 比较。

- 改法:`if (config.checkClientMd5 && server.getMd5() != md5_str) { ...拒绝... }`。
- `Server::refreshMd5()`(`server.cpp:365`)/`calcFileMD5` 保留,仅供日志/诊断/manifest 复用。

验收:
- `checkClientMd5=false` 时,不设 `FK_MD5` 或故意错 MD5,Web 仍能登录。
- gateway handshake 测试(`apps/gateway/test/handshake.test.ts:20`,已尊重 `process.env.FK_MD5`)更新为 Web-only 语义:断言 MD5 缺失/错误时登录仍成功。

### W0-2 服务端下发 Web manifest/capabilities + 统一资源包集合 ✅(2026-06-11)

> **架构修订:本节合并旧 W1-1 的 ART_PACKS 修复**——manifest 是消除 `R-ASSET-MISMATCH` 的正解,应同时成为 Web 端包集合的唯一真相源,而不是再各自硬编码。

已落地(fork 提交 `fc03c24` + web S2/S3/S4):服务端 `listEnabledPacks()`(`core/util.cpp`,从真实包状态枚举,含 builtins)→ `SetServerSettings`(`user_manager.cpp`)末尾追加 manifest 对象;web `serverManifestStore` + 路由 case 消费,`setArtPacks`/`setAudioPacks` 用 `enabledPacks` 替换 skin.ts/audio.ts 硬编码(修 P7-032),`waitingState` 按 `webFeatures` 门 AddRobot(修 P4-004)。**真 asio 验证三者一致**:asio 扫描 `[std/std_cards/maneuvering/sp/standard_ex/utility]` == file-list.json extra == assetVersion `8efa2cc`(flist md5)。

在 `SetServerSettings`(`user_manager.cpp:211-218`)的 positional 数组**末尾追加**一个 Web manifest 对象:

```json
{
  "webOnly": true,
  "serverBuild": "...",
  "assetVersion": "...",
  "enabledPacks": ["utility", "standard_ex", "sp"],
  "webFeatures": ["AddRobot", "ChangeRoom", "WebProfile", "RoomPreset"]
}
```

关键约束(修订):
- `enabledPacks`/`assetVersion` **必须从 asio 实际加载的包状态生成**(复用 `_refreshMd5` 的 flist 目录扫描 + `packages.db` enable 标志),**不得**用 config 字面量手列——否则只是把不一致从 MD5 搬到 manifest。
- Web/gateway 读取后:决定资源加载与功能显隐;manifest 的 `enabledPacks` 成为 `skin.ts:13`/`audio.ts:16` 的 `ART_PKGS` 与 `sync-fk-assets.mjs:43` 的 `ART_PACKS` 的**单一来源**,删除三处硬编码常量(修掉 P7-006/P7-032)。
- MD5 仅保留为诊断字段,不作为准入。

验收:
- VM 实际加载包集合 == manifest `enabledPacks` == asio 实际加载集合(三者一致探测)。
- 启用 utility/standard_ex/sp 后,扩展包美术/音频在浏览器被正确探测(不再静默回退)。

### W0-3 关闭 MD5 房间过期踢人 ✅(2026-06-11)

源码点(**非小开关,多调用点**):`Room::isOutdated()` `room.cpp:381` / `RoomThread::isOutdated()` `roomthread.cpp:187`。

已落地(fork 提交 `5e8a2e3`):**比计划更优的单点 gate**——直接在两个 `isOutdated()` 入口按 `invalidateRoomsOnPackageChange` short-circuit(在 `md5=""` 副作用前 return false),一处覆盖全部消费者(开局/退房/gameOver/线程回收 + lobby.cpp 房列表 outdated 标志,实测比计划列的 6 处更多)。**关键补救**:`_refreshMd5()` 结尾还有个**无条件**踢光大厅的循环(isOutdated 门盖不住),另用 flag 包住。tempBan 两处(`room.cpp:270` 换房 / `room.cpp:672` gameOver)用 `tempBanByIp` 守卫。默认 true=上游行为。**真 asio + 对照验证**:webonly 下 `disable sp` 后大厅玩家留连;upstream 下同命令刷新瞬间踢人。

验收:
- 改包/重启后等待房间和运行中房间不因 MD5 outdate 被踢。
- Web 玩家中途退出运行局不再连带 IP 封禁(同机共用 IP 场景)。

### W0-4 调整 Web 部署说明 ✅(2026-06-11)

已落地(`freekill-web` 提交 `4dc2ce2`):
- `asio.Dockerfile` 构建源从 `freekill-asio/` 切到 `freekill-web-asio/`(fork);`dockerignore.repo-root` 放行 fork、排除 fork `build/`+`packages/` 与只读基线 `freekill-asio/`。
- `docker/freekill.server.config.json` 落 Web-only 四开关(`webOnly`/`checkClientMd5:false`/`invalidateRoomsOnPackageChange:false`/`tempBanByIp:false`)——部署即跳过 MD5、改包不踢、不封 IP。
- `docker-compose.yml`、`docker/README.md` 去掉“必须重算 FK_MD5”主流程,改为 Web-only 说明;`compute-md5` 仅作诊断/兼容保留。
- **未在本机 docker build**(daemon 不可用);fork 用与 Dockerfile 同款 cmake/make 已在 WSL 反复验证可编译,所有 COPY 源路径核实存在,config JSON 解析正确。VPS 上 `docker compose up -d --build` 实测留作真机验收点。

## P1 · 扩展包 UI 和局内缺口收尾

目标:让主流扩展包稳定可玩,不追 Qt 混连。

### W1-1 修小 bug

- ~~P7-006/P7-032 ART_PACKS 统一~~ **已并入 W0-2**(manifest 成为包集合单一来源时一并删除 `skin.ts`/`audio.ts`/`sync-fk-assets.mjs` 三处硬编码)。
- P4-013:对局中 QuitRoom 二次确认。
- P4-004:等待房间 AddRobot 按 serverFeatures/capabilities(W0-2 manifest 的 `webFeatures`)显隐。

### W1-2 QmlMark 点击查看型

- `@&`/`@$`/`@[...]` 点击查看牌堆/武将堆/信息框。
- 优先 ViewPile / ViewGeneralPile / PlayerBox / DetailBox。
- 验收:真 VM 构造或扩展包实测,标记点击不再无反馈。

### W1-3 utility 共享框按包驱动补齐

已完成 ChooseSkillBox。后续按启用包扫描 `qml_path` / `addMiniGame`:

- CardNamesBox。
- ChooseCardsAndChoiceBox。
- PlayerBox / DetailBox。
- 简单 MiniGame 通用选择框。

未覆盖的 qml_path 继续走 unsupported 兜底,不卡死。

### W1-4 交互解释性补丁

- DetailedChoice / DetailedCheckBox 富描述。
- 手牌禁用原因 `prohibitReason`。
- LimitSkillArea / banner 若 VM 镜像已含状态则低成本补渲染。

## P2 · Web 账户与个性化

目标:先用现有数据库能力做产品闭环,不等大账户系统。

### W2-1 用户 KV 设置

利用 `globalSaves(uid,key,data)`:

- `web.roomPresets` 个性化建房预设。
- `web.disabledGenerals` 禁将/禁包方案。
- `web.uiPrefs` UI/音频/布局偏好。
- `web.recentPacks` 最近使用包集合。

需要新增 Web API 或 gateway notify 封装,不要让 React 直接拼底层 RPC。

### W2-2 房间设置 V2

在现有 `settings` CBOR blob 内约定结构化字段:

- `enabledPacks`
- `disabledGenerals`
- `aiLevel`
- `visibility`
- `presetId`

服务端只解析少数字段用于房间列表和校验;Lua 仍接收完整 settings。

### W2-3 社交和成长

利用/扩展 SQLite:

- `friendinfo`(`init.sql:50-54`)做好友/黑名单。**注:该表当前零引用、无任何现成 C++/Lua 逻辑,是空表上的绿地开发**——需新建 ServerPlayer 读写方法 + 网关 API,工作量按“新功能”而非“接现成逻辑”估。
- 新表 `achievements`、`user_levels` 或直接 `globalSaves` MVP。
- 个人资料页:头像、总时长(`usergameinfo`)、胜率(`pWinRate`/`gWinRate`)、成就、常用武将。

## P3 · 生产化

- R-CRED:替换 localStorage 明文密码为 session token / 服务端会话 / httpOnly 方案。
- 数据卷备份:users.db、game.db、packages、配置。
- 管理后台:封禁、房间、包启用、用户查询、日志。
- 日志/监控:gateway + asio + Caddy health check。
- 容量压测:WS 连接数、asio 房间线程、wasmoon 客户端内存。

## P4 · 创意工坊与 AI 提升

这不是小改服务端,但 Web-only 后变为可规划产品线。

### W4-1 创意工坊 MVP

- 只支持“审核安装包”:上传/导入 → 离线扫描 → 测试通过 → 管理员启用 → manifest 发布。
- 公共服不直接执行未经审核 Lua。
- 单人沙盒房可先支持未审核包测试,运行在隔离容器/独立实例。

### W4-2 AI 提升(研究级长线,非小改 —— 审计修订)

> **工作量修订:不要当成“小改服务端 + 填模板”。** 源码现状:SmartAI 的策略注册层被 stub 成 no-op(`smart_ai.lua:165/201/217` 三个 `set*SkillAI` 全是 `do return end`,`fk.ai_skills` 从不被填充);**无 `aiLevel` 概念**;**无 self-play harness**(`logic.lua` 只评估单步收益,不跑整局)。这是一个未完成的基础功能,不是可一蹴而就的切片。

明确 MVP 边界,放在最后做:

- (a) 取消 stub、打通策略注册 —— **小**。
- (b) 为约 10 个高频牌/技能写策略 —— **中**(全量是数百条,不在 MVP)。
- (c) 从零搭最小 headless 自对局评测脚本 —— **中**(需整局可复制/复盘)。
- (d) C++ 侧加 `aiLevel` 参数 + 评测入口 —— **小**(但确需新 API,非“直接传参”)。
- 主要工作在 `freekill-core/lua/lunarltk/server/ai/`;用胜率/失误统计迭代,先闭环再扩面。

## 延后清单

以下不阻塞近期 Web-only 转向:

- 完整回放/录像/战绩页(audit Phase 8)。
- 武将/卡牌资料库和高级筛选(audit Phase 9)。
- 完整大厅设置/服务器浏览器/首次教程(audit Phase 3/Phase 1)。
- 独立游戏模式(chess-games/poker-games),因自带 RoomScene,应单独立项。

## 近期推荐顺序(审计后重排)

1. **W0-0**:推 fork 仓库 + 配置项落位(默认兼容上游)。✅
2. **W0-1**:`checkClientMd5` 登录跳过(单点,最小)。✅
3. **W0-2**:Web manifest/capabilities + 用 manifest 统一包集合、删 ART_PACKS 三处硬编码(同时修 P7-006/P7-032 与 R-ASSET-MISMATCH)。✅
4. **W0-3**:`invalidateRoomsOnPackageChange`/`tempBanByIp` 房间过期与封禁 gating(触面较深,从 `_refreshMd5` 扫描处中和)。✅
5. **W0-4**:部署文档去 FK_MD5 主流程 + Docker 源切到 fork。✅(W0 全部完成)
6. **W1-1**:Quit 二次确认(AddRobot 显隐已在 W0-2 完成)。← 下一步(进入 P1)
7. **W1-2/W1-3**:按当前启用扩展包补 QmlMark 点击型 / utility 框。
8. **W2-1/W2-2**:房间预设和禁将方案。
