# Phase E 审计 — 手牌/卡牌/牌桌牌堆

原版 37f8c12/v0.5.20，逐行对照。状态四态：未还原/简化还原/还原错误/完全还原。

约定：web 客户端逻辑层（cardStore 区域归属、MoveCards delta、known 翻面、vanish）是 client.lua/RoomLogic 在 wasmoon 原样运行的端口；QML 视觉/交互由 TS/TSX 重写。本审计核心=卡牌视觉元素与交互呈现。

---

## A. 卡牌静态视觉元素（PokerCard / BasicCard / CardItem）

### E1 PokerCard::花色图标 (suitItem)
- 状态: 完全还原
- 原版: BasicCard.qml(PokerCard.qml):14-23 (suitItem Image)
- web : CardFaceView.tsx:58 (sImg) + skin.ts:224 (suitPic)
- 原版行为: known 时显示；source=searchBuiltinPic("/image/card/suit/",suit)，suit==""/"nosuit" 不显示；x=3*scale y=19*scale w=21*scale h=17*scale
- web 行为: face-up 时显示；suitPic 返回 /image/card/suit/<suit>.png，nosuit/空返回""不渲染；left=3*scale top=19*scale w=21*scale h=17*scale，scale=width/93 一致

### E2 PokerCard::点数图标 (numberItem)
- 状态: 完全还原
- 原版: PokerCard.qml:25-34 (numberItem Image)
- web : CardFaceView.tsx:57 (nImg) + skin.ts:229 (numberPic)
- 原版行为: known 时显示；source=searchBuiltinPic(`/image/card/number/${getColor()}/`,number)，suit!=""&&number>0 才有；x=0 y=0 w=27*scale h=28*scale；getColor()=红/黑（heart/diamond→red 否则 black），无 suit 时取 color
- web 行为: face-up 显示；numberPic(number,color) 返回 /image/card/number/<red|black>/<n>.png，n<1||n>13 返回""；color==="red"→red 否则 black；left=0 top=0 w=27*scale h=28*scale
- 差异: web 直接用 GetCardData 的 color 字段（getColorString，"red"/"black"/"nocolor"），等价 getColor()。number<=0 时 numberPic 返回""，与原版 number>0 一致。完全等价

### E3 PokerCard::无色牌色块 (colorItem)
- 状态: 未还原
- 原版: PokerCard.qml:36-45 (colorItem Image)
- web : 无
- 原版行为: known 且 suit==""或"nosuit" 时显示；source=cardSuitDir+"/"+color（如无色牌的 black/red 色块图）；x=1*scale，w/h=sourceSize*scale。用于"无花色但有颜色"的牌（如某些转化牌/特殊牌）显示颜色标
- web 行为: CardFaceView 只渲染 suitPic（nosuit 返回""即不显示）与 numberPic，无 colorItem 这一无花色色块分支
- 差异: 无花色有颜色的牌不显示颜色标记（视觉缺失，影响极小众卡）

### E4 BasicCard::正面/背面图 (MediaArea)
- 状态: 简化还原
- 原版: BasicCard.qml:32-36 (MediaArea) + MediaArea.qml:1-55
- web : CardFaceView.tsx:34-63 + skin.ts:106 (cardPicCandidates)
- 原版行为: known→cardFrontSource 否则 cardBackSource；fillMode=PreserveAspectCrop；MediaArea 支持 .gif(AnimatedImage)/.mp4|avi|mov|mkv(Video 循环静音)/静态 Image 三态
- web 行为: faceUp→art 候选列表(cardPicCandidates，own extension→所有包扫描，onError 递进)；否则 cardBackPic；objectFit:cover(=PreserveAspectCrop)；候选耗尽→文字牌面回退
- 差异: web 仅 <img> 静态图，无 gif/video 动态卡面分支（MediaArea 的动画卡面）。原版静态牌（绝大多数）等价；动态皮肤卡面未还原

### E5 CardItem::虚拟牌名底框 (virt_rect)
- 状态: 完全还原
- 原版: CardItem.qml:61-72 (virt_rect Rectangle)
- web : CardFaceView.tsx:81-92 (VirtNameBox)
- 原版行为: known && virt_name!=""&&virt_name!=name 时显示；w=parent.width h=20*scale y=40*scale；color="snow" opacity=0.8 radius=4*scale border black 1px
- web 行为: virt_name 存在且!=name 显示；top=40*scale h=20*scale w=width；background:snow opacity:0.85 borderRadius=4*scale border 1px black
- 差异: 仅 face-up 渲染（VirtNameBox 在 art 分支内），与 known 一致

