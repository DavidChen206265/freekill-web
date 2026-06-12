# Phase J — 总览/详情/筛选页 还原审计

范围：武将一览(GeneralsOverview)、卡牌一览(CardsOverview)、武将详情(GeneralDetailPage)、武将筛选(GeneralFilter)、武将池一览(GeneralPoolOverview)、战绩一览(GameDataOverview)、统计一览(StatisticsOverview)。

## 关键结论（先读）

web 端**完全没有**任何独立总览/详情/筛选/战绩页面。`apps/web/src/pages/` 只有 `LobbyPage.tsx`、`LoginPage.tsx`；LobbyPage 仅有 header(在线数/刷新/建房/退出) + RoomList + ChatBox，**无任何入口**通往武将一览、卡牌一览、武将池、战绩统计。

web 唯一与"武将详情"沾边的是 `table/GeneralDetailModal.tsx` —— 但它是**对局内**右键/长按 Photo 或选将框候选时弹出的技能面板（DET1b PlayerDetail + IG-6 GeneralDetailPage 技能列表的截取），不是大厅的 GeneralDetailPage 全功能详情页。它只显示：武将名(tr) + 单张立绘(GeneralCard) + 可见技能列表(名+描述+相关技能紫色)。

原版这些页面的入口在 `Fk/Pages/Lobby/LobbyElements`（武将一览/卡牌一览按钮）与对局准备/结算流程（武将池、战绩），web 大厅与房间流程均未实现这些入口。

---

### J1 GeneralsOverview::整页(武将一览)
- 状态: 未还原
- 原版: Fk/Pages/LunarLTK/GeneralsOverview.qml:12 (W.PageBase root)
- web : 无
- 原版行为: 左侧 260px 双列 ListView（大包 modList 行40px + 小包 pkgList 行40px，小包点击在 banPkg 模式下切换禁包并显示 locked.png 锁图标）；顶部 ToolBar（标题随 stat 切换 Generals Overview/$BanPkgHelp/$BanCharaHelp，搜索 TextField+🔍按钮，Filter 按钮(长按重置)，Revert Selection，BanGeneral/OK，BanPackage/OK，Quit）；GridView cellWidth100 cellHeight140 显示 GeneralCardItem，禁将黑色遮罩 opacity0.5 + GlowText("禁用"/"启用")；footer "共N个武将"；vanish/appear 淡入淡出动画(150ms)；点击武将打开 generalDetail Popup(0.6×0.8)
- web 行为: 无此页、无入口、无大包/小包列表、无搜索、无禁将/禁包、无 GridView、无动画、无 footer 计数
- 差异: —

### J2 GeneralsOverview::大包小包列表(modList/pkgList)
- 状态: 未还原
- 原版: GeneralsOverview.qml:26-115 (modList ListView / pkgList ListView)
- web : 无
- 原版行为: modList 大包 model=mods(name)，currentIndex 高亮 snow 底；pkgList 小包 model=JSON.parse(当前大包.pkgs)，禁包灰字+locked.png，highlight 黄色#FFCC3F radius5 scale0.8；切包触发 vanishAnim 重新过滤 generals；按 Config.serverHiddenPacks 隐藏
- web : 无
- 差异: —

### J3 GeneralsOverview::搜索(searchGenerals/searchAllGenerals)
- 状态: 未还原
- 原版: GeneralsOverview.qml:148-171,370-375 (word TextField + vanishAnim.onFinished)
- web : 无
- 原版行为: TextField 输入名字，回车或🔍按钮触发；word.text 非空时 Ltk.searchAllGenerals(全局搜)，否则 Ltk.searchGenerals(当前小包, "")
- web : 无（clientVm 桥接亦无 searchGenerals/searchAllGenerals）
- 差异: —

### J4 GeneralsOverview::禁将/禁包(doBanGeneral/banPkg)
- 状态: 未还原
- 原版: GeneralsOverview.qml:96-111,201-242,281-331,484-505 (stat 状态机 + doBanGeneral)
- web : 无
- 原版行为: stat 0/1/2（normal/banPkg/banChara）；BanPackage 模式点小包切 Config.curScheme.banPkg；BanGeneral 模式点武将 doBanGeneral 切 banPkg/normalPkg 名单；Revert Selection 反选全部；禁将 GlowText 显"禁用"，黑遮罩；Config.curSchemeChanged()
- web : 无（web 无方案 scheme/curScheme 概念在 UI 层）
- 差异: —

### J5 GeneralsOverview::武将计数 footer
- 状态: 未还原
- 原版: GeneralsOverview.qml:334-345 (footer Label "共"+generals.length+"个武将")
- web : 无
- 原版行为: GridView footer 居中显示 "共N个武将"，libianName 字体 lightgrey
- web : 无
- 差异: —

