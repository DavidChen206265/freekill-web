# Phase H — 动画/特效/聊天动画 还原审计

原版：`/home/ubuntu/freekill/freekill-vps-deploy/FreeKill-sourcecode/`（37f8c12/v0.5.20）
web：`/home/ubuntu/freekill/freekill-vps-deploy/freekill-web/`

逐行实读对照。四态：未还原 / 简化还原 / 还原错误 / 完全还原。

---

## 一、特效引擎基础（PixmapAnimation 帧序播放器）

### H1 引擎::PixmapAnimation 逐帧精灵播放器
- 状态: 简化还原
- 原版: `Fk/Components/LunarLTK/PixmapAnimation.qml`:27-98（Repeater 帧 Image + Timer 50ms 推进 + start/stop/loop/keepAtStop + loaded/started/finished 信号；`Backend.ls(folder).length` 取帧数）
- web : `apps/web/src/table/PhotoEffects.tsx`:88-149 (`EmotionSprite`)
- 原版行为: 加载目录下全部编号帧 Image；Timer interval 50ms repeat；currentFrame 推进，前帧 visible=false 后帧 true；到尾若 loop 则归零，否则 stop + finished()；keepAtStop 控制末帧是否保留；autoStart 在 loaded 后启动；fileModel 由 `Backend.ls` 在 Component.onCompleted 数出。
- web 行为: fetch `/fk/anim.json` 取帧数（浏览器不能 ls 目录，构建期生成 manifest）；预加载全部帧 PNG 后再播；用 requestAnimationFrame + 墙钟 `performance.now()` 推进（非 timer tick）；FRAME_MS=50 一致；支持 loop；600ms 预载超时兜底；非 loop 末帧后 setFrame(-1) 隐藏（≈非 keepAtStop）。
- 差异: 帧数来源由 manifest 取代 ls（必要的浏览器适配，行为等价）；驱动方式改 rAF+墙钟（比 QML 50ms Timer 更稳，视觉等价）；未暴露 keepAtStop/started 信号；selected/selectable 循环精灵仍缺失。

---

## 二、Photo 上的逐帧循环精灵（未经 server 指令，纯状态驱动）

### H2 Photo精灵::playing（出牌中循环光环）
- 状态: 完全还原
- 原版: `Fk/Components/LunarLTK/Photo.qml`:51-59 (`animPlaying`，source `pixAnimDir+"playing"`，loop:true，scale 0.825，visible/running 绑定 `root.playing`)
- web : `apps/web/src/table/Photo.tsx`:173 (`EmotionSprite emotion="playing" scale=0.825 loop`) + `clientVm.ts`:191 (`ClientInstance.current`)
- 原版行为: 当前行动玩家 Photo 上持续循环播放 playing 光环动画精灵（PropertyUpdate phase<8 → playing=true，RoomLogic.js:663-666）。
- web 行为: VM 快照标记当前行动者，Photo 上持续循环播放原版 `playing` 帧动画，scale 0.825。
- 差异: 无。
- 修复: 已修复并验证 (EmotionSprite 新增 loop;Photo 渲染原版 playing 帧;gameStore/skin 单测、typecheck、build 全绿。2026-06-13,未还原→完全还原。)

### H3 Photo精灵::selected（候选已选循环光环）
- 状态: 未还原
- 原版: `Photo.qml`:61-69 (`animSelected`，source `pixAnimDir+"selected"`，loop:true，scale 0.825，visible `state==="candidate" && selected`)
- web : 无
- 原版行为: 选人框（如神鲁肃选人、目标选择 candidate 态）已选中的 Photo 循环播放 selected 光环精灵。
- web 行为: 仅 `targetState.selected` → 红色 3px 静态描边（Photo.tsx:67-68），无循环精灵。
- 差异: 循环精灵缺失，以静态描边替代。

### H4 Photo精灵::selectable（候选可选循环光环）
- 状态: 未还原
- 原版: `Photo.qml`:71-79 (`animSelectable`，source `pixAnimDir+"selectable"`，loop:true，scale 0.75，visible `state==="candidate" && selectable`)
- web : 无
- 原版行为: candidate 态可选 Photo 循环播放 selectable 光环精灵。
- web 行为: `selectable` → 绿色 3px 静态描边（Photo.tsx:68），无循环精灵。
- 差异: 循环精灵缺失，以静态描边替代。

