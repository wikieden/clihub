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

### v0.5 — Windows + config + ease of use

Expanded scope after the infra-vision review. v0.5 now covers Pillars IX (Config) and X (Ease of Use) in addition to the original observability slice. Splits into four shippable tranches (v0.5.0 → v0.5.3).

**v0.5.0 — Windows + watch + search** (Sprint 5):

- Windows paths / PowerShell shebang / CRLF handling
- `clihub watch` — detect CLI upgrades, auto-backup, surface rollback CTA
- Skill / plugin / MCP full-text search (`clihub search <query>`)
- Quota / usage signals in `doctor` where vendor APIs expose them
- Tab completion for bash / zsh / fish / PowerShell
- man page auto-gen

**v0.5.1 — Proxy + CA + ease wins** (Sprint 6):

- Recognise `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` / `NO_PROXY`
- Bearer-auth and SOCKS5 proxy URLs (`socks5://user:pass@host:port`)
- `clihub config set proxy.http <url>` persistent override
- Custom CA bundle (`clihub config set ca-bundle <path>`) for corp MITM
- Inject proxy env into Claude Code / Codex / Gemini / Kiro settings
- `clihub doctor --fix` auto-remediation pass
- Error code system (`CLIHUB-E-NNN`) with linked docs
- First-run TUI wizard (≤ 5 steps, ≤ 60 s to first working CLI)

**v0.5.2 — Profiles + keychain** (Sprint 7):

- `clihub profile <create|use|list|switch|rm|clone|current>` for multi-account workflows
- Profile storage at `~/.clihub/profiles/<name>/` with HOME / XDG override on activate
- System-keychain credential vault (macOS Keychain / libsecret / Windows Credential Manager)
- `clihub.yaml profile:` per-project override (auto-switch on directory entry)
- Cross-profile share rules (skills shared, API keys not)
- Unified OAuth flow → token routed to each CLI's native credentials file

**v0.5.3 — Apply / lockfile draft** (Sprint 8):

- `clihub.yaml` declarative project config (see [`19-CLIHUBYAML.md`](19-CLIHUBYAML.md))
- `clihub init` interactive scaffold
- `clihub apply --plan` / `--dry-run` (Terraform-style)
- `clihub.lock.json` generation + `clihub install --frozen`
- Structured audit log at `~/.clihub/audit.log`

### v0.6 — federation + signing + team mode

- sigstore-cosign signing of catalog manifests
- `clihub catalog add <url>` multi-source federation (apt-style sources)
- Regional mirror support (`CLIHUB_CATALOG_MIRROR=`)
- HTTP transport for MCP servers (currently stdio-only)
- New providers: Cursor, OpenCode, Goose, Junie
- `clihub team init` group lockfile + push/pull to private team catalog

### v0.7 — provider SDK + spec draft

- Provider SDK alpha (third-party `clihub-plugin-cursor`-style packages)
- Lifecycle hooks (pre-install / post-install / pre-rollback / post-apply)
- RFC drafts at `docs/spec/*` for SKILL.md, MCP-MANIFEST.json, PLUGIN.json, LockFile, Catalog
- `clihub completion` extended; `clihub help <topic>` long-form
- `clihub/setup-action@v1` for GitHub Actions

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
- `clihub cloud` E2E-encrypted sync of catalog + config across machines
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
