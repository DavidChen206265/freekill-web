# 移动端 PWA 适配计划

> 记录时间: 2026-06-13。范围经用户批准后执行:登录页 PWA 下载入口 + 移动端已安装 PWA 的对局 Stage 适配。非 PWA 手机浏览器地址栏场景不纳入本轮。

## 目标

1. 登录页提供 PWA 安装入口,并提示移动端只有安装 PWA 后才能获得正常游戏体验。
2. 在不改变桌面宽屏当前 UI 行为的前提下,让移动端 PWA 横屏运行时完整显示 fixed-stage。
3. 保留 `STAGE_W=1200`、`STAGE_H=540` 和内部绝对坐标体系,只调整外层 viewport/scale 计算。

## 实现切片

### A. 登录页安装入口

- 新增 PWA install hook,监听 `beforeinstallprompt`、`appinstalled`,判断 `display-mode: fullscreen/standalone/minimal-ui` 与 iOS `navigator.standalone`。
- 登录页显示:
  - 可安装时:安装 PWA 按钮,点击触发原生安装 prompt。
  - 已安装时:显示已在 PWA 模式运行。
  - iOS 或无安装 prompt 时:显示浏览器菜单“添加到主屏幕”的手动提示。
- 移动端提示:手机/平板请安装 PWA 后横屏运行,否则对局界面可能无法正常显示。

### B. Stage 移动 PWA 适配

- 桌面/非 PWA 保持原路径:`scale = min(window.innerWidth / 1200, window.innerHeight / 540)`。
- 移动 PWA 路径才启用 viewport 修正:
  - 优先读取 `window.visualViewport.width/height`;
  - 回退 `document.documentElement.clientWidth/clientHeight`;
  - 监听 `resize`、`orientationchange`、`visualViewport.resize/scroll`;
  - 旋转后做短延迟二次采样,避免中间态尺寸。
- `Stage` 外层在移动 PWA 下使用测得的 viewport width/height,避免仅靠 `inset:0` 时被浏览器实现差异影响。

### C. 高 popup

- 本轮优先不做大改。已有 `Portal + maxHeight + overflowY` 基本可滚动。
- 若执行中发现低风险,再将 `vh` 补为 `dvh` fallback;否则留到后续 UI 适配切片。

## 风险

- iOS PWA 不保证完全遵循 manifest `orientation`/`fullscreen`。
- `beforeinstallprompt` 不支持 iOS,只能给手动安装指引。
- Stage 适配必须严格限制在移动 PWA 条件,否则可能影响桌面宽屏现状。

## 验证

- 自动: `pnpm --filter @freekill-web/web test`、`typecheck`、`build`。
- 单测:桌面宽屏 scale 与旧逻辑一致;移动 PWA 使用 visualViewport 尺寸;普通手机浏览器仍不走移动 PWA 适配。
- 手测:桌面宽屏进局不变;手机安装 PWA 后横屏进局 fixed-stage 完整显示;非 PWA 手机浏览器登录页出现安装提示。
