# Phase I 审计 — 聊天/弹幕/日志/倒计时

逐行对照原版 (37f8c12/v0.5.20) 与 web。

原版根：`FreeKill-sourcecode/`  web 根：`freekill-web/apps/web/src/`

---

## A. 大厅聊天 (Lobby Chat)

### I1 LobbyChat::文本消息渲染
- 状态: 简化还原
- 原版: `Fk/Pages/Lobby/Lobby.qml:161` (ChatBox)、`Fk/Components/Common/ChatBox.qml:13` (append→LogEdit)
- web : `apps/web/src/components/ChatBox.tsx:6` (ChatBox)
- 原版行为: ChatBox 内嵌 LogEdit(富文本 TextEdit, RichText, 16px)；每条 `chatLogBox.append({logText})`，整行就是 `msg`(已含 userName 前缀与 emoji `<img>`)；高亮当前行(`#EEEEEE` 圆角)；"回到底部"按钮；自动滚底；左下角表情面板(59 图)与语音面板(fastchat 1..23)。
- web 行为: 纯文本两段式渲染 `who: text`(`who` 青色加粗)；纯 `overflowY:auto`，无 RichText、无 emoji 图、无高亮行、无"回到底部"按钮、无表情/语音面板。
- 差异: 仅纯文本；缺 emoji `{emojiN}`→`<img>` 替换、缺表情选择器、缺语音(fastchat)选择器、缺富文本/高亮/回到底部。

### I2 LobbyChat::发送输入框
- 状态: 简化还原
- 原版: `Fk/Components/Common/ChatBox.qml:259-318` (RowLayout: TextField + 🗨️语音 + 😃表情 + ✔️发送)
- web : `apps/web/src/components/ChatBox.tsx:30-33`
- 原版行为: 输入框 maximumLength 300；🗨️语音钮、😃表情钮、✔️发送钮；发送 `notifyServer("Chat",{type:1,msg})`；`opTimer` 1.5s 防刷(发送/语音钮禁用)。
- web 行为: 单 input + "发送"钮，提交 `notify('Chat',{type:1,msg})` type=1 正确。
- 差异: 无 maxLength(300)；无表情/语音钮；无 1.5s 防刷节流。

### I3 LobbyChat::系统消息/错误
- 状态: 完全还原
- 原版: `Fk/Base/RootPage.qml:287` (sendDanmu `<font color="grey"><b>[Server] </b></font>`+data)、错误经 ErrorDlg
- web : `apps/web/src/stores/index.ts:442-453` (ErrorMsg/ErrorDlg → `{who:'系统', text:'错误: …'}`)
- 原版行为: 服务器消息以灰色 `[Server]` 前缀进聊天+弹幕；错误对话框。
- web 行为: ErrorMsg/ErrorDlg 注入聊天行 `系统: 错误: …`(IG-7 还含顶号 kick 处理)。语义等价；颜色样式差异属 I1 富文本缺失，不重复计。

---

## B. 房间内聊天 (Room Chat / IG-5)

### I4 RoomChat::历史滚动文本
- 状态: 简化还原
- 原版: `Fk/Pages/Common/RoomPage.qml:477` (AvatarChatBox)、`Fk/Components/Common/AvatarChatBox.qml:14-31,160-174`
- web : `apps/web/src/table/RoomChatPanel.tsx:51-60`、`apps/web/src/stores/roomChatStore.ts`
- 原版行为: AvatarChatBox 用 LogEdit + 自定义 `avatarDelegate`(每行: Avatar 头像 36×36 + 用户名+将名+时间灰括号 + 圆角气泡 isSelf=lightgreen/他人=lightsteelblue，左右对齐分自他)；append 解析 `__server`/`__observer`/将名头像。
- web 行为: 折叠面板，每行纯 `userName: msg`(userName 青色)；CAP 200；observing 时显"不能发言"。无头像、无时间戳、无将名、无自/他气泡左右分色对齐。
- 差异: 缺头像/时间/将名/气泡分色/左右对齐(头像气泡式聊天降级为单行文本流)。

