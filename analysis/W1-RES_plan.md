# 资源完整性增强(W1-RES,2026-06-11 用户三选全要)

> 背景:近期一串 bug(gamebg 404 / guding_blade 500 / 语音缺)全是**部署侧资源没上镜像**,客户端静默失败、难自查。用户要三层防护:①部署侧校验 ②客户端自检 ③可选全量预缓存。

## 共享地基:manifest → 完整 URL/路径 枚举器

四个 manifest(sync-fk-assets 生成,部署后在 `/srv/fk`):
- `audio.json`:路径数组,如 `audio/system/bgm.mp3`、`packages/standard_cards/audio/card/male/indulgence.mp3`
- `images.json`:路径数组(per-package 卡面)
- `anim.json`:`{key: frameCount}`,key=`<emotion>` 或 `<pkg>/<emotion>`;帧文件 = builtin `image/anim/<key>/<i>.png`,pkg `packages/<pkg>/image/anim/<emotion>/<i>.png`(i=0..n-1)
- `file-list.json`:`{base, files[], extra:[{base,files[]}]}`,VM 挂载树;文件在 `packages/<base>/<file>`
- **额外固定资源**(不在任何 manifest 但代码引用):`image/gamebg.jpg`、内置 chrome(`image/photo/**`)等——枚举器要含一份"已知固定资源"清单(从代码常量来,如 audio.ts 的 bgm 路径、Stage 的 gamebg)。

写一个**同构纯函数** `enumerateAssets(manifests) -> string[]`(相对 `/fk` 的完整路径列表),Node(部署校验)和浏览器(自检)共用。放 `packages/assets`(已是资源相关包)或 `packages/shared`。

## ① 部署侧校验(根治,最高优先)

- 新建 `packages/assets/scripts/verify-fk-assets.mjs`:入参 `<fkRoot>`(默认 `apps/web/public/fk` 或传 `/srv/fk`)。读四个 manifest + 固定清单 → `enumerateAssets` → 对每条 `fs.existsSync` + 非空 size 检查 → 列出缺失/空文件 → 有缺失则 `exit 1`。
- 接入:
  - 本地 sync 后可手动跑;
  - **部署关键**:`caddy.Dockerfile` 在 `sync-assets && build` 之后加一步 `node packages/assets/scripts/verify-fk-assets.mjs apps/web/public/fk`——**构建期就 fail**,缺资源镜像根本构建不出来(gamebg 这类当场暴露)。
  - 可选:VPS 部署后对 `/srv/fk` 再跑一次(容器内或 caddy exec)。
- 验收:故意删一个 manifest 列出的文件 → 脚本 exit 1 + 打印缺失;全在 → exit 0。

## ② 客户端轻量自检(诊断,把静默失败变可见)

- `apps/web/src/diag/assetCheck.ts`:`checkAssets(opts) -> {checked, missing[], errors[]}`。拉四个 manifest → `enumerateAssets` → 并发(限流,如 20)`fetch(url, {method:'HEAD'})` → 收集非 2xx(404/500/0)。**只 HEAD 不下载**,几秒完。
- UI:VmDebugPanel 加「检查资源完整性」按钮(挨着「测量内存」),跑完列出问题清单(状态码 + URL),可导出。
- 注意:HEAD 对 SW 缓存的影响——用 `cache: 'no-store'` 或加 `?_check` 绕 SWR,确保查的是服务器真实状态而非本地缓存。
- 验收:本地全绿(0 missing);对着缺 gamebg 的环境能列出 404。

## ③ 可选全量预缓存(默认关,锦上添花)

- 设置项 `localStorage.fk_precache_all`(默认关)。开启后,登录/进大厅时后台拉 `enumerateAssets` 全量,经 SW(SWR)落 `fk-assets` 缓存,带进度(已完成/总数)+ 失败清单。
- 用 `fetch`(GET,触发 SW 缓存)而非 HEAD;限流并发;失败不阻塞、计入清单。
- UI:设置区一个开关 + 进度条(可放 VmDebugPanel 或登录后角标)。
- **明确不默认开**:53MB/2187 文件,违背 R-PERF 选择性加载;仅离线/弱网用户主动开。
- 验收:开启 → 进度跑满、失败清单为空(本地);关闭 → 行为同现在(懒加载)。

## 执行顺序

1. 共享 `enumerateAssets`(地基,①②③都用)。
2. ① 部署校验脚本 + 接 Dockerfile(根治,先做)。
3. ② 客户端自检按钮(诊断,你最常用)。
4. ③ 预缓存开关(可选,最后)。

## 风险/取舍

- `enumerateAssets` 要和 sync-fk-assets 的"实际拷了什么"严格对齐,否则校验误报。anim 的帧展开(0..n-1)是易错点,需对 anim.json 的 key 前缀(builtin vs pkg)正确分流。
- 固定资源清单(gamebg 等)要从代码单一来源取,避免漏项——本质上 gamebg 漏 manifest 正是这次 bug,①校验要专门覆盖"代码引用但不在 manifest"的固定资源。
- ③ 预缓存与 PWA SW 的 `maximumFileSizeToCacheInBytes`(8MB)/`maxEntries`(4000)兼容性:2187 文件 < 4000 OK;单文件都 < 8MB OK。
- 每项独立 commit;push 经批准。
