# Web-Only Roadmap · 近期执行计划

> 2026-06-11 建立,2026-06-12 据完整还原审计(`freekill-web/audit/`)重排。依据:`PROGRESS.md`、`freekill_web_implementation_plan.md`、2026-06-12 audit 报告(459 条)、Web-only 转向判断。
>
> 决策:在 **`freekill-web-asio` 独立 fork 仓库**维护 Web-only 改动;`freekill-asio/` 保留为只读 diff 基线。保留原版 Lua 规则与客户端 VM(wasmoon 跑原版 client.lua),只重新实现 QML→TS 渲染层;服务端/网关/资源发布按 Web 产品优化。

## 已完成(2026-06-12 前)

- **M2/M3/M4**:基础身份局可玩、断线重连/旁观、交互补全、视觉动画音频。
- **W0 服务端 fork(W0-0~W0-4,已部署)**:fork 仓库+4 配置项、跳过 MD5 登录、manifest/capabilities+统一包集合、房间过期+IP 封禁 gating、Docker 源切 fork。
- **PACE 演出节奏队列**:feedChain 按动画时长节流 + 资源预取 + 可调速度。
- **FEAT-IG(IG-1~7)**:开局前设置面板、手气卡、身份猜测标注、玩家详情补装备/判定牌、局内聊天+送花/砸蛋、选将页右键/长按看技能、同账号顶号反向踢修复。
- **W1-RES**:部署侧 verify-fk-assets 构建期 gate + 客户端自检 + 可选预缓存。
- **已上线**:VPS docker compose,HTTPS/WSS,https://sgs.davidchen.me。

## 审计结论(2026-06-12,缺口底账)

完整还原审计 459 条:**未还原 160 / 简化 124 / 还原错误 10 / 完全 165**(完全还原率 ~36%)。关键架构事实:客户端逻辑 = wasmoon 跑原版 client.lua(非重写),只 QML→TS 渲染层被重新实现;**协议透传层(P,18/25 完全)与标准三包呈现(O,11/11 完全)健壮,缺口集中在 UI 表现层**。命令有 delta/快照两种消费,判"未还原"前须分清(见 audit Phase 0)。详见 `freekill-web/audit/SUMMARY.md`。

## 工作纪律

1. 仍然 **先读后写**:UI/交互动手前读对应 QML/Lua/计划节;可照搬的坐标/数据结构/动画语义必须照搬。
2. VM 仍是状态真相源;React 不重算规则。
3. 服务端 fork 改动只做小而确定的开关/API,不重写房间线程、Lua 规则、CBOR 路由。
4. 每个切片修一项验一项;涉及共享包或网关/服务端协议时跑相关单测 + 至少一个真 asio/Web E2E。
5. 每段实质工作结束执行 `/sync`(SessionStart 钩子已自动重建 PROJECT_STATE.md)。
6. **terminal 里直接给用户看的回复用简体中文。**


## N1 · 对局正确性缺口(最高优先 — 缺了会误导或卡住对局)

> 来源 audit §3(还原错误)+ §4.1。这些直接影响对局可玩性与正确性,优先于一切观感项。

### N1-1 还原错误 10 条(audit §3,用户看到的是错误而非空白)

状态:已完成(2026-06-12),audit 还原错误 10→0。此节保留为来源底账,不再作为近期执行项。

- **N2 双将分屏立绘**:`generals/dual/<name>.jpg` 从不取,双将拉伸普通整图。改 skin.ts 立绘寻址加 dual 候选。
- **M3 牌堆标记 `@$`/`@&` 计数**:`clientVm.ts` 落入通用文字分支显示牌名拼接而非张数。按 QML MarkArea 改为显示数量。
- **D11 座位移动补间**:照搬 QML `Behavior on x/y` 600ms 补间(现 left/top 跳变)。
- **I8 旁观者聊天进弹幕**:无 photo 的旁观发言原版走弹幕,web 误 append 进面板;连带 `{emojiN}`→`<img>` 替换、hideObserverChatter。
- **H6 Indicate 多余红环**:web 自创了原版没有的 TargetPulse,移除。
- **E9 卡牌禁用语义**:遮罩改由原版 `selectable` 驱动而非 `enabled`。
- **B40/B41 RoomDelegate**:过期房禁 Enter/Observe(现可点进版本不匹配房)、密码内联框对齐原版。
- **C29 UpdateGameData 战绩**:VM 内执行但无渲染(并入等待房战绩面板)。
- **N20 送礼动画退化**:并入 N5 观感(egg/flower/shoe/wine 精灵)。