---

## 三、server Animate 家族特效

### H5 Animate::Indicate（指示线 who→whom）
- 状态: 简化还原
- 原版: `IndicatorLine.qml`:1-104 + `RoomLogic.js`:1313-1320 / `doIndicate`:568-594
- web : `apps/web/src/table/AnimationLayer.tsx`:50-122 (`IndicateLines`) + `vmStore.ts`:135-143
- 原版行为: 每条 to 链 `doIndicate(from,[item[0]])` 再 `doIndicate(item[0], item.slice(1))`（多跳分段）；线为 Rectangle 高度=两点距离×ratio，双层渐变（外层白→灰 alpha 0.12，内层白→`Qt.lighter(color)`），宽 6/内 3；Rotation 按 atan2 角度；动画 ratio 0→1 OutCubic 200ms（线生长）→ 停 200ms → opacity→0 InQuart 300ms（共 700ms）；颜色 #96943D；无箭头。
- web 行为: SVG line 段，从 from→链中每节点；颜色 #96943D 宽 6 + 白色 2px alpha0.35 叠加；起点画 5px 圆点、终点画三角箭头（QML 无）；3 段 WAAPI opacity（in 180ms→hold→out，总 1100ms，linear）；多跳链逐段连接已实现。
- 差异: 时长 700ms→1100ms（有意拉长便于无战报看清，作者注释）；线无"生长"动画（QML ratio 0→1 增高），web 直接整段淡入；缓动 OutCubic/InQuart→linear；新增箭头+源点（QML 无，增强而非还原）；渐变描边样式不同（QML 双层渐变 vs web 实色+白描边）；并额外 pushTargeted 触发红环脉冲（见 H6，QML 无此物）。

### H6 Animate::Indicate衍生::TargetPulse（目标红环脉冲）
- 状态: 完全还原
- 原版: 无（QML 仅画指示线，无被指目标的环形脉冲）
- web : `vmStore.ts`:135-142 (Indicate case，仅 pushScene 画线)
- 原版行为: 不存在。
- web 行为: 现仅画 Indicate 指示线，与原版一致（红环脉冲已移除）。
- 差异: （已消除）web 曾自创红色 boxShadow 环脉冲 900ms，原版无对应物。
- 修复: 已修复并验证 (移除 PhotoEffects.tsx 的 TargetPulse 组件+targetRing 样式、animationStore 的 targeted 状态与 pushTargeted action、vmStore Indicate 分支的 pushTargeted 调用、对应单测;现 Indicate 只画原版有的指示线。typecheck/build/150 web 测试全绿,2026-06-12)

### H7 Animate::Emotion（表情/卡牌精灵 setEmotion）
- 状态: 简化还原
- 原版: `RoomLogic.js`:411-471 (`setEmotion`) + Animate 分派 1321-1323
- web : `vmStore.ts`:144-151 (`Emotion`) + `PhotoEffects.tsx`:88-149 (`EmotionSprite`) + CardLayer（is_card）
- 原版行为: 路径先试 `pixAnimDir+emotion` 再试 `AppPath+/emotion`，`Backend.exists`/`isDir` 校验；非目录（单图 emotion）TODO 未实现直接 return；createObject PixmapAnimation 挂到 photo（或 tableCard），scale 0.75，anchors.centerIn；is_card 时 started→photo.busy=true、finished→busy=false+destroy；非 card finished→destroy。
- web 行为: `resolveAnim` 解析 bare-name（→`image/anim/<e>`）与 `packages/<pkg>/image/anim/<name>` 两种路径；is_card → pushCard，否则 pushPlayer；EmotionSprite scale 0.75 居中一次性播放；帧数取自 anim.json，0/缺失→不播（不杜撰美术）。
- 差异: 单图（非目录）emotion 原版也未实现（TODO），故等价；is_card 的 `photo.busy` 锁（阻止该桌面牌期间被其它动画打断）web 无对应——card 表情期间无 busy 互斥（影响极小）；路径校验逻辑由 manifest 帧数=0 兜底替代。

