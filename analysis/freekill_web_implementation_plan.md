# FreeKill 多人在线三国杀网站化 · 实现计划

## 1. 架构总览

复用 `freekill-asio` 作为唯一游戏服务端;在浏览器中用 **wasmoon(Lua 5.4 → WASM)托管 FreeKill 原版客户端 Lua**,让规则/状态/交互判定原样运行;React + DOM fixed stage 只负责渲染 VM 推送的增量;Node/TypeScript 网关把浏览器 WSS 适配到 asio 的原生 TCP+CBOR 协议。

```text
Browser
  ├─ React + TS  (DOM fixed stage 牌桌)        ← 只渲染,不碰规则
  └─ wasmoon VM  (原版 freekill-core 客户端 Lua) ← 规则/状态/可点判定
        │ notifyUI 增量 ↑        ↓ replyToServer
        │  WSS (JSON/CBOR envelope)
        ▼
Node/TS Gateway   ← 协议适配:WSS ↔ TCP,CBOR 编解码,登录代理
        │  原生 TCP + CBOR
        ▼
freekill-asio (C++,Linux,唯一服务端)
  ├─ packages/freekill-core + utility + 扩展包
  ├─ server/users.db · game.db
  └─ Lua 5.4 子进程(原版服务端规则)
```

### 核心原则

- **不重写三国杀规则。** 服务端规则与客户端交互判定都用原版 Lua,经 VM 运行。
- **不重写房间/玩家/断线重连/战绩/存档/包管理。** 全部由 asio + 服务端 Lua 承担。
- **少改或不改 `freekill-asio`。** 网关在外部适配协议,不污染服务端主线,便于跟随上游。
- **浏览器不能直连 TCP,** 故由网关模拟官方客户端协议。
- **客户端逻辑层 = WASM 托管原版 Lua**(已 spike 验证,见 §5)。React 只消费 `notifyUI` 增量。
- **复用 release/asio 的图片、音频、扩展包资源**,Web 仅重写桌面 QML 的渲染层。

### 可行性依据(已验证)

`E:\Games\freekill\freekill-web-spike` 用原版 Lua、零规则改写,完整验证了上述架构:客户端引擎在 wasmoon 冷启动 58ms、内存 +11MB、运行时 0.40MB;能消费真实 CBOR 增量并回答 QML 同步查询(`GetCardData`/`Fk:translate`/`canUse`/`targetFilter`);`ui_emu` 出牌请求循环逐牌算出可点状态并产出 `UpdateRequestUI`;服务端房间逻辑同样可在 VM 内由 bot 自动打完整局(5058 包),客户端 VM 零报错回放重建终局状态。详见 §13。

## 2. 三个本地仓库的职责

| 仓库 | 用途 | 不用于 |
| --- | --- | --- |
| `freekill-asio` | 唯一游戏服务端:用户/房间/大厅/流程/Lua 规则/战绩/存档/封禁 | 不直接承载浏览器 UI,不做静态资源 HTTP 服务,不改成 Web 框架 |
| `FreeKill-release` | 资源与扩展包来源(图片/音频/`packages`);Web 资源初始导入与版本基准(`fk_ver 0.5.20`) | 不作为 Web 应用,不作为源码入口 |
| `FreeKill-sourcecode` | 参考:客户端协议、QML UI 布局、客户端 Lua 命令处理 | 不作为生产服务端,不作为网站后端主线 |

资源上线以 `freekill-asio/packages`(服务器实际启用的包)为准,release 仅用于初始导入。

### `freekill-asio` 关键事实(已核对源码)

- 版本 `0.1.14`(`CMakeLists.txt`);默认端口 `9527`;同时监听 TCP/UDP。
- C++17/std + Boost.Asio + OpenSSL + SQLite3 + spdlog + nlohmann-json + libcbor + libgit2 + zlib。
- **不链接 Lua**:游戏逻辑由 Lua 子进程承担——`fork()` → `chdir("packages/freekill-core")` → `execlp("lua5.4", "lua5.4", "lua/server/rpc/entry.lua")`,设 `FK_RPC_MODE=cbor`,经 stdin/stdout 跑 CBOR 编码的 JSON-RPC。
- **POSIX-only**:用了 `fork`/`pipe`/`dup2`/`execlp`/`/proc/<pid>/exe`/`boost::asio::posix::stream_descriptor`,Windows 原生跑不了 → 部署锁 Linux,开发用 WSL2/容器。
- 线程模型:主 `io_context` + 每房间 `RoomThread`(独立 `io_context` + `RpcLua`)+ 异步 game db 线程。

## 3. 浏览器 ↔ asio 协议(网关实现规格)

> 这些细节若不写清,网关在 M0 必卡。全部写进 `packages/protocol` 并对拍真 asio 一次握手。

### 3.1 wire 格式

- **TCP 无长度前缀**:wire 上是裸 CBOR array 连续拼接(无 `<len>\n`、无分隔符),靠 CBOR 自描述长度逐个 `cbor_stream_decode`。网关收流必须做**增量解码 + 余量缓存**。
- **`command` 与 `data` 字段是 CBOR 字节串(major type 2,0x40),不是文本串。** 编码器对 `string_view` 做 `buf[0] += 0x40`;`cbor-x` 默认编文本串会触发服务端校验失败。
- Packet 逻辑数组语义:
  - Request:`[requestId, type, command, data, timeout, timestamp]`(6 元素)
  - Reply:`[requestId, type, command, data]`(4 元素)
  - Notify:`[-2, type, command, data]`(4 元素)
- 类型位标志:`TYPE_REQUEST=0x100` `TYPE_REPLY=0x200` `TYPE_NOTIFICATION=0x400` `SRC_CLIENT=0x010` `SRC_SERVER=0x020` `SRC_LOBBY=0x040` `DEST_CLIENT=0x001` `DEST_SERVER=0x002` `DEST_LOBBY=0x004` `COMPRESSED=0x1000`(置位时 `data` 为 Qt 风格 zlib:4 字节大端原长 + zlib 流)。

### 3.2 登录握手

