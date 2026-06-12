# Phase B 审计 — 大厅 + 房间创建/筛选/个人设置/包管理

对照基准：原版 FreeKill v0.5.20 (git 37f8c12) `Fk/Pages/Lobby/`、`Fk/Components/Lobby/`、`Fk/Pages/Common/` vs freekill-web `apps/web/src/`。

说明：web 是纯 Web 部署，房间列表/创建经 gateway↔asio；大厅本地客户端设置（音频/背景/控制/UI/资源包/包管理）在原版属本地配置，web 端多未实现。命令消费已确认（routeEnvelope switch + lobbyStore 快照）。

---

## 大厅主壳 Lobby.qml

### B1 Lobby::房间列表展示 (GridView/RoomDelegate)
- 状态: 简化还原
- 原版: Lobby.qml:104-116 (roomList GridView) + RoomDelegate.qml:1-115
- web : RoomList.tsx:27-53 (table)
- 原版行为: GridView 卡片式，每卡含模式名+`#roomId`（outdated 时删除线、灰底 #CCCCCC）、房名（删除线/单行省略）、锁图标(hasPassword)、`playerNum/capacity`（满员红字）、密码输入框（仅 hasPassword&&!outdated 显示）、Enter/Observe 按钮（满员显示 Observe，outdated 或 timer.running 时禁用）。
- web 行为: HTML 表格，列：#id、房名（🔒 前缀 + ⚠️ 后缀表 outdated）、模式 tr、`playerCount/capacity`、加入/旁观两按钮。密码经 window.prompt 弹出而非内联输入框。
- 差异: 卡片→表格视觉重构；outdated 仅加 ⚠️ 不禁用「加入」按钮（原版 outdated 时 enterButton.enabled=false）；满员不强制走 Observe（原版按钮文字随满员切换，web 两按钮恒显）；满员人数无红字；密码内联框→prompt 弹窗。

### B2 Lobby::刷新房间列表按钮 (Refresh)
- 状态: 简化还原
- 原版: Lobby.qml:64-84 (Refresh Button)
- web : LobbyPage.tsx:68 (刷新按钮) + index.ts:413-417 (UpdateRoomList)
- 原版行为: 按钮文字带房间计数 `Refresh Room List`.arg(count)；点击启动 opTimer(1000ms 防抖期间禁用)、置 filtering=autoFilterRoomCheck.checked、notifyServer("RefreshRoomList","")。
- web 行为: 「刷新」按钮 notify('RefreshRoomList','')；无计数显示、无防抖 timer、无 filtering 联动。

### B3 Lobby::自动筛选房间开关 (Automatically Filter Room List)
- 状态: 未还原
- 原版: Lobby.qml:57-62 (autoFilterRoomCheck CheckBox, 默认 checked)
- web : 无
- 原版行为: 刷新时若勾选，则按 Config.preferredFilter 在 updateRoomList 中过滤新列表 (Lobby.qml:440-451)。
- web 行为: 无该开关，无筛选联动；UpdateRoomList 全量展示。

### B4 Lobby::筛选按钮 + FilterRoom 抽屉 (Filter)
- 状态: 未还原
- 原版: Lobby.qml:85-91 (Filter Button) + FilterRoom.qml 全文
- web : 无
- 原版行为: 打开 FilterRoom 抽屉，按 roomName/roomId/gameMode 多选/满员状态/有无密码筛选当前 roomModel，并写回 Config.preferredFilter。
- web 行为: 无筛选 UI、无 preferredFilter 概念。

### B5 Lobby::创建房间按钮 (Create Room)
- 状态: 完全还原
- 原版: Lobby.qml:92-101 (Create Room Button → CreateRoom 抽屉, 置 observing/replaying=false)
- web : LobbyPage.tsx:69 (建房按钮) + CreateRoomDialog.tsx
- 原版行为: 打开 CreateRoom 抽屉；Config.observing=false、Config.replaying=false。
- web 行为: setShowCreate(true) 打开 CreateRoomDialog；observing/replaying 由 routeEnvelope 在 bootstrap 时处理。功能等价。

