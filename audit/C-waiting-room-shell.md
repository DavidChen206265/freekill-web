# Phase C — 等待房 + 房间外壳 还原审计

对照基线：原版 37f8c12 / v0.5.20。web 客户端逻辑 = client.lua 经 wasmoon 原样运行；本阶段审计 QML 视觉/交互 → TS/TSX 还原。

原版文件：
- `Fk/Pages/Common/WaitingRoom.qml`
- `Fk/Pages/Common/RoomPage.qml`
- `Fk/Pages/Common/RoomOverlay.qml`
- `Fk/Components/WaitingRoom/WaitingPhoto.qml`
- `lua/client/clientbase.lua`、`lua/client/client_util.lua`（快照/回调源，VM 内运行，非还原对象）

web 文件：
- `apps/web/src/table/WaitingRoom.tsx`、`LoadingRoom.tsx`、`RoomScene.tsx`、`Stage.tsx`
- `apps/web/src/table/waitingState.ts`、`stores/roomRouting.ts`、`stores/gameStore.ts`
- `apps/web/src/pages/LobbyPage.tsx`（房间外壳路由 + 顶栏）

---

## 一、等待房（WaitingRoom）

### C1 WaitingRoom::座位网格（seat grid）
- 状态: 简化还原
- 原版: WaitingRoom.qml:144-289 (GridLayout columns:5 + Repeater photos + WaitingPhoto)
- web : WaitingRoom.tsx:39-61 (flex wrap seats)
- 原版行为: 固定 10 个 photoModel 槽位（resetPhotos 总建 10 个，行 513），5 列网格，rowSpacing -60 / columnSpacing -20 重叠布局；超出 playerNum 的槽位 sealed → opacity 0 不可见。
- web 行为: 座位数 = max(capacity, playerNum)（行 32），非固定 10；flex 自动换行，无 5 列固定网格、无负间距重叠；空位渲染为虚线"空位"块（styles.empty），非 sealed 透明。
- 差异: 仅简化 — 座位呈现为通用卡片网格而非 WaitingPhoto 立绘布局；空位用可见虚线框代替原版透明 sealed。

### C2 WaitingRoom::WaitingPhoto 立绘/边框/准备标记
- 状态: 未还原
- 原版: WaitingPhoto.qml:6-77 (PhotoBase + owner/ready/notready 角标 Image + winRateRect)
- web : 无（WaitingRoom.tsx:45-53 用纯 div：头像方块 + 姓名 + 文字"已准备/未准备"）
- 原版行为: 基于 PhotoBase（武将立绘 photoMask）；右下角 owner/ready/notready 三态图片角标（SkinBank.photoDir，行 24-25）；准备音效。
- web 行为: 头像为 `p.general || p.avatar || P<id>` 文本方块（avatar style 行 92）；房主用金色"房主"文字标签，准备状态用绿/灰文字"已准备/未准备"；无立绘、无 photoMask、无三态角标图片。
- 差异: PhotoBase 立绘系统与三态角标图片完全缺失，文字替代。

### C3 WaitingPhoto::战绩面板（winRateRect 时长/胜率/逃率）
- 状态: 简化还原
- 原版: WaitingPhoto.qml:31-76 (winRateRect)；数据 GetPlayerGameData (client_util.lua:597)
- web : WaitingRoom.tsx WinRatePanel + gameStore GamePlayer.gameData + clientVm __fkReadPlayers gameData
- 原版行为: 每座位左下角面板显示：游戏时长（min/h）、胜率 Win%、逃率 Run%、总场次 Total；逃率>0.2 标红；新手显示"Newbie"；逃跑率高变红。数据来自 winGame/runGame/totalGame（model.win/run/total，WaitingRoom.qml:172-174）。
- web 行为: WinRatePanel 照搬 winRateRect 逻辑——时长(m<100→min 否则 h)、total===0→"新手"、否则 胜率/逃率/总场,逃率>0.2 标红。数据经 __fkReadPlayers 读 VM `getGameData()`(total/win/run)+`getTotalGameTime()` 进 gameStore.gameData 快照(与名册同步)。
- 差异: 仅简化——面板挂在 web 简化版文字座位卡上(非 WaitingPhoto 立绘卡,立绘 C2 仍未还原);字体非 libian、布局近似;数据/计算/标红规则 1:1。
- 修复: 已修复并验证 (clientVm `__fkReadPlayers` 加 gameData 闭包[guarded pcall,真 VM 探针验证非 QList 不抛错、totalTime 读取]、gameStore GamePlayer.gameData + syncPlayers 映射、WaitingRoom.tsx WinRatePanel 照搬 WaitingPhoto.qml:43-74;typecheck/build/151 测试全绿。立绘卡 C2 仍未还原故记简化,2026-06-12)

