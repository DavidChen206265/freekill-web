# Phase P — 协议契约一致性 (client.lua ↔ gateway ↔ asio)

审计对象：server→client 命令是否完整到达 wasmoon client.lua；client→server 上报是否完整；
握手/登录契约；编码/字段/时序语义偏差。

**核心架构结论（先行）**：web 的 gateway 是一个**纯透传 CBOR↔Envelope 桥**，它**不按命令名分派**、
不丢弃也不改写任何 server→client 命令。`asio-client.ts:onPacket`（117-155）在握手完成后对**所有** packet
无条件 `emit('packet')`；`ws-bridge.ts:forward`（103-113）对**所有** packet 无条件 `packetToEnvelope` →
`ws.send`。因此 70 个 server→client 命令**作为一个整体**全部到达浏览器，再由 `vmStore.feed`（555）把原始
CBOR（envelope.raw）喂进 `ClientCallback`（clientVm.ts:`__fkFeed` 446/483），由**原版 client.lua 的
addCallback 注册表**处理。即：协议透传层对所有命令是完全还原；命令是否产生正确 UI 效果属于其它 Phase（D/E/F/G…）的范畴，本 Phase 只核对“是否到达 + 语义是否被改写”。

下文先逐项核对透传层（按命令族归类，给依据），再逐项核对 client→server 上报（逐条列名），再核对握手/登录与编码/字段/时序。

---

## 一、server→client 命令到达性（70 个 addCallback）

### P1 透传层::全部 server→client notify/request 命令
- 状态: 完全还原
- 原版: lua/client/clientbase.lua:18-49 (27 个 addCallback) + lua/lunarltk/client/client.lua:29-67 (38 个 addCallback)；`ClientBase:addCallback`(54-59) 注册到 `self.callbacks[command]`
- web : apps/gateway/src/asio-client.ts:117-155 (onPacket) | apps/gateway/src/ws-bridge.ts:103-113 (forward) | apps/web/src/stores/index.ts:374-390 (inRoom 分支 feedVmOrdered) | apps/web/src/stores/vmStore.ts:555-575 (feed → vm.feedPacket) | apps/web/src/vm/clientVm.ts:480-484 (feedPacket → __fkFeed → ClientCallback)
- 原版行为: asio 发的每个 packet 经 router → callLua("ClientCallback") → `ClientInstance.callbacks[command]`。命令集（去重 63 个唯一名，含 lobby+room）：AddBuddy AddCardUseHistory AddNpc AddObserver AddPlayer AddSkill AddSkillBranchUseHistory AddSkillUseHistory AddStatusSkill AddTotalGameTime AddVirtualEquip ArrangeSeats AskForCardChosen AskForResponseCard AskForSkillInvoke AskForUseActiveSkill AskForUseCard ChangeCardArea ChangeRoom ChangeSelf ChangeSkin Chat EnterLobby EnterRoom FilterCard GameLog GameOver Heartbeat LogEvent LoseSkill MoveCards NetStateChanged NetworkDelayTest Observe PlayCard PrepareDrawPile PrintCard PropertyUpdate ReadyChanged Reconnect RemoveObserver RemovePlayer RemoveVirtualEquip RmBuddy RoomOwner SetBanner SetCardFootnote SetCardMark SetCurrent SetPlayerMark SetPlayerPile SetSkillBranchUseHistory SetSkillUseHistory Setup ShowCard ShowVirtualCard ShuffleDrawPile StartGame SyncDrawPile UpdateGameData UpdateMarkArea UpdateQuestSkillUI
- web 行为: gateway 不解析 command，逐 packet 透传；浏览器把 envelope.raw（原始 inner CBOR）feed 进**完全相同的** client.lua addCallback 注册表（这套 lua 文件是从原版挂载到 VFS 运行，见 clientVm.ts:27 `freekill-core`）。无任何命令被 gateway 拦截/改写/丢弃。`ClientCallback` 用 pcall 包裹（clientVm.ts:104），单命令异常被隔离不影响后续 packet（feed 链 vmStore.ts:568-575）。
- 差异: 无

