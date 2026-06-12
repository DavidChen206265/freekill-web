# Phase N — 资源/皮肤/音频/字体/i18n 管线审计

逐行对照原版（FreeKill-sourcecode 37f8c12/v0.5.20）与 web（freekill-web）。

## 架构定位
- 原版资源寻址核心在 **QML 层**：`Fk/Base/SkinBank.qml`（图片/音频路径解析）+ `Fk/Pages/LunarLTK/RoomLogic.js`（LogEvent 触发播放）+ `Fk/Components/.../*.qml`（消费）。`lua/client/client_util.lua` 只提供数据（GetGeneralData.extension 等），**不含路径拼接**。
- web 把 SkinBank.qml + RoomLogic.js 的寻址/播放逻辑**重新实现**为 `apps/web/src/table/skin.ts` + `audio.ts`，由 `vmStore.ts` 在收到 LogEvent 时调用。VM（wasmoon）只经 `clientVm.translate/readGenerals/readCards` 桥接吐出 extension/翻译。
- web 资源由 `apps/web/scripts/sync-fk-assets.mjs` 构建期抽取到 `public/fk/`，配 `audio.json`/`images.json`/`anim.json`/`file-list.json` 清单。SkinBank 的 `Fs.exists` 文件存在性检查在 web 改为**清单集合查表**（浏览器无法 ls 目录）。

---

### N1 武将立绘::主立绘(full picture)
- 状态: 简化还原
- 原版: SkinBank.qml:119 (getGeneralPicture) → :53 (searchPkgResourceWithExtension)
- web : skin.ts:56 (generalPic) + :72 (generalPicCandidates)
- 原版行为: ① resource_pak 美化包覆盖（enabledResourcePacks 优先）→ ② `packages/<extension>/image/generals/<name>.jpg`（extension 来自 GetGeneralData）→ ③ 失败 fallback `searchBuiltinPic("/image/generals/","0",".jpg")`（即 0.jpg 占位图）。
- web 行为: ① 无 resource_pak（美化包整体未实现）；② 用 VM extension 拼 `packages/<ext>/image/generals/<name>.jpg`，并额外对 ART_PKGS 每个包生成候选，按 images.json 裁剪，`<img>` onError 走候选链；③ 无 0.jpg 内建占位，全 miss 时渲染 kingdom 纯色块（Photo.tsx:234）。
- 差异: 缺 resource_pak 美化包覆盖；fallback 用纯色块而非原版 0.jpg；候选链是 web 自创的多包探测（原版 getGeneralPicture 只查自身 extension，不跨包扫描）。

### N2 武将立绘::双将分屏立绘(dual/)
- 状态: 完全还原
- 原版: PhotoBase.qml:76-80,108-114 → SkinBank.qml:112 (getGeneralExtraPic, extra="dual/")
- web : Photo.tsx:90-97 (dual 分屏) + skin.ts:56 (generalPic)
- 原版行为: 有副将时，主/副立绘各自**优先**取 `image/generals/dual/<name>.jpg`（双将专用半身像），`?? getGeneralPicture` 回退到普通整图。
- web 行为: 分屏布局有（dual flex 各 50%），但两侧都直接调 generalPicCandidates 取**普通 full 立绘** `generals/<name>.jpg`，从不尝试 `generals/dual/<name>.jpg`。
- 差异: dual/ 专用立绘完全未取，双将永远显示拉伸的普通整图（原版应显示专门绘制的左右半身像）。
- 修复: 已修复并验证 (skin.ts 新增 `generalDualPicCandidates`——own ext + ART_PKGS 的 `generals/dual/<name>.jpg` 候选在前,再接普通 `generalPicCandidates` 作回退,照搬 PhotoBase.qml:76-78,112-113 的 `getGeneralExtraPic("dual/") ?? getGeneralPicture`;Photo.tsx 双将两半 Portrait 传 `dual` 用之,onError 链 dual→普通。skin.test.ts +1 用例断言 dual→普通顺序;typecheck/build/151 web 测试全绿,2026-06-12)