### C4 WaitingRoom::房间信息面板（roomSettings / roominfo.refresh）
- 状态: 未还原
- 原版: WaitingRoom.qml:61-130 (Rectangle roomSettings + Flickable + roominfo)；GetRoomConfig (client_util.lua:581)
- web : 无
- 原版行为: 左侧 280px snow 半透明面板，可滚动；roominfo.refresh() 显示：游戏模式（GameMode）、回应时限（ResponseTime=Config.roomTimeout）、各 boardgame/mode 设置项逐项（GetUIDataOfSettings 遍历 _children）、卡牌包列表（GetAllCardPack 减 disabledPack，特殊牌/衍生牌不加粗）。
- web 行为: 无房间信息面板；WaitingRoom.tsx 仅顶部 "等待房间 · N/capacity" 标题。模式、时限、设置项、卡包列表均不显示。
- 差异: 整个房间配置展示面板缺失。

### C5 WaitingRoom::准备按钮（Ready / Cancel Ready）
- 状态: 完全还原
- 原版: WaitingRoom.qml:333-341 (visible:!isOwner, enabled:!opTimer.running, notify "Ready")
- web : WaitingRoom.tsx:64-68 + waitingState.ts:44 (showReady:!isOwner)
- 原版行为: 非房主可见；文本 isReady?"取消准备":"准备"；点击发 Ready；opTimer 1s 防连点。
- web 行为: 非房主可见（showReady）；文本 isReady?"取消准备":"准备"；点击 client.notify('Ready','')。
- 差异: 仅缺 opTimer 1 秒防抖（无 enabled 节流）；按钮显隐/文本/命令一致。归为完全还原（防抖为微交互，单列于差异）。

### C6 WaitingRoom::加入机器人（Add Robot）
- 状态: 简化还原
- 原版: WaitingRoom.qml:343-350 (visible:isOwner&&!isFull, enabled:serverFeatures includes "AddRobot" && canAddRobot)
- web : WaitingRoom.tsx:69-71 + waitingState.ts:37,45 (showAddRobot:isOwner&&!isFull&&robotAllowed)
- 原版行为: 房主且未满可见；enabled 双条件：服务器特性含 AddRobot **且** canAddRobot（checkCanAddRobot：GetCompNum maxComp>curComp，机器人数未达上限，WaitingRoom.qml:395-400）。
- web 行为: 显隐含 robotAllowed（serverFeatures 含 AddRobot；undefined 时放行）；但**无 canAddRobot 上限检查**——不调用 GetCompNum，机器人达 maxComp 后按钮仍可点。
- 差异: 仅简化 — 缺机器人数量上限（curComp<maxComp）判定。

### C7 WaitingRoom::开始游戏（Start Game）
- 状态: 完全还原
- 原版: WaitingRoom.qml:352-359 (visible:isOwner&&isFull, enabled:isAllReady, notify "StartGame")
- web : WaitingRoom.tsx:72-78 + waitingState.ts:46-47 (showStart:isOwner&&isFull, startEnabled:isOwner&&isFull&&isAllReady)
- 原版行为: 房主且满员可见；全部非房主 ready 时 enabled；点击发 StartGame。
- web 行为: 同显隐与 enable 条件；disabled 灰显；点击 notify('StartGame')。
- 差异: 无。