1. TCP 连接建立。
2. **服务端先发** `NetworkDelayTest` notify,payload 内含 RSA 公钥(PEM 经 CBOR 二进制串包裹)。
3. **客户端回 `Setup` notify**,精确要求:`requestId=-2`、`type=0x412`(`TYPE_NOTIFICATION|SRC_CLIENT|DEST_SERVER`)、`command="Setup"`、`data` 为 5 元素 CBOR array `[name, 密码密文, md5, version, uuid]`。
4. asio 校验顺序:setup 格式 → 版本 → UUID 封禁 → MD5 → 密码。
   - **版本**:须落 `>=0.5.19 <0.6.0`(严格 semver),否则断连。
   - **MD5**:须**精确等于**服务端对 packages 内所有 lua/qml/js 算出的 flist MD5,不符断连。
   - **密码**:客户端用服务端 RSA-2048 公钥 + **PKCS#1 v1.5** 加密;解密后明文须 **>32 字节**,**真实密码 = `substr(32)`**(前 32 字节为占位 AES key)。网关必须在密码前补 32 字节前缀再加密,否则报 "unknown password error"。

### 3.3 网关职责

- 接收浏览器 WSS,为每个浏览器连接建一条到 asio 的 TCP 连接(MVP 1:1)。
- 代理登录握手:模拟客户端做 RSA 加密 + 发 `Setup`;`version`/`md5` 来自资源 manifest;`uuid` 由浏览器持久化或网关下发。
- 编解码 CBOR packet;浏览器侧用固定 JSON/CBOR envelope(便于调试与 schema 校验)。
- 管理 requestId、超时、心跳、断开;速率限制;**不落明文密码、不打印登录 payload 日志**。
- **不做游戏逻辑**:不创建房间、不结算、不判技能、不读写战绩、不绕过登录认证。

### 3.4 浏览器侧 envelope(示例)

```json
// 网关 → 浏览器
{ "kind": "request", "requestId": 123, "command": "AskForUseCard", "data": {}, "timeout": 15, "timestamp": 1710000000000 }
// 浏览器 → 网关
{ "kind": "reply", "requestId": 123, "command": "", "data": { "cards": [1], "targets": [2] } }
{ "kind": "notify", "command": "RefreshRoomList", "data": [] }
```

## 4. 客户端逻辑层:WASM 托管原版 Lua

### 4.1 为什么必须有这一层

QML 客户端内嵌一整套**客户端 Lua 游戏引擎**(`ClientInstance`,`AbstractRoom` 子类),维护本地游戏状态镜像(players/手牌/牌堆/marks/技能/历史)并执行真实规则:`Fk:filterCard`(转化牌/锁视)、`Self:cardVisible`(可见性)、`player:canUse`/`targetFilter`/`enabledAtPlay`/`feasible`(出牌/选目标/按钮亮灭判定)。

QML UI **同步**依赖它:`Ltk` 单例 287 行几乎每个函数都是一行 `Lua.call(...)`;`RoomLogic.js` 有 71 处 `Lua.`/`Ltk.`/`ClientInstance.` 调用。服务端只发**压缩增量**(`MoveCards` 只给 id,请求只给 prompt),期望客户端 VM 自行展开:过滤牌、算可见性、判定可点。

**结论:只代理 packet 的 Web 客户端缺这一层,牌桌将只是静态截图。** 必须在浏览器里运行这套客户端 Lua。

### 4.2 路线决策:托管原版 Lua,而非 TS 重写

- **采用:在浏览器用 wasmoon 运行原版 `freekill-core` 客户端 Lua + 各扩展包 Lua。** React 只订阅 `notifyUI` 增量渲染。保住"不重写规则",扩展包逻辑随 Lua 免费兼容。
- **放弃:用 TypeScript 重写 Player/Card/Skill 判定引擎。** 等于破坏"不重写规则",且永远追不上扩展包更新。

这条路是**原生**的而非 hack:asio 服务端自己已用同一手法——`lua/server/rpc/fk.lua` 把 C++ SWIG 的 `fk.*` 原生面用纯 Lua + RPC 重新实现了一遍("干掉swig")。freekill-core 早被设计成"native 面是可替换的薄层":服务端换 RPC,Web 换 JS 绑定,引擎代码不动。

### 4.3 数据流

```text
asio packet → 网关 envelope → wasmoon VM:
  ClientCallback(ClientInstance, command, cborData, isRequest)
    → 客户端 Lua callbacks 更新本地状态镜像 / ui_emu 算可点状态
    → notifyUI(command, data)  → React store → DOM fixed stage 渲染
玩家操作 → React → VM 请求处理器(ui_emu)计算 reply → replyToServer → 网关 → asio
```

### 4.4 JS 需提供的原生面(薄)

VM 内由 `fkprelude.lua` 把 `fk` 构建成**真正的 Lua 表**(关键:`fk` 不能是注入的 JS 对象,否则 `fk.CreateSkill{...}` 返回值跨 JS 边界丢元表,导致 `addEffect` 为 nil);JS 只暴露叶子函数。**权威清单**为 asio 的 `lua/server/rpc/fk.lua` + `src/swig/{freekill,client,player,qt}.i`。

| 原生符号(SWIG) | Web 实现 |
| --- | --- |
| `fk.QmlBackend_ls/cd/pwd/exists/isDir` | emscripten 虚拟 FS(挂载资源树) |
| `fk.GetMicroSecond` | `Date.now()*1000` |
| `fk.qInfo/qWarning/qCritical/qDebug` | console / 日志 |
| `fk.GetDisabledPacks` | 返回 manifest 中禁用包列表 |
| `Client:notifyUI(cmd, data)` | **渲染数据出口** → React store |
| `Client:notifyServer/getSelf/addPlayer/removePlayer` | JS/Lua 薄对象 |
| `Player` getter/setter、`QList:at/length` | Lua 元表(同 `fk.lua`) |

### 4.5 状态模型

store 不"理解"游戏,只是 `notifyUI` 增量的归一化订阅缓存 + stage 渲染输入:

```text
VM notifyUI → 归一化 reducer → Zustand store → React 渲染
```