### E6 CardItem::虚拟牌名文字
- 状态: 完全还原
- 原版: CardItem.qml:74-81 (Text)
- web : CardFaceView.tsx:90 (VirtNameBox 内 tr(vn))
- 原版行为: 居中于 virt_rect；pixelSize=floor(16*scale)；font libianName；letterSpacing -0.6；text=Lua.tr(virt_name)
- web 行为: 居中 flex；fontSize=floor(16*scale)；fontWeight 700 color #222；text=tr(vn)
- 差异: 字体族用系统默认非 libian，letterSpacing 未设；文本/字号/居中一致

### E7 CardItem::卡牌标记 (cardMarkDelegate)
- 状态: 简化还原
- 原版: CardItem.qml:83-134 (cardMarkDelegate + GridLayout Repeater)
- web : CardFaceView.tsx:97-111 (CardMarks)
- 原版行为: model=mark；每条 mark 可见条件 markVisible || k.includes("-public")；红→透明水平渐变 pill(GradientStop 0.7 #A50330→1.0 transparent)，radius 4*scale；text=tr(k)+（k 非"@@"开头时再+tr(v)）；color white outline purple；GridLayout 2 列 y=60*scale
- web 行为: marks=face.mark；红→透明 linear-gradient(90deg,#A50330 70%,transparent)；text= k 以"@@"开头则 tr(k) 否则 tr(k)+tr(v)；white + purple textShadow；flex wrap top=60*scale gap 1
- 差异: (1) web 无视 markVisible / "-public" 门控，只要 mark 数组非空即全显示——原版手牌区 markVisible=true、弃牌区 markVisible=false（TablePile add 设 c.markVisible=false），web 牌桌牌仍会显示标记（应隐藏除 -public 外的标记）。(2) 2 列 GridLayout vs flex-wrap，布局近似

### E8 CardItem::禁用原因文字 (prohibitText)
- 状态: 未还原
- 原版: CardItem.qml:136-152 (prohibitText) + HandcardArea.qml:237-243 (getCardProhibitReason) + applyChange
- web : 无
- 原版行为: !selectable && known 时居中显示 prohibitReason；libian pixelSize floor(18*scale)；opacity 0.9；color snow outline red；w=20*scale WrapAnywhere。reason 由 Ltk.getCardProhibitReason(cid) 在 applyChange 时填入（如"无效果"/距离不足）
- web 行为: 无任何 prohibitReason 抓取或渲染；不可选牌仅有半透明黑遮罩(E22)
- 差异: 不可用手牌不显示禁用原因文字（玩家不知为何某张牌不可选），功能缺失

### E9 CardItem::禁用变灰 (BasicItem enabled)
- 状态: 完全还原
- 原版: BasicItem.qml:16 (property enabled) + BasicCard.qml 无独立灰化（靠 selectable 黑遮罩）
- web : CardLayer.tsx:227 (disable overlay)
- 原版行为: BasicItem.enabled=false 时"the card will be grey"（注释承诺），但实际 BasicCard 无灰度滤镜，灰化语义未在 BasicCard 实装；可选与否的唯一可见反馈是 !selectable 的黑遮罩(E22)
- web 行为: !enabled && !selected 时叠加 rgba(0,0,0,.5) opacity .7 黑遮罩——这其实对应 selectable 黑遮罩(E22)，web 把"enabled"语义映射到此
- 差异: web 用 interactionStore 的 enabled 驱动遮罩，而原版黑遮罩由 selectable 驱动。两者在请求态下通常一致（不可选=不可用），但语义不是同一字段。归类为"还原错误"偏重于命名/驱动来源差异，视觉表现实际与 E22 一致
- 修复: 已修复并验证 (复核源码确认这是误判,非真错误：原版 Room.qml:746 + dashboard.applyChange 把 UpdateRequestUI 的 `enabled` 直接绑给 CardItem/Photo 的 `selectable`——即 `selectable = enabled`,同一 VM ui_emu 信号,只是协议字段名。web 用 `enabled` 驱动黑遮罩与原版完全等价。已在 CardLayer.tsx:225-230 注释说明该等价关系;状态升级为完全还原。2026-06-12)

---

## B. 卡牌动画与移动（BasicItem goBack / ItemArea / MoveCards）

### E10 BasicItem::归位动画 (goBackAnimation)
- 状态: 完全还原
- 原版: BasicItem.qml:91-163 (goBackAnimation + goBack)
- web : CardLayer.tsx:118-149 (moveSeq useEffect WAAPI) + 22-23 (GO_BACK_MS/EASE)
- 原版行为: ParallelAnimation x/y→origX/origY OutQuad 500ms；opacity 序列(→1 400ms→origOpacity 100ms)；goBack 跳过微小位移(dx+dy<=1)不动画；stopped 触发 moveFinished
- web 行为: 每 cid prev→target translate WAAPI，duration 500ms，cubic-bezier(.25,.46,.45,.94)=OutQuad，fill forwards；prev==target 不动画
- 差异: web 用单 transform translate，未单独动画 opacity 序列；位移路径/时长/缓动一致

### E11 ItemArea::牌堆铺排+溢出收拢 (updatePosition)
- 状态: 完全还原
- 原版: ItemArea.qml(InvisibleItemArea.qml):22-61 (updatePosition)
- web : CardLayer.tsx:70-93 (resolveAreaBox + step 铺排)
- 原版行为: origX=i*width 左铺；超过 root.width 则 overflow，spacing=(width-cardW)/(n-1) 收拢，z=i+1 initialZ maxZ；加 parentPos 偏移
- web 行为: span=box.w-CARD_W；step=n>1?min(CARD_W+6,span/(n-1)):0；startX 左铺(area)或居中(table/draw)；逐 cid x=startX+step*i
- 差异: web 用统一 step（始终按可用宽收拢），原版先尝试满宽再溢出收拢两段式；视觉等价（牌少时 step 上限 CARD_W+6 接近牌宽）

### E12 HandcardArea::选中抬升 20px
- 状态: 完全还原
- 原版: HandcardArea.qml:68-87 (updateCardPosition: selected origY-=20)
- web : CardLayer.tsx:88-90 (sel ? 20 : 0)
- 原版行为: 已选手牌 origY-=20 上抬
- web 行为: cardStates[cid].selected 时 y=box.y-20
- 差异: 无

### E13 HandcardArea::无用牌下沉 60px (Config.hideUseless)
- 状态: 未还原
- 原版: HandcardArea.qml:74-79 (!selectable && Config.hideUseless → origY+=60)
- web : 无
- 原版行为: hideUseless 开启时，不可选手牌整体下沉 60px（半隐藏到屏幕外）
- web 行为: 无 hideUseless 配置与下沉逻辑
- 差异: "隐藏无用牌"设置项及其下沉视觉缺失

### E14 HandcardArea::手牌拖拽 (draggable / DragHandler)
- 状态: 简化还原
- 原版: BasicItem.qml:61-76 (DragHandler) + HandcardArea.qml:89-188 (updateCardDragging/dragMovement/updateCardReleased)
- web : CardLayer.tsx (pointer drag + opacity 0.8 + reorderArea) + cardStore.ts (reorderArea) + clientVm.ts (CanSortHandcards bridge)
- 原版行为: 拖动手牌；拖动时 opacity 0.8；释放按 x 位置重排(movepos)；可拖动排序(sortable/canSortHandcards)
- web 行为: 自己手牌可 pointer 拖动；拖动时 opacity 0.8；释放按中心 x 位置本地重排；重排前查询 VM `CanSortHandcards(Self.id)`，SortProhibited 时不排序。
- 差异: 核心拖拽/重排已恢复；但 Web 仍无完整 ControlSetting/Config 设置页，拖拽开关与 QML 配置持久化未还原。
- 修复: 已修复并验证 (新增 cardDrag/cardStore 单测；`pnpm --filter @freekill-web/web test -- cardStore gameStore skin handcardInfo cardDrag`、typecheck、build 通过，2026-06-13)
- 修复: 已修复并验证 (补强:区分普通拖拽重排与点击选中,仅拖到目标 Photo 或 OK 区时为超级拖拽自动选牌,普通重排不再触发 CardItem click；web 183 测试、typecheck、build 通过，2026-06-13)

### E15 HandcardArea::超级拖拽 (Config.enableSuperDrag dragMovement)
- 状态: 简化还原
- 原版: HandcardArea.qml:94-135 (dragMovement) + 142-157 (拖拽使用/选目标)
- web : CardLayer.tsx (drag hit-test Photo + OK confirm)
- 原版行为: 拖拽手牌到目标 photo 上自动选中目标；拖出 dashboard 区域且 okButton.enabled 时直接确认出牌
- web 行为: 拖动可用手牌到可选 Photo 上释放会驱动 `UpdateRequestUI("Photo",pid,"click")`；释放到牌桌区域且 OK 可用时驱动 OK。
- 差异: 核心拖拽选目标/确认已恢复；但 Web 仍无 `Config.enableSuperDrag` 设置入口，且选目标在释放时触发，未逐帧模拟 QML `dragMovement` 进入/离开切换。
- 修复: 已修复并验证 (新增 cardDrag 纯函数测试；web test/typecheck/build 通过，2026-06-13)
- 修复: 已修复并验证 (补强:自动选中限定在命中 Photo/OK 的超级拖拽路径,避免重排手牌误选中；web 183 测试、typecheck、build 通过，2026-06-13)

### E16 CardItem::选中态切换 (selectCard / cardSelected)
- 状态: 完全还原
- 原版: HandcardArea.qml:194-197 (selectCard) + Dashboard.qml:60-62 (onCardSelected→updateRequestUI)
- web : CardLayer.tsx:188-192 (onCardClick→interact CardItem click)
- 原版行为: 点击可选牌 toggle selected，cardSelected(cid,selected)→Ltk.updateRequestUI("CardItem",cid,"click",{selected,autoTarget})
- web 行为: onCardClick→interact("CardItem",cid,"click",{selected:!selected})；不可选(!enabled&&!selected)直接 return
- 差异: web click payload 未带 autoTarget（Config.autoTarget），自动选目标配置缺失；选中本身等价

### E17 CardItem::双击使用 (doubleClickCard)
- 状态: 简化还原
- 原版: HandcardArea.qml:199-203 (doubleClickCard, Config.doubleClickUse) + Dashboard.qml:63-65
- web : CardLayer.tsx (onDoubleClick → UpdateRequestUI CardItem doubleClick)
- 原版行为: 双击牌且 doubleClickUse 开启→cardDoubleClicked→updateRequestUI("CardItem",cid,"doubleClick",{...doubleClickUse,autoTarget})，快速出牌
- web 行为: 可选/已选手牌双击时发送 `UpdateRequestUI("CardItem",cid,"doubleClick",{selected,doubleClickUse:true,autoTarget:false})`。
- 差异: 双击快速使用已恢复；但 Web 仍无 `Config.doubleClickUse`/`Config.autoTarget` 设置入口，当前按启用双击、禁用 autoTarget 的固定值执行。
- 修复: 已修复并验证 (web test/typecheck/build 通过，2026-06-13)

### E18 CardItem::右键查看牌详情 (rightClicked→CardDetail)
- 状态: 未还原
- 原版: CardItem.qml:53-56 (onRightClicked→startCheat CardDetail) + BasicItem.qml:45-52 (右键/长按)
- web : 无
- 原版行为: showDetail && known 时右键/长按弹出 CardDetail 作弊框看牌详情
- web 行为: CardLayer 卡牌无 onContextMenu/长按（注：GeneralCard.tsx 有，CardItem 牌无）
- 差异: 牌桌/手牌右键看详情缺失（武将牌 E37 有，普通卡牌无）

---

## C. 牌桌牌堆 / 抽牌堆 / footnote / hover / chosen

### E19 TablePile::牌桌牌居中铺排
- 状态: 完全还原
- 原版: TablePile.qml:13-17 (CardArea anchors.horizontalCenter, w=min(root.width,length*93*0.8+1))
- web : CardLayer.tsx:82-84 (centered=tablePile) + areas.ts:27 (TABLE_PILE)
- 原版行为: 牌桌 CardArea 水平居中，宽随牌数增长（每牌 93*0.8）
- web 行为: tablePile centered=true，rowW 居中于 box；TABLE_PILE box=0.15w..0.85w
- 差异: 无（居中语义一致）

### E20 TablePile::牌桌牌缩放 0.8
- 状态: 简化还原
- 原版: TablePile.qml:84-88 (add: c.cardScale=0.8)
- web : 无显式 cardScale（CardLayer 统一 CARD_W/CARD_H）
- 原版行为: 入桌牌 cardScale=0.8（比手牌小）；离桌恢复 1
- web 行为: 牌桌牌与手牌同尺寸 CARD_W=70/CARD_H=100，无 0.8 缩放
- 差异: 牌桌牌未缩小（视觉上牌桌牌与手牌等大，原版桌牌更小）

### E21 TablePile::牌桌牌随机旋转 (Config.rotateTableCard)
- 状态: 未还原
- 原版: TablePile.qml:86-88 (rotateTableCard → rotation=(random-0.5)*5)
- web : 无
- 原版行为: rotateTableCard 开启时入桌牌随机旋转 ±2.5°
- web 行为: 无旋转
- 差异: 牌桌牌随机倾斜效果缺失

### E22 TablePile::vanishTimer 牌堆消失
- 状态: 完全还原
- 原版: TablePile.qml:35-74 (vanishTimer 1500ms 两阶段) + InvisibleItemArea.remove
- web : cardStore.ts:198-207 (vanishTableCards) + CardLayer.tsx:113-116 (1500ms setInterval) + 168-181 (destroy*)
- 原版行为: 1500ms 周期；toVanish 时清除 busy/inTable/holding_event_id!=0 外的弃牌（origOpacity=0 goBack destroyOnStop）；两阶段收集
- web 行为: 1500ms interval 调 vanishTableCards；移除 eventIds==0 的桌牌；Destroy* 命令只清 eventId 不立即移除（保动画），与原版"立即移除会动画错误"注释一致
- 差异: 无（逻辑层端口忠实）

### E23 BasicCard::footnote 脚注文字
- 状态: 完全还原
- 原版: BasicCard.qml:38-51 (footnoteItem Text) + TablePile add footnoteVisible=true + Dashboard.qml:171 (card.footnote=tr(...))
- web : CardLayer.tsx:217-222 (cardNotes footnote / expand footnote) + cardNoteStore.ts
- 原版行为: footnoteVisible 时底部 10px 上方显示 footnote；color #E4D5A0 outline；libian pixelSize 14 居中 WrapAnywhere
- web 行为: cardNotes[cid].footnote(SetCardFootnote 已本地化)优先，否则 expand-pile footnote(tr)；底部条 color #E4D5A0 居中
- 差异: 字号固定 10 vs 14、字体非 libian；位置/颜色/来源一致

### E24 BasicItem/BasicCard::hover 发光 (RectangularGlow glowItem)
- 状态: 未还原
- 原版: BasicCard.qml:24-30,71-84 (onHoverChanged→glow opacity；RectangularGlow #88FFFFFF radius8 Behavior 200ms) + BasicItem HoverHandler:78-89
- web : 无
- 原版行为: 鼠标悬停牌时白色外发光淡入(200ms)；悬停时 z 提升到 maxZ+1
- web 行为: CardLayer 无 hover 发光、无 hover z 提升
- 差异: 悬停发光高亮、悬停置顶缺失

### E25 BasicCard::选中 chosen 标记
- 状态: 完全还原
- 原版: BasicCard.qml:53-61 (chosen Image, chosenInBox) y:90 scale:1.25 z:1
- web : CardLayer.tsx:224 (chosenPic) + styles.chosen
- 原版行为: chosenInBox 可见时显示 cardDir+"chosen"，水平居中 y=90 scale 1.25
- web 行为: st.selected 时 chosenPic() 居中 top=90/130*100% scale 1.25 z1
- 差异: 原版 chosen 由 chosenInBox（选择框内）控制，web 由 selected 控制；触发场景略不同但均为"被选中"标记

### E26 CardArea::InvisibleCardArea 牌从中心飞散 (remove)
- 状态: 简化还原
- 原版: InvisibleItemArea.qml:21-40 (remove: 中心 ±(i-n/2)*15 散开创建) + InvisibleCardArea.qml
- web : CardLayer.tsx:157-176 (settle flights，对端手牌/装备/判定飞入)
- 原版行为: 不可见区(对手手牌/抽牌堆)的牌移出时在源中心点创建并 ±15px 错开，再 goBack 飞向目标
- web 行为: lastMoved 中目标为 equip/judge/对端 hand 的牌，从上一浮动位/源 box 飞入并淡出(FlightCard)
- 差异: web 用一次性 FlightCard 飞入+淡出近似，未精确复刻 ±15px 中心散开的多牌错位；单牌飞行路径等价

### E27 抽牌堆位置 (drawPile)
- 状态: 完全还原
- 原版: Room.qml drawPile x=w/2 y=roomScene.height/2（场景中心点堆叠）
- web : areas.ts:23 (DRAW_PILE 居中场景)
- 原版行为: 抽牌堆在场景正中堆叠
- web 行为: DRAW_PILE box 居中 STAGE 中点，drawPile centered=true
- 差异: 无

---

## D. 武将牌 (GeneralCardItem) — 选将框

注：web GeneralCard.tsx 用于选将框（93×130）。原版 GeneralCardItem 还兼作 Photo 内武将卡，web Photo 另有实现（Phase D 范畴），此处只对选将框视觉。

### E28 GeneralCardItem::武将立绘 (cardFrontSource)
- 状态: 完全还原
- 原版: GeneralCardItem.qml:42 (enabledSkins[name] 或 getGeneralPicture) + MediaArea
- web : GeneralCard.tsx:34,70-72 (generalPicCandidates onError 递进) + skin.ts
- 原版行为: 优先 Config.enabledSkins[name]，否则 getGeneralPicture；PreserveAspectCrop 填充
- web 行为: generalPicCandidates(own ext→所有包)，onError 递进；objectFit cover；缺失→kingdom 色块
- 差异: 未支持 enabledSkins 自定义皮肤（极少用）；标准立绘等价

### E29 GeneralCardItem::势力边框 (border Image)
- 状态: 完全还原
- 原版: GeneralCardItem.qml:50-55 (generalCardDir+"border", margins -1 PreserveAspectFit)
- web : GeneralCard.tsx:74 (generalCardBorder) + styles.border (inset -1 fill)
- 原版行为: known 时叠加 border 边框，margins -1
- web 行为: generalCardBorder() inset -1，onError 隐藏
- 差异: 无

### E30 GeneralCardItem::势力图标 (kingdom Image)
- 状态: 简化还原
- 原版: GeneralCardItem.qml:57-75 (主 kingdom scale .6/1 左上 + subkingdom 双势力图标 scale .6 x8 y12)
- web : GeneralCard.tsx:76-78 (kingdomIcon 左上 scale .6)
- 原版行为: 主势力图标左上(subkingdom 时 scale .6 偏移)，另有 subkingdom 第二图标(双势力武将)
- web 行为: 仅单 kingdom 图标 left -2 top -2 w/h 34*scale
- 差异: 双势力(subkingdom)第二图标未渲染（界限/大势力双势力武将势力标记不全）

### E31 GeneralCardItem::体力勾玉 (magatamaRow/hpRepeater)
- 状态: 未还原
- 原版: GeneralCardItem.qml:77-208 (singlekingdom/duelkingdom magatama + heg 双勾玉 + hp>5 文字)
- web : 无（选将框不显示体力）
- 原版行为: 顶部按 hp 显示势力色勾玉；hp>5 或 hp!=maxHp 显示"x N"/"N/M"文字；heg 模式半勾玉；双势力分色勾玉
- web 行为: GeneralCard 无体力勾玉/文字
- 差异: 选将框武将体力显示完全缺失（无法在选将时看出血量）

### E32 GeneralCardItem::护盾 (Shield)
- 状态: 未还原
- 原版: GeneralCardItem.qml:210-217 (Shield value=shieldNum，shieldNum>0 显示)
- web : 无
- 原版行为: 有护甲值时右上显示护盾图标+数字
- web 行为: 无
- 差异: 护盾显示缺失

### E33 GeneralCardItem::珠联璧合标记 (companions)
- 状态: 未还原
- 原版: GeneralCardItem.qml:219-231 (companions Image, kingdom+"-companions")
- web : 无
- 原版行为: hasCompanions 时显示珠联璧合图标(y:80)
- web 行为: 无
- 差异: 珠联璧合提示图标缺失

### E34 GeneralCardItem::武将名 (generalName + Glow)
- 状态: 完全还原
- 原版: GeneralCardItem.qml:233-255 (generalName 竖排 LiSu pixelSize18 outline + Glow black spread.3 radius5)
- web : GeneralCard.tsx:80 (vertical-rl name + textShadow)
- 原版行为: 左侧竖排武将名 tr(name)，LiSu 18px 白字黑描边/Glow
- web 行为: writing-mode vertical-rl，left 4*scale top 28*scale，fontSize 16*scale，白字 textShadow 黑
- 差异: 字号 16 vs 18、用 textShadow 近似 Glow；竖排/位置/颜色一致

### E35 GeneralCardItem::扩展包名标签 (pkgName)
- 状态: 未还原
- 原版: GeneralCardItem.qml:257-292 (右下 pkgName 渐变标签 tr(pkgName) RichText)
- web : 无
- 原版行为: pkgName!="" 时右下黑渐变背景显示包名(name split "__"[0])
- web 行为: 无
- 差异: 武将所属扩展包标签缺失

### E36 GeneralCardItem::收藏星标 (favoriteGenerals starCanvas)
- 状态: 未还原
- 原版: GeneralCardItem.qml:294-335 (favoriteGenerals.includes && showIsFavorite → 左下红五角星 Canvas)
- web : 无
- 原版行为: 收藏武将左下角红边白描五角星
- web 行为: 无
- 差异: 收藏武将星标缺失

### E37 GeneralCardItem::选中/禁用态
- 状态: 完全还原
- 原版: BasicItem selected + BasicCard !selectable 黑遮罩；右键 generalChanged
- web : GeneralCard.tsx:64-66 (selected outline 金 / disabled grayscale brightness)
- 原版行为: 选中描边；不可选黑遮罩；右键/长按看技能详情(onViewDetail, IG-6)
- web 行为: selected→3px 金 outline；disabled→grayscale(1) brightness(.5)；右键/长按 onViewDetail
- 差异: 不可选用 grayscale 滤镜 vs 黑遮罩，视觉近似；选中/详情交互一致

---

## E. 指示线 (IndicatorLine)

### E38 IndicatorLine::目标指示线
- 状态: 简化还原
- 原版: IndicatorLine.qml:18-103 (Repeater 矩形渐变线段 + Rotation + 三段动画 200/200/300ms)
- web : AnimationLayer.tsx:46-117 (IndicateLines SVG line + 箭头 + 三段 opacity 1100ms)
- 原版行为: from→各 target 链；线段为渐变矩形(白→灰0.12 + 中心亮线 lighter(color))；ratio 增长 200ms OutCubic→hold 200ms→fade 300ms InQuart；color #96943D 宽 6；无箭头
- web 行为: from→链各跳 SVG line + 三角箭头；三段 opacity in180/hold/out 共 1100ms linear
- 差异: (1) web 用 SVG 直线+箭头，原版渐变矩形+无箭头（web 加箭头是增强）；(2) web 无"线段生长(ratio→1)"动画，直接全长淡入；(3) 时长 1100ms vs 700ms（web 故意延长便于跨桌阅读）；(4) 缓动 linear vs OutCubic/InQuart。视觉目的一致，呈现简化

---

## 状态计数

| 状态 | 数量 | 序号 |
|------|------|------|
| 完全还原 | 18 | E1,E2,E5,E6,E9,E10,E11,E12,E16,E19,E22,E23,E25,E27,E28,E29,E34,E37 |
| 简化还原 | 9 | E4,E7,E14,E15,E17,E20,E26,E30,E38 |
| 还原错误 | 0 | （E9 复核为误判，已升级为完全还原 2026-06-12） |
| 未还原 | 11 | E3,E8,E13,E18,E21,E24,E31,E32,E33,E35,E36 |

（总计 38 条；E14/E15/E17 已由未还原推进到简化还原，剩余未还原索引列 11 个视觉子系统。）

### 未还原索引
E3(无色色块) E8(禁用原因文字) E13(无用牌下沉) E18(卡牌右键详情) E21(牌桌随机旋转) E24(hover发光/置顶) E31(选将体力勾玉) E32(护盾) E33(珠联璧合) E35(扩展包标签) E36(收藏星标)

### 还原错误索引
（无；E9 经源码复核确认是误判——原版同样 selectable=enabled 同一 VM 信号，web 等价，已升级为完全还原 2026-06-12）
