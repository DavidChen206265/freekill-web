# Phase G — 请求弹窗（所有 Box）审计

对照基准：原版 `FreeKill-sourcecode/`（37f8c12 / v0.5.20）vs web `freekill-web/`。

架构事实复核（成立）：web 的 client.lua 逻辑层在 wasmoon 原样运行；server 下发 `AskForXXX` 经 `notifyUI` 通知 UI。被重写的只是 QML→TSX 的呈现层。两类请求：
- **popup 类**（notify + 直接 reply）：由 `stores/popupStore.ts` + `table/RequestPopup.tsx` 还原。
- **ui_emu 类**（`UpdateRequestUI` 增量）：由 `stores/interactionStore.ts` + Dashboard/Photo/CardLayer 还原（active_skill / use_card / response_card / play_card / invoke 的客户端呈现归此类）。

调度对照（原版 `RoomLogic.js` callbacks）：`AskForChoice`(931) 按 `detailed` 标志分流 ChoiceBox(948)/DetailedChoiceBox(950)；`AskForChoices`(962) 分流 CheckBox(982)/DetailedCheckBox(984)。

---

### G1 ChoiceBox::单选选项框（AskForChoice 非 detailed）
- 状态: 完全还原
- 原版: `ChoiceBox.qml:20-42`（GridLayout flow:TopToBottom rows:8；MetroButton；enabled = options 含 modelData；点击 result=index 关闭）
- web : `RequestPopup.tsx:72-88`（active.kind==='choice'）
- 原版行为: 渲染 all_options 全部按钮，仅 options 内的可点；列优先布局每列最多 8 个再换列；点击回 index→server 取对应值；按钮文字 `Util.processPrompt(modelData)`。
- web 行为: 渲染 `values`(all)全部，仅 `options` 内 enabled；`vchoicesGrid` 用 `gridAutoFlow:column` + `gridTemplateRows:repeat(min(8,n))` 复刻列优先 8 行换列；点击 `resolve(opt)` 直接回选中值字符串（popupStore `AskForChoice` 把 display/values 平行存储，reply 值正确）；文字 `tr(opt)`。
- 差异: 文字本地化用 `tr()` 而非 `Util.processPrompt()`；对纯选项 key 等价，对含 `:` 参数的提示型选项会缺插值，属轻微。

### G2 DetailedChoiceBox::带描述单选框（AskForChoice detailed）
- 状态: 完全还原
- 原版: `DetailedChoiceBox.qml:19-71`（横向 ListView，每项 200×290：上方 MetroButton 标题 pixelSize24 + 下方 Flickable 滚动的富文本描述 `Lua.tr(":"+modelData)`，描述缺失时回退 `Lua.tr(modelData)`）
- web : `RequestPopup.tsx`（choice 分支 + `DetailedChoice`）
- 原版行为: 每个选项是一张带标题与**详细描述正文**的卡片，描述支持富文本与滚动；视觉为大卡横向排列。
- web 行为: popupStore 保留 `data[4] detailed` 标志；detailed 时渲染 200×290 横向卡片、滚动描述区和标题按钮；描述优先 `tr(":"+value)`，缺失时回退 `tr(value)`，并经 `PromptText` 支持富文本。
- 差异: 视觉样式为 web 简化皮肤，但描述正文、滚动、禁用态和 reply 值均等价。
- 修复: 已修复并验证（2026-06-13；补 detailed 分流/描述卡片/翻译预注册，`pnpm --filter @freekill-web/web test/typecheck/build` 通过）