### N3 武将立绘::头像小图(avatar/)
- 状态: 未还原
- 原版: Avatar.qml:10,23 → SkinBank.qml:112 (getGeneralExtraPic, extra="avatar/")
- web : skin.ts:61 (generalAvatar) | 导出但无调用方
- 原版行为: 大厅/详情/等待房用方形头像，优先 `image/generals/avatar/<name>.jpg`，`?? getGeneralPicture`；存在 avatar 时 useSmallPic=true 直接用，否则对整图做 sourceClipRect(61,20,128,128) 裁脸。
- web 行为: `generalAvatar()` 函数存在（skin.ts:61-63）但**全代码库无调用**；WaitingRoom.tsx:46 头像位用纯文本 `p.general||p.avatar||P{id}`，不加载任何 avatar 图。
- 差异: avatar/ 小图与整图裁脸两条路径都未接线，所有头像位是文字占位。

### N4 武将立绘::extension 解析(GetGeneralData)
- 状态: 完全还原
- 原版: client_util.lua:9 (GetGeneralData) → general.package.extensionName
- web : clientVm.ts:580 (readGenerals) → GeneralInfo.extension
- 原版行为: 由 name 查 Fk.generals[name].package.extensionName 得所属包；name 为 nil 时 fallback diaochan。
- web 行为: VM 桥 readGenerals 批量返回 {extension,kingdom}，skin.ts 用其拼 `packages/<ext>/`；与原版同源（同跑 client_util）。

### N5 卡牌图::全图(card front)
- 状态: 简化还原
- 原版: SkinBank.qml:128 (getCardPicture) → :53/:31
- web : skin.ts:98 (cardPic) + :106 (cardPicCandidates)
- 原版行为: ① resource_pak → ② `packages/<extension>/image/card/<name>.png`（extension 来自 GetCardData/GetCardExtensionByName）→ ③ `searchPkgResource` **遍历所有未禁用包**扫描 → ④ fallback `searchBuiltinPic("/image/card/","unknown")`（unknown.png）。
- web 行为: ② VM extension 优先 → ③ ART_PKGS 遍历候选（images.json 裁剪、onError 链）；无 resource_pak；④ 内建 unknown.png 兜底**未加入候选链**（cardPicCandidates 不 push unknown，仅 equipIcon 那条加了）。
- 差异: 无美化包；全 miss 时卡面无 unknown.png 兜底（CardFaceView 自行渲染文字）。

### N6 卡牌图::装备图标(equipIcon)
- 状态: 完全还原
- 原版: SkinBank.qml:161 (getEquipIcon)
- web : skin.ts:118 (equipIcon) + :127 (equipIconCandidates)
- 原版行为: GetVirtualEquipData 优先（虚拟装备）否则 GetCardData；name=icon||data.name；ext 优先→ searchPkgResource 扫描→ unknown.png 兜底。
- web 行为: ext 优先候选→ ART_PKGS 候选→ pruneToExisting→ **append `image/card/equipIcon/unknown.png`**（skin.ts:139，兜底内建始终保留）。寻址与 fallback 链与原版一致。

### N7 卡牌图::延时锦囊图(delayedTrick)
- 状态: 简化还原
- 原版: SkinBank.qml:149 (getDelayedTrickPicture)
- web : skin.ts:144 (delayedTrickPic) + JudgeArea.tsx:33
- 原版行为: ext 优先 `image/card/delayedTrick/<name>.png`→ searchPkgResource 扫描→ unknown.png 兜底。
- web 行为: 仅返回 `packages/<ext>/image/card/delayedTrick/<name>.png` 单 URL（无候选链、无跨包扫描、无 unknown 兜底）；另导出 sealed.png（JudgeSlot 封印图）。
- 差异: 无跨包扫描、无 unknown.png 兜底；ext 缺失时返回 ''。

