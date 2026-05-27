# Roadmap

Status anchors: ✅ shipped · 🚧 in progress · 📋 planned

## Released

### v0.1 ✅ — MVP

- monorepo skeleton (bun workspaces)
- `@clihub/core` (settings, backup, i18n)
- `clihub` CLI (cac + clack TUI)
- i18n: en + zh-CN
- ToolProvider: `claude-code`
- 5 core skills, `starter` preset
- doctor / backup / restore / rollback

### v0.2 ✅ — multi-CLI

- Codex + Kiro + Gemini providers
- Cross-tool `SkillSyncAdapter`s
- Catalog: 30 skills, 3 presets
- i18n: + ja / ko / es
- npm publish as `@wikieden/clihub`
- single-binary 148 KB tarball, zero install-time deps

### v0.3 ✅ — UX & health

- TUI: per-CLI guided menus, preset preview, back navigation
- MCP catalog (`packages/catalog/mcp.json`) + `JsonMcpAdapter`
- Cross-CLI doctor matrix (CLI / STATUS / VERSION / SETTINGS / SKILLS / MCP) with `--json`
- Kiro install fix (broken `kiro.dev/install.sh` → `brew install --cask kiro`)
- Codex TOML settings adapter (`~/.codex/config.toml` reads now work)

## In progress

### v0.4 🚧 — open standard + sync

Sub-tasks:

- 🚧 **Step A — agentskills.io SKILL.md format**: parse YAML frontmatter (`name`, `description`); allow catalog to load from `skills/<id>/SKILL.md` directories. Make clihub an installer for the open standard.
- ✅ **Step B — Codex TOML settings** (shipped in v0.3.2).
- 🚧 **Step C — Plugin install (Claude Code)**: `PluginManifest` catalog + `ClaudeCodePluginAdapter` (git clone into `~/.claude/plugins/<id>/`). `clihub plugin <action> [id]` CLI + TUI lane.
- 🚧 **Step D — Remote catalog sync**: `clihub catalog sync [url]` downloads JSON files to `~/.clihub/catalog/`; `CatalogLoader` prefers user dir when present.

### Acceptance

```bash
clihub catalog sync                                    # pulls latest catalog
clihub plugin install <id> --tool claude-code          # git clone into ~/.claude/plugins/<id>
clihub skill install <skill-md-path> --tool codex      # SKILL.md → codex adapter
clihub config show codex                                # parses TOML
```

## Planned

### v0.5 — Windows + observability

- Windows 路径 / PowerShell support
- `clihub watch` — detect CLI upgrades, auto-backup, surface rollback CTA
- Skill / plugin / MCP full-text search (`clihub search <query>`)
- Quota / usage signals in `doctor` (Anthropic + OpenAI usage where exposed)
- CI release pipeline (tag → `npm publish` via Classic Automation token)

### v0.6 — team mode

- `clihub team init` → `clihub.lock.json` (per-project skill / MCP / version pins)
- HTTP transport for MCP servers (currently stdio-only)
- New providers: Cursor, OpenCode, Goose, Junie

### v1.0 — stable API

- Public API freeze + semver guarantee
- Plugin SDK (third-party `ToolProvider` / `SkillSyncAdapter` packages)
- 100+ skills / 50+ MCP / 20+ plugins in the catalog
- VS Code extension wrapper
- Documentation site (`clihub.dev`)

### v2.0 — registry + enterprise

- `clihub.dev` skill/plugin registry (npm-style publish, no PR needed)
- Enterprise tier: SSO, private catalog, audit log
- `clihub cloud` sync of catalog + config across machines

## Technical-debt budget (per release)

| Bar | Target |
|---|---|
| Test coverage | ≥ 70 % |
| i18n key parity | 100 % across en / zh-CN / ja / ko / es |
| Startup latency | < 150 ms (v0.x), < 80 ms (v1.0+) |
| First-install wall-clock | < 90 s (v0.x), < 60 s (v1.0+) |
| Docs in sync with code | every release |
| Smoke matrix | 3 platforms × 2 package managers × 4 tools |

## Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Anthropic changes the skill format | high | adapter layer absorbs deltas |
| alirezarezvani/claude-skills adds CLI install | high | get to npm + presets + rollback first |
| AI CLI shake-out: a CLI dies | high | provider abstraction; drop the provider, no user impact |
| nobody cares (silent fail) | medium | v0.4 launch on HN / Reddit / V2EX |
| translation drift | low | LLM-assisted + native-speaker review on release |
| Windows compat | medium | recruit Windows beta users early |
| maintainer bandwidth | high | plugin SDK opens up provider development |