### G3 CheckBox::多选框（AskForChoices 非 detailed）
- 状态: 完全还原
- 原版: `CheckBox.qml:23-80`（GridLayout flow:TopToBottom rows:8；MetroToggleButton：enabled = options 含且 (已选<max 或自身已选)；OK enabled = 已选≥min；Cancel visible=cancelable，取消回 result=[]）
- web : `RequestPopup.tsx:90-111`（active.kind==='choices'）
- 原版行为: 多选切换；上限 max 时未选项禁用；min..max 约束；OK/Cancel。
- web 行为: `toggleStr` 多选；`on = enabledSet 含 && (已选<max || picked)` 完全对应；OK `pickedStr.length>=min&&<=max`；cancelable 时取消回 `__cancel`；标题附 `(min~max)`。reply 为选中值数组（popupStore `AskForChoices` 平行存储 display/values）。
- 差异: 取消回 `__cancel` 而非空数组 `[]`；二者服务端均按取消处理，等价。标题多了 `(min~max)` 提示文本（增强，非缺陷）。

### G4 DetailedCheckBox::带描述多选框（AskForChoices detailed）
- 状态: 完全还原
- 原版: `DetailedCheckBox.qml:22-108`（横向 ListView 每项 200×290：MetroToggleButton 标题 pixelSize24 `triggered=result含index` + Flickable 富文本描述 `Lua.tr(":"+modelData)`；底部 OK(enabled≥min)/Cancel(visible=cancelable)）
- web : `RequestPopup.tsx`（choices 分支 + `DetailedChoice`）
- 原版行为: 每选项带描述正文卡片的多选；min..max；OK/Cancel。
- web 行为: popupStore 保留 `data[6] detailed` 标志；detailed 时每项渲染描述卡片，选中态/禁用态、min..max、OK/Cancel 与非 detailed 多选同一套约束；描述优先 `tr(":"+value)` 并回退 `tr(value)`。
- 差异: 视觉样式为 web 简化皮肤，但描述正文、滚动、选择约束和 reply 值均等价。
- 修复: 已修复并验证（2026-06-13；补 detailed 多选分流/描述卡片/翻译预注册，`pnpm --filter @freekill-web/web test/typecheck/build` 通过）

### G5 ChooseGeneralBox::选将框（AskForGeneral）
- 状态: 简化还原
- 原版: `ChooseGeneralBox.qml`（拖拽式磁吸布局：上方候选区 + 下方 `choiceNum` 个结果槽；GeneralCardItem 可拖可点；`updatePosition` 调用 `Ltk.chooseGeneralFilter/Feasible/Prompt`；珠联璧合 hegemony 同伴高亮 `updateCompanion`+阴阳鱼 `inPosition`；按钮：同将转化 SameConvert(123)、OK(135)、查看详情 GeneralDetail(142)；右键自由选将 FreeAssign(176)）
- web : `RequestPopup.tsx:172-206`（GeneralBox）+ popupStore `AskForGeneral:183-193`
- 原版行为: 候选磁吸/拖拽进结果槽；rule 驱动 filter/feasible/prompt；同将转化按钮；查看武将详情按钮；右键自由选将；珠联璧合同伴与主副将阴阳鱼显示。
- web 行为: 点击切换选择（非拖拽磁吸），`GeneralCard` 网格平铺；`vm.chooseGeneralFilter/Feasible/Prompt` 三桥接齐全（clientVm.ts:588-594），selectable/OK/prompt 还原正确；`onViewDetail`→`openGeneral` 还原查看详情。**缺**：同将转化(SameConvert)、自由选将(FreeAssign) 两个作弊按钮；珠联璧合同伴高亮与主副将阴阳鱼标记 hegemony 视觉。
- 差异: 简化——交互从拖拽磁吸降级为点击切换（功能等价）；缺同将转化/自由选将按钮；缺珠联璧合 companion/阴阳鱼视觉。核心规则（filter/feasible/prompt）完全还原。

### G6 CardItem 单选::PlayerCardBox（AskForCardChosen）
- 状态: 完全还原
- 原版: `PlayerCardBox.qml`（分区 ListView：每区左侧竖排区名 + CardItem 网格 7 列；`known = visible_data[cid]!=false`；单选点击走 `shuffleInvisibleOutput`：点暗牌回同区随机暗牌；多选用 OK）
- web : `RequestPopup.tsx:135-165`（cards 分支 max===1）+ popupStore `AskForCardChosen:207-213` `parseGroups`
- 原版行为: 按区分组展示；暗牌显示背面；单选点击时若为暗牌则回同区随机暗牌（防泄露所点）。
- web 行为: `parseGroups` 按 `card_data [[name,[cids]]]` 分组、`known=vd[cid]!==false` 完全对应；`max===1` 时点击调用 `shuffleInvisibleOutput(groups,cid)`（popupStore:144-152 逐区找暗牌集随机替换、可见牌透传），与 QML 算法逐行一致；`CardFaceView faceUp={known}` 渲染背面。
- 差异: 无。