### J6 GeneralDetailPage::整页(武将详情)
- 状态: 简化还原
- 原版: Fk/Pages/LunarLTK/GeneralDetailPage.qml:12 (Item root)
- web : apps/web/src/table/GeneralDetailModal.tsx:62-88 (generalName 分支)
- 原版行为: 左栏 GeneralCardItem(scale1.5) + 信息文本(包名/称号/设计/配音/插画/隐藏标记) + Set as Avatar + Set/Remove Favorite 按钮；右栏 SwipeView 四标签页(技能描述/语音文本/战绩统计/同名武将) + ViewSwitcher 切页
- web 行为: 单个弹窗 modal 仅显示：武将名(tr 标题) + 单张立绘 GeneralCard(93×130) + 技能列表(名+PromptText描述，相关技能紫色 relatedSkill)。无左栏信息文本、无按钮、无 SwipeView、无标签切换
- 差异: 仅还原"技能描述"一页且无标签框架；缺信息栏全部字段、缺 Set as Avatar/Favorite、缺语音/战绩/同名武将三页（见 J7–J16 逐项）

### J7 GeneralDetailPage::立绘(detailGeneralCard scale1.5)
- 状态: 简化还原
- 原版: GeneralDetailPage.qml:317-321 (GeneralCardItem scale1.5 TopLeft)
- web : GeneralDetailModal.tsx:73 (GeneralCard width93 height130)
- 原版行为: 左上 GeneralCardItem 名=general，放大1.5倍，transformOrigin TopLeft
- web 行为: 普通 93×130 GeneralCard，无1.5放大
- 差异: 尺寸未放大；位置/布局不同（modal 居中而非左栏固定）

### J8 GeneralDetailPage::信息栏(包名/称号/设计师/配音/插画/隐藏)
- 状态: 未还原
- 原版: GeneralDetailPage.qml:325-354 (Text text:[package,Title,Designer,Voice Actor,Illustrator] + hidden)
- web : 无
- 原版行为: 列出 Lua.tr(包名)、"称号: "+tr("#"+general)、"设计: "+tr("designer:"+general)、"配音: "+tr("cv:"+general)、"插画: "+tr("illustrator:"+general)，缺失时回退 tr("Official")；hidden 武将追加灰字"隐藏武将"
- web : 无任一字段（GeneralDetail 接口仅 kingdom/hp/maxHp/skill，且 modal 未渲染 kingdom/hp/maxHp）
- 差异: —