### B6 Lobby::服务器公告/Motd 区 (bulletin_info)
- 状态: 未还原
- 原版: Lobby.qml:119-150 (serverInfoLayout + bulletin_info)
- web : 无 (SetServerSettings data[0]=motd 在 index.ts:418-435 仅解析 manifest data[3]，未存 motd)
- 原版行为: 右侧栏 Markdown 渲染 `Config.serverMotd + "___" + tr('Bulletin Info')`，链接可外部打开。
- web 行为: 无公告展示；motd 未被读取存储。

### B7 Lobby::大厅聊天 (ChatBox isLobby)
- 状态: 简化还原
- 原版: Lobby.qml:161-170 (lobbyChat) + addToChat:420-428 / sendDanmu:430-433
- web : ChatBox.tsx 全文 + index.ts:436-440 (Chat case) + normalizeChat:462-471
- 原版行为: 发送 {type:1,msg}；接收 raw.type!==1 忽略；`{emojiN}` 替换为 emoji 图片；追加到 lobbyChat 并同步飘弹幕(danmu)。
- web 行为: 发送 {type:1,msg} 一致；接收不校验 type、不做 emoji 图片替换、无弹幕；who/text 尽力解析。

### B8 Lobby::聊天显隐切换按钮 (🗨️➕/➖)
- 状态: 未还原
- 原版: Lobby.qml:152-159 (MetroButton 切 chatShown)
- web : 无
- 原版行为: 切换聊天框 200ms 动画收起/展开，联动公告区高度。
- web 行为: 聊天框固定在右侧 aside，无收起。

### B9 Lobby::在线人数信息 ($OnlineInfo)
- 状态: 简化还原
- 原版: Lobby.qml:188-194 (Text $OnlineInfo + FkVersion)
- web : LobbyPage.tsx:66 (在线 online / 总 total) + index.ts:406-411 (UpdatePlayerNum)
- 原版行为: `$OnlineInfo`.arg(lobbyPlayerNum).arg(serverPlayerNum) + "Powered by FreeKill " + FkVersion。
- web 行为: 显示「在线 {online} / 总 {total}」；无 "Powered by FreeKill" 版本行。

### B10 Lobby::常用功能按钮行 (preferredButtonsModel)
- 状态: 未还原
- 原版: Lobby.qml:199-212 (Repeater preferredButtonsModel) + rearrangePreferred:505-521
- web : 无
- 原版行为: 底部展示用户收藏的功能按钮（来自 Config.preferredButtons），点击 handleClickButton 进页面/抽屉。
- web 行为: 无常用按钮行。

### B11 Lobby::更多页面抽屉 (morePagesDrawer)
- 状态: 未还原
- 原版: Lobby.qml:214-378 (morePagesDrawer + morePagesModel) + handleClickButton:485-503 + Component.onCompleted:529-603
- web : 无
- 原版行为: 右侧抽屉按包分组列出所有 customPages（默认含 Modes Overview/Replay/Settings/About），含「添加到下方」管理模式（收藏/取消，最多5个，金色高亮），点击进入对应页或弹窗。
- web 行为: 无更多页面入口；Modes Overview/Replay/Settings/About 均无入口。

### B12 Lobby::退出大厅按钮 (Exit Lobby)
- 状态: 简化还原
- 原版: Lobby.qml:380-392 (exitButton)
- web : LobbyPage.tsx:70 (退出按钮 → disconnect)
- 原版行为: showToast("Goodbye.")、quitPage、saveConf、Cpp.quitLobby()。
- web 行为: disconnect() 关闭连接清凭据；无 toast、无 saveConf、不发送 quitLobby 通知。

### B13 Lobby::弹幕 (Danmu)
- 状态: 未还原
- 原版: Lobby.qml:415-418 (Danmu) + sendDanmu/addToChat 调用
- web : 无
- 原版行为: 聊天消息同步为飘屏弹幕。
- web 行为: 无弹幕。

