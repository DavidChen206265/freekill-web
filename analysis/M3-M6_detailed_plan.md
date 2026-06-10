# M5–M6 推进计划 · 扩展兼容 → 生产化(M3/M4 已完成,见文末历史)

> 2026-06-10 重写。**M2 核心 / M3 路由+重连+旁观 / M4 交互补全+视觉动画音频 均已完成**(详见 `analysis/PROGRESS.md` 变更日志;不再在此展开,避免与已完成历史重复)。本计划聚焦**当前重心 M5(扩展 UI 兼容 + i18n + 混连)与 M6(生产化)**。
>
> 依据:重新审计后的 `audit/phase*.md`(2026-06-10,逐条对当前源码+web 核实、主控复核纠错)+ 用户决策。配合 `freekill_web_implementation_plan.md` §9 里程碑、§11 风险。
> **历史里程碑的详规已按"完成即删"惯例删除**(M2_detailed_plan / M4-V_detailed_plan / AUDIT_M4_I / M5-a_detailed_plan / PWA_plan),其内容沉淀于 PROGRESS 变更日志。

## 工作纪律(全程必守,见 CLAUDE.md)

1. **先读后写**:动手前读透对应 QML/Lua 源码 + 本计划相关节;坐标/数据结构/动画语义照搬,不自创。
2. **VM 是真相源**:状态从 VM 镜像(`readPlayers` 等)读,notifyUI 增量只作触发器。**镜像架构下静态审计易高报**(memory `vm-mirror-vs-delta-audit`)——先 probe 真实 VM/CBOR 再下结论,别拿单测当真实验证。
3. **自验在前**:多客户端/路由类改动收尾前用脚本或双 WS 对真 asio 验证;别拿用户当 CI。
4. **修一项验一项、各独立提交**;每切片末 `pnpm -r build/test/typecheck` 全绿 + `/sync`。
5. 改 `packages/*` 共享包注意 node-only 依赖别进浏览器 bundle;改一个包要全仓 build/test/typecheck 绿。
6. **资源新增必更 `.dockerignore`**(教训:M4-V audio/anim 漏放行致服务器缺失;M5 扩展包同理)。

## 每切片执行工作流(标准环)

读状态(PROGRESS + 本计划 + memory)→ 规划(拆"修一项验一项",列源码文件:行 + web 文件 + 自验手段;不确定的用 EnterPlanMode)→ 源码查询(QML/JS + 客户端 Lua + asio C++ 实际实现,对照 audit 条目)→ 优化规划(源码核实暴露偏差先回改本计划)→ 实施(切片专属分支,逐行照搬注释 `file:line`)→ 源码对照/修 bug 内层循环(对真 VM/包/asio 验,直到与源码一致无简化)→ 完整性确认(全绿 + 双 WS/Node 喂包)→ git(具体文件,信息写清改了什么+为什么+对照源码+自验)→ /sync 更新进度。

## 本地联调环境 bring-up(自主执行,工作流 Step 0)

> AI 自己起,不依赖用户。详见 memory `asio-wsl-runtime`。asio 在 WSL Ubuntu 下已构建(`~/freekill-asio/build/freekill-asio` v0.1.14)。**M5-b 已把 utility/standard_ex/sp 装入 asio packages 并启用 sp**;改包集合后须重算 FK_MD5(`packages/assets/scripts/compute-md5.mjs`)。
>
> **扩展包源(2026-06-10 起)**:全部 27 个扩展包已镜像进 `freekill-web/packages-upstream/`(复刻 FreeKill `packages/` 结构,内容 gitignore、每包 `.gitkeep`+README 入库保留结构)。`sync-fk-assets.mjs` 优先从这里取包(缺失回退仓库外 `FreeKill-release/packages`,`FK_PACKAGES_DIR` 可覆盖)。**启用新包流程**(见 `packages-upstream/README.md`):① `sync-fk-assets.mjs` 的 `EXTENSION_PACKS` 加包名;② asio `packages.db` 启用同包 + 拷进 asio `packages/`;③ `compute-md5.mjs` 重算 FK_MD5 更新网关;④ `.dockerignore` 放行该包。

