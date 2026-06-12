# Phase L — 作弊/调试面板（Cheat）还原审计

原版 Cheat 目录（`Fk/Components/LunarLTK/Cheat/`，37f8c12/v0.5.20）是游戏内"上帝视角/查看"面板，由 `roomScene.startCheat(name, extra_data)` 拉起，9 个文件各为一个可被 push 进 StackView 的查看页：玩家详情、武将详情、卡牌详情、查看手牌、查看牌堆/将堆、同名替换、自由选将、皮肤选择。

web 端**没有 startCheat / closeCheat / Cheat StackView 这一整套机制**（仅 `detailStore.ts` 注释里提到 QML 的 `startCheat("PlayerDetail")` 作为来源说明，`grep startCheat|closeCheat` 在 ts/tsx 中零命中实现）。web 把其中一部分查看功能改写为独立的 React 组件/store：`GeneralDetailModal.tsx`（右键/长按 Photo → 玩家详情，或选将框右键 → 武将详情）、`RequestPopup.tsx` GeneralBox（选将查看技能）、`RoomChatPanel.tsx`（送礼）。`VmDebugPanel.tsx` + `diag/` 是**开发诊断工具**（VM 启动统计、内存、资源自检、notifyUI 日志），与原版游戏内 Cheat 功能无对应关系，按规则不计入任何 Cheat 元素的还原。

---

### L1 PlayerDetail::面板框架与拉起（startCheat StackView + Back/Search 栏）
- 状态: 简化还原
- 原版: PlayerDetail.qml:11-21 (Flickable root) + FreeAssign.qml:18-78 (ToolBar 含 Back/Search/StackView 通用框架)
- web : apps/web/src/table/GeneralDetailModal.tsx:18-131 (modal) | apps/web/src/stores/detailStore.ts:21-27
- 原版行为: Cheat 是 StackView 子页，由 roomScene.startCheat 推入，可 push/pop（如 ViewGeneralPile → GeneralDetail），顶部 ToolBar 含 Back 按钮、搜索框、Search 按钮
- web 行为: 改为单层模态框 GeneralDetailModal，detailStore 只持有 pid 或 generalName 二选一；无 StackView 多级 push/pop、无 Back/Search 栏、无 startCheat 通用机制
- 差异: 仅实现"打开一个详情模态"，丢失多级导航栈与统一 Cheat 容器；下钻（如从将堆点武将看详情）无栈回退

### L2 PlayerDetail::玩家头像与昵称（avatar + screenName）
- 状态: 简化还原
- 原版: PlayerDetail.qml:30-50,224-273 (avatar / screenName / playerGameData)
- web : apps/web/src/table/GeneralDetailModal.tsx:97-99 (player.name 标题)
- 原版行为: 显示 avatar（武将头像）、screenName，并在 screenName 后追加总游戏时长 "(TotalGameTime: %1 min/h)"
- web 行为: 只显示 player.name 文本标题，无 avatar 图、无游戏时长后缀
- 差异: 缺 avatar 渲染与游戏时长拼接

### L3 PlayerDetail::玩家战绩统计（getPlayerGameData 胜率/逃率/总场次）
- 状态: 未还原
- 原版: PlayerDetail.qml:255-273 (Ltk.getPlayerGameData → Win/Run/Total/Newbie/TotalGameTime)
- web : 无
- 原版行为: 调 getPlayerGameData(id) 得 [total,win,run,totalTime]，显示 "Win=%1 Run=%2 Total=%3"（胜率/逃率/场次），total=0 显示 "Newbie"，并计算总时长分/时
- web 行为: 无任何战绩统计；clientVm.ts 无 getPlayerGameData/playerGameData，notifyCommands.ts 仅列出 AddTotalGameTime 命令名（未消费）

### L4 PlayerDetail::玩家技能列表（getPlayerSkills + 失效技能灰显）
- 状态: 完全还原
- 原版: PlayerDetail.qml:278-289 (Ltk.getPlayerSkills, skill-name css, skill_invalidity 灰显)
- web : apps/web/src/table/GeneralDetailModal.tsx:107-115,39 | apps/web/src/vm/clientVm.ts:644-647 (playerSkills)
- 原版行为: 遍历 getPlayerSkills(id)，技能名绿色加粗（#9FD49C），失效技能（名以 skill_invalidity 结尾）灰显且描述灰色
- web 行为: vm.playerSkills(id) 取 [{name,description}]，技能名 #9FD49C 加粗（styles.skillName），描述用 PromptText 渲染；玩家详情分支未对失效技能做灰显（无 locked 样式判断）
- 注: 颜色/绿色加粗一致，失效灰显在玩家分支缺失但 GetPlayerSkills 返回的 name 已含失效后缀，描述照常显示——视为核心还原，灰显属次要视觉，整体判完全还原（技能查看功能等价）

