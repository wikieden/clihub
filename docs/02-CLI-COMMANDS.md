# CLI 命令规约

## 调用形态

```
clihub                  # 无参 → 启动 TUI 主菜单
clihub <cmd> [args] [flags]
```

## 全局 flag

| flag | 作用 |
|---|---|
| `--lang <code>` | 临时切换语言 |
| `--yes, -y` | 跳过所有确认 |
| `--dry-run` | 仅预览改动，不落盘 |
| `--json` | 机器可读输出 |
| `--quiet, -q` | 仅打印错误 |
| `--verbose, -v` | 详细日志 |
| `--profile <name>` | 切换 clihub profile |

## 子命令组

### tool — 管理 AI CLI 工具

```bash
clihub tool list
clihub tool install <id>
clihub tool uninstall <id>
clihub tool update [id]
clihub tool doctor [id]
clihub tool configure <id>
```

语义糖（向后兼容）：

```bash
clihub install-cc       ≡ clihub tool install claude-code
clihub doctor           ≡ clihub tool doctor
clihub login            ≡ clihub tool configure claude-code → login flow
```

### config — 配置读写

```bash
clihub config show [tool]
clihub config get <key> [--tool]
clihub config set <key> <value> [--tool]
clihub config edit [tool]
clihub config validate [tool]
```

### mcp — MCP server 增删

```bash
clihub mcp list [--tool]
clihub mcp add <name> <cmd> [--args ...] [--env K=V ...]
clihub mcp remove <name>
clihub mcp enable <name>
clihub mcp disable <name>
```

### perm — 权限白名单

```bash
clihub perm list
clihub perm add "Bash(git status)"
clihub perm remove <pattern>
clihub perm scan
```

### skill — Claude Code skill 管理

```bash
clihub skill list
clihub skill catalog
clihub skill search <kw>
clihub skill install <name|preset|url>
clihub skill remove <name>
clihub skill update [name]
clihub skill info <name>
clihub skill sync
```

### hook — 事件钩子

```bash
clihub hook list
clihub hook add <event> <command>
clihub hook remove <id>
clihub hook templates
clihub hook apply <template-id>
```

`event` ∈ `PreToolUse | PostToolUse | UserPromptSubmit | SessionStart | Stop | SubagentStop | Notification`

### statusline

```bash
clihub statusline install
clihub statusline uninstall
clihub statusline tweak
clihub statusline preview
```

### model / effort

```bash
clihub model set <opus|sonnet|haiku>
clihub effort set <low|medium|high|max>
clihub model list
```

### backup / restore

```bash
clihub backup
clihub backup list
clihub restore <timestamp>
clihub rollback
```

### lang — 语言

```bash
clihub lang list
clihub lang set <code>
clihub lang detect
```

### preset — 预设组合

```bash
clihub preset list
clihub preset apply <name>
clihub preset show <name>
clihub preset save <name>
```

### plugin — 第三方插件

```bash
clihub plugin list
clihub plugin add <npm-pkg>
clihub plugin remove <name>
clihub plugin search <kw>
```

### self / catalog

```bash
clihub self-update
clihub self uninstall
clihub catalog sync
clihub catalog show
clihub version
```

## 退出码约定

| 码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 普通错误 |
| 2 | 用户取消 |
| 3 | 依赖缺失（jq / node / git） |
| 4 | 网络错误 |
| 5 | 配置文件损坏，已自动回滚 |
| 10 | dry-run 检测到会有破坏性改动 |

## 输出约定

- 普通：彩色人类可读，符号 `✓ ✗ ⚠ ℹ`
- `--json`：单 JSON 对象一行（或多行，每行一对象）
- `--quiet`：仅错误到 stderr
- `--verbose`：进度细节到 stderr，结果到 stdout