### H8 Animate::InvokeSkill（技能发动横幅）
- 状态: 简化还原
- 原版: `SkillInvokeAnimation.qml`:1-80 + `RoomLogic.js`:1335-1353
- web : `PhotoEffects.tsx`:157-184 (`SkillBanner`) + `vmStore.ts`:152-162
- 原版行为: 挂到 photo 居中；typeAnim=PixmapAnimation `skillInvoke/<skill_type>` scale0.75 keepAtStop（背景精灵）；bigSkillName 文字初始 horizontalCenterOffset 100、opacity0，字号 `max(24,48-(len-2)*6)`，li2Name 字体，白色 Outline；textAnim 并行：opacity 0→1 InQuart 200ms + offset 100→0 InQuad 240ms；随后 pauseAnim：停 1200ms → opacity→0 OutQuart 200ms → visible=false+finished（总 ≈1640ms）。
- web 行为: skillType 颜色映射（special/big/switch/active/notactive）；背景 `EmotionSprite emotion="skillInvoke/<type>"` scale0.6（一次性，非 keepAtStop）；WAAPI 4 关键帧：opacity0+translateX(60px)→在 240/1640 到位→保持到 1440/1640→淡出，总 1640ms fill:forwards；字号 `max(14,22-(len-2)*2)`（按 photo 缩小）。
- 差异: 字号公式缩小（适配 photo 框，非全屏）；位移用 translateX(60px) 替代 anchors offset 100（方向一致，幅度不同）；背景精灵非 keepAtStop（QML 末帧保留，web 隐藏）；skillType 着色 web 自加（QML 无文字色区分，仅靠背景精灵）；整体节奏 200/240/1200/200ms 基本一致。

### H9 Animate::InvokeUltSkill（限定技大招全屏动画）
- 状态: 简化还原
- 原版: `UltSkillAnimation.qml`:1-215 + `RoomLogic.js`:1355-1367
- web : `AnimationLayer.tsx`:124-150 (`UltSkillBanner`) + `vmStore.ts`:164-169
- 原版行为: 全屏；黑色半透明 mask（opacity0.5）；两层 GridLayout（bg1/bg2 各 40 个台词 Text，`$skill_general1/2` 或 `$skill1/2` 回退 "Ultimate Skill Invoked!"，30px libianName）持续横向滚动（x 动画 2000ms）；GeneralCardItem 武将卡 scale2.7→从右侧飞入（opacity0→1，scale→3.3，x 到中心-40，500ms InQuad）；skill 大字 li2Name 40px snow Outline scale3 从底部升起（y 多段动画）；三段 SequentialAnimation：飞入→中段位移 1000ms→淡出退场（scale 回 2.7，x 退到 -100-width，500ms OutQuad）；结束清 bigAnim.source。
- web 行为: 全屏居中单行大字 `skillName`（56px #E4D5A0 阴影）；WAAPI scale0.7→1（淡入 15%）→保持 80%→scale1.1 淡出，总 2000ms ease-out；无 mask、无滚动台词、无武将卡飞入、无背景文字阵列。
- 差异: 仅保留"中心技能大字+缩放淡入淡出"，去掉了 mask、双层 40×2 滚动台词背景、武将立绘飞入飞出三段动画。作者注释明示"General art omitted (scaffold)"。视觉差距大但时长 2000ms 与 server delay 对齐。

### H10 Animate::SuperLightBox（剧情/特殊全屏动画）
- 状态: 未还原
- 原版: `RoomLogic.js`:1326-1334（`bigAnim.source = AppPath+"/"+path`，`item.loadData(jsonData)`，加载包内自定义 qml 全屏动画）
- web : `AnimationLayer.tsx`:38-43 (`SelfRemove`，立即移除) + `vmStore.ts`:170-175
- 原版行为: 按 server 下发 path 动态加载对应 .qml（包特定剧情/技能全屏演出）并 loadData。
- web 行为: pushScene kind:'superLightBox' 后 SelfRemove 立即从 store 移除，渲染 nothing。
- 差异: 完全不渲染（作者注释 "package-specific = M5，out of scope"）。

### H11 Animate::LightBox（旧式灯箱）
- 状态: 完全还原
- 原版: `RoomLogic.js`:1324-1325（`case "LightBox": break;` 空操作）
- web : `vmStore.ts`:176 注释说明 + default break（无处理）
- 原版行为: QML 本身即 no-op。
- web 行为: 同为 no-op。
- 差异: 无。

---

