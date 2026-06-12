# Phase O — 游戏内容包客户端呈现审计

范围：`standard` / `standard_cards` / `maneuvering` 三个基础内容包的**客户端可见呈现**（武将立绘/血量/势力显示、技能在 UI 上的 mark/动画/banner/配音触发、卡牌花色点数/虚拟名/判定区显示）。武将技能效果逻辑（跑在 asio fork 服务端 + wasmoon 客户端 lua）不在本 Phase 范围。

## 关键架构事实（决定本 Phase 大部分结论）

1. **web 客户端实际加载的是 `packages-upstream/freekill-core/{standard,standard_cards,maneuvering}`**，不是同级的独立 `packages-upstream/standard` 等目录。证据链：
   - `apps/web/scripts/sync-fk-assets.mjs:33` `MOUNT_DIRS = ['lua','standard','standard_cards','maneuvering','test']`，源 `CORE = path.join(PACKAGES,'freekill-core')`（`sync-fk-assets.mjs:25`），目标 `public/fk/packages/freekill-core`。
   - wasmoon VFS 挂载点 `/fk/packages/freekill-core`（`packages/lua-native/src/mount.ts:9`、`boot.ts:16`）。
   - 独立的 `packages-upstream/standard` 目录与原版 `FreeKill-sourcecode/packages/standard` **逐字节相同**（`diff -rq` 仅 `.gitkeep` 差异），但**不被客户端挂载**——它只是镜像留存。
2. **`freekill-core` 是比 sourcecode(0.5.20/37f8c12) 略新的上游核心**。三包 lua 与 sourcecode 的差异全部为**服务端逻辑/AI 重构**（`extra_data` 初始化、`tableRandomPick`、`loadSkillSkelsByPath`、AI 缩进），无一影响客户端呈现。i18n 差异为译名精修（见 O7）。
3. 三包资源（image/audio/anim）经 `sync-fk-assets.mjs` 从 `ART_PACKS=['standard','standard_cards','maneuvering',...]`（`:46`）抽取到 `public/fk/packages/<pkg>/`，并生成 `images.json`/`audio.json`/`anim.json` 清单供浏览器解析候选（避免 404 探测风暴）。
4. 注意：当前 checkout 的 `apps/web/public/fk/` **尚未生成**（仅有 favicon 等静态文件）。这是构建产物缺失（需 `pnpm sync-assets`），非代码缺口——抽取脚本与客户端解析代码均完整。

---

### O1 内容包定义::三包 lua 一致性
- 状态: 完全还原
- 原版: `packages/standard/`、`packages/standard_cards/`、`packages/maneuvering/`（全树）
- web : `packages-upstream/freekill-core/{standard,standard_cards,maneuvering}/`（客户端实挂） + `packages-upstream/standard` 等（镜像，逐字节相同）
- 原版行为: standard 含 26 武将（caocao/simayi/guanyu/zhangfei/zhugeliang/diaochan 等，`pkg/init.lua:8-37`）+ anjiang 暗将；standard_cards/maneuvering 含全部基础牌定义
- web 行为: freekill-core 挂载的三包含完整武将/技能/卡牌定义；与 sourcecode 仅有服务端逻辑/AI 差异（见 O2-O7），客户端呈现相关定义完全一致
- 差异: —

### O2 武将立绘::generals 头像（抽样 guanyu/zhangfei/diaochan/zhugeliang/caocao）
- 状态: 完全还原
- 原版: `packages/standard/image/generals/{guanyu,zhangfei,diaochan,zhugeliang,caocao}.jpg`（共 26 张）
- web : `sync-fk-assets.mjs:170-172` 抽取 `packages/<pkg>/image/generals` → `public/fk/packages/<pkg>/image/generals`，record=true 写入 `images.json`；客户端 `skin.ts` `generalPicCandidates` 解析，`Photo.tsx:88-96` `<Portrait>` 渲染（单将/双将分屏）
- 原版行为: 武将头像按势力背景裁剪显示
- web 行为: `Photo.tsx` kingdom 背景(`:85`) → 立绘裁剪(`:88`) → 死亡置灰(`:88` grayscale) → fallback 势力色块+名（`:99`）
- 差异: —

### O3 武将面板::血量(magatama)/势力/身份显示
- 状态: 完全还原
- 原版: Photo.qml MarkArea/血珠/势力框
- web : `Photo.tsx:107` `<HpBar hp maxHp shield>`（HP 血珠 + 护甲 shield）、`:85` 势力背景框 `photoBack(kingdom)`、`:186-188` 势力图标 `kingdomIcon`、`:107` 注释“role pic top-right”身份牌 `rolePic`、`chainPic` 横锁链
- 原版行为: 血珠按 hp/maxHp、势力色背景、身份牌、横置铁索
- web 行为: 全部映射（hp/maxHp/shield/kingdom/role/chain/death 置灰）
- 差异: —