### C8 WaitingRoom::isAllReady 计算 + 准备音效
- 状态: 简化还原
- 原版: WaitingRoom.qml:412-422 (checkAllReady) + 38-46 (onIsAllReadyChanged 播 ready 音效)
- web : waitingState.ts:36 (isAllReady = 非owner 全 ready)
- 原版行为: checkAllReady 遍历非房主全 ready → isAllReady；isAllReady 变 true 播 `./audio/system/ready` 音效并启 kickOwnerTimer，变 false 停。
- web 行为: deriveWaitingState 纯计算 isAllReady 正确；但**无 ready 音效**、无 kickOwnerTimer。
- 差异: 仅简化 — 全员就绪音效缺失（见 C13 kickOwner 计时器）。

### C9 WaitingRoom::addInitComputers（房主进房自动补机器人）
- 状态: 未还原
- 原版: WaitingRoom.qml:32-36 (onIsOwnerChanged) + 402-410 (addInitComputers)
- web : 无
- 原版行为: 成为房主且未满时，按 GetCompNum 的 (minComp - curComp) 差值次数循环发送 AddRobot，补足最少机器人数。
- web 行为: 无自动补机器人逻辑。
- 差异: 房主进房自动补足最小机器人逻辑缺失。

### C10 WaitingRoom::座位右键/点击 → 礼物+踢人菜单（photoMenu）
- 状态: 简化还原
- 原版: WaitingRoom.qml:176-286 (photoMenu：Give Flower/Egg/Wine/Shoe + Block Chatter + Kick From Room)
- web : RoomChatPanel.tsx:13-17,37-83（送礼集中在聊天面板 🎁 菜单，按对象列出 Flower/Egg/GiantEgg/Shoe/Wine）
- 原版行为: 点击座位弹 Menu：送花/砸蛋（3% 概率巨蛋）/酒（30% enabled）/鞋（30% enabled）→ givePresent 发 Chat "$@Type:pid"；屏蔽该玩家聊天（Block/Unblock Chatter，Config.blockedUsers）；踢人（Kick From Room，房主限定，机器人需 curComp>minComp，notify KickPlayer）。
- web 行为: 送礼经聊天面板礼物菜单实现（Flower/Egg/GiantEgg/Shoe/Wine，发 $@Type:pid，RoomChatPanel.tsx:37-40），但**无概率门槛**（酒/鞋 30%、巨蛋 3%）；**等待房座位本身无点击菜单**；**无屏蔽聊天（Block Chatter）**；**无踢人（Kick From Room）**。
- 差异: 仅简化送礼（无概率），但屏蔽聊天、踢人完全缺失，座位无右键菜单。

### C11 WaitingRoom::更改房间设置（Change Room Config）
- 状态: 未还原
- 原版: WaitingRoom.qml:296-307 (visible:isOwner&&canChangeRoom → CreateRoom.qml isChangeRoom) + changeRoomConfig (591-620)
- web : 无（serverManifestStore 仅识别 ChangeRoom 特性字符串，无 UI）
- 原版行为: 房主且服务器支持 ChangeRoom 时可见，打开 CreateRoom 抽屉改房；ChangeRoom 命令回来后 changeRoomConfig 更新 capacity/timeout/heg/headerName、重排座位 sealed、刷新 roominfo、提示 $RoomConfigChanged。
- web 行为: WaitingRoom 无"更改房间设置"按钮；无 ChangeRoom 命令 UI 处理。
- 差异: 整个改房入口与 changeRoomConfig 处理缺失。

### C12 WaitingRoom::聊天按钮（Chat）
- 状态: 简化还原
- 原版: WaitingRoom.qml:309-313 (notify Command.IWantToChat → 打开 roomDrawer 聊天页)
- web : RoomChatPanel.tsx（右下角常驻可折叠聊天面板）
- 原版行为: 底部 Chat 按钮触发 Mediator IWantToChat，打开房间抽屉（Log/Chat/PlayerList 三页）。
- web 行为: 聊天为右下角独立常驻面板，无三页抽屉；等待房无独立"聊天"按钮（面板始终可用）。
- 差异: 仅简化 — 入口形态不同（常驻面板 vs 抽屉），无 Log/PlayerList 同抽屉切换（见 C18）。