### B14 Lobby::进入房间逻辑 (enterRoom)
- 状态: 完全还原
- 原版: Lobby.qml:402-413 (enterRoom: playerNum<capacity→EnterRoom 否则 ObserveRoom)
- web : RoomList.tsx:16-21 (enter→EnterRoom / observe→ObserveRoom)
- 原版行为: 满员自动转 ObserveRoom，否则 EnterRoom，附带密码。
- web 行为: 提供独立「加入」(EnterRoom)/「旁观」(ObserveRoom) 两按钮，密码经 prompt；语义等价（旁观不强制满员）。

### B15 Lobby::EnterRoom 回调 (handleEnterRoom)
- 状态: 完全还原
- 原版: Lobby.qml:467-483 (设 roomCapacity/roomTimeout/heg/headerName, enterNewPage RoomPage)
- web : index.ts:336-349 (isRoomBootstrap → bootIfNeeded + feed) + LobbyPage.tsx:45-59
- 原版行为: 解析 capacity/timeout/roomSettings，进 RoomPage(WaitingRoom)。
- web 行为: bootstrap 包(EnterRoom/Observe/Reconnect)启动 VM，capacity 由 gameStore 设；进 LoadingRoom→WaitingRoom→RoomScene。功能等价（capacity/timeout 由 VM 内 client.lua 设置）。

### B16 Lobby::欢迎提示 + 模式设置初始化
- 状态: 未还原
- 原版: Lobby.qml:605-609 (Db.tryInitModeSettings + showToast $WelcomeToLobby)
- web : 无
- 原版行为: 初始化模式设置 DB、弹欢迎 toast。
- web 行为: 无 toast、无模式设置 DB 初始化。

---

## 房间筛选 FilterRoom.qml

### B17 FilterRoom::整体筛选页
- 状态: 未还原
- 原版: FilterRoom.qml:1-290 全文
- web : 无
- 原版行为: 房名/房号输入框、模式多选(父子 CheckBox 组)、满员状态(Full/Not Full)、有无密码(Has/No Password)、Clear/OK 按钮；OK 调 filterRoom() 在本地 roomModel 剔除不匹配项；Clear 重置 preferredFilter 并 RefreshRoomList。
- web 行为: 完全无筛选功能（房名/房号/模式/满员/密码 5 类筛选条件全部缺失）。

---

## 创建房间 CreateRoom.qml + 子页

### B18 CreateRoom::侧边栏分页 (SideBarSwitcher 6 页)
- 状态: 简化还原
- 原版: CreateRoom.qml:16-99 (6 页：General Settings/游戏模式选择/游戏设置/模式设置/Package Settings/Ban General Settings)
- web : CreateRoomDialog.tsx (单一表单)
- 原版行为: 左侧 6 个分页：基础设置、游戏模式单选、棋类设置(LuaSettingsPage boardgame)、模式设置(LuaSettingsPage mode)、卡牌包设置、禁将设置。
- web 行为: 单一对话框，仅含房名/人数/模式下拉/密码/思考时间/选将数/选将时间/手气卡/3 个开关；6 分页结构压缩为一屏，模式设置/卡包设置/禁将三页缺失。

### B19 CreateRoom::OK 提交 (CreateRoom/ChangeRoom)
- 状态: 简化还原
- 原版: CreateRoom.qml:115-172 (OK Button → notifyServer CreateRoom/ChangeRoom)
- web : CreateRoomDialog.tsx:30-45 (create → notify CreateRoom)
- 原版行为: 组装 disabledGenerals(由 banPkg/normalPkg 推导)、disabledPack(banCardPkg + serverHiddenPacks)、_game/_mode 配置(Db.getModeSettings)；按 isChangeRoom 发 CreateRoom 或 ChangeRoom；payload=[roomName,playerNum,timeout,{gameMode,roomName,password,_game,_mode,disabledPack,disabledGenerals}]。
- web 行为: 发 CreateRoom [name,capacity,timeoutSec,{gameMode,roomName,password,_game,_mode:{},disabledPack:[],disabledGenerals:[]}]；_game 为手填固定字段(generalNum/generalTimeout/luckTime/3开关)；disabledPack/disabledGenerals 恒空；无 ChangeRoom。
- 差异: 禁包/禁将恒空(无 BanGeneral 页)；_mode 恒空(无模式设置页)；_game 字段硬编码非来自 GetUIDataOfSettings 动态；无房内改设置(ChangeRoom)。