核心 store:`connectionStore`(ws/asio 代理/latency/serverVersion)、`authStore`(userId/username/avatar/uuid)、`lobbyStore`(房间列表/在线数/聊天)、`roomStore`(房间设置/玩家/旁观)、`gameStore`(players/handcards/equipment/judge/piles/marks/logs/phase——字段直接来自 VM 推送)、`interactionStore`(active request id/command/selected cards/targets/options/timeout)。所有字段来自 VM 增量,不自行推导规则。

### 4.6 重连 / 旁观

走客户端 VM 既有的 `Reconnect`/`Observe` 回调 + EnterRoom 全量重发,VM 原生支持状态重建。网关把 asio 的全量重发 packet 原样转发,前端在 VM 重建完成后用最新 store 快照重绘 stage。需测中途加入(旁观)与断线回归两条路径。

## 5. Fixed-Stage UI 还原

### 5.1 路线

不能"直接运行 QML 达到 1:1",但能做到视觉与交互布局的高度 1:1——因为 **QML 客户端本来就是 fixed stage**,React DOM 复刻是同构的:

- `main.qml` 逻辑分辨率 `1200×540`,`RootPage` 整体 `scale: parent.width/width` 居中——就是一个缩放的设计稿舞台。
- `RoomPage.qml` 已是单 `Loader` + `transform scale` + `transformOrigin`,与 DOM `transform:scale()` 定宽舞台同构。
- `RoomLogic.js` 座位是**显式坐标公式**(`photoWidth=175*0.75`、`verticalSpacing=roomArea.height*0.08`、`regularSeatIndex`、`arrangeManyPhotos`),非响应式布局,可逐行搬进 TS,误差压到 2–4px。

DOM 结构:

```html
<div class="viewport">            <!-- position:fixed; inset:0; place-items:center; overflow:hidden -->
  <div class="stage" style="width:1200px;height:540px;transform:scale(...)">
    <div class="room-scene">
      <div class="photo" style="transform: translate(x,y) scale(s)"></div>
      <div class="dashboard"></div>
    </div>
  </div>
</div>
```

`scale = Math.min(vw/1200, vh/540)`;用 `position:absolute` + `transform` 复刻 QML `x/y/scale/z`;统一实现 `mapFromItem`/`mapToItem` 等价工具;CSS transition / WAAPI 对应 QML `Behavior`/`NumberAnimation`;`object-fit:cover` 对应 `PreserveAspectCrop`。

### 5.2 工程难点(按优先级)

1. **卡牌飞行命令式动画层(头号硬骨头)。** 卡牌是 `roomScene` 场景坐标系里的浮动节点(非所属区域子节点);区域对象持引用、用 `mapFromItem` 换算场景坐标,再 `goBack` 补间。React 须用 **ref + getBoundingClientRect + WAAPI** 做命令式动画层,不能靠声明式 reconciliation,否则牌瞬移而非飞行。**作为 UI 第一个打通的里程碑**,可用 VM 产出的 MoveCards 流做回放测试床。
2. **声明式动画(约 241 处:NumberAnimation/Parallel/Sequential/Behavior/Transition)。** 无自动转译,定义"动画语义库"(如"牌堆→手牌 300ms easeOutCubic")按语义复用,而非逐行翻译。UI 主要工时。
3. **三个拖拽重排框**(`ArrangeCardsBox` 423 行、`GuanxingBox` 343 行、手牌重排):逐帧几何命中测试,非标准 HTML5 DnD。用 Pointer Events + 逻辑舞台坐标手写;数据由 VM 的 `AskForArrangeCards`/`AskForGuanxing`/`AskForPoxi` 增量驱动。观星/排牌/拼点都在此。
4. **`Photo.qml`(528 行 + 14 子文件)**:HP 珠/装备/判定/marks/锁链/进度条/限定技/双将分屏(OpacityMask)/3 PixmapAnimation。机械拆 React 子组件,OpacityMask→CSS mask,PixmapAnimation→sprite/rAF 帧切换。量大但低不确定性。
5. **`RoomLogic.js`(1617 行)** 充满 `Qt.createComponent`/`createObject`/`mapFromItem`,与 QML 对象生命周期耦合,必须重写而非逐行移植。

### 5.3 通用映射注意

- **anchors→CSS 偏差**:抽"布局快照表",把关键元素最终坐标/尺寸/scale 固化成 Web 数据,不运行时推导 anchors。
- **字体/文本测量**:统一字体文件(项目带 FZLBGBK/FZLE/simli 三款,`@font-face`),显式 font-size/line-height/font-weight,关键文本容器预留宽度。
- **图片 DPR**:用原始资源,牌桌资源固定尺寸不让浏览器任意拉伸;必要时提供 2x/3x 或高分 atlas。
- **z 层级**:明确层级表 `background0/table10/players20/cards30/effects40/dashboard50/chat60/modal70/toast80`。
- **输入事件**:统一 Pointer Events,所有命中测试基于逻辑舞台坐标而非屏幕坐标,覆盖移动端触摸/长按/拖牌/取消。
- **响应式边界**:主玩法锁横屏或给最小可用尺寸,非牌桌页用普通响应式,牌桌保持 fixed stage。

### 5.4 1:1 的边界

**可 1:1(低风险):** 座位坐标、牌桌比例、卡牌/头像尺寸、dashboard 位置、牌移动轨迹、选中/可选/禁用态、倒计时、资源图片/音频/字体。项目**无 Particles、无 Shader、无 PathView、无 Lottie**——最难的 Qt 图形类别根本没用;唯一 `Canvas` 只画收藏星(换 SVG);GraphicalEffects 仅约 31 处(多为 Glow/DropShadow/Gradient,CSS filter/渐变近似)。

**不强求 1:1:** Qt Quick 内部渲染差异、字体抗锯齿、shader/GraphicalEffects 逐像素一致、Qt Popup/Menu 行为。

**验收标准:** 关键元素坐标误差 < 2–4 CSS px + 交互路径一致 + 动画感知一致,**不追逐像素**。

## 6. 技术栈

