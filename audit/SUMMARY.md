# FreeKill-Web 还原审计 · 全局汇总（SUMMARY）

> 本汇总由 16 个 Phase（A–P）报告聚合而成。所有结论基于逐行实读原版 FreeKill 源码（git `37f8c12` / v0.5.20）与 freekill-web 实现，**未采信任何旧 audit/analysis 内容**。审计范围 = 客户端还原面 + 协议契约面（服务端 server lua / C++ 引擎由 freekill-web-asio fork 复用，不作还原对象）。

## 1. 总体计数

| 维度 | 数量 |
|---|---|
| 审计条目总数 | **459** |
| 未还原 | **141** |
| 简化还原 | **138** |
| 还原错误 | **0** |
| 完全还原 | **180** |

> 初始审计(2026-06-12)为 未还原 160 / 简化 124 / 还原错误 10 / 完全 165。**修复进度**:10 条还原错误全部处理(→完全:M3/N2/H6/E9/B40/B41/D11/C29;→简化:I8/N20;E9 为误判),另 C3 战绩面板、L18 自由选将、D56/F14/F15 限定技区(UpdateLimitSkill)均 未→简；N1-2 余项 M14 SetBanner 未→简、M15 UpdateMarkArea 未→完全；N1-3 对局上报入口中 P9/P10/P11 未→完全,C19/C20 未→简；N2 状态视觉切片中 D12/H2 playing 未→完全,D20 faceturned 未→简化,D22/H19 saveme 在既有简化项内补强；N1-4 中 E14/E15/E17 手牌拖拽/超级拖拽/双击 未→简,D32 HandcardViewer 未→简,D24 手牌数 简→完全。2026-06-13 追加补强:Photo handcard/role 出框并按实测对齐、托管立即清理当前交互并显示退出按钮、托管全局 pending/退出反馈/GameOver 清理、退出托管乐观写回本地 player state、手牌重排不误选中、卡牌移动动画释放后进入拖拽、自己手牌默认不可选遮罩覆盖回合外/托管等时机。当前 未141 / 简138 / 错0 / 完180,完全还原率 180/459 ≈ 39%。以各 Phase 报告的 `修复:` 标注为准。

## 2. 分 Phase 状态分布

| Phase | 主题 | 未还原 | 简化 | 错误 | 完全 | 小计 |
|---|---|---:|---:|---:|---:|---:|
| A | 启动/全局 shell/登录连服 | 13 | 6 | 0 | 8 | 27 |
| B | 大厅/建房/筛选/个人设置/包管理 | 24 | 12 | 0 | 8 | 44 |
| C | 等待房/房间外壳 | 9 | 14 | 0 | 7 | 30 |
| D | 玩家位 Photo 全栈 | 15 | 20 | 0 | 32 | 67 |
| E | 手牌/卡牌/牌桌牌堆 | 11 | 9 | 0 | 18 | 38 |
| F | 技能区/技能交互控件 | 5 | 9 | 0 | 5 | 19 |
| G | 请求弹窗（所有 Box） | 0 | 9 | 0 | 14 | 23 |
| H | 动画/特效/聊天动画 | 5 | 12 | 0 | 10 | 27 |
| I | 聊天/弹幕/日志/倒计时 | 1 | 10 | 0 | 7 | 18 |
| J | 总览/详情/筛选/战绩页 | 23 | 3 | 0 | 0 | 26 |
| K | 基础控件层（Widgets+Base） | 14 | 11 | 0 | 9 | 34 |
| L | 作弊/调试面板（Cheat） | 12 | 4 | 0 | 3 | 19 |
| M | 角色推测/mark/标记系统 | 2 | 6 | 0 | 9 | 17 |
| N | 资源/皮肤/音频/字体/i18n 管线 | 4 | 12 | 0 | 18 | 34 |
| O | 内容包客户端呈现（标/标卡/军争） | 0 | 0 | 0 | 11 | 11 |
| P | 协议契约一致性 | 3 | 1 | 0 | 21 | 25 |
| **合计** | | **141** | **138** | **0** | **180** | **459** |

> 上表为修复后的当前值。初始审计合计错误 10/完全 165。已处理全部 10 条:M3/N2/H6/E9/B40/B41/D11/C29→完全,I8→简化(核心 bug 修复、弹幕分流待 I9),N20→简化(IG-5b 有意简化,与 H20–H24 一致)。**还原错误清零(10→0)**;C3 战绩面板随 C29 由未还原→简化；N1-2 余项 M14/M15 已补齐；N1-3 已补 P9/P10/P11 上报入口并使 C19/C20 降为简化；N2 已补 playing/faceturned/saveme 状态视觉；N1-4 已补核心手牌拖拽/超级拖拽/双击和手牌信息。

## 3. 还原错误（初始 10 条 → 已全部处理，当前 0 条）

