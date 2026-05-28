# Roadmap

> Tactical sprint view (day-by-day, 4-week sprints + 3-month outlook): [`14-SPRINT.md`](14-SPRINT.md).
> Business model & monetisation phases: [`13-MONETIZATION.md`](13-MONETIZATION.md).

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

### v0.5 — Windows + config + ease of use + multi-account

Expanded scope after the infra-vision review **and** re-prioritised after the 2026-05 demand audit (see [`20-MARKET-RESEARCH.md`](20-MARKET-RESEARCH.md)). v0.5 covers Pillars IX (Config), X (Ease of Use) and lays groundwork for Pillar XI (Cross-machine sync). Splits into four shippable tranches.

#### v0.5.0 ✅ — Windows + watch + search (shipped 2026-05-28)

- Windows-safe `whichCmd` + regex-based version parsing
- `clihub watch` — file-watcher + auto-backup
- `clihub search <query>` — fuzzy across catalog
- Tab completion (bash / zsh / fish / PowerShell)
- man page (`clihub completion man`)

#### v0.5.1 🚧 — Proxy + CA + ease wins + live quota (Sprint 6)

- Recognise `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` / `NO_PROXY`
- Bearer-auth and SOCKS5 proxy URLs (`socks5://user:pass@host:port`)
- `clihub config set proxy.http <url>` persistent override
- Custom CA bundle (`clihub config set ca-bundle <path>`) for corp MITM
- Inject proxy env into Claude Code / Codex / Gemini / Kiro settings
- **New** — live quota meter in `clihub doctor`: 5-hour + weekly burn across Claude Code / Codex / Gemini where vendor APIs expose usage (addresses HN demand for rate-limit visibility)
- `clihub doctor --fix` auto-remediation pass
- Error code system (`CLIHUB-E-NNN`) with linked docs
- First-run TUI wizard (≤ 5 steps, ≤ 60 s to first working CLI)

#### v0.5.2 🚧 — **Headline: multi-account profile switching** (Sprint 7)

Direct answer to the cc-switch (75K stars) / V2EX demand cluster — see research §3.

- `clihub profile <create|use|list|switch|rm|clone|current>` for multi-account workflows
- Profile storage at `~/.clihub/profiles/<name>/` with HOME / XDG override on activate
- System-keychain credential vault (macOS Keychain / libsecret / Windows Credential Manager)
- `clihub.yaml profile:` per-project override (auto-switch on directory entry)
- Cross-profile share rules (skills shared, API keys not)
- Unified OAuth flow → token routed to each CLI's native credentials file
- **OAuth token-expiry recovery**: detect expired tokens, surface re-auth UX (addresses GH #33811 / #34306)
- **Per-profile `BASE_URL` injection** — write `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` / `GOOGLE_API_BASE` into each CLI's settings when the profile points at a self-hosted gateway (LiteLLM / Nyro). Config-adapter only; no data-plane routing.

#### v0.5.3 🚧 — `clihub.yaml` + lockfile + version pin/rollback (Sprint 8)

- `clihub.yaml` declarative project config (see [`19-CLIHUBYAML.md`](19-CLIHUBYAML.md))
- `clihub init` interactive scaffold
- `clihub apply --plan` / `--dry-run` (Terraform-style)
- `clihub.lock.json` generation + `clihub install --frozen`
- Structured audit log at `~/.clihub/audit.log`
- **New** — `clihub install <tool>@<version>` and `clihub rollback <tool>` (per-tool, nvm-style). Addresses "Claude Code is getting worse" / auto-update-broken pain (research §2 #7 / #8)

### v0.6 🚧 — federation + signing + skill audit

- sigstore-cosign signing of catalog manifests
- `clihub catalog add <url>` multi-source federation (apt-style sources)
- Regional mirror support (`CLIHUB_CATALOG_MIRROR=`)
- HTTP transport for MCP servers (currently stdio-only)
- New providers: Cursor, OpenCode, Goose, Junie
- `clihub team init` group lockfile + push/pull to private team catalog
- **New** — `clihub skill list --loaded --by-cli --permissions` audit dashboard. Shows what's actually installed across each CLI, with hook / symlink permissions called out. Addresses skill-sprawl + CVE-2026-39861 supply-chain concerns (research §2 #9 / #10)

### v0.7 — provider SDK + unified memory + spec drafts

- Provider SDK alpha (third-party `clihub-plugin-cursor`-style packages)
- Lifecycle hooks (pre-install / post-install / pre-rollback / post-apply)
- RFC drafts at `docs/spec/*` for SKILL.md, MCP-MANIFEST.json, PLUGIN.json, LockFile, Catalog
- `clihub completion` extended; `clihub help <topic>` long-form
- `clihub/setup-action@v1` for GitHub Actions
- **New** — `clihub memory generate` — one source `CONTEXT.md` emits `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` / `.kiro/steering/` simultaneously. Codifies the SKILL.md fragmentation pain (research §2 #1)

### v0.8 — cross-machine sync (Pillar XI)

Direct answer to GH #36693 / #57678 (research §2 #2).

- E2E-encrypted, key-derived-from-passphrase sync of: catalog selection, presets, profile metadata (not API keys — those stay in OS keychain), `clihub.yaml`, `clihub.lock.json`
- Self-host first: backend is a single static-file blob store (S3 / R2 / minio); CLI handles the crypto
- Optional **clihub Cloud** managed backend (Phase-2 monetisation lane — see [`13-MONETIZATION.md`](13-MONETIZATION.md))
- `clihub sync push` / `clihub sync pull` / `clihub sync status`

### v1.0 — stable API + registry beta

- Public API freeze + semver guarantee
- 100+ skills / 50+ MCP / 20+ plugins in the catalog
- VS Code extension thin client
- Documentation site (`clihub.dev`)
- `clihub.dev` registry beta (npm-style publish, no PR needed)
- `clihub-compatible` badge + automated compat test suite

### v2.0 — registry GA + enterprise

- Public registry GA
- Enterprise tier: SSO, private catalog, audit log, license-compliance scan
- Polyglot thin clients (Rust / Go) hitting the same registry
- CNCF Sandbox proposal

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
