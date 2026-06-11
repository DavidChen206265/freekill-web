# freekill-web

把 [FreeKill](https://github.com/Notify-ctrl/FreeKill)(开源三国杀)做成**网页版**:不重写任何游戏规则,而是用 **wasmoon 在浏览器里直接托管原版客户端 Lua**(`freekill-core`),React + DOM 只负责渲染,Node 网关做 WSS↔TCP 协议适配,后端当前接 `freekill-asio`,Web-only 路线允许维护 `freekill-web-asio` 小 fork。

```text
Browser
  ├─ React + TS  (DOM fixed-stage 牌桌)           ← 只渲染,不碰规则
  └─ wasmoon VM  (原版 freekill-core 客户端 Lua)   ← 规则/状态/可点判定
        │ notifyUI 增量 ↑       ↓ replyToServer
        │  WSS (JSON / CBOR envelope)
        ▼
Node / TS Gateway   ← 协议适配:WSS ↔ TCP、CBOR 编解码、登录代理、requestId 回填
        │  原生 TCP + CBOR
        ▼
freekill-asio  (C++ / Linux,唯一权威服务端)
```

核心理念:**规则只有一份**(原版 Lua),浏览器跑的就是它。前端拿到的是 VM 算好的 `notifyUI` 增量与“可点/可选”判定,因此规则、判定、AI 与服务端始终一致,不存在两套实现漂移。

> 完整设计见 `analysis/freekill_web_implementation_plan.md`,逐日进度与决策见 `analysis/PROGRESS.md`,UI 还原审计见 `audit/phase*.md`(12 份逐元素对照报告)。

## 现状

可端到端跑通一整局,并已**部署 VPS**(Docker Compose + Caddy 自动 HTTPS/WSS):**登录 → 大厅 → 建房/加机器人 → 准备 → 选将 → 发牌 → 出牌/响应 → 装备/判定 → 卡牌飞行/技能精灵/音效 → 阵亡 → 结算 → 返回房间**,断线/刷新可无感重连,可中途旁观。逻辑链已对真实 `freekill-asio` 验证,牌桌为对照 QML 源码逐元素还原的 DOM fixed stage。

| 里程碑 | 状态 | 内容 |
| --- | --- | --- |
| M0 网关连通 | ✅ | WSS↔TCP、RSA 登录、CBOR 帧解码、每浏览器 1:1 asio 连接 |
| M1 大厅 | ✅ | 登录/房间列表/聊天/建房(纯结构化 packet,无 VM) |
| M2 牌桌 | ✅ | 浏览器内客户端 VM、座位、卡牌飞行动画、出牌交互(ui_emu)、全量请求弹窗、真实卡面/立绘、Photo 子区(血珠/双将/装备/判定/标记)、选将界面、结算 |
| M3 健壮性 | ✅ | 路由修复 + 断线重连 / 旁观(localStorage 同凭据无感重连触发 asio 全量重发) |
| M4 体验完备 | ✅ | 交互补全(Poxi/CardsAndChoice/MoveCardInBoard/Interaction 子面板/真拖拽框)+ 视觉动画音频(指示线/Emotion 精灵/受击抖动/濒死阵亡/技能发动框/音频/Toast/桌面牌注脚) |
| M5 Web 扩展底座 | 进行中 | **M5-a 单局完整度**(MiscStatus 回合/计时/牌堆数、标记区完整化)✅ · **M5-b 扩展包**(加载 utility+standard_ex+sp、QmlMark 文本标记、ChooseSkillBox)✅(更多 utility 共享框 / 点击查看型 QmlMark 进行中) · **M5-c MD5 算法**(字节级复现 asio flist MD5,对真 asio 双验证)✅,现降级为诊断/兼容工具 |
| Web-only 路线 | 计划 | `freekill-web-asio` 小 fork、跳过 MD5 准入、manifest/capabilities、账户个性化、生产化、创意工坊/AI |

附:**PWA 化** —— `/fk` 资源经 Service Worker 本地缓存(治偶发缺语音/动画),app 壳可安装。

测试:`web 120` · `protocol 20` · `lua-native 16`(+ shared / assets;gateway 活体握手与 e2e 需本地 asio,默认 skip),全绿。

未完成:Web-only 服务端小 fork、manifest/capabilities、i18n 全量(接 VM `Fk:translate`)、更多扩展包 UI、回放/录像/战绩、大厅设置/资料库丰富度、账户个性化与生产化。

## 仓库结构

monorepo(pnpm workspace)。所有代码均为本仓库自有;原版 `freekill-core` Lua 与美术**不入库**(版权,gitignore),运行时从本地上游或 `packages-upstream/` 镜像同步(见下文)。

| 目录 | 职责 |
| --- | --- |
| `packages/protocol` | CBOR packet 编解码(裸帧增量解码、字节串 0x40、Qt-zlib)、packet 类型、envelope 转换、zod schema |
| `packages/lua-native` | 客户端 `fk.*` 原生面(`fkprelude.lua` + JS 叶子函数)+ boot 序列;node / browser 同构。把原版客户端 Lua 跑起来的关键 shim |
| `packages/shared` | 前后端共享类型 + 同构结构化 Logger |
| `packages/assets` | assets-manifest 生成 + asio flist MD5 复现(`computeFlistMd5` / `compute-md5.mjs` CLI,Web-only 后主要作诊断/兼容) |
| `apps/gateway` | Node + TS 网关:WSS↔asio TCP、登录代理、reply requestId 回填、GameLog 缓冲重放、断线 park 宽限 |
| `apps/web` | React + Vite 前端:wasmoon 集成、DOM fixed-stage 牌桌、Zustand store、SkinBank 路径解析、PWA |
| `packages-upstream/` | **上游扩展包镜像**(复刻 FreeKill `packages/` 结构,~1.5GB 内容 gitignore,仅 `.gitkeep`+README 入库保留结构)。sync 优先从这里取包,缺失回退仓库外 `FreeKill-release/packages`。见 `packages-upstream/README.md` |
| `docker/` | VPS 部署(Docker Compose + Caddy HTTPS/WSS)。见 `docker/README.md` |
| `analysis/` | 实现计划 / 进度 / 状态 / 风险(项目“大脑”,入库追踪) |
| `audit/` | 12 份逐元素 FreeKill→Web 还原审计报告(入库追踪) |

## 开发

前置:Node ≥ 20、pnpm 10、可访问的 `freekill-asio`(Linux / WSL)。

```sh
pnpm install
pnpm -r build        # 全包构建
pnpm -r test         # 全包测试
pnpm -r typecheck    # 类型检查
```

运行(本地三件套):

```sh
# 1) 启动 freekill-asio(在 WSL / Linux,监听 9527)

# 2) 同步原版 Lua + 美术到 apps/web/public/fk
#    包源:优先 packages-upstream/(本仓库内镜像),缺失则回退 ../FreeKill-release/packages
#    用 FK_PACKAGES_DIR=<dir> 可显式指定包源
pnpm --filter @freekill-web/web sync-assets

# 3) 网关(ASIO_HOST 必填——WSL NAT IP 每次重启会变)
cd apps/gateway && ASIO_HOST=<asio-ip> node dist/index.js   # 默认 WSS :9528

# 4) 前端
pnpm --filter @freekill-web/web dev                          # 默认 :5174
```

> 改了 `packages/lua-native/lua/fkprelude.lua` 后必须重跑 `sync-assets`——浏览器加载的是 `apps/web/public/fk/` 下的副本。

### 启用更多扩展包

asio 拷入对应包并在 `packages.db` 启用 → web 把包名加进 sync 的 `EXTENSION_PACKS` 重跑 `sync-assets`(各包 lua 挂 VFS,美术/anim/audio 走懒加载)。当前上游兼容模式下包集合变化仍会影响握手 flist MD5,可用 `packages/assets` 的 `compute-md5.mjs` 重算并填入网关 `FK_MD5`;Web-only P0 落地后改由 manifest/capabilities 管启用包与资源版本。当前已加载 `utility` + `standard_ex` + `sp`。

## 部署

Linux VPS + 域名,Docker Compose 一键起全栈(asio + gateway + caddy),Caddy 自动 HTTPS/WSS。完整步骤见 **`docker/README.md`**(含 `.dockerignore` 上下文根、audio/anim 资源、当前兼容模式 MD5、数据卷备份等注意事项)。

## 上游参考(只读,不在本仓库)

`../freekill-asio`(服务端)、`../FreeKill-release`(资源 / 扩展包)、`../FreeKill-sourcecode`(协议 / QML 参考)。一切新代码进本仓库,上游三仓只读。

## 许可证与素材

代码以 **GPL-3.0-or-later** 开源(见 `LICENSE`)。WASM 路线会把整套 `freekill-core` / 扩展包 Lua 源码分发到浏览器,因此衍生前端 / 网关代码必须以 GPLv3 开源并提供完整对应源码与构建说明(实现计划 §11 R-GPL)。

**素材版权(R-ASSET)**:FreeKill 的武将立绘、卡图、音频等美术资源版权归原作者 / 各扩展包作者所有,**未授权不得公网分发**。本仓库**不包含**任何上游 Lua 源码或美术——它们仅在本地通过 `sync-assets` 落到被 git 忽略的 `apps/web/public/fk/`。公网发布前请自行核对各包许可证与素材来源。

## 致谢

- [FreeKill](https://github.com/Notify-ctrl/FreeKill) —— Notify 等,原版游戏与全部规则 Lua、美术资源。
- `freekill-asio` —— 本项目复用的 C++ 服务端。