### B20 CreateRoom::Cancel 按钮
- 状态: 完全还原
- 原版: CreateRoom.qml:174-181 (Cancel → finish)
- web : CreateRoomDialog.tsx:77 (取消 → onClose)
- 原版行为: 关闭抽屉。
- web 行为: onClose 关闭对话框。等价。

### B21 CreateRoom::OK 启用条件 (game_modes 校验)
- 状态: 未还原
- 原版: CreateRoom.qml:119 (enabled: Fk.game_modes[preferedMode]!==nil)
- web : 无 (创建按钮恒可点)
- 原版行为: 仅当所选模式存在时启用 OK。
- web 行为: 「创建」按钮无校验恒可提交。

---

## 房间基础设置 RoomGeneralSettings.qml

### B22 RoomGeneralSettings::房名输入 (Room Name)
- 状态: 完全还原
- 原版: RoomGeneralSettings.qml:23-27 (EntryRow roomName, 默认 $RoomName.arg(screenName))
- web : CreateRoomDialog.tsx:52-54 (房名输入, 默认 'Web测试房')
- 原版行为: 默认房名为「{用户名}的房间」。
- web 行为: 房名输入框，默认值 'Web测试房' 而非用户名拼接；功能等价(默认值不同)。

### B23 RoomGeneralSettings::房间密码 (Room Password)
- 状态: 完全还原
- 原版: RoomGeneralSettings.qml:30-35 (EntryRow roomPassword)
- web : CreateRoomDialog.tsx:63-65 (密码输入)
- 原版行为: 可选密码输入。
- web 行为: 密码输入框。等价。

### B24 RoomGeneralSettings::玩家数 (Player num)
- 状态: 简化还原
- 原版: RoomGeneralSettings.qml:39-49 (SpinRow playerNum, from1 to10, 默认 preferedPlayerNum) + refreshGameMode:74-84 (按模式 min/maxPlayer 调 from/to)
- web : CreateRoomDialog.tsx:55-56 (人数 input min2 max8)
- 原版行为: 范围 1-10，随所选模式的 minPlayer/maxPlayer 动态调整，默认取 Config.preferedPlayerNum。
- web 行为: 固定 min2/max8，不随模式变化，默认 2；范围与原版(1-10)不一致且非动态。

### B25 RoomGeneralSettings::操作超时 (Operation timeout)
- 状态: 简化还原
- 原版: RoomGeneralSettings.qml:50-60 (SpinRow timeout, from10 to60, editable, 默认 preferredTimeout)
- web : CreateRoomDialog.tsx:67 (思考时间 SpinRow min10 max90, 默认30)
- 原版行为: 范围 10-60。
- web 行为: 范围 10-90(注释称放宽)，默认 30；上限与原版不同。

### B26 RoomGeneralSettings::禁包预应用 (Component.onCompleted)
- 状态: 未还原
- 原版: RoomGeneralSettings.qml:63-71 (对 banPkg/banCardPkg 调 UpdatePackageEnable false)
- web : 无
- 原版行为: 打开时把当前禁用方案应用到 Lua 包启用状态。
- web 行为: 无禁用方案概念，无预应用。

---

## 游戏模式选择 GameModeSelectPage.qml

