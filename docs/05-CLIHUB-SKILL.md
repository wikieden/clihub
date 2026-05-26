# clihub — Claude Code 内的 Skill 形态

## 定位

`clihub` 不止是 CLI 工具，还是装到 Claude Code 内的 skill。用户在 Claude Code 里直接说「clihub 帮我装 tavily」，无需切回终端。

## 安装路径

```
~/.claude/skills/clihub/
├── SKILL.md
├── scripts/
│   ├── add-mcp.sh
│   ├── add-permission.sh
│   ├── install-skill.sh
│   ├── uninstall-skill.sh
│   ├── set-model.sh
│   ├── set-hook.sh
│   ├── show-config.sh
│   ├── list-skills.sh
│   ├── catalog.sh
│   ├── backup.sh
│   └── restore.sh
└── data/
    └── presets.json
```

```
~/.claude/commands/clihub.md      # /clihub slash command
```

## SKILL.md 模板

```markdown
---
name: clihub
description: |
  Claude Code 配置管家。可改 settings.json / permissions / hooks /
  MCP servers / statusline，装卸 skill，切模型 / effort，备份回滚。
  触发词：clihub / 改配置 / 加权限 / 装 MCP / 装 skill / 改 statusline /
  切模型 / 备份配置
metadata:
  type: configuration
  version: 0.1.0
allowed-tools: [Bash, Read]
---

# clihub — Claude Code 配置管家

## 核心准则

1. 所有写操作走 scripts/ 下脚本，不让自己直接 Edit settings.json
2. 改前必读现状 (show-config.sh)，改后必验证
3. 破坏性操作要用户明确确认
4. 报告改动用人话，列文件路径让用户能验证

## 工作流

用户说 "改配置 X" → 你按以下顺序：

1. 调 `bash scripts/show-config.sh --json` 看现状
2. 用人话总结当前配置 + 即将改什么
3. 用户确认（除非用户说了 "直接改" / "yes"）
4. 调对应 scripts/ 脚本（自带备份）
5. 报告改动 + 备份路径

## 子能力路由

| 用户意图 | 调用脚本 |
|---|---|
| "加权限 X" | scripts/add-permission.sh "$X" |
| "装 MCP X" | scripts/add-mcp.sh "$X" "$cmd" |
| "卸 MCP X" | scripts/remove-mcp.sh "$X" |
| "装 skill X" | scripts/install-skill.sh "$X" |
| "卸 skill X" | scripts/uninstall-skill.sh "$X" |
| "切到 Opus / Sonnet / Haiku" | scripts/set-model.sh <name> |
| "设置 hook" | scripts/set-hook.sh <event> <cmd> |
| "改 statusline 阈值" | scripts/statusline-tweak.sh ... |
| "备份" | scripts/backup.sh |
| "回滚到 X" | scripts/restore.sh <timestamp> |
| "看现状" | scripts/show-config.sh |
| "可装啥" | scripts/catalog.sh |

## 脚本协议

所有脚本：

- 接 `--json` flag 返结构化输出
- exit 0 = 成功，非零 = 失败带 stderr 错误
- 自动备份到 `~/.clihub/backups/<ts>/`
- 失败自动回滚不污染配置

你拿 JSON 后用人话告知用户结果。

## 不要做的事

- 不要直接 Edit ~/.claude/settings.json (用脚本)
- 不要 silent 失败 — 任何脚本非零退出都要报告
- 不要在用户没确认时做破坏性改动 (skill remove / restore)
- 不要假设用户记得备份在哪 — 主动告知
```

## scripts/ 实现策略

所有 shell 脚本是 CLI 的薄壳：

```bash
#!/usr/bin/env bash
# scripts/add-mcp.sh
exec clihub mcp add "$@" --json
```

CC skill 和 CLI 行为完全一致。

**fallback**：若 `clihub` CLI 未装，脚本退而调内嵌的 portable 实现（`scripts/_inline/*.sh` 纯 bash + jq）。

```bash
#!/usr/bin/env bash
# scripts/add-mcp.sh
if command -v clihub >/dev/null 2>&1; then
    exec clihub mcp add "$@" --json
fi
exec bash "$(dirname "$0")/_inline/add-mcp.sh" "$@"
```

## /clihub slash 命令

```markdown
---
description: 打开 clihub 配置管家菜单
argument-hint: "[子命令] 可选, 如: 装 MCP codegraph / 看配置 / 备份"
---

请用 clihub skill 处理以下请求：$ARGUMENTS

若 $ARGUMENTS 为空，先调 scripts/show-config.sh 给我看当前配置摘要，
然后问我想改什么（用清单形式）。
```

## 与 CLI 的关系

| 路径 | 触发方式 | 实际执行 |
|---|---|---|
| 终端 `clihub mcp add X cmd` | 直接 | `@clihub/cli` |
| Claude 内说 "clihub 加 MCP X" | LLM 自动识别 | `scripts/add-mcp.sh` → `clihub mcp add X` |
| Claude 内 `/clihub 加 MCP X` | slash command | 同上 |

所有路径最终归于 CLI 实现。

## 安全护栏（skill 端）

1. **白名单工具**：`allowed-tools: [Bash, Read]` 限制 LLM 不能直接 Edit
2. **脚本路径硬编码**：SKILL.md 写死 `bash scripts/<name>.sh`
3. **写操作前必读**：show-config.sh → 用户确认 → 才写
4. **破坏性词汇拦截**：用户说 "全部删除 / 清空配置" 时要求二次确认 + 强制备份

## 测试

```bash
bash scripts/_test/run-all.sh
```

各脚本传 mock JSON / 临时 HOME，验证 idempotent + 备份生成 + 失败回滚。
