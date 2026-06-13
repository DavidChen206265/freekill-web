# Codex 工作流还原指南

本文用于把当前 FreeKill Web 的 Codex 工作流迁移到另一台设备。目标是迁移“怎么工作”的规则、脚本、项目记忆入口和裁剪后的 skill 集合;不复制完整业务仓库、上游游戏源码、美术资源、部署密钥或 VPS 本地运维脚本。

## 迁移包内容

迁移包名约定为 `freekill-web-codex-workflow-migration-20260613.tar.gz`。解压后应包含:

- `RESTORE.md`:本指南副本。
- `BUNDLE_MANIFEST.md`:迁移包清单。
- `root/AGENTS.md`:Codex 项目规则。
- `root/CLAUDE.md`:Claude Code 原工作流规则,用于交叉核对。
- `root/.codex/scripts/`:Codex 显式入口脚本。
- `root/.claude/scripts/project-state.mjs`:唯一事实快照生成器。
- `root/.claude/settings.json`:Claude SessionStart hook 映射参考。
- `root/.claude/skills/project-sync/SKILL.md`:原 `/sync` 工作流参考。
- `freekill-web/analysis/`:当前项目记忆入口,含 `PROJECT_STATE.md`、`PROGRESS.md`、`WEB_ONLY_ROADMAP.md`、实现计划与 Codex 工作流文档。
- `freekill-web/audit/`:完整还原审计底账。
- `codex-home/skills/`:当前裁剪后的 `~/.codex/skills` 快照。
- `codex-home/skill-repos/claude-skills.patch`:本机对第三方 skill 源仓库做过的 frontmatter 修补 diff。
- `metadata/`:仓库 HEAD、remote、skill 列表和校验信息。

不包含:

- `node_modules/`、构建产物、coverage。
- `apps/web/public/fk/`、`packages-upstream/`、上游美术/音频/包镜像等版权资源。
- `.claude/settings.local.json`、`.env*`、证书、私钥、生产数据库、VPS 部署脚本 `~/.freekill-deploy/deploy.sh`。
- 完整 `freekill-web`、`freekill-web-asio`、`freekill-asio`、`FreeKill-release`、`FreeKill-sourcecode` 仓库内容;这些应在目标机器按仓库/备份重新准备。

## 目标目录

默认目标布局与本机一致:

```text
/home/ubuntu/freekill/freekill-vps-deploy/
  AGENTS.md
  CLAUDE.md
  .codex/
  .claude/
  freekill-web/
  freekill-web-asio/
  freekill-asio/          # 只读参考
  FreeKill-release/       # 只读参考
  FreeKill-sourcecode/    # 只读参考
```

若目标机器使用其他路径,可以迁移,但另一个 Codex 首次接手时必须先确认当前工作目录就是部署根,并从该目录运行 `.codex/scripts/*`。

## 还原步骤

1. 准备业务仓库。

   ```bash
   mkdir -p /home/ubuntu/freekill/freekill-vps-deploy
   cd /home/ubuntu/freekill/freekill-vps-deploy
   git clone https://github.com/DavidChen206265/freekill-web.git freekill-web
   git clone https://github.com/DavidChen206265/freekill-web-asio.git freekill-web-asio
   ```

   同步或克隆只读参考仓库到同级目录: `freekill-asio/`、`FreeKill-release/`、`FreeKill-sourcecode/`。这些仓库只供源码/资源对照,不要在目标机器上直接修改。

2. 解压迁移包。

   ```bash
   mkdir -p /tmp/freekill-codex-workflow
   tar -xzf /path/to/freekill-web-codex-workflow-migration-20260613.tar.gz -C /tmp/freekill-codex-workflow
   cd /tmp/freekill-codex-workflow/freekill-web-codex-workflow-migration-20260613
   ```

3. 复制根工作流文件。

   ```bash
   rsync -a root/AGENTS.md root/CLAUDE.md /home/ubuntu/freekill/freekill-vps-deploy/
   rsync -a root/.codex/ /home/ubuntu/freekill/freekill-vps-deploy/.codex/
   rsync -a root/.claude/ /home/ubuntu/freekill/freekill-vps-deploy/.claude/
   ```