### I5 RoomChat::发送+表情+语音面板
- 状态: 简化还原
- 原版: `Fk/Components/Common/AvatarChatBox.qml:177-318`
- web : `apps/web/src/table/RoomChatPanel.tsx:30-41,65-69`
- 原版行为: TextField(maxLength 300) + 🗨️语音(非大厅可见, 载入 Self 将技能音/胜利!阵亡~/fastchat) + 😃表情(59) + ✔️发送; type=2; opTimer 1.5s。
- web 行为: input + 发送钮(type=2 正确) + 🎁送礼钮。无 maxLength、无表情面板、无语音(技能/胜负/fastchat)面板、无 1.5s 节流。
- 差异: 缺表情、缺语音/技能音选择、缺节流、缺 maxLength。

### I6 RoomChat::送花砸蛋 (Present)
- 状态: 完全还原
- 原版: `Fk/Pages/Common/RoomPage.qml:581-625` (specialChat `@`)、`Fk/Pages/Common/WaitingRoom.qml:364` givePresent；类型 Flower/Egg/GiantEgg/Shoe/Wine
- web : `apps/web/src/table/RoomChatPanel.tsx:37-41`、`apps/web/src/stores/roomChatStore.ts:36-46` (parsePresent)、`apps/web/src/stores/vmStore.ts:233-243`
- 原版行为: 发送 `$@<Type>:<pid>`；收到 `@` 前缀→飞行动画(sender→target ChatAnim)，不显文本；`Config.hidePresents` 可隐藏。
- web 行为: givePresent 发 `$@${type}:${pid}`(5 类型全)；handleChat 识别 `$@` → pushScene present 飞行，`$@` 永不当文本显示。类型集一致。
- 差异: (无) 唯 `hidePresents` 偏好缺失，属配置项不计入本元素。

### I7 RoomChat::气泡浮于头像 (ChatBubble)
- 状态: 简化还原
- 原版: `Fk/Components/GameCommon/ChatBubble.qml:5-47`、`Fk/Components/LunarLTK/PhotoBase.qml:216`、`RoomPage.qml:707-708` (photo.chat)
- web : `apps/web/src/table/Photo.tsx:256-266` (PhotoChatBubble)
- 原版行为: `#F2ECD7` 米色圆角(radius 4)气泡，淡入 200ms→保持 2500ms→淡出 150ms(SequentialAnimation, opacity 0→0.9→0)，WrapAnywhere，libian 字体 15px；`photo.chat(raw.msg)` 触发。
- web 行为: 白底圆角气泡(`#fff`), 浮于头像顶部, 2850ms 后清除(= 200+2500+150)。无淡入/淡出 opacity 动画(直接显隐)、底色非米色、字体非 libian。
- 差异: 仅缺淡入淡出动画与配色/字体；时序总长一致。

### I8 RoomChat::旁观者聊天进弹幕
- 状态: 还原错误
- 原版: `Fk/Pages/Common/RoomPage.qml:683-709` (addToChat)
- web : `apps/web/src/stores/vmStore.ts:233-249` (handleChat)
- 原版行为: 房内聊天若 sender 无 photo(旁观者)→`danmu.sendLog("user: msg")` 走弹幕，不挂气泡；有 photo→挂 `photo.chat` 气泡；`Config.hideObserverChatter` 可屏蔽无 photo 者。emoji `{emojiN}` 替换为 `<img height=16>`。
- web 行为: 所有聊天一律 `roomChatStore.append`→进面板列表并对 `sender` 挂气泡，不区分有无 photo，无弹幕通道，旁观者消息错误地挂到 `bubbles[sender]`(旁观者无座位→气泡无处显示但仍占 bubble 槽)。无 emoji 替换。无 hideObserverChatter。
- 差异: 旁观者消息应进弹幕却进了气泡/面板；缺弹幕分流；缺 emoji 替换；缺 hideObserverChatter。

---

## C. 弹幕 (Danmu)

### I9 Danmu::滚动弹幕组件
- 状态: 未还原
- 原版: `Fk/Components/Common/Danmu.qml:5-81`；用例 `Lobby.qml:415`、`RoomPage.qml:548`、`RootPage.qml:287`
- web : 无
- 原版行为: 顶部 900×20 黑底半透条(opacity 0.7)；文字 18px libian 白色 RichText 从右向左滚动(duration=(width+txtWidth)*5)；stashedTxt 队列, newTxtAvailable 错峰避免重叠；用于大厅聊天、房间旁观者聊天、Server 广播、胜负公告。
- web 行为: 全无弹幕系统。大厅聊天(I1)与旁观者聊天(I8)在原版均会进弹幕，web 缺整条通道。
- 差异: 整组件未实现。

