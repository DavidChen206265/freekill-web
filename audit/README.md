# FreeKill-Web 还原审计报告

逐行对照原版 FreeKill（git `37f8c12` / v0.5.20）与 freekill-web 实现的完整还原审计。**本目录内容由本次审计整体生成，替换了所有旧报告（旧报告已存 GitHub）。**

## 阅读顺序
1. **`SUMMARY.md`** — 先读。全局计数（459 条：未还原 160 / 简化 124 / 还原错误 10 / 完全 165）、10 条还原错误清单、按对局影响排序的高优先级缺口、完全还原的核心系统。
2. **`AUDIT_PLAN.md`** — 审计方法论：范围边界（客户端+协议契约面）、**关键架构事实**（web 用 wasmoon 跑原版 client.lua，仅 QML→TS 渲染层被重新实现）、记录格式、自检标准。
3. **`00-phase0-inventory.md`** — 命令契约权威清单（70 个 server→client、42 个 notifyUI）+ 架构发现。
4. **16 份 Phase 报告**（逐条 状态/原版位置/web 位置/差异）。

## Phase 索引

| 文件 | 主题 | 条数 | 缺陷重点 |
|---|---|---:|---|
| `A-startup-login.md` | 启动/全局 shell/登录连服 | 27 | 服务器列表、退出闭环、全局壳页面 |
| `B-lobby.md` | 大厅/建房/筛选/个人设置/包管理 | 44 | FilterRoom、建房子系统、个人设置族 |
| `C-waiting-room-shell.md` | 等待房/房间外壳 | 30 | 游戏内菜单 overlay、投降、WaitingPhoto |
| `D-photo.md` | 玩家位 Photo 全栈 | 67 | LimitSkillArea、行动者高亮、HandcardViewer |
| `E-cards.md` | 手牌/卡牌/牌桌牌堆 | 38 | 拖拽/双击出牌、选将牌属性 |
| `F-skills.md` | 技能区/技能交互控件 | 19 | 限定/觉醒/转换技、prelight、locked/times |
| `G-request-boxes.md` | 请求弹窗（21 个 Box） | 23 | detailed 描述丢失、CardNamesBox 降级（0 缺失/0 错误） |
| `H-animation.md` | 动画/特效/聊天动画 | 27 | 大招动画、送礼动画、状态光环 |
| `I-chat-log-timer.md` | 聊天/弹幕/日志/倒计时 | 18 | 弹幕组件、旁观聊天、头像气泡 |
| `J-overview-detail.md` | 总览/详情/筛选/战绩页 | 26 | 整个页面族零实现（23 未还原） |
| `K-widgets-base.md` | 基础控件层（Widgets+Base） | 34 | 设置/偏好控件族、Config 简化 |
| `L-cheat-debug.md` | 作弊/调试面板（Cheat） | 19 | Cheat 容器、查看类面板、自由选将 |
| `M-marks.md` | 角色推测/mark/标记系统 | 17 | 牌堆标记计数、SetBanner、MarkArea |
| `N-assets-pipeline.md` | 资源/皮肤/音频/字体/i18n | 34 | 美化包、双将立绘、内嵌字体 |
| `O-content-packs.md` | 标/标卡/军争客户端呈现 | 11 | 全部完全还原（11/11） |
| `P-protocol-contract.md` | 协议契约一致性 | 25 | 透传层完整；6 项上报无前端入口 |

## 关键结论
- **协议透传与标准三包呈现是健壮的**：P 阶段确认 gateway 零丢弃零改写，O 阶段确认标准三包 11/11 完全还原。缺陷集中在 **UI 表现层** 而非数据/协议层。
- **最危险的 10 条「还原错误」**见 SUMMARY §3——这些是用户会看到错误（非空白）的地方。
- **对局功能性缺口**（投降/托管/踢人/出牌交互/限定技显示）见 SUMMARY §4.1，应优先于观感类缺口。