4. 恢复 Codex skills。

   ```bash
   mkdir -p ~/.codex
   rsync -a --delete codex-home/skills/ ~/.codex/skills/
   ```

   如果需要重建第三方源仓库:

   ```bash
   mkdir -p ~/.codex/skill-repos
   git clone https://github.com/alirezarezvani/claude-skills.git ~/.codex/skill-repos/claude-skills
   cd ~/.codex/skill-repos/claude-skills
   git checkout 4a3c05b6
   git apply /tmp/freekill-codex-workflow/freekill-web-codex-workflow-migration-20260613/codex-home/skill-repos/claude-skills.patch
   ```

   源仓库不是运行必需项;运行时以 `~/.codex/skills` 快照为准。

5. 同步项目记忆入口。

   如果目标 `freekill-web` 已是最新仓库,通常不需要覆盖 `analysis/` 和 `audit/`。若目标仓库缺少这些文件或版本落后,再执行:

   ```bash
   rsync -a freekill-web/analysis/ /home/ubuntu/freekill/freekill-vps-deploy/freekill-web/analysis/
   rsync -a freekill-web/audit/ /home/ubuntu/freekill/freekill-vps-deploy/freekill-web/audit/
   ```

6. 验证工作流。

   ```bash
   cd /home/ubuntu/freekill/freekill-vps-deploy
   node .codex/scripts/session-start.mjs
   node .codex/scripts/select-skill.mjs "修复 freekill-web 前端测试失败"
   ```

   期望结果:

   - `PROJECT_STATE.md` 被重建。
   - `select-skill.mjs` 能返回相关 skill,或明确输出 `No matching installed skills found.`。
   - 新 Codex 读取 `AGENTS.md` 后,直接给用户的回复使用简体中文。

7. 验证 skill frontmatter。

   ```bash
   python3 - <<'PY'
   import pathlib, yaml
   errors = []
   for path in pathlib.Path.home().joinpath('.codex/skills').rglob('SKILL.md'):
       text = path.read_text(encoding='utf-8')
       if text.startswith('---'):
           end = text.find('\n---', 3)
           if end != -1:
               try:
                   yaml.safe_load(text[3:end]) or {}
               except Exception as exc:
                   errors.append((str(path), str(exc)))
   print(f'checked={len(list(pathlib.Path.home().joinpath(".codex/skills").rglob("SKILL.md")))} errors={len(errors)}')
   for path, err in errors:
       print(path, err)
   raise SystemExit(1 if errors else 0)
   PY
   ```

## 另一个 Codex 的接手规则

新 Codex 每次进入项目后都按以下顺序执行:

1. 运行 `node .codex/scripts/session-start.mjs`。
2. 读取 `freekill-web/analysis/PROJECT_STATE.md`、`WEB_ONLY_ROADMAP.md`、`PROGRESS.md`。
3. 对非平凡任务运行 `node .codex/scripts/select-skill.mjs "任务描述"`;若使用某个 skill,必须先完整读取其 `SKILL.md`。
4. 涉及 UI/逻辑还原时,先读对应 audit Phase、QML/Lua 源码和实现计划相关节。
5. 只修改 `freekill-web/` 与 `freekill-web-asio/`;上游参考仓库只读。
6. 修复还原缺口后必须回写对应 audit 条目和 `SUMMARY.md` 计数。
7. 改了代码、计划、风险或 audit 后,收尾前运行 `node .codex/scripts/sync.mjs "一句话摘要"` 并手动更新判断层文件。
8. 自验通过后本地 commit;`git push` 与部署必须先得到用户明确允许。

## 常见问题

- 如果 `session-start.mjs` 找不到 `.claude/scripts/project-state.mjs`,说明根目录文件没有复制完整。
- 如果 skill 选择器报 `ENOENT ~/.codex/skills`,先按步骤 4 恢复 skills 快照。
- 如果 `PROJECT_STATE.md` 显示只读参考仓库缺失,补齐 `freekill-asio/`、`FreeKill-release/`、`FreeKill-sourcecode/` 后重新运行 session-start。
- 如果目标机器没有上游美术资源,不要从迁移包找;按项目资源同步脚本和合法来源重新生成 `apps/web/public/fk/`。
