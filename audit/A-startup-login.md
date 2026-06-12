# Phase A 审计报告 — 启动 / 全局 shell / 登录连服

范围：逐行对照原版 FreeKill (37f8c12 / v0.5.20) 的 `Fk/main.qml`、`Fk/Pages/Common/{Init,JoinServer,About,Tutorial,ModesOverview}.qml`、`lua/client/{clientbase,clientplayer_base,client_util}.lua` 与 freekill-web 的 `apps/web/src/{main.tsx,App.tsx,pages/LoginPage.tsx,pages/LobbyPage.tsx,net/gatewayClient.ts,pwa/PwaUpdater.tsx,vm/clientVm.ts,stores/index.ts,i18n/zh.ts}`，判定每个启动 / 全局壳 / 登录连服元素的还原状态。

说明：客户端逻辑层 (`clientbase.lua` 等) 在 web 中由 wasmoon 原样运行（`vm/clientVm.ts` boot 序列 prelude→freekill.lua→client.lua→CreateLuaClient），因此对 clientbase/clientplayer_base/client_util 的回调与全局函数，凡 boot 跑通即视为逻辑层还原，本阶段只审查"这些逻辑是否被 web 启动/壳/登录流程接入、其 QML 呈现是否被 TS 还原"。原版直连 TCP 在 web 为 gateway→asio 桥接，属架构差异，按规则标注而非判错。

---

### A1 main.qml::Window 顶层窗口与缩放
- 状态: 简化还原
- 原版: Fk/main.qml:6-44 (Window + RootPage)
- web : apps/web/src/main.tsx:5-12、App.tsx:13-38
- 原版行为: Window width=1200 height=540 minimumWidth=200 minimumHeight=90 visible=true；title=`qsTr("FreeKill")+" v"+Cpp.version`；onXChanged/onYChanged/onWidthChanged/onHeightChanged 写回 Config.winX/winY/winWidth/winHeight；RootPage 按 1200/540 宽高比锁定缩放 scale=parent.width/width；onConfLoaded 非 Android 恢复 winX/winY/winWidth/winHeight，Android 强制 Screen.width/Screen.height。
- web 行为: main.tsx 仅 `createRoot(#root).render(<App/>)`，无 Window/标题/尺寸记忆/缩放锁定；App.tsx 仅做 login↔lobby 路由 + 重连遮罩 + PwaUpdater。窗口尺寸、标题版本号、winX/winY/winWidth/winHeight 持久化、1200/540 比例缩放、Android 全屏均交给浏览器视口，未实现。
- 差异: 未还原元素逐项：(1) 窗口标题 `FreeKill vX.Y.Z`；(2) winX/winY/winWidth/winHeight/winScale 持久化与 onConfLoaded 恢复；(3) RootPage 1200/540 固定宽高比缩放；(4) Android Screen 全屏分支。

### A2 main.qml::exitMessageDialog 退出确认
- 状态: 未还原
- 原版: Fk/main.qml:46-65,77-82 (MessageDialog exitMessageDialog + onClosing)
- web : 无
- 原版行为: onClosing 拦截关闭，未设 mainWindow.closing 时 closeEvent.accepted=false 并 open() 弹窗；弹窗 informativeText=`qsTr("Are you sure to exit?")`，Ok 分支设 mainWindow.closing=true、Config.saveConf()、Cpp.quitLobby(false)、root.close()；Cancel 分支 close() 弹窗。
- web 行为: 无关闭确认；浏览器关闭/刷新由 PwaUpdater 与 connectionStore 持久化凭据处理，无 "确定退出" 弹窗，无 saveConf、无 quitLobby(false) 主动通知。
- 差异: 整条未还原：退出确认弹窗、saveConf 落盘、quitLobby(false) 主动告知服务端离开大厅，全部缺失。

### A3 main.qml::全屏快捷键 Shortcut
- 状态: 未还原
- 原版: Fk/main.qml:67-75 (Shortcut)
- web : 无
- 原版行为: sequences=["F11","Ctrl+F","Alt+Return"]；onActivated 在 Window.FullScreen 时 showNormal() 否则 showFullScreen()，切换全屏。
- web 行为: 无 F11/Ctrl+F/Alt+Return 全屏切换绑定（可由浏览器原生 F11 部分替代，但无 app 内实现）。
- 差异: 整条未还原。

