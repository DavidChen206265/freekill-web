# freekill-web

把 FreeKill(三国杀)做成网页版:复用 `freekill-asio` 作唯一游戏服务端,浏览器用
**wasmoon 托管原版客户端 Lua**(规则/状态/判定不重写),React + DOM fixed stage 只
渲染,Node 网关做 WSS↔TCP 协议适配。

完整方案见 `../分析/freekill_web_implementation_plan.md`,进度见 `../分析/PROGRESS.md`。

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
```

## 包结构

| 包 | 状态 | 职责 |
| --- | --- | --- |
| `packages/lua-native` | **写实** | 客户端 `fk.*` 原生面(fkprelude + JS 叶子函数)+ boot 序列。node/browser 同构。已由 spike 验证完整。 |
| `packages/protocol` | **写实** | CBOR packet 编解码(裸帧增量解码、字节串 0x40、Qt-zlib)、packet 类型、zod schema。 |
| `packages/shared` | 占位 | 前后端共享类型。 |
| `packages/assets` | 占位 | assets-manifest 生成(含 asio flist/MD5 算法)。 |
| `apps/web` | 占位 | React + Vite 前端(含 wasmoon 集成)。 |
| `apps/gateway` | 占位 | Node + TS 网关(M0:asio TCP ↔ WSS)。 |

## 开发

```sh
pnpm install
pnpm -r build      # 全包构建
pnpm -r test       # 全包测试
pnpm -r typecheck  # 类型检查
```

## 许可证

GPLv3(`LICENSE`)。WASM 路线把整套 freekill-core/扩展包 Lua 源码分发到浏览器,
衍生前端/网关代码须以 GPLv3 开源(见实现计划 §11 R-GPL)。

## 上游只读参考(不在本仓库)

`../freekill-asio`(服务端)、`../FreeKill-release`(资源/扩展包)、
`../FreeKill-sourcecode`(协议/QML 参考)。一切新代码进本仓库,上游三仓只读。
