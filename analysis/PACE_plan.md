# 客户端演出节奏队列 · 实现计划(PACE)

> 目标:修复"浏览器连 VPS 时游戏节奏过快、动画互相覆盖、语音/卡图来不及加载、卡顿"。
> 根因(已逐行核实,见 memory `game-pacing-server-vs-client`):**服务端对演出命令是 fire-and-forget,节奏靠 room:delay(墙钟,fork steady_timer 精确);原版 Qt 客户端无命令队列,靠 QML `Behavior on x/y` 把每次位置变化插值成平滑动画**。Web 客户端缺这层"按动画时长消费命令"的节拍 —— notifyUI 命令在 `feedPacket` 内同步清空,`animationStore` 覆盖式(后盖前丢中间帧),WAN 上 TCP 攒堆送达就视觉塌缩。

## 决策(已与用户敲定)

- **队列层:节流整条 feed**(非只排队视觉演出)。在 `feedChain` 层:`feed()` 处理完一条**含演出**的 packet 后,按动画时长 await 一拍再喂下一条;状态镜像随演出同步推进(HP 在伤害演出时才掉,更贴近原版观感)。
- **请求包 / reconnect 批量 / log replay 走快速通道,不节流**(否则重连重放会被拖慢、操作请求会迟滞)。
- **速度可调**:节奏倍率存 localStorage(`fk_pace`),VmDebugPanel 加滑块/输入,默认一个合理拍子。
- **顺带修资源来不及**:演出命令入队/播放前,提前 fetch 它要用的卡图/语音(局内演出资源预取),减少静默回退。

## 现状锚点(已读源码确认)

- `apps/web/src/stores/index.ts:217` `feedChain` —— 每个 server packet 一次 `feed(env)`,Promise 串行。`routeEnvelope` 区分 room-bootstrap / log replay / in-room。
- `apps/web/src/stores/vmStore.ts:496` `feed(env)` —— 调 `vm.feedPacket`(notifyUI 在其**同步内部**触发)+ readPlayers/readCards/readGenerals/translate。
- notifyUI 分发(vmStore.ts:241 起):`MoveCards`→cardStore.applyMoveCards、`Animate`→handleAnimate(116)、`LogEvent`→handleLogEvent(175)、`Destroy*`、状态类(PropertyUpdate 经 readPlayers 镜像)。
- 动画时长常量:`CardLayer.tsx:22` GO_BACK_MS=500;`PhotoEffects.tsx` tremble 200 / Emotion 帧 50ms / InvokeSkill 1640;`AnimationLayer.tsx` Indicate ~700。
- 无现成"设置 store",localStorage 模式见 `diag/log.ts`(fk_log)。

## 切片拆分(每片自验通过即 commit;push 经用户许可)

> **状态(2026-06-11):PACE-0/1/2/3 全部完成,分支 `feat-pacing-queue`(提交 `73a412f`/`4266451`/`a2493ca` + PACE-3),未 push。剩 VPS 真机验收。**

### PACE-0 · 节奏内核 + 命令分类 ✅(纯模块 + 单测,无观感变化)
- 新建 `apps/web/src/stores/pacing.ts`:
  - `paceFor(command, data) → ms`:每条命令的"演出拍子"(查表)。状态/请求/瞬时类返回 0(不节流);MoveCards→GO_BACK_MS、Animate(按 type:Indicate 700 / Emotion 由帧数 / InvokeSkill 1640 / Ult / SuperLightBox)、LogEvent(Damage tremble 200 等)。拍子值集中成常量,与各动画组件实际 duration 对齐(照搬,不另发明)。
  - 倍率:`getPace()` 读 localStorage `fk_pace`(默认 1.0,clamp [0.1, 5]);`setPace(x)`。最终 await = `paceFor * getPace()`。
  - `nextBeat(command, data): Promise<void>`:返回一个 `≥0` 的延时 Promise(0 时同步 resolve,避免无谓 microtask)。
- 单测:查表覆盖各命令、倍率 clamp、0 拍子命令不延时。
- **自验**:`pnpm --filter web test/typecheck/build` 绿。无 UI 改动。

### PACE-1 · feedChain 接入节拍 ✅(核心,有观感变化)
- 改 `index.ts` 的 in-room 分支:`feedVmOrdered` 之后,若该 packet `paceFor>0`,把 `feedChain` 续上一个 `nextBeat(...)`(用刚 feed 的 command/data 决定拍子)。即:`feedChain = feedChain.then(feed).then(()=>nextBeat(cmd,data))`。
- **快速通道**:`env.kind==='request'`、`__gateway_log_replay`、room-bootstrap、EnterLobby —— 这些分支**不挂 nextBeat**(保持现状即时)。
- 注意:`feed()` 内部状态镜像(readPlayers 等)仍在拍子**之前**完成,确保下一拍开始时镜像已就绪(避免抽帧)。拍子只拉开"开始下一条命令"的时刻。
- **自验**:WSL 起 asio + gateway + vite;`localStorage.fk_log='debug'` 看命令到达 vs 消费时间被拉开;脚本(双 WS 或 captured 回放)确认 feedChain 串行顺序不乱、请求包不被拖慢。浏览器眼见节奏放缓、动画不再互相覆盖。

### PACE-2 · 演出资源预取 ✅(修"来不及加载")
- 在命令**入节拍前**(或 feed 内 readCards 之后),对该演出涉及的资源提前 fetch:
  - MoveCards:涉及 cid 的卡图(feed 已 readCards 取 face,但 `<img>`/audio 实体未预热)——对将要飞行的卡 `new Image().src=` 预热;
  - LogEvent/Animate:对应语音 mp3 提前 `audio.preload`(复用 `table/audio.ts` 候选解析,加一个"只预热不播"路径)。
- 不改默认懒加载策略(`assetPrecache` 全量预缓存仍默认关),只针对"马上要演的"资源做窄预热。
- **自验**:debug 日志确认预取在播放前发起;VmDebugPanel 资源检查无新增 404;浏览器眼见语音/卡图缺失减少。

### PACE-3 · 速度可调 UI + 收尾 ✅
- VmDebugPanel 加"演出速度"滑块/输入(0.5×~2× 常用档 + 自由值),写 `setPace`,即时生效。
- 文档:实现计划 §5(UI 还原)或新增小节记节奏机制;PROGRESS 变更日志;notifyCommands 探测器若有新分类同步。
- **自验**:调速即时改变节奏;全 workspace typecheck/build/test 绿;captured 回放回归。

## 风险与边界

- **不碰服务端**:本方案纯客户端,服务端 fork 的 delay 是正确的墙钟,不改(若日后要服务端兜底统一拉长 delay,另开切片)。
- **快速通道边界**:务必确认请求包不被节流 —— 否则玩家操作响应变迟钝。PACE-1 自验重点。
- **拍子值来源**:必须对齐各动画组件**实际 duration**(照搬纪律),不自创数值;PACE-0 查表注明来源 file:line。
- **reconnect/log replay**:批量重放走快速通道,保持现状即时,不引入节拍(否则重连刷屏变慢)。
- **倍率为 0 或极小**:clamp 下限防止卡死;倍率不影响快速通道。

## 验证总纲(实现纪律 5:自验在前)

每片:WSL 真 asio + gateway + vite 三服务自起;captured-packets 回放确认 feedChain 顺序;debug 日志看命令到达/消费时间差;浏览器眼见(节奏、动画不覆盖、资源到位)。收尾 `/sync`。
