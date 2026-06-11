# W0-2 实现计划 · 服务端下发 Web manifest/capabilities + 统一资源包集合

> 2026-06-11。严格按工作流先读后写,已逐层读源码核实(server fork / gateway / web)。
> **✅ 已完成(2026-06-11)**:S1 服务端(fork 提交 `fc03c24`)+ S2/S3/S4 web。真 asio 三者一致验证通过(asio 扫描 == file-list.json extra == assetVersion 8efa2cc),m1-e2e 回归过,web 129 测试(+9)。web 改动未提交主仓(待用户确认)。下一步 W0-3。

## 已核实的地基事实

- **SetServerSettings** = `user_manager.cpp:189-218`,positional CBOR 数组 `{motd, hiddenPacks, enabledFeatures}`,只在 `all_info`(登录)时发。追加第 4 元素安全。
- **enabledFeatures 现状**:web 端**完全没读**(P4-004 属实);AddRobot 仅靠 `waitingState.ts:40` 的 `isOwner && !isFull`。
- **包真实状态来源**:`writePkgsMD5`(`util.cpp:119-146`)扫 `packages/` 目录,排除 `.disabled`/`getDisabledPacks()`/builtins。builtins(standard/standard_cards/maneuvering/test)在 `packages/freekill-core/` **内部**;扩展(utility/sp/standard_ex)是 `packages/` **顶层目录**。
- **版本**:`FK_VERSION` 是 CMake 编译宏(0.1.14),可作 `serverBuild`。
- **web 解码**:`convert.ts:decodeInnerData` 已能把嵌套 CBOR 对象解成 JS 对象,数组第 4 元素会原样到 `env.data[3]`。无需新解码器。
- **VM 挂载**:`file-list.json`(sync 期生成,含 `extra[]`)→ `mount.ts` 挂载,**构建期静态**,运行时不可变。
- **三处 ART_PACKS**(P7-006/P7-032 不一致):
  - `skin.ts:13` `ART_PKGS=['standard','standard_cards','maneuvering']`(用于 cardPic/equipIcon/mark 候选)
  - `audio.ts:16` 同上(用于 audioCandidates)
  - `sync-fk-assets.mjs:43` `ART_PACKS=[...3 builtins, ...EXTENSION_PACKS]`(6 个,build 期同步美术)
  - 后果:sync 把 6 包美术拷到磁盘,但浏览器只在 3 个 builtin 里找 → 扩展包美术静默回退。

## 关键架构判断:build 期 vs 运行期,不能强求单一值

三处 ART_PACKS 处于**不同时刻**:
- `sync-fk-assets.mjs` 在 build/deploy 期跑,**读不到**运行时服务器 manifest。
- `skin.ts`/`audio.ts` 在浏览器 render 期跑,登录后 manifest **已到**。

所以"单一真相源"的正确落法:**服务器 manifest 的 `enabledPacks` 是运行期权威**,render 期的 skin/audio 用它;build 期的 sync 脚本独立地把"它能找到的所有包"的美术都同步下来(本就该如此),并把同步了哪些包写进 `images.json`/`audio.json`(已有),render 期靠这两个 manifest 精确剪枝 + 靠服务器 enabledPacks 扩大候选集。两者在"已同步集合 ⊇ 服务器启用集合"的前提下一致。

## 实现切片

### S1 · 服务端 fork:enabledPacks 枚举 + manifest 下发

1. 新增 `std::vector<std::string> Server::getEnabledPacks() const`(或就近放 util):复用 `writePkgsMD5` 的目录扫描逻辑,但**包含 builtins**——
   - 固定 builtins:`standard, standard_cards, maneuvering`(test 不下发给 UI)。
   - 扫 `packages/` 顶层:`is_directory` 且非 `.disabled` 且不在 `getDisabledPacks()` 且非 builtins 且含 `init.lua` → 收入。
   - 抽出共享的扫描帮助函数,避免与 `writePkgsMD5` 逻辑漂移。