| 层级 | 技术 | 用途 |
| --- | --- | --- |
| 游戏服务端 | `freekill-asio` | 唯一服务端(房间/规则/战绩/存档),不重写 |
| 服务端逻辑 | 原版 Lua | freekill-core + 扩展包 Lua,经 asio 子进程运行 |
| 客户端逻辑 | **wasmoon(Lua 5.4→WASM)+ 原版客户端 Lua** | 规则/状态/可点判定在浏览器内运行 |
| 网关运行时 | Node.js LTS | WSS ↔ asio TCP 协议适配 |
| 网关语言 | TypeScript | 协议类型,前后端共享 |
| TCP | Node `net` | 连 asio 9527 |
| CBOR | `cbor-x` | packet 编解码(注意字节串 0x40) |
| WebSocket | `ws` | 浏览器实时通信 |
| Schema | `zod` | 校验浏览器 envelope / notifyUI 结构 |
| 前端 | React + TS + Vite | UI/页面/组件 |
| 状态 | Zustand | notifyUI 增量订阅缓存 |
| 牌桌 | DOM fixed stage | 复刻 QML `x/y/scale/anchors` |
| 样式 | CSS Modules | stage/组件/状态样式 |
| 音频 | Howler.js | BGM/技能音/卡牌音 |
| 测试 | Vitest + Playwright | 协议单测/UI 截图/端到端 |
| 组织 | pnpm workspace | monorepo |
| 部署 | Docker Compose + Caddy | 单机/HTTPS/WSS/静态资源 |

### 目录结构

```text
freekill-web/           # pnpm workspace,独立 git 仓库,GPLv3(项目自包含)
  apps/
    web/              # React + Vite 前端(wasmoon 集成、DOM fixed-stage 牌桌)
    gateway/          # Node + TS 网关(登录代理 + WSS↔asio TCP)
  packages/
    protocol/         # CBOR packet 类型、编解码、zod schema
    lua-native/       # 客户端 fk.* 原生面 + fkprelude + bootClient(node/browser 同构)
    shared/           # 前后端共享类型
    assets/           # assets-manifest 生成 + asio flist MD5 算法(computeFlistMd5)
  packages-upstream/  # 上游扩展包镜像:复刻 FreeKill packages/ 结构(core+基础+27 扩展)
                      #   内容 ~1.5GB gitignore;每包 .gitkeep + README 入库保留结构。
                      #   sync 优先此处取包,缺失回退 ../FreeKill-release/packages
                      #   (FK_PACKAGES_DIR 可覆盖)。见 packages-upstream/README.md
  analysis/           # 实现计划 / 进度 / 状态 / 风险(项目"大脑",入库)
  audit/              # 12 份逐元素 FreeKill→Web 还原审计报告(入库)
  docker/             # Caddyfile + caddy/gateway Dockerfile + dockerignore.repo-root
```

> 构建约定:库包(protocol/lua-native/shared/assets)用 `tsc` 输出 ESM + d.ts;apps/web 用 vite,apps/gateway 用 tsc。全仓 vitest;`pnpm -r {build,test,typecheck}` 须全绿。lua-native 的 boot.ts 保持 FS/传输无关(prelude 文本由宿主注入:node 用 fs,browser 用 fetch),故 node/browser 同构。

### AI 开发约束

- 跨端消息全部定义 TS 类型 + zod schema。
- packet 编解码集中在 `packages/protocol`;Web 页面不直接解析 CBOR,只收网关规范化 envelope。
- 牌桌对象一律逻辑坐标,禁止混入普通文档流布局。
- 每阶段写 Playwright 截图测试验证 fixed stage 位置。

## 7. 资源方案

包源:**项目内 `packages-upstream/`**(复刻 FreeKill `packages/` 结构,含 freekill-core + 全部 27 扩展包;内容 gitignore,结构入库)为首选;缺失时回退仓库外 `FreeKill-release`(初始导入)。运行上线以 `freekill-asio/packages` 为准。`sync-fk-assets.mjs` 从包源把启用包的 lua/json(VFS 挂载)+ 美术/音频(懒加载)拷进 `apps/web/public/fk/`。发布路径:

```text
/assets/image/...
/assets/audio/...
/assets/packages/{package}/{image,audio}/...
/assets/packages/{package}/meta.json
```

`assets-manifest.json` 的 `version`/`md5` **必须由实际运行的 asio/packages 在构建期计算生成**(复用 `calcFileMD5`/flist 逻辑),CI 校验与服务端一致,升级包时同步刷新——否则触发 `MD5 check failed`。i18n 数据随 packages 下发,翻译在 VM 内由 `Fk:translate` 就地完成。

```json
{
  "clientVersion": "<compatible-client-version>",
  "server": "<freekill-asio-version>",
  "md5": "<calcFileMD5-from-actual-asio-packages>",
  "packages": ["freekill-core", "utility", "standard", "standard_cards"],
  "assetsBaseUrl": "/assets/"
}
```

## 8. 部署

```text
/opt/freekill-web/
  web/  gateway/  assets/
  asio/ { freekill-asio, packages/, server/, freekill.server.config.json }
```

Caddy 路由:`/` → Web 静态;`/assets/` → 资源;`/ws` → gateway;`/api/server-info` → 可选 HTTP。容器化拆 `freekill-asio` / `freekill-gateway` / `freekill-web` / `caddy`,数据卷挂 `asio/packages`、`asio/server`、配置、logs。包安装:`install freekill-core` + `install utility` + 所需扩展包;旧服迁移复制 `packages/*`、`server/users.db`、`server/game.db`、`freekill.server.config.json`。

## 9. 开发阶段

### M0 · 连通验证 ✅ 完成(2026-06-06)

搭网关;实现 TCP CBOR 编解码(裸帧增量解码、字节串 0x40)、`NetworkDelayTest`、RSA+`Setup` 登录代理、WSS;固定 version/md5/uuid。
**验收:** ✅ Qt 客户端仍可直连 asio(走到 MD5 校验,见 [[asio-md5-handshake]]);✅ Web(浏览器风格 WS)经网关登录同一 asio 并收到 `EnterLobby`(m0-smoke 端到端通过)。md5 当前硬编码,待 assets 生成器替代。

### M0.5 · VM 工程化前置(并行,阻塞性)

按 §11 完成全量包加载度量(R-PERF)、每局新 VM 长稳验证(R-VM)、`fk.*` 原生面补全(R-NATIVE)。产出 `packages/lua-native`。**这些必须在大规模 UI 开发前定型。**

