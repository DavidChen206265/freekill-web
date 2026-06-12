# Phase D — 玩家位 Photo 全栈审计

对照基准：原版 37f8c12/v0.5.20 `Fk/Components/LunarLTK/Photo.qml` + `PhotoBase.qml` + `MiscStatus.qml` + `Photo/` 全 14 文件
web：`apps/web/src/table/Photo.tsx` 及 HpBar/EquipArea/JudgeArea/MiscStatus/PhotoEffects/PhotoFocusBar/seatLayout + 数据源 `vm/clientVm.ts`(__fkReadPlayers) / `stores/gameStore.ts`

四态：未还原 / 简化还原 / 还原错误 / 完全还原

---

## A. PhotoBase.qml（底座：背景/将面/姓名/聊天/换肤）

### D1 PhotoBase::kingdom 背景框
- 状态: 完全还原
- 原版: PhotoBase.qml:36-41 (Image back, SkinBank.getPhotoBack(kingdom), scale 0.75)
- web : Photo.tsx:85 (`photoBack(player.kingdom)` styles.back cover)
- 原版行为: 按势力取背景图，居中 0.75 缩放。
- web 行为: `photoBack(kingdom)` 铺满 photo 框，objectFit cover。

### D2 PhotoBase::单将立绘
- 状态: 完全还原
- 原版: PhotoBase.qml:65-92 (generalImage, getGeneralPicture, PreserveAspectCrop, OpacityMask 圆角裁剪 174-179)
- web : Photo.tsx:88-100,229-242 (Portrait, generalPicCandidates, portraitClip 圆角 overflow hidden, objectFit cover)
- 原版行为: 单将占满 photoMask，PreserveAspectCrop，OpacityMask 裁圆角。
- web 行为: Portrait cover 填充，portraitClip borderRadius 6 + overflow hidden 裁剪；候选包遍历回退。

### D3 PhotoBase::双将分屏立绘
- 状态: 完全还原
- 原版: PhotoBase.qml:67-135 (generalImage width=parent/2 + deputyGeneralImage anchors.left=generalImage.right，各 dual/ 优先 getGeneralExtraPic("dual/"))
- web : Photo.tsx:90-94 (dual 时渲染两个 Portrait，flex:1 各占半)
- 原版行为: 主副将各占一半宽度，优先 dual/ 专用立绘。
- web 行为: flex 两列各半。generalPicCandidates 处理回退。
- 差异: 无（dual/ 专用图回退由 candidates 覆盖）。

### D4 PhotoBase::deputy-split 分隔线
- 状态: 未还原
- 原版: PhotoBase.qml:137-143 (Image deputySplit, photoDir+"deputy-split", opacity deputyGeneral?1:0)
- web : 无
- 原版行为: 双将时在中缝叠加一条分隔贴图。
- web 行为: 仅靠 flex 两列相邻，无中缝分隔贴图。

### D5 PhotoBase::主将名(竖排)
- 状态: 简化还原
- 原版: PhotoBase.qml:43-57 (generalName, x:5 y:21, libianName 16px, width:18 WrapAnywhere 竖排, lineHeight 14 FixedHeight, color white, Lua.tr(general))
- web : Photo.tsx:104,292 (generalName, writingMode vertical-rl, left4 top26 width15 13px)
- 原版行为: 竖排逐字换行将名，未选将时为空（general=""）。
- web 行为: writing-mode 竖排；但双将时显示 "主/副"（trName 拼接），未选将时显示 "未选将" 占位文字。
- 差异: 原版主名 Text 只显示主将名（副将名为 PhotoBase.qml:145-161 独立 deputyGeneralName，位于副将立绘上方 leftMargin -10 带 Outline）；web 把主副名合并塞进单个竖排块，且副名未独立定位到副将侧。未选将原版空字符串，web 加了 "未选将" 文字（原版无）。

### D6 PhotoBase::副将名(独立竖排,带描边)
- 状态: 未还原
- 原版: PhotoBase.qml:145-161 (deputyGeneralName, anchors.left=generalImage.right leftMargin -10, y:21, style Text.Outline, Lua.tr(deputyGeneral))
- web : 无（合并进 D5 trName）
- 原版行为: 副将名独立显示在副将立绘上方，带描边。
- web 行为: 副名仅作为 "主/副" 字符串的一部分显示在主名竖排块里。

### D7 PhotoBase::死亡/投降去色(Colorize)
- 状态: 简化还原
- 原版: PhotoBase.qml:181-187 (Colorize saturation 0, opacity (dead||surrendered)?1:0, 300ms 过渡)
- web : Photo.tsx:88 (portraitClip filter `grayscale(1) brightness(0.6)` when player.dead)
- 原版行为: 死亡或投降时立绘渐变为灰度。
- web 行为: 仅 dead 触发 grayscale+变暗；无 surrendered 触发（VM 未暴露 surrendered），无 300ms 过渡动画。
- 差异: 缺 surrendered 触发；无过渡动画；额外叠了 brightness 变暗（原版仅去色）。