### A4 Init.qml::Console start 单机开始
- 状态: 未还原
- 原版: Fk/Pages/Common/Init.qml:61-78 (Button "Console start")
- web : 无
- 原版行为: 点击设 Config.serverAddr="127.0.0.1"、serverPort=9527；findFavorite 回填 screenName/password（缺省 "player"/"1234"）；App.setBusy(true)；addFavorite(127.0.0.1,9527,...)；Backend.startServer(9527) 本地起服务端；Backend.joinServer；ClientInstance.setLoginInfo。
- web 行为: 无单机模式。web 是纯网关→asio 架构，浏览器内无法 startServer 本地进程。LoginPage 只有"网关地址/用户名/密码"远程登录。
- 差异: 整条未还原（属架构差异：浏览器端无本地服务端进程，但功能"单机一键开局"在 web 完全缺失，标记未还原）。

### A5 Init.qml::Join Server / 服务器对话框 (JoinServer.qml)
- 状态: 简化还原
- 原版: Fk/Pages/Common/Init.qml:80-87,163-218 + Fk/Pages/Common/JoinServer.qml:1-431
- web : apps/web/src/pages/LoginPage.tsx:25-72
- 原版行为: "Join Server" 打开带 400ms 透明度动画的 serverDialog；JoinServer 列表 (serverModel/GridView) 展示收藏服+公共服+局域网服，每项显示 favicon/名称/`delay ms`+misMatchMsg(按延迟绿/橙/红)/`online/capacity`/收藏星标/局域网标；右侧面板 addressEdit/portEdit/description/usernameEdit/passwordEdit；"LOGIN (Auto-registration)" 校验四字段非空后 setBusy、addFavorite、joinServer、setLoginInfo；"Refresh List" 逐项 getServerInfo 测延迟；"Detect LAN" detectServer；"Go Back"；版本号比较 misMatchMsg (@VersionMatch/@VersionMismatch，支持 "x.y.z+" 离散比较)；右键菜单"Remove from Favorites"；loadConfig 合并 getPublicServerList+favoriteServers。
- web 行为: LoginPage 只有三输入框（网关地址 url、用户名、密码）+ 单个"登录"按钮 + 提示文案，提交即 `connect(url,{user,password,uuid})`。无服务器列表、无收藏、无局域网探测、无延迟测量、无版本匹配提示、无 online/capacity 展示、无 favicon、无 description、无 400ms 动画、无右键移除收藏。uuid 持久化于 localStorage('fk-uuid')，凭据持久化于 connectionStore CRED_KEY。
- 差异: 简化为单网关地址直连。未还原元素逐项：(1) 服务器列表 serverModel/GridView；(2) 收藏服 favoriteServers 增删改 (addFavorite/removeFavorite)；(3) 局域网探测 detectServer/ServerDetected；(4) 延迟测量 getServerInfo + delay 着色；(5) 版本匹配 @VersionMatch/@VersionMismatch 与 "x.y.z+" 比较；(6) online/capacity/favicon/description 展示 (getServerDetail/getPublicServerList)；(7) 用户名/密码不再预填收藏；(8) 400ms 透明度 show/hide 动画。

### A6 Init.qml::enterLobby 回调（进入大厅）
- 状态: 完全还原
- 原版: Fk/Pages/Common/Init.qml:224-230 (enterLobby) + clientbase 经 EnterLobby 链路
- web : apps/web/src/stores/index.ts:336-349 (isRoomBootstrap 反向) + App.tsx:24-27 (status==='online' 显示 LobbyPage) + LobbyPage.tsx:33
- 原版行为: enterLobby 设 Config.lastLoginServer、App.enterNewPage Lobby、setBusy(false)、Cpp.notifyServer("RefreshRoomList","")、Config.saveConf()。
- web 行为: gateway `__gateway_login_ok` 置 status='online'(gatewayClient.ts:61)，App.tsx 切到 LobbyPage；LobbyPage 挂载即 `client.notify('RefreshRoomList','')`(LobbyPage.tsx:33)。lastLoginServer/saveConf 由 connectionStore saveCreds 持久化等价覆盖。功能等价（架构差异：登录成功信号来自 gateway 而非 EnterLobby 命令）。
- 差异: 无（功能等价，RefreshRoomList 一致）。

