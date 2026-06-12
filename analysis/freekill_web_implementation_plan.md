# FreeKill Web-Only 实现计划

## 1. 方向决策

本项目从“尽量不改 `freekill-asio`、同时支持 Qt/Web 混连”转向 **Web-only**:

- 只支持浏览器 Web 客户端。
- 维护独立 fork **`freekill-web-asio`**(GitHub `https://github.com/DavidChen206265/freekill-web-asio`,项目内目录 `freekill-web-asio/`,git 跟踪);`freekill-asio/` 留作只读 diff 基线。
- 保留 fork 的房间线程、用户/房间/战绩/存档、服务端 Lua 规则。
- 保留浏览器 wasmoon 托管原版客户端 Lua,React 仍只渲染,不重写规则。
- 不再追求 Qt 客户端直连或 Qt↔Web 混连。
- 不再把客户端 flist MD5 严格一致作为 Web 登录/部署门槛。

> **2026-06-11 源码审计已核实**本计划引用的服务端符号(详见 `WEB_ONLY_ROADMAP.md`「审计结论」)。`AuthManager::checkMd5`/`Room::isOutdated`/`SetServerSettings`/`globalSaves` 等均真实存在;房间过期 gating 与 AI 提升的工作量已据实修正。

这不是推倒重来。核心判断是:规则和状态仍应复用 FreeKill Lua,但服务端协议、资源发布、账户产品能力可以按 Web 产品优化。

## 2. 当前架构

```text
Browser
  ├─ React + TS fixed stage       # 只渲染 UI
  └─ wasmoon VM + 原版客户端 Lua   # 状态镜像/可点判定/ui_emu
        │ notifyUI / ReplyToServer
        ▼
Node Gateway
  ├─ WSS 会话、登录代理、requestId、日志
  └─ Web API/manifest 能力逐步扩展
        │ TCP + CBOR
        ▼
freekill-web-asio
  ├─ 原 freekill-asio 房间/用户/战绩/存档
  ├─ 原 freekill-core 服务端 Lua
  ├─ Web-only 配置/manifest/capabilities
  └─ packages + game.db/users.db
```

## 3. 不变原则

- **不重写三国杀规则。** 服务端规则继续由 `freekill-core`/扩展包 Lua 运行。
- **不让 React 算规则。** React 消费 VM 镜像和 `notifyUI`;可点状态走客户端 Lua `ui_emu`。
- **服务端 fork 小步改。** 优先配置开关/API/manifest,不重写房间线程、Lua RPC、CBOR wire。
- **扩展包逻辑跟 Lua。** Web 工作主要是补 UI/资源/弹窗/标记渲染。
- **审计报告是缺口底账。** `freekill-web/audit/SUMMARY.md` + 16 份 Phase 报告(2026-06-12 全量重做)是还原范围和缺口的唯一来源;旧 `phase*.md` 已删除(GitHub 留存)。

## 4. Web-Only 带来的规划变化

### 删除的目标

- Qt 客户端继续直连。
- Qt 与 Web 混连进同房。
- Web gateway 必须计算并发送与 asio 完全一致的 flist MD5。
- `UpdatePackage`/Qt 包下载 UI 兼容。

### 新增的目标

- `freekill-web-asio` 支持 `webOnly` 配置。
- 服务端下发 Web manifest/capabilities。
- Web 资源版本由服务端/网关统一发布,而非客户端自证 MD5。
- 个性化账户能力:房间预设、禁将方案、好友/黑名单、等级/成就。
- 创意工坊:先审核安装包,再考虑沙盒测试。
- AI 提升:以服务端 Lua AI 策略和 headless 评测为主线。

## 5. 已完成里程碑