### O4 技能呈现::InvokeSkill 技能发动 banner + skill_type 配色
- 状态: 完全还原
- 原版: RoomLogic.js callbacks 通过 `doBroadcastNotify("AddSkill",...)`（`standard/pkg/init.lua` 主公技显示）+ 服务端 InvokeSkill 通知触发技能 banner
- web : `vmStore.ts:152-163` `case 'InvokeSkill'`：`anim.pushPlayer(player,{kind:'invokeSkill',skillName:tr(name),skillType})`；`animationStore.ts:27` banner 配色由 skill_type 驱动；`pacing.ts:21,39` `INVOKE_SKILL_MS`(1640ms) 节拍
- 原版行为: 技能发动时武将旁弹出技能名 banner，按技能类型（special 等）着色，约 1640ms
- web 行为: 同上，逐项映射（skillName 本地化 + skillType 配色 + 1640ms 节拍）
- 差异: —

### O5 技能配音::PlaySkillSound（武将技能语音，抽样 standard 122 条 skill 音频）
- 状态: 完全还原
- 原版: serverplayer.lua:465 发 PlaySkillSound；RoomLogic.js:1396-1425 按 主将→副将→裸技能名 尝试 `<skill>_<general>.mp3` → `<skill>.mp3`/`<skill>1.mp3`
- web : `audio.ts:218-225` `playSkillSound(skill,general,deputy)` 同序候选；`vmStore.ts:160` InvokeSkill 时 `warmSkillSound` 预热；`audio.ts:258` `warmSkillSound`。资源经 `sync-fk-assets.mjs:294` 抽取三包 `audio/skill` + `audio/death`，写 `audio.json`（`:303`）单次 GET 解析候选
- 原版行为: 技能发动播对应语音（如 biyue1/biyue2、fanjian1/2），主副将差异化
- web 行为: 同序候选解析 + 预热缓存（解决“语音跟不上”）；death 语音 `audio.ts:227-230` `playDeath`（standard 25 条 death 音频）
- 差异: —

### O6 卡牌显示::花色/点数/牌名/虚拟名/卡面 mark（CardFaceView）
- 状态: 完全还原
- 原版: CardItem.qml/PokerCard.qml 卡面 art + 左上花色/点数 overlay + virt_rect 虚拟名框 + mark
- web : `CardFaceView.tsx:30` `cardPicCandidates`、`:47-48` `suitPic`/`numberPic` overlay、`:69-71` 文字 fallback（花色符号+点数）、`:73` 牌名、`:81 VirtNameBox` 虚拟名（CardItem.qml virt_rect y:40 雪色框）、`:97 CardMarks` 卡面 mark（`@mark` 计数）
- 原版行为: 卡面显示真实 art + 花色点数 overlay；虚拟使用的牌显示虚拟名；卡面 mark 计数
- web 行为: 逐项映射（art 候选 → overlay → 文字 fallback → 虚拟名框 → 卡面 mark）。red/black 着色 `isRedSuit`
- 差异: —

### O7 卡牌文案::卡牌描述 i18n（standard_cards/maneuvering）
- 状态: 完全还原
- 原版: `packages/standard_cards/i18n/zh_CN.lua`（含 `qinggang_sword`:154、`:qinggang_sword` 描述:155 等）
- web : freekill-core 挂载的 i18n 经 `vm.translate` 加载；`vmStore.ts:154` 缺译时按需 `registerTranslations`
- 原版行为: 卡牌名/描述本地化显示（如青釭剑“锁定技，你的【杀】无视目标角色的防具”）
- web 行为: 完整加载。freekill-core 较 sourcecode **多 2 个键** `collateral_skill="借刀杀人"`、`ex_nihilo_skill="无中生有"`（原版无独立键，不影响呈现），并将 `amazing_grace_skill` 从“五谷选牌”精修为“五谷丰登”——均为上游译名修订，呈现更完整
- 差异: —（属上游较新；非缺失）

### O8 判定区显示::延时锦囊图标（supply_shortage / lightning / indulgence）
- 状态: 完全还原
- 原版: DelayedTrickArea.qml 判定区小图标行 + sealed 封印标记
- web : `JudgeArea.tsx:8` `delayedTrickPic(name,ext)`、`:30` `delayedTrickSealedPic` 封印标记、`:33` 按牌名取图标
- 原版行为: 延时锦囊（兵粮寸断/乐不思蜀/闪电）以小图标置于武将判定区，封印态显示封标
- web 行为: 逐项映射（图标 + sealed “封”标记）
- 差异: —

### O9 装备技能动画::equip-skill anim sprite（kylin_bow/crossbow/eight_diagram/axe/spear 等）
- 状态: 完全还原
- 原版: `packages/standard_cards/image/anim/{kylin_bow,nioh_shield,blade,double_swords,crossbow,axe,spear,eight_diagram}/`（编号帧 PNG），PixmapAnimation 播放
- web : `sync-fk-assets.mjs:227-230` `copyAnimDir` 按包抽取 anim → `public/fk/packages/<pkg>/image/anim`，键 `<pkg>/<emotion>`，生成 `anim.json` 帧数清单；`PhotoEffects.tsx:88 EmotionSprite` 预加载全帧后按 wall-clock(`:117`)驱动，`CardLayer.tsx:215` 在桌面卡上播 `setCardEmotion`
- 原版行为: 装备技能触发时播放对应序列帧动画（50ms/帧，PixmapAnimation.qml）
- web 行为: 同（FRAME_MS=50，`PhotoEffects.tsx:86`；预加载全帧解决 CDN 逐帧 round-trip 卡顿）；帧数取 `anim.json[key]`，未知/0 → 不播（不臆造）
- 差异: —

