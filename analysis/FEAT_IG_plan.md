# 局内体验四项 · 实现计划(FEAT-IG)

> 用户验收 PACE 后提出的 4 项局内/开局体验功能。本计划严格"先读后写":每项已派只读 Explore 通读 freekill 源码核实机制(file:line 见下),照搬原版语义,不自创。
>
> 关联现有路线:这 4 项此前**只在 WEB_ONLY_ROADMAP P2(W2-1/W2-2 笼统"禁将/房间预设")提过一句**,无源码级规划。本计划补齐,并把条目挂入路线图 P1/P2。

## 调研结论速览(原版机制,已核实)

### ① 身份猜测标注(RoleComboBox)
- **原版已有**,纯客户端本地标注,不发服务器。`RoleComboBox.qml:7-52`:身份显示为 `unknown` 时点击 icon 弹出竖排 4 选 1(`unknown/loyalist/rebel/renegade`),选中回显在 icon 上。`options`=`["unknown","loyalist","rebel","renegade"]`(无 lord——主公身份恒公开,不会是 unknown)。
- 公开判定:`Photo.qml:285-296` → `role==="hidden"`(国战隐藏整个组件)→ `role_shown` → `Ltk.roleVisibility(pid)`(`client_util.lua:1192` = `Self:roleVisible(target)`)。web 已有 `roleVisible`/`role_shown` 镜像(M5-a 标记区时做的 G3)。
- 图标:`image/photo/role/<role>.png`(web `skin.rolePic` 已有)。持久化:无,刷新即丢。
- **web 现状**:Photo 渲染了 `rolePic(shownRole)` 但**无点击猜测交互**。

### ② 玩家详情看装备/判定牌(含虚拟牌原牌)
- 入口 `Photo.qml:281` 右键 → `PlayerDetail.qml`。详情页把技能 + **装备区/判定区可见牌**渲染进一个富文本框(`PlayerDetail.qml:291-312`):对每张 `getPlayerEquips ∪ getPlayerJudges` 的可见牌,`cardVisibility(cid)` 真才显示;调 `getVirtualEquipData(id,cid)` —— 有虚拟牌则显示 `(原牌名+花色+点数)虚拟名: 描述`,否则 `牌名(花色点数): 描述`。**没有独立卡牌详情弹窗**,全是富文本行。
- 虚拟牌原牌:`GetVirtualEquipData`(`client_util.lua:483-508`)返回 `{name, cid=subcards[1], suit, number, type, subtype}` —— 例如大乔乐不思蜀的原牌 id+花色点数。**web 已有 `virtualEquipNames` 桥**(MoveBoardBox 用),但只取 name,没取 suit/number/原牌。
- 描述文本:`Lua.tr(":"+cardName)`(卡牌技能描述翻译键)。
- **web 现状**:`GeneralDetailModal` 只显示武将立绘 + 可见技能(`GetPlayerSkills`),**完全没有装备/判定牌区**。

### ③ 局内聊天 + 送花/砸蛋
- 协议:`Chat` 命令,`{type, msg}`。**type=1 大厅 / type=2 房间**(`ChatBox.qml:94/124`)。asio `roombase.cpp:33-99` 路由:禁言/敏感词/截断 300 字 → type=1 广播大厅、type=2 广播房间玩家+旁观者。客户端 `clientbase.lua:375` `ClientBase:chat` 补 general/userName/time → `notifyUI("Chat", data)`。
- 送花/砸蛋:**特殊聊天消息**,`msg="$@<Type>:<pid>"`,Type ∈ `Flower/Egg/GiantEgg/Shoe/Wine`(`WaitingRoom.qml:226 givePresent`)。收到后 `RoomPage.qml:581 specialChat` 解析 → 从 from photo 飞向 to photo 播 `ChatAnim/<Type>.qml`(飞行 360ms + 音效 `fly[1-2]` + 命中 `flower[1-2]` + star 特效)。资源 `image/anim/<type>/`(正是 PACE 见过的 chat-anim 命名帧 egg/flower/shoe/wine + star)。
- 权限:旁观者/死亡玩家不能发(`visible: !observing`)。
- **web 现状**:大厅 `ChatBox.tsx` 已完整(type=1);**房间内聊天 + 送花/砸蛋完全没有**(无 type=2 处理、无气泡、无 ChatAnim)。