1. **取 WSL IP**:`wsl -d Ubuntu -- hostname -I`(每次重启可能变;跨 MSYS 调用前缀 `MSYS_NO_PATHCONV=1`,distro 必须 `-d Ubuntu`)。
2. **起 asio**(后台常驻 `run_in_background`,否则 WSL 会话结束即被杀):`bash /mnt/e/Games/freekill/freekill-web/scripts/wsl-run-asio.sh`;验证 `ss -tlnp | grep 9527`;日志 `/tmp/fk-asio.log`。
3. **起网关**:`cd apps/gateway && ASIO_HOST=<IP> FK_MD5=<当前包集合MD5> node dist/index.js`(端口 9528)。核心包 MD5 `e48d6db7…`;core+utility+standard_ex+sp = `8efa2cc…`(已对真 asio 实测字节一致)。
4. **自验脚本**(对真 asio,`apps/gateway/scripts/*.mjs`):start-game / observe-reconnect / late-joiner / reconnect-probe / refresh-test / timer-sync-test;handshake live 测试(`apps/gateway/test/handshake.test.ts`,需 `ASIO_HOST`)。
5. **坑**:CreateRoom settings 必带 `_game` 块;旁观只能对 running 房且 generalNum>0;asio 对中途退出运行局的 IP 临时封禁;真进程名 `./freekill-asio`,清状态须真杀重启。

---

## M5 · 扩展包 UI 兼容 + i18n 全量 + Qt↔Web 混连(当前重心,部分已完成)

> 状态(2026-06-10):**M5-a(单局完整度)/ M5-b(加载扩展包 + QmlMark 文本 + ChooseSkillBox)/ M5-c(MD5 算法+manifest)均已完成**。剩余:更多 utility 共享框、QmlMark 点击查看型、LimitSkillArea/banner、i18n 全量、混连验收。

### 已完成(沉淀于 PROGRESS,这里只留指针)

- **M5-a-1 MiscStatus**(回合/计时/牌堆数)✅ — audit P2D-023 / P5-030 现 successfully restored。
- **M5-a-2 标记区完整化**(`@!`图片 / `@@`隐值 / `@`文本 / `@[type]`QML 经 `__fkReadPlayers` 分类)✅ — P2D-021 / P5-013。
- **M5-c MD5 算法**(`computeFlistMd5` 字节级复现 asio,core `e48d6db7` / +三包 `8efa2cc` 双验证)✅ — P2A-009。
- **M5-b 加载扩展包**(utility+standard_ex+sp 入 asio + web sync EXTENSION_PACKS + mount.ts manifest.extra;握手 MD5 实测 asio 接受)✅ — P6-036~039。
- **M5-b 阶段A-1 QmlMark 文本型**(`__fkReadPlayers` 收 `@[type]` 调 GetQmlMark 取 how_to_show)✅。
- **M5-b 阶段A-2 ChooseSkillBox**(首个 utility 共享框,CustomDialog 按 qml_path 派发 → chooseSkill 弹窗)✅ — P2D-017 / P5-031。
- **PWA + /fk 资源 SW 缓存**(治偶发缺语音/动画;StaleWhileRevalidate 与 Caddy no-cache/ETag 自洽)✅ — P7-031。

### M5-b 剩余 · 扩展交互框(按需,详见下方"QmlMark/CustomDialog/MiniGame 分级"内联)

