# Roadmap

> Tactical sprint view (day-by-day, 4-week sprints + 3-month outlook): [`14-SPRINT.md`](14-SPRINT.md).
> Business model & monetisation phases: [`13-MONETIZATION.md`](13-MONETIZATION.md).
> Per-release change history: [`../CHANGELOG.md`](../CHANGELOG.md).

Status anchors: ✅ shipped · 🚧 in progress · 📋 planned

**Current: `@wikieden/clihub@1.1.0` — stable.** Frozen surface: `clihub.yaml`
schema v1, `clihub.lock.json` v1, the `@clihub/core` public API, and the
`clihub` CLI command set.

## Released

### v0.1 ✅ — MVP

- monorepo skeleton (bun workspaces), `@clihub/core` (settings, backup, i18n)
- `clihub` CLI (cac + clack TUI), i18n en + zh-CN
- ToolProvider `claude-code`, 5 core skills, `starter` preset
- doctor / backup / restore / rollback

### v0.2 ✅ — multi-CLI

- Codex + Kiro + Gemini providers, cross-tool `SkillSyncAdapter`s
- Catalog: 30 skills, 3 presets; i18n + ja / ko / es
- npm publish as `@wikieden/clihub`, single-binary tarball, zero install-time deps

### v0.3 ✅ — UX & health

- TUI per-CLI guided menus, preset preview, back navigation
- MCP catalog + `JsonMcpAdapter`; cross-CLI doctor matrix with `--json`
- Kiro install fix; Codex TOML settings adapter

### v0.4 ✅ — open standard + sync

- agentskills.io SKILL.md installer (`clihub skill install <git-url>`)
- Plugin install for Claude Code (`clihub plugin`, git clone into `~/.claude/plugins/`)
- Remote catalog sync (`clihub catalog sync`) with sha256 + manifest
- Windows-safe paths

### v0.5.x ✅ — Windows + config + multi-account

- **v0.5.0** — Windows portability, `clihub watch`, `clihub search`, shell completion, man page
- **v0.5.1** — proxy (HTTP/HTTPS/SOCKS5) + CA bundle, live quota in `doctor`, `doctor --fix`, `CLIHUB-E-NNN` error codes, first-run wizard
- **v0.5.2** — multi-account profile switching (`clihub profile`)
- **v0.5.3** — system-keychain credential vault, per-profile `BASE_URL` injection, `clihub.yaml profile:` auto-switch, audit log

### v0.6.x ✅ — federation + reproducibility

- **v0.6.0** — multi-source catalog federation (`catalog add`), Cursor + Goose providers (6 CLIs), HTTP/SSE MCP transport; per-tool version pin/rollback; skill audit
- **v0.6.1** — `clihub apply [--plan]`, `clihub lock`, `clihub install --frozen`; full `clihub.yaml` + `clihub.lock.json`

### v0.7.0 ✅ — clihub memory

- `clihub memory generate`: one source (`clihub.memory.md` → `AGENTS.md` → `CLAUDE.md`) fans out to `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` / `.cursor/rules/*.mdc` / `.goosehints` / `.kiro/steering/*.md`; managed-block markers; `--check` for CI

### v0.8.0 ✅ — cross-machine sync (Pillar XI)

- `clihub sync export|import`: E2E-encrypted config bundle (global config + catalog sources + profile metadata; API keys stay in the OS keychain). scrypt + AES-256-GCM, passphrase-only, zero backend

### v0.9.0 ✅ — signed catalogs (Pillar IV)

- ed25519 `catalog keygen` / `sign` + local trust store (`catalog trust add --source`)
- `catalog verify` checks sha256 integrity **and** publisher authenticity; pure `node:crypto`, no cosign dependency

### v0.10.0 ✅ — declarative provider SDK (Pillar V)

- Teach clihub a new AI CLI with a JSON spec (`~/.clihub/providers.json` or a catalog `providers.json`) — detection + npm/bun/brew install, no code or fork. `clihub provider list|add|remove`
- Shell-command installs gated behind `--allow-scripts`; built-in providers can't be shadowed

### v0.11.0 ✅ — clihub status (Pillar II)

- `clihub status [--json] [--strict]` checks the machine against the pinned `clihub.lock.json` (ok / drift / missing / unlocked); `--strict` exits non-zero for CI gates
- `clihub lock` resolves declarative providers too

### v0.12.0 ✅ — clihub schema

- `clihub schema [--out file]` emits a draft-07 JSON Schema for `clihub.yaml` (editor autocomplete + inline validation via the YAML language server)

### v1.0.0 ✅ — stable

- Public API freeze + semver guarantee. Frozen surface: `clihub.yaml` schema v1, `clihub.lock.json` v1, `@clihub/core` API, `clihub` command set
- `CHANGELOG.md` landed (0.1 → 1.0 history)

