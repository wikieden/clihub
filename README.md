# clihub

[![npm version](https://img.shields.io/npm/v/@wikieden/clihub.svg?label=npm)](https://www.npmjs.com/package/@wikieden/clihub)
[![npm downloads](https://img.shields.io/npm/dm/@wikieden/clihub.svg)](https://www.npmjs.com/package/@wikieden/clihub)
[![license](https://img.shields.io/npm/l/@wikieden/clihub.svg)](LICENSE)
[![node](https://img.shields.io/node/v/@wikieden/clihub.svg)](https://nodejs.org)

**The one tool that installs Claude Code, Codex, Gemini CLI, and Kiro — keeps their skills in sync across every CLI — and ships one-command rollback when an update bites.**

![demo](docs/assets/demo.gif)

```bash
curl -fsSL https://raw.githubusercontent.com/wikieden/clihub/main/scripts/install.sh | sh
clihub preset apply starter
```

That's it. Four CLIs installed, 5 core skills fanned out to all of them, your prior `~/.claude` snapshotted and recoverable.

---

## Why clihub

Every AI coding CLI ships its own bespoke skill / plugin / MCP layout. If you run more than one, you end up:

- Re-installing the same skill four times in four different folders.
- Hand-syncing `superpowers` to `~/.claude/skills/`, `~/.codex/skills/`, `~/.kiro/skills/`, `~/.gemini/skills/`.
- Nuking your config on an unrelated upgrade and having no way back.

clihub solves all three:

| | clihub | claude-skills | multica | ccpi | oh-my-claudecode |
| --- | --- | --- | --- | --- | --- |
| Installs the CLIs themselves | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cross-CLI skill fan-out | ✅ | ✅ | partial | ❌ (CC only) | ❌ |
| Presets that bundle tools + skills + MCP | ✅ | ❌ | ❌ | ❌ | ❌ |
| Backup / one-command rollback of `~/.claude` & siblings | ✅ | ❌ | ❌ | ❌ | ❌ |
| Interactive TUI onboarding | ✅ | ❌ | partial | ❌ | ❌ |
| Single-binary distribution | npm | shell | npm | npm | CC plugin |

## Install

```bash
# one-liner (auto-falls back to git clone + build if npm package not yet published)
curl -fsSL https://raw.githubusercontent.com/wikieden/clihub/main/scripts/install.sh | sh

# or directly
npm install -g @wikieden/clihub
bun add -g @wikieden/clihub
```

Or run it as a container without installing anything locally:

```bash
docker run --rm -it -v ~/.claude:/root/.claude wikieden/clihub
docker run --rm -it wikieden/clihub doctor
```

Requirements: Node ≥ 18 (or Bun). On Linux/macOS/WSL.

## Quickstart

```bash
clihub                                 # interactive TUI (recommended for first run)

# or scripted:
clihub tool install claude-code
clihub tool install codex
clihub skill install superpowers       # auto-fans out to every installed CLI
clihub preset apply fullstack          # tools + skills + MCP bundle
clihub doctor                          # health check across every CLI
clihub backup                          # snapshot ~/.claude before risky upgrades
clihub rollback                        # restore the most recent snapshot
```

## Currently supported

**CLIs**: Claude Code, OpenAI Codex CLI, Kiro CLI, Gemini CLI.

**Skills**: 30 in the catalog — `superpowers`, `oh-my-claudecode`, `codegraph`, `tdd`, `review`, `frontend-design`, `api-design`, `database-migrations`, `caveman`, `lark-im`, `lark-doc`, `lark-wiki`, ... ([full list](packages/catalog/skills.json)).

**Presets**:
- `starter` — Claude Code + 5 core skills (1-min setup).
- `fullstack` — Claude Code + full-stack skills (frontend, backend, DB, review, security, git).
- `lark-office` — Claude Code + Lark / Feishu collaboration suite.

**Languages**: English, 简体中文, 日本語, 한국어, Español (auto-detected from `$LANG`, override via `CLIHUB_LANG`).

## Commands

```
clihub                          TUI main menu
clihub tool list
clihub tool install <id>
clihub tool uninstall <id>
clihub tool update [id]
clihub skill list
clihub skill install <id> [--tool <cli>]
clihub skill uninstall <id> [--tool <cli>]
clihub preset list
clihub preset apply <id>
clihub doctor [id]
clihub backup
clihub backup list
clihub restore <id>
clihub rollback
clihub config show [tool]
clihub self-update
```

Full reference: [`docs/02-CLI-COMMANDS.md`](docs/02-CLI-COMMANDS.md).

## Three faces of clihub

1. **CLI** — `clihub <subcommand>` in your terminal.
2. **Claude Code skill** — installed at `~/.claude/skills/clihub/`; the model invokes the same operations on your behalf.
3. **Slash command** — `/clihub` inside Claude Code opens the menu.

All three share the same `@clihub/core` kernel.

## Repo layout

```
clihub/
├── packages/
│   ├── core/        @clihub/core — providers, settings, backup, skill adapters, catalog, i18n
│   ├── cli/         clihub binary (cac + @clack/prompts TUI)
│   ├── skill/       SKILL.md + /clihub slash command (installed to ~/.claude/)
│   ├── statusline/  statusline installer (preserved from v0.0)
│   └── catalog/     skills.json / tools.json / presets.json
├── scripts/         install.sh, dev-test.sh (sandboxed manual test), test-install.sh
└── docs/            architecture, commands, i18n, security/backup
```

## Statusline

The two-line statusline from v0.0 lives at `packages/statusline/`:

```bash
bash packages/statusline/install.sh
```

## Develop

```bash
bun install
bun packages/cli/src/cli.ts        # run CLI from source
bun run typecheck                  # tsc across workspaces
bash scripts/dev-test.sh           # interactive TUI in an isolated $HOME (won't touch your real config)
```

## Roadmap

- **v0.1** ✅ — Claude Code provider, 5 core skills, backup/restore.
- **v0.2** ✅ — Codex + Kiro + Gemini providers, 30 skills, 3 presets, cross-tool skill fan-out, i18n (en/zh/ja/ko/es), TUI with preset preview + back navigation, single-binary npm tarball with zero install-time deps.
- **v0.3** ✅ (current, `@wikieden/clihub@0.3.0` on npm) — TUI restructured per-CLI: pick a CLI → install / skills / plugins / MCP / config / doctor in one place. New MCP catalog + `JsonMcpAdapter` patches `~/.claude/settings.json` and `~/.gemini/settings.json` with `mcpServers` entries (filesystem, github, sequential-thinking, memory, fetch, context7, playwright). Cross-tool actions (presets, fan-out, doctor-all) live under their own branch. Plugin install is stubbed pending v0.3.x.
- **v0.4+** — `agentskills.io` SKILL.md catalog format, doctor with quota signals, plugin install (Claude Code marketplace), Codex MCP via TOML, remote catalog sync, Windows support.

See [`docs/11-ROADMAP.md`](docs/11-ROADMAP.md).

## License

MIT.