- **更多 utility 共享框**:`utility/qml/` 共 18 个 box / 2219 行(ChooseSkillBox✅ / CardNamesBox / ChooseCardsAndChoiceBox / PlayerBox / DetailBox / ViewPile / ViewGeneralPile…)。**多数扩展包复用这批**,做完即覆盖大多数"带 qml 的扩展技能"。沿用既有流程(读 QML→popupStore/interactionStore kind→React 组件→reply 格式核对→对真 VM 自验)。**优先级**:按导入的包实际用到的 qml_path 驱动——扫包的 `qml_path`/`addMiniGame`,共享框已覆盖则免做,缺的逐个补(当前 sp/standard_ex 仅用到 ChooseSkillBox,已做)。
- **QmlMark 点击查看型**:`@&`/`@$` → ViewPile/ViewGeneralPile(看牌堆/武将堆),带 qml 的点击信息框(PlayerBox/DescMarkBox 等只读框)React 复刻 — audit P5-013 仍标"点击开牌堆缺失"。
- **简单 MiniGame**:本质"多人选一/几个选项"的规整型,可做通用"多人选择 MiniGame"组件 + 消费 `UpdateMiniGame` 增量。
- **始终保留**:未移植的任意 qml_path/minigame 走 unsupported+跳过兜底(安全网,不卡死),随移植逐步缩小。**范围外**:包专属全新复杂 qml / 独立游戏模式(chess-games/poker-games 自带 RoomScene,属"另一个游戏")。

### M5-a 剩余(低优先,可能镜像免费)

- **M5-a-3 LimitSkillArea**(限定技冷却标记,`UpdateLimitSkill {pid,skill,time}`)— audit P2D-022 仍 KNOWN_DEFERRED。先核实 readPlayers 镜像是否已含限定技状态;若是则 notify 仅触发、近乎免费。限定技身份局少见。
- **M5-a-4 banner**(全局标记,`SetBanner`,Room.qml 顶部 MarkArea)— 身份局基本用不到,排最后或随扩展模式一起。

### M5 其余

- **i18n 全量**:接 VM `Fk:translate` 导出全量翻译替换硬编码 `zh.ts`(技能/牌名/提示/身份);缺词回退原 key。**保留 lobby 阶段静态 fallback**(VM 未 boot 时登录/大厅用),不能简单删词典。audit P1-023 simplified。
- **Qt↔Web 混连验收**:包集合一致(MD5 对齐,M5-c 已具备能力)后,Qt 客户端与 Web 客户端混入同房对局。**扩展包逻辑随 Lua 免费兼容,本阶段只为新 UI 元素补渲染。**

**M5 验收**:主流扩展包能开局、响应技能、完成常见流程;Qt↔Web 混连进同房对局;扩展技能标记/弹窗可用(未覆盖的安全兜底不卡死)。

---

## M6 · 生产化

HTTPS/WSS、反向代理(Caddy,见实现计划 §8——已有 `/ws` 代理 + `/fk` no-cache/ETag + PWA SW 控制文件 no-cache)、日志监控、自动重启、数据库备份、网关限流(已有 IP 登录限频)、管理后台;Docker Compose 已拆 `asio`/`gateway`/`caddy`(`docker/`),完善持久化卷与健康检查。

**偿还技术债**:
- **R-CRED**:localStorage 明文凭据(M3 R2 取舍)→ 替换为短期 session token / 服务端会话 / httpOnly 凭据,不在公网长期沿用明文。
- **R-GPL**:WASM 路线把 freekill-core/扩展包 Lua 源码分发到浏览器,前端/网关须 GPLv3 开源 + 提供对应源码与构建说明;公网发布前法务过分发边界。
- **R-ASSET**:发布前核对各包许可证与素材来源。

**验收**:单机容器化部署,HTTPS/WSS 可用,数据卷持久化,基础容量压测有数。

---

## 里程碑依赖与排序

```
M2(✅) → M3(✅路由+重连+旁观) → M4(✅交互I + 视觉V) → M5(扩展UI+i18n+混连,进行中) → M6(生产化)
```

