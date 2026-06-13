# Phase M — 角色推测 / mark / 标记系统 还原审计

原版 37f8c12 / v0.5.20。web 客户端逻辑=原版 client.lua 在 wasmoon 原样运行；被重写的是 QML→TSX 的视觉呈现层。
mark 数据路径：原版 `SetPlayerMark` 经 `RoomLogic.js:1286` 按前缀分流到 `Photo.markArea`(MarkArea.qml) / `Photo.picMarkArea`(PicMarkArea.qml)；web 则由 `clientVm.ts:118` 的 `__fkReadPlayers` 在每包后重读 VM 镜像，按相同前缀拆成 `marks`(text)/`picMarks` 两个数组，`gameStore` 落到 `displayMarks`/`picMarks`，`Photo.tsx` 渲染。

---

### M1 文字标记::普通数字标记（generic `@` text mark）
- 状态: 简化还原
- 原版: `Fk/Components/LunarLTK/Photo/MarkArea.qml:40-56` (Text `${name} ${value}`) + 路由 `RoomLogic.js:1291` (非`@!`→markArea)
- web : `apps/web/src/vm/clientVm.ts:163-169` (else 分支) + `apps/web/src/table/Photo.tsx:143-148` (displayMarks)
- 原版行为: 每条 mark 一个 Text，`text = tr(mark_name) + " " + mark_extra`；mark_extra = 数组则 `dat.map(tr).join(' ')`，否则 `tr(dat)`；font Config.libianName，pixelSize 16，letterSpacing -0.6，白字 Text.Outline，textFormat RichText
- web 行为: `<span>{value ? \`${name} ${value}\` : name}</span>`，name 已在 Lua 端 `Translate(k)` 翻译，value=数组 join(' ')/单值 tr。样式 `styles.mark`(Photo.tsx:308)：fontSize 11、深棕底圆角边框 chip，非透明 Text.Outline 描边样式
- 差异: 仅简化——pixelSize 16→11、libian 字体未用、letterSpacing/RichText 未还原；原版无 chip 底框（透明描边文字）而 web 用半透明棕底 chip；textFormat RichText（允许 `<br>`等）web 当纯文本

### M2 文字标记::隐藏值标记（`@@` value-hidden）
- 状态: 完全还原
- 原版: `RoomLogic.js:1295` (`mark.startsWith("@@") ? "" : value`) + MarkArea Text 拼接
- web : `apps/web/src/vm/clientVm.ts:166` (`if k:startsWith("@@") then val = ""`)
- 原版行为: `@@`前缀的 mark 只显示翻译后的名字，value 强制空串（仅展示 mark 名）
- web 行为: 同——`@@`→val="" ，Photo 渲染 `name`（value 空时不拼接），等价

### M3 文字标记::牌堆标记 `@$`(游戏牌) / `@&`(武将牌) 计数显示
- 状态: 完全还原
- 原版: `MarkArea.qml:124-162` setMark `@$`/`@&` 分支 (`special_value += dat.length; mark_extra = dat.join(',')`)，Text 显示 `name special_value`(即**张数**)
- web : `apps/web/src/vm/clientVm.ts:150-169` (`@$`/`@&` 落入 generic else 分支)
- 原版行为: `@$`/`@&` 的值是卡牌/武将列表数组；显示文本为 `名字 数量`（special_value=数组长度），mark_extra 仅作点击查看用，不进显示文本
- web 行为: `@$`/`@&` 同样 `startsWith("@")` 但**非** `@!`，进入 generic 文字分支：`isArr` 时 `val = 数组逐项 Translate 后 join(' ')`，于是显示 `名字 牌名1 牌名2 …` 而非 `名字 数量`
- 差异: 错误——原版显示**张数**，web 显示**逐项翻译拼接的内容**。数组较长时 web 文本会异常变长且语义不符
- 修复: 已修复并验证 (clientVm.ts `__fkReadPlayers` text-mark 分支加 `@$`/`@&` → `tostring(#v)` 计数,照搬 MarkArea.qml:135-137；真 VM 探针验证 @$3卡→"3"/@&2将→"2"/@@隐藏→""/generic@ 仍 join 不变,2026-06-12)