### D8 PhotoBase::玩家名(顶部, Blocked前缀, elide)
- 状态: 简化还原
- 原版: PhotoBase.qml:197-214 (playerName GlowText, anchors.top topMargin 2, 12px, blockedUsers 加 "<Blocked> " 前缀, Self ElideNone 其余 ElideMiddle, glow.radius 6)
- web : Photo.tsx:166-167,321-322 (bar 底部 name, 12px, ellipsis nowrap)
- 原版行为: 姓名在 photo **顶部**，被屏蔽用户加前缀，居中描边发光。
- web 行为: 姓名在 photo **底部** bar，ellipsis 截断。
- 差异: 位置由顶部改到底部（web 自述为有意 deviation，见 Photo.tsx:296 注释）；无 blockedUsers "<Blocked>" 前缀；无 glow 发光样式。

### D9 PhotoBase::ChatBubble 聊天气泡
- 状态: 完全还原
- 原版: PhotoBase.qml:216-220,266-270 (Game.ChatBubble, z:9, chat() fade in/show/hold)
- web : Photo.tsx:206,256-266,303 (PhotoChatBubble, roomChatStore.bubbles, 2850ms 自动清, 顶部气泡)
- 原版行为: 顶部气泡淡入保持约 2.5s 淡出。
- web 行为: roomChatStore 驱动，2850ms 超时清除，顶部白底气泡。

### D10 PhotoBase::换肤图标 + Hover 触发
- 状态: 未还原
- 原版: PhotoBase.qml:222-264 (skinIcon, Hover 显示, TapHandler 打开 SkinsDetail, cooldownTimer 5s, getSkinsByName)
- web : 无（skin.ts 有 changeskin 历史注释但 Photo 内无换肤入口）
- 原版行为: 鼠标悬停且有皮肤可换时显示换肤按钮，点击打开皮肤选择。
- web 行为: 无换肤 UI。
- 差异: 整个换肤交互未实现（功能性缺口，非纯视觉）。

### D11 PhotoBase::座位移动动画(Behavior on x/y)
- 状态: 完全还原
- 原版: PhotoBase.qml:189-195 (Behavior on x/y, NumberAnimation 600ms InOutQuad)
- web : Photo.tsx:288 (styles.wrap transition left/top 600ms)
- 原版行为: 换座/重排时 photo 平滑滑动 600ms。
- web 行为: styles.wrap 加 `transition: left 600ms cubic-bezier(0.455,0.03,0.515,0.955), top 600ms ...`，换座/重排时平滑滑动，与原版一致（scale 变换不参与过渡）。
- 差异: （已消除）
- 修复: 已修复并验证 (Photo.tsx styles.wrap 加 left/top transition,照搬 PhotoBase.qml:189-195 的 600ms InOutQuad≈cubic-bezier(0.455,0.03,0.515,0.955);typecheck/build/150 测试全绿,2026-06-12)

---

## B. Photo.qml 主体覆盖层

### D12 Photo::playing 行动中动画(animPlaying)
- 状态: 未还原
- 原版: Photo.qml:51-59 (PixmapAnimation "playing", centerIn, loop, scale 0.825, visible root.playing)
- web : 无（VM 未暴露 playing/当前回合标记到 Photo）
- 原版行为: 轮到该角色行动时叠加循环旋转的 "playing" 光环动画。
- web 行为: 无行动中视觉标记。
- 差异: 当前行动者无任何高亮（focusStore 仅驱动 thinking 进度条，非 playing 光环）。

### D13 Photo::candidate selected 动画(animSelected)
- 状态: 简化还原
- 原版: Photo.qml:61-69 (PixmapAnimation "selected", visible state==candidate && selected, loop scale 0.825)
- web : Photo.tsx:67 (targetOutline `3px solid #e74c3c` when selected)
- 原版行为: 被选为目标时循环播放 "selected" 动画光环。
- web 行为: 红色静态描边。
- 差异: 动画光环 → 静态 outline。

### D14 Photo::candidate selectable 动画(animSelectable)
- 状态: 简化还原
- 原版: Photo.qml:71-79 (PixmapAnimation "selectable", visible state==candidate && selectable, scale 0.75)
- web : Photo.tsx:68 (targetOutline `3px solid #2ecc71` when selectable)
- 原版行为: 可被选为目标时循环 "selectable" 动画光环。
- web 行为: 绿色静态描边。
- 差异: 动画光环 → 静态 outline。

### D15 Photo::candidate disable 遮罩(disable.png)
- 状态: 简化还原
- 原版: Photo.qml:306-312 (Image "disable", visible state==candidate && !selectable && !selected, x23 y-16 scale 0.75)
- web : 无 disable 贴图；不可选时无任何遮罩（仅无 outline）
- 原版行为: 选择阶段不可选的目标叠加 disable 贴图变暗。
- web 行为: 仅没有绿/红 outline，未叠加变暗遮罩。
- 差异: 缺不可选时的 disable 变暗遮罩（对比 CardLayer 卡牌有 disable 遮罩，Photo 没有）。

### D16 Photo::醉酒红幕(drank)
- 状态: 未还原
- 原版: Photo.qml:91-99 (Rectangle red, opacity (drank<=0?0:0.4)+log(drank)*0.12, 300ms)
- web : 无（VM 未暴露 drank）
- 原版行为: 酒量>0 时红色半透明覆盖，随酒量加深。
- web 行为: 无。

