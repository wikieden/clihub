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
| 12 | [TESTING](12-TESTING.md) | 测试矩阵、沙盒安装、dev-test.sh |
| 13 | [MONETIZATION](13-MONETIZATION.md) | 长期盈利模式、阶段触发条件、反模式 |
| 14 | [SPRINT](14-SPRINT.md) | 4 周 sprint 详细计划 + 3 月展望 + KPI |
| 15 | [SKILL-MD](15-SKILL-MD.md) | agentskills.io SKILL.md 格式兼容说明 + 装 git URL / 本地路径 |
| 16 | [LAUNCH](16-LAUNCH.md) | v0.4 公告文案 — HN / Reddit / V2EX / X / dev.to / 掘金 |
| 17 | [INFRA-PILLARS](17-INFRA-PILLARS.md) | 十支柱框架 — 让 clihub 成为 AI coding 基建层 |
| 18 | [CONFIG-PROXY-PROFILE](18-CONFIG-PROXY-PROFILE.md) | Pillar IX 设计 — proxy / CA bundle / 多账号 profile / 系统 keychain |
| 19 | [CLIHUBYAML](19-CLIHUBYAML.md) | `clihub.yaml` + `clihub.lock.json` schema (Pillar II 可复现) |
| 20 | [MARKET-RESEARCH](20-MARKET-RESEARCH.md) | HN / Reddit / V2EX 2026-05 痛点审计 + v0.5→v0.8 路线重排理据 |
| 21 | [VALUE](21-VALUE.md) | 三类受众价值 — 小白 / 个人开发者 / 团队企业（痛点→能力→命令） |
| 22 | [GATEWAY-SECURITY](22-GATEWAY-SECURITY.md) ｜ [中文](22-GATEWAY-SECURITY.zh.md) | 网关威胁模型（P2 安全门禁） |
| 23 | [ARCHITECTURE](23-ARCHITECTURE.md) ｜ [中文](23-ARCHITECTURE.zh.md) | 转型后架构 — 一内核多壳 / daemon / GUI / 网关 |
| 24 | [VERSION-PLAN](24-VERSION-PLAN.md) | 转型后分阶段版本计划（P1a/P1b/P2/P3） |
| 25 | [PROVIDER-BINDING](25-PROVIDER-BINDING.md) | **per-CLI provider+模型绑定设计**（`clihub use`，7 CLI 实证矩阵） |
| 26 | [GATEWAY-DESIGN](26-GATEWAY-DESIGN.md) ｜ [中文](26-GATEWAY-DESIGN.zh.md) | **网关实现设计**（P2 门禁未开 — 设计不写码）：包骨架 / 类型契约 / 请求生命周期 / `gateway:` schema / egress / 接管矩阵 / 测试计划 |
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