### G7 CardItem 多选::PlayerCardBox（AskForCardsChosen）
- 状态: 完全还原
- 原版: `PlayerCardBox.qml:108-115`（multiChoose OK：enabled = 已选 in [min,max]；reply ids 数组）
- web : `RequestPopup.tsx:135-165`（cards 分支 max>1）+ popupStore `AskForCardsChosen:214-220`
- 原版行为: 多选 min..max，OK 回 cid 数组。
- web 行为: `toggleNum` 多选（max 上限滚动替换）；OK `okCards = pickedNum in [min,max]`；`resolve(pickedNum)` 回数组；min/max 取自 `_min/_max`。
- 差异: 无。（注：原版多选区不走 shuffleInvisible，web 同样多选不 shuffle，一致。）

### G8 AG::五谷/AG 牌堆（FillAG / AskForAG / TakeAG / CloseAG）
- 状态: 完全还原
- 原版: `AG.qml`（`manualBox` 非模态可拖；`addIds` 铺牌 selectable=true；点击 interactive&&selectable → replyToServer(cid)，置 interactive=false；`takeAG(general,cid)` 把该牌 footnote=领取者、selectable=false **不移除**；`close()` 由 CloseAG 触发）；RoomLogic.js:1453-1476。
- web : `RequestPopup.tsx:363-385`（AgBox / DraggableBox）+ popupStore `FillAG:221-237`/`AskForAG:238-262`/`TakeAG:263-274`/`CloseAG:275-278`
- 原版行为: FillAG 铺牌但锁定（仅 AskForAG 后本玩家可点）；点击回 cid 后保持开启变锁定；TakeAG 标记领取者灰显保留；仅 CloseAG 关闭；非模态可拖。
- web 行为: FillAG 建非交互 AG 盒（agInteractive=false，标题"等待…"）；AskForAG 置 interactive 并以 reason(技能名) 作 prompt，且健壮地在缺 FillAG 时自建牌堆；`resolveAg` 回 cid 后保持开启、锁定、prompt"等待…"；TakeAG `takerNameFor` 标 footnote+`agTaken` 灰显且保留卡牌；CloseAG 关闭；`DraggableBox` 非模态可拖、无 backdrop。`takerNameFor` 用 `tr(general)` 对应 QML `Lua.tr(photo.general)`。
- 差异: 无（含并发交互：AG 显示时本玩家可经 play UI 出无懈，已用非模态 click-through 还原）。

### G9 GuanxingBox::观星（AskForGuanxing）
- 状态: 完全还原（视觉简化）
- 原版: `GuanxingBox.qml`（拖拽排列：区名竖排 + 区内空槽 93×130；`initializeCards` 按 org_cards 预置；拖拽 `updateCardDragging/Released/arrangeCards` 精细换位/交换/排序；free_arrange=false 锁 area-0 原牌相对序；OK enabled = 各区≥areaLimits；getResult 回 [[各区 cid 有序]]）；RoomLogic.js:861-899 把 cards(2D card_map) 直接 org_cards + initializeCards。
- web : `RequestPopup.tsx:396-485`（ArrangeBox）+ `arrangeDrop.ts` + popupStore `AskForGuanxing:279-298`
- 原版行为: 卡牌按 card_map 预置各区（"不动→确定"保持发牌序，观星关键）；拖拽调区与序；free=false 锁 area-0；min/max 容量限制；回有序二维数组。
- web 行为: popupStore 按 `cards` 2D map 建 areas（top/bottom，含 min/max 名称）并 `initialSlots` 预置；ArrangeBox `mkInit` 预置各区，tray 为空，保持发牌序；`arrangeDrop` 实现拖入/重排/超容量回挤 tray；`arrangeValid` 校验 [limit,capacity]；`isFree===false` 时锁 `initial[0]`（area-0 原牌不可拖）；reply `st.slots.map(...)` 回二维有序数组。
- 差异: 仅视觉/交互呈现简化（无 QML 的拖拽换位高亮/金色 glow/原牌相对序的精细插点算法），但放入区域与顺序结果一致；规则结果等价。注意 web 的锁定是"完全不可拖"，QML 是"可拖但限制相对序"——对纯观星（free 多为 true）无影响，对 free=false 的复杂排列略严格。