### D17 Photo::休整(rest)文字组
- 状态: 未还原
- 原版: Photo.qml:101-140 (ColumnLayout restRect, "resting..." + rest 数 + "rest round num"，GlowText 多行)
- web : 无（VM 未暴露 rest）
- 原版行为: 离桌休整时显示 "resting..." + 剩余轮数。
- web 行为: 无。

### D18 Photo::装备背景(equipbg)
- 状态: 未还原
- 原版: Photo.qml:142-149 (Image "equipbg", visible equipArea.length>0, x23 y91 scale 0.75)
- web : skin.ts:218 有 equipBgPic() 但 Photo/EquipArea 均未使用
- 原版行为: 有装备时装备区后方叠 equipbg 贴图。
- web 行为: EquipArea 各行自带 rgba 半透明底，无 equipbg 整体贴图。

### D19 Photo::状态贴图(status)
- 状态: 未还原
- 原版: Photo.qml:151-156 (Image source statusDir+status when status!="normal", x-5 scale 0.75)
- web : skin.ts:250 有 statePic 但仅注释为 net-state；status 状态贴图未渲染
- 原版行为: 特殊状态(status!=normal)叠加状态贴图。
- web 行为: 无。

### D20 Photo::翻面(faceturned, !faceup)
- 状态: 未还原
- 原版: Photo.qml:158-165 (Image turnedOver, visible !faceup, "faceturned"(+"-heg"), x22 y4 scale 0.75)
- web : 无（faceup 字段已入 store gameStore.ts:35/214 但 Photo.tsx 未消费）
- 原版行为: 角色被翻面(!faceup)时叠 faceturned 贴图（heg 模式专用图）。
- web 行为: faceup 数据已同步但无任何渲染。
- 差异: 数据已就绪，UI 未渲染。

### D21 Photo::铁索(chain)
- 状态: 简化还原
- 原版: Photo.qml:217-224 (Image chain, visible chained, photoDir+"chain", horizontalCenter, scale 0.75, y:54)
- web : Photo.tsx:163,320 (chainPic, visible chained, 居中 top46% width92% opacity0.9)
- 原版行为: 横置时叠铁索贴图于固定 y:54。
- web 行为: chainPic 居中叠加，opacity 0.9。
- 差异: 仅定位/缩放近似（top46% vs y54），视觉基本一致。

### D22 Photo::死亡/垂死/投降贴图(saveme/death/surrender)
- 状态: 简化还原
- 原版: Photo.qml:226-239 (Image, visible (dead&&!rest)||dying||surrendered；surrendered→surrender，dead→getRoleDeathPic(role)，else→saveme)
- web : Photo.tsx:177-179,325 (仅 dead → deathPic(role)，居中)
- 原版行为: 三种来源——投降图 / 身份阵亡图 / 垂死求救图(saveme)。
- web 行为: 仅死亡时显示 deathPic(role)。
- 差异: 缺 dying→saveme 垂死求救贴图；缺 surrendered→surrender 投降贴图（dying 字段已入 store 但未渲染）。

### D23 Photo::网络状态(netstat)
- 状态: 未还原
- 原版: Photo.qml:241-248 (Image netstat, stateDir+netstate, photoMask 左上, scale 0.9*0.75)
- web : 无（VM 未暴露 netstate；skin.ts:250 statePic 未被调用）
- 原版行为: 左上角显示在线/掉线状态图标。
- web 行为: 无。

### D24 Photo::手牌数(handcard 贴图 + maxCard 文本)
- 状态: 简化还原
- 原版: Photo.qml:250-279 (Image "handcard" 背景贴图 + Text: n 或 "n/maxCard"，maxCard 满则只显示 n，>=900 显示 "∞"，字号 24/20 切换)
- web : Photo.tsx:172-174,324 (仅 handcardNum 数字，黑底圆角 chip，无 maxCard)
- 原版行为: handcard 背景贴图 + 当前手牌/手牌上限文本（上限=hp 时省略上限，∞ 处理）。
- web 行为: 仅数字，rgba 黑底 chip，无 handcard 贴图，无 "n/maxCard" 上限显示。
- 差异: 缺 handcard 背景贴图；缺手牌上限（maxCard）显示与 ∞ 逻辑（VM 未暴露 maxCard）；handcardNum=0 时不显示（原版恒显）。

### D25 Photo::右键/长按打开详情(showDetail)
- 状态: 完全还原
- 原版: Photo.qml:281-283,521-527 (onRightClicked showDetail, startCheat PlayerDetail, pid 0/-1 跳过)
- web : Photo.tsx:63-66 (openDetail, onContextMenu + useLongPress, pid 0/-1 跳过 → detailStore.open)
- 原版行为: 右键(BasicItem 长按亦触发)打开角色详情，pid 0/-1 不开。
- web 行为: 右键 + 长按 500ms 打开 detailStore，跳过 pid 0/-1。

### D26 Photo::座位号(seatNum 中文数字)
- 状态: 简化还原
- 原版: Photo.qml:314-334 (GlowText seatChr 一~十二, visible !progressBar.visible, 底部 bottomMargin -24, li2Name 24px, glow brown)
- web : Photo.tsx:168,279-283,323 (seatChr 数组同款一~十二, 在底部 bar 内, 11px 金色)
- 原版行为: photo 下方居中显示中文座次，progressBar 显示时隐藏。
- web 行为: 同款中文映射，置于底部 bar 右侧，11px 金色；不随 progressBar 隐藏。
- 差异: 位置(独立底部居中 vs bar 内)、字号、glow 样式不同；无 "进度条显示时隐藏" 联动。