### B27 GameModeSelectPage::模式单选列表
- 状态: 简化还原
- 原版: GameModeSelectPage.qml 全文 (按包分组的 RadioButton 列表, 来自 Fk.packages game_modes)
- web : CreateRoomDialog.tsx:58-62 (模式 select, 仅一项 aaa_role_mode)
- 原版行为: 列出所有含 game_modes 的包，分组单选；选中写 Config.preferedMode 并触发 gameModeChanged 重载设置 UI。
- web 行为: 下拉框仅硬编码「身份模式 aaa_role_mode」一项；不从 VM 动态枚举模式，无 gameModeChanged 联动。
- 差异: 模式来源硬编码而非 Lua 枚举(原版 Fk.packages 遍历)；只有身份一种模式可选。

---

## Lua 动态设置页 LuaSettingsPage.qml

### B28 LuaSettingsPage::动态设置 UI 构建
- 状态: 未还原
- 原版: LuaSettingsPage.qml 全文 (buildComponent/loadSettingsUI/updateSettingsUI, 由 GetUIDataOfSettings 动态生成 PreferenceGroup 子项, 绑 Db.saveModeSettings)
- web : 无 (CreateRoomDialog 用硬编码 _game 字段替代)
- 原版行为: 调 Lua GetUIDataOfSettings 拿设置描述，动态创建 SwitchRow/SpinRow/ComboRow 等控件，双向绑定 config，支持 needcopy 重算、保存到 ModeSettings DB。
- web 行为: 无动态设置系统；CreateRoomDialog 用 6 个固定字段(generalNum/generalTimeout/luckTime/enableDeputy/enableFreeAssign/enableObserverViewCard)模拟 lunarltk _game 子集；_mode 设置完全缺失。

---

## 卡包设置 RoomPackageSettings.qml

### B29 RoomPackageSettings::卡牌包多选
- 状态: 未还原
- 原版: RoomPackageSettings.qml 全文 (cpacks CheckBox 列表, GetAllCardPack, 增删 banCardPkg + UpdatePackageEnable)
- web : 无
- 原版行为: 列出全部卡牌包(排除 serverHiddenPacks)，勾选切换启用，写 Config.curScheme.banCardPkg；含全选/反选按钮。
- web 行为: 无卡包选择 UI；disabledPack 恒空。

---

## 禁将设置 BanGeneralSetting.qml

### B30 BanGeneralSetting::禁将方案管理
- 状态: 未还原
- 原版: BanGeneralSetting.qml 全文 (ban 方案 ComboBox + New/Clear/Export/Import/Rename + 禁将/禁包/白名单三 GridView)
- web : 无
- 原版行为: 多套禁用方案(disableSchemes)切换/新建/清空/剪贴板导入导出/重命名；展示禁将、禁包、白名单将三列。
- web 行为: 完全无禁将系统；disabledGenerals 恒空。

---

## 编辑资料 EditProfile.qml (含 5 子页)

### B31 EditProfile::设置分页容器
- 状态: 未还原
- 原版: EditProfile.qml 全文 (SideBarSwitcher 5 页: Userinfo/BG/Audio/Control/UI Settings)
- web : 无 (LobbyPage 无设置入口)
- 原版行为: 个人设置抽屉，左栏 5 分页。
- web 行为: 无设置入口、无设置页。

### B32 UserInfo::用户名展示
- 状态: 简化还原
- 原版: UserInfo.qml:12-22 (Username: Self.screenName)
- web : LobbyPage.tsx:65 (玩家:{username}) — 仅大厅 header 展示, 非设置页
- 原版行为: 设置页内只读展示用户名。
- web 行为: 大厅 header 展示用户名；无独立资料页。

### B33 UserInfo::更新头像 (UpdateAvatar)
- 状态: 未还原
- 原版: UserInfo.qml:29-54 (avatarName 输入 + Update Avatar → notifyServer UpdateAvatar)
- web : 无 (index.ts:457 注释明确 UpdateAvatar 被忽略)
- 原版行为: 输入头像名提交 UpdateAvatar，opTimer 防抖。
- web 行为: 不发送 UpdateAvatar；avatar 字段虽在 authStore 但无更新 UI。