### P2 透传层::request 包（计时器字段）
- 状态: 完全还原
- 原版: src/network/router.cpp request 包 6 元素数组 [requestId,type,command,data,timeout,timestamp]；client 据此显示倒计时
- web : packages/protocol/src/codec.ts:52-56 (decodePacketArray 读 arr[4]/arr[5]) | convert.ts:133-142 (request envelope 带 timeout/timestamp) | stores/index.ts:383-387 (捕获 requestId + setServerWindow timeout*1000, timestamp)
- 原版行为: request 携带 timeout(秒)+timestamp(ms epoch)，服务端在 timestamp+timeout*1000+500 超时取默认
- web 行为: 完整解出 timeout/timestamp 并喂给 timerStore 驱动倒计时条；requestId 被 index.ts:384 捕获供回复回显
- 差异: 无

### P3 透传层::COMPRESSED 包 (0x1000)
- 状态: 完全还原
- 原版: asio util.cpp qCompress_std/qUncompress_std；4 字节 BE 原长 + zlib 流
- web : packages/protocol/src/codec.ts:49 (decode 时 qUncompress)、69 (encode 时 qCompress) | qzlib.ts:30-50
- 原版行为: type&COMPRESSED 时 data 为 Qt 风格 zlib
- web 行为: gateway 侧（Node）解压/压缩，浏览器不直接碰；4 字节大端原长解析正确（qzlib.ts:33 getUint32 false）
- 差异: 无

---

## 二、client→server 上报（逐条列名）

原版 client→server 全集（grep src/client/client.cpp + 所有 .qml/.js notifyServer/replyToServer）：
**reply 类（TYPE_REPLY）**：所有 AskFor* 的应答（replyToServer）。
**notify 类（TYPE_NOTIFICATION，notifyServer）**：Heartbeat、Setup、EnterRoom、ObserveRoom、QuitRoom、
RefreshRoomList、CreateRoom、Ready、StartGame、AddRobot、KickPlayer、Trust、ChangeRoom、Chat、
PushRequest（其 payload 子命令：surrender / prelight / changeskin / updatemini）。

### P4 上报::请求回复 replyToServer (TYPE_REPLY)
- 状态: 完全还原
- 原版: src/client/client.cpp:123-139 (replyToServer，type=TYPE_REPLY|SRC_CLIENT|DEST_SERVER，回显 requestId)；asio router.cpp:119-139 仅按 requestId 匹配 expectedReplyIds，**不读 reply 的 command 字段**
- web : apps/web/src/stores/vmStore.ts:373-381 (VM 发 notifyUI("ReplyToServer") → serverReply) | stores/index.ts:130 (serverReply → client.reply(currentRequestId,data)) | net/gatewayClient.ts:88-91 (reply) | protocol/convert.ts:178-185 (envelopeToPacket reply 分支 TYPE_REPLY|SRC_CLIENT|DEST_SERVER) | ws-bridge.ts:231-236 (requestId 回显，优先浏览器捕获值)
- 原版行为: AskFor* 在 VM 内结束 → replyToServer(command, data)，requestId=当前 this->requestId
- web 行为: VM（同一套 lua request 处理）产出 ReplyToServer notifyUI → 浏览器以 currentRequestId（index.ts:384 在 request 到达时捕获）回复。command 字段送空串——asio 不读它，语义无损。多请求并发时优先用浏览器捕获的 requestId（ws-bridge.ts:228-233），比 gateway lastRequestId 猜测更稳。
- 差异: 无

### P5 上报::Heartbeat
- 状态: 完全还原
- 原版: lua/client/clientbase.lua:132-134 (heartbeat → notifyServer("Heartbeat",""))；asio serverplayer.cpp:170 重置 ttl
- web : 房内 → vmStore setServerSender → client.notify("Heartbeat")（index.ts:123）；大厅 → stores/index.ts:396-405 (lobby 分支显式 client.notify("Heartbeat",''))
- 原版行为: 收到 server Heartbeat 即回 Heartbeat 重置 ttl（max_ttl=6，约 3 分钟）
- web 行为: 房内由 VM 的 ClientBase:heartbeat 经 notifyServer 回；大厅 VM 未启动，index.ts 显式补回（修复大厅闲置被踢）。两态都回。
- 差异: 无