### N8 卡牌图::花色/点数/牌背叠加(suit/number/card-back)
- 状态: 完全还原
- 原版: image/card/suit、number/<red|black>、card-back（PokerCard.qml 叠加）
- web : skin.ts:224 (suitPic)、:229 (numberPic)、:235 (cardBackPic)；CardFaceView.tsx:47-48
- 原版行为: 内建 chrome 叠加在包卡面之上；suit=nosuit 不显示；number 1..13；red/black 按 color。
- web 行为: 同路径 `/fk/image/card/suit|number|card-back`；nosuit/越界返回 ''；red/black 映射一致。built-in card chrome 由 sync-fk-assets.mjs:151 同步。

### N9 卡牌图::选中标记/牌背通用(chosen)
- 状态: 完全还原
- 原版: image/card/chosen.png（BasicCard）、card-back.png
- web : skin.ts:245 (chosenPic)、CardLayer.tsx:224
- 原版行为: 选中卡叠 chosen.png。
- web 行为: st.selected 时叠 `/fk/image/card/chosen.png`，一致。

### N10 身份框::势力背景(photoBack)
- 状态: 简化还原
- 原版: SkinBank.qml:177 (getPhotoBack)
- web : skin.ts:155 (photoBack)、Photo.tsx:85
- 原版行为: 内建 `image/photo/back/<kingdom>`→ 若无再查包 `image/kingdom/<kingdom>-back.png`→ 内建 unknown 兜底。
- web 行为: 仅内建 `image/photo/back/<kingdom|unknown>.png`，KINGDOMS 白名单(wei/shu/wu/qun/god/wild)；不查包 kingdom/-back（扩展势力如自定义国背景失效）。
- 差异: 不支持扩展包自带势力背景（image/kingdom/<k>-back.png）。

### N11 身份框::身份图(role)
- 状态: 简化还原
- 原版: SkinBank.qml:198 (getRolePic)
- web : skin.ts:161 (rolePic)、Photo.tsx:120,133
- 原版行为: 内建 `image/photo/role/<role>`→ 包 `image/role/<role>`→ unknown 兜底。
- web 行为: 仅内建 role 白名单(lord/loyalist/rebel/renegade/unknown)；不查包扩展身份。
- 差异: 不支持扩展包自定义身份图。

### N12 身份框::阵亡覆盖图(death)
- 状态: 简化还原
- 原版: SkinBank.qml:209 (getRoleDeathPic)
- web : skin.ts:177 (deathPic)、Photo.tsx:178
- 原版行为: 内建 `image/photo/death/<role>`→ 包 `image/role/death/<role>`→ hidden 兜底。
- web 行为: 仅内建 death/<role>，白名单外→hidden；不查包。
- 差异: 不支持扩展包自定义阵亡图。

### N13 身份框::血珠(magatama)
- 状态: 完全还原
- 原版: magatamaDir = image/photo/magatama/
- web : skin.ts:166 (magatama)、HpBar.tsx
- 原版行为: state 0..3 血珠，-heg 国战变体。
- web 行为: clamp 0..3，heg 变体 `<s>-heg.png`，路径一致。

### N14 身份框::护甲/连环/手牌/装备底(shield/chain/handcard/equipbg)
- 状态: 完全还原
- 原版: image/photo/{magatama/shield,chain,handcard,equipbg}
- web : skin.ts:172,183,213,218；HpBar.tsx:26、Photo.tsx:163
- 原版行为: 内建 chrome 固定路径。
- web 行为: 同路径 `/fk/image/photo/...`，shield/chain 接线，handcard/equipbg 导出（equipbg 由 EquipArea 使用）。

### N15 身份框::净态图标(statePic)
- 状态: 简化还原
- 原版: stateDir = image/photo/state/
- web : skin.ts:250 (statePic) | 导出
- 原版行为: 在线/离线/托管等状态图标 `image/photo/state/<state>.png`。
- web 行为: 函数存在返回固定路径；未见 Photo.tsx 调用接线（state 多用文字/颜色表示）。
- 差异: 路径正确但消费端可能未接（次要）。