2. `user_manager.cpp:setupPlayer` 在 `all_info` 分支:把数组改为 4 元素,末尾追加 manifest 对象:
   ```
   { "webOnly": conf.webOnly, "serverBuild": FK_VERSION,
     "assetVersion": server.getMd5(),  // 复用 flist md5 作资源版本
     "enabledPacks": [...], "webFeatures": enabledFeatures }
   ```
   - `assetVersion` 直接用 `Server::getMd5()`(flist md5,包变即变,天然资源版本)。
   - `webFeatures` 复用已算出的 `enabledFeatures`(AddRobot/ChangeRoom)。
3. 验证:WSL 重新构建 fork;Node 探针读 SetServerSettings 第 4 元素,断言 enabledPacks 含 utility/standard_ex/sp + 3 builtins,assetVersion == 服务器 md5。

### S2 · web:消费 manifest → store

1. 新建 `serverManifestStore`(或并入现有 lobby/connection store):存 `{ webOnly, serverBuild, assetVersion, enabledPacks, webFeatures }`。
2. `stores/index.ts:routeEnvelope` 加 `case 'SetServerSettings'`:positional 取 `data[3]` manifest,落 store;同时 `data[2]` enabledFeatures 也落(供 AddRobot)。防御:data 不足 4 元素时 manifest 取空、不崩(兼容未升级服务端)。

### S3 · web:manifest 驱动 ART_PKGS(修 P7-032)

1. `skin.ts`/`audio.ts`:`ART_PKGS` 从 `const` 改为模块级可变 + `setArtPacks(packs: string[])` setter(镜像 `loadImageManifest` 的模块状态模式)。默认值保留 3 builtins(manifest 未到时的安全兜底)。
2. S2 的 store 落 manifest 后调用 `setArtPacks(enabledPacks)`,使 cardPic/equipIcon/mark/audio 候选覆盖扩展包。
3. `images.json`/`audio.json` 剪枝不变(已同步集合),只是候选集扩大到 enabledPacks。

### S4 · web:AddRobot 按 webFeatures 显隐(顺带修 P4-004)

1. `waitingState.ts:deriveWaitingState`:入参加 `serverFeatures: string[]`,`showAddRobot = isOwner && !isFull && serverFeatures.includes('AddRobot')`。
2. `WaitingRoom.tsx` 从 store 取 webFeatures 传入。
3. 兼容:manifest 未到(空数组)时如何处置——保持现行为(显示),避免老服务端下 AddRobot 消失;仅当 manifest 明确给了 webFeatures 才据其隐藏。

### S5 · 自验 + 文档

1. `pnpm -r typecheck/build/test` 全绿;web 单测加 SetServerSettings 路由 + setArtPacks + waitingState(含 feature gate)用例。
2. 真 asio 端到端:起 fork(已启用 utility/standard_ex/sp)+ 网关 + 探针,断言浏览器侧 store 收到 enabledPacks 且三者一致(VM file-list extra == manifest enabledPacks 的扩展部分 == asio 扫描集)。
3. 提交 fork(S1)推送;web 改动留待主仓提交(按你确认)。
4. 更新 PROGRESS/WEB_ONLY_ROADMAP(W0-2 勾掉)/memory,跑 sync。

## 不做(留后续切片)

- 不让 `sync-fk-assets.mjs` 读运行时 manifest(build 期拿不到;它继续同步它能找到的全部包,这是正确的)。
- 不改 VM file-list 挂载机制(W0-2 只动美术/音频候选解析 + 功能显隐,不动 VM 代码挂载;若启用包与同步包不一致是部署问题,由 assetVersion 暴露,W0-4/R-ASSET-MISMATCH 处置)。
- W0-3(房间过期/封禁 gating)是独立切片。

## 风险

- **R-ASSET-MISMATCH**:本切片把"运行期候选集"对齐到服务器真实启用包,消解 P7-032;但"已同步美术集"仍由 build 期 sync 决定。若服务器启用了一个 sync 没同步美术的包,候选会指向 404 → onError 回退文字面(不崩,降级观感)。assetVersion 不一致可作为告警钩子(留 W0-4)。
- 老服务端(无第 4 元素):S2/S4 的防御确保不崩、行为回退到现状。
