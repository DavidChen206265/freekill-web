# PROJECT_STATE(自动生成 · 请勿手改)

> 由 `.claude/scripts/project-state.mjs` 在每次会话开始与文件改动后自动重建。
> 人工维护的进度/决策记录见 `PROGRESS.md`。

最后更新: 2026-06-13 05:47:24　·　跟踪文件数: 228

## 自上次重建以来的改动

- 修改 2: freekill-web/analysis/CODEX_WORKFLOW.md, freekill-web/analysis/PROGRESS.md

## 上游参考仓库(只读,不跟踪改动)

- ✓ freekill-asio
- ✓ FreeKill-release
- ✓ FreeKill-sourcecode
- freekill-core Lua 文件数: 295

## 服务端 fork(freekill-web-asio,独立仓库)

- ✓ freekill-web-asio(origin: DavidChen206265/freekill-web-asio,upstream: Qsgs-Fans/freekill-asio diff 基线)
- HEAD: aa89286 W1-1 A1 fix: lobby takeover must send ErrorDlg so the old client stops reconnecting

## 项目文件结构(自有代码)

```text
📁 freekill-web
  📁 analysis
    CODEX_WORKFLOW.md
    freekill_web_implementation_plan.md
    PROGRESS.md
    PROJECT_STATE.md
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
    00-inventory-client-lua.csv
    00-inventory-notifyui.csv
    00-inventory-qml.csv
    00-inventory-web.csv
    00-phase0-inventory.md
    A-startup-login.md
    AUDIT_PLAN.md
    B-lobby.md
    C-waiting-room-shell.md
    D-photo.md
    E-cards.md
    F-skills.md
    G-request-boxes.md
    H-animation.md
    I-chat-log-timer.md
    J-overview-detail.md
    K-widgets-base.md
    L-cheat-debug.md
    M-marks.md
    N-assets-pipeline.md
    O-content-packs.md
    P-protocol-contract.md
    README.md
    SUMMARY.md
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
    vps-cache-forensics.sh
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