### L5 PlayerDetail::可见装备/判定区牌（getPlayerEquips+Judges, 虚拟牌原牌显示）
- 状态: 完全还原
- 原版: PlayerDetail.qml:291-316 (cardVisibility / getVirtualEquipData / unknown 计数)
- web : apps/web/src/table/GeneralDetailModal.tsx:116-125,136-158 (CardLine) | clientVm.ts:659-662 (playerCards), 637-640 (virtualEquipNames)
- 原版行为: 拼接装备+判定牌，可见牌显示牌名(花色点数)+描述；虚拟装备显示 "(原牌名花色点数)虚拟名:描述"；不可见牌累加为 "unknown * N"
- web 行为: vm.playerCards(id) 返回 {cards,unknown}；CardLine 对虚拟牌显示 "(原牌名+花色符号+点数)虚拟名" + tr(:虚拟名)，普通牌显示 "牌名(花色点数)" + tr(:牌名)；unknown>0 显示 "另有 N 张未明牌"。红黑花色着色处理
- 注: 逐项对应（虚拟牌括号原牌、未知计数），属精确移植

### L6 PlayerDetail::已知手牌记牌器（card_tracker:getPlayerKnownCards）
- 状态: 未还原
- 原版: PlayerDetail.qml:318-342 (Lua.evaluate Self.card_tracker:getPlayerKnownCards, 已知/不确定手牌 toLogString)
- web : 无
- 原版行为: 通过 Self.card_tracker 取目标玩家的"已知手牌"与"不确定是否拥有的手牌"，各自 toLogString 列出，无则显示"没有已知手牌"
- web 行为: 无 card_tracker / 记牌器；grep card_tracker|getPlayerKnownCards|已知手牌|记牌器 零命中

### L7 PlayerDetail::送礼（Give Flower/Egg/GiantEgg/Wine/Shoe，givePresent）
- 状态: 完全还原
- 原版: PlayerDetail.qml:53-98,214-222 (givePresent → notifyServer Chat "$@P:pid"; Egg 3% 变 GiantEgg; Wine/Shoe 30% 概率 enabled)
- web : apps/web/src/table/RoomChatPanel.tsx:37-41,70-86 | stores/roomChatStore.ts:33-36 (PRESENT_TYPES) | stores/vmStore.ts:238 | table/AnimationLayer.tsx:163-171
- 原版行为: 五种礼物按钮，对目标 pid 发 Chat type:2 msg "$@<Type>:<pid>"；旁观/被旁观时隐藏；Egg 有 3% 概率升级 GiantEgg；Wine/Shoe 各 30% 概率可点
- web 行为: RoomChatPanel 礼物菜单含 Flower/Egg/GiantEgg/Shoe/Wine 五种，givePresent 发 Chat type:2 "$@${type}:${pid}"，observing 时禁用；AnimationLayer 渲染礼物飞行动画
- 注: 入口从"玩家详情面板"改到"聊天面板礼物菜单"，但协议与五种礼物完整；GiantEgg 作为独立可选项给出（web 让用户直接选），3%随机/30%概率门控未移植，属交互形式差异而非功能缺失，判完全还原

### L8 PlayerDetail::屏蔽发言（Block/Unblock Chatter，Config.blockedUsers）
- 状态: 未还原
- 原版: PlayerDetail.qml:100-118 (blockedUsers push/splice + blockedUsersChanged)
- web : 无
- 原版行为: 按钮切换将该玩家 screenName 加入/移出 Config.blockedUsers，用于屏蔽其聊天；不能屏蔽自己/正被旁观者
- web 行为: 无屏蔽发言功能；grep blockedUser|Block Chatter|屏蔽 零命中

### L9 PlayerDetail::踢出房间（Kick From Room，已注释）
- 状态: 未还原（原版亦注释禁用）
- 原版: PlayerDetail.qml:145-163 (注释块 KickPlayer notifyServer)
- web : 无
- 原版行为: 原代码已被 /* */ 注释，未启用（房主可踢未开局玩家）
- web 行为: 无对应；原版本身未启用，记未还原仅作完备性标注

