# freekill-web

把 [FreeKill](https://github.com/Notify-ctrl/FreeKill)(开源三国杀)做成**网页版**:不重写任何游戏规则,而是用 **wasmoon 在浏览器里直接托管原版客户端 Lua**(`freekill-core`),React + DOM 只负责渲染,Node 网关做 WSS↔TCP 协议适配,后端仍是原版 `freekill-asio`。

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

核心理念:**规则只有一份**(原版 Lua),浏览器跑的就是它。前端拿到的是 VM 算好的 `notifyUI` 增量与"可点/可选"判定,因此规则、判定、AI 与服务端始终一致,不存在两套实现漂移。

> 完整设计见 `分析/freekill_web_implementation_plan.md`,逐日进度与决策见 `分析/PROGRESS.md`,UI 审计见 `分析/AUDIT_6.5.md`。

## 现状

可端到端跑通一整局:**登录 → 大厅 → 建房/加机器人 → 准备 → 选将 → 发牌 → 出牌/响应 → 装备/判定 → 阵亡 → 结算 → 返回房间**。逻辑链已对真实 `freekill-asio` 验证,牌桌为对照 QML 源码逐元素还原的 DOM fixed stage。

| 里程碑 | 状态 | 内容 |
| --- | --- | --- |
| M0 网关连通 | ✅ | WSS↔TCP、RSA 登录、CBOR 帧解码、每浏览器 1:1 asio 连接 |
| M1 大厅 | ✅ | 登录/房间列表/聊天/建房(纯结构化 packet,无 VM) |
| M2 牌桌 | ✅ | 浏览器内客户端 VM、座位、卡牌飞行动画、出牌交互(ui_emu)、全量请求弹窗、真实卡面/立绘、Photo 子区(血珠/双将/装备/判定/标记)、选将界面、结算 |
| M2 切片 6.5 | 进行中 | 按 QML 源码逐项修 UI 保真(批次 1–3 完成:卡牌渲染 / Photo 子区 / 技能栏 / 弹窗 / 结算)。下一步批次 4 = 声明式动画 |

测试:`web 71` · `protocol 20` · `lua-native 11`(gateway e2e 需要本地 asio,默认 skip),全绿。

未完成:声明式动画层(受伤抖动 / 濒死 / 飘字 / 连线)、重连 / 旁观、i18n 全量、网关 flist MD5(Qt↔Web 混连)。

## 仓库结构

monorepo(pnpm workspace)。所有代码均为本仓库自有;原版 `freekill-core` Lua 与美术**不入库**,运行时从本地上游同步(见下文)。

| 包 | 职责 |
| --- | --- |
| `packages/protocol` | CBOR packet 编解码(裸帧增量解码、字节串 0x40、Qt-zlib)、packet 类型、envelope 转换、zod schema |
| `packages/lua-native` | 客户端 `fk.*` 原生面(`fkprelude.lua` + JS 叶子函数)+ boot 序列;node / browser 同构。把原版客户端 Lua 跑起来的关键 shim |
| `packages/shared` | 前后端共享类型 |
| `packages/assets` | assets-manifest 生成(含 asio flist / MD5 算法) |
| `apps/gateway` | Node + TS 网关:WSS↔asio TCP、登录代理、reply requestId 回填 |
| `apps/web` | React + Vite 前端:wasmoon 集成、DOM fixed-stage 牌桌、Zustand store、SkinBank 路径解析 |

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

# 2) 同步原版 Lua + 美术到 apps/web/public/fk(从本地上游 FreeKill-release)
pnpm --filter @freekill-web/web sync-assets

# 3) 网关(ASIO_HOST 必填——WSL NAT IP 每次重启会变)
cd apps/gateway && ASIO_HOST=<asio-ip> node dist/index.js   # 默认 WSS :9528

# 4) 前端
pnpm --filter @freekill-web/web dev                          # 默认 :5174
```

> 改了 `packages/lua-native/lua/fkprelude.lua` 后必须重跑 `sync-assets`——浏览器加载的是 `apps/web/public/fk/` 下的副本。

## 上游参考(只读,不在本仓库)

`../freekill-asio`(服务端)、`../FreeKill-release`(资源 / 扩展包)、`../FreeKill-sourcecode`(协议 / QML 参考)。一切新代码进本仓库,上游三仓只读。

## 许可证与素材

代码以 **GPL-3.0-or-later** 开源(见 `LICENSE`)。WASM 路线会把整套 `freekill-core` / 扩展包 Lua 源码分发到浏览器,因此衍生前端 / 网关代码必须以 GPLv3 开源并提供完整对应源码与构建说明(实现计划 §11 R-GPL)。

**素材版权(R-ASSET)**:FreeKill 的武将立绘、卡图、音频等美术资源版权归原作者 / 各扩展包作者所有,**未授权不得公网分发**。本仓库**不包含**任何上游 Lua 源码或美术——它们仅在本地通过 `sync-assets` 落到被 git 忽略的 `apps/web/public/fk/`。公网发布前请自行核对各包许可证与素材来源。

## 致谢

- [FreeKill](https://github.com/Notify-ctrl/FreeKill) —— Notify 等,原版游戏与全部规则 Lua、美术资源。
- `freekill-asio` —— 本项目复用的 C++ 服务端。