## 四、LogEvent 家族（伤害/掉血/死亡 视觉+音效）

### H12 LogEvent::Damage::tremble（受伤抖动）
- 状态: 完全还原
- 原版: `Photo.qml`:336-357 (`trembleAnimation`) + `RoomLogic.js`:1377-1384
- web : `PhotoEffects.tsx`:65-79 (`TrembleDriver`) + `vmStore.ts`:200-208
- 原版行为: x → x-15 InQuad 100ms → x 回原位 OutQuad 100ms（共 200ms 左右摇）。
- web 行为: WAAPI translateX 0→-15px(ease-in,50%)→0(ease-out)，duration 200ms，作用于 photoBoxRef。
- 差异: 无（位移幅度 -15、时长 200ms、缓动方向一致）。

### H13 LogEvent::Damage::emotion+sound（伤害精灵+音效）
- 状态: 完全还原
- 原版: `RoomLogic.js`:1379-1383（`setEmotion(to,"damage")` + `playSound("./audio/system/"+damageType+(num>1?"2":""))`）
- web : `vmStore.ts`:201-207
- 原版行为: 播 damage 精灵 + 按 damageType（默认 normal_damage）+num>1 加"2"后缀的系统音。
- web 行为: pushPlayer damage 表情 + `playSystem(damageType + (damageNum>1?'2':''))`，默认 normal_damage。
- 差异: 无。

### H14 LogEvent::LoseHP（失血音效）
- 状态: 完全还原
- 原版: `RoomLogic.js`:1386-1388（`playSound("./audio/system/losehp")`）
- web : `vmStore.ts`:209 (`playSystem('losehp')`)
- 原版行为: 播 losehp。web 行为: 同。差异: 无。

### H15 LogEvent::ChangeMaxHp（减体力上限音效）
- 状态: 完全还原
- 原版: `RoomLogic.js`:1390-1394（num<0 → `losemaxhp`）
- web : `vmStore.ts`:210 (`if(num<0) playSystem('losemaxhp')`)
- 原版行为: num<0 播 losemaxhp。web 行为: 同。差异: 无。

### H16 LogEvent::PlaySkillSound（技能语音）
- 状态: 完全还原
- 原版: `RoomLogic.js`:1396-1426（试 `<skill>_<general>`→`<skill>_<deputy>`→`<skill>` 回退）
- web : `vmStore.ts`:211-216 (`playSkillSound`)
- 原版行为: 主将→副将→通用技能音三级回退。web 行为: 同传 general/deputy 回退到 actor mirror。差异: 无（属音效，非视觉动画，列名以完备）。

### H17 LogEvent::PlaySound（路径音效）
- 状态: 完全还原
- 原版: `RoomLogic.js`:1427-1430（`getAudioByPath` 播放）
- web : `vmStore.ts`:217 (`playByPath`)
- 差异: 无。

### H18 LogEvent::Death::voice（死亡语音）
- 状态: 完全还原
- 原版: `RoomLogic.js`:1432-1437（按死者 general death 音）
- web : `vmStore.ts`:218-223 (`playDeath(p.general)`)
- 差异: 无。

### H19 Photo死亡视觉::death overlay（阵亡贴图+灰度）
- 状态: 简化还原
- 原版: `Photo.qml`:226-239（saveme/surrender/role 死亡图，按 surrendered/dead/dying 切换，`getRoleDeathPic(role)`）+ `PhotoBase.qml`:181-187（Colorize saturation0 opacity 过渡 300ms 灰度化）
- web : `Photo.tsx`:88（`filter: grayscale(1) brightness(0.6)`）+ 176-179（`deathPic(role)` 阵亡贴图）
- 原版行为: 死亡→按身份贴 role 死亡图；投降→surrender 图；濒死(dying,!rest)→saveme 求救图；立绘 Colorize 去饱和 300ms 淡入灰度。
- web 行为: dead→灰度+压暗滤镜 + role 死亡贴图；dying 且未 dead→saveme 求救图；无投降 surrender 图、无 300ms 灰度过渡动画（直接切）。
- 差异: 缺投降图（surrender）；灰度无 300ms Behavior 过渡（瞬切）；death 贴图位置/缩放近似。
- 修复: 已修复并验证 (Photo 消费 dying 并渲染 saveme 原版贴图;skin 路径单测、typecheck、build 全绿。2026-06-13,仍为简化还原。)

