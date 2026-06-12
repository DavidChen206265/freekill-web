# Phase F — 技能区 + 技能交互控件 还原审计

原版：`FreeKill-sourcecode/`（37f8c12 / v0.5.20）
web：`freekill-web/`

架构说明：web 的技能判定逻辑由 client.lua / ui_emu 在 wasmoon 原样运行；本审计核对的是 **QML 视觉/交互呈现层**（SkillArea/SkillButton/LimitSkill*/SkillInteraction/*）在 web TS/TSX 中的还原。技能区按钮的可用/选中状态来自 ui_emu `UpdateRequestUI` 增量（interactionStore.skills），技能列表来自快照 `__fkReadSkills`（GetMySkills+GetSkillData）。

---

### F1 SkillArea::分组布局（prelight/active/notactive 三栅格）
- 状态: 简化还原
- 原版: `Fk/Components/LunarLTK/SkillArea.qml`:8-114 (Flickable + grid0/grid1/grid2)
- web : `apps/web/src/table/Dashboard.tsx`:116-138 (单一 `styles.skills` flex column)
- 原版行为: Flickable（可滚动，contentX 右对齐）含三个独立 Grid：grid0=prelight_skills、grid1=active_skills、grid2=not_active_skills；每栅格列数随语言（zh: prelight/active 2列, notactive 3列；非 zh 1列）；`onItemAdded: forceLayout()`；宽 min(180)、高 min(200)。
- web 行为: 单个 flexbox column（`flexDirection:'column'`, `flexWrap:'wrap'`, maxHeight 140, right:195 bottom:8）遍历 `selfSkills` 全量渲染，按 `freq==='active'` 区分可点击 vs locked 样式。无 prelight 分组、无三栅格、无语言相关列数、无滚动容器。
- 差异: 仅简化——分组合并为单列表，prelight 组完全缺失（见 F7），布局列数/滚动未还原；功能上 active/notactive 仍区分。

### F2 SkillButton::active 三态贴图（normal/pressed/disabled）
- 状态: 简化还原
- 原版: `SkillButton.qml`:28-43 (Image source 按 enabled/pressed 选 normal/pressed/disabled)
- web : `apps/web/src/table/Dashboard.tsx`:121-136 (button + 内联 style)
- 原版行为: 背景图 `image/button/skill/active/{normal|pressed|disabled}`；pressed 由 TapHandler 切换；disabled 时 pressed 强制 false（:20-23）。
- web 行为: 无贴图，纯 CSS：`styles.skill`（默认）/`styles.skillSelected`（selected 金色）/`styles.skillIdle`（opacity .5）。selected 取自 interactionStore，等价 pressed。三态语义在（idle/selected/可用）层面还原，但用色块代替原版按钮贴图。
- 差异: 仅简化——视觉用 CSS 色块替代原版 PNG 按钮皮肤；交互态（可用/选中/不可用）保留。

### F3 SkillButton::active "&" 附属技后缀（normal-attach）
- 状态: 未还原
- 原版: `SkillButton.qml`:38-40 (`orig.endsWith("&")` → suffix += "-attach")
- web : 无
- 原版行为: 当 active 技能 orig 以 "&" 结尾（附属技/卡牌技），启用态贴图加 `-attach` 后缀以区分外观。
- web 行为: 无对 orig "&" 后缀的任何分支；附属技与普通主动技外观一致。

### F4 SkillButton::notactive（被动技，无按钮底）
- 状态: 简化还原
- 原版: `SkillButton.qml`:25-26,33-35 (type notactive: 无背景图, 宽=文字宽, 高24)
- web : `apps/web/src/table/Dashboard.tsx`:130,270-271 (`styles.skillLocked`)
- 原版行为: notactive 类型不画按钮背景，仅文字+渐变描边，尺寸更小（h24）。
- web 行为: 用 `skillLocked` 灰底样式渲染，`onClick` 为 undefined（不可点）。区分出被动技但仍画了色块底，尺寸不区分。
- 差异: 仅简化——被动技画了灰底而非原版"仅文字"，尺寸不区分。

### F5 SkillButton::locked（锁定渐变 + 锁图标）
- 状态: 未还原
- 原版: `SkillButton.qml`:73-101 (locked 时 LinearGradient 切灰色系 + locked.png 锁图标 z2 opacity.8)
- web : 无
- 原版行为: `root.locked`（来自 `getSkillStatus().locked`，UpdateSkill 回调刷新）时文字渐变变灰（#CCC8C4/#A09691/#787173），并叠加 locked.png 锁图标。
- web 行为: web `__fkReadSkills` 输出 {orig,name,freq,frequency} **不含 locked 字段**；vmStore 在每包后重读 readSkills 但无 locked。无 UpdateSkill→locked 刷新、无锁图标、无灰渐变。技能被禁用（如失效）时 web 无视觉反馈。

### F6 SkillButton::times（发动次数角标）
- 状态: 未还原
- 原版: `SkillButton.qml`:103-162 (times>-1 时右上角圆形角标显示次数)
- web : 无
- 原版行为: `root.times`（来自 `getSkillStatus().times`，UpdateSkill RoomLogic.js:718 刷新）>-1 时右上画圆角边框 + 数字（带 glow/渐变），locked 时变灰。
- web 行为: `__fkReadSkills` 不含 times；Dashboard 技能按钮无任何次数角标。

### F7 SkillArea::prelight（预亮技能 + PrelightSkill 命令）
- 状态: 未还原
- 原版: `SkillButton.qml`:45-52 (prelight/unprelight 图), `SkillArea.qml`:44-62 (prelight grid + notifyServer "PushRequest" prelight), RoomLogic.js:1197-1203 (`PrelightSkill` callback → dashboard.prelightSkill)
- web : 无（grep `prelight` 全仓 0 命中）
- 原版行为: prelight 类技能单独成组，点击切换 prelighted 并向服务器发 `PushRequest,prelight,orig,bool`；收 `PrelightSkill` 命令更新亮灭；prelight/unprelight 两张贴图。
- web 行为: 完全无 prelight 概念。`addSkill(name, prelight)` 的 prelight 维度丢失（readSkills 不区分），无 PrelightSkill 命令处理，无 PushRequest prelight 上报。预亮类技能（如界孙权"制衡"预亮机制相关）无法在 web 触发。

### F8 SkillButton::交互手势（左键 toggle / 双击 / 右键·长按详情）
- 状态: 简化还原
- 原版: `SkillButton.qml`:164-207 (TapHandler: 左键/无按钮 toggle pressed；双击 doubleTapped→activateSkill doubleClick；右键/长按→skillDetail ToolTip)
- web : `apps/web/src/table/Dashboard.tsx`:38-42 (clickSkill: 单击 toggle selected)
- 原版行为: 左键单击切 pressed→`activateSkill(orig,pressed,"click")`；双击→`activateSkill(orig,true,"doubleClick")`（快速发动）；右键或长按弹 ToolTip 显示技能名+描述（富文本）。
- web 行为: 仅单击 → `interact('SkillButton',name,'click',{selected})`。无双击发动（doubleClick 全仓 0 命中），无右键/长按技能详情 ToolTip。
- 差异: 仅简化——双击快速发动、右键/长按技能描述提示均缺失；基本单击发动还原。

### F9 SkillInteraction::spin（数字微调器）
- 状态: 完全还原
- 原版: `SkillInteraction/SkillSpin.qml`:9-18 (SpinBox, from/to, onValueChanged→updateRequestUI "Interaction","1","update",value)
- web : `apps/web/src/table/Dashboard.tsx`:184-197 (SpinInteraction −/value/+)
- 原版行为: SpinBox 限 [from,to]，value 变化即 `updateRequestUI("Interaction","1","update",value)`；创建时 clicked() 上报 default。
- web 行为: −/+ 按钮限 [from,to]（`val<=from`/`val>=to` 禁用），变化即 `onUpdate(n)`→interact("Interaction","1","update")；mount 时 `useEffect(()=>onUpdate(val))` 上报初值（spec.default||from）。值域、上报路径、初值均一致。

### F10 SkillInteraction::combo（下拉选择）
- 状态: 简化还原
- 原版: `SkillInteraction/SkillCombo.qml`:8-42 (MetroButton, onClicked 弹 ChoiceBox/DetailedChoiceBox 选项框, answer→updateRequestUI)
- web : `apps/web/src/table/Dashboard.tsx`:167-182 (ComboInteraction: 点击循环 enabled choices)
- 原版行为: 按钮文字=当前 answer(processPrompt)；点击弹出 ChoiceBox（detailed 时 DetailedChoiceBox 带描述）网格选项框，从 all_choices 渲染、choices 可选；选完 answer=all_choices[result]；`all_choices.length<2` 时不弹。default 来自 `default`(spec.default)。
- web 行为: 按钮点击**循环**（cycle）enabled 子集（`spec.choices`，回退 all_choices），非弹出选项框；`enabled.length<2` 不循环；mount 上报 initial(spec.default||enabled[0])。审计注释 #6/#8：已修复仅在 enabled 内循环、default 取 spec.default。
- 差异: 仅简化——用"循环按钮"替代原版弹出选项网格；`detailed`（带描述的 DetailedChoiceBox）未还原；选项多时循环操作较繁但功能等价，上报值正确。

### F11 SkillInteraction::cardname（牌名选择）
- 状态: 简化还原
- 原版: `SkillInteraction/SkillCardName.qml`:8-37 (MetroButton, onClicked 弹 CardNamesBox 牌名网格, all_names/card_names, answer→updateRequestUI)
- web : `apps/web/src/table/Dashboard.tsx`:155,167-182 (cardname 复用 ComboInteraction)
- 原版行为: 点击弹 `CardNamesBox.qml`（带牌名/牌图的选择框）：all_names=all_choices、card_names=choices(可选)、prompt=skill；选完 answer=box.result。default 来自 `default_choice`(extra_data)。`choices.length<2 && includes(answer)` 时不弹。
- web 行为: 与 combo 同走 ComboInteraction（cycle 按钮，文字 tr(val)）；default 正确取 `spec.default_choice`（:172）。无 CardNamesBox 牌名/牌图网格弹框。
- 差异: 仅简化——无牌名图形选择框，退化为文字循环按钮；default_choice 已正确区分，上报值正确。

### F12 SkillInteraction::checkbox（多选框）
- 状态: 简化还原
- 原版: `SkillInteraction/SkillCheckBox.qml`:8-46 (MetroButton, onClicked 弹 CheckBox/DetailedCheckBox, min_num/max_num/cancelable, answer→updateRequestUI)
- web : `apps/web/src/table/Dashboard.tsx`:204-224 (CheckInteraction 内联 chip)
- 原版行为: 文字=tr("AskForChoices")；onClicked 先上报 []，弹 `CheckBox.qml`（detailed→DetailedCheckBox 带描述）多选框：options=choices、all_options=all_choices、min_num/max_num、确认后 answer=result.map→all_choices[i]；创建时 clicked() 上报 []。cancelable 提供取消（上报 []）。
- web 行为: 内联 chip 行（非弹框）：渲染 all_choices，点击 toggle，`picked.length>=max` 时不再加（max 内联强制）；min_num 由 ui_emu 的 OK 可用性把关（注释 #7）；mount 上报 []；cancelable 时提供"清空"chip→[]。
- 差异: 仅简化——用内联 chips 替代弹出多选框；`detailed`（DetailedCheckBox 描述）未还原；min/max/初值[]/取消语义保留，上报值（string[]）正确。

### F13 SkillInteraction::custom（扩展 QML 控件）
- 状态: 未还原（合理缺口）
- 原版: `Room.qml`:806-812 (`case "custom"` → Qt.createComponent(Cpp.path+qml_path))
- web : `apps/web/src/table/Dashboard.tsx`:158-159 (InteractionPanel default → return null)
- 原版行为: custom 类型动态加载扩展提供的 .qml 文件作为交互控件。
- web 行为: 显式 `return null`（注释"custom (extension QML) — not supported in the web port"）。Web 端无法运行扩展 QML，属架构性合理缺口。

### F14 LimitSkillArea::Photo 限定技区（UpdateLimitSkill）
- 状态: 简化还原
- 原版: `Fk/Components/LunarLTK/Photo/LimitSkillArea.qml`:8-41 (ColumnLayout of LimitSkillItem, update(skill,times)), RoomLogic.js:1509-1518 (`UpdateLimitSkill`→photo.updateLimitSkill)
- web : `Photo.tsx` LimitSkillArea + `stores/limitSkillStore.ts` + `vmStore` UpdateLimitSkill case
- 原版行为: 每个 Photo 上一列限定/觉醒/转换/任务技标记，收 `UpdateLimitSkill(id,skill,time)` 命令调 update：times==-1 移除、>-1 追加/更新。
- web 行为: `UpdateLimitSkill` 出 KNOWN_DEFERRED,vmStore 消费→limitSkillStore.update(pid,skill,times,skilltype,label),Photo 右上 LimitSkillArea 渲染;times==-1 移除(quest 的 -1 保留=未触发)。
- 差异: 简化——限定技区本身还原;banner(SetBanner)/标记区显隐(UpdateMarkArea)仍 deferred。
- 修复: 已修复并验证 (见 D56;7 单测 + 真 VM skillData 验证。2026-06-12,未还原→简化还原。)

### F15 LimitSkillItem::技能类型态（limit/wake/quest/switch + 已用图）
- 状态: 简化还原
- 原版: `Fk/Components/LunarLTK/Photo/LimitSkillItem.qml`:7-78
- web : `stores/limitSkillStore.ts` limitSkillRender + `Photo.tsx` LimitSkillArea item + skin.limitSkillBg
- 原版行为: 按 skilltype 渲染不同底图（SkinBank.limitSkillDir+type）与状态：
  - limit: usedtimes>=1 显红"X"+底图切 `limit-used`，否则 `limit`
  - wake: 仅 usedtimes>0 时可见
  - switch（转换技）: usedtimes<1 用 `switch`，否则 `switch-yin`（阴态）
  - quest（任务技）: usedtimes>1 显"X"+`limit-used`
  - 技能名文字（Lua.tr）+ 描边；onSkillnameChanged 据 getSkillData.frequency/switchSkillName 决定 skilltype 与可见性。
- web 行为: limitSkillRender 1:1 照搬上述四类规则(limit X+limit-used / wake 觉醒后才显 / switch 阳阴 / quest 失败 X);skilltype 由 skillData(frequency/switchSkillName)解析;技能名 tr+描边;bg 走 skin.limitSkillBg(/fk/image/photo/skill/*)。
- 差异: 简化——渲染规则全还原;唯字体(li2/libian)与原版 0.45 缩放尺寸为近似。
- 修复: 已修复并验证 (limitSkillRender 7 单测覆盖四类全部状态;真 VM 验证 skillData。2026-06-12,未还原→简化还原。)

### F16 Dashboard::SpecialSkills 单选（重铸/正常使用）
- 状态: 完全还原
- 原版: `Room.qml`:437-449 (RadioButton 组, updateRequestUI "SpecialSkills","1","click",modelData; 可见条件 count>1 或单项非 "_normal_use")
- web : `apps/web/src/table/Dashboard.tsx`:47-101 (clickSpecial + showSpecial + 单选渲染)
- 原版行为: 选牌时若有特殊用法（_normal_use/recast 等）显单选钮组；默认选 index0；点击→`updateRequestUI("SpecialSkills","1","click",name)`；可见=`count>1 || [0]!=="_normal_use"`。
- web 行为: `specialSkills` 渲染单选 pill，默认选 [0]（:31-33），点击 `interact('SpecialSkills','1','click',name)`；`showSpecial` 条件 `length>1 || [0]!=='_normal_use'`（:53-54）与原版一致；●/○ 单选点。逻辑/可见条件/上报路径完全对应。

### F17 Dashboard::expandPile 展开私堆（如手牌般使用的牌）
- 状态: 完全还原
- 原版: `lua/lunarltk/core/skill_type/active.lua` expandPile（client.lua 注入手牌区带脚注）
- web : `apps/web/src/stores/interactionStore.ts`:55-57,113-117,126-127 (expandCards), `table/CardLayer.tsx`:12
- 原版行为: 展开技（遗计/私堆）以 `reason="expand"` 的 CardItem 注入可点击牌（带 footnote），retract 时移除。
- web 行为: interactionStore 识别 `ui_data.reason==='expand'` 的 _new CardItem，存 expandCards{cid:{footnote}}，_delete/retract 时移除；CardLayer 消费渲染。增删与脚注均还原。

### F18 ViewAsSkill/ActiveSkill::客户端判定（cardFilter/feasible/canUse 等）
- 状态: 完全还原（VM 原样运行）
- 原版: `lua/lunarltk/core/skill_type/active.lua`:34-189, `view_as.lua`:28-203
- web : VM 内 client.lua/这些 lua 文件在 wasmoon 原样执行；ui_emu 据其结果产出 UpdateRequestUI 增量 → `interactionStore.applyChange`（牌/目标/按钮 enabled/selected）。
- 原版行为: cardFilter/targetFilter/feasible/getMin·MaxCardNum/getMin·MaxTargetNum/withinDistanceLimit 等决定选牌/选目标合法性与确认键可用。
- web 行为: 这些 Lua 在 VM 原样跑，结果经 ui_emu→increment 反映到 cards/photos/buttons 状态；TS 不重写判定，仅渲染。属架构既定的"逻辑在 VM"——完全还原。

### F19 VisibilitySkill::cardVisible/roleVisible（UI 可见性状态技）
- 状态: 完全还原（VM 原样运行）
- 原版: `lua/lunarltk/core/skill_type/visibility.lua`:1-33
- web : VM 内原样执行；牌面朝向/身份显隐经 readPlayers/readCards 快照反映（CardFaceView faceUp、role 显示）。
- 原版行为: cardVisible/moveVisible/roleVisible 返回某牌/某身份对某人是否可见，影响 UI 牌面与身份呈现。
- web 行为: 逻辑在 VM 中运行，结果通过玩家/牌快照镜像到渲染层；非 TS 重写。属既定架构——完全还原。

---

## 状态计数

| 状态 | 数量 | 序号 |
|------|------|------|
| 完全还原 | 5 | F9, F16, F17, F18, F19 |
| 简化还原 | 9 | F1, F2, F4, F8, F10, F11, F12, F14, F15 |
| 还原错误 | 0 | — |
| 未还原 | 5 | F3, F5, F6, F7, F13(合理) |

> 注：F18/F19 为"VM 原样运行"型完全还原（非 TS 重写）。未还原中 F13(custom 扩展 QML) 为架构性合理缺口。F14/F15 于 2026-06-12 未还原→简化还原(LimitSkillArea 已实现)。

实际逐项：完全还原 5（F9, F16, F17, F18, F19）；简化还原 9（F1, F2, F4, F8, F10, F11, F12, F14, F15）；还原错误 0；未还原 5（F3, F5, F6, F7, F13）。

## 未还原 / 还原错误 序号索引
- 未还原：**F3**(active "&" 附属技后缀)、**F5**(技能 locked 灰渐变+锁图标)、**F6**(技能 times 次数角标)、**F7**(prelight 预亮技能 + PrelightSkill 命令 + PushRequest 上报)、**F13**(custom 扩展 QML 交互控件，架构性合理缺口)
- 还原错误：无
- （F14/F15 LimitSkillArea 已于 2026-06-12 简化还原）