### G10 ArrangeCardsBox::排列牌（AskForArrangeCards）
- 状态: 简化还原
- 原版: `ArrangeCardsBox.qml`（较 GuanxingBox 增 `pattern`(`cardFitPattern` 限制可选)、`poxi_type`(`poxiFilter/Feasible`)、`size`(单行宽槽)、`onSelectedChanged updateCardSelected` 点击在区间移动；reply 经 `ClientInstance.replyToServer` 直接送、cancel 回等长空数组）
- web : `RequestPopup.tsx:396-485`（ArrangeBox 共用）+ popupStore `AskForArrangeCards:319-336`
- 原版行为: 拖拽+点击排列；pattern 限制哪些牌可进 pattern 门区（不匹配不可拖）；poxi_type 用破析规则约束；size 宽槽视觉；cancel 回等长空。
- web 行为: 共用 ArrangeBox；popupStore 解析 capacities/limits/names/is_free/pattern/poxi_type；`arrangePattern` 经 `vm.cardFitPattern` 把不匹配牌加入 locked 不可拖；`arrangePoxiType` 经 VM `poxiFilter/poxiFeasible` 驱动可拖牌与 OK enabled（如 shzl 神吕蒙“涉猎”）。**缺**：`size` 宽槽视觉；点击式区间移动（仅拖拽）。cancel 回 `__cancel` 而非等长空数组。
- 差异: 简化——缺 size 宽槽视觉与点击式区间移动；cancel 回值形式不同（服务端按 cancel 处理，通常等价）。pattern 与 poxi_type 门控已还原。
- 修复: 已修复并验证（2026-06-13；补 poxi_type 排列约束，`pnpm --filter @freekill-web/web test/typecheck/build` 通过）

### G11 AskForExchange::交换牌（AskForExchange）
- 状态: 完全还原（视觉简化，同 G9）
- 原版: 复用 `GuanxingBox.qml`；RoomLogic.js:901-929 把非空 piles 各作一区、limits=0、initializeCards 预置。
- web : `RequestPopup.tsx:396-485`（ArrangeBox）+ popupStore `AskForExchange:299-318`
- 原版行为: 每非空 pile 一区，预置其牌，limit 0（可自由排空/换）；回二维。
- web 行为: popupStore 遍历 piles，非空者建区（capacity=ids.length、limit 0、名取 piles_name），initialSlots 预置；ArrangeBox 同 G9 还原。
- 差异: 仅交互呈现简化（无精细拖拽算法），结果等价。

### G12 PoxiBox::破析（AskForPoxi）
- 状态: 完全还原
- 原版: `PoxiBox.qml`（分区 CardItem；`selectable = chosenInBox || Ltk.poxiFilter(type,cid,selected,card_data,extra)`；OK enabled=`poxiFeasible`；标题 `poxiPrompt` 选后 `refreshPrompt`；暗牌 known=visible_data；OK 走 `shuffleInvisibleOutput`(多选暗牌随机替换)；Cancel visible=cancelable 回[]；**反选按钮 Revert Selection**(131-154) 反转可选集）
- web : `RequestPopup.tsx:214-258`（PoxiBox）+ popupStore `AskForPoxi:337-355`
- 原版行为: VM `poxi_methods[type]` 驱动 filter/feasible/prompt；暗牌随机替换防泄露；cancel 回空；反选按钮。
- web 行为: `vm.poxiFilter/Feasible/Prompt` 三桥接齐全；selectable=`picked含||poxiFilter`、OK=`poxiFeasible`、prompt=`poxiPrompt` 完全对应；`shuffleInvisiblePoxi`(popupStore:159-174 逐区计数选中暗牌、splice 不重复随机替换、保位) 与 QML:206-233 逐行一致；cancelable 时回 `__cancel`。**缺**：反选按钮（Revert Selection）。
- 差异: 缺"反选"便捷按钮（不影响合法性，手动可达等价结果）；cancel 回 `__cancel` vs `[]`（等价）。核心规则与暗牌随机化完全还原。