### M1 · 大厅 ✅ 完成(2026-06-06)

`RefreshRoomList`/`CreateRoom`/`EnterRoom`/`ObserveRoom`/`Chat`/在线人数 —— 全部实现(apps/web React+Zustand,大厅纯 envelope 渲染、不依赖 wasmoon,见 [[lobby-needs-no-vm]])。浏览器经 `__gateway_login` 传凭据登录真 asio。
**验收:** ✅ Web 端到端通过(m1-e2e:登录→大厅→建房→进房);⏳ Qt↔Web 混连待包集合一致后验(见 [[asio-md5-handshake]])。

### M2 · 等待房间 + 基础对局 ✅ 核心达成(2026-06-06~07)

基础身份局浏览器**完整跑通**(选将→发牌→出牌→响应→阵亡),核心架构(VM 托管规则 + ui_emu 交互 + 请求闭环 + 卡牌飞行命令式动画 R-ANIM + 牌桌高保真主体)全部实证。牌桌高保真分批推进:批次 1(全部 P0)/批次 2(计时·选将·右键武将详情三系统主体)/批次 3(Photo 子区·卡牌·弹窗 P1 主体)已完成。
**验收:** ✅ `freekill-core + standard + standard_cards + maneuvering` 单人加 bot 跑完整一局,VM 零报错。
**遗留(已在 M3/M4 解决):** 大厅路由丢包致旁观/重连 broken(→ M3 ✅);对局内若干请求 UI 未完备、声明式动画/音频缺失(→ M4 ✅)。

> **以下里程碑依据独立审计 `audit/phase*.md`(12 份逐元素对照报告,2026-06-10 已对当前源码+web 重新审计并主控复核纠错)+ 用户决策制定。** 详细切片见 `analysis/M3-M6_detailed_plan.md`(现聚焦 M5/M6,M3/M4 已转历史)。

### M3 · 对局健壮性:路由修复 + 断线重连 / 旁观 · ✅ 完成(2026-06-08)

路由头号真 bug(R-ROUTE,P2A-014/P2B-006/007/014)已消解:`routeEnvelope` 改为"首个房间引导包(EnterRoom/Observe/Reconnect)即引导 VM",大厅应答 Heartbeat,带密旁观传真实密码,对局中退房二次确认;断线重连用 localStorage 无感方案(在局玩家同凭据重登触发 asio `reconnect()` 全量重发,R-CRED 债已记)。对真 asio 脚本验证全 PASS(observe-reconnect / reconnect-probe / refresh-test)。审计 P2B-006/007/014 现 successfully restored。

### M4 · 对局体验完备:交互补全(切片 I)+ 视觉动画音频(切片 V)· ✅ 完成(2026-06-08~09)

**切片 I**:AskForPoxi 真实化(接 VM poxiFilter/Feasible/Prompt)、AskForCardsAndChoice / AskForMoveCardInBoard / 动态 Interaction 子面板(combo/spin/cardname/checkbox)补处理器与 UI、Pointer Events 真拖拽框(观星/排牌/拼点,arrangeDrop)、CustomDialog/MiniGame unsupported 兜底。**切片 V**:vmStore 视觉命令总闸 + animationStore、Indicate 连线(箭头+红环)、Emotion 精灵、tremble/濒死/阵亡、技能发动框、音频(原生 Audio)、Toast、桌面牌注脚。多轮真机验收 + 验收期 bug 修复(五谷 AG 框遮无懈、StrictMode oncancel、部署 audio/anim 缺失等)。审计 P2D-015/020/028、P5-022/023/024/025、P7-008/009/010 现 successfully restored。

### M5 · 扩展包 UI 兼容 + i18n 全量 + Qt↔Web 混连 · 进行中(M5-a/b/c 已完成)

**已完成**:M5-a 单局完整度(MiscStatus 回合/计时/牌堆数 P2D-023/P5-030、标记区 `@!`/`@@`/`@`/`@[type]` 分类 P2D-021/P5-013);M5-c MD5 算法(`computeFlistMd5` 字节级复现 asio,core `e48d6db7` / +utility+standard_ex+sp `8efa2cc` 双验证,R-MD5/A5 已落地)；M5-b 加载扩展包(utility+standard_ex+sp 入 asio + web sync EXTENSION_PACKS + mount.ts manifest.extra,握手 MD5 实测 asio 接受 P6-036~039)+ QmlMark 文本型(GetQmlMark how_to_show)+ ChooseSkillBox(首个 utility 共享框,CustomDialog 按 qml_path 派发);PWA + /fk 资源 SW 缓存(治偶发缺语音/动画,P7-031)。
**剩余**:更多 utility 共享框(按导入包用到的 qml_path 驱动)、QmlMark 点击查看型(`@&`/`@$`→ViewPile)、LimitSkillArea/banner(可能镜像免费)、i18n 全量(接 `Fk:translate`,保留 lobby 静态 fallback,A10)、Qt↔Web 混连验收(MD5 已对齐,无握手门槛)。**扩展包逻辑随 Lua 免费兼容,本阶段只为新 UI 元素补渲染。**
**验收:** 主流扩展包能开局、响应技能、完成常见流程;Qt↔Web 混连进同房对局;未覆盖的扩展弹窗走安全兜底不卡死。

### M6 · 生产化(2–4 周)

HTTPS/WSS、反向代理(Caddy:已有 `/ws` 代理 + `/fk` no-cache/ETag + PWA SW 控制文件 no-cache)、日志监控、自动重启、数据库备份、网关限流、管理后台;Docker Compose 已拆 `asio`/`gateway`/`caddy`,完善持久化卷与健康检查。偿还 R-CRED(明文凭据→session token)、过 R-GPL/R-ASSET 分发边界。

### 延后 / 可选范围(不阻塞核心收尾,记录在案,按需立项)

> 审计中占比最大的"未还原"集中在以下外围功能。经决策**不纳入正式里程碑**:它们不在"能否像 FreeKill 一样打一局并稳定混连"的关键路径上,作为已知缺口留底,核心稳定或用户明确需要时再单独立项。

