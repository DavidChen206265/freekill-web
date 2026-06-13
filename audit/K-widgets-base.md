# Phase K — 基础控件层（Widgets + Base）还原审计

原版：`/home/ubuntu/freekill/freekill-vps-deploy/FreeKill-sourcecode/`（37f8c12 / v0.5.20）
web：`/home/ubuntu/freekill/freekill-vps-deploy/freekill-web/`

> 架构事实：原版 `Fk/Widgets/` 是一套 GNOME-Adwaita 风格的 QML 通用控件库（ActionRow/Combo/Spin/Switch/Slider/Preference 等），主要服务于**设置页/偏好页**与页面框架；`Fk/Base/` 多为引擎桥接 QtObject 单例（Config/CppUtil/LuaUtil/SkinBank/...）。web 端用原生 HTML/CSS + React + zustand，无统一控件库——逐控件判定其功能是否被某处 web 实现覆盖。web 端**尚无设置/偏好页面**（Lobby 仅刷新/建房/退出/BGM 开关），故大量 PreferencePage 系列控件无对应。

---

## Widgets（17 个）

### K1 Widgets::ActionRow
- 状态: 未还原
- 原版: Fk/Widgets/ActionRow.qml:5 (AbstractButton)
- web : 无
- 原版行为: 设置项行基类。title(18px)+subTitle(16px grey)左侧 ColumnLayout；右侧 suffixLoader 装载 suffixComponent；背景 60px 高 Rectangle，down 态 #EFEFEF/常态 #FEFFFE 带 200ms ColorAnimation；visualFocus 时 #E81A62 2px 边框；右下 2px 偏移投影矩形。
- web 行为: 无设置页，故无此行基类。CreateRoomDialog.tsx 用一次性 label+control 的 `<div>` 行（如 :53、:107 的 SwitchRow 注释），但非通用 ActionRow 抽象，无 down/focus 动效与投影。
- 差异: —

