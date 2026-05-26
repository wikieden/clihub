# clihub — 设计文档索引

## 阅读顺序

| 序号 | 文件 | 内容 |
|---|---|---|
| 00 | [VISION](00-VISION.md) | 总体愿景、目标用户、产物清单、路线图 |
| 01 | [ARCHITECTURE](01-ARCHITECTURE.md) | monorepo 结构、数据流、关键抽象、分层 |
| 02 | [CLI-COMMANDS](02-CLI-COMMANDS.md) | 命令规约、子命令组、退出码、输出约定 |
| 03 | [TUI-FLOW](03-TUI-FLOW.md) | 交互式菜单流程、首装流、子菜单、键位 |
| 04 | [TOOL-PROVIDERS](04-TOOL-PROVIDERS.md) | 多 AI CLI 工具抽象、provider 矩阵、插件机制 |
| 05 | [CLIHUB-SKILL](05-CLIHUB-SKILL.md) | clihub 作为 CC skill 的形态、SKILL.md、脚本协议 |
| 06 | [SKILL-CROSS-TOOL](06-SKILL-CROSS-TOOL.md) | skill 在 CC / Codex / Kiro / Gemini 间同步策略 |
| 07 | [I18N](07-I18N.md) | 多语言架构、locale 探测、翻译流程 |
| 08 | [SKILL-CATALOG](08-SKILL-CATALOG.md) | 内嵌 skill 目录 + 预设 |
| 09 | [DISTRIBUTION](09-DISTRIBUTION.md) | npm / bun / curl / brew 分发、postinstall、卸载 |
| 10 | [SECURITY-BACKUP](10-SECURITY-BACKUP.md) | 备份策略、dry-run、rollback、密钥处理 |
| 11 | [ROADMAP](11-ROADMAP.md) | 版本里程碑、范围、验收 |
| -- | [REVIEW](REVIEW.md) | **总体目标 review** — 风险 / 决策点 / 最小切片 |

## 快速理解

- **要懂这是啥** → 看 00-VISION + REVIEW
- **要写代码** → 看 01-ARCHITECTURE + 04-TOOL-PROVIDERS + 07-I18N
- **要懂用户体验** → 看 02-CLI-COMMANDS + 03-TUI-FLOW
- **要做 CC 内 skill** → 看 05-CLIHUB-SKILL + 06-SKILL-CROSS-TOOL
- **要扩 skill 目录 / 加新工具** → 看 08-SKILL-CATALOG + 04-TOOL-PROVIDERS
- **要发版** → 看 09-DISTRIBUTION + 11-ROADMAP

## 关键决策速查

| 项 | 选 | 文档 |
|---|---|---|
| 包管 / 构建 | bun (主) + 兼容 node | 01 |
| CLI 框架 | cac | 02 |
| TUI 库 | @clack/prompts | 03 |
| i18n | 自造极简 | 07 |
| skill 格式源 | CC 原生 + manifest | 06 |
| 多工具扩展 | ToolProvider + plugin | 04 |
| 备份 | 每次写自动 + tar 滚动 | 10 |

## 待补文档

- CONTRIBUTING.md
- ADR/ (架构决策记录)
- API.md (@clihub/core 公开 API)
- TESTING.md (测试矩阵)