---

## 五、ChatAnim 聊天动画（送礼：花/蛋/巨蛋/鞋/酒）

> 原版每种都是 from→to 的复杂多阶段精灵动画（飞行+碎裂帧+音效+散落随机偏移）。
> web 统一用单个 emoji glyph 从 from 飞到 to + 末端缩放 pop（`AnimationLayer.tsx`:158-190 `PresentFly`），**五种共用同一套简化逻辑**。

### H20 ChatAnim::Flower（送花）
- 状态: 简化还原
- 原版: `Fk/Components/LunarLTK/ChatAnim/Flower.qml`:1-172
- web : `AnimationLayer.tsx`:165-190 (`PresentFly`，glyph 🌹)
- 原版行为: egg 图按 atan 角度旋转，scale0.7→0.5 飞向 end 360ms，中途淡出；播 `fly1/2` 随机音；到位播 `flower1/2` 随机音；whip(`flower/egg<idx>`) idx++碎裂帧 + star 闪两次（opacity 脉冲，位置抖动）；whip 显示 1100ms 后淡出。
- web 行为: 🌹 emoji 从 from(scale0.6 opacity0)→pop scale1→飞到 to scale1→末端 scale1.4 淡出，720ms ease-out；无飞行旋转、无碎裂帧、无 star 闪烁、无音效。
- 差异: 真实精灵帧动画+随机音效+星星特效全部用单 emoji 飞行替代；无 fly/flower 音。

### H21 ChatAnim::Egg（砸蛋）
- 状态: 简化还原
- 原版: `ChatAnim/Egg.qml`:1-135
- web : `AnimationLayer.tsx`:165-190 (glyph 🥚)
- 原版行为: egg(`egg/egg`) scale0.7 opacity0→1 400ms，停 350ms，播 `fly1/2`；scale→0.4 飞向 end 500ms + rotation 360×2loops 250ms，中途淡出；播 `egg1/2`；whip(`egg/egg<idx>`) idx++ 碎裂两帧 + opacity 脉冲。
- web 行为: 🥚 emoji 同 H20 通用飞行逻辑（big=false）。
- 差异: 旋转飞入+碎裂帧+egg/fly 随机音全缺，单 emoji 替代。

### H22 ChatAnim::GiantEgg（巨蛋）
- 状态: 简化还原
- 原版: `ChatAnim/GiantEgg.qml`:1-135（同 Egg 但 egg scale 2.1、目标 scale1.2，巨大化）
- web : `AnimationLayer.tsx`:165-190（glyph 🥚，`big=true` → 末端 scale 2.2/2.6，fontSize 56）
- 原版行为: 与 Egg 相同流程但精灵放大（初始 scale2.1→1.2），含 fly/egg 随机音 + 碎裂帧 + 360°旋转。
- web 行为: 同款 🥚 emoji，big 分支放大到 2.2/2.6 倍、字号 56；无旋转/碎裂/音效。
- 差异: 唯一区别于普通蛋的是 web 放大了 emoji；精灵/音效/旋转/碎裂同样缺失。

### H23 ChatAnim::Shoe（扔鞋）
- 状态: 简化还原
- 原版: `ChatAnim/Shoe.qml`:1-251
- web : `AnimationLayer.tsx`:165-190 (glyph 👟)
- 原版行为: 先 7 只随机偏移小蛋(`shoe/egg`)依次飞出（loop7，每 120ms，飞 250ms 后切 whip `shoe/egg<idx>`碎裂 270ms + `egg1/2`音）；停 200ms 播 `shoe1`；主鞋 shoe+shoe_s 双层 scale0→1 飞向 end 660ms + rotation 360×2loops；到位 660ms 播 `shoe2` + hit(`shoe/hit<idx>`) 命中帧 idx1→10 300ms；末段鞋 opacity→0 下坠 20px。
- web 行为: 单 👟 emoji 通用飞行 720ms。
- 差异: 7 蛋齐射 + 双层旋转飞鞋 + 命中帧 + shoe1/shoe2/egg 多重音效 全缺；单 emoji 替代（差距最大之一）。