### K2 Widgets::ButtonContent
- 状态: 未还原
- 原版: Fk/Widgets/ButtonContent.qml:6 (AbstractButton)
- web : 无
- 原版行为: 通用按钮内容。RowLayout 居中 icon(24x24, disabled 时 ColorOverlay #CC808082)+text(16px bold)；背景 120x40 radius8，按 enabled/down(#BEBEC0)/hovered(#DCDCDE)/默认(#E6E6E7) 切色 200ms 动画；plainButton=false 时加 DropShadow。
- web 行为: 各处按钮（LobbyPage.tsx:52-70、CreateRoomDialog.tsx:77-78）为内联 `<button>` + styles，无统一 icon+text+hover/down 色阶+投影抽象。
- 差异: —

### K3 Widgets::ButtonRow
- 状态: 未还原
- 原版: Fk/Widgets/ButtonRow.qml:4 (ActionRow)
- web : 无
- 原版行为: ActionRow 变体，contentItem 居中显示 title(16px bold)，作为设置页中的「可点按行」（左右 icon 为 TODO 未实现）。
- web 行为: 无设置页，无此行控件。
- 差异: —

### K4 Widgets::ComboRow
- 状态: 简化还原
- 原版: Fk/Widgets/ComboRow.qml:4 (ActionRow)
- web : apps/web/src/components/CreateRoomDialog.tsx:59 (`<select>`)
- 原版行为: ActionRow + suffix ComboBox；model/textRole/currentValue 绑定；onCurrentIndexChanged 同步 currentValue（ListModel 用 get，否则数组索引）；点击行打开 popup；setCurrentIndex(idx)。
- web 行为: CreateRoomDialog 用原生 `<select>`（gameMode 选择，:59-63）覆盖「下拉选一项」核心功能；受控 value/onChange。但仅此一处临时用法，非通用「设置行+下拉」控件；无 ActionRow 行外观/点行展开/textRole 抽象。
- 差异: 仅覆盖下拉选值核心功能，缺通用行容器/点击整行展开/ListModel 适配；非控件库级复用。

### K5 Widgets::CommonScrollBar
- 状态: 未还原（等价由浏览器原生滚动条覆盖）
- 原版: Fk/Widgets/CommonScrollBar.qml:4 (ScrollBar)
- web : 无（依赖浏览器原生 overflow 滚动条）
- 原版行为: 自定义竖向 ScrollBar，active(hover/press) 时宽 6→10 带 200ms 动画；圆角条 #808080，press/hover 加深；opacity active 0.8/否 0.0 渐隐；轨道 #E6E6E6。
- web 行为: 滚动容器（如可滚动面板）使用浏览器原生滚动条，未实现这套 hover 展开/渐隐自定义样式。功能性滚动有，视觉控件未还原。
- 差异: —

### K6 Widgets::EntryRow
- 状态: 简化还原
- 原版: Fk/Widgets/EntryRow.qml:4 (TextField)
- web : apps/web/src/pages/LoginPage.tsx:30-31 / components/CreateRoomDialog.tsx:53,64 (`<input>`)
- 原版行为: TextField，placeholderText=title，value 别名 text；背景 60px #FEFFFE 矩形 + 右下 2px 投影。
- web 行为: 多处原生 `<input>`（用户名/密码/房名/密码）覆盖文本输入 + placeholder 核心功能；受控 value。无 60px 行高/投影矩形外观，非通用控件。
- 差异: 仅文本输入核心功能；缺统一外观/投影；非控件库复用。

### K7 Widgets::PageBase
- 状态: 完全还原（架构等价）
- 原版: Fk/Widgets/PageBase.qml:9 (Item) — addCallback/canHandleCommand/handleCommand 的命令回调注册表
- web : apps/web/src/diag/notifyCommands.ts + stores 各 notifyUI sink（vmStore/gameStore.apply/popupStore.handle）
- 原版行为: 页面基类，priv.callbacks 字典；addCallback(cmd,f)/canHandleCommand(cmd)/handleCommand(sender,cmd,data) 把后端命令路由到页面处理函数。
- web 行为: web 用 zustand store 的 notifyUI 分发（notifyCommands.ts 枚举每条命令的消费方式，vmStore/gameStore/popupStore 各自 case 分支处理），等价实现「命令→处理函数」路由。架构不同但功能等价覆盖。
- 差异: —

### K8 Widgets::PopupLoader
- 状态: 简化还原
- 原版: Fk/Widgets/PopupLoader.qml:8 (Popup)
- web : apps/web/src/table/RequestPopup.tsx:27 (模态层) / stores/popupStore.ts
- 原版行为: 定制 Popup，按 Config.winScale 缩放（padding/loader.scale/宽高除以 winScale）；Loader 装载内容；item.finish 信号自动 close；背景 #FAFAFB radius5 #E7E7E8 边框。
- web 行为: RequestPopup 渲染居中模态弹层（popupStore 驱动 active/resolve），覆盖「弹出内容+完成后关闭」核心功能。无 Config.winScale 整体缩放机制（web 用 CSS 布局而非 QML 缩放），背景样式自定义。
- 差异: 缺 winScale 缩放语义；样式不同；为针对 request 的专用弹层而非通用 Popup 装载器。

### K9 Widgets::PreferenceGroup
- 状态: 未还原
- 原版: Fk/Widgets/PreferenceGroup.qml:4 (ColumnLayout)
- web : 无
- 原版行为: 偏好分组容器。title(14px bold)+subTitle(12px grey) 标题块（高度按有无 title/subTitle 取 56/40/8）；childrenChanged 时令子项 Layout.fillWidth。
- web 行为: 无设置/偏好页，无分组容器。
- 差异: —

### K10 Widgets::PreferencePage
- 状态: 未还原
- 原版: Fk/Widgets/PreferencePage.qml:5 (Flickable)
- web : 无
- 原版行为: 偏好页容器。竖向 Flickable，ColumnLayout(spacing12) 装 PreferenceGroup，contentHeight=layout+32；childrenChanged fillWidth；竖向 CommonScrollBar。
- web 行为: 无设置/偏好页面。
- 差异: —

### K11 Widgets::SideBarSwitcher
- 状态: 未还原
- 原版: Fk/Widgets/SideBarSwitcher.qml:7 (ListView)
- web : 无
- 原版行为: 130px 宽侧栏 ListView，背景 #EBEBED，高亮项 #D9D9DA radius5 scale0.9，highlightMoveDuration 500；delegate 居中显示 Lua.tr(name)；TapHandler 点击切 currentIndex。
- web 行为: 无侧栏切换器（设置/总览页未实现）。
- 差异: —

### K12 Widgets::SliderRow
- 状态: 未还原
- 原版: Fk/Widgets/SliderRow.qml:4 (ActionRow)
- web : 无
- 原版行为: ActionRow + suffix Slider；from/to/value 绑定，onValueChanged 回写。
- web 行为: 无设置页，无滑块行。音量虽有数值（audio.ts:85 bgmVolume，localStorage 持久化）但无 UI 滑块控件。
- 差异: —

### K13 Widgets::SpinRow
- 状态: 简化还原
- 原版: Fk/Widgets/SpinRow.qml:4 (ActionRow)
- web : apps/web/src/components/CreateRoomDialog.tsx:93-101 (Spin field −/input/+)
- 原版行为: ActionRow + suffix SpinBox；editable/from/to/value，onValueChanged 回写；不可编辑时点行无操作。
- web 行为: CreateRoomDialog 的「人数」字段实现了 −/number input/+ 步进器（:95-100，clamp 到 min/max），注释明指 mirrors QML SpinRow。覆盖步进+边界核心功能。但为对话框内联实现，非通用 ActionRow 行控件，无 editable 切换/点行语义。
- 差异: 仅建房对话框一处；非控件库复用；无 ActionRow 行外观。

### K14 Widgets::SwitchRow
- 状态: 简化还原
- 原版: Fk/Widgets/SwitchRow.qml:4 (ActionRow)
- web : apps/web/src/components/CreateRoomDialog.tsx:107-114 (checkbox 行)
- 原版行为: ActionRow + suffix Switch；value 别名 checked；点行 toggle checked。
- web 行为: CreateRoomDialog 的 label+`<input type="checkbox">` 行（:107 注释 mirrors QML SwitchRow），覆盖开关核心功能；受控 checked/onChange。为原生 checkbox 非 Switch 滑块外观，仅建房对话框一处，非通用行控件。
- 差异: checkbox 而非 Switch 样式；非控件库复用；无点整行切换。

### K15 Widgets::TapHandler
- 状态: 完全还原（平台等价）
- 原版: Fk/Widgets/TapHandler.qml:3 (TapHandler) — 禁穿透、接受左/右/无按钮、WithinBounds
- web : Web DOM 原生 onClick/onContextMenu 事件 + apps/web/src/table/useLongPress.ts
- 原版行为: 定制 TapHandler，grabPermissions=TakeOverForbidden 禁穿透，acceptedButtons 左/右/无键，gesturePolicy WithinBounds（仅在边界内释放才触发）。
- web 行为: web 用 DOM 事件模型，点击/右键/长按由 onClick、onContextMenu、useLongPress.ts 原生处理（事件冒泡/捕获即等价穿透控制）。QML TapHandler 的存在意义是统一处理 QtQuick 指针抢占，web 无此需求，平台等价覆盖。
- 差异: —

### K16 Widgets::TranslatedComboRow
- 状态: 未还原
- 原版: Fk/Widgets/TranslatedComboRow.qml:6 (ActionRow)
- web : 无
- 原版行为: ComboRow 变体，displayText/delegate 文本经 Lua.tr 翻译；自定义 popup(ListView+ItemDelegate, #21be2b 边框)；value↔model.indexOf 双向；点行展开。
- web 行为: 无此控件。web 的 `<select>`（K4）选项文本目前为硬编码中文（CreateRoomDialog gameMode），未走 tr 翻译下拉控件。
- 差异: —

### K17 Widgets::ViewSwitcher
- 状态: 未还原
- 原版: Fk/Widgets/ViewSwitcher.qml:7 (ListView)
- web : 无
- 原版行为: 横向胶囊式视图切换器（Adwaita ViewSwitcher 风），宽=项数*100，高亮 #C4C4C5 radius8 移动 200ms；delegate text 16px bold 居中；TapHandler 切 currentIndex。
- web 行为: 无横向 tab 切换控件。详情类弹窗（GeneralDetailModal/GameOverModal）未使用 tab 切换。
- 差异: —

---

## Base（13 个）

### K18 Base::AppUtil
- 状态: 完全还原（架构等价）
- 原版: Fk/Base/AppUtil.qml:7 (QtObject 单例) — enterNewPage/changeRoomPage/quitPage/showToast/setBusy
- web : apps/web/src/stores/roomRouting.ts（房间路由）+ stores/logStore.ts toast + App.tsx 状态路由
- 原版行为: 封装 Mediator.notify 的页面操作：进新页/换房间页/退页/showToast/setBusy(忙碌 UI)。
- web 行为: web 无 StackView 页栈，改用 connection status（App.tsx:24 online→Lobby）+ roomRouting 房间路由 + zustand store 切换场景；showToast 由 logStore.toast → Toast.tsx 渲染。等价覆盖页面切换与 toast。setBusy 见 K25/LoadingRoom。
- 差异: —

### K19 Base::Config
- 状态: 简化还原
- 原版: Fk/Base/Config.qml:6 (QtObject 单例, 240 行) — 全量客户端配置 + loadConf/saveConf(Cpp 落盘 JSON) + favoriteServers 增删
- web : apps/web/src/pages/LoginPage.tsx:43 (fk-uuid) / table/audio.ts:84-90 (fk-bgm-muted/volume) / apps/web/src/stores/disableSchemesStore.ts (fk-disable-schemes) localStorage 分散持久化
- 原版行为: ~80 项配置（窗口几何、lobbyBg/roomBg/bgmFile、language、各 hideUseless/autoTarget/doubleClickUse 等游戏偏好、favoriteServers、disableSchemes 禁将方案、enabledResourcePacks/UIPackages/Skins、screenName/password、serverMotd/features 等）；loadConf 从 Cpp.loadConf 读 JSON 带默认值，saveConf 回写。
- web 行为: web 仅持久化少数项到 localStorage（uuid、bgm 静音/音量、disableSchemes/currentDisableIdx）；服务端设置（motd/hiddenPacks/features/enabledPacks）由 serverManifestStore 接管（K27）；绝大多数游戏偏好（hideUseless/autoTarget/doubleClickUse/资源包/收藏服务器等）无对应——因 web 尚无设置页与完整偏好系统。
- 差异: 仅持久化 uuid/bgm/禁将方案；缺 ~90% 配置项与统一 loadConf/saveConf；无收藏服务器/完整偏好开关。
- 修复: 已修复并验证 (2026-06-13: 新增 disableSchemesStore 以 localStorage 持久化原版 disableSchemes/curScheme 核心结构并供 BanGeneralSetting/CreateRoom 使用；仍缺 Config 统一设置页和大量本地客户端配置项，因此维持简化还原计数)

### K20 Base::CppUtil
- 状态: 简化还原
- 原版: Fk/Base/CppUtil.qml:6 (QtObject 单例) — version/os/path/locale/debug 只读属性 + notifyServer/replyToServer/showDialog/quitLobby/loadTips/loadConf/saveConf/setVolume/volume/sqlquery
- web : apps/web/src/net/gatewayClient.ts:82 notify / :88 reply；table/audio.ts setVolume
- 原版行为: 引擎桥接：notifyServer(cmd,data)/replyToServer(data) 走 ClientInstance；showDialog/quitLobby/loadConf/saveConf 走 Backend；sqlquery 走 ClientInstance.execSql；暴露 version/os/path/locale/debug。
- web 行为: notifyServer→gatewayClient.notify(:82)；replyToServer→gatewayClient.reply(:88)；setVolume/volume→audio.ts。但 loadTips（载入加载提示）、sqlquery（本地 SQLite）、loadConf/saveConf（本地配置文件）、showDialog（原生对话框）、os/path/locale 等本地客户端能力 web 无对应。
- 差异: 仅 notify/reply/音量等价；缺 loadTips/sqlquery/loadConf/saveConf/showDialog/os-path-locale 本地桥接。

### K21 Base::DatabaseUtil
- 状态: 未还原
- 原版: Fk/Base/DatabaseUtil.qml:6 (QtObject 单例) — checkString(SQL 注入过滤)/tryInitModeSettings/getModeSettings/saveModeSettings
- web : 无
- 原版行为: 客户端本地 SQLite 存「游戏模式设置」：建表 gameModeSettings(key,value)，按模式名读/写 JSON，写前 checkString 过滤非法字符。
- web 行为: 无客户端本地数据库；模式设置无本地持久化（建房参数每次在 CreateRoomDialog 现填）。纯客户端本地功能，web 无对应。
- 差异: —

### K22 Base::FileSystemUtil
- 状态: 未还原（平台不适用）
- 原版: Fk/Base/FileSystemUtil.qml:6 (QtObject 单例) — exists(path) 带 existsCache
- web : 无（资源存在性改由 images.json/onError 回退处理）
- 原版行为: 封装 Backend.exists 的文件 stat，带 existsCache 缓存（避免重复耗时 stat），SkinBank 大量用它在多包路径中探测资源是否存在。
- web 行为: 浏览器无文件系统 stat。web 改用 skin.ts 的 images.json 清单（loadImageManifest，:30）预判资源存在 + `<img> onError` 链式回退选下一候选包，等价解决「资源是否存在」问题但机制完全不同；非通用 exists API。
- 差异: —（纯本地文件能力，平台不适用；功能由清单+onError 覆盖）

### K23 Base::LuaUtil
- 状态: 完全还原（架构等价）
- 原版: Fk/Base/LuaUtil.qml:6 (QtObject 单例) — call(fn,...)/fn(func)/evaluate(lua)/tr(src) 经 Backend 调 Lua
- web : apps/web/src/vm/clientVm.ts:568 translate / boot 内嵌 Lua + i18n/zh.ts:28 tr
- 原版行为: Lua 桥接：call 调具名 Lua 函数、evaluate 求值 Lua 表达式、tr 翻译、fn 生成调用闭包；mock 后端用于 qml-test。
- web 行为: web 在浏览器内跑真实 Lua VM（lua-native + clientVm），clientVm 直接 feedPacket/updateRequestUI/readPlayers 调用 Lua 逻辑，translate(:568) 批量经 Fk:translate 取翻译填入 i18n 缓存，tr(zh.ts:28) 查缓存。等价（且更直接）覆盖 Lua 调用与翻译。
- 差异: —

### K24 Base::Mediator
- 状态: 完全还原（架构等价）
- 原版: Fk/Base/Mediator.qml:4 (Item 单例) — commandGot 信号 + Backend.onNotifyUI 转发 + notify()
- web : apps/web/src/stores/vmStore.ts notifyUI sink + diag/notifyCommands.ts
- 原版行为: 全局事件总线：监听 Backend.onNotifyUI(command,data) 并转成 commandGot 信号广播给 RootPage/各页面分发。
- web 行为: web 中 clientVm 的 notifyUI 事件经 vmStore sink 分发到各 store（gameStore/popupStore/logStore...），notifyCommands.ts 为权威分类。等价的「后端通知→UI 分发」总线。
- 差异: —

### K25 Base::RootPage
- 状态: 简化还原
- 原版: Fk/Base/RootPage.qml:9 (W.PageBase, 333 行) — 顶层页面：背景图/字体/StackView/BusyIndicator+tips/错误提示(3 种)/Toast/Splash/命令回调注册(chat/serverMessage/updateAvatar/updatePassword/setServerSettings/...)
- web : apps/web/src/App.tsx + pages/LobbyPage.tsx + table/{Toast,LoadingRoom}.tsx + stores 各分发
- 原版行为: 应用根：lobbyBg 背景、三种字体 FontLoader、mainStack 页栈、busy 时 BusyIndicator+随机 tips（3.6s 轮换）+busyText 底栏、errDialog/errorMessage/errorDialog/errorPopup 三类错误、ToastManager、Splash(非 debug)；Component.onCompleted 加载 conf/tips 并注册 PushPage/PopPage/ShowToast/SetBusyUI/ErrorMsg/ErrorDlg/UpdateAvatar/UpdatePassword/SetServerSettings/AddTotalGameTime/UpdatePackage/BackToStart/Chat/ServerMessage 回调。
- web 行为: App.tsx 按 connection status 路由 Login/Lobby（无页栈）；Toast.tsx 渲染 toast；LoadingRoom.tsx 覆盖 busy/加载态（但无随机 tips 轮换、无 busyText 底栏）；错误经 logStore/toast。ShowToast/Chat/ServerMessage/SetServerSettings 等命令由对应 store 处理。缺：随机 tips 轮换、三类错误对话框区分、Splash（K30 未还原）、字体加载、UpdateAvatar/UpdatePassword/AddTotalGameTime/UpdatePackage 回调、背景图设置。
- 差异: 缺 tips 轮换/busyText 底栏/Splash/字体/头像-密码-总时长-下载等命令；错误仅 toast 不分三类对话框。

### K26 Base::SkinBank
- 状态: 完全还原
- 原版: Fk/Base/SkinBank.qml:11 (QtObject 单例, 257 行) — 各类资源目录常量 + searchPkgResource/getGeneralPicture/getCardPicture/getEquipIcon/getPhotoBack/getRolePic/getRoleDeathPic/getMarkPic/getAudio/... 资源解析
- web : apps/web/src/table/skin.ts（generalPic/cardPic/equipIcon/photoBack/rolePic/deathPic/magatama/markPicCandidates/suitPic/numberPic/...）
- 原版行为: 在多个包目录 + resource_pak 资源包中按 extension 查找武将/卡牌/装备图标/势力背景/身份/死亡/标记图片与技能/卡牌语音，带内置 fallback(unknown)。
- web 行为: skin.ts 完整对应：按 extension 拼 `/fk/packages/<ext>/...` 路径，generalPicCandidates/cardPicCandidates 实现多包候选 + onError 回退（等价多包搜索），images.json 清单剪枝，setArtPacks 从服务端 manifest 取 enabledResourcePacks 候选集，photoBack/rolePic/deathPic/magatama 等内置 chrome 带 unknown fallback。功能逐项覆盖。音频解析见 audio.ts。
- 差异: —

### K27 Base::SkinBank+Config::setServerSettings (服务端设置接收)
- 状态: 完全还原
- 原版: Fk/Base/RootPage.qml:211 (setServerSettings) — 解析 [motd,hiddenPacks,enabledFeatures] 写 Config，兼容旧版 bool enableBots
- web : apps/web/src/stores/serverManifestStore.ts
- 原版行为: SetServerSettings 回调把 motd/hiddenPacks/features(AddRobot/ChangeRoom) 写入 Config，兼容历史 data[2] 为 bool 的旧服务器。
- web 行为: serverManifestStore 解析 SetServerSettings 第 4 元素 manifest(enabledPacks/webFeatures/serverBuild/assetVersion)，并把 enabledPacks 喂给 skin.setArtPacks；features 同样支持。等价覆盖（且 web fork 扩展了 manifest）。
- 差异: —

### K28 Base::Splash
- 状态: 未还原
- 原版: Fk/Base/Splash.qml:8 (Rectangle, 207 行) — 启动动画
- web : 无
- 原版行为: 启动 Splash：logo+「FreeKill / Free Open Flexible」逐项淡入序列动画，「Press Any Key」呼吸闪烁，点击/按键 disappear（logo 左移+整体淡出），仅非 debug 时显示。
- web 行为: 无启动闪屏动画。web 进入直接 LoginPage。
- 差异: —

### K29 Base::Toast
- 状态: 完全还原
- 原版: Fk/Base/Toast.qml:5 (Rectangle) — 单条 toast：淡入(0→.9)/停留/淡出，finish 信号
- web : apps/web/src/table/Toast.tsx:13
- 原版行为: 单条吐司气泡，fadeTime300ms 淡入到 0.9 opacity、停留 (time-2*fade)、淡出，结束发 finish；圆角 16。
- web 行为: Toast.tsx 渲染 logStore.toast，TOAST_MS=2500 后自动隐藏（:11,:20），顶部居中半透明黑底气泡。覆盖「短时吐司+自动消失」核心功能。无显式淡入淡出动画（直接显隐）但行为等价。
- 差异: —（淡入淡出动画简化为显隐，功能等价，按完全还原计）

### K30 Base::ToastManager
- 状态: 简化还原
- 原版: Fk/Base/ToastManager.qml:7 (ListView) — 多条 toast 堆叠队列管理
- web : apps/web/src/table/Toast.tsx + stores/logStore.ts (单条 toast)
- 原版行为: ListView 自底向上堆叠多条 Toast，show(text,duration) insert(0,...)，displaced 位移动画，finish 时 remove。可同时显示多条。
- web 行为: web 仅保留并显示**最新一条** toast（logStore.toast 单值，Toast.tsx 按 toast.id 切换），无多条堆叠队列与位移动画。
- 差异: 仅单条（最新覆盖），无多 toast 堆叠队列/位移动画。

### K31 Base::Util
- 状态: 完全还原
- 原版: Fk/Base/Util.qml:6 (QtObject 单例) — convertNumber/getPlayerStr/processPrompt
- web : apps/web/src/table/processPrompt.ts (processPrompt+getPlayerStr) + stores/cardFaceStore.ts:52 (numberStr=convertNumber)
- 原版行为: convertNumber(1→A,2-10→数字,11-13→J/Q/K)；getPlayerStr(将名/副将/(你)，暗将→seat#)；processPrompt(冒号串：tr key + %src/%dest 换玩家名 + %arg/%argN 换译文)。
- web 行为: numberStr(cardFaceStore.ts:52) 1:1 对应 convertNumber(A/J/Q/K)；processPrompt.ts 注释明指 1:1 port，getPlayerStr(:12) 处理主/副将+self 后缀+暗将 seat 回退，processPrompt(:29) 同样 split ":" + tr + %src/%dest/%arg/%argN。逐项对应。
- 差异: —

---

## Components/Common 三按钮（3 个）

### K32 Common::MetroButton
- 状态: 简化还原
- 原版: Fk/Components/Common/MetroButton.qml:7 (Item, 99 行)
- web : apps/web/src/pages/LobbyPage.tsx:52-70 等内联 `<button>`
- 原版行为: Metro 风按钮：黑底白边白字 opacity0.8；hover 反色(白底黑字)；disabled opacity0.2；TapHandler 左/右键分发 clicked/rightClicked，longPressed→rightClicked；HoverHandler 指针手型；Row(icon+text 18px)。
- web 行为: Lobby/对话框用原生 `<button>`+styles，覆盖点击+悬停核心交互。但无统一 Metro 黑白反色/右键 rightClicked/长按/icon+text 抽象控件，外观与语义不同。
- 差异: 缺 Metro 黑白反色样式、rightClicked/longPressed 右键语义、icon 槽、disabled 0.2，非复用控件。

### K33 Common::MetroToggleButton
- 状态: 简化还原
- 原版: Fk/Components/Common/MetroToggleButton.qml:7 (Item, 89 行)
- web : apps/web/src/pages/LobbyPage.tsx:52 (BGM 开关 button) / CreateRoomDialog checkbox
- 原版行为: Metro 切换按钮：triggered 态边框+字 gold；hover 反色，hover+checked 金底黑字；disabled 0.2；点击 toggle triggered 并 clicked。
- web 行为: BGM 静音按钮(:52)是一个 toggle 按钮（🔇/🔊 切换 toggleBgmMuted），覆盖「切换态按钮」核心；CreateRoomDialog checkbox 亦切换语义。但无 Metro gold 高亮/hover 反色样式，非通用切换控件。
- 差异: 缺 Metro gold/反色视觉、统一 triggered 控件抽象。

### K34 Common::TileButton
- 状态: 未还原
- 原版: Fk/Components/Common/TileButton.qml:8 (Item, 178 行)
- web : 无
- 原版行为: 124x124 磁贴按钮（大厅主菜单风）：绿底+RectangularGlow 发光(hover/focus)；按下时按鼠标位置做 3D 倾斜旋转(±15°)或缩放0.95，松开复位并 clicked；icon 居中(SkinBank.tileIconDir)，左下角 label(autoHideText 时仅 hover 显示)；回车触发。
- web 行为: 无磁贴按钮。web 大厅为列表/普通按钮布局（LobbyPage），未实现 tileicon 磁贴主菜单及 3D 倾斜/发光交互。
- 差异: —

---

## 状态计数

| 状态 | 数量 | 序号 |
|------|------|------|
| 完全还原 | 9 | K7, K15, K18, K23, K24, K26, K27, K29, K31 |
| 简化还原 | 11 | K4, K6, K8, K13, K14, K19, K20, K25, K30, K32, K33 |
| 还原错误 | 0 | — |
| 未还原 | 14 | K1, K2, K3, K5, K9, K10, K11, K12, K16, K17, K21, K22, K28, K34 |
| 合计 | 34 | — |

### 未还原索引
K1 ActionRow, K2 ButtonContent, K3 ButtonRow, K5 CommonScrollBar, K9 PreferenceGroup, K10 PreferencePage, K11 SideBarSwitcher, K12 SliderRow, K16 TranslatedComboRow, K17 ViewSwitcher, K21 DatabaseUtil, K22 FileSystemUtil, K28 Splash, K34 TileButton

### 还原错误索引
（无）

### 备注
- K5/K22 属「平台等价覆盖但无对应控件」：CommonScrollBar 由浏览器原生滚动条覆盖功能、FileSystemUtil.exists 由 images.json 清单 + onError 回退覆盖；按规则（纯客户端本地功能/无 web 控件）计未还原。
- 未还原集中在两类：① 设置/偏好页控件族（ActionRow/PreferenceGroup/PreferencePage/SideBarSwitcher/SliderRow/TranslatedComboRow/ViewSwitcher）——web 尚无设置页；② 大厅主菜单磁贴/启动闪屏（TileButton/Splash）与本地数据库（DatabaseUtil）。
