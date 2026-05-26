# 安全与备份

## 原则

1. 所有写操作前自动备份
2. dry-run 一等公民
3. rollback 一键复原
4. 危险操作要二次确认
5. 不在终端泄漏密钥

## 备份策略

### 触发时机

| 操作 | 备份范围 |
|---|---|
| `mcp add/remove` | 该工具配置文件 |
| `perm add/remove` | settings.json |
| `skill install/remove` | 各目标工具的 skill 目录 + 配置 |
| `hook add/remove` | settings.json |
| `tool install` | 装前无需备份 |
| `tool uninstall` | 该工具全部配置目录 |
| `preset apply` | 涉及的所有文件 |
| `restore` | 当前状态再备一份 |

### 存储

```
~/.clihub/backups/
├── 20260526-110530-mcp-add-codegraph/
│   ├── meta.json            # { op, args, files, timestamp(ISO YYYY-MM-DDTHH:MM:SSZ) }
│   ├── claude-settings.json
│   └── ...
├── 20260526-111234-skill-install-tavily/
│   ├── meta.json
│   ├── claude-skills-snapshot.tar.gz
│   └── codex-snapshot.tar.gz
└── ...
```

meta.json 字段：

- `op` — 操作类型 ("mcp.add" / "skill.install" 等)
- `args` — 用户传的参数
- `files` — 改动文件清单
- `timestamp` — ISO 8601 UTC
- `tool` — 影响的 ToolProvider id
- `clihub_version`

### 滚动策略

默认保留 30 份，超出删最旧。`clihub config set backup.retain 100` 可调。

```bash
clihub backup list
clihub backup show <ts>
clihub backup prune --keep 20
```

## Restore / Rollback

```bash
clihub rollback                    # 撤上一次
clihub restore <timestamp>
clihub restore --interactive
```

实现：

```
1. 读 meta.json 知道改了哪些文件
2. 备当前状态
3. 反向应用：恢复文件 / 撤改 / 反 install
4. 验证: 各工具 doctor 通过
5. 写日志 ~/.clihub/logs/restore-<ts>.log
```

## Dry-run

```bash
clihub --dry-run skill install tavily
```

输出：

```
[dry-run] would create directories:
  + ~/.claude/skills/tavily/
  + ~/.codex/skills/tavily/
[dry-run] would write files:
  + ~/.claude/skills/tavily/SKILL.md  (4.2 KB)
  + ~/.codex/prompts/tavily.md  (340 B)
[dry-run] would append to ~/.codex/AGENTS.md:
  + - /tavily — Tavily web search
[dry-run] no backups created (dry-run mode)
[dry-run] exit 0 (no changes applied)
```

所有 adapter 必须支持 `dryRun: boolean` 参数。

## 危险操作分级

| 级 | 例 | 行为 |
|---|---|---|
| 低 | 看配置、列 skill | 直接执行 |
| 中 | 加 MCP / skill / perm | `--yes` 跳过，否则提示 |
| 高 | 卸载工具、删多个 skill | 强制二次确认，`--yes` 也要 `--force` |
| 极高 | restore、tool uninstall claude-code | 总弹 confirm + 显示影响 + 备份提示 |

## API key / 密钥处理

```bash
clihub env set TAVILY_API_KEY "..."     # ~/.clihub/env (mode 0600)
clihub env list                          # 显示 key 名, 值掩码
clihub env get TAVILY_API_KEY            # 显示完整值, 提示用户确认
clihub env unset TAVILY_API_KEY
```

- 默写到 `~/.clihub/env` (mode 0600，仅 owner 读)
- 装 skill 提示需要哪些 env，缺则交互填
- 不把密钥写到 settings.json / shell rc
- 装 MCP 用 env 引用：`{ "env": { "TAVILY_API_KEY": "${TAVILY_API_KEY}" } }`
- 输出永远不打印 key 完整值
- `--json` 输出对 key 字段做 masking

## 沙盒 / 权限

- clihub 自身不需要 root
- 写入仅限 `~/.claude/`, `~/.codex/`, `~/.clihub/`, `~/.kiro/`, `~/.gemini/`
- 装包用各工具自己的包管（brew / npm / bun），不自己 sudo

## 网络访问

- 仅在 `catalog sync` / `skill install <name>` 时拉远端
- HTTPS + sha256 校验
- `--offline` 模式只用本地缓存
- 代理：尊重 `HTTP_PROXY` / `HTTPS_PROXY`

## 日志

```
~/.clihub/logs/
├── 2026-05-26.log                 # ISO 日期, 按天分文件
└── ...
```

格式 JSONL，含 timestamp / cmd / args / exitCode / duration。密钥已掩码。

## CI 模式

```bash
CI=1 clihub skill install tavily --yes
```

- 自动 `--yes`
- 不弹 TUI
- 输出精简
- 出错立即非零退出

## 审计

```bash
clihub audit
clihub audit --since "2026-05-01"
```

读 logs/ 汇总。