### A7 Init.qml::PackageManage 拓展包管理入口
- 状态: 未还原
- 原版: Fk/Pages/Common/Init.qml:89-95 (Button → App.enterNewPage "PackageManage")
- web : 无
- 原版行为: 点击进入 PackageManage 页（拓展包启用/禁用，关联 client_util UpdatePackageEnable:321 / GetAllModNames:132 / GetAllGeneralPack:136 / GetAllCardPack:352）。
- web 行为: LobbyPage 与 LoginPage 均无拓展包管理入口；启用包由服务端 manifest (SetServerSettings enabledPacks，stores/index.ts:418-435) 单向下发，客户端不可改。
- 差异: 整条未还原（客户端侧包管理 UI 缺失；web 改为服务端 manifest 驱动）。

### A8 Init.qml::ResourcePackManage 资源包管理入口
- 状态: 未还原
- 原版: Fk/Pages/Common/Init.qml:97-103 (Button "管理资源包" → ResourcePackManage)
- web : 无
- 原版行为: 点击进入 ResourcePackManage 页（资源包管理）。
- web 行为: 无资源包管理入口；web 资源由 Vite 静态 /fk 与服务端 assetVersion 管理。
- 差异: 整条未还原。

### A9 Init.qml::Quit Game 退出按钮
- 状态: 未还原
- 原版: Fk/Pages/Common/Init.qml:105-112 (Button "Quit Game")
- web : 无
- 原版行为: 点击 Config.saveConf() 后 Qt.quit() 退出程序。
- web 行为: 登录页无退出按钮（浏览器标签页关闭即退出，无 saveConf）。LobbyPage 的"退出"按钮(LobbyPage.tsx:70)是 disconnect 断网关而非退程序。
- 差异: 整条未还原（浏览器环境无 Qt.quit 等价；登录页无退出/saveConf）。

### A10 Init.qml::版本号与 FAQ/ResFix 角标
- 状态: 未还原
- 原版: Fk/Pages/Common/Init.qml:115-159 (version Text + FAQ Text + ResFix Text)
- web : 无
- 原版行为: 左下 `qsTr("FreeKill")+" v"+Cpp.version` 版本号；右下 "FAQ" 蓝色下划线点击 PushPage Tutorial；FAQ 左侧 "ResFix"（仅 OS==="Android" 可见）点击 Backend.askFixResource()。
- web 行为: LoginPage 无版本号显示、无 FAQ 入口、无 ResFix。LobbyPage 标题仅"FreeKill 大厅"无版本号。
- 差异: 未还原元素逐项：(1) 版本号 v 显示；(2) FAQ→Tutorial 入口；(3) Android ResFix→askFixResource。

### A11 Init.qml::lady 立绘与 widelogo
- 状态: 未还原
- 原版: Fk/Pages/Common/Init.qml:24-37,251 (lady Image + widelogo Image)
- web : 无
- 原版行为: 左侧 lady Image，source=Config.ladyImg（随机/配置立绘）；底部 widelogo 图 source=Cpp.path+"/image/widelogo"。
- web 行为: LoginPage 为深色卡片表单，无 lady 立绘、无 widelogo。
- 差异: 整条未还原（登录页视觉立绘/宽 logo 缺失）。

### A12 Init.qml::downloadComplete 包更新提示
- 状态: 未还原
- 原版: Fk/Pages/Common/Init.qml:220-222 (downloadComplete)
- web : 无
- 原版行为: App.showToast(`qsTr("updated packages for md5")`)，md5 包下载完成提示。
- web 行为: 无客户端包下载流程（资源走 Vite 静态 + PWA SW 更新），无此 toast。PwaUpdater 提供的是"新版本"客户端构建更新，非包 md5 更新，语义不同。
- 差异: 整条未还原（无客户端动态下载包/校验 md5 链路）。

