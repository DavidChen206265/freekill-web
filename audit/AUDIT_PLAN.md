# FreeKill-Web 完整还原审计 · 规划

> 本文件是审计的执行规划，不是审计结论。执行阶段产出的报告会**整体替换** `audit/` 目录下的全部现有内容（见 §8 执行流程）。

## 1. 目标

逐行阅读原版 FreeKill 源码（`~/freekill/freekill-vps-deploy/FreeKill-sourcecode/`，git `37f8c12` / v0.5.20），对其中**每一个 UI 元素与系统设计**，在本 `freekill-web` 项目内定位能够**完全还原**它的对应实现。逐条记录所有：

- **未还原**：原版有、web 端完全没有对应实现。
- **简化还原**：web 端有对应，但行为/视觉/交互被裁剪、合并或降级。
- **还原错误**：web 端有对应，但行为与原版不一致（逻辑/数值/时序/视觉错误）。

每条记录必须标注**原版源码中的精确对应位置**（文件 + 行号范围 + 符号名）与 **web 端对应位置**（文件 + 行号，或显式写「无」）。

## 2. 硬性规则

1. **禁止模糊描述**：不得使用「等等」「之类」「类似的」「以及其他」「部分」（除非给出确切的「部分=哪些」枚举）等收口词。每条目必须把涉及的元素**逐一列名**。若某区域元素过多，拆成多条，不得用省略号合并。
2. **不采信现有内容**：完全忽略 `audit/` 与 `analysis/` 目录下所有既有文件（包括所有 `phase*-audit.md`、`*-inventory.csv`、`PROGRESS.md` 等）。所有清单（inventory）从源码树**重新独立枚举**，不读旧 csv。
3. **逐行**：QML / Lua / TS 对照必须基于实际打开文件逐行读，不得凭文件名或记忆推断。每条结论引用的行号必须是审计当时实际 `Read` 到的行。
4. **范围**：仅审**客户端还原面 + 协议契约面**。原版服务端游戏逻辑（`lua/lunarltk/server/`、`lua/server/`）与 C++ 引擎（`src/`）由 `freekill-web-asio` fork 复用，**不作为「freekill-web 应还原」的对象**——但它们**作为协议契约的权威来源**被引用（见 Phase P）。
5. **状态四态**：每条记录的状态取值唯一，限 `未还原` / `简化还原` / `还原错误` / `完全还原`。「完全还原」只在确实逐行核对一致时给出。

## 3. 范围边界

### 3.1 纳入审计（原版「应还原」面）
- QML UI 全部 151 文件（`Fk/`）：Base 13、Widgets 17、Components 66、Pages 50、根 1。
- 客户端 Lua：`lua/lunarltk/client/`（`client.lua` 991 行、`clientplayer.lua` 92 行）、`lua/client/`（`client.lua`、`client_util.lua`、`clientbase.lua`、`clientplayer_base.lua`）。
- 交互/请求**客户端表现**：`lua/lunarltk/core/request_type/`（5 文件）、`lua/lunarltk/core/skill_type/` 中影响客户端 UI 呈现的部分（`active.lua`、`view_as.lua`、`visibility.lua` 等，逐文件判定）。
- 游戏内容包的**客户端表现数据**：`packages/standard`、`packages/standard_cards`、`packages/maneuvering` 中的武将/卡牌/技能的**显示用资源与文本触发**（立绘、配音、动画、mark、技能按钮文本），不审其服务端效果逻辑。
- 资源/音频/动画管线：`image/`、`audio/`、`fonts/`、`lang/` 的路径与加载语义。
- 协议契约：`client.lua` 消费/发出的 `notifyUI` 命令集 + request 协议 ↔ `apps/gateway` ↔ `freekill-web-asio` 三方包语义一致性。

### 3.2 排除（仅作契约参考，不作还原对象）
- `lua/lunarltk/server/`、`lua/server/`、`lua/lunarltk/server/ai/`（AI 策略）。
- `src/`（C++ 引擎）。
- `android/`、`distro/`、`docker/`（原版打包）、`test/`（原版自带测试）。