---

## D. 战报/游戏日志 (GameLog)

### I10 GameLog::日志行渲染(颜色/富文本)
- 状态: 简化还原
- 原版: `Fk/Pages/LunarLTK/Room.qml` LogEdit(经 `Fk/Components/Common/LogEdit.qml:36-47`)
- web : `apps/web/src/table/GameLogPanel.tsx:19-44`、`apps/web/src/stores/logStore.ts`
- 原版行为: LogEdit 内 TextEdit RichText 16px, WrapAnywhere；`parseMsg` 产出的 `<font color><b>` 标记原样渲染；选词 selectByKeyboard；当前行高亮 `#EEEEEE` 圆角；自动滚底；"回到底部"按钮。
- web 行为: VM `notifyUI("GameLog",html)`→push 环形缓冲(CAP 200)；面板 `dangerouslySetInnerHTML`(sanitize 去 script/on*)渲染同一份 HTML 富文本(颜色/加粗保留, 链接同 HTML)；自动滚底(scrollTop)。默认折叠，无高亮行、无选词、无"回到底部"按钮、无折叠展开内每条折叠。
- 差异: 富文本/颜色还原；缺当前行高亮、缺"回到底部"按钮、缺逐行选择；折叠粒度为整面板(非逐行)。

### I11 GameLog::历史回放预置 (reconnect)
- 状态: 完全还原
- 原版: 重连战报回放(clientbase 重发日志)
- web : `apps/web/src/stores/logStore.ts:24` (prepend)
- 原版行为: 重连后旧日志在前补入。
- web 行为: `prepend(htmls[])` 将旧行前置, slice 限 CAP 200。
- 差异: (无)

---

## E. 即时提示 (Toast / Prompt)

### I12 Toast::瞬时提示横幅
- 状态: 完全还原
- 原版: `clientbase.lua:567` (toast=true→notifyUI ShowToast)、源 showToast (RootPage/AppUtil)
- web : `apps/web/src/table/Toast.tsx:13-30`、`apps/web/src/stores/logStore.ts:25` (showToast)
- 原版行为: 顶部短时横幅, 富文本, 约 2.5s 自动消失。
- web 行为: notifyUI("ShowToast",html)→logStore.toast；Toast 顶部 80px 居中, PromptText 富文本渲染, 2500ms 自动隐藏。
- 差异: (无) 时长 2500ms 与原版一致。

### I13 Prompt::请求提示文字(富文本)
- 状态: 简化还原
- 原版: `Fk/Pages/LunarLTK/Room.qml:368-380` (prompt Text, RichText, libian 16px, `#F0E5DA` 描边 `#3D2D1C`, 锚定 progress 上方, visible=progress.visible)
- web : `apps/web/src/table/PromptText.tsx:22-24`、用例 `apps/web/src/table/RequestPopup.tsx:65,79,97,119,138`
- 原版行为: 倒计时进行(progress 可见)时, 棋盘中央 progress 条上方独立一行富文本提示(`<br/><b><font>` 渲染)；带描边样式；与 OK/Cancel 同位。
- web 行为: PromptText 富文本(sanitize+dangerouslySetInnerHTML)只在 RequestPopup 模态标题内渲染；无棋盘中央、progress 上方的独立常驻提示行；无描边样式。
- 差异: prompt 仅出现在弹窗模态里, 缺原版 progress 上方的中央常驻 prompt 文本行(及描边样式)。

---

## F. 倒计时 (Countdown)

### I14 Countdown::进度条视觉
- 状态: 完全还原
- 原版: `Fk/Pages/LunarLTK/Room.qml:382-415` (ProgressBar 宽 60%, 高 12, 黑底 radius6, orange→red→red→orange 渐变 0/.3/.7/1)
- web : `apps/web/src/table/CountdownBar.tsx:50-56,63-67`
- 原版行为: 黑底圆角轨道, 渐变填充条由满→0 收缩; 锚定 okCancel 上方 +4。
- web 行为: 黑底 radius5 轨道 + 同四段 `linear-gradient(orange0/red30/red70/orange100)` 填充, rAF 逐帧 width=frac*100%; 居中 bottom166。宽度改为固定 420px(注释说明因 stage 缩放, 属合理偏移)。渐变/收缩/位置语义一致。
- 差异: (无视觉缺口；宽度自适应偏移已注明)

