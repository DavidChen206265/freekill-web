# Phase 0 — 独立枚举 inventory + 架构契约

> 本阶段从源码树现读现枚举，不采信任何旧 csv/报告。产出 4 个 inventory + 本说明。

## 0.1 产出文件
- `00-inventory-qml.csv` — 151 个 QML 文件：path, lines, top_type。**计数校验 = 151（与 `find Fk -name '*.qml' | wc -l` 一致）。**
- `00-inventory-web.csv` — 97 个 web TS/TSX（apps/web/src + apps/gateway/src + packages）：path, lines, exports。
- `00-inventory-client-lua.csv` — 70 个 server→client `addCallback` 命令：command, direction, registered_at。
- `00-inventory-notifyui.csv` — 42 个 client→UI `notifyUI` 命令：command, emitted_by_lua, consumed_in_files（哪些 web 文件含该命令字面量）。

## 0.2 命令契约面（权威清单，源自逐行 grep）

### server → client（70 个，`addCallback` 注册于 clientbase.lua / lunarltk/client/client.lua / room.lua / roombase.lua）
AddBuddy, AddCardUseHistory, AddNpc, AddObserver, AddPlayer, AddSkill, AddSkillBranchUseHistory, AddSkillUseHistory, AddStatusSkill, AddTotalGameTime, AddVirtualEquip, ArrangeSeats, AskForCardChosen, AskForResponseCard, AskForSkillInvoke, AskForUseActiveSkill, AskForUseCard, ChangeCardArea, ChangeRoom, ChangeSelf, ChangeSkin, Chat, EnterLobby, EnterRoom, FilterCard, GameLog, GameOver, Heartbeat, LogEvent, LoseSkill, MoveCards, NetStateChanged, NetworkDelayTest, Observe, PlayCard, PrepareDrawPile, PrintCard, PropertyUpdate, ReadyChanged, Reconnect, RemoveObserver, RemovePlayer, RemoveVirtualEquip, RmBuddy, RoomOwner, SetBanner, SetCardFootnote, SetCardMark, SetCardUseHistory, SetCurrent, SetPlayerMark, SetPlayerPile, SetSkillBranchUseHistory, SetSkillUseHistory, Setup, ShowCard, ShowVirtualCard, ShuffleDrawPile, StartGame, SyncDrawPile, UpdateGameData, UpdateMarkArea, UpdateQuestSkillUI；小写动作 changeskin, leave, observe, prelight, reconnect, surrender, updatemini。

### client → UI（42 个 `notifyUI`，client.lua 发给渲染层 = 审计核心对照面）
AddNpc, AddPlayer, AddSkill, AddTotalGameTime, ArrangeSeats, AskForCardChosen, AskForResponseCard, AskForSkillInvoke, AskForUseActiveSkill, AskForUseCard, CancelRequest, ChangeSelf, ChangeSkin, Chat, EnterLobby, EnterRoom, GameLog, GameOver, LogEvent, LoseSkill, MaxCard, MoveCards, PlayCard, PropertyUpdate, RemovePlayer, ReplyToServer, ServerMessage, SetBanner, SetCardFootnote, SetPlayerMark, ShowToast, ShowVirtualCard, StartGame, UpdateCard, UpdateDrawPile, UpdateGameData, UpdateHandcard, UpdateLimitSkill, UpdateMarkArea, UpdateRequestUI, UpdateRoundNum, UpdateSkill。

> 注：UI 内部还有非顶层-notifyUI 的细分渲染指令（`Animate` 家族：Indicate/Emotion/InvokeSkill/InvokeUltSkill/Damage/Death/LoseHP/PlaySound 等，源自原版 RoomLogic.js/AnimationBank），由 server 经 `LogEvent`/`Animate` 通道下发，web 在 `vmStore.ts:135-218` 处理。这些在 Phase H 逐一核对。

## 0.3 架构事实（修正审计基准，详见 AUDIT_PLAN §3.3）
- 客户端逻辑 = 原版 `client.lua` 在 wasmoon 原样运行（`clientVm.ts`）；服务端 = asio fork。
- 被「重新实现」的是 QML→TS 的**渲染层**。审计对照面 = `notifyUI` 命令呈现。
- 命令消费有 **delta 渲染** 与 **快照渲染**（`fnReadPlayers`/`syncPlayers` 等）两种；18 个「web 无字面量」命令须逐一判定，不可凭 grep 判未还原。

## 0.4 候选重点核查项（供 Phase D–P，非结论）
`notifyUI` 命令在 web src 无字面量匹配的 18 个（须判定快照消费 vs 真缺失）：
AddNpc, AddPlayer, AddSkill, AddTotalGameTime, ArrangeSeats, ChangeSkin, LoseSkill, MaxCard, PropertyUpdate, RemovePlayer, ServerMessage, SetBanner, ShowVirtualCard, UpdateGameData, UpdateHandcard, UpdateLimitSkill, UpdateMarkArea, UpdateSkill。