### N16 势力卡框::边框+国徽(generalCard)
- 状态: 简化还原
- 原版: generalCardDir = image/card/general/；getGeneralCardDir(kingdom) (SkinBank.qml:188)
- web : skin.ts:87-95 (generalCardBorder/kingdomIcon)、GeneralCard.tsx:10
- 原版行为: GeneralCardItem 用 border + card-back + 按 kingdom 取 `image/card/general/<kingdom>` 国徽，无则包 `image/kingdom/<k>-back.png` 目录。
- web 行为: border.png + kingdomIcon `image/card/general/<kingdom>.png`(白名单)；无 card-back、不查包 kingdom 目录。
- 差异: 缺 card-back 引用与扩展势力国徽回退。

### N17 标记图标::图片标记(markPic)
- 状态: 简化还原
- 原版: SkinBank.qml:220 (getMarkPic) → searchPkgResource("/image/mark/")
- web : skin.ts:241 (markPicCandidates)、Photo.tsx:19
- 原版行为: 遍历所有未禁用包扫描 `image/mark/<mark>.png`，无则返回 ""（不显示图，走文字）。
- web 行为: 对 ART_PKGS 各生成 `packages/<p>/image/mark/<mark>.png` 候选，`<img>` onError 回退文字 chip。
- 差异: 候选限于 ART_PKGS（非"全部未禁用包"），扩展包标记图可能漏；行为大体等价。

### N18 动画精灵::内建表情(setEmotion 内建)
- 状态: 完全还原
- 原版: pixAnimDir = image/anim/；PixmapAnimation 播 0..n-1 帧
- web : skin.ts:197 (resolveAnim)、:208 (animFrameUrl)；PhotoEffects.tsx；anim.json
- 原版行为: 裸名表情(damage/judgebad/judgegood/slash…)只查内建 image/anim/<e>/<i>.png，帧数由目录决定。
- web 行为: 裸名→`image/anim/<e>`，帧数查 anim.json（sync 期 max(序号)+1）；PhotoEffects 循环播放。逻辑一致。

### N19 动画精灵::卡牌/技能包动画(packages anim)
- 状态: 完全还原
- 原版: usecard.lua:20/crossbow 构造 `./packages/<pkg>/image/anim/<card>`
- web : skin.ts:198-202 (resolveAnim 正则)、enumerate.ts:55 (animFramePaths)
- 原版行为: 服务器下发完整 `./packages/<pkg>/image/anim/<name>` 路径，客户端按帧播放。
- web 行为: 正则提取 pkg+name → `packages/<pkg>/image/anim/<name>`，key=`<pkg>/<name>` 查 anim.json 帧数；sync 期 copyAnimDir 支持嵌套(skillInvoke/<type>)。一致。

### N20 动画精灵::聊天投掷(egg/flower/shoe/wine)
- 状态: 还原错误
- 原版: image/anim/{egg,flower,shoe,wine}/（具名帧 egg0.png/shoe_s.png，ChatAnim QML 按名播放）
- web : AnimationLayer.tsx:163 (PRESENT_GLYPH emoji)；enumerate.ts:44 CHAT_ANIM_KEYS 排除
- 原版行为: 送花/砸蛋从发送者飞向目标，播放具名精灵帧动画。
- web 行为: 用 emoji 字形(🌹🥚👟🍷)做 WAAPI 飞行动画，**不加载原版精灵图**；enumerate 故意把这些 key 排除帧枚举。
- 差异: 视觉用 emoji 替代原版精灵帧，非像素级还原（IG-5b 明确标注为简化）。