### D27 Photo::震动动画(tremble)
- 状态: 完全还原
- 原版: Photo.qml:336-357 (SequentialAnimation x-15 100ms InQuad → x 100ms OutQuad)
- web : PhotoEffects.tsx:65-79 (TrembleDriver WAAPI translateX 0→-15→0, 200ms, ease-in/out, nonce 去重)
- 原版行为: 受伤时左移 15px 再回弹，共 200ms。
- web 行为: WAAPI translateX 同参数，nonce 触发重播。

### D28 Photo::思考进度条(progressBar)
- 状态: 简化还原
- 原版: Photo.qml:359-381 (ProgressBar 全宽 4px, bottomMargin -4, duration Config.roomTimeout*1000, value 100→0, 结束清 progressTip)
- web : PhotoFocusBar.tsx:37-44,48-50 (focusStore 驱动, track 4px 全宽底部, fill 宽度=fractionLeft, rAF 倒计时)
- 原版行为: 全宽 4px 进度条从满到空倒计时。
- web 行为: focusStore.ids 含该玩家时显示，rAF 按 fractionLeft 缩短。
- 差异: 触发源由 ProgressBar.visible(本地手控) 改为 MoveFocus 集合驱动；视觉等价。

### D29 Photo::思考提示文字(progressTip + control/tip 贴图)
- 状态: 简化还原
- 原版: Photo.qml:383-398 (Image "control/tip" 贴图 + Text progressTip, libianName 18px white, x18)
- web : PhotoFocusBar.tsx:42,51-52 (tip = tr(command)+tr(" thinking...")，纯文字无贴图)
- 原版行为: "control/tip" 背景贴图上显示提示文字。
- web 行为: 纯白色文字（"<命令> thinking..."），无 control/tip 背景贴图。
- 差异: 缺 control/tip 背景贴图；原版 progressTip 文本由命令侧设定，web 自行拼 command+thinking。

### D30 Photo::目标提示(targetTip normal/warning)
- 状态: 未还原
- 原版: Photo.qml:400-451 (RowLayout Repeater targetTip, type normal→GlowText 黄字 / warning→红描边 Text, processPrompt)
- web : 无（VM 未暴露 targetTip）
- 原版行为: 选择/结算时在 photo 中央显示每个目标的提示（如距离、序号、警告语）。
- web 行为: 无。
- 差异: 整套目标提示文字未实现。

### D31 Photo::距离调试框(distance)
- 状态: 未还原
- 原版: Photo.qml:482-491 (Rectangle white 15x15, visible distance!=-1, Text distance)
- web : 无
- 原版行为: distance!=-1 时左上显示距离数字（调试用）。
- web 行为: 无。
- 差异: 调试性质，非正常对局可见，影响极小。

### D32 Photo::对手手牌速览(HandcardViewer)
- 状态: 未还原
- 原版: Photo.qml:493-508 + Photo/HandcardViewer.qml (photo 左侧浮窗, 列出对手可见手牌名/?/..., visible 仅当 buddy 或 hasVisibleCard)
- web : 无
- 原版行为: 非自己且可见其手牌(队友/明置)时，photo 左侧显示手牌名称速览框，可点开 ViewPile。
- web 行为: 无（仅 handcardNum 数字）。
- 差异: 整个手牌速览浮窗未实现。

---

## C. HpBar / Magatama / Shield

### D33 HpBar::勾玉列(<=4)
- 状态: 完全还原
- 原版: Photo/HpBar.qml:20-36 (Repeater model maxValue, Magatama state by index/value)
- web : HpBar.tsx:9-13,38-40 (beadState 同公式, Array maxHp 个 img)
- 原版行为: maxHp 个勾玉，末尾 hp 个按当前血色填充。
- web 行为: beadState 公式逐位还原（空/满/血色）。

### D34 HpBar::勾玉血色(colors)
- 状态: 完全还原
- 原版: HpBar.qml:12,24-34 (colors[F4180E,F4180E,E3B006,25EC27], state 1/2/3)
- web : HpBar.tsx:9-15 (state 1=红 2=黄 3+=绿 img; HP_TEXT_COLOR 同色表)
- 原版行为: 1红2黄3+绿。
- web 行为: 同。

### D35 HpBar::文本模式(maxHp>4 等)
- 状态: 完全还原
- 原版: HpBar.qml:38-105 (column visible maxValue>4||value>maxValue||(shield>0&&maxValue>3); 1勾玉+value/maxValue, 斜杠 rotation40)
- web : HpBar.tsx:18-19,30-36,54 (useText 同条件, 勾玉+hpText+斜杠 rotate40+maxHp)
- 原版行为: 血量过多改为 "勾玉 + hp/maxHp" 竖排，斜杠旋转 40°。
- web 行为: 同条件、同布局、斜杠 rotate 40deg。

### D36 Magatama::消失动画(state 0 scale4 opacity0)
- 状态: 简化还原
- 原版: Photo/Magatama.qml:40-55 (state "0" opacity0 scale4 + Transition opacity,scale 动画)
- web : HpBar.tsx:39 (掉血直接换 magatama(0) 空勾玉图)
- 原版行为: 失去血点时勾玉放大4倍淡出动画。
- web 行为: 直接切换为空勾玉贴图(state0)，无放大淡出过渡。
- 差异: 缺消失补间动画。