### B34 UserInfo::修改密码 (UpdatePassword)
- 状态: 未还原
- 原版: UserInfo.qml:56-96 (oldPassword/newPassword + Update Password → notifyServer UpdatePassword)
- web : 无
- 原版行为: 旧/新密码输入，提交 UpdatePassword。
- web 行为: 不支持改密码。

### B35 BGSetting::背景/BGM/海报/语言设置
- 状态: 未还原
- 原版: BGSetting.qml 全文 (lobbyBg/roomBg/bgmFile/ladyImg 文件选择 + Language ComboBox zh_CN/en_US/vi_VN)
- web : 无
- 原版行为: 5 项：大厅背景、房间背景、游戏 BGM、海报女郎、语言切换。
- web 行为: 全部缺失（属本地客户端设置，纯 Web 部署合理简化，但无任何替代）。

### B36 AudioSetting::音频设置
- 状态: 简化还原
- 原版: AudioSetting.qml 全文 (BGM音量/音效音量 SliderRow + 4 SwitchRow: 禁用消息音效/禁用结算音效/隐藏旁观发言/隐藏赠送)
- web : LobbyPage.tsx:52 (bgmMuted 切换, 仅房内 roomBar) + table/audio.ts
- 原版行为: 6 项音频设置：BGM 音量、音效音量、禁用消息音效、禁用结算音效、隐藏旁观发言、隐藏赠送。
- web 行为: 仅房内一个 BGM 静音切换按钮(🔇/🔊)；音量滑块、音效音量、4 个开关均缺失。

### B37 ControlSetting::操作设置
- 状态: 未还原
- 原版: ControlSetting.qml 全文 (5 SwitchRow: 隐藏不可选牌/旋转桌面牌/自动选唯一目标/不对自己单体锦囊无懈/超级拖拽)
- web : 无
- 原版行为: 5 项操作偏好开关。
- web 行为: 全部缺失。

### B38 UISetting::UI 包设置
- 状态: 未还原
- 原版: UISetting.qml 全文 (按 boardgame 分组的 UI 包 ComboRow 选择, Config.enabledUIPackages)
- web : 无
- 原版行为: 每个棋类选择 UI 皮肤包(>1 时显示)。
- web 行为: 无 UI 包选择。

---

## 个人资料卡 PersonalSettings.qml

### B39 PersonalSettings::大厅头像资料卡
- 状态: 未还原
- 原版: PersonalSettings.qml 全文 (头像 Avatar + screenName + 总游戏时长展示, 点击打开 EditProfile)
- web : 无 (LobbyPage 仅 header 文字 username)
- 原版行为: 左上角资料卡：头像、昵称、累计游戏时长(GetPlayerGameData)，点击进编辑资料。
- web 行为: 无头像、无游戏时长展示、无点击入口；仅 header 纯文本用户名。

---

## 房间卡片委托 RoomDelegate.qml
（见 B1，逐元素差异已在 B1 列出）

### B40 RoomDelegate::密码内联输入框
- 状态: 完全还原
- 原版: RoomDelegate.qml:86-96 (passwordEdit TextField, 仅 hasPassword&&!outdated 显示, 内联于卡片底部)
- web : RoomList.tsx (每行内联 `<input type=password>`, 仅 hasPassword&&!outdated 显示)
- 原版行为: 卡片内常驻密码输入框，进入前已填好。
- web 行为: 每行内联密码输入框（受控 state by room id），仅 hasPassword&&!outdated 显示，进入/旁观时取该值，与原版一致（不再 window.prompt 事后弹窗）。
- 差异: （已消除）
- 修复: 已修复并验证 (RoomList.tsx 用内联受控 `<input type=password>` 替换 window.prompt,可见条件照搬 passwordEdit.visible=hasPassword&&!outdated;typecheck/build/150 测试全绿,2026-06-12)