- **回放 / 录像 / 战绩**(audit Phase 8 整片、P2C-010/011):`saveRecord`/`saveGameData` 现为空桩,无浏览器持久化(IndexedDB/OPFS 或网关代存)、无回放引擎与回放页、无战绩统计。属 §13 已记的 io 沙箱适配项。
- **大厅设置 / 建房丰富度**(audit Phase 3 大半、Phase 9 全片):建房的包/禁将选择与 Ban 方案、音频/控制/UI 设置页、收藏服务器与 LAN 探测的服务器浏览器、首次教程、资料库(武将/卡牌图鉴 + 筛选)、个人资料编辑(改头像/密码)、MOTD/公告。当前大厅只做登录/房间列表/建房/进房/聊天的可玩子集。

## 10. 验收标准

- `freekill-asio` 是唯一游戏服务端;Qt 客户端可继续直连。
- Web 经网关连 asio,能登录/进大厅/看房/建房/加房;Qt 与 Web 可混合进同一房间(M5)。
- 基础包能完成一局(✅ M2 达成);扩展包主流玩法可用(M5)。
- **断线重连 / 旁观可用**(核心,M3 ✅):断线可恢复对局,中途可旁观进房;已实现 localStorage 同凭据无感重连(WS 掉线/刷新自动重登触发 asio reconnect 全量重发),明文凭据债记 R-CRED 待 M6 偿还。
- 对局内无"计时器空转"的卡死请求,关键动作有动画/音频反馈(M4)。
- Web 资源全部来自 HTTP 静态路径;sourcecode 内置 Qt 服务端未被用作生产后端。
- 牌桌关键元素坐标误差 < 2–4 CSS px,交互路径与动画感知一致。
- **不在验收范围(延后/可选):** 回放/录像/战绩、大厅设置/建房丰富度/资料库(见 §9 延后清单)。

## 11. 风险登记册

> 评级口径:`低` / `中` / `中高` / `高`。客户端逻辑层可行性已由 spike 消解;M0.5 三项工程化前置(R-PERF/R-VM/R-NATIVE)已降级为低;R-ANIM(卡牌飞行)M2 实现、R-ROUTE(路由)M3 消解、R-DND(拖拽框)M4 实现、R-MD5(MD5)M5-c 落地。**当前风险重心**:R-CRED(明文凭据,M6 偿还)、R-GPL(分发合规)、R-SCALE/R-CONN(容量,M6 压测);UI 工程 R-ANIM2/R-LAYOUT/R-FONT 为持续打磨项。**风险与里程碑依据重新审计后的 `audit/phase*.md`(2026-06-10)。**

### 工程化(新风险重心)

**R-PERF · 全量扩展包加载性能与内存 —— 低〔已度量,降级〕**
基础 4 包(297 文件/1.59MB)启动 60ms、+6MB;全量 **30 包/7641 Lua 文件/21MB** 已 Node+wasmoon 实测:挂载 2.9s、启动 985ms、峰值 RSS ~177MB(引擎 Δ86MB),内容 3295 武将/1482 牌/12947 技能/40 模式。**未数量级失控**,且选择性加载可压到 selective 区间(8 包:启动 367ms/RSS Δ33MB)。
*已落地:* ①度量完成(`freekill-web-spike/src/perf_{spike,run}.mjs`,`npm run perf`,`perf-result.json`);②选择性加载杠杆确认——只向 VFS 挂载该局所需包目录即可,`ModManager:loadPackages` 的 `FileIO.ls` 自动发现机制天然支持,无需改引擎。
*残留:* 真浏览器内复测(RSS/启动随 emscripten heap 行为可能不同,待 apps/web 起来后 Playwright 复核);挂载耗时(FS 往返)是主成本→ 对应解③ bundle/luac 预编译,工程化时落地。

**R-VM · wasmoon 长稳 / GC / 多局切换 —— 低〔已度量,降级〕**
真实用户一个标签页连打多局、长挂机、旁观切换,需防 Lua VM 泄漏与 WASM 堆不回收。**已 Node 实测**:回放真实一局 packet 流连打 50 局(reuse 另测 100 局),两模式(fresh=每局新 LuaFactory / reuse=单 factory 复用 + 每局 close)的 **`process.memoryUsage().external`(ArrayBuffer/WASM 线性堆)均零增长**(fresh 第 2 局起平台化 35.4MB;reuse 恒 19.4MB)→ **VM 无泄漏**。RSS 单调爬升纯属分配器碎片(reuse 100 局 RSS 后半斜率塌到 0.065MB/g 平台化,external 不动)。
*已落地:* ①度量完成(`freekill-web-spike/src/vm_{spike,run}.mjs`,`npm run vm`,判定以 external 为准非 RSS);②解①成立——每局新 VM/close 重建安全;③**reuse 模式更优**(external 19.4 vs 35.4MB、RSS 峰值 125 vs 200MB),可作备选降峰值。
*残留:* RSS 碎片在真浏览器 tab 内存模型下行为不同(移动端 tab 有硬上限),待 apps/web 起来后 Playwright 复核;旁观切换/长挂机的真实时序未测(本次是顺序连打)。

**R-NATIVE · `fk.*` 原生面完整性 —— 低〔已审计,降级〕**
spike 覆盖了启动+基础对局所需符号;全量功能可能触及更多 `fk.*`。**已审计**:给 `fk` 装 `__index` 陷阱,全量 30 包(3295 武将/1482 牌/12947 技能)加载 + 建 ClientInstance,唯一被读为 nil 的是 `fk.CreateTriggerSkill`(仅 joym 旧包调用,new-core 已删除该 API)。SWIG 客户端清单(freekill.i/client.i/qt.i/player.i)+ clientbase 运行时调用三方交叉对照,prelude 全覆盖;`fk.QJsonDocument`/`QRandomGenerator`/`addQmlImportPath` 客户端运行时零引用。
*已落地:* 审计脚本 `freekill-web-spike/src/native_audit.mjs`(`native-audit.json`);prelude 原生面确认完整,含 isDir mode 位修复。
*残留:* ①`saveRecord`/`saveGameData` 现为 no-op,沙箱下录像/存档需接 IndexedDB/OPFS 或网关代存(§13 io 适配项,非原生面缺失);②若要支持 joym 等 new-core 不兼容旧包,需补 legacy compat 层(fkparser + `fk.Create*` 家族),否则跳过。