### M4 文字标记::QmlMark `@[type]name`
- 状态: 简化还原
- 原版: `MarkArea.qml:138-147` setMark `@[`分支 (`Ltk.getQmlMark(type,mark,pid).text`→special_value)，Text 显示 `name special_value`
- web : `apps/web/src/vm/clientVm.ts:138-149` (`@[`分支 `GetQmlMark(mtype,k,p.id).text`→textMarks `{name=qm.text, value=""}`)
- 原版行为: 解析 `]` 取 type，调 GetQmlMark 得 `.text` 作为 special_value，文本 = `tr(mark_name) special_value`（名字+计算文本两段）
- web 行为: 取 `qm.text` 作为整条 mark 的 **name**、value="" ；即只显示计算文本，丢弃前缀 mark 名翻译部分
- 差异: 仅简化——原版是「名字+text」两段，web 只渲染 text 一段（mark 名前缀未显示）。M5-b 阶段A 注释承认仅做文本

### M5 文字标记::点击查看牌堆 / QmlMark 路径弹窗 (TapHandler)
- 状态: 未还原
- 原版: `MarkArea.qml:66-114` (TapHandler：`@&`→ViewGeneralPile、`@$`→ViewPile ids/cardNames、`@[`→startCheatByPath、普通→getPile→ViewPile)
- web : 无
- 原版行为: 点击 mark 文字按前缀打开右抽屉牌堆查看（武将堆/牌堆/QML 自定义面板/可见牌过滤）；candidate 状态下禁用
- web 行为: displayMarks 的 `<span>` 无任何 onClick / 抽屉逻辑，纯静态文本
- 差异: 整套点击查看牌堆交互缺失

### M6 文字标记::两列自动排版 arrangeMarks
- 状态: 未还原
- 原版: `MarkArea.qml:175-212` arrangeMarks (短 mark<半宽 占左/右两列、长 mark 独占整行、rowHeight 16、动态计算 height、x/y NumberAnimation 300ms)
- web : 无（`Photo.tsx:307` styles.marks 用 `flexWrap:'wrap', gap:2`）
- 原版行为: 短标记两列布局、长标记换行独占、整体高度按行数计算、位置过渡动画 300ms InOutQuad；底部背景 Rectangle 高度随之 Behavior 动画 (MarkArea.qml:19-32)
- web 行为: flex-wrap 自动换行，无两列/长短分流逻辑，无位置/高度动画，无半透明背景框（M1 中各 chip 自带底，不是整块背景）
- 差异: 排版算法与动画、整块背景框均未还原（视觉布局不同）

### M7 图片标记::`@!` 图标 (PicMarkArea icon)
- 状态: 简化还原
- 原版: `PicMarkArea.qml:20-54` (Item 21×21，Image `SkinBank.getMarkPic(mark_name)` PreserveAspectCrop) + 路由 `RoomLogic.js:1291`
- web : `apps/web/src/vm/clientVm.ts:155-162` (picMarks) + `Photo.tsx:215-226` PicMark + `skin.ts:241` markPicCandidates
- 原版行为: 21×21 图标，源 `getMarkPic`=扫描各 package `/image/mark/<mark>.png`，找不到返回""（图标空）；RowLayout spacing 4
- web 行为: 21×21，`markPicCandidates`=遍历 ART_PKGS 拼 `/packages/<pkg>/image/mark/<mark>.png`，逐个 onError 回退；**全部失败时回退为翻译名文字 chip**（Photo.tsx:223 picMarkFallback，原版无此回退、直接空图）。布局 flex gap 2（原版 spacing 4）
- 差异: 仅简化——候选包为固定 ART_PKGS 列表而非真正扫描全部 package；找不到时 web 显示文字 chip（原版显示空），属增强但偏离；spacing 4→2

### M8 图片标记::右下角数量/文本叠加 special_value
- 状态: 完全还原
- 原版: `PicMarkArea.qml:56-66` (Text anchors 右下，text=special_value，数组→length、`'1'`→''、else tr(value)，pixelSize 20 bold 白 Outline)
- web : `apps/web/src/vm/clientVm.ts:157-160` (sv: isArr→`#v`、`"1"`→""、else Translate) + `Photo.tsx:224` (`{mark.value && <span picMarkVal>}`)
- 原版行为: 数组显数量、值为 1 省略、其他显翻译文本；右下角白字描边
- web 行为: 同一分类规则 sv，渲染右下角 `picMarkVal`(Photo.tsx:315 fontSize 12 描边)
- 差异: （字号 20→12 视觉略小，逻辑等价）