### D37 Magatama::heg 皮肤变体
- 状态: 未还原
- 原版: Magatama.qml:8,18-44 (Config.heg ? "-heg" 后缀)
- web : skin.ts:166 magatama(state, heg=false) 参数存在但 HpBar 恒传默认 false
- 原版行为: heg 模式用 "-heg" 勾玉贴图。
- web 行为: 恒用普通勾玉。
- 差异: heg 变体未接线（heg 模式本身 web 范围未支持）。

### D38 Shield::护甲贴图+数字
- 状态: 完全还原
- 原版: Photo/Shield.qml (Image magatamaDir+"shield", visible value>0, Text value 居中 libianName 15px Outline)
- web : HpBar.tsx:24-29,49-51 (shield>0 时 shieldPic + shieldNum 叠字)
- 原版行为: 护甲>0 显示盾牌图 + 白色描边数字。
- web 行为: 同。

---

## D. EquipArea / EquipItem

### D39 EquipArea::五槽布局(宝物/武器/防具/+1/-1)
- 状态: 完全还原
- 原版: Photo/EquipArea.qml:25-30,44-102 (treasure/weapon/armor 竖排 + 两马一行平分; subtypes 顺序)
- web : EquipArea.tsx:13-19,33-65 (SLOTS 同顺序 subtype, by subtype 分槽)
- 原版行为: 五固定槽按 subtype 归位，双马同行各半宽。
- web 行为: SLOTS 顺序一致，按 face.subtype 归位。
- 差异: web 改竖排单列堆叠（无双马并排同行的二分行布局），但槽位归属正确。

### D40 EquipItem::图标(getEquipIcon / horse / sealed)
- 状态: 完全还原
- 原版: EquipItem.qml:33-45 (sealed→equipIconDir+"sealed"; 否则 getEquipIcon(cid,icon))
- web : EquipArea.tsx:46-49,58 (equipIconCandidates(iconName, ext) 候选遍历)
- 原版行为: 装备图标按卡 icon 取，sealed 用封印图标。
- web 行为: equipIconCandidates 取卡所在扩展包图标，error 回退；sealed 见 D43。

### D41 EquipItem::花色+点数(suit + convertNumber)
- 状态: 简化还原
- 原版: EquipItem.qml:47-68 (suitItem 花色贴图 cardSuitDir+suit; numberItem GlowText convertNumber 12px, visible number 0<n<14)
- web : EquipArea.tsx:60,86 (suitSymbol + numberStr 文本，红/白染色)
- 原版行为: 花色用贴图，点数用 convertNumber(A/J/Q/K) GlowText。
- web 行为: 花色用 Unicode 符号文本(suitSymbol)，点数用 numberStr 文本。
- 差异: 花色贴图 → Unicode 符号文本；点数 GlowText → 普通文本（视觉近似）。

### D42 EquipItem::名称文本(+1/-1 + 马名)
- 状态: 完全还原（含有意增强）
- 原版: EquipItem.qml:147-159 (马 →"+1"/"-1" 仅符号; 其它 →tr(name))
- web : EquipArea.tsx:51-55 (马 →"+1/-1 + tr(马名)"; 其它 tr(virt_name||name))
- 原版行为: 马只显示 "+1"/"-1"。
- web 行为: 马显示 "+1/-1 + 马名"（用户明确要求 "+1和-1后应该显示马的名称"）。
- 差异: web 为响应用户需求的有意增强，非缺陷。

