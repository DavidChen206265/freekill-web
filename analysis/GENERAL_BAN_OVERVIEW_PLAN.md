# 禁将系统 + 大厅武将一览短期计划

> 建立日期: 2026-06-13  
> 目标: 先做出可用的禁将系统和大厅武将一览页,优先 1:1 还原 FreeKill 源码中的数据结构与交互语义。  
> 当前执行入口: `WEB_ONLY_ROADMAP.md` 的 N2 总览/详情页族 + B 建房禁将子系统。

## 范围

- 大厅阶段可用的武将元数据读取:包/扩展/武将列表/搜索/武将详情/翻译/立绘 face 注册。
- `Config.disableSchemes` 等价的 Web 持久化状态:多套方案、当前方案、禁包白名单、单将黑名单、禁卡包数组。
- 大厅入口的 `GeneralsOverview`:大包/小包列表、搜索、禁将/禁包编辑、还原选择、武将计数、点击详情。
- 大厅/建房入口的 `BanGeneralSetting`:方案切换、新建、清空、导入、导出、重命名、三列摘要。
- `CreateRoomDialog` 接入当前禁将方案,按原版 `CreateRoom.qml` 推导 `disabledGenerals` / `disabledPack`。

## 非范围

- GeneralDetailPage 四标签完整补完(J6-J17)不阻塞本期主体;本期只保证武将一览可打开现有技能详情或后续详情容器。
- 卡牌一览、战绩、统计、武将池一览、GeneralFilter 全量筛选作为后续页面族推进。
- 服务端新增协议暂不做;本期优先复用现有 `CreateRoom` settings 字段。
- 线上部署/push 仍需用户明确批准。

## 原版源码锚点

- `FreeKill-sourcecode/Fk/Pages/LunarLTK/GeneralsOverview.qml`
  - 左侧 260px 大包/小包列表;`stat = 0/1/2` 分别为普通/禁包/禁将。
  - 搜索走 `Ltk.searchAllGenerals` / `Ltk.searchGenerals`;网格 `cellWidth=100`、`cellHeight=140`。
  - 禁包点击切换 `curScheme.banPkg[pack] = []`;禁将点击在 `banPkg` 白名单或 `normalPkg` 黑名单中切换。
  - 禁用遮罩与 `Enable` / `Prohibit` 文案由 `banPkg`/`normalPkg` 共同决定。
- `FreeKill-sourcecode/Fk/Pages/Lobby/BanGeneralSetting.qml`
  - `disableSchemes[currentDisableIdx] = curScheme`;切换方案后替换 `curScheme`。
  - New/Clear/Export/Import/Rename;三列展示 `Ban_Generals`、`Ban_Packages`、`Whitelist_Generals`。
- `FreeKill-sourcecode/Fk/Pages/Lobby/CreateRoom.qml`
  - `banPkg[pack]` 非空时禁用该包中不在白名单里的武将。
  - `normalPkg[pack]` 直接加入黑名单武将。
  - `disabledPack = banCardPkg + banPkg 中白名单为空的包 + serverHiddenPacks`。
  - 仅 `boardgameName === "lunarltk"` 时下发 `disabledPack` / `disabledGenerals`。
- `FreeKill-sourcecode/Fk/Base/Config.qml`
  - 默认 `disableSchemes = [{ name:"", banPkg:{}, normalPkg:{}, banCardPkg:[] }]`。
  - `saveConf()` 前把 `curScheme` 写回 `disableSchemes[currentDisableIdx]`。
- `FreeKill-sourcecode/lua/client/client_util.lua`
  - `GetAllMods`、`GetAllModNames`、`GetAllGeneralPack`、`GetGenerals`、`SearchAllGenerals`、`SearchGenerals`、`GetGeneralData`、`GetGeneralDetail`。

## Audit 对应条目

- `audit/J-overview-detail.md`:J1-J5 为本期武将一览核心;J6-J17 作为后续详情页补完。
- `audit/B-lobby.md`:B30 禁将方案管理为本期核心;B29 卡包设置和 B28 动态设置暂不作为禁将主体阻塞项。
- `audit/K-widgets-base.md`:K19 Config 的 `disableSchemes` 持久化语义。
- `audit/SUMMARY.md`:修复/验证后同步计数和条目状态。

## 数据结构

```ts
interface DisableScheme {
  name: string
  banPkg: Record<string, string[]>    // 包名 -> 白名单武将数组
  normalPkg: Record<string, string[]> // 包名 -> 黑名单武将数组
  banCardPkg: string[]                // 禁用卡包数组
}
```

转换规则必须照搬 `CreateRoom.qml`:

1. `banPkg[pack].length > 0`:读取该包全部武将,把“不在白名单内”的武将加入 `disabledGenerals`。
2. `normalPkg[pack]`:把数组内容直接加入 `disabledGenerals`。
3. `disabledPack`:从 `banCardPkg` 开始,追加 `banPkg[pack].length === 0` 的包,再追加 `serverHiddenPacks` 去重。

## 分切片计划

### A. 大厅 Catalog VM / 数据桥

- 新增大厅可用的只读 catalog VM,不复用进房后的 `vmStore` 生命周期。
- 桥接:mods、modNames、generalPacks、getGenerals、searchGenerals、searchAllGenerals、generalData、generalDetail、translate。
- 验证:真 freekill-core VM 探针/单测确认包列表、搜索、详情、翻译、face 信息可读。

### B. `disableSchemes` store