### M9 图片标记::`@!!` 描述（名+描述）
- 状态: 简化还原
- 原版: `PicMarkArea.qml:88-90` (`@!!`→ `data = '<b>'+tr(mark)+'</b><br>'+tr(":"+mark)+(...)` 作为 tooltip 文本)
- web : `apps/web/src/vm/clientVm.ts:161` (`extra = @!! and (Translate(k).." "..Translate(":"..k))`)
- 原版行为: `@!!` 的 tooltip 文本 = 加粗 mark 名 + `<br>` + `:`描述 + （若有值再 `<br>`值）；RichText 渲染
- web 行为: extra = `名 + 空格 + 描述`（无加粗、无换行、不含 value 段），作为 `title` 原生 tooltip
- 差异: 仅简化——无 `<b>`/`<br>` 富文本、未追加 value 段；非 `@!!` 的普通 `@!` 原版无 tooltip 而 web extra="" 等价

### M10 图片标记::悬停/点击 ToolTip
- 状态: 简化还原
- 原版: `PicMarkArea.qml:28-53` (MouseArea hoverEnabled：onEntered 显、onExited 依 clicked、onClicked 固定显示；ToolTip libian pixelSize 20，仅 mark_extra≠"" 启用)
- web : `apps/web/src/table/Photo.tsx:220` (`title={mark.extra || undefined}`)
- 原版行为: 鼠标悬停显 tooltip、单击固定（再移出不消失）、x:20 y:20 定位、自定义字体字号
- web 行为: 原生 HTML `title` 属性悬停提示，无「单击固定」、无自定义样式/定位
- 差异: 仅简化——用浏览器原生 title 代替自绘 ToolTip，丢失点击固定与样式

### M11 角色推测::RoleComboBox 主显示身份图（value 逻辑）
- 状态: 完全还原
- 原版: `RoleComboBox.qml:7-15` + `Photo.qml:285-290` (value: hidden→hidden；role_shown→role；else roleVisibility(pid)?role:"unknown"；Image getRolePic 32×35，visible value!="hidden")
- web : `apps/web/src/table/Photo.tsx:113-126` + `shownRole` `Photo.tsx:268-272` + `rolePic` `skin.ts:161`
- 原版行为: 三态身份解析→getRolePic 取身份图；hidden 时整体隐藏；32×35
- web 行为: `shownRole` 完全相同三态逻辑（roleVisible 来自 VM `Self:roleVisible(p)` clientVm.ts:184），`role!=='hidden'` 才渲染，rolePic 取 `/role/<role>.png`
- 差异: （逻辑 1:1；尺寸由 CSS styles.role 控制）

### M12 角色推测::assumptionBox 点击标注（本地猜测）
- 状态: 完全还原
- 原版: `RoleComboBox.qml:17-29` (内嵌 Image，value="unknown"，visible= root.value=="unknown" && popup 未开，TapHandler 开 popup)
- web : `apps/web/src/table/Photo.tsx:113-126` (guessable= actual==='unknown'，display= guess??'unknown'，onClick openPicker) + `stores/roleGuessStore.ts`
- 原版行为: 仅当真实身份 unknown 时图标可点；点击开选项框；选择后 assumptionBox.value=所选（组件本地、不发服务器、不持久）
- web 行为: actual==='unknown' 时可点，display 用本地 guess 覆盖图标，openPicker 开弹窗；roleGuessStore 纯本地、reset 于新局（注释 roleGuessStore.ts:1-6 明确 1:1）
- 差异: （完全等价，且补充了 hidden 不渲染的正确处理）

### M13 角色推测::optionPopupBox 选项弹窗（4 选）
- 状态: 完全还原
- 原版: `RoleComboBox.qml:31-52` (Column spacing 2，Repeater model options[unknown,loyalist,rebel,renegade]，每项 getRolePic 32×35，点击设 value 并关闭)
- web : `apps/web/src/table/Photo.tsx:129-139` (pickerOpen===id 时渲染列，GUESS_ROLES 4 项 rolePic，点击 setGuess) + `roleGuessStore.ts:12` GUESS_ROLES
- 原版行为: 竖排 4 个身份图标，点击任一设为猜测并关弹窗
- web 行为: 竖排 GUESS_ROLES(unknown/loyalist/rebel/renegade) 4 图标，点击 setGuess（unknown 清除猜测）并关闭
- 差异: （选项集与交互一致）