### I15 Countdown::剩余秒数读出
- 状态: 完全还原 (web 增强)
- 原版: 无数字读出(仅进度条)
- web : `apps/web/src/table/CountdownBar.tsx:48,54` (`{secsLeft}s`)
- 原版行为: 原版仅条无数字。
- web 行为: 额外显示 `Math.ceil(totalMs*frac/1000)s` 数字。属 web 主动增强(memory 记录"倒计时数字"为需求), 非缺口。
- 差异: (无；web 增项)

### I16 Countdown::激活/复位状态机
- 状态: 简化还原
- 原版: `Fk/Pages/LunarLTK/Room.qml:101-119,730-733` (notactive→active: 读 Backend.getRequestData timeout/timestamp, progressAnim.from=(1-elapsed/total)*100, duration=total-elapsed; activate() 每次请求先 notactive 再 active 强制重启)
- web : `apps/web/src/stores/timerStore.ts:46-68` (activate/setServerWindow/deactivate)、`CountdownBar.tsx:27-45`
- 原版行为: 每个需要 UI 的请求 activate() 重启倒计时；窗口来自服务器 timeout/timestamp(已含 elapsed 补偿)；到期 progressAnim.onFinished→state=notactive→finishRequestUI。
- web 行为: activate() 复用 setServerWindow 捕获的服务器窗口(timestamp+totalMs 绝对时间, 含 elapsed 补偿), 缺失时回退固定 30s(TIMEOUT_SEC); deactivate 隐藏; 到期 rAF f<=0→deactivate+interaction/popup clear+finishRequestUI(不向服务器回复, 与原版一致)。
- 差异: 服务器窗口存在时与原版等价；仅在窗口缺失时退化为固定 30s(原版无此回退, 但属跨时钟边界的有意取舍, 已在注释说明)。判简化系因固定回退非逐位等价。

### I17 Countdown::到期清理 (finishRequestUI)
- 状态: 完全还原
- 原版: `Room.qml:67-98` (→notactive Transition: 清 prompt/okCancel/按钮/进度/photo state, finishRequestUI, applyChange{})
- web : `apps/web/src/table/CountdownBar.tsx:33-39`
- 原版行为: 到期/取消 进入 notactive, 调 Ltk.finishRequestUI + 复位所有交互态。
- web 行为: 到期 deactivate + interactionStore.clear + popupStore.clear + vm.finishRequestUI()。覆盖交互/弹窗/VM 清理。
- 差异: (无)

---

## G. 头像 (Avatar — 聊天用)

### I18 Avatar::聊天头像
- 状态: 简化还原
- 原版: `Fk/Components/Common/Avatar.qml:5-70` (Image: getGeneralExtraPic avatar/ ?? getGeneralPicture; sourceClipRect 大图裁 61,20,128,128; detailed 时显包名/将名标签; 1px 边框)、AvatarChatBox 内 36×36
- web : 无独立组件；房间气泡(I4)与 Photo 用 `generalPicCandidates`(`apps/web/src/table/Photo.tsx:229-242`)
- 原版行为: 聊天行头像走 Avatar(extraPic 小图优先/否则大图裁剪), `__server`/`__observer` 特殊头像。
- web 行为: RoomChatPanel 聊天行根本无头像(见 I4); Photo 自身有 Portrait 但非聊天头像; 无 `__server`/`__observer` 头像处理。
- 差异: 聊天上下文无头像渲染；缺 extraPic 裁剪逻辑与 server/observer 特殊头像。

---

## 状态计数表 (共 18 元素 I1–I18)

| 状态 | 数量 | 序号 |
|------|------|------|
| 完全还原 | 7 | I3, I6, I11, I12, I14, I15, I17 |
| 简化还原 | 9 | I1, I2, I4, I5, I7, I10, I13, I16, I18 |
| 还原错误 | 1 | I8 |
| 未还原 | 1 | I9 |

(I15 为 web 主动增强，归入完全还原。)

## 未还原 / 还原错误 索引
- 未还原: **I9** (弹幕 Danmu 整组件)
- 还原错误: **I8** (旁观者聊天应进弹幕却进气泡/面板, 且缺 emoji 替换)