### A13 Tutorial.qml::教程 SwipeView (FAQ)
- 状态: 未还原
- 原版: Fk/Pages/Common/Tutorial.qml:1-79
- web : 无
- 原版行为: total=7 页 SwipeView，每页 Text=`qsTr("tutor_msg_"+(n+1))` RichText 支持 onLinkActivated 外链；底部 `currentIndex+1/total` + Skip(quitPage) + Prev(currentIndex>0) + Next/OK!(末页 quitPage 否则 currentIndex++)。
- web 行为: 无教程页；i18n/zh.ts 无 tutor_msg_* 键。
- 差异: 整条未还原（7 页教程、翻页控件、外链全部缺失）。

### A14 About.qml::关于页 SwipeView
- 状态: 未还原
- 原版: Fk/Pages/Common/About.qml:1-87
- web : 无
- 原版行为: aboutModel 7 项 (freekill/qt/lua/gplv3/sqlite/ossl/git2)，SwipeView 每项 logo 图 `Cpp.path+"/image/logo/"+dest` + `Lua.tr("about_"+dest+"_description")` MarkdownText 外链；PageIndicator interactive；Quit 按钮 quitPage。
- web 行为: 无关于页；无 about_*_description 链路接入。
- 差异: 整条未还原（7 项致谢/许可页全部缺失）。

### A15 ModesOverview.qml::模式总览页
- 状态: 未还原
- 原版: Fk/Pages/Common/ModesOverview.qml:1-94 (调用 client_util.lua:509 GetGameModes)
- web : 无独立页（部分数据经 CreateRoomDialog）
- 原版行为: Component.onCompleted 调 `Lua.call("GetGameModes")` 填 modeList；左侧 ListView 列模式名 name，右侧 Flickable 显示 `Lua.tr(":"+orig_name)` MarkdownText 模式说明；Quit 按钮。
- web 行为: 无"模式总览/说明"页。GetGameModes 全局函数虽在 VM 中存在 (client_util.lua:509)，但 web 未在大厅/登录壳调用它渲染模式说明。CreateRoomDialog.tsx:59-61 模式下拉仅硬编码单个 `<option value="aaa_role_mode">身份模式</option>`，未读 GetGameModes。
- 差异: 整条未还原：(1) 模式列表来自硬编码而非 GetGameModes；(2) 无模式说明文本 (`:orig_name` 翻译) 展示页；(3) 仅身份模式一项，1v1/2v2/test 等模式不可见不可选。

### A16 clientbase.lua::Setup 登录身份初始化
- 状态: 完全还原
- 原版: lua/client/clientbase.lua:19,115-130 (sendSetupPacket/setup + NetworkDelayTest)
- web : apps/web/src/stores/index.ts:316-318,344-346 + vm/clientVm.ts feedPacket
- 原版行为: addCallback NetworkDelayTest→sendSetupPacket、Setup→setup；setup 取 [id,name,avatar,msec] setId/setScreenName/setAvatar，建 Self，players={Self}，msec 时 setupServerLag。
- web 行为: gateway 完成 asio 握手 (gatewayClient.ts:48-52 __gateway_login)；Setup 命令在大厅阶段被 stash 为 loginSetup(stores/index.ts:316-318)，进房前 boot VM 后 feed 给 wasmoon 内 client.lua 原样跑 setup(注释 index.ts:344-345)。NetworkDelayTest/sendSetupPacket 由 VM 逻辑层原样处理。逻辑层原样运行=完全还原。
- 差异: 无。

### A17 clientbase.lua::Heartbeat 心跳
- 状态: 完全还原
- 原版: lua/client/clientbase.lua:20,132-134 (heartbeat)
- web : apps/web/src/stores/index.ts:396-405 (lobby) + VM ClientBase:heartbeat (in-room)
- 原版行为: addCallback Heartbeat→heartbeat；heartbeat 回 notifyServer("Heartbeat","")，重置服务端 ttl。
- web 行为: 大厅阶段 VM 未 boot，由 connectionStore 直接 `client.notify('Heartbeat','')` 回应(index.ts:396-404，注释解释 ttl=6/30s)；进房后由 VM 内 ClientBase:heartbeat 经 setServerSender→gateway 回应。两阶段都回心跳，行为等价。
- 差异: 无。

