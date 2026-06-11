# PROJECT_STATE(自动生成 · 请勿手改)

> 由 `.claude/scripts/project-state.mjs` 在每次会话开始与文件改动后自动重建。
> 人工维护的进度/决策记录见 `PROGRESS.md`。

最后更新: 2026-06-11 06:03:11　·　跟踪文件数: 2408

## 自上次重建以来的改动

- 修改 3: freekill-web/analysis/PROGRESS.md, freekill-web/docker/vps-audio-forensics.sh, freekill-web/docker/VPS_UPDATE_GUIDE.md

## Spike 验证状态

- ✅ gate1 引擎启动
- ✅ gate2 ClientInstance
- ✅ gate3 增量展开+QML查询
- ✅ gate4 ui_emu 请求循环
- 计时(ms): {"boot":59,"client":4,"total":173}
- 引擎内容: {"skills":132,"cards":160,"generals":29,"packages":4,"modes":1}
- 来源: freekill-web-spike/spike-result.json (2026-06-03T07:44:04.076Z)

## 上游参考仓库(只读,不跟踪改动)

- ✓ freekill-asio
- ✓ FreeKill-release
- ✓ FreeKill-sourcecode
- freekill-core Lua 文件数: 295

## 服务端 fork(freekill-web-asio,独立仓库)

- ✓ freekill-web-asio(origin: DavidChen206265/freekill-web-asio,upstream: Qsgs-Fans/freekill-asio diff 基线)
- HEAD: ebcf6a7 W1-1 A1: same-account lobby re-login takes over instead of deadlocking

## 项目文件结构(自有代码)

```text
📁 freekill-web-spike
  📁 src
    fknatives.mjs
    fkprelude.lua
    gate4_playcard.lua
    native_audit.mjs
    perf_run.mjs
    perf_spike.mjs
    replay_spike.mjs
    server_fkprelude.lua
    server_spike.mjs
    spike.mjs
    vm_run.mjs
    vm_spike.mjs
  native-audit.json
  package-lock.json
  package.json
  perf-result.json
  README.md
  spike-result.json
  vm-result.json
📁 freekill-web
  📁 analysis
    freekill_web_implementation_plan.md
    PROGRESS.md
    PROJECT_STATE.md
    W0-2_plan.md
    W1-1_plan.md
    WEB_ONLY_ROADMAP.md
  📁 apps
    📁 gateway
      📁 scripts
      📁 src
      📁 test
      package.json
      tsconfig.json
    📁 web
      📁 assets
      📁 public
      📁 scripts
      📁 src
      📁 test
      index.html
      package.json
      tsconfig.json
      vite.config.ts
  📁 audit
    freekill-web-independent-audit-plan.md
    phase1-startup-global-audit.md
    phase2-network-protocol-audit.md
    phase2b-lobby-room-command-audit.md
    phase2c-task-rpc-vm-replay-audit.md
    phase2d-room-notify-ui-audit.md
    phase3-lobby-common-pages-audit.md
    phase4-waiting-room-shell-audit.md
    phase5-table-ui-components-audit.md
    phase6-lua-package-code-audit.md
    phase7-assets-audio-font-path-audit.md
    phase8-replay-record-debug-test-tooling-audit.md
    phase9-overview-detail-filter-pages-audit.md
    source-assets-inventory.csv
    source-cpp-inventory.csv
    source-lua-inventory.csv
    source-packages-code-inventory.csv
    source-ui-qml-inventory.csv
    web-apps-code-inventory.csv
    web-packages-code-inventory.csv
    web-public-fk-inventory.csv
  📁 docker
    asio-entrypoint.sh
    asio.Dockerfile
    caddy.Dockerfile
    Caddyfile
    docker-compose.yml
    dockerignore.repo-root
    freekill.server.config.json
    gateway.Dockerfile
    README.md
    VPS_UPDATE_GUIDE.md
    vps-audio-forensics.sh
  📁 packages
    📁 assets
      📁 scripts
      📁 src
      📁 test
      package.json
      tsconfig.json
    📁 lua-native
      📁 lua
      📁 src
      📁 test
      package.json
      tsconfig.json
    📁 protocol
      📁 src
      📁 test
      package.json
      tsconfig.json
    📁 shared
      📁 src
      📁 test
      package.json
      tsconfig.json
  📁 scripts
    wsl-build-fork.sh
    wsl-clean-asio-pkgs.sh
    wsl-fork-foreground.sh
    wsl-probe-deps.sh
    wsl-run-asio.sh
    wsl-run-fork.sh
    wsl-w0-3-scenario.sh
  LICENSE
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  README.md
  tsconfig.base.json
```