### P6 上报::Setup（登录）
- 状态: 完全还原
- 原版: lua/client/clientbase.lua:115-117 sendSetupPacket → C++ client 组 [name, RSA(pwd), md5, ver, uuid]
- web : apps/gateway/src/asio-client.ts:157-168 (sendSetup) | protocol/convert.ts:64-84 (buildSetupPacket，5 元素字节串数组) | gateway/src/rsa.ts (encryptPassword)
- 原版行为: 收 NetworkDelayTest(服务器公钥) → 回 Setup notify
- web 行为: gateway 代替浏览器做整个握手（浏览器发 __gateway_login 控制帧给凭据，gateway 组 Setup）。字段顺序/类型一致（全字节串）。
- 差异: 无

### P7 上报::大厅动作 RefreshRoomList / CreateRoom / EnterRoom / ObserveRoom / QuitRoom
- 状态: 完全还原
- 原版: Fk/Pages 各处 notifyServer；asio lobby.cpp 处理 Chat/CreateRoom/EnterRoom/ObserveRoom/RefreshRoomList
- web : LobbyPage.tsx:33,40,68 (RefreshRoomList/QuitRoom) | components/RoomList.tsx:17,20 (EnterRoom/ObserveRoom) | components/CreateRoomDialog.tsx:43 (CreateRoom) | GameOverModal.tsx:108 (QuitRoom)
- 原版行为: 这些是 notifyServer 字符串/数组 payload
- web 行为: client.notify(command, payload) 直送 gateway → asio；payload 结构一致（EnterRoom=[id,password]，CreateRoom=[name,cap,timeout,settings]）
- 差异: 无

### P8 上报::房内动作 Ready / StartGame / AddRobot / QuitRoom
- 状态: 完全还原
- 原版: WaitingRoom 对应 QML notifyServer；asio room.cpp:935-939 room_actions 映射
- web : apps/web/src/table/WaitingRoom.tsx:65,70,76,79 (Ready/AddRobot/StartGame/QuitRoom 经 notify())
- 原版行为: 等待房动作为 notifyServer 空/简单 payload
- web 行为: client.notify 直送。AddRobot 受 server manifest webFeatures 门控（waitingState.ts:37），但默认（旧 server 未下发）不隐藏，契约一致。
- 差异: 无

### P9 上报::KickPlayer
- 状态: 完全还原
- 原版: Fk 房主 UI notifyServer("KickPlayer", pid)；asio room.cpp:936 room_actions["KickPlayer"]
- web : apps/web/src/table/WaitingRoom.tsx (房主对非自己玩家显示「踢出」→ client.notify("KickPlayer", pid))
- 原版行为: 房主在等待房可踢人
- web 行为: 等待房房主可对其它玩家发送 KickPlayer；非房主/自己不显示踢人入口。
- 差异: 无（C10 仍记录座位菜单/屏蔽聊天/机器人 minComp 等表现层简化）
- 修复: 已修复并验证 (WaitingRoom 加房主踢人按钮 + canKickPlayer helper；web 174 测试、typecheck、build 通过；live compose probe 证明 KickPlayer 后被踢玩家回大厅，2026-06-13)

### P10 上报::Trust（托管）
- 状态: 完全还原
- 原版: Fk 房内菜单 notifyServer("Trust")；asio room.cpp:939 room_actions["Trust"]
- web : apps/web/src/table/RoomMenuOverlay.tsx (对局菜单「托管/取消托管」→ client.notify("Trust",""))
- 原版行为: 房内切换托管/取消托管，server 改 player state 为 trust
- web 行为: 房内菜单可发送 Trust；NetStateChanged 由 VM 应用后经 readPlayers state 快照显示托管状态。
- 差异: 无（D23 状态图标仍属 Photo 表现层缺口）
- 修复: 已修复并验证 (RoomMenuOverlay 加 Trust 入口；clientVm/readPlayers 暴露 player state；web 174 测试、typecheck、build 通过；live compose probe 收到 NetStateChanged，2026-06-13)
- 修复: 已修复并验证 (补强:点击托管后立即本地 `FinishRequestUI`/清空 interaction popup/timer,并显示 body Portal「退出托管」按钮与交互遮罩；服务端 fork `Room::trust` 已在 thinking 时 `wakeUp("player_trust")` 让当前 request 进入托管 AI；web 183 测试、typecheck、build 通过，2026-06-13)
- 修复: 已修复并验证 (补强:托管 UI 状态从 `RoomMenuOverlay` 局部 pending 提升为全局 `trustUiStore` + `useSelfTrusting`,首次点击立即让 Dashboard/CardLayer/Photo/RequestPopup 同步进入托管态；退出托管使用 optimistic exit 避免按钮无反馈；GameOver 与 backToRoom/syncPlayers 将 trust 渲染态清回 online；web 186 测试、typecheck、build 通过，2026-06-13)
- 修复: 已修复并验证 (补强:托管进入/退出只用 `trustUiStore.pending` 做乐观 UI,不再写本地 Self player state,避免 pending 被提前清空后又被旧 VM 快照 `state=online` 瞬间带出托管；退出托管仍由 pending 立即恢复非托管 UI,再等待服务端 NetStateChanged/readPlayers 校准；web 187 测试、typecheck、build 通过，2026-06-13)