### A18 clientbase.lua::房间引导命令 EnterRoom/Observe/Reconnect
- 状态: 完全还原
- 原版: lua/client/clientbase.lua:22,41,42,136-177,492-525 (enterRoom/reconnect/observe/loadRoomSummary)
- web : apps/web/src/stores/index.ts:336-349 (isRoomBootstrap) + roomRouting.ts
- 原版行为: addCallback EnterRoom/ChangeRoom/EnterLobby/Reconnect/Observe；enterRoom 重建 ClientInstance、Self 纳入 players、记录 enter_room_data/capacity/timeout/settings；reconnect/observe 经 loadRoomSummary 重建并 startGame/arrangeSeats/deserialize。
- web 行为: routeEnvelope 识别三种 bootstrap 命令 EnterRoom/Observe/Reconnect(index.ts:336-349)，boot VM 后先 feed loginSetup 再 feed bootstrap 包给 client.lua，由 wasmoon 内 enterRoom/loadRoomSummary 原样处理；Observe 命令额外 setObserving(index.ts:341)。逻辑层原样运行。
- 差异: 无。

### A19 clientbase.lua::EnterLobby 退房回大厅
- 状态: 完全还原
- 原版: lua/client/clientbase.lua:24,229-231 (quitRoom via EnterLobby)
- web : apps/web/src/stores/index.ts:350-355
- 原版行为: addCallback EnterLobby→quitRoom(true)，quitRoom 调 stopRecording("")，并 notifyUI EnterLobby。
- web 行为: routeEnvelope 命中 EnterLobby 时 inRoom=false、vmStore.reset()、enteredRoomId=undefined(index.ts:350-354)，回大厅视图。stopRecording 等录像逻辑在 VM 层（web 录像功能见 A24 备注）。
- 差异: 无（退房路由还原；录像另计 A24）。

### A20 clientbase.lua::大厅玩家/房间增减与状态 (AddPlayer/RemovePlayer/AddObserver/RemoveObserver/AddNpc/ReadyChanged/RoomOwner/NetStateChanged/UpdateGameData/AddTotalGameTime)
- 状态: 完全还原
- 原版: lua/client/clientbase.lua:25-49,255-373,572-586
- web : VM 逻辑层原样运行 + apps/web/src/stores/gameStore.ts syncPlayers 快照消费 (clientVm.ts:118-196 __fkReadPlayers)
- 原版行为: 上述回调维护 self.players/observers、ready/owner/state/gameData/totalGameTime，并各自 notifyUI 驱动 QML 座位/头像/状态渲染。
- web 行为: 这些回调在 wasmoon 内 client.lua 原样执行改状态；TS 经 __fkReadPlayers 快照桥(clientVm.ts:118-196)读 id/name/avatar/seat/general/hp/role/dead/ready/owner/chained/dying/role_shown/faceup/roleVisible/sealedSlots/equipCids/judgeCids/handcardNum/marks/picMarks/isSelf 渲染。按"快照渲染"模式还原（不依赖命令字面量）。
- 差异: 无（注：本阶段仅确认接入方式正确；座位/等待房 UI 的逐项视觉对照属 Lobby/WaitingRoom 阶段范围）。

### A21 clientbase.lua::Chat 大厅/房间聊天
- 状态: 简化还原
- 原版: lua/client/clientbase.lua:34,375-405 (chat)
- web : apps/web/src/stores/index.ts:436-440,462-471 (normalizeChat)
- 原版行为: chat 区分 type==1（系统，general="" + time）；否则按 sender 找 player/observer，填 general(头像)、userName、time=os.date("%H:%M:%S")，notifyUI("Chat")。
- web 行为: 大厅阶段 connectionStore 直接消费 Chat：normalizeChat 取 userName/sender/who 与 msg/text/s(index.ts:462-471)，存 {who,text,at:Date.now()}；未还原 type==1 系统消息分支、general(头像) 字段、服务端 time 格式（用本地 Date.now()）。房间内聊天经 VM 逻辑层原样跑（roomChatStore，属 Room 阶段）。
- 差异: 大厅聊天简化：(1) 未区分 type==1 系统消息；(2) 不解析/显示 general 头像；(3) 时间用客户端 Date.now() 而非服务端 os.date 串。

