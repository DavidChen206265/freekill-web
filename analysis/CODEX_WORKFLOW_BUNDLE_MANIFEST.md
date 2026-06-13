# Codex 工作流迁移包清单

生成日期:2026-06-13。

## 包名

`freekill-web-codex-workflow-migration-20260613.tar.gz`

## 目的

把 FreeKill Web 在本机的 Codex 工作流迁移到另一台设备,包括项目规则、会话脚本、事实快照生成器、进度/路线图/audit 入口和裁剪后的 Codex skills。迁移包不是业务源码发行包,也不是部署备份。

## 应包含

- `RESTORE.md`:`freekill-web/analysis/CODEX_WORKFLOW_RESTORE.md` 的包内副本。
- `BUNDLE_MANIFEST.md`:本文件的包内副本。
- `root/AGENTS.md`
- `root/CLAUDE.md`
- `root/.codex/scripts/session-start.mjs`
- `root/.codex/scripts/sync.mjs`
- `root/.codex/scripts/select-skill.mjs`
- `root/.claude/scripts/project-state.mjs`
- `root/.claude/settings.json`
- `root/.claude/skills/project-sync/SKILL.md`
- `freekill-web/analysis/CODEX_WORKFLOW.md`
- `freekill-web/analysis/CODEX_WORKFLOW_RESTORE.md`
- `freekill-web/analysis/CODEX_WORKFLOW_BUNDLE_MANIFEST.md`
- `freekill-web/analysis/PROJECT_STATE.md`
- `freekill-web/analysis/PROGRESS.md`
- `freekill-web/analysis/WEB_ONLY_ROADMAP.md`
- `freekill-web/analysis/freekill_web_implementation_plan.md`
- `freekill-web/audit/` 全目录
- `codex-home/skills/`:当前裁剪后的 `~/.codex/skills` 快照
- `codex-home/skill-repos/claude-skills.patch`:第三方 skill 源仓库本机修补 diff
- `metadata/repo-heads.txt`
- `metadata/skill-list.txt`
- `metadata/package-tree.txt`
- `metadata/sha256sums.txt`

## 明确不包含

- `node_modules/`、构建产物、coverage、日志。
- `.env*`、证书、私钥、数据库、VPS 手动部署脚本。
- `.claude/settings.local.json`,因为它是本机权限 allowlist,不是项目工作流事实。
- `apps/web/public/fk/`、`packages-upstream/`、FreeKill 上游美术/音频/包镜像。
- 完整业务源码仓库;目标机器应通过 git clone 或已有备份准备。

## 还原入口

另一个 Codex 应先读包内 `RESTORE.md`,按步骤复制 `root/` 与 `codex-home/skills/`,再运行:

```bash
cd /home/ubuntu/freekill/freekill-vps-deploy
node .codex/scripts/session-start.mjs
node .codex/scripts/select-skill.mjs "修复 freekill-web 前端测试失败"
```