### ④ 开局前设置 + 手气卡
- CreateRoom settings 完整字段(`lunarltk/init.lua:3-51` 默认值):`_game.generalNum`(选将数 3-18,默认3)、`generalTimeout`(选将超时 10-60,默认15)、`luckTime`(手气卡次数 0-8,默认0=禁用)、`enableFreeAssign`/`enableDeputy`/`enableObserverViewCard`(bool);顶层 `timeout`(操作思考时间,CreateRoom 第3参,QML UI 10-60 取 `Config.preferredTimeout`)、`disabledPack[]`、`disabledGenerals[]`(武将名数组)。
- 起手手牌固定 4(`gameflow.lua:109`),非配置项;"手牌扩展"实际指 `generalNum`(选将数)等。
- **手气卡流程**(`gameflow.lua:98-157` + `request.lua:156-171`):开局摸 4 张后,若 `luckTime>0` 对每人发 `AskForSkillInvoke`(data=`["AskForLuckCard","#AskForLuckCard:::剩余次数"]`);玩家点 OK(reply≠cancel)→ luckTime-1、弃旧牌摸新牌,若还有次数重发请求;点 Cancel → 用现有牌。**协议上手气卡 = AskForSkillInvoke**(web 已走 InteractionBar OK/Cancel 处理),所以只要建房传 `luckTime>0` + 提示本地化,手气卡基本可用。
- **web 现状**:`CreateRoomDialog` 全部硬编码(`luckTime:0`=手气卡禁用、timeout=90、generalNum=3、disabled* 空),无任何配置 UI。

---

## 切片拆分(每片自验通过即 commit;push 经用户许可)

> 复杂度/价值排序:④a 建房设置(纯前端表单,价值高、依赖少)→ ④b 手气卡验证 → ① 身份猜测(小、自包含)→ ② 详情补装备/判定(中,复用现有桥)→ ③ 局内聊天+送花(最大,新通道+动画)。

### IG-1 · 开局前设置面板 ✅(④a,纯前端表单,无服务端改动)
建 `CreateRoomDialog` 的设置项:思考时间(`timeout` 滑块/输入 10-120,默认沿用 90)、选将数(`generalNum` 3-?)、选将超时(`generalTimeout` 10-60)、手气卡次数(`luckTime` 0-8)、enableDeputy/enableFreeAssign 开关。照搬 QML `RoomGeneralSettings.qml`/`CreateRoom.qml` 字段范围与默认。值写入既有 settings 结构对应字段(协议已通,只是从硬编码改成可填)。
- **自验**:真 asio 建房带非默认 `generalNum`/`timeout`,VM 收到生效(选将数变化、超时窗口变化);typecheck/build/web 测试绿。

### IG-2 · 手气卡可用 ✅(④b)
基于 IG-1 能传 `luckTime>0`。核实手气卡请求在 web 端的呈现:`AskForLuckCard` 是 `AskForSkillInvoke`(InteractionBar OK/Cancel),需把 prompt `#AskForLuckCard:::N` 本地化(i18n "你想使用手气卡吗?还可使用 %arg 次")+ 确认 OK→换牌、Cancel→保留 的回路在 web 真打通(摸到新起手牌)。
- **自验**:真 asio 开 `luckTime=2` 起一局,开局收到手气卡询问,点"使用"→起手牌变化、次数递减;点"取消"→保留。lua-native 或双 WS E2E 验证换牌。