### P11 上报::PushRequest::surrender（投降）
- 状态: 完全还原
- 原版: Fk/Pages/Common/RoomPage.qml:327-329 notifyServer("PushRequest","surrender,true")；asio room.cpp:944-952 PushRequest → pushRequest("<pid>,surrender,true")
- web : apps/web/src/table/RoomMenuOverlay.tsx + apps/web/src/vm/clientVm.ts (CheckSurrenderAvailable 桥；确认后 client.notify("PushRequest","surrender,true"))
- 原版行为: 房内投降，先 CheckSurrenderAvailable 校验再上报
- web 行为: 房内菜单打开投降确认，显示 CheckSurrenderAvailable 条件，且确认时重新校验；全通过才发 PushRequest("surrender,true")。
- 差异: 无（C19 overlay 外观仍为简化）
- 修复: 已修复并验证 (RoomMenuOverlay + __fkCheckSurrenderAvailable；web 174 测试、typecheck、build 通过；live compose probe 发送 PushRequest surrender 无错误/断连，2026-06-13)

### P12 上报::PushRequest::prelight（预亮技能）
- 状态: 未还原
- 原版: Fk/Components/LunarLTK/SkillArea.qml:57-59 notifyServer("PushRequest","prelight,<skill>,<bool>")
- web : 无 prelight 触发点（SkillArea 类逻辑见 Phase F；本 Phase 仅记上报缺失）
- 原版行为: 触发技能预亮，服务端记录后续可发动
- web 行为: web 技能区无预亮上报
- 差异: 预亮上报缺失

### P13 上报::PushRequest::changeskin / updatemini
- 状态: 未还原
- 原版: PhotoBase.qml:88,123 + Cheat/SkinsDetail.qml:220 notifyServer("PushRequest","changeskin,...")；TestMini.qml updatemini
- web : 无
- 原版行为: 换肤 / mini 更新上报
- web 行为: 无对应上报
- 差异: 换肤上报缺失（属皮肤系统，非核心对局）

### P14 上报::ChangeRoom
- 状态: 未还原
- 原版: asio room.cpp:940 room_actions["ChangeRoom"]（房间配置变更）；server manifest webFeatures 含 "ChangeRoom"
- web : 无触发点（serverManifestStore.ts:22 仅记录该 feature 可用性，无发送）
- 原版行为: 房主修改房间设置后重发 ChangeRoom
- web 行为: 无 ChangeRoom 上报 UI
- 差异: 改房功能缺失

---

## 三、握手 / 登录契约

### P15 握手::NetworkDelayTest → Setup 时序
- 状态: 完全还原
- 原版: 客户端连后等 NetworkDelayTest(携 RSA 公钥 PEM) → sendSetupPacket
- web : apps/gateway/src/asio-client.ts:98-114 (sock 收数据) + 130-134 (NetworkDelayTest → sendSetup) | convert.ts:113-118 (extractPublicKeyPem)
- 原版行为: 公钥包在 NetworkDelayTest 的 inner CBOR 字节串
- web 行为: gateway 解 PEM、RSA 加密密码、回 Setup。完全在 gateway 完成。
- 差异: 无