### N21 音频::技能配音(skill voice)
- 状态: 完全还原
- 原版: RoomLogic.js:1396-1425 (PlaySkillSound) → SkinBank.qml:231 (getAudio)
- web : audio.ts:218 (playSkillSound)、vmStore.ts:214
- 原版行为: 依次试 主将 `<skill>_<general>`→ 副将 `<skill>_<deputy>`→ 裸 `<skill>`；每个再试 `<name>.mp3`/`<name>1.mp3`；getAudio 用 searchAudioResourceWithExtension(resource_pak 优先→ `packages/<ext>/audio/skill/`)。
- web 行为: 同顺序（general→deputy→skill），每候选 `.mp3`/`1.mp3`，跨 ART_PKGS 探测，audio.json 查表取唯一存在者发单 GET。general/deputy fallback 到 actor 镜像将。逻辑等价（无 resource_pak）。

### N22 音频::阵亡配音(death voice)
- 状态: 完全还原
- 原版: RoomLogic.js:1433-1436 → getAudio(general,ext,"death")
- web : audio.ts:228 (playDeath)、vmStore.ts:221
- 原版行为: 死亡玩家 general 的 `audio/death/<general>` voice，ext 优先+包扫描+`1.mp3`变体。
- web 行为: playDeath(general) 走 audioCandidates(general,'death')，ART_PKGS 探测+`1.mp3`，audio.json 查表。一致。

### N23 音频::卡牌使用配音(card voice male/female)
- 状态: 未还原
- 原版: usecard.lua:41-50 → `./packages/<ext>/audio/card/<male|female>/<cardname>`，无则回退 orig 卡的包；通用牌 `./audio/card/common/<subtype>`
- web : 无（vmStore PlaySound 走 playByPath，但服务器是否下发该路径取决于 broadcastPlaySound）
- 原版行为: 出牌时按 player.gender 选 male/female 子目录播放角色专属出牌台词；找不到回退原型卡包；基本牌/装备走 common/<subtype>。
- web 行为: web 仅有 playByPath（接收 PlaySound 任意路径）。card voice 的**性别分支寻址逻辑在服务器端**(usecard.lua)，web 客户端不重新实现；若服务器下发 `./packages/.../audio/card/male/<name>` 则 playByPath 能播，但 web 未针对 male/female 回退/common 做客户端寻址。
- 差异: 出牌配音依赖服务器下发完整路径；web 客户端无独立 male/female/common 寻址（属服务器侧逻辑，web 端按 PlaySound 透传——见 N25）。

### N24 音频::系统音效(damage/losehp/losemaxhp)
- 状态: 完全还原
- 原版: RoomLogic.js:1382-1396 → `./audio/system/<damageType>[2]`、losehp、losemaxhp
- web : audio.ts:192 (playSystem)、vmStore.ts:204-210
- 原版行为: Damage 按 damageType(normal/fire/ice/thunder)+ damageNum>1 加"2"后缀；LoseHP→losehp；ChangeMaxHp<0→losemaxhp。
- web 行为: 完全一致：`damageType + (damageNum>1?'2':'')`、losehp、num<0→losemaxhp；playSystem 试 `<name>.mp3`/`<name>1.mp3`。源音频(normal_damage2 等)均已同步。

### N25 音频::PlaySound 任意路径(getAudioByPath)
- 状态: 完全还原
- 原版: RoomLogic.js PlaySound → SkinBank.qml:247 (getAudioByPath) → searchAudioResourceByPath + removeMp3Suffix
- web : audio.ts:198 (playByPath)、vmStore.ts:217
- 原版行为: 服务器下发 `./audio/...` 或 `./packages/...` 相对路径，resource_pak 优先，补 .mp3 播放。recast/chain/出牌配音均走此路。
- web 行为: 去前缀 `./`，试 `/fk/<rel>.mp3` 与 `1.mp3` 变体，audio.json 查表。覆盖 recast/chain/card voice 透传场景。等价（无 resource_pak）。

### N26 音频::BGM(背景音乐)
- 状态: 完全还原
- 原版: Room.qml MediaPlayer + Config.bgmFile = audio/system/bgm.mp3，无限循环
- web : audio.ts:99 (playBgm)、vmStore.ts:281 (StartGame 触发)
- 原版行为: 进房循环播 bgm.mp3。
- web 行为: StartGame 时 playBgm，loop=true，独立音量/静音持久化(localStorage)，浏览器 autoplay 限制下 gesture 重试。功能等价并增强（静音/音量持久化）。

