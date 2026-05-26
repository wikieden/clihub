# clihub — 总体愿景

## 一句话

让任何人**一行命令**完成「AI 编程 CLI 工具 + 配置 + skill 生态」的安装与日常维护，初学者零心智负担，老手保留全部可定制空间。

## 工程范围

本仓库（原 `CCEnvOneCLick`，将更名为 `clihub`）演化为以下产物的承载：

1. **`clihub` npm 包** — 跨平台 CLI 工具 + 库
2. **`clihub` Claude Code skill** — 在 Claude Code 内部直接调用配置管家
3. **CC statusline** — 双行状态栏（原工程功能保留）
4. **catalog** — skill / MCP / tool 元数据目录
5. **install scripts** — bash / curl 一键安装器

## 目标用户三类

| 角色 | 痛点 | clihub 解法 |
|---|---|---|
| **小白** | 不懂 settings.json / hooks / MCP，被术语吓退 | TUI 交互菜单 + 预设 + 中文 UI |
| **半熟手** | 知道大概，懒得记命令 | `clihub` 子命令 + tab 补全 |
| **老手** | 自定义需求多 | `--json` 输出 + 插件扩展 + dry-run |

## 核心价值主张

1. **一键覆盖全流程**：装 Claude Code 本体 → 装配套 skill → 改配置 → 加 MCP → 配 hooks，单一入口
2. **在工具内自举**：装完后用户在 Claude Code 里说 "clihub 帮我装 tavily skill"，无需回终端
3. **跨 AI CLI 工具**：Claude Code / Codex CLI / Kiro CLI / Gemini CLI 用同一套 clihub 管
4. **统一 skill 抽象**：一份 skill 源文，自动适配各工具的扩展机制
5. **国际化**：默认探测系统语言，支持至少十种主流语言
6. **安全护栏**：所有写操作自动备份，dry-run / rollback 一键复原

## 非目标

- 不做 AI CLI 工具的功能替代（不重写 Claude Code）
- 不做企业级集中管理后台（多用户 / 审计日志 / SSO）
- 不绑定云端账号，纯本地工具

## 长期路线图

| 阶段 | 目标 | 关键交付 |
|---|---|---|
| **v0.1** | MVP | CLI + TUI + claude-code provider + i18n (en/zh-CN) + 5 个核心 skill |
| **v0.2** | 多工具 | codex / kiro-cli / gemini-cli provider + skill 跨工具同步 |
| **v0.3** | 生态 | 插件机制 `clihub-plugin-*` + 远端 catalog 热更新 |
| **v0.4** | 完备 | 全 skill 目录（50+） + 全语言（10+） + brew / winget 分发 |
| **v1.0** | GA | 稳定 API + 文档站 + 用户超 1000 |

## 成功指标

- 首次安装到能跑 `/clihub` ≤ 60 秒
- 装一个新 skill ≤ 3 步交互
- 配置出错回滚 ≤ 1 命令
- 翻译贡献门槛：只改 JSON，无需懂代码