### H24 ChatAnim::Wine（敬酒/砸酒）
- 状态: 简化还原
- 原版: `ChatAnim/Wine.qml`:1-254
- web : `AnimationLayer.tsx`:165-190 (glyph 🍷)
- 原版行为: 开场播 `wine1`；7 只酒蛋(`wine/egg`)按角度旋转依次飞出（loop7 每 320ms，飞 250ms 后 whip `wine/egg<idx>` 碎裂 idx→18 370ms）；停 200ms 播 `wine2`；shoe+shoe_s(`wine/shoe`)双层 scale0→1 飞向 end 660ms + 旋转 360×2；hit(`shoe/hit<idx>`)命中帧；末段下坠淡出。
- web 行为: 单 🍷 emoji 通用飞行 720ms。
- 差异: wine1/wine2 音 + 7 酒蛋齐射 + 旋转碎裂帧 + 双层飞酒 + 命中帧 全缺；单 emoji 替代。

---

## 六、文字发光/渐变组件

### H25 GlowText（发光文字基础组件）
- 状态: 简化还原
- 原版: `Fk/Components/Common/GlowText.qml`:1-33（Text + Qt5Compat `Glow` 效果叠加，glow.radius/color/spread 可配）
- web : 无独立组件；散见 `textShadow` 模拟（如 `PhotoEffects.tsx`:190 banner、`AnimationLayer.tsx`:196 ultText）
- 原版行为: 文字外发光（GraphicalEffects.Glow），全项目复用（resting/玩家名/牌堆名等）。
- web 行为: 无统一 GlowText；各处用 CSS `textShadow` 近似发光；玩家名等用普通文字。
- 差异: 无专用发光组件，CSS textShadow 近似；spread/radius/glow.color 精细参数无法 1:1。

### H26 BigGlowText（牌堆名渐变发光大字）
- 状态: 未还原
- 原版: `Fk/Components/LunarLTK/BigGlowText.qml`:1-44（GlowText #E4D5A0 30px libianName + glow black spread0.3 radius5 + LinearGradient 三段渐变 #FEF7C2→#D2AD4A→#BE9878 金色覆盖）
- web : 无（grep `BigGlowText`/`LinearGradient` 在 table/ 仅命中倒计时条/卡牌 mark，无牌堆名渐变大字）
- 原版行为: 牌堆/弃牌堆标题用金色三段线性渐变 + 黑色外发光的大号黎扁体字。
- web 行为: 未找到对应渐变发光大字组件。
- 差异: 牌堆名金色渐变发光大字整体缺失。

---

## 七、SkinItem（皮肤选择项，含 chosen 标记）

### H27 SkinItem::chosen 标记（皮肤选中）
- 状态: 未还原
- 原版: `Fk/Components/LunarLTK/SkinItem.qml`:1-72（SkinArea 立绘 + 圆角 OpacityMask + 皮肤名 LiSu 描边 + `chosen.png` scale1.25 选中标记 + HoverHandler）
- web : 无（皮肤详情 cheat "SkinsDetail" 系 M5 范围，table/ 下未见 SkinItem 还原）
- 原版行为: 换肤面板每个皮肤项：圆角裁切立绘 + 顶部皮肤名 + 选中时叠 chosen.png 放大标记。
- web 行为: 未实现皮肤选择项（属换肤面板，Phase H 边缘）。
- 差异: 整体缺失（换肤面板未还原；与 PhotoBase 的 skinIcon 入口同属未还原范围）。

---

## 八、状态计数

| 状态 | 序号 | 计数 |
|------|------|------|
| 完全还原 | H2, H6, H11, H12, H13, H14, H15, H16, H17, H18 | 10 |
| 简化还原 | H1, H5, H7, H8, H9, H19, H20, H21, H22, H23, H24, H25 | 12 |
| 还原错误 | （无；H6 已修复并验证 2026-06-12） | 0 |
| 未还原 | H3, H4, H10, H26, H27 | 5 |
| 合计 | | 27 |

### 未还原索引
- H3 Photo精灵::selected（候选已选循环光环）
- H4 Photo精灵::selectable（候选可选循环光环）
- H10 Animate::SuperLightBox（剧情全屏动画）
- H26 BigGlowText（牌堆名渐变发光大字）
- H27 SkinItem::chosen（皮肤选中标记）

### 还原错误索引
- （无；H6 web 自创红环脉冲 已于 2026-06-12 移除，状态升级为完全还原）