### P16 握手::登录成功/失败判定
- 状态: 简化还原
- 原版: asio auth.cpp 成功后发 Setup/EnterLobby 等；失败发 ErrorDlg/ErrorMsg(/UpdatePackage) 后断开
- web : apps/gateway/src/asio-client.ts:35 (LOBBY_OK_COMMANDS={Setup,EnterLobby,EnterRoom,UpdateAvatar,NetworkDelayTest2}) + 39 (LOGIN_FAIL_COMMANDS={ErrorDlg,ErrorMsg,UpdatePackage}) + 140-150 (首个 OK 命令判定登录成功)
- 原版行为: 原版客户端没有“OK 命令白名单”概念——它信任 router 流，setup 回调即建立 Self
- web 行为: gateway 用启发式白名单判断握手完成，未知包先 buffer（asio-client.ts:154）等到 OK/fail 标志再 replay。功能等价但**判定方式不同**：若 asio 某成功路径首包不在白名单且不触发 buffer 超时前的 OK，理论上可能误判（实践中 Setup 必为首包，见 auth.cpp 注释）。
- 差异: 登录完成判定由原版的“信任流”改为 gateway 的命令白名单启发式（语义等价但实现偏差，存在白名单遗漏风险面）

### P17 登录::webOnly / checkClientMd5 fork 开关
- 状态: 完全还原（服务端开关，契约无偏差）
- 原版: 原版 asio checkMd5 强校验 flist MD5
- web : asio fork src/server/server.cpp:254-255 (webOnly/checkClientMd5 配置) | auth.cpp:251-257 (checkClientMd5=false 跳过 MD5 登录校验，refreshMd5 仍算供 manifest)
- 原版行为: MD5 不符发 ErrorMsg+UpdatePackage 拒登
- web 行为: fork 用 checkClientMd5=false 关闭客户端 MD5 校验（web 端无 flist），版本/uuid/密码校验保留。gateway 仍发 config.fkMd5（asio-client.ts:163）但被服务端忽略。SetServerSettings 第 4 元素下发 manifest（stores/index.ts:418-435）。
- 差异: 无（这是 fork 设计的预期契约变更，web 与 fork-asio 双方一致）

### P18 登录::Setup 数据包注入 VM（Self 建立）
- 状态: 完全还原
- 原版: lua/client/clientbase.lua:119-130 setup(data) data=[id,name,avatar,msec] 建立 Self
- web : apps/web/src/stores/index.ts:316-318 (捕获 lobby 阶段 Setup envelope 到 loginSetup) + 343-347 (进房时先 feed loginSetup 再 feed bootstrap 包)
- 原版行为: Setup 在大厅阶段到，建立 Self；进房 EnterRoom 时 Self 已存在
- web 行为: Setup 在 VM 启动前到达，被 stash，VM boot 后、EnterRoom 前 replay，保证 Self 正确。时序还原。
- 差异: 无

---

## 四、编码 / 字段 / 时序语义

### P19 编码::command/data 字节串 (CBOR major type 2)
- 状态: 完全还原
- 原版: asio 要求 command/data 为 CBOR 字节串（非文本串），无 tag
- web : packages/protocol/src/codec.ts:26 (Encoder tagUint8Array:false) + 65-75 (encodePacket：command/data 都 te.encode 成字节串) + 47 (decode td.decode 字节串)
- 原版行为: 文本串或 tag64 包裹会被 asio 拒("INVALID SETUP STRING")
- web 行为: 注释明确 tagUint8Array:false（codec.ts:24-26 critical）；命令/数据均字节串
- 差异: 无

### P20 编码::CBOR map 非字符串键 + BigInt
- 状态: 完全还原
- 原版: asio payload 含非字符串键的 map；大整数（timestamp）
- web : codec.ts:30 (Decoder mapsAsObjects:false) | convert.ts:28-29,38-56 (normalizeForJson：Map→对象、BigInt→Number/字符串) | 87-100 (decodeInnerData 对象模式失败回退 Map 模式回退纯文本)
- 原版行为: lua 直接拿 cbor.decode 结果
- web 行为: 渲染用 envelope.data（JSON 安全化），但**喂 VM 用的是 envelope.raw 原始字节**（convert.ts:139 packetToEnvelope 附 base64 raw；vmStore.feed:562 base64ToBytes → ClientCallback 自己 cbor.decode）。即 VM 拿到的是字节级原样数据，normalizeForJson 的有损转换只影响 JS 渲染侧不影响 VM 逻辑。
- 差异: 无

### P21 时序::无长度前缀流式分包
- 状态: 完全还原
- 原版: asio TCP 裸 CBOR 数组背靠背无分隔
- web : packages/protocol/src/codec.ts:84-108 (PacketStreamDecoder.feed) + 126-208 (cborItemLength 结构化长度扫描，支持定长/不定长/嵌套)
- 原版行为: 按 CBOR 自描述边界切包
- web 行为: 自实现 CBOR item 长度扫描器切帧（因 cbor-x 不暴露 consumed 偏移），保留尾部残包到下次 feed
- 差异: 无