**R-ANIM · 卡牌飞行命令式动画层 —— 低〔已实现,降级〕**
见 §5.2;M2 切片 3 已用 ref+getBoundingClientRect+WAAPI(500ms OutQuad)实现,脱离 React reconciliation 防瞬移,用 VM 的 MoveCards 流做回放测试床验证。残留的其余动画(翻转/抖动/飘字等)归 R-ANIM2,在 M4 切片 V 做。

### 后端 / 协议 / 运维

**R-ROUTE · 大厅路由丢引导包,旁观/重连 broken —— 低〔M3 已消解〕**
独立审计坐实(P2A-014/P2B-006/007/014):浏览器 `routeEnvelope` 曾只在收到服务器 `EnterRoom` 时引导 VM,大厅阶段先到的 `Observe`/`Reconnect` 首包落 `default` 被丢、`Heartbeat` 被忽略致久挂被踢、带密旁观硬编码空密码必拒。**M3 已修**:路由改"首个房间引导包即引导 VM"+ 大厅应答 Heartbeat + 带密旁观传真实密码;断线重连用 localStorage 同凭据重登触发 asio `reconnect()` 全量重发。对真 asio 双 WS 脚本验证 PASS,重新审计标 successfully restored。

**R-MD5 · MD5 与版本强校验 —— 低〔M5-c 已落地〕**:见 §7。`packages/assets` 的 `computeFlistMd5` 字节级复现 asio `calcFileMD5`,对真 asio 双验证(core `e48d6db7` / +三包 `8efa2cc` 均字节一致,错 MD5 被 asio 拒)。网关从配置/manifest 取 md5。残留:`UpdatePackage` 强制更新下载 UI 未做(单机同包无碍)。
**R-PROTO · 网关协议细节 —— 低〔已消解〕**:见 §3。`packages/protocol` 写实 + `apps/gateway` M0 已**对拍真 asio 一次活体握手**:NetworkDelayTest→RSA Setup→EnterLobby 全通,浏览器风格 WS 经网关登录 asio 收到大厅 envelope(m0-smoke 端到端验证)。CBOR 编解码(裸帧增量解码、字节串 0x40、Qt-zlib)经 2708 真实包 + 活体握手双重验证。已踩平的坑:cbor-x 须 `mapsAsObjects:false`(解码)+ `tagUint8Array:false`(编码,否则 asio 拒绝 tag-64 字节串)、BigInt 归一、Setup 密码 32 字节前缀须非零(asio C 串截断)。详见 [[cbor-x-asio-gotchas]]。残留仅工程增强(requestId/超时/心跳/重连/限流),非协议风险。
**R-LINUX · POSIX 依赖 —— 中**:asio 锁 Linux 部署,开发用 WSL2/容器。
**R-SCALE · asio 单进程不可横向伸缩 —— 中**:先单服容量规划,压测定上限,需扩容按多实例+房间分片演进。
**R-LOGIN · 网关登录安全边界 —— 中高**:仅 WSS;不落明文密码、不打印登录 payload;登录失败限频;网关与 asio 同机 127.0.0.1。
**R-CRED · 浏览器明文凭据持久化 —— 中高〔M3 R2 取舍,记录在案〕**:为支持"完全无感"断线/刷新重连(用户 2026-06-08 拍板),登录凭据(含明文密码)持久化于浏览器 `localStorage`。asio 重连机制要求在局玩家用同 user/password 重新登录(`auth.cpp:465-479` 自动 `reconnect`),故无感重连需可取回凭据。**风险**:明文密码长期驻留 localStorage,XSS/同源脚本可读,违背一般最佳实践。**偿还计划**:生产化(M6)替换为短期 session token / 服务端会话 / httpOnly 凭据,不在公网长期沿用明文方案。
**R-CONN · 每 WS 一条 asio TCP —— 中**:MVP 维持 1:1,公网前压测连接/心跳/内存放大。

### UI 工程(数据层已落定,纯实现风险)

**R-ANIM2 · 约 241 处声明式动画手翻 —— 中高**:定义动画语义库按语义复用。
**R-DND · 三个拖拽重排框 —— 低〔已实现〕**:Pointer Events + 逻辑坐标手写命中,M4 切片 I-6 已做(arrangeDrop.ts 纯 reducer + 7 测试)。
**R-LAYOUT · anchors→CSS 偏差 —— 中高**:布局快照表固化坐标。
**R-FONT · 字体/文本测量 —— 中高**:统一字体 + 显式行高。
**R-DPR · 图片 DPR/缩放 —— 中高**:原始资源 + 固定尺寸。
**R-ACCEPT · 验收"完全一致"失控 —— 中**:误差 2–4px + 路径/感知一致,不逐像素。
**R-OBSERV · 缺可观测性致 bug 难定位 —— 低〔已消解,2026-06-09〕**:此前两次"修了又没修"(五谷/战报)源于无运行时可观测性、靠静态推断。已建结构化日志系统(`packages/shared/logger.ts` + web `diag/log.ts` localStorage 门控 + gateway `FK_LOG` 门控)+ notifyUI 未消费命令探测器(`notifyCommands.ts` 活分类器,真实整局回放断言无功能性五谷类缺口)。后续 bug 用 `fk_log=debug` 导出 JSON 定位,不再纯靠猜。配套教训:VM 镜像架构下静态 audit 易高报(memory `vm-mirror-vs-delta-audit`);别拿单测当真实验证,先 probe 真实 VM/CBOR。

### 合规

**R-GPL · GPLv3 义务 —— 中高**:WASM 路线把整套 freekill-core/扩展包 Lua 源码分发到浏览器,衍生前端/网关代码须以 GPLv3 开源、提供完整对应源码与构建说明、不混入不兼容私有依赖;法务在公网发布前过分发边界。
**R-ASSET · 素材版权 —— 中**:发布前核对各包许可证与素材来源,无授权素材不上公网。

### 已消解(spike 验证)