### C13 WaitingRoom::踢房主（Kick Owner）+ kickOwnerTimer
- 状态: 未还原
- 原版: WaitingRoom.qml:48-59,315-328 (kickOwnerTimer 15s + Kick Owner 按钮)
- web : 无
- 原版行为: 满员且全就绪 15 秒后（kickOwnerTimer），非房主玩家出现"踢房主"按钮（canKickOwner&&isFull&&!isOwner），点击对房主发 KickPlayer，防房主挂机。
- web 行为: 无 kickOwnerTimer、无踢房主按钮。
- 差异: 防房主挂机机制完全缺失。

---

## 二、房间外壳 / 路由（RoomPage / 加载页）

### C14 RoomShell::房间内页面路由（waiting/loading/started 切换）
- 状态: 简化还原
- 原版: RoomPage.qml:401-422 (gameLoader 默认 WaitingRoom，startGame 切 boardgame.page) + clientbase startGame
- web : LobbyPage.tsx:45-49 (started?RoomScene:loading?LoadingRoom:WaitingRoom)
- 原版行为: gameLoader 加载 WaitingRoom；StartGame 时按 boardgame/uiPackage 选择对应 page 组件（App.changeRoomPage，WaitingRoom.qml:575-589）切换到游戏桌。
- web 行为: 三态：started→RoomScene、!started&&(!booted||capacity==0)→LoadingRoom、否则 WaitingRoom（gameStore.started 由 StartGame 命令置位，gameStore.ts:154）。RoomScene 固定单一桌（无 boardgame/uiPackage 多 page 选择）。
- 差异: 仅简化 — 不支持按 boardgame/UI 包动态选择游戏页组件（只有一种桌）。

### C15 RoomShell::进房加载页（LoadingRoom）
- 状态: 完全还原（web 增补）
- 原版: 无（QML 直接进 WaitingRoom）
- web : LoadingRoom.tsx:1-23 + LobbyPage.tsx:46
- 原版行为: 无独立加载页。
- web 行为: VM 启动 + EnterRoom 处理前（capacity==0）显示转圈"正在进入房间…"，避免空"0/?"误认错误。属 web 针对 wasmoon 首次加载十几秒的合理增补，无原版对应。
- 差异: web 新增，非缺口。

### C16 RoomShell::固定舞台缩放（Stage）
- 状态: 简化还原
- 原版: RoomPage.qml + Config.winScale 体系（按窗口缩放，roomScene 充满）
- web : Stage.tsx:10-25 (scale=min(vw/1200,vh/540))
- 原版行为: QML 按 Config.winWidth/winHeight/winScale 缩放整个房间；背景 Config.roomBg（MediaArea，RoomPage.qml:417-421）+ lobbyBg 模糊背景层 + DropShadow 阴影。
- web 行为: 1200×540 逻辑画布等比缩放居中（letterbox）；背景固定 `/fk/image/gamebg.jpg` + 深绿回退。无模糊大厅背景层、无 shadowRect 阴影、无 roomBg 配置。
- 差异: 仅简化 — 背景为固定图非 Config.roomBg；缺模糊背景层与投影。

### C17 RoomShell::退出房间（tryQuitRoom）
- 状态: 简化还原
- 原版: RoomPage.qml:751-760 (tryQuitRoom) + quitDialog (296-312)
- web : LobbyPage.tsx:38-41 (tryQuitRoom) + roomRouting EnterLobby
- 原版行为: replaying→quitPage+shutdown；observing 或未开局→直接 notify QuitRoom；已开局→弹 quitDialog（Ok/Cancel）确认后 QuitRoom。
- web 行为: started 时 window.confirm 确认后 QuitRoom；未开局直接 QuitRoom。覆盖核心两分支；**无 replaying/observing 分支区分**（observing 退出也走 confirm-when-started 逻辑，实际 observing+started 会误弹确认）。
- 差异: 仅简化 — replaying（shutdown）与 observing 分支未单独处理；确认框用浏览器 confirm 代替 MessageDialog。

