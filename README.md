# clihub — cross-platform AI CLI toolkit manager

`clihub` installs and manages AI CLI tools (Claude Code today; Codex / Kiro in v0.2+)
and their skill ecosystems. One command bootstraps a working environment; presets
roll up tool + skill bundles; backup / rollback keeps your config safe.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/wikieden/clihub/main/scripts/install.sh | sh
```

Or directly:

```bash
npm install -g clihub
# or
bun add -g clihub
```

## Quickstart

```bash
clihub                          # interactive TUI menu
clihub tool install claude-code # install Claude Code
clihub preset apply starter     # Claude Code + 5 core skills
clihub doctor                   # verify install
```

## Commands

```
clihub                          TUI main menu
clihub tool list
clihub tool install <id>        e.g. claude-code
clihub tool uninstall <id>
clihub tool update [id]
clihub skill list
clihub skill install <id>       e.g. superpowers, codegraph, caveman
clihub skill uninstall <id>
clihub preset list
clihub preset apply <id>        e.g. starter
clihub doctor [id]
clihub backup
clihub backup list
clihub restore <id>
clihub rollback
```

Full reference: [`docs/02-CLI-COMMANDS.md`](docs/02-CLI-COMMANDS.md).

## Three faces of clihub

1. **CLI** — `clihub <subcommand>` in your terminal.
2. **Claude Code skill** — installed at `~/.claude/skills/clihub/`; the model
   invokes the same operations on your behalf.
3. **Slash command** — `/clihub` inside Claude Code opens the menu.

All three share the same `@clihub/core` kernel.

## Repo layout

```
clihub/
├── packages/
│   ├── core/        @clihub/core — types, providers, settings, backup, skills, catalog, i18n
│   ├── cli/         clihub binary (cac + @clack/prompts TUI)
│   ├── skill/       SKILL.md + /clihub slash command (installed to ~/.claude/)
│   ├── statusline/  statusline installer (preserved from v0.0)
│   └── catalog/     skills.json / tools.json / presets.json metadata
├── scripts/         install.sh (curl entry), test-install.sh (sandboxed test)
└── docs/            architecture, command, i18n, security/backup docs
```

## Statusline

The standalone two-line statusline from v0.0 lives at
`packages/statusline/`. Copies remain at the repo root for backwards
compatibility. To install just the statusline:

```bash
bash packages/statusline/install.sh
```

See `docs/` for design notes.

## Develop

```bash
bun install                 # installs workspaces + deps
bun packages/cli/src/cli.ts # run CLI from source
bun run typecheck           # tsc across all workspaces
bun run test                # bash scripts/test-install.sh (sandboxed)
```

Requirements: Node ≥ 18 (or Bun), `jq` for the statusline, `tar` for backups.

## Roadmap

- v0.1 (current): Claude Code provider, 5 core skills, backup/restore, starter preset.
- v0.2+: Codex provider, Kiro provider, remote catalog sync, plugin system, Windows support.

See [`docs/11-ROADMAP.md`](docs/11-ROADMAP.md).
