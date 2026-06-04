# clihub

[![npm version](https://img.shields.io/npm/v/@wikieden/clihub.svg?label=npm)](https://www.npmjs.com/package/@wikieden/clihub)
[![npm downloads](https://img.shields.io/npm/dm/@wikieden/clihub.svg)](https://www.npmjs.com/package/@wikieden/clihub)
[![license](https://img.shields.io/npm/l/@wikieden/clihub.svg)](LICENSE)
[![node](https://img.shields.io/node/v/@wikieden/clihub.svg)](https://nodejs.org)

[English](README.md) | **简体中文**

**一个工具，装好 Claude Code、Codex、Gemini CLI、Qwen Code、Kiro、Cursor、Goose —— 把它们的 skills 跨 CLI 同步 —— 升级出问题时一条命令回滚。**

![demo](docs/assets/demo.gif)

```bash
curl -fsSL https://raw.githubusercontent.com/wikieden/clihub/main/scripts/install.sh | sh
clihub preset apply starter
```

完事。多个 CLI 装好，5 个核心 skill 同时铺到每个 CLI，旧的 `~/.claude` 已快照、可恢复。

---

## 为什么用 clihub

每个 AI 编码 CLI 都有自己一套 skill / plugin / MCP 目录结构。同时用多个就会陷入：

- 同一个 skill 在四个目录里装四遍。
- 手动把 `superpowers` 同步到七套不同目录 —— `~/.claude/skills/`、`~/.codex/skills/`、`~/.gemini/commands/*.toml`、`~/.qwen/commands/*.toml`、`~/.kiro/steering/`、`~/.cursor/commands/*.md`、`~/.config/goose/recipes/*.yaml`。
- 一次无关升级把配置冲掉，无法回退。

clihub 一次解决：

| | clihub | claude-skills | multica | ccpi | oh-my-claudecode |
| --- | --- | --- | --- | --- | --- |
| 安装 CLI 本体 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 跨 CLI 的 skill 铺设 | ✅ | ✅ | 部分 | ❌（仅 CC） | ❌ |
| 预设打包 tools + skills + MCP | ✅ | ❌ | ❌ | ❌ | ❌ |
| 备份 / 一键回滚 `~/.claude` 及同类 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 按工具版本锁定 + 回滚 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 多账号 profile 切换 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 多源目录联邦 | ✅ | ❌ | ❌ | ❌ | ❌ |
| Skill 安全审计 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 单一记忆源 → 每个 CLI 的文件 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 跨机器端到端加密同步 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 签名目录（ed25519 供应链信任） | ✅ | ❌ | ❌ | ❌ | ❌ |
| 用 JSON spec 接入新 CLI（免 fork） | ✅ | ❌ | ❌ | ❌ | ❌ |
| 锁文件合规 / CI 漂移闸门 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 交互式 TUI 引导 | ✅ | ❌ | 部分 | ❌ | ❌ |
| 分发方式 | npm | shell | npm | npm | CC 插件 |

## 安装

```bash
# 一行命令（npm 包不可用时自动回退到 git clone + 构建）
curl -fsSL https://raw.githubusercontent.com/wikieden/clihub/main/scripts/install.sh | sh

# 或直接安装
npm install -g @wikieden/clihub
bun add -g @wikieden/clihub
```

也可用容器运行，无需本地安装：

```bash
docker run --rm -it -v ~/.claude:/root/.claude wikieden/clihub
docker run --rm -it wikieden/clihub doctor
```

要求：Node ≥ 18（或 Bun）。支持 Linux / macOS / WSL。

## 快速上手

```bash
clihub                                 # 交互式 TUI（首次使用推荐）

# 或脚本化：
clihub tool install claude-code
clihub tool install codex
clihub skill install superpowers       # 自动铺到每个已装的 CLI
clihub preset apply fullstack          # tools + skills + MCP 套装
clihub doctor                          # 跨 CLI 健康检查
clihub backup                          # 高风险升级前快照 ~/.claude
clihub rollback                        # 恢复最近一次快照
```

## 当前支持

**CLI**（7 个）：Claude Code、OpenAI Codex CLI、Gemini CLI、Qwen Code、Kiro CLI、Cursor CLI、Block Goose。

**Skills**：目录内 30 个 —— `superpowers`、`oh-my-claudecode`、`codegraph`、`tdd`、`review`、`frontend-design`、`api-design`、`database-migrations`、`caveman`、`lark-im`、`lark-doc`、`lark-wiki` …（[完整列表](packages/catalog/skills.json)）。

**预设**：
- `starter` —— Claude Code + 5 个核心 skill（1 分钟搭好）。
- `fullstack` —— Claude Code + 全栈 skill（前端、后端、数据库、review、安全、git）。
- `lark-office` —— Claude Code + 飞书 / Lark 协作套件。

**语言**：English、简体中文、日本語、한국어、Español（按 `$LANG` 自动检测，可用 `CLIHUB_LANG` 覆盖）。

## 命令一览

完整命令见英文版 [README](README.md#commands) 与 [`docs/02-CLI-COMMANDS.md`](docs/02-CLI-COMMANDS.md)。常用：

```
clihub                              TUI 主菜单
clihub tool install <id>[@version]  锁定具体版本
clihub tool rollback <id>           回滚到上一个已装版本
clihub skill install <id|git-url|path> [--tool <cli>]
clihub skill audit [id] [--json]    标记 shell/hooks/网络/符号链接风险
clihub preset apply <id>
clihub doctor [id] [--fix]          跨 CLI 健康检查 + 自动修复
clihub apply [--plan]               把本机收敛到 clihub.yaml
clihub lock                         把解析后的版本钉到 clihub.lock.json
clihub install [--frozen]           按 clihub.yaml（或锁文件）安装
clihub status [--json] [--strict]   对照 clihub.lock.json 检查本机（CI 闸门）
clihub memory generate              单一记忆源 → 每个 CLI 的记忆文件
clihub sync export | import         端到端加密的配置包，跨机器搬运
clihub team <add|pull|use|push>     用一个 git 仓库在团队间共享配置
clihub auth login <provider> [--browser|--refresh]   OAuth 登录（设备码 / PKCE 浏览器 / 刷新）
clihub catalog sign / trust         ed25519 目录签名 + 信任库
clihub provider add <spec.json>     用 JSON spec 接入新 CLI —— 免 fork
```

## clihub 的三种形态

1. **CLI** —— 终端里的 `clihub <子命令>`。
2. **Claude Code skill** —— 装在 `~/.claude/skills/clihub/`，模型代你执行同样的操作。
3. **斜杠命令** —— 在 Claude Code 里用 `/clihub` 打开菜单。

三者共用同一个 `@clihub/core` 内核。

## 设计理念

- **厂商中立** —— 永不偏袒某一个 CLI（即便 Claude Code 是主力场景）。只做配置适配器，不做数据面网关。
- **开放标准优先** —— agentskills.io SKILL.md、MCP、相关 OCI 镜像。
- **默认零遥测** —— 仅在显式 opt-in 后采集聚合计数。
- **回滚神圣** —— 每次写入前先做带时间戳的备份，绝不丢用户状态。

## 路线图

已稳定发布至 `@wikieden/clihub@1.8.0`：apply/lock/status、memory、sync、签名目录、声明式 provider SDK、schema、ci、team、auth（设备码 / PKCE / 刷新）、conformance。完整历史见 [`CHANGELOG.md`](CHANGELOG.md) 与 [`docs/11-ROADMAP.md`](docs/11-ROADMAP.md)；规范草案见 [`docs/spec/`](docs/spec/)。

余下项受外部基础设施限制（托管 registry 服务、IDE 应用市场客户端），契约已在 spec 中固定。

## 许可证

MIT。