### B41 RoomDelegate::Enter/Observe 按钮禁用态
- 状态: 完全还原
- 原版: RoomDelegate.qml:98-113 (enterButton enabled: !outdated && !timer.running; 文字随满员 Enter/Observe 切换)
- web : RoomList.tsx (outdated→两按钮 disabled; 满员→只显旁观)
- 原版行为: outdated 房禁止进入；防抖 timer 运行时禁用；满员只显 Observe。
- web 行为: outdated 房「加入」「旁观」均 disabled(灰态 not-allowed)；满员(playerCount≥capacity)隐藏「加入」只留「旁观」(照搬 enterButton 文字随满员切换的语义)。
- 差异: （已消除；防抖 timer 为原版交互细节,web 单击即发,asio 幂等,不构成正确性问题）
- 修复: 已修复并验证 (RoomList.tsx outdated 时禁用两按钮、满员时隐藏「加入」,照搬 RoomDelegate.qml:98-113 enabled/text 逻辑;typecheck/build/150 测试全绿,2026-06-12)

---

## 包管理 PackageManage.qml

### B42 PackageManage::拓展包管理页
- 状态: 未还原
- 原版: PackageManage.qml 全文 (ListView 包列表: 启用/禁用/升级/删除/URL安装 + 菜单全部启用/禁用/升级 + Pacman/DownloadComplete 回调)
- web : 无
- 原版行为: 本地 git 包管理：启用/禁用/升级/删除单包、URL 安装新包、批量操作、下载进度回调。
- web 行为: 完全无包管理(纯 Web 部署无本地 Pacman，合理；但无任何替代入口)。

---

## 资源包管理 ResourcePackManage.qml

### B43 ResourcePackManage::资源包优先级管理页
- 状态: 未还原
- 原版: ResourcePackManage.qml 全文 (可用/已启用双列表, 上移/下移/长按置顶置尾/卸载, 保存写 Config.enabledResourcePacks, 撤销/未保存退出确认)
- web : 无
- 原版行为: 双栏资源包管理：启用/禁用拖动、优先级排序、保存/撤销/退出确认。
- web 行为: 无资源包管理 UI；art/audio 包由 SetServerSettings manifest.enabledPacks 服务器下发(index.ts:418-435)，非用户可配。

---

## 包下载 PackageDownload.qml

### B44 PackageDownload::同步下载进度页
- 状态: 未还原
- 原版: PackageDownload.qml 全文 (DownloadComplete/SetDownloadingPackage/PackageDownloadError/PackageTransferProgress 回调, 进度/错误/fastRepair 修复 + needRestart 重启提示)
- web : 无
- 原版行为: 登录时与服务器同步拓展包，逐包进度/错误展示、自动修复(dirty/缺文件→卸载重装)、core 包更新需重启。
- web 行为: 无包下载同步(Web 端资源经 HTTP/manifest，不走 git 同步)；4 个下载回调命令均无消费。

---

## 状态计数表

| 状态 | 数量 | 序号 |
|------|------|------|
| 完全还原 | 8 | B5, B14, B15, B20, B22, B23, B40, B41 |
| 简化还原 | 12 | B1, B2, B7, B9, B12, B18, B19, B24, B25, B27, B32, B36 |
| 还原错误 | 0 | （B40, B41 已修复并验证 2026-06-12，升级为完全还原） |
| 未还原 | 24 | B3, B4, B6, B8, B10, B11, B13, B16, B17, B21, B26, B28, B29, B30, B31, B33, B34, B35, B37, B38, B39, B42, B43, B44 |

合计 44 条（完全 8 / 简化 12 / 错误 0 / 未还原 24；B40、B41 于 2026-06-12 修复并验证由还原错误升级）。

### 未还原序号索引
B3, B4, B6, B8, B10, B11, B13, B16, B17, B21, B26, B28, B29, B30, B31, B33, B34, B35, B37, B38, B39, B42, B43, B44

### 还原错误序号索引
（无；B40 密码内联框、B41 过期房禁用 均已于 2026-06-12 修复并验证，升级为完全还原）