- **M0/M1**:网关连通、登录、大厅、建房/进房。
- **M2**:等待房间 + 基础对局完整跑通。
- **M3**:路由修复、断线重连、旁观。
- **M4**:交互补全、视觉动画/音频、日志/notifyUI 探测器。
- **M5 已完成部分**:MiscStatus/标记区、utility+standard_ex+sp 扩展包加载、QmlMark 文本型、ChooseSkillBox、`computeFlistMd5` 算法和 live 验证、PWA `/fk` 资源缓存。
- **W0 Web-only 服务端 fork(全部完成,已部署)**:W0-0 fork 仓库+4 配置项 / W0-1 跳过 MD5 登录 / W0-2 manifest+统一包集合 / W0-3 房间过期+IP 封禁 gating / W0-4 部署 config 落 Web-only 开关+Docker 源切 fork。
- **PACE 客户端演出节奏队列**:feedChain 按动画时长节流、演出资源预取、可调速度。
- **FEAT-IG 局内体验(IG-1~7)**:开局前设置面板、手气卡、身份猜测标注、玩家详情补装备/判定牌、局内聊天+送花/砸蛋、选将页右键/长按看技能、同账号顶号反向踢修复。
- **W1-RES 资源完整性三层防护**:部署侧 verify-fk-assets 构建期 gate + 客户端自检按钮 + 可选全量预缓存;同构 `enumerate.ts` 枚举器。
- **已上线**:VPS `docker compose`(asio + gateway + Caddy),HTTPS/WSS,https://sgs.davidchen.me。

MD5 算法成果保留为诊断/兼容工具,但不再是 Web-only 主流程。

> **2026-06-12 完成一次完整还原审计**(`freekill-web/audit/`,459 条):逐行对照原版 v0.5.20。结论——客户端逻辑层 = wasmoon 跑原版 client.lua(非重写),只 QML→TS 渲染层被重新实现;协议透传层(P)与标准三包呈现(O)健壮,缺口集中在 UI 表现层。**audit/SUMMARY.md 取代旧 phase*.md 成为缺口底账**(旧 phase*.md 已删,GitHub 留存)。

## 6. 短期路线

近期执行计划见 `WEB_ONLY_ROADMAP.md`(已据 2026-06-12 审计重排)。当前优先级:

1. ~~**P0 Web-only 服务端小 fork**~~:✅ 全部完成(W0-0~W0-4,已部署)。
2. **P1 对局正确性缺口(审计 §4.1,最高优先)**:还原错误 10 条(audit §3,尤其双将立绘 N2、牌堆标记计数 M3)+ 限定/觉醒/转换技显示(UpdateLimitSkill/SetBanner/UpdateMarkArea 解除 KNOWN_DEFERRED)+ 投降/托管/踢人上报入口 + 出牌交互(拖拽/双击)。
3. **P2 信息完整度缺口(审计 §4.2)**:行动者高亮/翻面/垂死贴图、总览/详情/战绩页族、建房筛选/禁将子系统、个人设置族、等待房 WaitingPhoto。
4. **P3 Web 账户与个性化**:利用 `globalSaves` 做房间预设/禁将/UI 设置;房间 settings V2;好友/等级/成就。
5. **P4 生产化**:session token、数据卷备份、管理后台、监控、压测。
6. **P5 观感打磨(审计 §4.3)**:大招动画、送礼动画、状态光环、弹幕、美化包/字体、Cheat 查看面板。
7. **P6 创意工坊与 AI 提升**:审核包发布、沙盒测试、Lua AI 策略、headless 评测。

## 7. 服务端小 fork 设计

> 符号位置经 2026-06-11 审计核实(`freekill-asio` 源码)。

### 配置

新增到 `ServerConfig`(`server.h:17-35`)+ `loadConf()`(`server.cpp:223-261`),默认值保持上游兼容,Web 部署显式反转:

```json
{
  "webOnly": true,
  "checkClientMd5": false,
  "invalidateRoomsOnPackageChange": false,
  "tempBanByIp": false
}
```

### MD5 策略

旧逻辑:

- 客户端 `Setup` 发送 MD5。
- `AuthManager::checkMd5()`(`auth.cpp:251-265`)强校验,失配即断连。
- `Room::isOutdated()`(`room.cpp:381`)/ `RoomThread::isOutdated()`(`roomthread.cpp:187`)根据 MD5 变化踢人/标过期。

Web-only:

- **登录跳过(局部,单点)**:`checkClientMd5=false` 时,gate `auth.cpp:255` 的唯一比较 `server.getMd5() != md5_str`。3 处小改。
- **房间过期关闭(触面较深,非小开关)**:`isOutdated()` 被 6+ 处生命周期消费(`room.cpp:910/780/665/269`、`roomthread.cpp:209`、`server.cpp:_refreshMd5`),且命中后清 `md5=""` 有副作用。推荐 gate 点在 `_refreshMd5()` 的 per-room 失效扫描处按 `invalidateRoomsOnPackageChange` 跳过,从源头中和,而非改 6 个消费者。
- `Server::refreshMd5()`(`server.cpp:365`)/`calcFileMD5` 继续计算 flist,仅用于日志、诊断、manifest 生成。
- gateway 的 `FK_MD5` 配置(`apps/gateway/src/config.ts:65` 硬编码默认 + env 覆盖)不再是必需项。

注意:这不代表客户端 Lua 可与服务端包不一致。Web 必须通过服务端 manifest 获取当前资源版本和启用包集合,保证 VM 与服务端规则匹配(见下及 §13 R-ASSET-MISMATCH)。

### Manifest / Capabilities

在 `SetServerSettings`(`user_manager.cpp:211-218`,当前 positional CBOR 数组 `{motd, hiddenPacks, enabledFeatures}`)**末尾追加**一个 manifest 对象(追加安全,不可中插):

```json
{
  "webOnly": true,
  "serverBuild": "...",
  "assetVersion": "...",
  "enabledPacks": ["utility", "standard_ex", "sp"],
  "webFeatures": ["AddRobot", "ChangeRoom", "WebProfile", "RoomPreset"]
}
```

**关键约束**:`enabledPacks`/`assetVersion` 必须从 asio 实际加载的包状态生成(复用 `_refreshMd5` 的目录扫描 + `packages.db` enable 标志),不得用 config 字面量手列——否则只是把不一致从 MD5 搬到 manifest。

用途:

- Web 显隐功能(`webFeatures` 驱动 AddRobot 等)。
- 资源同步和缓存失效(`assetVersion`)。
- **成为 Web 端包集合的单一真相源**:替换 `skin.ts:13`/`audio.ts:16` 的 `ART_PKGS` 与 `sync-fk-assets.mjs:43` 的 `ART_PACKS` 三处硬编码(已于 W0-2 完成,修复旧审计 P7-006/P7-032 包集合不一致)。
- 房间列表展示包集合;后续创意工坊/沙盒能力声明。

## 8. 资源与扩展包

当前包源:

- `freekill-web/packages-upstream/`:项目内镜像结构,内容 gitignore。
- `FreeKill-release/packages`:回退源。
- asio 运行目录 `packages/`:服务端实际启用包。
- Web 静态 `/fk`:浏览器 VM 和资源加载源。

Web-only 后的目标:

- 由服务端/gateway manifest 声明启用包集合。
- Web sync 根据 manifest 生成 `/fk/file-list.json` 与资源版本。
- PWA SW 继续缓存 `/fk/**`,按 `assetVersion` 失效。
- `compute-md5.mjs` 保留,但部署主流程不再要求重算 FK_MD5。

## 9. 审计缺口纳入路线

缺口底账 = `freekill-web/audit/SUMMARY.md`(459 条:未还原 160 / 简化 124 / 还原错误 10 / 完全 165)。按对局影响纳入:

### P1 对局正确性(最高优先)
- **还原错误 10 条**(audit §3):双将分屏立绘 N2、牌堆标记 `@$`/`@&` 计数显示 M3、座位移动补间 D11、旁观者聊天进弹幕 I8、Indicate 多余红环 H6、卡牌禁用语义 E9、RoomDelegate 过期房可点 B41/密码框 B40、UpdateGameData 战绩 C29、送礼动画退化 N20。
- **限定/觉醒/转换技显示**:`UpdateLimitSkill`/`SetBanner`/`UpdateMarkArea` 解除 KNOWN_DEFERRED,补 LimitSkillArea + 顶部 banner + 标记区显隐(D56/F14/F15/M14/M15)。标准三包不触发,扩展包必需。
- **对局上报入口**:投降(PushRequest surrender)、托管(Trust)、房主踢人(KickPlayer)——asio 支持、web 无入口(P 阶段)。
- **出牌交互**:手牌拖拽/超级拖拽/双击使用(E14/E15/E17);对手手牌速览 HandcardViewer + 手牌上限 n/maxCard(D32/D24)。