- 新增 localStorage 持久化 store,默认结构照搬 `Config.qml`。
- reducer 覆盖 new/clear/import/export/rename/toggleBanPkg/toggleBanGeneral/revertSelection。
- 单测锁住 CreateRoom 转换规则,尤其 `banPkg` 白名单与空白名单禁包语义。

### C. 大厅入口 + `GeneralsOverview`

- 在大厅增加页面入口,先实现可返回的页面/overlay,不阻塞房间流程。
- 左侧大包/小包列表、搜索、GridView、footer 计数、`stat` 状态机。
- 渲染前注册翻译和 face 信息,避免拼音名或空立绘。

### D. `BanGeneralSetting`

- 实现方案切换、新建、清空、导出、导入、重命名。
- 三列摘要按原版分别展示禁将、禁包、白名单武将。
- 导入只接受合法 `DisableScheme` 形状,失败时不污染当前方案。

### E. `CreateRoomDialog` 接入禁将方案

- 建房时写回当前方案并推导 `disabledGenerals` / `disabledPack`。
- 对 `lunarltk` 下发禁用字段;其它模式保持空数组。
- 验证:本地 WSL `freekill-web-asio` + gateway + 浏览器手测创建房间,确认 settings 生效。

### F. GeneralDetailPage 后续补全

- 补 J6-J17 的信息栏、headnote/endnote、同名武将、语音、战绩、收藏/头像、四标签。
- 不作为本期“可用禁将系统”的阻塞项。

## 风险登记

| 风险 | 等级 | 说明 | 缓解 |
| --- | --- | --- | --- |
| 大厅阶段没有现成 VM | 高 | 当前 VM 只在进房后 boot;武将一览需要大厅元数据 | 切片 A 独立 catalog VM,只读、可关闭、单独测试 |
| 方案结构误简化 | 高 | 简单数组会丢失“禁包白名单”和“普通包黑名单”语义 | store 类型和单测直接锁 `banPkg`/`normalPkg`/`banCardPkg` |
| 建房 payload 语义错误 | 高 | `disabledPack`/`disabledGenerals` 错会影响对局选将池 | 转换函数逐行对齐 `CreateRoom.qml`,用单测覆盖 |
| 翻译/立绘未注册 | 中 | 按需读取武将会显示拼音名或无立绘 | Catalog 结果进入 UI 前统一注册 translations + face |
| 双 VM 内存成本 | 中 | 大厅 catalog VM 与房间 VM 同时存在会增加 WASM 内存 | 大厅进入房间前关闭 catalog VM;后续按实测考虑复用/预热 |
| audit 计数误改 | 中 | 本期跨 B/J/K 多 phase | 每个条目修复后只更新对应块与 SUMMARY,未验证不改为完全 |

## 验证矩阵

- 切片 A: `pnpm --filter @freekill-web/web test -- catalogVm` 或等价真 VM 探针;`pnpm --filter @freekill-web/web typecheck`。
- 切片 B: reducer/转换纯单测;`pnpm --filter @freekill-web/web test -- disableSchemes`。
- 切片 C/D: React 组件行为测试 + `typecheck` + `build`;必要时 Playwright/浏览器截图检查布局。
- 切片 E: 单测 + 本地 WSL web-asio E2E/手测。
- 收尾:运行 `node .codex/scripts/sync.mjs "<摘要>"`,更新 `PROGRESS.md`、`WEB_ONLY_ROADMAP.md`、对应 audit 和 `SUMMARY.md`,完成自验后本地 commit。

## 当前执行顺序

1. 已完成:建立本计划并更新近期路线。
2. 已完成并验证:切片 A catalog VM / 数据桥。
3. 已完成并验证:切片 B `disableSchemes` store + 转换单测。
4. 已完成并验证:切片 C 大厅入口 + `GeneralsOverview`。
5. 已完成并验证:切片 D `BanGeneralSetting`。
6. 已完成并验证:切片 E `CreateRoomDialog` 禁将方案接入。
7. 下一步:按 audit 优先级回补 GeneralDetailPage J6-J17、GeneralFilter、卡牌一览/武将池/战绩统计等后续页面族。

## 进展记录

- 2026-06-13:切片 A 完成。新增 `apps/web/src/vm/catalogBridge.ts`、`apps/web/src/vm/catalogVm.ts` 和 `apps/web/test/catalogVm.test.ts`,用真实 freekill-core VM 验证包列表、搜索、翻译、武将详情和 face 元数据可读。验证通过:`pnpm --filter @freekill-web/web test -- catalogVm`、`pnpm --filter @freekill-web/web typecheck`、`pnpm --filter @freekill-web/web build`、`pnpm --filter @freekill-web/web test`。
- 2026-06-13:切片 B-E 完成。新增 `disableSchemesStore`、`BanGeneralSetting`、`GeneralsOverviewPage` 与 `disableSchemes.test`,大厅新增「武将一览」入口,CreateRoomDialog 按原版 `CreateRoom.qml` 语义推导 `disabledGenerals`/`disabledPack`,并接入 serverHiddenPacks。验证通过:`pnpm --filter @freekill-web/web test -- disableSchemes catalogVm serverManifestStore`、`pnpm --filter @freekill-web/web test`(37 文件/194 测试)、`pnpm --filter @freekill-web/web typecheck`、`pnpm --filter @freekill-web/web build`、WSL `freekill-web-asio` 构建、gateway WS 探测、真实 asio/gateway E2E 登录→大厅→CreateRoom→EnterRoom。