- **客户端逻辑层缺失** → §4/§13:WASM 托管原版 Lua,客户端 VM 零报错重建真实整局状态。
- **command 兼容量大 / AI 生成易遗漏 / 翻译** → 逻辑全在 VM,Web 只剩渲染;漏写只是画错不是不可玩;`Fk:translate` 在 VM 内完成。
- **重连/旁观重建、gameStore 过简** → VM 原生支持重建;store 退化为 notifyUI 增量订阅。

### 实现审计待办(2026-06-06 用「实现纪律」倒查 → 已清理)

> 四个 Explore 审计 + 人工逐条核实(审计员有误报,如 getMicroSecond 被指差 1000 倍——核实属误报)。**A1-A4、A6-A9、A11-A12 已修复并验证(提交 88d8af6);A5、A10 依赖未建里程碑,延后。**

**已修复(✅ 88d8af6,全 workspace 绿 + 对真 asio 验证):**
- **A1** getDisabledPacks 改 config 驱动(createNatives `disabledPacks` 选项)。
- **A2** 座位 >8 人:逐行照搬 arrangeManyPhotos(含缩放),seatPosition 返回 scale。
- **A3** VM 错误不再静默吞(console.error + vmStore.error surface);单个坏包不冻结 feed 链。
- **A4** prelude self 改显式占位(id 0/空名),Setup 覆盖为真实身份;加回归测试。
- **A6** AsioClient.close() end+destroy+null+removeListeners(不再累积半开 socket)。
- **A7** envelopeToPacket request 分支用 TYPE_REQUEST。
- **A8** 握手成功须见已知 OK 命令(Setup/EnterLobby/…),未知包缓冲重放不臆断成功;UpdatePackage 入失败集。
- **A9/A11** 补 COMPRESSED 往返、request 类型、BigInt 测试。**A11 顺带揪出潜伏网关 bug**:qzlib 的 `(0,eval)('require')` 在 ESM 下为 undefined、遇压缩包会运行时抛错——改 `process.getBuiltinModule('node:zlib')`(同步、无 import、浏览器 guard),浏览器构建已验证干净。
- **A12** 网关按 IP 登录限频(10/分钟);失败原因对浏览器只回通用文案(asio 内部信息不外泄,详情留服务端日志)。

**延后(依赖未建里程碑,已记录):**
- **A5 网关 FK_MD5 硬编码** = R-MD5 → **已落地(M5-c)**:`packages/assets` 的 `computeFlistMd5` 字节级复现 asio 算法,对真 asio 双验证;网关从配置取 md5(core `e48d6db7` / +三包 `8efa2cc`)。残留:UpdatePackage 强制更新下载 UI。
- **A10 i18n/zh.ts 硬编码词典缺词**(待 M5):接 VM `Fk:translate` 导出全量翻译。当前大厅仅少量 gameMode 文本,缺词显原 key 不影响可玩。**注**:lobby 阶段 VM 未 boot,须保留 `zh.ts` 静态 fallback,不能简单删词典。

## 12. 首批任务清单

1. 在 `freekill-asio` 下安装/同步 `freekill-core` 与 `utility`,启动本地 `freekill-asio -p 9527`。
2. 新建 `freekill-web/` pnpm workspace。
3. `packages/protocol`:FreeKill packet 类型、CBOR 编解码(裸帧/字节串)、zod schema。
4. `packages/lua-native`:以 `server/rpc/fk.lua` + `src/swig/*.i` 为清单实现客户端 `fk.*` 原生面 + `fkprelude`。
5. `apps/gateway`:asio TCP 连接 + WSS envelope;`NetworkDelayTest`+RSA+`Setup` 登录代理。
6. `apps/web`:wasmoon 集成 + React 登录/大厅。
7. 从实际 `asio/packages` 生成 `assets-manifest.json`。
8. **R-PERF/R-VM 度量**:全量包加载性能 + 每局新 VM 长稳。
9. 联调 Qt 客户端、Web 客户端、asio 三方混连。
10. Playwright 截图验证 fixed stage 基础布局;打通卡牌飞行动画层。

## 13. 附录:可行性 Spike 证据

代码 `E:\Games\freekill\freekill-web-spike`(`npm run all`,Node v24.11.1,wasmoon = Lua 5.4→WASM)。用原版 Lua、零规则改写,六道验证全部通过:

| 关 | 验证 | 结果 |
| --- | --- | --- |
| 1 | `freekill.lua` 启动,加载扩展包,Engine 建好内容 | ✅ 58ms;29 武将/160 牌/132 技能/1 模式 |
| 2 | `CreateLuaClient` 建出 `ClientInstance` 状态镜像 | ✅ 4ms |
| 3 | 喂真 CBOR 增量,VM 展开 + 回答 QML 同步查询 | ✅ `GetCardData→{slash,spade,7}`;`Fk:translate(biyue)→闭月` |
| 4 | 真实出牌请求循环驱动 `ui_emu` 逐牌算可点 | ✅ 杀=可点/闪=不可点;产出 `UpdateRequestUI` |
| 5 | 服务端房间逻辑跑进 VM,bot 自动打完整局 | ✅ 5058 包/39 命令;`GameOver: lord+loyalist+civilian` |
| 6 | 真实 packet 流回放进客户端 VM | ✅ 2525 包/100% 零报错;重建终局(P2 rebel 阵亡);1401 notifyUI(MoveCards 149 + UpdateRequestUI 87) |

资源footprint:挂载 295 文件/1.59MB,RSS +11MB,wasmoon 运行时 0.40MB(gzip 前)。

### 未覆盖(转入 §11 工程化风险)

- Gate 5/6 在同一 Node 进程顺序跑,未经真实 WSS 网关/TCP;生产仍以 C++ asio 为唯一服务端,本路线只替换**客户端**侧(Gate 5 的 wasmoon 服务端仅是验证工具)。
- Gate 5 用 `Player_Trust` + 禁延迟让一局瞬间跑完,packet 的**种类与结构**真实,但时序与真实对局不同。
- 全量 31 包未压测(R-PERF);wasmoon 长稳/多局未测(R-VM);`io`/`os` 沙箱下录像存档需适配到 IndexedDB/OPFS 或由网关代存(`saveRecord`/`saveGameData` 接后端 API)。