### P2 信息完整度
- 行动者 playing 高亮、翻面 faceturned、垂死 saveme 贴图(D12/D20/D22,数据已镜像未消费)。
- 总览/详情/战绩页族(J 阶段 23 条:武将一览、卡牌一览、武将筛选、武将池、战绩、统计)。
- 建房筛选 FilterRoom(B4/B17)、Lua 动态设置(B28)、卡包设置(B29)、禁将方案(B30)。
- 个人设置族(B31~B39:改头像、改密码、音频/控制/UI/背景设置、资料卡)。
- 等待房 WaitingPhoto 立绘/准备角标/战绩面板/房间配置面板(C2/C3/C4)。

### P5 观感打磨
- 大招 UltSkillAnimation(H9)、五种送礼动画(H20~H24+N20)、Photo 循环状态光环(H2~H4)。
- 弹幕 Danmu(I9/B13)、资源美化包(N1)、内嵌字体 FZLE/FZLBGBK/simli(N 阶段)。
- Cheat 查看面板族(L 阶段 13 条)、设置/偏好控件族 + Config(K 阶段)。

这些不阻塞已上线运营,按上述优先级立项。

## 10. 账户与数据

asio 已有(2026-06-11 审计核实表名/API):

- `userinfo`(`init.sql:5-13`):账户/密码/avatar/封禁。
- `usergameinfo`(`init.sql:43-48`):注册时间、登录时间、总时长。
- `friendinfo`(`init.sql:50-54`):好友/黑名单基础表——**当前零引用、无任何现成逻辑,空表绿地开发**。
- `pWinRate`/`gWinRate`/`runRate`:胜率/逃跑统计(均存在,真实名)。
- `gameSaves`/`globalSaves`:用户/全局 KV 存储,`globalSaves(uid,key,data)` 有完整异步 C++ API(`serverplayer.cpp:376-423`)。

规划:

1. MVP 用 `globalSaves(uid,key,data)` 做 `web.roomPresets`、`web.disabledGenerals`、`web.uiPrefs`(直接复用现成 API)。
2. 好友/黑名单接 `friendinfo`,需新建 ServerPlayer 读写方法 + Web API/UI(按新功能估,非接现成逻辑)。
3. 等级/成就先 KV MVP,稳定后拆正式表。
4. 个人资料页聚合 avatar、总时长、胜率、成就、常用武将。

## 11. 创意工坊

不要直接在公共服运行玩家上传 Lua。MVP:

1. 上传/导入扩展包。
2. 静态扫描和依赖检查。
3. headless 测试。
4. 管理员审核启用。
5. manifest 发布给 Web。

后续:

- 单人沙盒房运行未审核包。
- 隔离容器/独立实例执行玩家测试。
- 包评分、收藏、版本、依赖管理。

## 12. AI 提升

当前机器人是 `ServerPlayer` 负 ID,服务端请求由 Lua AI 回答(`request.lua:188-192` 在超时后走 `player.ai.makeReply`)。`TrustAI`(基础回退)与 `SmartAI`(`smart_ai.lua`,继承 TrustAI)都在 `lua/lunarltk/server/ai/`,但 **SmartAI 的策略注册层被 stub 成 no-op**(`smart_ai.lua:165/201/217` 三个 `set*SkillAI` 全是 `do return end`,`fk.ai_skills` 从不填充),包级 AI 定义被注释掉。

> **2026-06-11 审计修订:这不是“小改服务端 + 填模板”,是未完成的基础功能。** 无 `aiLevel` 概念、无 self-play harness(`logic.lua` 只评估单步)。下方按实际工作量分级,放在 P4 最后,先做 MVP 闭环再扩面:

- 取消 stub、打通策略注册 —— **小**。
- 为约 10 个高频牌/技能写策略 —— **中**(全量数百条不在 MVP)。
- 从零搭最小 headless 自对局评测脚本(整局可复制/复盘)—— **中**。
- C++ 侧加 `aiLevel` 参数 + 评测入口 —— **小**(确需新 API,非“直接传参”)。
- 记录 AI 胜率/失误/用牌价值,迭代策略包。

主要工作在 `freekill-core/lua/lunarltk/server/ai`;C++ 服务端只需传参和提供评测入口。

## 13. 生产化风险

**R-WEB-ASIO-FORK · fork 漂移 —— 中**  
fork 在独立仓库 `freekill-web-asio`(GitHub `DavidChen206265/freekill-web-asio`,项目内 `freekill-web-asio/`),`freekill-asio/` 作只读 diff 基线。小改集中在配置(`server.h`/`loadConf`)、auth(`auth.cpp:255` 单点)、room outdate(优先在 `_refreshMd5` 扫描处中和,而非散改 6 个 `isOutdated` 消费者)、manifest(`user_manager.cpp:218` 追加)。**房间过期 gating 触及房间线程生命周期,属中等复杂度,非小开关**——改动需谨慎并跑 gateway E2E。每次同步上游先比基线 diff。

**R-ASSET-MISMATCH · Web VM 与服务端包不一致 —— 中高**  
跳过 MD5 后由 manifest 管资源版本。**关键:manifest 的 `enabledPacks`/`assetVersion` 必须从 asio 实际加载包状态生成,且成为 Web 端包集合的单一真相源**(替换 `skin.ts`/`audio.ts`/`sync-fk-assets.mjs` 三处 ART_PACKS 硬编码,本就因不一致产生 P7-006/P7-032)。若 manifest 独立于 asio 真实加载状态手列,等于把不一致从 MD5 平移到 manifest。验收须三方一致:VM 加载集 == manifest == asio 加载集。

**R-AI-SCOPE · AI 提升范围膨胀 —— 中高(审计上调)**  
SmartAI 策略注册层被 stub 成 no-op,无 aiLevel、无 self-play harness——是未完成基础功能而非小改。必须先做 MVP 闭环(取消 stub + ~10 策略 + 最小评测脚本),严控扩面,否则吞噬产能。

**R-CRED · localStorage 明文凭据 —— 中高**  
生产化必须改 session token / httpOnly / 服务端会话。

**R-GPL/R-ASSET · 分发合规 —— 中高**  
浏览器分发 Lua 源码和素材,公网前确认 GPLv3 源码义务与素材授权。

**R-WORKSHOP-SANDBOX · 玩家包安全 —— 高**  
创意工坊公共服只跑审核包;未审核包必须隔离。

## 14. 验收标准

### Web-only 基础验收

- Web 能登录、进大厅、建房、进房、开始对局、完整跑一局。
- 断线重连/刷新/旁观可用。
- 启用 utility+standard_ex+sp 后主流流程不卡死。
- 不设置或错误设置 `FK_MD5` 不影响 Web-only 登录。
- 服务端 manifest 能声明包集合和 capabilities。

### 产品化验收

- 房间预设/禁将设置可保存和复用。
- AddRobot/ChangeRoom 等功能按服务端 capabilities 显隐。
- 扩展包未覆盖弹窗有兜底,不会计时器空转。
- 部署不再要求人工重算 MD5。

### 不再验收

- Qt 客户端直连。
- Qt↔Web 混连。
- Qt PackageDownload/UpdatePackage UI。

## 15. 历史参考

旧路线中已完成的 MD5 算法、Qt 协议握手、包 flist 复现、混连准备仍作为参考能力保留,但从主路线中降级为兼容/诊断资料。旧详细计划 `M3-M6_detailed_plan.md` 及 5 个已完成切片计划(`W0-2_plan`/`W1-1_plan`/`W1-RES_plan`/`PACE_plan`/`FEAT_IG_plan`)已删除(成果记于 `PROGRESS.md` 变更日志,GitHub 留存),当前近期路线以 `WEB_ONLY_ROADMAP.md` 为准。