## 3.3 关键架构事实（Phase 0 逐行确认，修正审计基准）

经逐行核对 `apps/web/src/vm/clientVm.ts`、`stores/vmStore.ts`、`stores/gameStore.ts`，freekill-web 的真实架构如下，**直接决定每条审计的对照对象**：

1. **客户端游戏逻辑 = 原版 `client.lua` 原样运行**，不是 TS 重写。`clientVm.ts:9` 用 `wasmoon`（WASM Lua）挂载 `freekill-core` 资源树并 `bootClient`（prelude → freekill.lua → client.lua → CreateLuaClient）。服务端逻辑跑在 `freekill-web-asio` fork。**因此「客户端逻辑层」不存在「简化/重写」——它要么跑通要么抛错；审计该层 = 核对 boot 序列与桥接是否让原版 lua 完整运行。**
2. **真正被「重新实现」的是 QML UI 渲染层（151 文件）→ TS/TSX（table/stores）。** `client.lua` 通过 `notifyUI(command, data)`（42 个命令）驱动 UI；原版由 QML 消费渲染，web 由 `vmStore` 的命令分派（→ `gameStore`/`popupStore`/`cardStore`/各 table store）消费渲染。**审计的核心对照面 = 每个 `notifyUI` 命令在 QML 中的视觉/交互呈现 vs web TS 的还原。**
3. **两种消费模式必须区分**（否则误判）：
   - **delta 渲染**：web `vmStore` switch 直接处理命令数据（如 `MoveCards`、`GameLog`、`Animate`/`Emotion`/`Damage`）。
   - **快照渲染**：命令先由 wasmoon 内 client.lua 消费改状态，web 再经 `fnReadPlayers`/`fnReadCards`/`fnReadSkills` 等桥接**读完整快照**渲染（`gameStore.syncPlayers` 读 roster/seat/general/hp/marks；`gameStore.ts:107` 直引原版 `RoomLogic.js arrangeSeats:733-750`）。`AddPlayer`/`PropertyUpdate`/`ArrangeSeats`/`AddSkill`/`LoseSkill`/`UpdateGameData`/`UpdateHandcard`/`SetBanner` 等 18 个「web src 无命令字面量」者，多数属此类——**Phase 必须逐一判定是「快照已还原」还是「真未渲染」，不得仅凭 grep 无匹配判为未还原。**

## 4. 还原对照基准（原版 → web 顶层映射）

