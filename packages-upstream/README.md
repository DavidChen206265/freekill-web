# packages-upstream/ — FreeKill 扩展包镜像(结构保留,内容 gitignore)

复刻 FreeKill 原版 `FreeKill-release/packages/` 的目录结构,把**全部包**(freekill-core + 基础包 + 27 个扩展包)放进 freekill-web 项目内,使项目自包含。

## 为什么这样组织

- **内容不入 git**:这些包共约 1.5GB,且是受版权保护的 Lua/美术/音频(不可再分发)。`.gitignore` 忽略所有包内容。
- **结构入 git**:每个包目录保留一个被 git 追踪的 `.gitkeep`,加上本 README。这样**包清单与布局在 git 里始终可见**,未来从 FreeKill 移植/扩展新包时无需重新摸索结构——照着已有的占位目录填内容即可。
- **自包含**:`apps/web/scripts/sync-fk-assets.mjs` 优先从这里(`packages-upstream/`)取包,缺失时回退到仓库外的 `FreeKill-release/packages/`(`FK_PACKAGES_DIR` 可显式覆盖)。

## 这是什么 / 不是什么

- **是**:Web 客户端构建期的"上游包源"。`sync-fk-assets.mjs` 从这里把启用包的 lua/json(VFS 挂载)+ 美术/音频(懒加载)拷进 `apps/web/public/fk/`。
- **不是**:运行时目录。浏览器不直接读这里;asio 服务端有自己独立的 `packages/`(WSL `~/freekill-asio/packages`)。**Web 启用的包集合必须与 asio 启用集合一致**。当前上游兼容模式下还需保持握手 MD5 一致;Web-only P0 落地后改由 manifest/capabilities 声明包集合与资源版本。

## 当前 Web 实际加载的包

`sync-fk-assets.mjs` 的 `EXTENSION_PACKS`(当前 = `utility, standard_ex, sp`)+ freekill-core 内置的基础包(standard / standard_cards / maneuvering / test)。其余包**已镜像在此但未启用**,启用时:
1. 把包名加入 `sync-fk-assets.mjs` 的 `EXTENSION_PACKS`(art/audio 自动随 `ART_PACKS` 同步)。
2. 在 asio 的 `packages.db` 启用同一包(`enabled=1`)并把包拷到 asio 的 `packages/`。
3. 当前上游兼容模式:用 `compute-md5.mjs` 对 asio 的 `packages/` 重算 FK_MD5,更新网关 `FK_MD5`。Web-only fork 落地后此步改为更新 manifest/capabilities,MD5 只作诊断。
4. `.dockerignore` 放行该包(部署时)。

## 从 FreeKill 移植/同步新包

```bash
# 把某个上游包同步进来(覆盖式,内容仍被 gitignore):
cp -r /path/to/FreeKill-release/packages/<pack>/. freekill-web/packages-upstream/<pack>/
touch freekill-web/packages-upstream/<pack>/.gitkeep   # 新包补占位
# 然后按"启用"步骤接入 Web + asio;当前兼容模式还需同步 MD5。
```

## 包清单(镜像于 2026-06-10,大小供参考)

| 包 | 大小 | 备注 |
| --- | --- | --- |
| freekill-core | 7.4M | 核心 + 内置基础包(standard/standard_cards/maneuvering/test) |
| standard | 6.0M | 标准(亦内置于 core) |
| standard_cards | 12M | 标准卡牌(亦内置于 core) |
| maneuvering | 7.7M | 军争(亦内置于 core) |
| standard_ex | 19M | 界限突破(**Web 已启用**) |
| sp | 22M | SP 武将(**Web 已启用**) |
| utility | 730K | 扩展共享技能/qml(**Web 已启用**,多数扩展包依赖) |
| test | 462K | 测试包 |
| tenyear | 308M | 十周年 |
| ol | 256M | OL |
| mobile | 168M | 手杀 |
| mjs | 133M | 梦江湖 |
| hegemony | 110M | 国战 |
| overseas | 105M | 海外 |
| offline_new | 100M | 线下新 |
| yj | 46M | 阴间(界面?) |
| mougong | 39M | 谋攻 |
| shzl | 35M | 谁是真凶/十周年? |
| mini | 32M | mini 包 |
| jsrg | 26M | — |
| gamemode | 13M | 游戏模式 |
| 1v1_test | 13M | 1v1 测试 |
| joym | 12M | (旧 new-core 不兼容,需 legacy compat) |
| lunar | 11M | 阴阳/lunar |
| brainhole_new | 9.0M | 脑洞新 |
| lunarltk-qsgs-ui | 7.3M | 国战 UI |
| uno | 6.0M | UNO |
| qsgs | 4.4M | 千伞杀 |
| poker-games | 2.2M | 扑克(独立游戏模式,Web 范围外) |
| wdls | 2.2M | — |
| chess-games | 1.5M | 棋类(独立游戏模式,Web 范围外) |
| sxrm | 1.3M | — |

> 注:部分包是"独立游戏模式"(chess-games/poker-games,自带 RoomScene),属 Web 还原范围外;部分包(joym 等)用 new-core 已删除的 legacy API,需 compat 层才能加载。详见 `analysis/WEB_ONLY_ROADMAP.md` 与 `audit/phase6-lua-package-code-audit.md`。