### A22 client_util.lua::Translate / 翻译体系
- 状态: 完全还原
- 原版: lua/client/client_util.lua:5-7 (Translate→Fk:translate)
- web : apps/web/src/i18n/zh.ts:6-31 + vm/clientVm.ts:212-219 (__fkTranslate)
- 原版行为: Translate(src) 返回 Fk:translate(src) 本地化文本；QML 经 Lua.tr / qsTr 取译文。
- web 行为: 游戏内权威译文由 VM Fk:translate 经 __fkTranslate 批量桥(clientVm.ts:212-219)取出并 registerTranslations 合入运行时缓存(zh.ts:17-21)；tr() 先查运行时缓存→静态 ZH→原 key(zh.ts:28-31)。静态 ZH 仅 4 个大厅键(aaa_role_mode/m_1v1_mode/m_2v2_mode/testmode)。机制等价还原。
- 差异: 无（机制完全还原；静态字典覆盖少属数据量而非机制差异，且 VM 缓存兜底）。

### A23 client_util.lua::GetGameModes 模式数据
- 状态: 简化还原
- 原版: lua/client/client_util.lua:509-524 (GetGameModes)
- web : apps/web/src/components/CreateRoomDialog.tsx:59-61
- 原版行为: GetGameModes 遍历 Fk.game_modes 返回 {name(译名),orig_name,minPlayer,maxPlayer} 列表，供 ModesOverview 与建房模式选择。
- web 行为: VM 内 GetGameModes 函数存在可调用，但 web 未调用它生成建房模式列表；CreateRoomDialog 模式下拉硬编码单项身份模式(CreateRoomDialog.tsx:59-61)。未还原 minPlayer/maxPlayer 约束与多模式枚举。
- 差异: (1) 模式列表硬编码非来自 GetGameModes；(2) 仅身份模式，其余 game_modes 不可选；(3) 无 minPlayer/maxPlayer 人数约束联动（建房人数固定 min2 max8，CreateRoomDialog.tsx:56）。

### A24 clientbase.lua::录像 startRecording/stopRecording/saveGameData
- 状态: 未还原
- 原版: lua/client/clientbase.lua:65-111,233-253,492-525,588-609 (startRecording/stopRecording/saveGameData/saveRecord)
- web : 无（VM 逻辑层会跑，但无落盘/回放壳接入）
- 原版行为: startGame/reconnect/observe 触发 startRecording；gameOver 调 stopRecording 与 client:saveGameData(mode,general,deputy,role,result,...,serialize)，并 SaveRecord(client_util.lua:908) 存录像供回放。
- web 行为: wasmoon 内 client.lua 的 recording 逻辑会执行，但 web 无 saveGameData 落盘实现、无回放(replaying) 入口、无录像列表/回放页接入。startup/壳层无任何录像/回放 UI。
- 差异: 整条未还原（录像保存与回放在 web 启动/壳层无接入；浏览器侧 saveGameData 落盘缺失）。

### A25 main.tsx/App.tsx::启动序列 (boot) 与自动登录
- 状态: 简化还原（架构差异）
- 原版: Fk/main.qml:30-43 (onConfLoaded) + Init.qml 启动即停在登录页
- web : apps/web/src/App.tsx:13-38 + stores/index.ts:164-172 (tryAutoLogin) + vm/clientVm.ts:74-474 (boot)
- 原版行为: 程序启动加载 Config(onConfLoaded 恢复窗口) 后停在 Init 登录页，用户手动选服登录；无"自动重连上次会话"概念（每次手动 joinServer）。
- web 行为: App.tsx 挂载即 tryAutoLogin()(App.tsx:19)，从 localStorage CRED_KEY 读 {url,user,password,uuid} 自动重连(index.ts:164-172)；VM boot 延迟到首次进房 bootIfNeeded(index.ts:344)，非启动即 boot；断线自动重连带退避(index.ts:77-91,RECONNECT_*)。这是 web 新增的无感重连能力，原版无对应。
- 差异: 架构性差异（功能等价方向不同）：web 增加了原版没有的自动登录/自动重连/PWA 自更新；缺少原版的 Config 窗口状态恢复(见 A1)。按规则标注为架构差异，非还原错误。