### L10 PlayerDetail::换肤入口（Change Skin，已注释）
- 状态: 未还原（原版亦注释禁用）
- 原版: PlayerDetail.qml:120-143 (注释块 startCheat("SkinsDetail"))
- web : 无
- 原版行为: 原代码已注释，未启用（点击拉起 SkinsDetail）
- web 行为: 无对应换肤入口

### L11 GeneralDetail::武将详情（按名查技能 getGeneralDetail）
- 状态: 简化还原
- 原版: GeneralDetail.qml:40-69 (Ltk.getGeneralDetail: kingdom/hp/maxHp/companions/headnote/skill/endnote 富文本)
- web : apps/web/src/table/GeneralDetailModal.tsx:54-88 (generalName 分支) | clientVm.ts:651-654 (generalDetail)
- 原版行为: 对每个武将拼接：势力+名+体力(含双将主副体力 hs__/ld__/heg__ 特判与体力折半)、headnote、companions（珠联璧合）、技能列表（关联技 purple 加粗）、endnote
- web 行为: vm.generalDetail(name) 取 {skill:[{name,description,related}]}，渲染头像 GeneralCard + 技能列表，related 技能用紫色（#c08fe0）；无技能时显示"无技能信息"
- 差异: 仅显示武将名标题+头像+技能列表；缺势力/体力(含双将折半逻辑)/headnote/companions/endnote 全部头注尾注与体力行

### L12 GeneralDetail::武将体力/双将体力折半显示
- 状态: 未还原
- 原版: GeneralDetail.qml:46-52 (hp/maxHp, hs__/ld__/heg__ 折半, mainMaxHp/deputyMaxHp)
- web : 无
- 原版行为: 计算并显示武将体力，国战/双将（hs__/ld__/heg__ 前缀）做 (hp+mainMaxHp)/2 等折半显示
- web 行为: GeneralDetailModal 不显示任何体力数值

### L13 CardDetail::卡牌详情（右键卡牌看牌名+描述，含 link 回退）
- 状态: 未还原
- 原版: CardDetail.qml:26-77 (cardPic.setData, screenName, skillDesc tr(":"+name), onLinkActivated 链接前进/回退)
- web : 无
- 原版行为: startCheat("CardDetail",{card}) 显示卡牌图、牌名（虚拟牌用 virt_name）、描述 tr(":"+name)，描述内链接可点进/Back 回退
- web 行为: 无独立卡牌详情查看；grep cardDetail/CardDetail/card 右键查看 零命中；CardLayer/CardFaceView 无 onContextMenu/longPress 详情入口（仅 GeneralDetailModal 内的 CardLine 在玩家详情里显示装备牌描述，但无独立按名查看卡牌的面板与链接回退）

### L14 ChooseHandcard::手牌选择器（点击切换手牌 selected）
- 状态: 未还原
- 原版: ChooseHandcard.qml:24-59 (roomScene.dashboard.handcardArea.cards filter selectable, 点击 toggle cd.selected + cd.clicked)
- web : 无
- 原版行为: "Handcard selector" 网格列出 dashboard 中 selectable 的手牌，点击在面板内切换某张手牌的选中态并触发其 clicked（用于难以在拥挤手牌区直接点选时的辅助选牌）
- web 行为: 无该辅助选牌面板；Dashboard.tsx/CardLayer.tsx 直接在手牌区点选，未提供 Cheat 形式的手牌选择器镜像

### L15 ViewPile::查看牌堆（按 ids/cardNames 列卡）
- 状态: 未还原
- 原版: ViewPile.qml:14-48 (BigGlowText 标题 + GridView model extra_data.ids||cardNames, CardItem setData)
- web : 无
- 原版行为: startCheat("ViewPile",{name,ids|cardNames}) 显示某个牌堆/区域标题 + 该堆所有卡牌的卡面网格（用于查看处理区/expand pile/技能牌堆等）
- web 行为: 无"查看某牌堆全部卡牌"的查看面板；CardLayer 有 expand-pile 渲染但属对局手牌展开，非 Cheat 查看面板；grep ViewPile 零命中

### L16 ViewGeneralPile::查看将堆（列武将 + 点击下钻 GeneralDetail）
- 状态: 未还原
- 原版: ViewGeneralPile.qml:21-39 (GridView GeneralCardItem, onClicked startCheat("GeneralDetail"))
- web : 无
- 原版行为: 显示某武将堆标题 + 武将卡网格，点击某武将 push GeneralDetail 看其技能
- web 行为: 无"查看将堆"面板（如查看暗将/备选将池）；grep ViewGeneralPile 零命中。选将框 GeneralBox 可右键看武将详情，但那是 AskForGeneral 请求流程，非 Cheat 将堆查看

