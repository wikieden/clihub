# clihub

[![npm version](https://img.shields.io/npm/v/@wikieden/clihub.svg?label=npm)](https://www.npmjs.com/package/@wikieden/clihub)
[![npm downloads](https://img.shields.io/npm/dm/@wikieden/clihub.svg)](https://www.npmjs.com/package/@wikieden/clihub)
[![license](https://img.shields.io/npm/l/@wikieden/clihub.svg)](LICENSE)
[![node](https://img.shields.io/node/v/@wikieden/clihub.svg)](https://nodejs.org)

**English** | [简体中文](README.zh-CN.md)

**The one tool that installs Claude Code, Codex, Gemini CLI, Kiro, Cursor, and Goose — keeps their skills in sync across every CLI — and ships one-command rollback when an update bites.**

![demo](docs/assets/demo.gif)

```bash
curl -fsSL https://raw.githubusercontent.com/wikieden/clihub/main/scripts/install.sh | sh
clihub preset apply starter
```

That's it. Four CLIs installed, 5 core skills fanned out to all of them, your prior `~/.claude` snapshotted and recoverable.

> **Who's it for?** Newcomers, individual developers, and teams/enterprises each get a different slice — see [`docs/21-VALUE.md`](docs/21-VALUE.md).

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
| Per-tool version pin + rollback | ✅ | ❌ | ❌ | ❌ | ❌ |
| Multi-account profile switching | ✅ | ❌ | ❌ | ❌ | ❌ |
| Multi-source catalog federation | ✅ | ❌ | ❌ | ❌ | ❌ |
| Skill security audit | ✅ | ❌ | ❌ | ❌ | ❌ |
| One memory source → every CLI's file | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cross-machine E2E-encrypted config sync | ✅ | ❌ | ❌ | ❌ | ❌ |
| Signed catalogs (ed25519 supply-chain trust) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Add a new CLI via JSON spec (no fork) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Lockfile compliance / CI drift gate | ✅ | ❌ | ❌ | ❌ | ❌ |
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

**CLIs**: Claude Code, OpenAI Codex CLI, Kiro CLI, Gemini CLI, Cursor CLI, Block Goose.

**Skills**: 30 in the catalog — `superpowers`, `oh-my-claudecode`, `codegraph`, `tdd`, `review`, `frontend-design`, `api-design`, `database-migrations`, `caveman`, `lark-im`, `lark-doc`, `lark-wiki`, ... ([full list](packages/catalog/skills.json)).

**Presets** (8):
- `starter` — Claude Code + 5 core skills (1-min setup).
- `fullstack` — full-stack skills (frontend, backend, DB, review, security, git).
- `python` / `go` / `rust` — language dev bundles (review, tdd, security).
- `research` — web search + synthesis + planning + docs.
- `devops` — deploy, security, performance, git.
- `lark-office` — Lark / Feishu collaboration suite.

**Languages**: English, 简体中文, 日本語, 한국어, Español (auto-detected from `$LANG`, override via `CLIHUB_LANG`).

## Commands

```
clihub                              TUI main menu
clihub tool list
clihub tool install <id>[@version]  pin a specific build
clihub tool rollback <id>           restore the previous installed version
clihub tool history <id>
clihub tool uninstall <id>
clihub tool update [id]
clihub skill list [--permissions]
clihub skill install <id|git-url|path> [--tool <cli>]
clihub skill uninstall <id> [--tool <cli>]
clihub skill audit [id] [--json]    flag shell/hooks/network/symlink risks
clihub plugin <list|install|uninstall|update> [id] [--tool <cli>]
clihub preset list
clihub preset apply <id>
clihub catalog <sync|status|verify>
clihub catalog add <name> <url>     federate an extra catalog source
clihub catalog list|priority|sync-all
clihub catalog keygen [dir]         ed25519 keypair for signing a catalog (publisher)
clihub catalog sign <key> [pub]     sign the synced catalog manifest
clihub catalog trust add <name> <pubkey> --source <url>   pin a publisher key
clihub catalog trust list|rm        manage trusted publisher keys
clihub profile <create|use|list|current|rm|clone|show>
clihub profile baseurl <set|unset|show>   point a profile at LiteLLM/Nyro
clihub profile hook <bash|zsh|fish>        auto-switch profile per dir's clihub.yaml on cd
clihub auth <set|get|list|rm|backend>      per-profile keychain secrets
clihub auth status [--json]                cross-CLI login + token-expiry visibility
clihub auth login <provider> [--browser|--refresh]   OAuth login (device grant / PKCE browser / refresh)
clihub proxy <set|unset|show|test>         HTTP/HTTPS/SOCKS5 + CA bundle
clihub recommend [--json]                  suggest skills/presets from installed CLIs + project
clihub doctor [id] [--fix] [--check-network]
clihub search <query>
clihub watch
clihub completion <bash|zsh|fish|powershell|man>
clihub backup | backup list | restore <id> | rollback
clihub config <show|get|set|unset> [key] [value]
clihub yaml
clihub apply [--plan]                      converge this machine to clihub.yaml
clihub lock                                pin resolved versions to clihub.lock.json
clihub install [--frozen]                  install from clihub.yaml (or lockfile)
clihub status [--json] [--strict]          check this machine vs clihub.lock.json (CI gate)
clihub diff <a> [b]                        diff two clihub.lock.json (added/removed/upgraded)
clihub mcp <list|add|remove> [id]          manage MCP servers across CLIs (Claude Code / Gemini)
clihub schema [--out FILE]                  emit clihub.yaml JSON Schema (editor autocomplete)
clihub ci [github|gitlab] [--out FILE]       generate a CI workflow that validates clihub.yaml
clihub team <add|list|pull|use|push|rm>      share clihub config across a team via a git repo
clihub pack <docker|brew|scoop> [--out FILE] generate a distribution manifest
clihub conformance [dir] [--json]            validate a catalog against the clihub specs
clihub memory <generate|plan> [--user] [--all] [--check]   one source → every CLI's memory file
clihub sync export [--out FILE]            E2E-encrypted config bundle (profiles + sources + config)
clihub sync import <FILE> [--plan]         restore on another machine (passphrase-protected)
clihub provider list                       declarative providers (user + catalog)
clihub provider add <spec.json>            teach clihub a new CLI from a JSON spec — no fork
clihub provider remove <id>
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

- **v0.1–0.3** ✅ — providers (Claude Code / Codex / Kiro / Gemini), 30 skills, presets, cross-tool fan-out, i18n, per-CLI TUI, MCP catalog.
- **v0.4** ✅ — agentskills.io SKILL.md installer (`clihub skill install <git-url>`), plugin install (Claude Code), remote catalog sync with sha256, Codex TOML, Windows-safe paths.
- **v0.5** ✅ — `watch` / `search` / shell completion / man; proxy + CA bundle; `doctor --fix` + error codes; **multi-account profiles** + keychain vault + per-profile `BASE_URL` injection; `clihub.yaml` + audit log; per-tool **version pin/rollback**; **skill audit**.
- **v0.6** ✅ — multi-source **catalog federation** (`catalog add`), **Cursor + Goose** providers (6 CLIs total), **HTTP/SSE MCP** transport.
- **v0.6.1** ✅ — `clihub apply --plan` / `lock` / `install --frozen` (full `clihub.yaml` schema + `clihub.lock.json`).
- **v0.7** ✅ — **`clihub memory generate`**: one source (`clihub.memory.md` → `AGENTS.md` → `CLAUDE.md`) fans out to `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` / `.cursor/rules/*.mdc` / `.goosehints` / `.kiro/steering/*.md`, managed-block markers preserve hand-edits, `--check` for CI.
- **v0.8** ✅ — **`clihub sync`**: cross-machine, end-to-end-encrypted config bundle (global config + catalog sources + profile metadata). scrypt + AES-256-GCM, passphrase-only, zero backend — move the bundle however you like.
- **v0.9** ✅ — **signed catalogs**: ed25519 `catalog keygen` / `sign` + a local trust store (`catalog trust add --source`). `catalog verify` checks both the sha256 checksums (integrity) and the publisher signature (authenticity) — a forged manifest can't be re-signed without the private key. Pure `node:crypto`, no cosign dependency.
- **v0.10** ✅ — **declarative provider SDK**: teach clihub a new AI CLI with a JSON spec (`~/.clihub/providers.json` or a catalog's `providers.json`) — detection + npm/bun/brew install with no code or fork. `provider list|add|remove`. Shell-command installs are gated behind `--allow-scripts`; built-in providers can't be shadowed.
- **v0.11** ✅ (current, `@wikieden/clihub@0.11.0` on npm) — **`clihub status`**: compliance gate that diffs this machine against the pinned `clihub.lock.json` (ok / drift / missing / unlocked). `--json` for dashboards, `--strict` to fail CI when a teammate drifts off the agreed toolchain.
- **v0.12** ✅ — **`clihub schema`**: emit a draft-07 JSON Schema for `clihub.yaml` so editors (yaml-language-server) give autocomplete + inline validation.
- **v1.0.0** ✅ — **stable**. Frozen surface: `clihub.yaml` schema v1, `clihub.lock.json` v1, `@clihub/core` public API, and the `clihub` command set. See [`CHANGELOG.md`](CHANGELOG.md).
- **v1.1.0** ✅ — **`clihub ci`**: generate a GitHub Actions / GitLab workflow that validates `clihub.yaml` on every push (with commented opt-ins for memory `--check` and `status --strict`).
- **v1.2.0** ✅ — **`clihub team`**: share a reproducible toolchain through a plain git repo. `team add <name> <git-url>` clones it; `team push` commits your `clihub.yaml` / lock / memory / schema; `team use` pulls them into a project. No clihub backend.
- **v1.3.0** ✅ — **`clihub auth status`**: cross-CLI login + token-expiry visibility (best-effort, read-only; never prints token contents).
- **v1.4.0** ✅ — **`clihub pack`**: generate distribution manifests — `pack docker` / `pack brew` / `pack scoop`. Reach beyond npm.
- **v1.5.0** ✅ — **`clihub auth login`**: OAuth 2.0 device-grant login (RFC 8628, headless/CI-friendly). Vendor-neutral BYO config; token written to the CLI's native credential file (0600). Security-reviewed.
- **v1.6.0** ✅ — **`clihub auth login --refresh`**: token-expiry recovery via the RFC 6749 refresh-token grant — re-mint an access token from the stored `refresh_token`, no browser. Completes the auth pillar.
- **v1.7.0** ✅ — **`clihub conformance`**: validate a catalog against the published clihub specs. The machine-checkable basis for a `clihub-compatible` badge.
- **v1.8.0** ✅ (current, `@wikieden/clihub@1.8.0` on npm) — **`clihub auth login --browser`**: OAuth Authorization Code + PKCE (RFC 7636) via a 127.0.0.1 loopback redirect, for providers without a device flow. CSPRNG `state` (CSRF), S256 challenge; security-reviewed. Completes the three login modes (device / browser / refresh).
- **post-1.8 (external-infra blocked)** — registry *server* (`clihub.dev`) + VS Code/JetBrains marketplace clients. See [`docs/spec/`](docs/spec/).

See [`docs/11-ROADMAP.md`](docs/11-ROADMAP.md) and [`docs/20-MARKET-RESEARCH.md`](docs/20-MARKET-RESEARCH.md).

## License

MIT.