### N1-2 限定技/觉醒技/转换技显示(audit D56/F14/F15/M14/M15)

状态:主体已完成并部署(2026-06-13)。`UpdateLimitSkill`、顶部 banner、标记区渲染已解除 deferred 并接入;后续只按实测 bug 修补。

- 解除 `UpdateLimitSkill`/`SetBanner`/`UpdateMarkArea` 的 `KNOWN_DEFERRED`。
- 补 Photo 的 LimitSkillArea(限定技「已用 X」、觉醒技触发显隐、转换技阴/阳态)+ 全局顶部 banner + 标记区显隐。
- 标准三包不触发(audit O 确认),扩展包对局必需;若 VM 镜像已含状态则低成本补渲染。

### N1-3 对局上报入口(audit P 阶段:asio 支持、web 无前端入口)
状态:已完成并验证(2026-06-13)。P9/P10/P11 已从未还原升级为完全还原;C19/C20 降为简化还原。

- 投降(PushRequest surrender)、托管(Trust)、房主踢人(KickPlayer)。
- 配合 audit C19/C20:对局内菜单 overlay + 投降按钮。

近期执行拆分:

1. **投降 + 对局内菜单 overlay**:已完成。局内菜单入口与确认框,确认时重跑 CheckSurrenderAvailable,通过后发送 `PushRequest("surrender,true")`。
2. **托管 Trust**:已完成。同一局内菜单可发送 `Trust`,并通过 VM/NetStateChanged/readPlayers state 反映状态。
3. **房主踢人 KickPlayer**:已完成。等待房房主可见「踢出」按钮,非房主/自己隐藏,发送 `KickPlayer`。
4. **N2 低成本状态视觉紧随其后**:N1-3 闭环后立即做 playing 高亮、faceturned 翻面、saveme 垂死三项纯渲染缺口。

暂不插队:手牌拖拽/超级拖拽/双击(N1-4)涉及 CardLayer 交互面较大;总览/详情页族和个性化账户也不抢在 N1-3 前。

### N1-4 出牌交互(audit E14/E15/E17 + D32/D24)
- 手牌拖拽出牌、超级拖拽、双击使用(现仅点击选中)。
- 对手手牌速览 HandcardViewer 浮窗、手牌数显示 `n/maxCard` 与 ∞。

## N2 · 信息完整度缺口(audit §4.2)

- **行动者/状态视觉**:playing 高亮光环、翻面 faceturned、垂死 saveme 贴图(D12/D20/D22,数据已镜像未消费,纯渲染缺口,成本低)。
- **总览/详情/战绩页族**(audit J,23 条):武将一览、卡牌一览、武将筛选、武将池、战绩列表、统计页 web 零实现零入口。需先做大厅入口框架。
- **建房子系统**(audit B):FilterRoom 筛选(B4/B17)、Lua 动态设置 UI(B28)、卡包多选(B29)、禁将方案(B30)。
- **个人设置族**(audit B31~B39):改头像、改密码、音频/控制/UI/背景设置、资料卡。
- **等待房 WaitingPhoto**(audit C2/C3/C4):立绘/边框/三态准备角标、战绩面板、房间配置面板。

## N3 · Web 账户与个性化

> 利用现有数据库能力做产品闭环(符号经 2026-06-11 源码审计核实,见 freekill_web_implementation_plan §10)。