### IG-3 · 身份猜测标注 ✅(①,纯客户端本地状态)
照搬 `RoleComboBox.qml`:Photo 的身份 icon 在 `shownRole==="unknown"`(且非 hidden/国战)时可点,弹竖排 4 选 1(unknown/loyalist/rebel/renegade,用 `skin.rolePic`),选中存**本地 store**(per-room、per-pid,新建轻量 `roleGuessStore` 或并入 detailStore),回显在 icon。不发服务器、回房/重连清空(并入既有 resetForNewGame)。
- **自验**:web 单测(store 标注/清空);浏览器点未公开身份玩家弹框选反贼→icon 显示反贼图;主公/已公开/自己不可猜;国战模式隐藏。

### IG-4 · 玩家详情补装备/判定牌 ✅(②,复用现有桥)
在 `GeneralDetailModal` 武将技能下方,照搬 `PlayerDetail.qml:291-312` 增"装备/判定牌"段:读该 pid 的 `equipCids ∪ judgeCids`(gameStore 已镜像),逐张 `cardVisibility` 真才显示;扩展 VM 桥:① `__fkCardVisibility(cid)`;② `virtualEquipNames` 扩展返回 `{name,cid(原牌),suit,number}`(现只返 name);卡面+花色点数+ 技能描述(`tr(":"+name)`,VM translate)。虚拟牌显示"(原牌名 花色 点数)虚拟名: 描述"。
- **自验**:lua-native 对真 VM 断言 `GetVirtualEquipData` 返回原牌 cid/suit/number(用一张转化的延时锦囊场景);浏览器右键有乐不思蜀的玩家详情,见原牌花色点数 + 描述。

### IG-5 · 局内聊天 + 送花/砸蛋 ✅(③,最大,分两小步)
- **IG-5a 房间内文字聊天**:in-room 路由处理 `Chat` type=2(`index.ts` 现仅 type=1 落 lobbyStore);新建 roomChatStore + 牌桌 ChatBox(复用大厅 `ChatBox.tsx` 抽共用,`isLobby` 区分 type)+ Photo 聊天气泡(`ChatBubble.qml`:渐显 200ms/停 2.5s/渐隐 150ms);发送 `notify('Chat',{type:2,msg})`;emoji `{emojiN}`→`/fk/image/emoji/N.png`;旁观/死亡不可发。
- **IG-5b 送花/砸蛋**:Photo 右键菜单/快捷键发 `$@<Type>:<pid>` 特殊消息;收到 type=2 且 `msg` 以 `$@` 开头→解析 Type+目标→从 from photo 飞向 to photo 播动画(WAAPI 飞行 + star),复用 PACE 的 animationStore scene 通道范式;资源 `image/anim/<type>/`(确认 sync 已含 chat-anim 帧)+ 音效 `fly/flower` 预取(复用 PACE-2 warm)。
- **自验**:双 WS 客户端 A 发房间聊天/送花给 B,B 收到气泡/飞行动画;旁观者发送被拒;真 asio 验证 type=2 广播路径。

### IG-6 · 选将页右键/长按看武将技能 ✅(用户追加)
- **目标**:AskForGeneral 选将框里,右键(桌面)/长按(移动端)候选武将→看该武将技能描述。
- **核实结论(已读源码)**:原版 `ChooseGeneralBox.qml:175` 的 `onRightClicked` 只做 FreeAssign 作弊,**不是看技能**;看技能走 `GeneralsOverview`/`GeneralDetailPage`,调 **`GetGeneralDetail(name)`**(`client_util.lua:27-64`)按**武将名**返回 `{kingdom,hp,maxHp,skill:[{name,description,is_related_skill}],...}`——与现有按 player id 的 `GetPlayerSkills` 不同(选将时还没有 player)。所以这是"web 友好增强",数据源照搬 `GetGeneralDetail`。
- **改动**:① 新 VM 桥 `__fkGeneralDetail(name)` + `clientVm.generalDetail(name)`(照搬 `GetGeneralDetail`,返回技能数组);② 选将候选 `GeneralCard` 接 `useLongPress`(已有,450ms)+ `onContextMenu`;③ 复用/改造 `GeneralDetailModal` 支持"按武将名"模式(现仅按 pid)——加一个 `generalName` 入口,技能走 `generalDetail` 而非 `playerSkills`,武将立绘已有 `GeneralCard`。
- **自验**:lua-native 对真 VM 断言 `GetGeneralDetail("caocao").skill` 含奸雄+描述;浏览器选将框长按/右键候选武将弹技能。低风险、自包含。

