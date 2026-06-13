# Codex 工作流转换分析

本文记录 2026-06-13 对 VPS 上 Claude Code `freekill-web` 工作流的分析、1:1 转换和 Codex 侧优化。

## Claude 工作流构成

Claude 侧不是单一提示词,而是以下组件协同:

- `CLAUDE.md`:项目边界、输出语言、Git/audit 规则、实现纪律。
- `.claude/settings.json`:SessionStart hook,在 startup/resume/clear 时运行 `.claude/scripts/project-state.mjs`。
- `.claude/skills/project-sync/SKILL.md`:`/sync` 工作流,先重建 `PROJECT_STATE.md`,再由 AI 更新 `PROGRESS.md`、计划、风险和 audit。
- `.claude/scripts/project-state.mjs`:确定性事实层生成器,扫描自有代码、只读参考仓库存在性、服务端 fork HEAD 和目录结构。
- `freekill-web/analysis/PROJECT_STATE.md`:机器生成事实快照,禁止手改。
- `freekill-web/analysis/PROGRESS.md`:人工/AI 维护的当前阶段、待办、决策和变更日志。
- `freekill-web/audit/`:459 条还原审计底账,修复后必须回写。
- Claude memory:沉淀了关键经验,如 VM 快照消费、QML 逐行移植、wasmoon/Vite 陷阱、Web-only fork 边界等。

## 1:1 转换到 Codex

| Claude 机制 | Codex 对应 |
| --- | --- |
| `CLAUDE.md` 项目工作准则 | `AGENTS.md` |
| SessionStart hook 自动运行事实快照 | `node .codex/scripts/session-start.mjs` |
| `/sync` slash command | `node .codex/scripts/sync.mjs "摘要"` + Codex 手动更新判断层 |
| `.claude/scripts/project-state.mjs` | 继续作为唯一事实生成器,由 Codex wrapper 调用 |
| `PROJECT_STATE.md` / `PROGRESS.md` 双层状态 | 原样保留 |
| audit 修复闭环 | 原样保留并写入 `AGENTS.md` |
| push/deploy 门禁 | 原样保留 |
| Claude memory | 不搬私有日志;把可执行规则并入 `AGENTS.md`,历史判断继续以 `PROGRESS.md`/`audit/` 为入口 |

## Codex 侧优化

- 不复制事实快照脚本,避免 Claude/Codex 两套扫描逻辑漂移。
- 把会话开始和收尾变成显式命令,适配 Codex 当前没有项目级 hook/slash command 的现实。
- `AGENTS.md` 只保留执行规则和硬约束,长历史继续放在 `PROGRESS.md`,减少未来上下文噪声。
- 保留强门禁:Codex 当前 shell 权限宽,所以 push、部署、改只读参考仓库都必须显式确认。
- 把验证基线写成按风险选择的命令集合,避免每次从历史变更日志里反查。

## Codex 执行清单

1. 进入 `/home/ubuntu/freekill/freekill-vps-deploy` 后运行 `node .codex/scripts/session-start.mjs`。
2. 读取 `PROJECT_STATE.md` 与 `PROGRESS.md`。
3. 按任务读取 `audit/SUMMARY.md`、具体 Phase、实现计划和对应 QML/Lua 源码。
4. 先验证事实再改代码;优先移植原版机制,不凭局部猜测自创。
5. 改完跑匹配风险的 typecheck/build/test/VM/E2E。
6. 若改了代码、计划、风险或 audit,运行 `node .codex/scripts/sync.mjs "摘要"` 并更新判断层。
7. 自验通过后本地 commit;push 和部署等待用户明确许可。