| 原版子系统 | 原版位置 | web 端对应位置 |
|---|---|---|
| 启动/全局 shell | `Fk/Pages/Common/Init.qml`、`Fk/main.qml` | `apps/web/src/App.tsx`、`main.tsx` |
| 登录/连服 | `Fk/Pages/Common/JoinServer.qml`、`lua/client/clientbase.lua` | `apps/web/src/pages/LoginPage.tsx`、`net/gatewayClient.ts` |
| 大厅 | `Fk/Pages/Lobby/Lobby.qml` + 同目录 13 文件 | `apps/web/src/pages/LobbyPage.tsx`、`components/RoomList.tsx`、`CreateRoomDialog.tsx` |
| 房间设置/筛选/资料 | `Fk/Pages/Lobby/{CreateRoom,FilterRoom,EditProfile,UserInfo,...}.qml` | `apps/web/src/components/CreateRoomDialog.tsx`、`stores/index.ts` |
| 等待房 | `Fk/Pages/Common/WaitingRoom.qml`、`Fk/Components/WaitingRoom/WaitingPhoto.qml` | `apps/web/src/table/WaitingRoom.tsx`、`waitingState.ts` |
| 对局主桌 | `Fk/Pages/LunarLTK/Room.qml` | `apps/web/src/table/RoomScene.tsx`、`Stage.tsx` |
| 玩家位/Photo | `Fk/Components/LunarLTK/Photo.qml` + `Photo/`（14 文件） | `apps/web/src/table/Photo.tsx`、`PhotoEffects.tsx`、`HpBar.tsx`、`EquipArea.tsx`、`JudgeArea.tsx`、`MiscStatus.tsx` |
| 手牌/卡牌区 | `Fk/Components/LunarLTK/{Dashboard,HandcardArea,CardArea,CardItem,TablePile}.qml` | `apps/web/src/table/Dashboard.tsx`、`CardLayer.tsx`、`CardFaceView.tsx`、`areas.ts` |
| 技能区/按钮 | `Fk/Components/LunarLTK/{SkillArea,SkillButton}.qml`、`SkillInteraction/`（4 文件） | `apps/web/src/table/Dashboard.tsx`、`stores/interactionStore.ts` |
| 请求弹窗（各 Box） | `Fk/Pages/LunarLTK/*Box.qml`（含 GuanxingBox/PoxiBox/ChooseGeneralBox 等 21 文件） | `apps/web/src/table/RequestPopup.tsx`、`stores/popupStore.ts` |
| 动画系统 | `Fk/Components/LunarLTK/{PixmapAnimation,SkillInvokeAnimation,UltSkillAnimation}.qml`、`ChatAnim/`（5 文件） | `apps/web/src/table/AnimationLayer.tsx`、`stores/animationStore.ts` |
| 客户端状态机 | `lua/lunarltk/client/client.lua` | `apps/web/src/vm/clientVm.ts`、`stores/vmStore.ts` |
| 聊天/弹幕/日志 | `Fk/Components/Common/{ChatBox,Danmu,LogEdit}.qml`、`Fk/Components/GameCommon/ChatBubble.qml` | `apps/web/src/components/ChatBox.tsx`、`table/RoomChatPanel.tsx`、`GameLogPanel.tsx` |
| 总览页 | `Fk/Pages/LunarLTK/{GeneralsOverview,CardsOverview,GeneralDetailPage}.qml` | `apps/web/src/table/GeneralDetailModal.tsx`、`GeneralCard.tsx` |
| 回放 | `Fk/Pages/Replay/`（4 文件） | （待 Phase R 判定，疑似未还原） |
| 资源/皮肤/音频 | `lua/client/client_util.lua`、`image/`、`audio/` | `apps/web/src/table/{skin,audio}.ts`、`packages/assets/` |
| 基础控件 | `Fk/Widgets/`（17 文件）、`Fk/Base/`（13 文件） | 散落于 `apps/web/src/components`、`table`，无统一控件层 |

> 注：上表为**起点映射**，非结论。Phase 执行中以逐行核对修正/细化，并对每个映射缺口（web 端「无」）单独记一条「未还原」。

## 5. 审计阶段切分（Phase）

每个 Phase 是一个独立可执行单元，产出一份 `audit/<phase-id>.md`。Phase 之间无强依赖，但 Phase 0 必须先完成（它产出所有后续 Phase 共用的 inventory）。每个 Phase 标注「源码逐行阅读范围」与「web 端对照范围」。

### Phase 0 — 重新独立枚举（inventory，替换所有旧 csv）
- 产出 `audit/00-inventory-qml.csv`（151 QML：路径、行数、顶层 type、被谁引用）、`audit/00-inventory-client-lua.csv`（客户端 lua：每个文件的 export 函数 + `notifyUI`/`fk.client_callback` 命令名清单）、`audit/00-inventory-web.csv`（69 TS/TSX：路径、行数、导出组件/store、消费的 vm 命令）、`audit/00-inventory-assets.csv`（image/audio/fonts/lang 路径前缀枚举）。
- 全部从源码树现读现枚举，**不引用旧 inventory**。

