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
状态:已完成并验证(2026-06-13)。P9/P10/P11 已从未还原升级为完全还原;C19/C20 降为简化还原。托管入口已补强为点击托管/退出托管后都立即更新本地渲染态,再由服务端 NetStateChanged 校准。

- 投降(PushRequest surrender)、托管(Trust)、房主踢人(KickPlayer)。
- 配合 audit C19/C20:对局内菜单 overlay + 投降按钮。

近期执行拆分:

1. **投降 + 对局内菜单 overlay**:已完成。局内菜单入口与确认框,确认时重跑 CheckSurrenderAvailable,通过后发送 `PushRequest("surrender,true")`。
2. **托管 Trust**:已完成。同一局内菜单可发送 `Trust`,并通过 VM/NetStateChanged/readPlayers state 反映状态。
3. **房主踢人 KickPlayer**:已完成。等待房房主可见「踢出」按钮,非房主/自己隐藏,发送 `KickPlayer`。
4. **N2 低成本状态视觉**:已完成(2026-06-13)。playing 高亮、faceturned 翻面、saveme 垂死三项纯渲染缺口已补。

N1-4 核心已在 2026-06-13 完成;剩余是配置/设置与 ViewPile 周边简化项,不再阻塞后续页面族推进。

### N1-4 出牌交互(audit E14/E15/E17 + D32/D24)
状态:核心已完成并验证(2026-06-13)。E14/E15/E17 已从未还原升级为简化还原;D24 已完全还原;D32 已升级为简化还原。实测补强:拖拽开始前取消残留卡牌移动动画,超级拖拽时牌面可实时跟随指针移动到目标/OK 区。

- 已完成:手牌拖拽/重排、SortProhibited 门控、拖到目标/OK、双击使用、手牌数 `n/maxCard/∞`、HandcardViewer 显示。
- 剩余简化项:完整 ControlSetting/Config 驱动 `enableSuperDrag`/`doubleClickUse`/`autoTarget`;HandcardViewer 点击打开 ViewPile(依赖 Cheat/ViewPile 页族)。

## N2 · 信息完整度缺口(audit §4.2)

- **行动者/状态视觉**:已完成当前小切片(2026-06-13)。playing 高亮光环、翻面 faceturned、垂死 saveme 贴图已补;剩余投降 surrender 贴图与 rest/drank/netstate/status 归后续 Photo 状态批。
- **当前主线:禁将系统 + 大厅武将一览**(audit J1-J5 + B30 + K19):切片 A-E 已完成并验证。已具备大厅武将一览、包列表/搜索、禁包/禁将编辑、禁将方案管理和 CreateRoom disabled payload 接入;详见 `analysis/GENERAL_BAN_OVERVIEW_PLAN.md`。
- **总览/详情/战绩页族后续**(audit J 当前 18 未还原/8 简化):武将一览核心已简化还原;仍缺完整 GeneralDetailPage 四标签(J6-J17)、卡牌一览、武将筛选、武将池、战绩列表、统计页。
- **建房子系统后续**(audit B):禁将方案(B30)已简化还原;FilterRoom 筛选(B4/B17)、Lua 动态设置 UI(B28)、卡包多选(B29)仍未还原。
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

1. **已完成:切片 A Catalog VM / 数据桥**。大厅阶段读取原版 Lua 元数据,桥接 mods/modNames/generalPacks/getGenerals/search/generalData/generalDetail/translate,并已用真 VM 探针验证。
2. **已完成:切片 B `disableSchemes` store**。照搬 `Config.qml` 默认结构和写回语义,实现持久化、方案操作和 `CreateRoom.qml` 转换函数单测。
3. **已完成:切片 C 大厅入口 + `GeneralsOverview`**。已实现包列表、搜索、网格、footer、禁将/禁包编辑,渲染前注册翻译和 face。
4. **已完成:切片 D `BanGeneralSetting`**。已实现方案切换、新建、清空、导出、导入、重命名和三列摘要。
5. **已完成:切片 E `CreateRoomDialog` 禁将接入**。已推导 `disabledGenerals`/`disabledPack`,并通过本地 WSL web-asio + gateway E2E 建房验证。
6. **下一步建议**:GeneralDetailPage J6-J17 完整详情页,然后 GeneralFilter/卡牌一览/武将池/战绩统计;也可按用户优先级转向等待房 WaitingPhoto、个人设置族、N1-4/N1-3 周边简化项。
7. **移动端 Stage 适配专项(待修复)**:已确认横屏问题应独立切片处理。核心方向是用 `visualViewport`/`100dvh`/safe-area 替代单纯 `window.innerHeight`,处理旋转后的 viewport 稳定时机,并校准 `transform: scale()` 后舞台实际占用尺寸；本次只完成分析,未改 `Stage.tsx`。

> 每个切片修一项验一项,涉及共享包/网关/服务端协议时跑相关单测 + 真 asio/Web E2E;改还原项前先读对应 audit Phase 报告的原版+web 双向定位与 QML/Lua 源码(照搬纪律)。