这些是 web 端有对应实现、但行为/视觉/语义与原版**不一致**的条目，比单纯缺失更危险（用户看到的是错误而非空白）。

| 序号 | 元素 | 错误本质 |
|---|---|---|
| ~~**M3**~~ ✅ | 牌堆标记 `@$`(游戏牌)/`@&`(武将牌) 计数 | **已修复并验证(2026-06-12)**：text-mark 分支加 `@$`/`@&`→张数，照搬 MarkArea.qml:135-137 |
| ~~**N2**~~ ✅ | 双将分屏立绘 (dual/) | **已修复并验证(2026-06-12)**：skin.ts `generalDualPicCandidates` 优先取 dual/ 再回退普通立绘 |
| ~~**N20**~~ ◐ | 聊天投掷动画精灵 (egg/flower/shoe/wine) | **分类订正(2026-06-12)**：与同源 H20–H24 一致改判简化还原——emoji 飞行是 IG-5b 有意简化、功能完整，非 bug；精灵帧升级归 N5 观感批次 |
| ~~**B41**~~ ✅ | RoomDelegate Enter/Observe 按钮禁用态 | **已修复并验证(2026-06-12)**：outdated 房禁用两按钮、满员只留旁观 |
| ~~**B40**~~ ✅ | RoomDelegate 密码内联输入框 | **已修复并验证(2026-06-12)**：内联受控密码框替换 window.prompt |
| ~~**C29**~~ ✅ | UpdateGameData 战绩更新 | **已修复并验证(2026-06-12)**：随 C3 战绩面板接通——VM setGameData→快照 readPlayers gameData→WinRatePanel 渲染 |
| ~~**D11**~~ ✅ | 座位移动补间动画 | **已修复并验证(2026-06-12)**：Photo.tsx 加 left/top 600ms transition，照搬 Behavior on x/y |
| ~~**E9**~~ ✅ | 卡牌禁用变灰 | **复核为误判(2026-06-12)**：原版 Room.qml:746 也是 `selectable = enabled`（同一 VM 信号），web 等价；升级为完全还原 |
| ~~**H6**~~ ✅ | Indicate 目标红环脉冲 (TargetPulse) | **已修复并验证(2026-06-12)**：移除 web 自创的红环脉冲，Indicate 只画原版有的指示线 |
| ~~**I8**~~ ◐ | 旁观者聊天进弹幕 | **核心 bug 已修复(2026-06-12)**：旁观者不再错挂气泡，加 emoji `<img>` 渲染 + hideObserverChatter；降为简化还原（弹幕分流待 I9 弹幕组件落地） |

> 修复进度：**10 条还原错误全部处理完毕（错误 10→0）**（2026-06-12）。完全还原：M3、N2、H6、E9、B40、B41、D11、C29；简化还原：I8（核心 bug 修复，弹幕分流待 I9）、N20（IG-5b 有意 emoji 简化，与 H20–H24 一致）。E9 为审计误判（原版同 selectable=enabled）。连带 C3 战绩面板随 C29 由未还原→简化还原。

## 4. 高优先级未还原缺口（按对局影响排序）

### 4.1 影响对局可玩性 / 正确性（P0 — 缺了会卡住或误导对局）
- **P 协议上报剩余 3 项**：prelight 预亮（F7）、changeskin 换肤、ChangeRoom 改房——asio 支持但 web 前端无入口；投降/托管/房主踢人已于 2026-06-13 补齐并验证，托管补强为点击后立即本地清理当前询问 UI、全局显示/隐藏托管遮罩与「退出托管」、退出托管乐观恢复 online 渲染态、GameOver 清理托管渲染态并阻断其它交互。
- **C19 游戏内菜单 overlay 剩余项**：已有最小局内菜单 + 投降/托管；设置、一览、聊天抽屉、Esc/缩放效果仍未完整还原。
- **E14/E15/E17 手牌出牌交互剩余简化项**：核心拖拽/重排、拖到目标/OK、双击使用已于 2026-06-13 补齐；已补强卡牌动画释放后拖拽实时跟随指针；仍缺完整 ControlSetting/Config 驱动的 `enableSuperDrag`/`doubleClickUse`/`autoTarget` 开关和逐帧进入/离开 Photo 切换细节。
- **D32 对手手牌速览剩余简化项**：HandcardViewer 显示已于 2026-06-13 补齐，D24 `n/maxCard/∞` 已完全还原；仍缺点击 HandcardViewer 打开 ViewPile（依赖 Cheat/ViewPile 页族）。