### Phase A — 启动 / 全局 shell / 登录连服
- 源码：`Fk/main.qml`、`Fk/Pages/Common/{Init,JoinServer,About,Tutorial,ModesOverview}.qml`、`lua/client/{clientbase,clientplayer_base}.lua`、`lua/client/client_util.lua`（全局工具）。
- web：`App.tsx`、`main.tsx`、`pages/LoginPage.tsx`、`net/gatewayClient.ts`、`pwa/PwaUpdater.tsx`、`i18n/`。

### Phase B — 大厅 + 房间创建/筛选/个人设置
- 源码：`Fk/Pages/Lobby/`（全 14 文件，逐一）、`Fk/Components/Lobby/{RoomDelegate,PersonalSettings}.qml`、`Fk/Pages/Common/{PackageManage,ResourcePackManage,PackageDownload}.qml`。
- web：`pages/LobbyPage.tsx`、`components/{RoomList,CreateRoomDialog}.tsx`、`stores/index.ts`、`serverManifestStore.ts`。

### Phase C — 等待房 + 房间外壳
- 源码：`Fk/Pages/Common/{WaitingRoom,RoomPage,RoomOverlay}.qml`、`Fk/Components/WaitingRoom/WaitingPhoto.qml`、`lua/lunarltk/client/client.lua` 中等待房状态段。
- web：`table/{WaitingRoom,LoadingRoom,RoomScene,Stage}.tsx`、`waitingState.ts`、`stores/roomRouting.ts`。

### Phase D — 玩家位 Photo 全栈
- 源码：`Fk/Components/LunarLTK/Photo.qml` + `Photo/`（14 文件，逐一：DelayedTrickArea、EquipArea、EquipItem、HandcardViewer、HpBar、LimitSkillArea、LimitSkillItem、Magatama、MarkArea、PicMarkArea、RoleComboBox、Shield、SkinArea、SpecialMarkArea）、`PhotoBase.qml`、`MiscStatus.qml`。
- web：`table/{Photo,PhotoEffects,PhotoFocusBar,HpBar,EquipArea,JudgeArea,MiscStatus}.tsx`、`seatLayout.ts`。

### Phase E — 手牌 / 卡牌 / 牌桌牌堆
- 源码：`Fk/Components/LunarLTK/{Dashboard,HandcardArea,CardArea,CardItem,InvisibleCardArea,TablePile,GeneralCardItem,IndicatorLine}.qml`、`Fk/Components/GameCommon/{BasicCard,PokerCard,BasicItem,ItemArea,InvisibleItemArea,MediaArea}.qml`。
- web：`table/{Dashboard,CardLayer,CardFaceView}.tsx`、`areas.ts`、`arrangeDrop.ts`、`stores/{cardStore,cardFaceStore,cardNoteStore}.ts`。

### Phase F — 技能区 + 技能交互控件
- 源码：`Fk/Components/LunarLTK/{SkillArea,SkillButton}.qml`、`SkillInteraction/`（4 文件：SkillCardName、SkillCheckBox、SkillCombo、SkillSpin）、`Fk/Components/LunarLTK/{LimitSkillArea,LimitSkillItem}.qml`、`lua/lunarltk/core/skill_type/{active,view_as,visibility}.lua`（客户端呈现部分）。
- web：`table/Dashboard.tsx`（技能区段）、`stores/interactionStore.ts`、`table/RequestPopup.tsx`（技能交互段）。

### Phase G — 请求弹窗（所有 Box）
- 源码：`Fk/Pages/LunarLTK/` 全 21 文件逐一（AG、ArrangeCardsBox、CardNamesBox、CardsOverview、CheckBox、ChoiceBox、ChooseCardsAndChoiceBox、ChooseGeneralBox、DetailedCheckBox、DetailedChoiceBox、GameOverBox、GeneralDetailPage、GeneralFilter、GeneralPoolOverview、GeneralsOverview、GraphicsBox、GuanxingBox、MoveCardInBoardBox、PlayerCardBox、PoxiBox、Room.qml 的弹窗调度段）、`lua/lunarltk/core/request_type/`（5 文件）。
- web：`table/{RequestPopup,GameOverModal,GeneralDetailModal}.tsx`、`stores/popupStore.ts`、`processPrompt.ts`。