- **M5 当前重心**:M5-a/b/c 已完成;剩余 utility 共享框(按导入包驱动)+ QmlMark 点击型 + i18n + 混连。MD5(M5-c)已具备,混连无握手门槛阻塞。
- 每里程碑末 `/sync` + 全仓 build/test/typecheck 绿 + 关键路径对真 asio/双 WS 自验。

## 审计发现的真缺口清单(2026-06-10 重审,供 M5/M6 取用)

> 来自重新审计后的 `audit/phase*.md`。已实现的不再列;以下是确认仍缺的(按价值排序):

**功能性(影响可玩性)**:
- DetailedChoice/DetailedCheckBox 富描述(P5-018)——技能依赖逐项说明时会丢上下文。
- 手牌禁用原因文字 prohibitReason(P5-003)——无法解释某张牌为何不可选。
- 标记点击查看牌堆 `@&`/`@$`/`@[...]`(P5-013)——many 自定义牌堆/标记的查看路径。
- quit 对局中二次确认分支(P4-013,restored incorrectly)——当前直退易误触。
- AddRobot 未读 serverFeatures/GetCompNum(P4-004)——可能显示服务器未开放的加 robot。

**真 bug(本次新发现,低危,待修)**:
- **P7-006 / P7-032 ART_PKGS 不一致**:`skin.ts:13` / `audio.ts:16` 硬编码 `[standard,standard_cards,maneuvering]`,与 `sync-fk-assets.mjs:32` 的 6 包 `ART_PACKS`(含 utility/standard_ex/sp)不一致。扩展包美术/标记图的候选回退扫描漏掉(直接路径仍可解析)。修法:抽共享常量,skin.ts/audio.ts 复用 sync 的 ART_PACKS。

**外围(延后/可选,见实现计划 §9 延后清单)**:
- HandcardViewer 他人可见手牌列表(P5-014);完整武将详情页(metadata/音频/统计/同名,P5-026/Phase9);武将/卡牌总览图鉴页(P5-027/Phase9 全片)。
- 技能 prelight/tooltip/locked-count、photo drank/rest/status/netstate 覆盖层(P5-006/009)。
- 回放/录像/战绩(Phase 8:saveRecord/saveGameData 空桩,无回放引擎/页/统计)。
- 大厅设置/建房丰富度/资料库(Phase 3 大半:服务器浏览器、过滤、MOTD、模式/包/Ban 设置、profile、设置页;Phase 9 图鉴)。

## 延后 / 可选范围(不阻塞核心收尾,记录在案)

- **回放 / 录像 / 战绩**(audit Phase 8、P2C-010/011)。
- **大厅设置 / 建房丰富度 / 资料库**(audit Phase 3 大半、Phase 9 全片)。
- **独立游戏模式**(chess-games/poker-games):自带 RoomScene,属"另立项目"。

---

## 历史里程碑(已完成,详见 PROGRESS 变更日志)

- **M3 · 路由修复 + 断线重连 / 旁观** ✅(2026-06-08,提交 79c515d/833715a/942c94e + 脚本验证)。R-ROUTE 头号真 bug 已消解:路由层对首个房间引导包(EnterRoom/Observe/Reconnect)即引导 VM;大厅应答 Heartbeat;带密旁观传真实密码;localStorage 无感重连(R-CRED 债)。
- **M4 · 交互补全(切片 I)+ 视觉动画音频(切片 V)** ✅(2026-06-08~09)。I:AskForPoxi 真实化、CardsAndChoice/MoveCardInBoard/动态 Interaction 补处理器与 UI、真拖拽框(arrangeDrop)、CustomDialog/MiniGame 兜底。V:Animate/LogEvent 总闸 + animationStore、Indicate 连线、Emotion 精灵、tremble/濒死/阵亡、技能发动框、音频(原生 Audio)、Toast、桌面牌注脚。多轮真机验收 + 验收期 bug 修复(五谷 AG 框遮无懈、StrictMode oncancel、部署 audio/anim 缺失等)。