### J9 GeneralDetailPage::技能描述(skill 列表)
- 状态: 简化还原
- 原版: GeneralDetailPage.qml:102-111 (data.skill 遍历 append skillname + description)
- web : GeneralDetailModal.tsx:75-83 (genDetail.skill.map)
- 原版行为: 跳过 '#' 开头技能；skill-name 19px粗体，相关技能(is_related_skill)整段 purple；append 到 generalText RichText；链接可点(onLinkActivated 展开/back)
- web 行为: 桥接 __fkGeneralDetail 已跳过 '#' 技能；显示技能名(绿色#9FD49C 粗体17px) + PromptText 描述；相关技能名变紫(relatedSkill)但描述不变紫
- 差异: 技能名颜色不同(原版黑/紫，web 绿/紫)；相关技能描述未整段紫色；无链接展开/返回(onLinkActivated)；无 headnote/companions/endnote(见 J10/J11)

### J10 GeneralDetailPage::headnote/endnote(开篇/结尾注)
- 状态: 未还原
- 原版: GeneralDetailPage.qml:85,118-122 (data.headnote / data.endnote)
- web : 无
- 原版行为: headnote 非空在技能列表前 append lightslategrey 灰字；endnote 非空在末尾 append 灰字
- web : 无（桥接未返回 headnote/endnote）
- 差异: —

### J11 GeneralDetailPage::companions(关联武将列表)
- 状态: 未还原
- 原版: GeneralDetailPage.qml:87-91 (data.companions map Lua.tr join)
- web : 无
- 原版行为: companions 非空显示 slategrey 粗体"Companions: " + 各武将名(tr) 空格分隔
- web : 无（桥接未返回 companions）
- 差异: —

### J12 GeneralDetailPage::语音文本页(技能/胜利/阵亡语音)
- 状态: 未还原
- 原版: GeneralDetailPage.qml:438-601 (audioModel + audioWin + audioDeath)
- web : 无
- 原版行为: 第二标签页 GridLayout 2列技能语音按钮(skillAudioBtn：名+索引+语音文本，点击 Backend.playSound，长按复制语音代码$name:idx，⋮菜单复制代码/文本)；Win audio 按钮("!"+general 文本)；Death audio 按钮("~"+general)；addSkillAudio/addSpecialSkillAudio 逐 idx 探测语音文件
- web : 无此页、无语音列表、无播放/复制
- 差异: —

### J13 GeneralDetailPage::战绩统计页(胜率SQL表)
- 状态: 未还原
- 原版: GeneralDetailPage.qml:124-192,603-618 (otherText + SQL myGameData 按 mode 分组)
- web : 无
- 原版行为: 第三标签页 otherText：技能描述全字符数 + 文采评级(惜墨如金/短小精悍/.../罄竹难书 8级带色)；SQL 查 myGameData 按 mode 统计本武将出战/胜/负/平/胜率，渲染 HTML 表格 + "总出战N场 胜利N场 胜率X%"
- web : 无此页、无字符数评级、无 SQL 战绩（web 无本地 myGameData 库）
- 差异: —

### J14 GeneralDetailPage::同名武将页(getSameNameGenerals)
- 状态: 未还原
- 原版: GeneralDetailPage.qml:195-210,620-642 (Lua.evaluate trueName 匹配 + GeneralCardItem 网格)
- web : 无
- 原版行为: 第四标签页 5列 GridLayout，Lua 查 trueName 相同的其他武将，点击 changeGeneralDetailInside 跳转该武将详情(并回技能页)
- web : 无此页、无同名武将查询、无 changeGeneralDetailInside 跳转
- 差异: —

### J15 GeneralDetailPage::Set as Avatar 按钮
- 状态: 未还原
- 原版: GeneralDetailPage.qml:361-375 (Win.Button "Set as Avatar" notifyServer UpdateAvatar)
- web : 无
- 原版行为: canSetAvatar 且非当前头像时可点，notifyServer("UpdateAvatar", name)，4秒 opTimer 冷却 + App.setBusy
- web : 无
- 差异: —

### J16 GeneralDetailPage::收藏按钮(Favorite)
- 状态: 未还原
- 原版: GeneralDetailPage.qml:377-391 (Set/Remove Favorite 切 Config.favoriteGenerals)
- web : 无
- 原版行为: 切换 Config.favoriteGenerals 数组增删该武将，按钮文案随 isFavor 变 Set as Favorite/Remove from Favorite
- web : 无（web 无 favoriteGenerals 概念）
- 差异: —

### J17 GeneralDetailPage::ViewSwitcher 四标签
- 状态: 未还原
- 原版: GeneralDetailPage.qml:401-405,645-654 (SwipeView + W.ViewSwitcher 4页)
- web : 无
- 原版行为: 顶部 ViewSwitcher 切 [技能描述/语音文本/战绩统计/同名武将]，SwipeView 不可手势(interactive:false)随 drawerBar.currentIndex 切页
- web : 无（modal 单页平铺技能，无标签）
- 差异: —

### J18 CardsOverview::整页(卡牌一览)
- 状态: 未还原
- 原版: Fk/Pages/LunarLTK/CardsOverview.qml:11 (W.PageBase root)
- web : 无
- 原版行为: 左侧 130px 包列表 ListView(highlight 粉#E91E63)；中间 GridView cell100×140 CardItem(同名牌合并显 "xN" 角标)；右侧 310px cardDetail 详情(立绘+卡牌描述 tr(":"+name)+特殊技能+花色点数列表+语音按钮)；Quit 按钮；vanish/appear 动画
- web : 无此页、无包列表、无卡牌网格、无卡牌详情、无语音
- 差异: —

### J19 CardsOverview::卡牌详情(updateCard/花色点数/语音)
- 状态: 未还原
- 原版: CardsOverview.qml:199-389 (updateCard + addCardAudio + loadAudio)
- web : 无
- 原版行为: 显示卡牌立绘+dupCount；cardText append tr(":"+name) + 特殊技能(getCardSpecialSkills) + "每种花色点数:"列表(♠♥♣♦+convertNumber)；语音按钮 male/female/equip_effect/equip_use 四类，点击 Backend.playSound
- web : 无（注：web 有 CardFaceView.tsx 用于对局内卡面，但无卡牌一览详情/语音）
- 差异: —

### J20 CardsOverview::同名牌合并(dupCount)
- 状态: 未还原
- 原版: CardsOverview.qml:66-102,121-162 (groupedCardList + dupCount "xN")
- web : 无
- 原版行为: 同名牌(如杀)合并为一格，右下角 "xN" 白字描边显示张数；点击展开该名所有花色点数
- web : 无
- 差异: —

### J21 GeneralFilter::整页(武将筛选)
- 状态: 未还原
- 原版: Fk/Pages/LunarLTK/GeneralFilter.qml:10 (Flickable root)
- web : 无
- 原版行为: 筛选表单：名字(name)、称号(title)、势力(kingdom 可展开多选)、最大体力(maxHp)、体力(hp)、性别(gender: male/female/bigender/agender)、启用状态(enabledStatus)、技能名(skillName)、技能描述(skillDesc)、设计师(designer)、配音(voiceActor)、插画(illustrator)、语音文本(audioText)；Clear/OK 按钮 finished(output())；属性来自 Ltk.getAllProperties()
- web : 无此页、无任一筛选字段
- 差异: —

### J22 GeneralFilter::output 筛选条件
- 状态: 未还原
- 原版: GeneralFilter.qml:496-538 (getCheck + output 返回 13 字段对象)
- web : 无
- 原版行为: 输出 {name,title,kingdoms,maxHps,hps,genders,enabledStates,skillName,skillDesc,designer,voiceActor,illustrator,audioText}，回传 GeneralsOverview 调 Ltk.filterAllGenerals
- web : 无（桥接无 filterAllGenerals/getAllProperties）
- 差异: —

### J23 GeneralPoolOverview::整页(武将池一览)
- 状态: 未还原
- 原版: Fk/Pages/LunarLTK/GeneralPoolOverview.qml:12 (W.PageBase root)
- web : 无
- 原版行为: 左侧 140px 收藏武将栏(Favorite Generals，GridView 64×64 Avatar，禁用武将黑遮罩 + favorite 角标)；顶栏 "N generals are enabled in this room" + Show by packages 开关 + Copy as ban scheme + Quit；主区按包分组 ListView(包名+武将 Avatar 网格)或全平铺 GridView；点击 Avatar 打开 GeneralDetailPage Popup
- web : 无此页、无收藏栏、无启用计数、无导出禁将方案、无分包/平铺切换
- 差异: —

### J24 GeneralPoolOverview::Copy as ban scheme(导出方案)
- 状态: 未还原
- 原版: GeneralPoolOverview.qml:112-143 (导出 disabledGenerals/disabledPack → scheme JSON 复制)
- web : 无
- 原版行为: 读 ClientInstance.disabled_generals/disabled_packs，按 40% 阈值生成 banPkg/normalPkg，复制 JSON 到剪贴板 + Export Success toast
- web : 无
- 差异: —

### J25 GameDataOverview::整页(战绩/录像列表)
- 状态: 未还原
- 原版: Fk/Pages/Replay/GameDataOverview.qml:9 (Item root)
- web : 无
- 原版行为: ListView 战绩列表，每行 主/副将 Avatar+名、胜负平(Game Win/Lose/Draw)、模式(mode)、身份(role)、结束时间(time 格式化)；点击展开 64→114px 显三按钮(Replay Recording/View Endgame/Bookmark Replay，按 SQL 查询是否过期/已收藏)；数据来自 ClientInstance.getMyGameData()
- web : 无此页、无战绩列表、无录像回放/查看终盘/收藏
- 差异: —

### J26 StatisticsOverview::整页(统计一览)
- 状态: 未还原
- 原版: Fk/Pages/Replay/StatisticsOverview.qml:8 (Item root)
- web : 无
- 原版行为: 左侧结果表(武将/模式/身份/胜/负/平/总/胜率，表头粗体，SQL myGameData 聚合)；右侧操作面板(Merge Modes 开关、Merge Roles 开关、武将多选 CheckBox 网格 generalFilter)；切换即重查 query()
- web : 无此页、无统计表、无合并模式/身份开关、无武将筛选
- 差异: —

---

## 状态计数

| 状态 | 数量 |
|------|------|
| 完全还原 | 0 |
| 简化还原 | 3 (J6, J7, J9) |
| 还原错误 | 0 |
| 未还原 | 23 (J1–J5, J8, J10–J26) |
| 合计 | 26 |

## 未还原序号索引
J1, J2, J3, J4, J5, J8, J10, J11, J12, J13, J14, J15, J16, J17, J18, J19, J20, J21, J22, J23, J24, J25, J26

## 还原错误序号索引
（无）

## 简化还原序号索引
J6（武将详情整页：仅技能页、无标签框架/信息栏/按钮）、J7（立绘未放大、布局不同）、J9（技能列表：颜色不同、无链接展开、缺 headnote/companions/endnote）

## 备注
- web 仅 `table/GeneralDetailModal.tsx` 部分覆盖 GeneralDetailPage 的技能列表（IG-6 对局内选将/Photo 右键路径），无大厅独立详情页。桥接 `__fkGeneralDetail`(clientVm.ts:313) 仅返回 kingdom/hp/maxHp/skill，缺 package/title/designer/cv/illustrator/hidden/companions/headnote/endnote/audio。
- 原版入口位置：武将一览/卡牌一览/武将池在 Lobby 与对局准备流程；战绩/统计在 Replay 模块。web `pages/LobbyPage.tsx` 与房间流程均无对应入口。