### M14 banner::SetBanner（roomScene.banner 顶部 MarkArea）
- 状态: 简化还原
- 原版: `RoomLogic.js:1299-1308` (SetBanner→roomScene.banner.setMark/removeMark) + `Room.qml:631-637` (banner 为 MarkArea，x12 y12，bgColor "#BB838AEA")
- web : `apps/web/src/stores/vmStore.ts` SetBanner case + `stores/bannerStore.ts` + `table/BannerArea.tsx`
- 原版行为: 全局顶部横幅区，复用 MarkArea.setMark 同前缀规则展示全局标记（如身份场、特殊模式提示），紫色半透明底框
- web 行为: SetBanner 已出 KNOWN_DEFERRED，按 [mark,value] set/remove 顶部 banner；@@ 隐藏值，@$ / @& 按数组长度显示，普通值走 VM 翻译；区域位于桌面左上角并使用紫色半透明底框
- 差异: 简化——复用 web chip/flex 排版，未还原 MarkArea.qml 的两列 arrangeMarks 动画与点击查看牌堆/QmlMark 交互（见 M5/M6）
- 修复: 已修复并验证 (新增 bannerStore+BannerArea;SetBanner 出 deferred→explicit;bannerStore 2 单测 + notify 分类测试 + typecheck 通过。2026-06-13,未还原→简化还原。)

### M15 标记区可见性::UpdateMarkArea（visible 切换）
- 状态: 完全还原
- 原版: `client.lua:912-918` UpdateMarkArea + `Photo.qml:514-519` handleMarkAreaUpdate (`data.visible`→picMarkArea/markArea.visible)
- web : `vmStore.ts` UpdateMarkArea case + `gameStore.ts` markAreaVisible + `Photo.tsx` mark/picMark 条件渲染
- 原版行为: 服务器可整体隐藏/显示某玩家的两个标记区（markArea+picMarkArea visible）
- web 行为: 消费 `{id,change:{visible}}`，同时隐藏/显示该玩家 displayMarks 与 picMarks；标记内容仍由 VM 镜像同步
- 差异: （显隐语义一致）
- 修复: 已修复并验证 (UpdateMarkArea 出 deferred→explicit;新增 markAreaVisible 并在 syncPlayers 中保留;gameStore 单测覆盖 VM 镜像重读后 visible 不丢。2026-06-13,未还原→完全还原。)

### M16 SpecialMarkArea
- 状态: 完全还原
- 原版: `Fk/Components/LunarLTK/Photo/SpecialMarkArea.qml:5-7` (空 Item，无任何内容)
- web : 无对应文件（无需）
- 原版行为: 原版该组件为空 Item，无渲染/逻辑（占位）
- web 行为: 不存在等价文件——与空实现等价
- 差异: （原版即空，无内容可还原）

### M17 removeMark::value 0 移除
- 状态: 完全还原
- 原版: `RoomLogic.js:1293-1294` (`data[2]===0`→area.removeMark) + MarkArea/PicMarkArea removeMark
- web : `apps/web/src/vm/clientVm.ts:154` (`if num and num ~= 0 then` 才入列；0/nil 不显示)
- 原版行为: mark 值为 0 时从对应区移除该 mark
- web 行为: 每包重读镜像时 `num==0 or nil` 直接不加入 textMarks/picMarks，等价于移除（数据真相源=VM 镜像）
- 差异: （镜像重读模型下等价，无残留）

---

## 状态计数

| 状态 | 数量 | 序号 |
|------|------|------|
| 完全还原 | 9 | M2, M3, M8, M11, M12, M13, M15, M16, M17 |
| 简化还原 | 6 | M1, M4, M7, M9, M10, M14 |
| 还原错误 | 0 | （M3 已修复并验证 2026-06-12，升级为完全还原） |
| 未还原 | 2 | M5, M6 |
| 合计 | 17 | |

## 未还原索引
- M5 点击查看牌堆 / QmlMark 路径弹窗（TapHandler 整套交互）
- M6 MarkArea 两列自动排版 arrangeMarks + 位置/高度动画 + 整块背景框

## 还原错误索引
- （无；M3 `@$`/`@&` 牌堆标记计数 已于 2026-06-12 修复并验证，状态升级为完全还原）
