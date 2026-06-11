# W1-1 修复批次规划(用户 2026-06-11 提的 11 项)

> 严格先读后写,已派 4 个 Explore agent 摸清各点代码 + 主控对高风险项(2g)亲自读源码。
> 服务端改动进 `freekill-web-asio` fork;web 改动进 `freekill-web`。每项修一项验一项,定期 commit,push 须经用户允许。

## 进度(2026-06-11)

- ✅ **3a** 建房框不点空白关(`07083bf`)
- ✅ **3c** 不默认 webtester(`07083bf`)
- ✅ **2a** 战报默认折叠(`07083bf`)
- ✅ **3b** 进房加载页(`f458271`)
- ✅ **2d** Photo 势力 icon + 右键/长按详情(`cf95453`)
- ✅ **A1** 同账号顶号不卡死(fork `ebcf6a7`,真 asio 双连接+对照验证)
- ✅ **2b/2c** 计时器重连不归零 + 牌堆数重读(`4642391`,逻辑+typecheck,待浏览器实测)
- ✅ **2e** BGM + 背景图(`c1cc046`)
- 🟡 **2f** 移牌/抽牌音效逻辑已接(`c1cc046`),**待补 mp3 文件**(用户给的是 wav,需转 mp3,本机无 ffmpeg → 待用户装 ffmpeg 或确认用 wav)
- ⏳ **2g** 牌音效 html bug:已深查排除假设(资源在、服务端逻辑对、序列化对),**待用户给 VPS 访问**抓真实 PlaySound LogEvent 定位真因

## 分组与切片

### A · 服务端(fork)

**A1 — 同账号多端登录卡死 → 新登录顶掉所有老会话**
- 真因(`auth.cpp:471-485`):同 uid 登录时,在线就 `emitKicked()` 老会话;但只有 `insideGame()` 才走 `reconnect(client)` 并 return,**大厅态**的老会话被踢后代码继续 fall through 到 FAIL → 拒绝新登录 → 新旧都卡死。
- 修:大厅态也要让新连接接管。最小改动——`emitKicked()` 老会话后,对非 insideGame 的同 uid,不再 fall through 拒绝,而是让新登录正常建号(走正常 createNewPlayer 路径,老 player 已被踢下线/清理)。注意 `reconnect()` 对 room==null 的分支是 `emitKicked()`,不能直接复用;要在 auth 层区分"在大厅顶号=新建会话"vs"在局内顶号=reconnect 接管"。
- 验:WSL 起 fork,两个 gateway 连接同账号,断言先连的被踢、后连的成功进大厅(非双卡死)。对照 insideGame 路径仍走 reconnect。

### B · 游戏页面内(web,部分需 fork 或资源 sync)

**B-2a — 战报默认不展开**:`GameLogPanel.tsx:22` `useState(true)` → `useState(false)`。最简。

**B-2b — 开局计时器重连归零 → 始终显示真实游戏时长**
- 真因:`miscStore.startedAt` 在 `vmStore.reset()`(重连)时被清零(`miscStore.ts:30`),计时器本地从 0 重算。
- 真相源:asio 重连时发 `AddTotalGameTime`(`clientbase.lua:509`,含已进行秒数 setup_data[5]),web 现未消费它来重锚。
- 修:消费 `AddTotalGameTime`(routeEnvelope 已见 `AddTotalGameTime` 命令——W0-2 探针日志里出现过),用 `startedAt = Date.now() - elapsed*1000` 重锚;`StartGame` 仍正常起表。验:重连后计时器接续而非归零(probe 或浏览器)。

**B-2c — 抽/弃牌堆剩余数恒为 0**
- 真因:`miscStore.pileNum` 靠 `UpdateDrawPile` 喂(`vmStore.ts:379`),但重连后服务端不重发,且初始为 0;`client_util.lua:1258` 只在牌堆变化时发。
- 修:重连后从 VM 镜像重读牌堆数(`ClientInstance.draw_pile` 长度),加 `__fkReadPileNum` 桥,在 feed 处理 Reconnect 后调用(类似 readPlayers 模式);弃牌堆同理(查 discard_pile 是否有 UI 位)。注意先确认弃牌堆数在 QML MiscStatus 是否单独显示。验:对真 VM 断言重连后 pileNum>0。

**B-2d — Photo 左上角显示势力 icon + 妥善安置详情按钮**
- 现状:`Photo.tsx:157-164` 左上角是 ⓘ 详情按钮(`detailStore.open`);详情还可右键/长按打开(`useLongPress`)。
- QML(`GeneralCardItem.qml:57-66`):势力 icon 在左上角(`kingdomIcon()` → `/fk/image/card/general/<kingdom>.png`,skin.ts 已有)。
- 修:左上角放 kingdomIcon(读 player VM 镜像的 kingdom——确认 readPlayers 是否已含 kingdom,缺则加桥);**详情入口(用户定)保留右键 + 长按两种已实现方式,移除左上角 ⓘ 按钮**(腾出位置给势力 icon)。验:浏览器看势力 icon 正确、右键/长按仍能开详情、桌面与移动端都可用。

**B-2e — 游戏页加 BGM + 背景图**
- 资源已确认:`FreeKill-sourcecode/audio/system/bgm.mp3`、`image/gamebg.jpg`(+`background.jpg`)。
- QML 范式(`Room.qml:45-57`):MediaPlayer 循环播 `Config.bgmFile`,音量 `Config.bgmVolume`。
- 修:sync-fk-assets 拷 bgm.mp3 + gamebg.jpg 到 /fk;Stage.tsx 背景从纯色 `#0d3b1e` 改 gamebg.jpg;加 BGM 播放器(原生 Audio 循环,复用 audio.ts unlock 机制,带静音/音量开关,默认音量低)。注意自动播放策略需用户交互解锁(audio.ts 已有 unlock)。验:浏览器有背景图 + 循环 BGM、可静音。