### D43 EquipItem::封印槽(sealed 灰罩 + 文本)
- 状态: 简化还原
- 原版: EquipItem.qml:25-31,124-135,205-212 (sealed→Rectangle #CCC opacity0.8 灰罩 + text "  "+tr(subtype+"_sealed") 黑字; 空槽仍占位显示)
- web : EquipArea.tsx:38-41,62,88 (sealed 灰罩 div #CCC opacity0.8; 空 sealed 槽渲染纯灰罩行)
- 原版行为: 封印槽灰色覆盖 + "X废除" 黑字文本。
- web 行为: 灰罩 #CCC opacity0.8 还原；但缺 "废除" 文本(tr(subtype+"_sealed"))。
- 差异: 缺封印文字标签。

### D44 EquipItem::出现/消失动画(showAnime/hideAnime)
- 状态: 未还原
- 原版: EquipItem.qml:80-122,193-203 (装备进出 x 10→0 / opacity 0→1 平移淡入淡出 200ms)
- web : 无（EquipArea 直接条件渲染行）
- 原版行为: 装备出现/移除时平移+淡入淡出 200ms。
- web 行为: 直接增删行，无动画。

### D45 EquipArea::itemHeight 自适应(宝物空则三等分)
- 状态: 未还原
- 原版: EquipArea.qml:20-24 (treasure 空且未封印 → height/3 否则 /4)
- web : EquipArea.tsx:83 (固定 row height 13px)
- 原版行为: 无宝物时其余槽按 1/3 高度铺满。
- web 行为: 各行固定高度。
- 差异: 高度自适应逻辑未还原（纯排版细节）。

---

## E. JudgeArea (DelayedTrickArea)

### D46 JudgeArea::判定牌图标按名分组+计数
- 状态: 完全还原
- 原版: Photo/DelayedTrickArea.qml:28-60,62-89 (Row spacing-4, 同名合并为一图标 + len>1 右下角计数)
- web : JudgeArea.tsx:16-44,54,56 (按 virt_name||name 分组, marginLeft-4, count>1 右下角)
- 原版行为: 延时锦囊同名合并，>1 显示数量。
- web 行为: Map 分组保序，count>1 显示计数。

### D47 JudgeArea::图标art(getDelayedTrickPicture)
- 状态: 完全还原
- 原版: DelayedTrickArea.qml:39-43 (getDelayedTrickPicture(name) PreserveAspectFit, 47x55*0.6)
- web : JudgeArea.tsx:32-37,54-55 (delayedTrickPic(name,ext) 28x33, 文本回退)
- 原版行为: 延时锦囊专用贴图 28x33。
- web 行为: delayedTrickPic 同尺寸，缺图时文字回退。

### D48 JudgeArea::封印(JudgeSlot sealed 图标)
- 状态: 完全还原
- 原版: DelayedTrickArea.qml:8,11-18 (sealed=JudgeSlot, Image delayedTrickDir+"sealed", x-6 y8)
- web : JudgeArea.tsx:29-30,58 + Photo.tsx:201 (sealed=JudgeSlot includes, delayedTrickSealedPic)
- 原版行为: 判定区封印时显示 sealed 图标。
- web 行为: 同。

---

## F. MarkArea / PicMarkArea

### D49 MarkArea::文本标记(name value)
- 状态: 简化还原
- 原版: Photo/MarkArea.qml:34-56,124-162 (markList, "tr(name) value"，RichText, 半透明深色底框 #3C3229 white border)
- web : Photo.tsx:143-149,307-308 + clientVm.ts:164-169 (displayMarks `name value`，name 已 tr，深色底框)
- 原版行为: 标记名+值，深色圆角描边底框。
- web 行为: displayMarks 渲染，深色底框近似。
- 差异: 见 D50/D51（@@ 隐藏值、点击查看牌堆未还原）；普通文本标记本身还原良好。

### D50 MarkArea::@@隐藏值标记
- 状态: 完全还原
- 原版: MarkArea.qml 经命令侧；隐藏机制
- web : clientVm.ts:166 (`@@`→val="") + Photo.tsx:146 (value 空则只显示 name)
- 原版行为: @@ 前缀标记隐藏数值只显示名。
- web 行为: VM 侧对 @@ 置空 value，渲染只显示 name。

### D51 MarkArea::标记点击查看(牌堆/武将堆/QmlMark)
- 状态: 简化还原
- 原版: MarkArea.qml:66-114 (TapHandler: @&武将堆→ViewGeneralPile / @$牌名 / @[type]→startCheatByPath / 普通→getPile filter cardVisibility→ViewPile)
- web : clientVm.ts:138-149 (@[type] 仅取 GetQmlMark.text 作文本显示) + Photo.tsx mark 无 onClick
- 原版行为: 点击标记打开对应牌堆/武将堆/自定义 QML 抽屉。
- web 行为: @[type] 标记降级为静态文本显示；无任何标记点击查看交互。
- 差异: 标记点击查看牌堆/武将堆/QmlMark 抽屉整套交互未实现；@[type] 仅渲染 text。

### D52 MarkArea::@$/@& 牌堆/武将堆计数显示
- 状态: 简化还原
- 原版: MarkArea.qml:135-137 (@$/@&→special_value=数量, mark_extra=join(','))
- web : clientVm.ts:152-169 (按数值/数组长度入 textMarks，未区分 @$/@& 专门显示)
- 原版行为: @$/@& 显示为标记名 + 数量，点击查看。
- web 行为: 作为普通文本标记按值显示，无点击。
- 差异: 无专门的牌堆/武将堆计数语义与点击（并入 D51）。

### D53 MarkArea::arrangeMarks 双列流式排版
- 状态: 未还原
- 原版: MarkArea.qml:175-212 (短标记<半宽两列、长标记独占一行的流式布局 + x/y 补间动画)
- web : Photo.tsx:307 (flex-wrap gap2 简单换行)
- 原版行为: 短标记两列排布、长标记整行，带位移动画。
- web 行为: flex-wrap 自然换行。
- 差异: 缺双列流式算法与位移动画（视觉排版细节）。

### D54 PicMarkArea::图片标记(@! 图标+计数+tooltip)
- 状态: 完全还原
- 原版: Photo/PicMarkArea.qml:16-68,70-98 (21x21 getMarkPic 图标 + 右下 special_value + ToolTip mark_extra; @!! 加描述)
- web : Photo.tsx:153-157,215-227,311-315 + clientVm.ts:155-162 (PicMark 21x21 markPicCandidates + value + title tooltip + @!! extra; 缺图文字回退)
- 原版行为: @! 图标 + 计数/值 + hover 提示；@!! 追加翻译名与描述。
- web 行为: 同；图标缺失时文字 chip 回退。

### D55 PicMarkArea::@!! 描述拼装
- 状态: 完全还原
- 原版: PicMarkArea.qml:88-90 (@!!→ "<b>tr(mark)</b><br>tr(:mark)<br>data")
- web : clientVm.ts:161 (@!!→ Translate(k)+" "+Translate(":"+k) 作 extra)
- 原版行为: @!! 标记 tooltip 含名+描述。
- web 行为: extra 拼 名+描述（无 <b>/<br> 富文本，纯文本 tooltip）。
- 差异: 富文本格式简化为纯文本（tooltip 内容等价）。

---

## G. LimitSkillArea / LimitSkillItem / RoleComboBox / SkinArea / SpecialMarkArea

### D56 LimitSkillArea::限定技/觉醒/转换技标记
- 状态: 简化还原
- 原版: Photo/LimitSkillArea.qml + LimitSkillItem.qml (右上技能标记: limit/wake/switch/quest 各类背景图 + 技能名 + "X" 已用标记; updateLimitSkill 驱动)
- web : Photo.tsx LimitSkillArea + limitSkillStore + clientVm.skillData 桥 + skin.limitSkillBg
- 原版行为: photo 右上显示限定技/觉醒技/转换技图标，已用打 X / 切背景。
- web 行为: Photo 右上 LimitSkillArea 列,消费 UpdateLimitSkill→limitSkillStore,limitSkillRender 照搬 LimitSkillItem 规则(limit 用 X+limit-used、wake 觉醒后才显、switch 阳/阴→switch/switch-yin、quest 失败>1 打 X);skilltype 经 clientVm.skillData(GetSkillData.frequency/switchSkillName)解析。
- 差异: 简化——技能标记本身 1:1 还原;但全局顶部 banner(SetBanner)与标记区显隐控制(UpdateMarkArea)仍 deferred(随 N1-2 余项)。
- 修复: 已修复并验证 (UpdateLimitSkill 出 KNOWN_DEFERRED→consume;新增 limitSkillStore+skillData 桥+LimitSkillArea 组件;render 规则 7 单测 + 真 VM 验证 skillData(jianxiong→奸雄);标准三包无此类技能[audit O],由扩展包武将触发。typecheck/build/161 测试全绿。2026-06-12,未还原→简化还原。)

### D57 RoleComboBox::身份图标显示
- 状态: 完全还原
- 原版: Photo/RoleComboBox.qml:7-15 + Photo.qml:285-296 (getRolePic(value), value 逻辑 hidden/role_shown/roleVisibility)
- web : Photo.tsx:113-126,268-273 (shownRole 同逻辑, rolePic, hidden 不显示)
- 原版行为: 按可见性显示身份牌 / unknown。
- web 行为: shownRole 完整还原 hidden/role_shown/roleVisible 三分支。

### D58 RoleComboBox::身份猜测下拉(assumptionBox/optionPopupBox)
- 状态: 完全还原
- 原版: RoleComboBox.qml:17-52 (unknown 时可点开 4 身份图标列, 本地猜测, 不发服务器)
- web : Photo.tsx:113-139,300-302 + roleGuessStore (guessable 时点击 openPicker, GUESS_ROLES 4 项竖列, setGuess 本地)
- 原版行为: 未知身份本地标注猜测。
- web 行为: roleGuessStore 本地猜测，4 身份竖列选择。

### D59 SkinArea::gif/mp4 动态皮肤
- 状态: 未还原
- 原版: Photo/SkinArea.qml (source 后缀分流: gif→AnimatedImage, mp4→Video 循环静音, 否则静态)
- web : Portrait 仅 <img>（Photo.tsx:239）
- 原版行为: 立绘支持 gif 动图 / mp4 视频皮肤。
- web 行为: 仅静态 <img>，gif 会显示首帧、mp4 不支持。
- 差异: 动态皮肤(gif 动画/mp4 视频)未还原。

### D60 SpecialMarkArea::特殊标记区
- 状态: 完全还原
- 原版: Photo/SpecialMarkArea.qml (空 Item) + Photo.qml:174-208 specialAreaItem (InvisibleCardArea, updatePileInfo→markArea.setMark)
- web : 牌堆计数经 clientVm pile mark 进 textMarks（D52）
- 原版行为: SpecialMarkArea 本体为空占位；specialArea 管理隐藏牌堆并把计数写入 MarkArea。
- web 行为: 无独立可见元素（原版亦无可见元素）；牌堆计数走标记路径。

---

## H. MiscStatus（桌面状态，非 Photo 本体但范围内）

### D61 MiscStatus::轮数
- 状态: 完全还原
- 原版: MiscStatus.qml:19-28 (roundTxt "#currentRoundNum".arg(roundNum) 右上)
- web : MiscStatus.tsx:40,54 ("第 N 轮", miscStore.roundNum)
- 原版行为: 右上显示当前轮数。
- web 行为: "第 N 轮"。
- 差异: 文案直拼非走 tr("#currentRoundNum")，显示等价。

### D62 MiscStatus::游戏计时器
- 状态: 完全还原
- 原版: MiscStatus.qml:30-49 (timeTxt + Timer 1s, getTimeString h:m:s)
- web : MiscStatus.tsx:22-32,39 (startedAt + setInterval 1s, fmtTime)
- 原版行为: 1s 递增显示对局时长。
- web 行为: 基于 startedAt 计算 elapsed，fmtTime 同 h:m:s 格式。

### D63 MiscStatus::牌堆数(card-back + pileNum)
- 状态: 完全还原
- 原版: MiscStatus.qml:51-69 (deckImg card-back 32x42 + pileNum 居中 32px Outline)
- web : MiscStatus.tsx:41-45,55-57 (cardBackPic 32x42 + pileNum 28px)
- 原版行为: 牌背图上叠剩余牌数。
- web 行为: 同。

### D64 MiscStatus::整体可见性
- 状态: 完全还原
- 原版: MiscStatus.qml:9 (visible roundNum||pileNum)
- web : MiscStatus.tsx:34 (!roundNum && !pileNum → null)
- 原版行为: 无轮数且无牌堆时隐藏。
- web 行为: 同。

---

## I. seatLayout（座位排布）

### D65 seatLayout::<=8 人 arrangePhotos
- 状态: 完全还原
- 原版: RoomLogic.js arrangePhotos / regularSeatIndex / regions8
- web : seatLayout.ts:27-60,102-111 (regularSeatIndex + regions8 逐行移植)
- 原版行为: 8 区域 + seatIndex 映射显示槽→屏幕坐标。
- web 行为: 逐行 verbatim 移植。

### D66 seatLayout::>8 人 arrangeManyPhotos
- 状态: 完全还原
- 原版: RoomLogic.js arrangeManyPhotos:17-79
- web : seatLayout.ts:65-95 (regionsMany, photoScale, 角位下移)
- 原版行为: 多人时缩放铺顶。
- web 行为: 逐行移植含缩放与角位 verticalSpacing 调整。

### D67 seatLayout::rotateToSelf 自己置底
- 状态: 完全还原
- 原版: RoomLogic.js arrangeSeats:733-750
- web : gameStore.ts:110-117 (rotateToSelf)
- 原版行为: 旋转座序使 Self 为 index0。
- web 行为: 同。

---

## 状态计数表

| 状态 | 数量 | 序号 |
|------|------|------|
| 完全还原 | 30 | D1,D2,D3,D9,D11,D25,D27,D33,D34,D35,D38,D39,D40,D42,D46,D47,D48,D50,D54,D55,D57,D58,D60,D61,D62,D63,D64,D65,D66,D67 |
| 简化还原 | 19 | D5,D7,D8,D13,D14,D15,D21,D22,D24,D26,D28,D29,D36,D41,D43,D49,D52,D53,D56 |
| 还原错误 | 0 | （D11 已修复并验证 2026-06-12，升级为完全还原） |
| 未还原 | 18 | D4,D6,D10,D12,D16,D17,D18,D19,D20,D23,D30,D31,D32,D37,D44,D45,D51,D59 |

（注：计数含 D1–D67 共 67 项。）

实际四态计数（按各条目"状态"字段）：
- 完全还原：30（D1,D2,D3,D9,D11,D25,D27,D33,D34,D35,D38,D39,D40,D42,D46,D47,D48,D50,D54,D55,D57,D58,D60,D61,D62,D63,D64,D65,D66,D67）
- 简化还原：19（D5,D7,D8,D13,D14,D15,D21,D22,D24,D26,D28,D29,D36,D41,D43,D49,D52,D53,D56；D56 于 2026-06-12 未还原→简化）
- 还原错误：0（D11 已修复并验证 2026-06-12）
- 未还原：18（D4,D6,D10,D12,D16,D17,D18,D19,D20,D23,D30,D31,D32,D37,D44,D45,D51,D59）
- 合计：67

## 未还原 / 还原错误 序号索引

**未还原（19）**：
- D4 deputy-split 分隔线
- D6 副将名独立竖排
- D10 换肤图标+Hover
- D12 playing 行动中光环动画
- D16 醉酒红幕(drank)
- D17 休整(rest)文字组
- D18 装备背景(equipbg)
- D19 状态贴图(status)
- D20 翻面(faceturned)
- D23 网络状态(netstat)
- D30 目标提示(targetTip)
- D31 距离调试框(distance)
- D32 对手手牌速览(HandcardViewer)
- D37 Magatama heg 变体
- D44 EquipItem 出现/消失动画
- D45 EquipArea itemHeight 自适应
- D51 MarkArea 标记点击查看牌堆/武将堆/QmlMark
- D56 LimitSkillArea 限定技/觉醒/转换技标记区
- D59 SkinArea gif/mp4 动态皮肤

**还原错误（0）**：
- （无；D11 座位移动补间动画 已于 2026-06-12 修复并验证，状态升级为完全还原）

## 最关键 3 缺口

1. **D56 LimitSkillArea 完全缺失**——限定技/觉醒技/转换技的右上角标记与"已用 X"状态在 web 中无任何呈现，vmStore 连 UpdateLimitSkill 命令都未接，对局中无法判断限定技是否可用。
2. **D32 HandcardViewer + D24 手牌上限**——对手可见手牌速览浮窗完全未实现，且手牌数仅显示当前数无"n/maxCard"上限与 ∞ 逻辑，削弱了关键战术信息。
3. **D12/D20/D22 行动者与状态视觉**——当前行动者无 playing 光环（无任何"轮到谁"高亮）、翻面(faceturned)与垂死求救(saveme)/投降贴图未渲染（dying/faceup 数据已同步却未消费），对局态势可读性明显下降。