---

## 三、RoomOverlay（游戏内菜单/抽屉/弹幕/录像）

### C18 RoomOverlay::房间抽屉三页（Log / Chat / PlayerList）
- 状态: 简化还原
- 原版: RoomPage.qml:430-546 (roomDrawer：ViewSwitcher Log/Chat/PlayerList + SwipeView)
- web : GameLogPanel.tsx（Log，logStore）+ RoomChatPanel.tsx（Chat，roomChatStore）；PlayerList 无
- 原版行为: 单一抽屉三页切换：LogEdit（战斗日志）、AvatarChatBox（带头像聊天）、playerList（GetPlayersAndObservers：列玩家+旁观者，标注 *旁观*/*托管*/*逃跑*/*人机*/*离线*，旁观者点击可 changeSelf 切换视角，RoomPage.qml:483-518）。
- web 行为: Log 与 Chat 拆成两个独立常驻面板（GameLogPanel/RoomChatPanel），各自实现；**PlayerList 页完全缺失**（无旁观者列表、无 *托管*/*逃跑*/*人机*/*离线* 状态标注、无旁观者 changeSelf 切换视角）。
- 差异: 仅简化布局（拆面板），但 PlayerList 整页（旁观列表 + netState 标注 + 切换视角）缺失。

### C19 RoomOverlay::游戏内菜单按钮组（Menu 侧栏）
- 状态: 未还原
- 原版: RoomPage.qml:30-50 (menuButton + Escape) + RoomOverlay.qml:30-70 (open/closeOverlay 缩放) + RoomPage.qml:159-294 (Quit/Settings/Info/Surrender/Generals/Cards/Modes/Chat 按钮列)
- web : 无（LobbyPage.tsx:50-55 顶栏仅：背景音乐开关、VM 调试、离开）
- 原版行为: 右上 Menu 按钮（Esc 触发）打开 overlay，游戏内容缩放 0.8 并右移，露出右侧按钮列：退出、设置（音频/操作）、信息(GeneralPool)、投降、武将一览、卡牌一览、模式一览、聊天。
- web 行为: 无 overlay 菜单、无游戏缩放、无 Esc 快捷键；顶栏仅 BGM 开关 + VM 调试 + 离开三项。
- 差异: 整个游戏内菜单 overlay 及其 6 个一览/设置/投降入口缺失。

### C20 RoomOverlay::投降（Surrender）
- 状态: 未还原
- 原版: RoomPage.qml:206-232,314-339 (surrenderButton + surrenderDialog + CheckSurrenderAvailable)
- web : 无
- 原版行为: 投降按钮（非旁观非录像 enabled）；校验 gameStarted、Self 未死、CheckSurrenderAvailable 各条件（✓/✗ 列表）；确认且全通过发 PushRequest "surrender,true"。
- web 行为: 无投降功能。
- 差异: 投降完全缺失。

### C21 RoomOverlay::设置面板（Audio/Control Settings）
- 状态: 未还原
- 原版: RoomPage.qml:364-399 (settingsDialog：AudioSetting/ControlSetting 双页)
- web : 无（仅顶栏 BGM 静音 toggle，audio.ts isBgmMuted/toggleBgmMuted）
- 原版行为: 游戏内打开设置弹窗，侧栏切换音频设置 / 操作设置两页（L.AudioSetting/L.ControlSetting）。
- web 行为: 仅一个 BGM 开关按钮；无音频细项、无操作设置页。
- 差异: 游戏内设置面板缺失（仅保留 BGM 静音）。

### C22 RoomOverlay::一览弹窗（Generals/Cards/Modes/GeneralPool Overview）
- 状态: 未还原
- 原版: RoomPage.qml:192-277,341-362 (overviewDialog/overviewLoader：GeneralPool/Generals/Cards/Modes)
- web : 无（GeneralDetailModal 为单武将详情，非总览）
- 原版行为: 信息(GeneralPool)、武将一览、卡牌一览、模式一览四类总览弹窗，动态加载对应 Overview 组件。
- web 行为: 仅有单武将点击详情弹窗（GeneralDetailModal），无四类总览。
- 差异: 四类 Overview 总览弹窗缺失。

### C23 RoomOverlay::弹幕（Danmu）
- 状态: 未还原
- 原版: RoomPage.qml:548-551 (Danmu) + addToChat/sendDanmu (683-720) 旁观者聊天走弹幕
- web : 无（roomChatStore handleChat 仅入聊天面板）
- 原版行为: 旁观者/无座位者聊天以弹幕飘过（danmu.sendLog）；sendDanmu 服务器消息也走弹幕。
- web 行为: 无弹幕层；聊天统一进聊天面板。
- 差异: 弹幕显示缺失。

### C24 RoomOverlay::录像控制条（Replay Controls）
- 状态: 未还原
- 原版: RoomPage.qml:77-157 (replayControls：进度时间/显示全手牌/匀速/减速/倍速/加速/暂停) + ReplayerDuration/Elapsed/Speed 回调 (789-797) + controlReplayer
- web : 无
- 原版行为: 录像模式底部控制条：已用/总时长、显示全部牌开关、匀速恢复、减速、当前倍速、加速、暂停/播放；Backend.controlReplayer(slowdown/speedup/toggle/uniform/shutdown)。
- web 行为: 无录像播放器与控制条。
- 差异: 录像回放整套缺失（含 C17 replaying 退出分支）。

### C25 RoomOverlay::聊天特效（送礼动画/语音/弹幕 specialChat）
- 状态: 简化还原
- 原版: RoomPage.qml:581-710 (specialChat + addToChat：蛋花飞行动画、技能/胜利/阵亡语音、emoji、photo.chat 气泡)
- web : RoomChatPanel 发送 $@Type:pid（送礼），roomChatStore.handleChat 入面板
- 原版行为: 解析 $ 前缀：@ 蛋花→ChatAnim 从发送者飞向目标座位动画（Config.hidePresents 可关）；!/~ →胜利/阵亡语音 + 文本；技能→技能语音(skill_general/skill)；{emojiN}→图片；座位气泡 photo.chat + 无座位走弹幕。
- web 行为: 可发送送礼消息（$@Type:pid），但**接收端无蛋花飞行动画、无胜利/阵亡/技能语音播放、无 emoji 图片替换、无座位气泡、无弹幕**（仅文本入聊天面板）。
- 差异: 仅简化 — 发送链路在，但全部接收端特效/语音/动画/气泡缺失。

---

## 四、状态/快照通道（VM 内运行，非 UI 还原对象，核验消费）

### C26 SnapshotChannel::玩家名册（AddPlayer/RemovePlayer/RoomOwner/ReadyChanged → syncPlayers）
- 状态: 完全还原
- 原版: clientbase.lua:314-348 (addPlayer/removePlayer)、295-308 (changeReady/changeRoomOwner)；WaitingRoom.qml addCallback (622-639)
- web : gameStore.ts:188-223 (syncPlayers 读 VM mirror) + waitingState.ts
- 原版行为: VM 维护 players（id/name/avatar/ready/owner/gameData/state），QML 经 addCallback 增量更新 photoModel。
- web 行为: VM 仍原样跑 clientbase（addPlayer/changeReady/changeRoomOwner 改 VM players），web 不监听这些增量命令字面量，而由 syncPlayers 在每包后读 VM 权威 mirror（含 ready/owner），WaitingRoom 经 deriveWaitingState 消费。名册/ready/owner 正确还原。
- 差异: 无（架构事实 3 的快照消费路径，正确）。

### C27 SnapshotChannel::房间容量（EnterRoom → capacity）
- 状态: 完全还原
- 原版: clientbase.lua:224 (self.capacity=_data[1])；WaitingRoom.qml:637 playerNum=Config.roomCapacity
- web : gameStore.ts:138-141 (EnterRoom→capacity) + LobbyPage.tsx:46 (capacity gate)
- 原版行为: EnterRoom 第一字段为容量，决定座位数/isFull。
- web 行为: apply('EnterRoom') 取 arr[0] 设 capacity；用于 LoadingRoom 门控与座位数。
- 差异: 无。

### C28 SnapshotChannel::房间引导命令路由（EnterRoom/Observe/Reconnect 启 VM）
- 状态: 完全还原
- 原版: clientbase.lua loadRoomSummary 重发 notifyUI("EnterRoom")
- web : roomRouting.ts:14-18 (ROOM_BOOTSTRAP_COMMANDS) + stores/index.ts 路由
- 原版行为: 进房/旁观/重连三类服务器包均引导房间。
- web 行为: ROOM_BOOTSTRAP_COMMANDS={EnterRoom,Observe,Reconnect} 触发 VM boot；注释说明 Observe/Reconnect 经 loadRoomSummary 再发 EnterRoom 不会双启。
- 差异: 无。

### C29 SnapshotChannel::UpdateGameData（战绩更新）
- 状态: 完全还原
- 原版: clientbase.lua:255-261 (updateGameData→setGameData)；WaitingRoom.qml:424-435,623 (updateGameData→photo.total/win/run)
- web : clientVm __fkReadPlayers gameData（读 VM setGameData 后的 total/win/run）→ gameStore → WaitingRoom WinRatePanel
- 原版行为: UpdateGameData 更新座位战绩面板（与 C3 联动）。
- web 行为: UpdateGameData 在 VM 内 setGameData(原样运行),web 经 __fkReadPlayers 快照读 getGameData() 进 gameStore.gameData,WinRatePanel 渲染——数据通道已接 UI(与 C3 一并还原)。
- 差异: （已消除）
- 修复: 已修复并验证 (随 C3 战绩面板一并接通:UpdateGameData→VM setGameData→快照 readPlayers gameData→WinRatePanel;真 VM 探针验证 gameData 闭包健壮;typecheck/build/151 测试全绿,2026-06-12)

### C30 SnapshotChannel::BackToRoom / RestartGame / ContinueGame（再战/回房）
- 状态: 简化还原
- 原版: RoomPage.qml:735-749 (resetRoomPage/continueGame) + WaitingRoom.qml:570-573 (restartGame) + clientbase
- web : gameStore.ts:180-186 (backToRoom)
- 原版行为: 局后 ResetClientLua 重置，回 WaitingRoom，清 log/chat；RestartGame 再发 StartGame；ContinueGame 重开。
- web 行为: backToRoom(capacity) 保留名册身份(id/name/avatar/seat/owner/ready)、清游戏态、started=false 回等待房。覆盖回房；但 RestartGame 自动再发 StartGame、ContinueGame、log/chat 清理由各 store 各自处理，未见统一 resetRoomPage 等价编排。
- 差异: 仅简化 — 回房基本可用，再战自动开局编排未集中还原（依赖各 store）。

---

## 状态计数

| 状态 | 数量 | 序号 |
|------|------|------|
| 完全还原 | 7 | C5, C7, C15, C26, C27, C28, C29 |
| 简化还原 | 12 | C1, C3, C6, C8, C10, C12, C14, C16, C17, C18, C25, C30 |
| 还原错误 | 0 | （C29 已修复并验证 2026-06-12，升级为完全还原） |
| 未还原 | 11 | C2, C4, C9, C11, C13, C19, C20, C21, C22, C23, C24 |

合计 30 项。（2026-06-12：C3 战绩面板由未还原→简化还原，C29 战绩通道由还原错误→完全还原。）

## 未还原 / 还原错误 索引
- 未还原(11): C2 WaitingPhoto立绘角标、C4 房间信息面板、C9 房主自动补机器人、C11 更改房间设置、C13 踢房主+计时器、C19 游戏内菜单overlay、C20 投降、C21 设置面板、C22 四类一览总览、C23 弹幕、C24 录像控制条。
- 还原错误(0): （C29 已修复并验证，升级为完全还原）