### Phase H — 动画 / 特效 / 聊天动画
- 源码：`Fk/Components/LunarLTK/{PixmapAnimation,SkillInvokeAnimation,UltSkillAnimation,SkinItem,PhotoBase}.qml`、`ChatAnim/`（5 文件：Egg、Flower、GiantEgg、Shoe、Wine）、`Fk/Components/Common/{GlowText,BigGlowText}.qml`、`Fk/Components/LunarLTK/BigGlowText.qml`。
- web：`table/{AnimationLayer,PhotoEffects}.tsx`、`stores/animationStore.ts`、`packages/assets/`（anim 枚举）。

### Phase I — 聊天 / 弹幕 / 日志 / 倒计时
- 源码：`Fk/Components/Common/{ChatBox,AvatarChatBox,Danmu,LogEdit,Avatar}.qml`、`Fk/Components/GameCommon/ChatBubble.qml`、`Fk/Pages/LunarLTK/Room.qml` 倒计时/log 段。
- web：`components/ChatBox.tsx`、`table/{RoomChatPanel,GameLogPanel,CountdownBar,PromptText,Toast}.tsx`、`stores/{roomChatStore,logStore,timerStore}.ts`。

### Phase J — 总览/详情/筛选页
- 源码：`Fk/Pages/LunarLTK/{GeneralsOverview,CardsOverview,GeneralDetailPage,GeneralFilter,GeneralPoolOverview}.qml`、`Fk/Pages/Replay/{GameDataOverview,StatisticsOverview}.qml`。
- web：`table/{GeneralDetailModal,GeneralCard}.tsx`、`stores/detailStore.ts`。

### Phase K — 基础控件层（Widgets + Base）
- 源码：`Fk/Widgets/`（17 文件，逐一）、`Fk/Base/`（13 文件，逐一）、`Fk/Components/Common/{MetroButton,MetroToggleButton,TileButton}.qml`。
- web：散落对照——逐个 widget 找 web 端是否有等价物，无则记「未还原」。

### Phase L — 作弊/调试面板（Cheat）
- 源码：`Fk/Components/LunarLTK/Cheat/`（9 文件：CardDetail、ChooseHandcard、FreeAssign、GeneralDetail、PlayerDetail、SameConvert、SkinsDetail、ViewGeneralPile、ViewPile）。
- web：`components/VmDebugPanel.tsx`、`diag/`。

### Phase M — 角色推测 / mark / 标记系统
- 源码：`Fk/Components/LunarLTK/Photo/{RoleComboBox,MarkArea,PicMarkArea,SpecialMarkArea}.qml`、`lua/lunarltk/client/client.lua` mark 段。
- web：`stores/{roleGuessStore,miscStore}.ts`、`table/MiscStatus.tsx`。

### Phase N — 资源 / 皮肤 / 音频 / 字体 / i18n 管线
- 源码：`lua/client/client_util.lua`、`image/` 树、`audio/` 树、`fonts/`、`lang/`、`packages/*/` 的 image+audio 布局。
- web：`table/{skin,audio}.ts`、`packages/assets/`、`apps/web/scripts/sync-fk-assets.mjs`、`i18n/`。

### Phase O — 游戏内容包客户端呈现（standard/standard_cards/maneuvering）
- 源码：`packages/standard`、`packages/standard_cards`、`packages/maneuvering` 中每个武将的技能**客户端文本/动画/配音触发**、卡牌显示属性。逐武将、逐卡牌枚举其客户端可见呈现，对照 web 是否能正确显示。
- web：`stores/vmStore.ts`、`table/skin.ts`、`audio.ts`、技能 mark 显示。