### O10 玩家 mark 呈现::SetPlayerMark 文字/图片/QmlMark 分类
- 状态: 完全还原
- 原版: RoomLogic.js:1291 SetPlayerMark 按前缀分类：`@!`/`@!!` → 图片 mark；`@[type]` → QmlMark(GetQmlMark.text)；`@@` → 隐值文字 mark；其他 `@` → “name value” 文字 mark；`@$`/`@&` → 牌堆计数
- web : `clientVm.ts:124-190` 完整复刻该前缀分类逻辑（textMarks/picMarks/QmlMark via `GetQmlMark` pcall）；`Photo.tsx:143-155` 渲染（MarkArea 文字 / PicMarkArea 图片+计数）；`skin.ts:241 markPicCandidates`（SkinBank.getMarkPic 等价，onError fallback）
- 原版行为: 武将旁显示各类 mark（文字带值/图标带计数/QML 文本）
- web 行为: 逐前缀映射，与 RoomLogic.js 完全对齐
- 差异: —
- 备注: 本三包内**无任何 `@` 前缀显示 mark**（`grep '"@'` 三包 pkg/ 无命中）。rende 用 `_rende_cards-phase`（下划线隐藏 mark）、jijiang 用 `jijiang_failed-phase`（隐藏）、qinggang_sword 用 `MarkEnum.MarkArmorNullified="mark__armor_nullified"`（`lua/lunarltk/server/mark_enum.lua:41`，无 `@` 前缀 → 内部不显示 mark，原版同样不显示）。故三包对 mark 呈现无任何可见需求，O10 机制完整但本范围内不被触发。

### O11 限定技/觉醒/转换/使命技标记::Skill.Limited/Wake/Switch/Quest
- 状态: 完全还原（本范围内 N/A）
- 原版: `grep -rn "Limited|Wake|Quest|Switch" packages/standard* packages/maneuvering`：三包**无任何**限定/觉醒/转换/使命技；仅有 `Skill.Compulsory`（锁定技：kongcheng/qicai/paoxiao/mashu/wushuang/qianxun/jiuyuan 及多张装备技）与 `Skill.Lord`（jiuyuan 主公技）
- web : 锁定技/主公技无独立 UI mark 需求（Compulsory 不发 InvokeSkill banner / 不需 LimitSkill mark）；主公技显示经 `standard/pkg/init.lua` role_logic `doBroadcastNotify("AddSkill")`，客户端 `notifyCommands.ts` AddSkill 处理
- 原版行为: 三包无限定技标记呈现需求
- web 行为: 同；锁定技/主公技呈现需求被覆盖
- 差异: —
- 备注: 已知的 `UpdateLimitSkill`（限定技次数 mark）缺口涉及的是 sp/tenyear 等扩展包的限定技，**不涉及本三包**——本 Phase 范围内无任何限定技，故该缺口在 Phase O 内不产生影响。Phase O 仅确认三包无此类需求。

---

## 状态计数

| 状态 | 数量 | 序号 |
|------|------|------|
| 完全还原 | 11 | O1–O11 |
| 简化还原 | 0 | — |
| 还原错误 | 0 | — |
| 未还原 | 0 | — |

未还原索引：无
还原错误索引：无

## 结论与系统性观察

1. **三包 lua 定义在 web 端完整存在且被 wasmoon 实挂**（经 freekill-core，非同级镜像目录）。与 sourcecode 0.5.20 的全部差异均为服务端逻辑/AI 重构，零客户端呈现差异。
2. **客户端呈现层（立绘/血量/势力/身份、技能 banner+配音、卡牌花色点数虚拟名、判定区、装备动画、玩家 mark 多态分类）对三包的需求全部还原**，且 mark 前缀分类（`clientVm.ts:124-190`）、anim 帧预加载（`PhotoEffects.tsx`）、audio 候选清单（`audio.json`）等均逐项对齐 RoomLogic.js。
3. **关键非缺口澄清**：本三包内**无任何 `@` 显示 mark、无任何限定/觉醒/转换/使命技**——故 `UpdateLimitSkill` 等已知扩展包缺口在 Phase O 范围内不被触发；O10/O11 机制虽完整但本范围无可见呈现需求。
4. **唯一运行时注意项（非代码缺口）**：当前 checkout 的 `apps/web/public/fk/` 资源产物未生成，部署前须执行 `pnpm sync-assets`，否则三包的立绘/音频/动画在浏览器侧 404。抽取脚本与客户端解析代码本身完整无误。