### P22 时序::房内 packet 顺序 + 演出节拍
- 状态: 完全还原（并有增强）
- 原版: QML 靠 Behavior 插值自然获得演出间隔
- web : apps/web/src/stores/index.ts:261-281 (feedVmOrdered 串行化 feed) + 275-279 (waitBeat 按命令演出时长暂停) | pacing.ts
- 原版行为: 包按到达顺序处理
- web 行为: feedChain 串行保证顺序；request 包跳过节拍（fast path）立即弹 prompt（index.ts:278）；notify 包按 MoveCards/Animate 等演出时长 pace
- 差异: 无（节拍是对 QML Behavior 的等价补偿）

### P23 时序::reconnect 状态重建 + GameLog 回放
- 状态: 完全还原（gateway 增强）
- 原版: asio reconnect 重发整房 room:serialize，但**不含历史战报**（clientbase.lua:492-510 reconnect → loadRoomSummary；upstream 限制连 Qt 也丢 log）
- web : apps/gateway/src/ws-bridge.ts:64-86 (gateway 缓存每 uuid 的 GameLog 原始 CBOR) + 180-192 (returning login 后 __gateway_log_replay) | stores/index.ts:299-314 (回放：vm.parseLog 原始字节→parseMsg HTML→logStore.prepend) | clientVm.ts:437-444 (__fkParseLog cbor.decode+parseMsg)
- 原版行为: 重连丢战报历史（已知 upstream 缺陷）
- web 行为: gateway 缓存原始 GameLog CBOR，重连后回放，VM 用原版 parseMsg 还原本地化 HTML——比原版**更完整**。reconnect 时序：parked session（ws-bridge.ts:54-62）保活 asio TCP 防 AI 托管；returning login 触发 asio 原生 reconnect resync（asio-client.ts 注释 119-135）。
- 差异: 无（增强不破坏契约）

### P24 时序::EnterLobby 离房清理
- 状态: 完全还原
- 原版: clientbase.lua:229-231 quitRoom → stopRecording；EnterLobby callback
- web : stores/index.ts:350-355 (EnterLobby → inRoom=false + vmStore.reset + 清 enteredRoomId)；ws-bridge.ts:78 (EnterLobby 清 gateway GameLog 缓存)
- 原版行为: 退房重置客户端房间态
- web 行为: 重置 VM、路由态、清战报缓存
- 差异: 无

### P25 上报::reply command 字段送空串
- 状态: 完全还原（验证无害）
- 原版: src/client/client.cpp:138 replyToServer 送 command.toUtf8()（真实命令名）
- web : net/gatewayClient.ts:88-90 (reply command 默认 '') | convert.ts:179-185 (reply packet command=env.command 即 '')
- 原版行为: reply 携带命令名
- web 行为: 送空 command。**已核对 asio router.cpp:119-139 TYPE_REPLY 分支仅按 requestId 匹配 expectedReplyIds，完全不读 reply 的 command 字段**，故空串无害。
- 差异: 无（字段值不同但服务端不消费该字段，语义无损）

---

## 状态计数表

| 状态 | 数量 | 序号 |
|------|------|------|
| 完全还原 | 21 | P1 P2 P3 P4 P5 P6 P7 P8 P9 P10 P11 P15 P17 P18 P19 P20 P21 P22 P23 P24 P25 |
| 简化还原 | 1 | P16 |
| 还原错误 | 0 | — |
| 未还原 | 3 | P12 P13 P14 |
| 合计 | 25 | |

## 未还原 / 还原错误 序号索引

- **未还原（3）**：P12 PushRequest::prelight（预亮技能）、P13 PushRequest::changeskin/updatemini（换肤）、P14 ChangeRoom（改房设置）
  - 共性：均为 **client→server 上报且前端缺触发 UI**。gateway 透传层本身能传 PushRequest/对应命令（P1 已证），缺口纯在 web 前端未提供按钮/入口。无一是 gateway 改写/丢弃导致。
- **还原错误（0）**：无。
- **简化还原（1）**：P16 登录完成判定改用 gateway 命令白名单启发式（语义等价，存在白名单遗漏的理论风险面）。