### Phase P — 协议契约一致性（client.lua ↔ gateway ↔ asio）
- 源码：`lua/lunarltk/client/client.lua` 发出/消费的全部命令、`lua/client/clientbase.lua` 的 request/reply 协议。
- web：`apps/gateway/src/`（全 6 文件）、`packages/protocol/`、`apps/web/src/vm/clientVm.ts` 命令分派表。
- 核对：原版每个 `notifyUI(command, ...)` 与 request 类型，在 web vm 中是否有对应 handler；gateway 是否透传/改写/丢弃了语义。

## 6. 单条记录格式（所有 Phase 报告统一）

每条目用如下表格行或结构块，字段不得省略：

```
### <序号> <子系统>::<元素名>
- 状态: 未还原 | 简化还原 | 还原错误 | 完全还原
- 原版: <文件>:<起始行>-<结束行> (<符号/type 名>)
- web : <文件>:<行> | 无
- 原版行为: <逐项列名描述，禁止省略词>
- web 行为: <逐项列名描述；若状态非完全还原，逐项指出差异点>
- 差异: <仅在 简化/错误 时填；指出缺失项/错误项的精确清单>
- 修复: <仅在已对该项做修复/决策后追加；取值见下>
```

`修复:` 字段（缺口被处理后回写，构成审计闭环——见 CLAUDE.md「审计闭环」节）取值唯一：
- `已修复并验证 (<commit SHA> / <验证方式> / <日期>)` —— 改完且自验通过；同时把上面 `- 状态:` 改为 `完全还原`（或简化项升级后的实际态）。
- `已修复未验证 (<commit SHA> / 缺何验证 / <日期>)` —— 代码改完但未真机/E2E 验证。
- `用户同意忽略 (<原因> / <日期>)` —— 经用户明确同意不做。
- `待修复` —— 已规划未动手（默认态，可不写）。

回写后须更新该 Phase 报告结尾的状态计数表；若涉及 `SUMMARY.md` §3（还原错误）/§4（高优先缺口）的条目，同步更新 SUMMARY 对应行与计数。

汇总：每个 Phase 报告结尾给一张状态计数表（未还原 / 简化 / 错误 / 完全 各几条），并列出该 Phase「未还原」与「还原错误」条目的序号索引。

## 7. 全局汇总产出
- `audit/SUMMARY.md`：跨 Phase 汇总，按状态分组的全量条目索引（每条带 Phase-序号），三个数字总计，以及「最高优先级缺口」清单（未还原 + 还原错误，按影响对局正确性排序）。
- `audit/README.md`：本审计的导航（Phase 列表 + 文件索引 + 阅读顺序）。

## 8. 执行流程
1. 备份现有 `audit/`（tar 到部署根，与现有 `_src-backup-*.tgz` 同级），然后**清空** `audit/` 全部内容。
2. 执行 Phase 0 产出 inventory。
3. 按 A→P 顺序逐 Phase 执行；每个 Phase 独立读源码、读 web、逐条记录，写出 `audit/<phase>.md`。可对独立 Phase 并行委派子代理（每个子代理只读、产出结构化条目），主上下文汇总落盘。
4. 全部 Phase 完成后写 `SUMMARY.md` + `README.md`。
5. 不改任何业务代码——纯审计，只在 `audit/` 内写文档。
6. 完成后按 [[git-push-freekill-ssh]] 经 SSH 推送（若用户要求同步到 git 仓库）；本次输出以部署树 `audit/` 为准。

## 9. 验证标准（审计自检）
- 每条「原版位置」行号必须是执行中实际 Read 命中的行（抽查复核）。
- 全文 `grep` 不得出现禁用模糊词（`等等`、`之类`、`以及其他`、`若干`、`部分功能`无枚举者）。
- Phase 0 的 QML 文件数必须 = 151，client-lua 命令清单必须覆盖 `client.lua` 中全部 `notifyUI`/callback 注册点（以 grep 计数交叉验证）。
- `SUMMARY.md` 条目总数 = 各 Phase 条目数之和（无遗漏/重复）。