**B-2f — 出牌/抽牌/牌移动音效(用户定:额外自创移牌音效)**
- 真相:FreeKill 原版**没有**通用 move/draw 音效;只有 recast(`./audio/system/recast`)、chain 等特定系统音 + 出牌音(2g)。
- 用户决策:**在原版基础上额外自创** 抽牌/弃牌/移牌通用音效。
- 修:① 先确保已有 PlaySound 系统音(recast/chain)正常(并入 2g 验证);② 新增:在 web `cardStore`/`vmStore` 消费 MoveCards 时,按移动语义播放音效——抽牌(drawPile→hand)、弃牌(→discardPile)、装备、普通转移各一个音。**音效来源待定**:优先复用 FreeKill 已有 system 音(如 `/fk/audio/system/*`,查可用集),不足处需用户提供或选用免费占位音。**先列出 FreeKill 现有 system 音清单给用户挑**,避免擅自引入未授权素材。验:浏览器出牌/抽牌/移牌各有声。
- 注意:自创音效是有意偏离 1:1,在代码注释标注"非原版、用户要求新增"。

**B-2g — 【高优先,probe-first】牌音效传成 html,过河拆桥/乐不思蜀等无声**
- 真相源已读:服务端 `usecard.lua:51` `broadcastPlaySound(path)` → `room.lua:552` `sendLogEvent("PlaySound",{name=path})` → 客户端 `client.lua:861` `notifyUI("LogEvent",data)`;web `vmStore.ts:184` `case 'PlaySound': playByPath(d.name)`,`audio.ts:playByPath` 拼 `/fk/<path>.mp3`。**代码路径看似正确**——故必须 probe 真实数据定位真因。
- 假设(待 probe 证实/证伪):① LogEvent 的 `name` 是 CBOR 字节串,prelude json.encode/sanitize 把它变成 `{0:..,1:..}` 对象或 `tostring` 成垃圾(同 PROGRESS 2026-06-07 "b" 提示、`__fkParseLog` 字节串类 bug);② 或 gateway 把 LogEvent 与 GameLog 混淆缓冲;③ 或 VPS 上 LogEvent 根本没到(被当 GameLog 渲染成 html toast)。
- 步骤:**先写 probe 喂真实出牌 packet(过河拆桥/乐不思蜀),抓 VM 实际 notifyUI("LogEvent",...) 的 data.name 字节内容**,确认是路径串还是 html/字节串;再据真因修(若字节串→prelude 序列化修复,参照已有 jsonSanitize;若 gateway→路由修复)。**严禁不 probe 直接改**。验:实连 VPS 或本地真 asio 出过河拆桥,耳听有声 + probe 断言 name 为正确路径。

### C · 游戏页面外(web)

**C-3a — 建房设置框点空白处关闭 → 只能用取消键关**
- 真因:`CreateRoomDialog.tsx:43` `<div backdrop onClick={onClose}>`。
- 修:移除 backdrop 的 onClick(或改为 no-op),只留取消按钮 onClose。最简。验:点空白不关,取消键关。

**C-3b — 建房后到进房间前显示伪报错的空等待房间 → 改加载页**
- 现状:点创建→CreateRoom→(~十几秒收游戏文件)→EnterRoom。期间 `WaitingRoom` 已渲染但 capacity 未到→显示"等待房间 · 0/?"+准备/离开键(截图的"伪报错"态)。
- 修:gameStore 加"进房加载中"标志(CreateRoom 发出后置 true,EnterRoom 到达且 capacity>0 后清),App/LobbyPage 在该标志下渲染加载页("正在创建房间/接收游戏文件…"+spinner,禁用误操作),而非 WaitingRoom。验:建房后先见加载页,文件到齐后进准备页。
- 注意:重连/旁观进房路径不能误触发加载页(只在主动 CreateRoom 时)。

**C-3c — 不再默认 webtester 账号 → 提示用户自建账号**
- 真因:`LoginPage.tsx:28-29` 默认 `webtester`/`web-m0-pass`。
- 修:默认空用户名/密码;加提示文案("首次使用请创建自己的账号,任意用户名+密码即注册;勿共用账号以免互相顶号")。保留 localStorage 已存凭据回填(老用户不受影响)。验:全新浏览器登录框为空 + 有提示。

## 执行顺序(先低风险快赢,2g probe 单独排)

1. 快赢纯 web 小改:C-3a(backdrop)、C-3c(默认账号)、B-2a(战报折叠)。
2. C-3b 加载页(中等,gameStore 状态)。
3. B-2d Photo 势力 icon(读 QML + 可能加 kingdom 桥)。
4. A1 服务端顶号(fork,需 WSL 验证)。
5. B-2b 计时器重锚 + B-2c 牌堆数重读(都涉及重连 VM 重读,一起做)。
6. **B-2g probe-first**(最高不确定性,单独定位 + 修),连带 B-2f 验证 recast/chain。
7. B-2e BGM+背景(资源 sync + 播放器)。

## 不做 / 范围说明

- B-2f 移牌音效用户已定**自创**(原版无),先列 FreeKill 现有 system 音给用户挑,不足再议素材来源;标注非原版。
- 每个切片各自 commit;两仓 push 待用户批准。

## 风险

- **B-2g 真因未定**:probe 前不改;若涉及 prelude 序列化,改 fkprelude.lua 要同步 public/fk 副本(sync-assets)。
- **A1 顶号**:auth 改动碰登录核心,务必跑双连接 E2E + 不回归正常 reconnect。
- **B-2e 自动播放**:浏览器需用户手势解锁音频(audio.ts 已有 unlock),BGM 不能在解锁前硬播。