### IG-7 · 修复:同账号顶号"反向踢"(用户报 bug,先复现再修)
- **现象**:同账号在新客户端登录,**新的反被老的踢出**(期望:新顶旧)。
- **已核实(见 memory `same-account-takeover-bug`)**:fork `auth.cpp:471-496` 的 takeover 两支(局内 `reconnect` / 大厅 `takeoverInLobby`)**方向都正确(新接管、踢旧)**;网关按 **uuid** park 老连接 25s,uuid 存 localStorage **同浏览器复用、不同客户端不同**。**真因未坐实,禁止盲改**。
- **第一步必须真机复现**(实现纪律 5):写 `takeover-probe.mjs`,两 WS 同账号**不同 uuid**,B 在 A 在线时登录,记录谁收 `ErrorDlg`/断线、谁留大厅;再测 A 先刷新 park 再 B 登录。据复现锁定真实路径(候选:park 断开回调与新 takeover 时序、asio `setSocket` 后旧 socket `onDisconnected` 误标新 player Offline、网关 asio close 误关新 ws)。
- **再按真因最小修复**,不动正确的 takeover 主路径。可能在网关(park 命中时主动 close 旧 asio 而非仅解绑)或 fork(setState/onDisconnected 时序)。
- **自验**:复现脚本从"新被踢"转为"旧被踢、新进大厅",且不回归刷新重连(refresh-test)与局内 reconnect。

### IG-8 · ~~VPS 扩展包武将立绘+名称不显示~~ **误报,已撤(2026-06-11)**
- 用户后续确认:VPS 扩展包武将立绘+名称**实际正常**,此前为误报。本项取消,不实现。
- **保留的真实改进(可选,非紧急)**:调研中发现 `sync-fk-assets.mjs:162` generals copyImages 没传 `record=true` → 武将立绘不进 `images.json` → `verify-fk-assets.mjs`/`enumerate.ts` 不校验武将立绘(缺失会静默放过,gamebg 当初同款盲区)。若日后要收紧部署校验可补上;当前不阻塞,留作 backlog。


---

## 风险与边界
- **IG-1/2 纯前端协议已通**:settings 字段服务端早在解析,只是 web 没暴露 UI;手气卡协议 = AskForSkillInvoke 已处理,低风险。禁包/禁将的**完整选择器 UI**(需武将/包列表)较重,IG-1 先做数值项,禁将并入 P2/W2-2(与"房间预设保存"一起,用 globalSaves)。
- **IG-3 身份猜测**:纯本地、零协议,最低风险;注意国战 `hidden` 与主公恒公开的边界(照搬判定,别自创)。
- **IG-4**:虚拟牌"原牌"必须走 `GetVirtualEquipData.subcards[1]`,别自己从 cid 猜(照搬纪律)。`cardVisibility` 决定可见性,不可见的牌只计数不显(照搬 PlayerDetail unknownCardsNum)。
- **IG-5 最重**:新出站通道(房间聊天/present)+ 动画。送花动画复用 PACE animationStore scene + WAAPI 范式,别新造动画系统。敏感词/禁言由服务端管,web 不重复。
- **资源**:emoji 59 张 + chat-anim 帧 + present 音效需确认 sync 已纳入 `/fk`(W1-RES 的 enumerate/verify 应已覆盖 anim;emoji 需查)。

## 验证总纲(实现纪律 5)
每片:WSL 真 asio + gateway + vite 自起;能 E2E 的(手气卡换牌、房间聊天广播、送花)用双 WS 或 captured 验证;VM 桥类(虚拟牌原牌/cardVisibility)对真 VM 断言;浏览器眼见。收尾 `/sync`。