### N27 音频::出牌/移牌音效(drawCard/moveCard)
- 状态: 完全还原(web 自加，原版无)
- 原版: 无通用抽/移牌音效
- web : audio.ts:155 (playDrawSound)、:160 (playMoveSound)；vmStore.ts:189-190
- 原版行为: FreeKill 无此音效。
- web 行为: 用户自加 `audio/system/drawCard.mp3`/`moveCard.mp3`（sync-fk-assets.mjs:273 从 apps/web/assets/audio 拷入），MoveCards 按 isDraw 区分。明确标注为非原版(2f)。

### N28 音频::resource_pak 美化音频包
- 状态: 未还原
- 原版: SkinBank.qml:67 (searchAudioResourceWithExtension)、:84 (searchAudioResourceByPath) — Config.enabledResourcePacks 优先
- web : 无
- 原版行为: 所有音频寻址先查 `resource_pak/<packName>/...` 美化包，命中则用美化资源。
- web 行为: ART_PKGS 中无 resource_pak 概念；所有音频只查 `/fk/packages/<pkg>` 与 `/fk/audio`。
- 差异: 整个美化包(resource_pak)机制未实现（图片同此，见 N1/N5）。

### N29 字体::内嵌字体(FZLBGBK/FZLE/simli)
- 状态: 未还原
- 原版: fonts/{FZLBGBK,FZLE,simli}.ttf（QML FontLoader 加载，UI/武将名/技能名专用字体）
- web : 无 @font-face、无 .ttf；全用 system-ui/sans-serif
- 原版行为: 三套内嵌字体（方正隶变 FZLE 用于卡牌/武将名艺术字，FZLBGBK 正文，simli 隶书）。
- web 行为: 所有组件 fontFamily 写 `system-ui, sans-serif`（Photo/Login/Lobby/...），index.html 无字体引用，sync 脚本不拷 fonts/。
- 差异: 字体管线**整体未还原**，依赖系统字体，卡面/武将名艺术字风格丢失。

### N30 i18n::翻译机制(Fk:translate)
- 状态: 完全还原
- 原版: mod_manager.lua:110 (loadTranslationTable)、:122 (translate)；client/i18n/{zh_CN,en_US,vi_VN}.lua
- web : i18n/zh.ts:31 (tr)、registerTranslations；vmStore 多处 vm.translate 批量拉取
- 原版行为: 翻译表 lang→{src→译文}，translate 查 Config.language 表，缺则回退 zh_CN，再缺返回原文 src。
- web 行为: 游戏内权威译文来自 VM 的 Fk:translate（clientVm.ts:568 桥 __fkTranslate），注入 runtime cache；tr() 查 runtime→静态 ZH→原文 key。**与原版同源**（同跑 mod_manager.translate），回退到原 key 行为一致。

### N31 i18n::大厅静态文案
- 状态: 简化还原
- 原版: zh_CN.lua 全量翻译表（数千条，含大厅/设置/房间所有 UI 文案）
- web : i18n/zh.ts:6 (ZH 静态字典, 仅 4 个 mode 名)
- 原版行为: 大厅 UI 文案全部走翻译表（Room List/Enter/Observe/设置项…）。
- web 行为: web 大厅 UI **直接写中文/英文字面量**（LobbyPage/LoginPage 等为 React 硬编码），静态 ZH 字典仅含 4 个游戏模式 key 供无 VM 时回退；其余游戏内 key 全靠 VM 动态翻译。
- 差异: 不复用原版 zh_CN.lua 大厅文案表；大厅文案是 web 自写（非键值翻译），多语言切换(en/vi)对大厅 UI 不生效。