### G13 ChooseCardsAndChoiceBox::选牌并选项（AskForCardsAndChoice）
- 状态: 完全还原
- 原版: `ChooseCardsAndChoiceBox.qml`（CardItem 横排可滚 `showDetail`；selectable=`!disable_cards.includes`；选中上移 20px；`updateCardSelectable` 超 max 时弹出最早；OK 按钮组：enabled=已选 in[min,max] 且 (index0 恒真 || `Fk.skill_skels[filter_skel].extra.choiceFilter(cards,choice,extra)`)；cancel 按钮组恒 enabled 回空牌；reply `{cards,choice}`）
- web : `RequestPopup.tsx:265-315`（CardsAndChoiceBox）+ popupStore `AskForCardsAndChoice:356-375`
- 原版行为: 选 min..max 牌（disabled 不可选），再选 OK 选项（i>0 受 choiceFilter 门控），或 cancel 选项（回空牌）；reply {cards,choice}。
- web 行为: `toggle`(disabled 跳过、max 滚动)；`okEnabled = countOk && (i===0||choiceFilter)`，`vm.choiceFilter(skel,picked,opt,extra)` 桥接(clientVm.ts:623)与 QML `choiceFilter({cards},choice,extra)` 签名一致；OK 选项组 `resolve({cards:picked,choice:opt})`；cancel 选项组 `resolve({cards:[],choice:opt})`。
- 差异: 无（选中上移 20px 等纯视觉细节略，不影响功能）。

### G14 MoveCardInBoardBox::场上移牌（AskForMoveCardInBoard）
- 状态: 完全还原
- 原版: `MoveCardInBoardBox.qml`（两将名两行空槽；CardItem `known=cardVisibility`、`virt_name`；selectable=`!result||result.item===this`(同时只一张可选)；点击切换 `result={item}` 经 `updatePosition` 把该牌移到对侧行预览；OK enabled=有 result；getResult `{cardId,pos}` pos=原位置）
- web : `RequestPopup.tsx:322-357`（MoveBoardBox）+ popupStore `AskForMoveCardInBoard:376-390`
- 原版行为: 点击一张牌预览移到对侧；仅一张可选；OK 回 `{cardId, pos=原始 position}`（room.lua:2990 用 pos 判 from/to）；再点取消。
- web 行为: `origPos`=positions[cards.indexOf]，`sideOf`= picked?对侧:原侧 预览移动；点击切换 picked（再点 null）；OK `resolve({cardId:picked, pos:origPos(picked)})` pos=原位；`mbVirtNames` 虚拟名覆盖（virtTag）。两侧将名 `trGeneral` 翻译。
- 差异: 无。（QML known=cardVisibility 决定正反面；web `CardFaceView faceUp` 恒 true——见下方说明：MoveBoard 卡 popupStore 未传 known，默认正面；若涉及暗牌会显示正面，属轻微，多数场上移牌为明牌。）