### v1.1.0 ✅ — clihub ci

- `clihub ci [github|gitlab] [--out file] [--node]` generates a CI workflow that validates `clihub.yaml` (`apply --plan`) on every push, with commented opt-ins for `memory generate --check` and `status --strict`

### v1.2.0 ✅ — clihub team (Pillar III + VII)

- `clihub team <add|list|pull|use|push|rm>` shares a reproducible toolchain through a plain git repo (cloned into `~/.clihub/team/<name>`). `push` commits `clihub.yaml` / `clihub.lock.json` / `clihub.memory.md` / `clihub.schema.json`; `use` pulls them into a project. No clihub-specific backend

### v1.3.0 ✅ — auth status (Pillar IX, first slice)

- `clihub auth status [--json]` — cross-CLI login + token-expiry visibility (best-effort, read-only read of each CLI's credential file; never prints token contents). Addresses GH #33811 / #34306 visibility

### v1.4.0 ✅ — clihub pack (Pillar VI — reach)

- `clihub pack <docker|brew|scoop> [--out file]` generates distribution manifests (Dockerfile / Homebrew formula / Scoop manifest). A richer multi-arch `Dockerfile` + `docker.yml` workflow already ship in-repo

## Specifications (Pillar I)

Open specs so other clients can implement the same formats — see
[`spec/`](spec/). **Stable** (shipped): [Provider JSON](spec/01-PROVIDER-SPEC.md) (v0.10),
[`clihub.lock.json` v1](spec/02-LOCKFILE.md) (v0.6.1). **Draft** (design for
infra-blocked items): [Unified OAuth](spec/03-OAUTH-FLOW.md),
[Registry API](spec/04-REGISTRY.md).

## Next

> The remaining items are blocked on **external infrastructure** a local,
> backend-free tool can't ship solo (vendor OAuth client ids, a hosted
> registry, marketplace/winget submissions). Each has a design spec above
> so the contract is fixed; implementation lands when the dependency is
> available.

### v1.5.0 ✅ — clihub auth login (Pillar IX)

- `clihub auth login <provider>` — OAuth 2.0 device grant (RFC 8628), BYO provider config in `~/.clihub/auth-providers.json`; token written to the CLI's native credential file (0600). Headless/CI-friendly, security-reviewed. See [`spec/03-OAUTH-FLOW.md`](spec/03-OAUTH-FLOW.md)

### v1.6.0 ✅ — auth refresh (Pillar IX, completes unified-auth core)

- `clihub auth login <provider> --refresh` — RFC 6749 refresh-token grant; re-mints an access token from the stored `refresh_token` (rotated if returned), no browser. Token-expiry recovery

## Later

### 📋 — browser/PKCE login variant

- `clihub auth login` PKCE/loopback variant for providers without a device flow
- Managed **clihub Cloud** team backend remains optional (Phase-2 monetisation — see [`13-MONETIZATION.md`](13-MONETIZATION.md)); git-repo team sharing shipped in v1.2

### v1.6 📋 — more reach + IDE

- `winget` / `scoop` packaging; Docker image
- VS Code / JetBrains thin clients hitting `@clihub/core`
- ✅ first `docs/spec/*` RFC drafts landed (Provider JSON, LockFile, OAuth, Registry); SKILL.md / MCP-MANIFEST / PLUGIN.json drafts still to write
- `winget` packaging (needs an MSI/exe; `pack scoop`/`pack brew`/`pack docker` already ship)
- VS Code / JetBrains thin clients hitting `@clihub/core`

### v1.7.0 ✅ — conformance suite (Pillar VII, client side)

- `clihub conformance [dir] [--json]` validates a catalog against the specs (manifest + sha256, JSON, provider specs, signature, lockfile). The machine-checkable basis for the `clihub-compatible` badge

### 📋 — registry beta (Pillar VII, server side — external-infra blocked)

- `clihub.dev` registry beta (npm-style publish, no PR) — needs a hosted backend; see [`spec/04-REGISTRY.md`](spec/04-REGISTRY.md)
- Documentation site at `clihub.dev`

### v2.0 📋 — registry GA + enterprise

- Public registry GA
- Enterprise tier: SSO, private catalog, audit log, license-compliance scan
- Polyglot thin clients (Rust / Go) on the same registry
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
| alirezarezvani/claude-skills adds CLI install | high | shipped to npm + presets + rollback first |
| AI CLI shake-out: a CLI dies | high | provider abstraction; drop the provider, no user impact |
| nobody cares (silent fail) | medium | HN / Reddit / V2EX launch on the 1.x stable line |
| translation drift | low | LLM-assisted + native-speaker review on release |
| Windows compat | medium | recruit Windows beta users early |
| maintainer bandwidth | high | declarative provider SDK opens up provider development |