### 4.2 影响信息完整度（P1 — 看得了但信息缺失）
- **D22 剩余投降贴图 + D32 HandcardViewer 点击行为**：playing 光环、faceturned、dying→saveme、D24 手牌上限、D32 速览显示已补；投降 surrender 贴图与 HandcardViewer 点击 ViewPile 仍缺。
- **J 总览/详情/战绩页族（23 条全未还原）**：武将一览、卡牌一览、武将筛选、武将池、战绩列表、统计页 web 零实现零入口；`pages/` 仅 LobbyPage+LoginPage。
- **B 筛选 + 建房子系统**：FilterRoom 整套（B4/B17）、Lua 动态设置 UI（B28）、卡包设置（B29）、禁将方案（B30）未还原。
- **B 个人设置族（B31–B39）**：改头像、改密码、音频/控制/UI/背景设置、资料卡均无入口。
- **C2/C4 等待房 WaitingPhoto**：立绘/边框/三态准备角标、房间配置面板用纯文本替代或省略（战绩面板 C3 已于 2026-06-12 接通，简化还原）。

### 4.3 影响观感（P2 — 视觉降级，不影响功能）
- **H9 大招 UltSkillAnimation**：原版全屏黑幕+双层滚动台词+立绘三段飞入，web 仅一行大字缩放淡入。
- **H20–H24 + N20 五种送礼动画**：塌缩成单 emoji 飞行（见 §3 N20）。
- **H3–H4 Photo 候选循环光环**：playing 精灵已补；selected/selectable 仍由静态描边替代。
- **I9 + B13 弹幕 Danmu 整组件**：大厅/旁观/广播/胜负公告通道全无。
- **N1 资源美化包 + N field 内嵌字体**：enabledResourcePacks 皮肤包机制缺失；FZLE/FZLBGBK/simli 字体退化为 system-ui。
- **L Cheat 查看面板族（13 条）**：游戏内 cheat 容器、查看牌堆/将堆/卡牌详情、自由选将/同名替换/皮肤选择未实现（VmDebugPanel 是开发工具，不计 cheat 还原）。
- **K 设置/偏好控件族 + Config**：web 无设置页，ActionRow/PreferencePage/Slider 等控件族未还原，Config 简化到仅 uuid+bgm。

## 5. 完全还原的核心系统（已验证一致，无需返工）
- **P 协议透传层**：gateway 是纯 CBOR↔Envelope 桥，70 个 server→client 命令整体到达浏览器并喂入原版 client.lua addCallback 表，零丢弃零改写（18/25 完全还原）。
- **O 标准三包客户端呈现**：standard/standard_cards/maneuvering 的立绘/血量/势力/身份、技能 banner+配音、卡牌花色点数虚拟名、判定区延时锦囊、装备序列帧、mark 多态前缀分类逐项还原（11/11 完全）。
- **G 请求弹窗骨架**：21 个 Box + 5 个 request_type 全部至少有可用 port，核心规则桥（poxiFilter/Feasible/Prompt、chooseGeneralFilter、choiceFilter、cardFitPattern、防作弊 shuffle）全部存在且签名匹配（0 未还原/0 错误）。
- **D Photo 数据快照层 + E 卡牌移动逻辑**：syncPlayers 读 roster/seat/general/hp/marks，MoveCards 区域归属、vanishTimer、goBack 归位、footnote/虚拟牌名忠实还原。
- **N 资源寻址核心**：SkinBank/RoomLogic 路径规则重实现为 skin.ts+audio.ts，audio.json/images.json/anim.json 清单查表等价替代运行时读盘；系统音效/技能阵亡配音多候选 fallback/BGM 完全还原。
- **M 角色推测链路**：RoleComboBox/assumptionBox/optionPopupBox 1:1 还原。

## 6. 报告导航
- `AUDIT_PLAN.md` — 审计规划、范围边界、架构事实、记录格式（含 `修复:` 字段约定）。
- `00-phase0-inventory.md` + `00-inventory-*.csv` — 独立枚举的命令契约与文件清单。
- `A-`…`P-` 共 16 份 Phase 报告 — 逐条记录（状态/原版位置/web 位置/差异）。
- 各 Phase 报告结尾均有该阶段状态计数表 + 未还原/还原错误序号索引。

> **修复闭环**：缺口被修复/补全/决策后，在对应 Phase 报告的条目内追加 `- 修复: <状态>` 行（`已修复并验证`/`已修复未验证`/`用户同意忽略`/`待修复`），并同步该条目的 `- 状态:`、Phase 计数表，以及本文件 §2 计数与 §3/§4 的相关行。详见 `AUDIT_PLAN.md` §6 与 CLAUDE.md「审计闭环」节。本文件 §2 的计数为 2026-06-12 审计时的初始值，修复推进后以各 Phase 报告的 `修复:` 标注为准。

## 7. 自检结果（AUDIT_PLAN §9）
- 禁用模糊词扫描：`等等`/`之类`/`以及其他`/`若干` 全 0 命中（已修正 C9 一处「若干」为精确差值表述）。
- QML 文件计数 = 151（Phase 0 校验通过）。
- 条目总数 459 = 各 Phase 之和（A27+B44+C30+D67+E38+F19+G23+H27+I18+J26+K34+L19+M17+N34+O11+P25）。