### G15 chooseSkill::选技能（CustomDialog → ChooseSkillBox.qml）
- 状态: 完全还原（限 ChooseSkillBox）
- 原版: `utility/qml/ChooseSkillBox.qml`（经 CustomDialog 加载；loadData([skills,min,max,prompt,generals])；多选 min..max 技能；OK 回选中技能名数组）；RoomLogic.js:1478-1495 CustomDialog 加载扩展 QML。
- web : `RequestPopup.tsx:113-133`（chooseSkill）+ popupStore `CustomDialog:391-423`
- 原版行为: 加载任意扩展 QML；ChooseSkillBox 多选技能回数组。
- web 行为: popupStore 按 `path.endsWith('ChooseSkillBox.qml')` 分流，解析 [skills,min,max,prompt,generals]；多选 min..max；OK `resolve(pickedStr)` 回技能名数组；cancelable=min===0。其余可移植 utility QML 见 G20；包专用 QML/MiniGame → `unsupported` 兜底（显式 console.error，回 `__cancel` 不卡计时）。
- 差异: ChooseSkillBox reply 语义已还原；`csGenerals` 仅用于翻译/face 预取，未单独渲染来源头像，属轻微视觉差异。

### G16 CardNamesBox::选牌名（SkillCardName interaction → CardNamesBox）
- 状态: 简化还原
- 原版: `CardNamesBox.qml`（`SkillCardName.qml` interaction 点击时弹出；网格展示 `all_names` 卡牌图(`SkinBank.getCardPicture`)，`card_names` 内可点，灰罩禁用；点击 result=name 关闭 → 写回 interaction answer）；非独立 AskFor，是 ui_emu interaction 的子弹窗。
- web : Dashboard.tsx `ComboInteraction`（cardname 走 combo 分支，RequestPopup 无 CardNamesBox）
- 原版行为: cardname 型 interaction 点击弹出**卡牌图网格**选牌名，可点集受 choices 限制；弹窗形式。
- web 行为: `interactionStore` cardname 型并入 combo（Dashboard.tsx:155 `type==='combo'||'cardname'`→`ComboInteraction`），呈现为**循环切换按钮**（点击在 all_choices 间轮换），`default_choice` 初值；非弹出卡牌图网格、无禁用灰罩可视化。
- 差异: 简化——CardNamesBox 的卡牌图网格弹窗降级为文字循环按钮；功能（选出一个牌名写回 interaction）可达，但视觉与"可点集 vs 全集"的灰罩区分缺失（轮换按钮 ComboInteraction 仅用 enabled[] 初值，可能轮到禁用项——见 Dashboard 注释 audit#6）。