### A26 clientplayer_base.lua::ClientPlayerBase 客户端玩家对象
- 状态: 完全还原
- 原版: lua/client/clientplayer_base.lua:1-36
- web : VM 逻辑层原样运行 + vm/clientVm.ts:118-196 快照读取
- 原版行为: initialize 设 player/id/markArea/ready/owner；serialize 输出 setup_data{id,screenName,avatar,false,totalGameTime}+ready+owner+markArea。
- web 行为: 在 wasmoon 内 client.lua 体系下原样实例化；ready/owner/id 等经 __fkReadPlayers 快照(clientVm.ts:186-191)读出渲染。逻辑层原样运行=还原。
- 差异: 无。

### A27 PwaUpdater::客户端更新（web 专有，对应原版 md5 包更新/版本提示）
- 状态: 简化还原（架构差异）
- 原版: Init.qml:220-222 (downloadComplete) + main.qml:14 标题版本号
- web : apps/web/src/pwa/PwaUpdater.tsx:27-73
- 原版行为: 原版客户端版本/资源更新经下载包 + md5 校验 + showToast 提示，版本号显示在窗口标题。
- web 行为: PwaUpdater 用 vite-plugin-pwa autoUpdate：60s 轮询新 SW(PwaUpdater.tsx:25,42)，大厅自动 reload 到新构建，房间内延迟并显示"检测到新版本"横幅(PwaUpdater.tsx:52-72)，离房自动应用。这是 web 客户端整体构建更新，非原版的按包 md5 更新。
- 差异: 架构差异：更新粒度从"按拓展包 md5"变为"整客户端 SW 构建"；无版本号显示、无 md5 toast。功能方向等价（让客户端拿到最新），标注为架构差异。

---

## 状态计数表

| 状态 | 条数 | 序号 |
|------|------|------|
| 未还原 | 12 | A2, A3, A4, A7, A8, A9, A10, A11, A12, A13, A14, A15, A24 |
| 简化还原 | 5 | A1, A5, A21, A23, A25, A27 |
| 还原错误 | 0 | — |
| 完全还原 | 8 | A6, A16, A17, A18, A19, A20, A22, A26 |

注：上表"未还原"序号列含 A24 共 13 个条目，计数以"未还原=13"为准；"简化还原"含 A25/A27 两条架构差异共 6 条。修正后准确计数：

| 状态 | 条数 |
|------|------|
| 未还原 | 13 (A2,A3,A4,A7,A8,A9,A10,A11,A12,A13,A14,A15,A24) |
| 简化还原 | 6 (A1,A5,A21,A23,A25,A27) |
| 还原错误 | 0 |
| 完全还原 | 8 (A6,A16,A17,A18,A19,A20,A22,A26) |

合计 27 条。

## 未还原 / 还原错误 索引
- 未还原 (13)：A2 退出确认弹窗、A3 全屏快捷键、A4 单机 Console start、A7 拓展包管理、A8 资源包管理、A9 退出游戏按钮、A10 版本号/FAQ/ResFix 角标、A11 lady 立绘/widelogo、A12 包下载 md5 提示、A13 教程页(Tutorial)、A14 关于页(About)、A15 模式总览页(ModesOverview)、A24 录像保存/回放。
- 还原错误 (0)：无。

## 最关键的 3 个缺口
1. **整个服务器选择/收藏/局域网/延迟/版本匹配体系被压成单个网关地址直连 (A5)** —— 收藏服、公共服列表、LAN 探测、延迟着色、版本兼容提示 (@VersionMatch/@VersionMismatch)、online/capacity/favicon 全缺失。
2. **全局壳页面几乎全空白 (A7,A8,A13,A14,A15)** —— 拓展包管理、资源包管理、教程(FAQ)、关于、模式总览五个 Common 页面在 web 无任何入口，且建房模式被硬编码为仅"身份模式"(A23/A15)，1v1/2v2/test 等模式不可选。
3. **窗口生命周期与退出/录像缺失 (A1,A2,A9,A24)** —— 无窗口尺寸/位置持久化与标题版本号、无"确定退出"确认 + saveConf/quitLobby、无退出按钮、无录像保存与回放，启动/收尾闭环不完整。