- **N3-1 用户 KV 设置**:`globalSaves(uid,key,data)`(现成异步 API)存 `web.roomPresets`/`web.disabledGenerals`/`web.uiPrefs`/`web.recentPacks`。需 gateway notify 封装,不让 React 直接拼底层 RPC。
- **N3-2 房间设置 V2**:现有 settings CBOR blob 内约定 `enabledPacks`/`disabledGenerals`/`aiLevel`/`visibility`/`presetId`;服务端只解析少数字段,Lua 仍收完整 settings。
- **N3-3 社交与成长**:`friendinfo`(空表绿地开发,需新建 ServerPlayer 读写+网关 API)、`achievements`/`user_levels` 或 globalSaves MVP、个人资料页(头像/总时长/胜率/成就/常用武将)。

## N4 · 生产化

- R-CRED:替换 localStorage 明文密码为 session token / httpOnly 方案。
- 数据卷备份:users.db、game.db、packages、配置。
- 管理后台:封禁、房间、包启用、用户查询、日志。
- 日志/监控:gateway + asio + Caddy health check。
- 容量压测:WS 连接数、asio 房间线程、wasmoon 客户端内存。

## N5 · 观感打磨(audit §4.3,视觉降级、不影响功能)

- **大招 UltSkillAnimation**(H9):全屏黑幕+双层滚动台词+立绘三段飞入。
- **五种送礼动画**(H20~H24+N20):egg/flower/shoe/wine 各自精灵齐射/旋转/碎裂/命中帧+音效(现共用单 emoji)。
- **Photo 循环状态光环**(H2~H4):playing/selected/selectable 精灵(现静态描边)。
- **弹幕 Danmu**(I9/B13):大厅/旁观/广播/胜负公告通道。
- **资源美化包 + 内嵌字体**(audit N):enabledResourcePacks 皮肤包机制、FZLE/FZLBGBK/simli 字体。
- **Cheat 查看面板族**(audit L,13 条):查看牌堆/将堆/卡牌详情、自由选将/同名替换/皮肤选择。
- **设置/偏好控件族 + Config**(audit K):web 设置页、ActionRow/PreferencePage/Slider、Config 扩展。

## N6 · 创意工坊与 AI 提升(研究级长线,最后做)

- **创意工坊 MVP**:只支持审核安装包(上传→离线扫描→测试→管理员启用→manifest 发布);公共服不跑未审核 Lua;单人沙盒房隔离测试。
- **AI 提升**(审计修订:非小改,是未完成基础功能——SmartAI 策略注册被 stub 成 no-op、无 aiLevel、无 self-play harness):MVP = 取消 stub + ~10 高频牌/技能策略 + 最小 headless 自对局评测 + C++ 侧 aiLevel 参数,先闭环再扩面。

## 近期推荐顺序

1. **当前立即做 N2 低成本状态视觉**:playing 高亮、faceturned 翻面、saveme 垂死,数据已在 VM/玩家快照中,优先纯渲染补齐。
2. **再回到 N1-4 出牌交互**:手牌拖拽、超级拖拽、双击使用、手牌速览/上限显示;这是更大的 CardLayer 交互面,不与 N2 状态视觉混做。
3. **随后补 N1-3 周边剩余简化项**:完整 RoomOverlay 按钮列/Esc/缩放、等待房 photoMenu/Block Chatter/机器人 minComp 踢人约束、踢房主计时器。
4. **之后推进等待房 WaitingPhoto → 总览/详情页框架 → 建房/个人设置族**。
5. **N3 账户个性化(房间预设/禁将)** → N4 生产化(session token 优先)。
6. **N5 观感打磨 / N6 工坊+AI** 按产品节奏排。

> 每个切片修一项验一项,涉及共享包/网关/服务端协议时跑相关单测 + 真 asio/Web E2E;改还原项前先读对应 audit Phase 报告的原版+web 双向定位与 QML/Lua 源码(照搬纪律)。