### G17 GameOverBox::结算框
- 状态: 简化还原
- 原版: `GameOverBox.qml`（标题胜/负/平 `victoryResult`；TableView 10 列：武将/名字/胜负/身份/回合/回复/伤害/受伤/击杀/**荣誉(honor)**；`getSummary` 读 GameSummary banner + `Ltk.findMosts/entitle`；➖/➕ 折叠；按钮：**继续游戏**(1v1)/返回房间/返回大厅/**保存录像**(旁观)/**收藏录像**(玩家)；`onWinnerChanged` **播放胜负音效**）
- web : `GameOverModal.tsx`
- 原版行为: 9+荣誉列结算表；折叠；5 类按钮；胜负音效。
- web 行为: 标题胜/负/平 `resultOf`(对应 victoryResult)；9 列表（武将/名字/胜负/身份/回合/回复/伤害/受伤/击杀）；➖/➕ 折叠；`vm.gameSummary()` 取数据；按钮仅**返回房间**(rebuild VM + 重同步 roster/capacity)+**返回大厅**(QuitRoom)。**缺**：honor 荣誉列、继续游戏(1v1)、保存录像、收藏录像、胜负音效（文件头注释明示 out of batch）。
- 差异: 简化——缺荣誉列、3 个录像/继续按钮、胜负音效；核心结算表与返回房间/大厅还原。

### G18 GeneralDetailPage::武将详情页
- 状态: 简化还原
- 原版: `GeneralDetailPage.qml`(20KB：大立绘、收藏、技能列表(含关联技)、**台词/语音音频列表** `addSkillAudio/addSpecialSkillAudio`、皮肤切换、设置头像等)
- web : `GeneralDetailModal.tsx`（IG-6 generalName 分支：tr(name)、`GeneralCard` 立绘、`vm.generalDetail(name).skill` 技能列表含关联技 relatedSkill 着色 + 描述 `PromptText`）
- 原版行为: 完整武将档案：立绘/技能/台词语音/皮肤/收藏/头像。
- web 行为: 名称 + 单立绘 + 技能名(关联技紫色)+描述；无音频/台词/皮肤/收藏/设置头像。文件头注释明示 presents/stats/audio/skins out of batch。
- 差异: 简化——仅还原"立绘+技能描述"档案核心（选将查看用），缺台词语音/皮肤/收藏/头像。

### G19 PlayerDetail::玩家详情（右键看人）
- 状态: 简化还原
- 原版: `Photo.qml` onRightClicked→startCheat("PlayerDetail")（PlayerDetail.qml：名/立绘/可见技能+描述/可见装备判定牌(含虚拟牌原牌名花色点数)/身份等）
- web : `GeneralDetailModal.tsx`（pid 分支）+ detailStore + Photo.tsx 右键/长按
- 原版行为: 右键玩家看其名/主副立绘/可见技能/可见装备判定区牌（虚拟牌显原牌+转化名）。
- web 行为: `player.name`、主副 `GeneralCard` 立绘、`vm.playerSkills` 可见技能+描述、`vm.playerCards` 可见装备/判定牌 `CardLine`（虚拟牌 `(原牌名花色点数)转化名` + tr(":"+name) 描述）；红黑花色着色；350ms 防误关。
- 差异: 简化——缺身份/体力等额外统计展示；技能与可见牌核心已还原。

### G20 CustomDialog/MiniGame::任意扩展弹窗（除 ChooseSkillBox）
- 状态: 简化还原（架构性）
- 原版: RoomLogic.js:1478-1495 `popupBox.source = AppPath+path; item.loadData/updateData`（加载任意扩展 QML 文件并交互）
- web : popupStore `CustomDialog/MiniGame:391-423` → `unsupported` 兜底；RequestPopup.tsx:61-70
- 原版行为: 运行任意扩展 QML 自定义弹窗/小游戏，完整交互。
- web 行为: 已有限支持 utility 共享 QML：`ChooseGeneralSkillsBox`、`ChooseSkillFromGeneralBox`、`ChooseGeneralsAndChoiceBox`、`ChooseCardNamesBox`、`ChooseCardListBox`，按对应 `loadData` 解析并回原版 reply 形状；打开时预注册可见技能/武将/选项/牌组翻译并预取武将 face/牌 face。包专用 QML 与 `MiniGame` 仍走 `unsupported` 兜底：显式 `console.error('[popup] unsupported special UI', {command,data})`，提示并回 `__cancel`（不卡操作计时器）。
- 差异: 简化（架构边界）——web 不能执行任意 QML/小游戏；共享 utility 弹窗按白名单移植，包专用复杂 QML/MiniGame 仍安全跳过。
- 修复: 已修复并验证（2026-06-13；补 5 个 utility CustomDialog 白名单、翻译/face 预取、unsupported 显式报错，`pnpm --filter @freekill-web/web test/typecheck/build` 通过）

### G21 active_skill::主动技请求呈现（AskForUseActiveSkill）
- 状态: 完全还原
- 原版: `request_type/active_skill.lua`（ReqActiveSkill：RoomScene 内点手牌/角色/OK/Cancel/Interaction；cardValidity/targetValidity/feasible 驱动点亮；expandPile 展开额外牌堆带 footnote；setupInteraction；autoSelectOnlyFeasibleTarget 自动选唯一目标；doOKButton reply {card:{skill,subcards},targets,interaction_data}）
- web : `interactionStore.ts`(applyChange) + Dashboard/Photo/CardLayer 渲染；逻辑层 active_skill.lua 在 wasmoon 原样跑
- 原版行为: VM 计算 enabled/selected/state，UI 仅渲染并回点击；expand 牌、interaction 子面板、自动选目标全在 Lua 内。
- web 行为: client.lua/active_skill.lua **原样运行**（架构事实1）；`UpdateRequestUI` 增量经 interactionStore 合并 CardItem/Photo/Button/SkillButton/SpecialSkills/Interaction；`expandCards`(reason="expand"+footnote) 还原展开牌；interaction 子面板(combo/spin/checkbox/cardname)由 Dashboard 渲染；点击经 `vmStore.interact` 回 VM。逻辑（validity/feasible/autoSelect/expandPile）未重写，直接复用。
- 差异: 无（逻辑层未改写；仅呈现层渲染增量状态）。

### G22 invoke::技能确认（AskForSkillInvoke / ReqInvoke）
- 状态: 完全还原
- 原版: `request_type/invoke.lua`（ReqInvoke=OKScene；OK enabled、Cancel enabled；doOK 回"1"，doCancel 回"__cancel"）
- web : interactionStore Button + Dashboard/CountdownBar 的 OK/Cancel；prompt 经 `setPrompt`（popupStore 注释:427-429 明示 AskForSkillInvoke 是 ui_emu 非 popup）
- 原版行为: 是/否两钮，OK 回"1"，Cancel 回"__cancel"。
- web 行为: ReqInvoke(OKScene) 在 wasmoon 原样跑，经 UpdateRequestUI 推 Button{OK,Cancel} 到 interactionStore，由交互栏渲染；OK/Cancel 经 interact 回 VM，Lua 内回"1"/"__cancel"。
- 差异: 无。

### G23 play_card / use_card / response_card::出牌阶段与响应（ReqPlayCard/ReqUseCard/ReqResponseCard）
- 状态: 完全还原
- 原版: `request_type/{play_card,use_card,response_card}.lua`（ReqPlayCard 增 End 按钮+SpecialSkills 特殊技如重铸；ReqUseCard 目标选择 targetValidity/selectTarget；ReqResponseCard 技能按钮 SkillButton + 转化牌 selected_card；均经 RoomScene/notifyUI）
- web : interactionStore（Button End、SpecialSkills、SkillButton、Photo、CardItem 全覆盖）+ Dashboard/Photo/CardLayer 渲染
- 原版行为: 出牌阶段 End 键+特殊技按钮；用牌选目标；响应牌技能按钮转化；全部 Lua 内计算经 notifyUI。
- web 行为: 三 Handler 在 wasmoon 原样运行；interactionStore 处理 `Button`(含"End")、`SpecialSkills`(specialSkills 数组)、`SkillButton`(skills)、`Photo`、`CardItem`；Dashboard 渲染 End/特殊技/技能按钮，Photo 渲染可选目标态，CardLayer 渲染手牌选中态。点击经 interact 回 VM。
- 差异: 无（逻辑层未改写；呈现层增量状态全字段覆盖）。

---

## 状态计数表（共 23 项；口径：放置/回复结果等价即计完全还原，G9/G11 拖拽视觉简化归入完全）

| 状态 | 数量 | 序号 |
|------|------|------|
| 完全还原 | 16 | G1, G2, G3, G4, G6, G7, G8, G9, G11, G12, G13, G14, G15, G21, G22, G23 |
| 简化还原 | 7 | G5, G10, G16, G17, G18, G19, G20 |
| 还原错误 | 0 | — |
| 未还原 | 0 | — |

## 未还原 / 还原错误序号索引
- 未还原: 无
- 还原错误: 无

## 关键缺口（简化还原中影响较大者）
1. **G16 CardNamesBox 卡牌图网格降级为文字循环按钮**：cardname interaction 并入 combo，缺卡牌图弹窗与可点集灰罩区分，且循环按钮可能轮到禁用项。
2. **G20 包专用 QML/MiniGame 仍无法执行**：utility 共享 QML 已按白名单移植，但包专用复杂 QML 和 MiniGame 仍只能显式报错并安全跳过。
3. **G10 ArrangeCardsBox 剩余视觉/交互简化**：poxi_type 排列约束已接入，仍缺 size 宽槽视觉与点击式区间移动。