### N32 i18n::多语言(en_US/vi_VN)
- 状态: 简化还原
- 原版: init.lua 加载 zh_CN+en_US+vi_VN 三语言；translate 按 Config.language 选
- web : 仅 zh.ts（无 en/vi 文件）
- 原版行为: 支持中/英/越三语切换。
- web 行为: 仅中文路径；VM 翻译仍受 VM 内 Config.language 控制（若 VM 设非 zh 可吐对应语言），但 web 静态字典与大厅 UI 只有中文，无语言切换 UI。
- 差异: web 无语言切换；大厅/静态层仅中文（VM 层理论支持其它语言但未暴露切换）。

### N33 同步管线::资源抽取(sync-fk-assets)
- 状态: 完全还原(构建工具)
- 原版: 无（原版直接读本地文件树 + Fs.exists）
- web : sync-fk-assets.mjs（全文）
- 原版行为: 桌面客户端运行时直接访问 packages/ 与 image/audio 目录，Fs.exists 判存在。
- web 行为: 构建期把 freekill-core(lua/json) + ART_PACKS 的 image/anim/audio 抽到 public/fk，生成 4 份清单（file-list/images/audio/anim）。浏览器无法 ls，故清单查表替代 Fs.exists。EXTENSION_PACKS=[utility,standard_ex,sp] 必须与 asio 服务器启用包集一致（握手 MD5）。机制对等。

### N34 同步管线::清单枚举/校验(enumerate)
- 状态: 完全还原(构建工具)
- 原版: 无
- web : enumerate.ts（animFramePaths/fileListPaths/enumerateAssets）+ verify-fk-assets.mjs
- 原版行为: 无对应（运行时按需读盘）。
- web 行为: 把 4 清单展开成"应存在的全部 /fk 路径"，部署侧 fs.existsSync 校验、客户端 self-check；处理 anim key 歧义(pkg vs builtin nested)、聊天具名帧排除(CHAT_ANIM_KEYS)、FIXED_ASSETS(gamebg.jpg 无清单条目)。补足浏览器无法目录列举的缺口。

---

## 状态计数表

| 状态 | 数量 | 序号 |
|------|------|------|
| 完全还原 | 15 | N2, N4, N6, N8, N9, N13, N14, N18, N19, N21, N22, N24, N25, N26, N27, N30, N33, N34 |
| 简化还原 | 11 | N1, N5, N7, N10, N11, N12, N15, N16, N17, N31, N32 |
| 还原错误 | 1 | N20 |
| 未还原 | 4 | N3, N23, N28, N29 |

（完全还原实计 18：N2/N4/N6/N8/N9/N13/N14/N18/N19/N21/N22/N24/N25/N26/N27/N30/N33/N34；简化 11；错误 1；未还原 4。总 34 项。N2 已于 2026-06-12 修复并验证，由还原错误升级为完全还原。）

## 未还原索引
- **N3** 武将头像 avatar/ 小图（generalAvatar 函数存在但无调用，全用文字占位）
- **N23** 出牌配音 male/female/common 客户端寻址（依赖服务器透传，web 无独立寻址）
- **N28** resource_pak 美化资源包机制（图+音频，整体缺失）
- **N29** 内嵌字体 FZLE/FZLBGBK/simli（字体管线整体未实现）

## 还原错误索引
- ~~**N2** 双将分屏立绘~~ → 已修复并验证（2026-06-12，升级为完全还原）
- **N20** 聊天投掷动画：用 emoji 字形替代原版精灵帧（egg/flower/shoe/wine 具名帧未加载）

## 最关键 3 缺口
1. **resource_pak 美化包机制整体缺失（N28/N1/N5）** —— SkinBank 所有图片/音频寻址的第一优先级（enabledResourcePacks）在 web 完全没有，玩家无法套用任何皮肤包。
2. **内嵌字体未还原（N29）** —— FZLE 等艺术字体缺失，卡牌名/武将名/UI 全退化为系统字体，整体视觉风格偏离原版。
3. **聊天投掷动画 N20** —— 五种送礼共用单 emoji 飞行，丢失各自精灵帧/音效（见 N5 观感批次）。