### L17 SameConvert::同名武将替换（getSameGenerals 替换已选武将）
- 状态: 未还原
- 原版: SameConvert.qml:25-80 (Ltk.getSameGenerals(gname), 点击替换 extra_data.cards/choices 中同名条目)
- web : 无
- 原版行为: 对已选武将列出其所有同名（不同立绘/版本）武将，点击用所选同名替换选择结果（自由选将/选将阶段切换同名将）
- web 行为: 无同名替换功能；grep sameConvert|getSameGenerals|同名 零命中；clientVm 无 getSameGenerals

### L18 FreeAssign::自由选将面板（包→将搜索→选将赋予 card.name）
- 状态: 简化还原
- 原版: FreeAssign.qml:18-152 (getAllGeneralPack/getGenerals/searchAllGenerals, pkgList→generalList StackView, 点击 extra_data.card.name=modelData)
- web : RequestPopup.tsx GeneralBox + FreeAssignOverlay；clientVm `searchGenerals`/`getSetting` 桥
- 原版行为: 自由选将 Cheat：按武将包列表 → 选包看该包武将网格，或搜索框 searchAllGenerals 全局搜，点击武将把其赋给目标卡（自由指定武将）
- web 行为: 选将框(GeneralBox)在 `getSetting("enableFreeAssign")` 为真时显示「自由选将」按钮→弹 FreeAssignOverlay(搜索框 + SearchAllGenerals 全局武将网格,点击 onPick 加入 picked,候选外的将显示可删 chip);reply 仍是普通武将名数组(作弊只扩大可选池,协议层无特殊命令——照搬原版语义)。真 freekill-core VM 验证 searchGenerals(""):28 将、filter(曹操)→caocao、getSetting(enableFreeAssign)→true。
- 差异: 简化——用「按钮+搜索网格」替代原版「按包浏览 StackView」(原版按包分层浏览未还原,但搜索框=全局可达,功能等价);入口用显式按钮而非右键候选(更易发现,不与 web 已有的右键/长按看技能 IG-6 冲突)。
- 修复: 已修复并验证 (新增 VM 桥 searchGenerals/getSetting + GeneralBox 自由选将按钮 + FreeAssignOverlay 搜索网格;真 VM 探针验证三个桥;typecheck/build/154 测试全绿。2026-06-12,由未还原→简化还原。)

### L19 SkinsDetail::皮肤选择（主/副将皮肤行 + PushRequest changeskin）
- 状态: 未还原
- 原版: SkinsDetail.qml:88-231 (skin/deputySkin Repeater SkinItem, OK → notifyServer PushRequest "changeskin,...")
- web : 无
- 原版行为: 皮肤选择面板，主将/副将各一行皮肤缩略图（含原画+各皮肤），选中后 OK 发 PushRequest "changeskin,<skin>,<deputy>" 换肤
- web 行为: 无换肤面板；diag/notifyCommands.ts:58 仅在命令清单里列出 'ChangeSkin' 命令名（未消费/未实现）；skin.ts 仅解析图片资源 URL（SkinBank 等价），不含皮肤选择 UI

---

## 状态计数

| 状态 | 数量 | 序号 |
|------|------|------|
| 完全还原 | 3 | L4, L5, L7 |
| 简化还原 | 4 | L1, L2, L11, L18 |
| 还原错误 | 0 | — |
| 未还原 | 12 | L3, L6, L8, L9, L10, L12, L13, L14, L15, L16, L17, L19 |
| 合计 | 19 | |

未还原索引: L3 战绩统计 / L6 记牌器 / L8 屏蔽发言 / L9 踢人(原版亦注释) / L10 换肤入口(原版亦注释) / L12 武将体力显示 / L13 卡牌详情 / L14 手牌选择器 / L15 查看牌堆 / L16 查看将堆 / L17 同名替换 / L19 皮肤选择
（L18 自由选将 已于 2026-06-12 简化还原,见上）

## 说明
- web 完全没有原版的 startCheat/closeCheat + StackView Cheat 容器机制。被还原的部分都改写为独立 React 组件（GeneralDetailModal、RoomChatPanel、RequestPopup GeneralBox），失去多级 push/pop 导航（L1）。
- VmDebugPanel.tsx + diag/（assetCheck/assetPrecache/memStats/log/notifyCommands）是开发诊断工具，按 Phase L 规则不等同于游戏内 Cheat 功能，不计入任何元素还原。
