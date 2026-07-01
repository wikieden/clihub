# Roadmap

> Tactical sprint view (day-by-day, 4-week sprints + 3-month outlook): [`14-SPRINT.md`](14-SPRINT.md).
> Business model & monetisation phases: [`13-MONETIZATION.md`](13-MONETIZATION.md).
> Per-release change history: [`../CHANGELOG.md`](../CHANGELOG.md).

Status anchors: ✅ shipped · 🚧 in progress · 📋 planned

**Current: `@wikieden/clihub@1.74.0` — stable.** Frozen surface: `clihub.yaml`
schema v1, `clihub.lock.json` v1, the `@clihub/core` public API, and the
`clihub` CLI command set. Since v1.21 the line has grown coverage +
correctness (full per-release history in [`../CHANGELOG.md`](../CHANGELOG.md)):
Qwen Code (v1.44) then **OpenCode as the 8th CLI** (v1.65); **Antigravity (`agy`)
replaced Gemini** as the Google surface; **per-CLI provider binding**
(`clihub use/model`, v1.65) writing each CLI's native idiom; **Phase-1b** prompt /
usage / cloud-sync / self-update / lockfile prompt-gate (v1.60); and the **desktop
GUI control plane** — two-window menubar app, desktop-app proxy launcher
(Claude/Codex/Kiro + Chrome/Edge/Brave), per-surface usage rollup, and auto-update
(v1.69–1.74). Unified MCP management spans Claude / Qwen / OpenCode (JSON) +
Codex (TOML).

> **Doc-sync note (2026-06-29).** Code is at v1.74; the PIVOT phase table below is
> kept as the original plan with **actual shipped versions annotated** — P1a/P1b
> shipped, and **P3 (GUI) advanced ahead of P2 (gateway)**, which is still behind
> the P2 GATE (no `@clihub/gateway` package yet; `@clihub/daemon` exists only as the
> GUI sidecar). `CHANGELOG.md` top entry (v1.65) also trails the v1.66–1.74 release
> commits — backfill pending.

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

## Released (continued)

### v1.5.0 ✅ — auth login: OAuth device grant

- `clihub auth login <provider>` — OAuth 2.0 device grant (RFC 8628), BYO provider config in `~/.clihub/auth-providers.json`; token written to the CLI's native credential file (0600). Headless/CI-friendly, security-reviewed. See [`spec/03-OAUTH-FLOW.md`](spec/03-OAUTH-FLOW.md)

### v1.6.0 ✅ — auth refresh

- `clihub auth login <provider> --refresh` — RFC 6749 refresh-token grant; re-mints an access token from the stored `refresh_token` (rotated if returned). Token-expiry recovery

### v1.7.0 ✅ — conformance suite (Pillar VII, client side)

- `clihub conformance [dir] [--json]` validates a catalog against the specs (manifest + sha256, JSON, provider specs, signature, lockfile). Machine-checkable basis for a `clihub-compatible` badge

### v1.8.0 ✅ — PKCE browser login

- `clihub auth login <provider> --browser` — OAuth Authorization Code + PKCE (RFC 7636), 127.0.0.1 loopback redirect, CSPRNG state, S256 challenge. Security-reviewed. Three login modes complete: device / browser / refresh

### tests ✅ — automated suite

- `bun test` unit suite for `@clihub/core` (signing, memory, sync, clihubyaml, generators, auth) + a CI `unit` job on push/PR

### v1.9.0 ✅ — onboarding polish + quality

- First-run guidance: empty-machine welcome + "🚀 Quick start" (starter preset) in the TUI; `doctor` prints a get-started hint when nothing is installed
- Quality: test suite → 33 tests / 10 files — i18n key-set parity guard (en/zh-CN/ja/ko/es) + IO coverage (status / conformance / memory)

## Direction

**Near-term focus: individual developers + newcomers.** Polish the
zero-to-working, multi-CLI-in-sync, no-fear-upgrade experience. The
team/enterprise surface that already shipped (`team` / `ci` / `status` /
`conformance` / signed catalogs / profiles / proxy) stays maintained but is
**not** the active investment area — it will spin off into a separate
enterprise line later (see "Enterprise line" below).

### v1.10.0 ✅ — clihub recommend (discovery)

- `clihub recommend [--json]` — suggests skills / presets / MCP from installed CLIs + project signals (cwd files → tags); each with a reason + ready command. Read-only/advisory

### v1.11.0 ✅ — profile shell hook

- `clihub profile hook <bash|zsh|fish>` — auto-activates the profile named in a directory's `clihub.yaml` on `cd` (completes the v0.5.2 deferred auto-switch)

### v1.12.0 ✅ — clihub diff

- `clihub diff <a> [b]` — diffs two `clihub.lock.json` (added / removed / upgraded / downgraded tools + skills/mcp/plugins presence); `--json`. Read-only

### v1.13.0 ✅ — unified MCP management

- `clihub mcp <list|add|remove> [id]` across the JSON-`mcpServers` CLIs (Claude Code, Gemini CLI); catalog or inline `--command`/`--url`. Orchestrates JsonMcpAdapter

### v1.14.0 ✅ — grow the catalog

- Five new presets (`python` / `go` / `rust` / `research` / `devops`) — 8 total; + a catalog-integrity test (preset skill/tool ids must resolve)

### v1.15.0 ✅ — grow the MCP catalog

- +6 official MCP servers (postgres / sqlite / git / gitlab / slack / brave-search) — 14 total; + MCP integrity test

### v1.16.0 ✅ — clihub init upgrade

- `clihub init --from-installed` (infer tools + skills from this machine/project) + `--schema` (schema header + write clihub.schema.json)

### v1.17.0 ✅ — clihub wizard (first-run setup)

- `clihub wizard` — guided flow: select/install CLIs → preset → proxy → multi-account profiles + apikey → emit clihub.yaml / schema / memory. `--dry-run`. Core `planWizard` (pure, tested). Addresses the newcomer feedback (no first-run wizard / no proxy entry / no multi-account+key in setup)

## Planned (individual + newcomer — buildable now)

### v1.18.0 ✅ — wizard in the menu + run a CLI

- Setup wizard re-runnable from the TUI main menu (extracted to `wizard-flow.ts`); each installed CLI submenu gains a **▶ Run** entry to launch it

### v1.19.0 ✅ — project scaffold files

- `clihub init --scaffold` + wizard step writes `.editorconfig` / `.gitignore` / `.github/workflows/clihub.yml` (never overwriting). Agent memory files remain owned by `memory generate`

### v1.20.0 ✅ — wizard multiple keys per account

- The wizard loops "add another key?" per account profile; each → `auth set` in that profile's keychain

### v1.21.0 ✅ — wizard per-CLI skill selection

- Pick a different skill set per selected CLI → tool-scoped `clihub.yaml` skill entries. **Wizard fill list complete** — all newcomer feedback shipped

### PIVOT — CC Switch superset: config + local gateway + GUI (2026-06)

clihub becomes a **superset of CC Switch** (provider switching, bidirectional MCP,
50+ presets, import) PLUS an **opt-in local gateway** (failover / account-pool /
circuit-breaker) PLUS a **native desktop GUI** — while making the **reproducibility
moat the protagonist of every feature**. Strategic position = *"reproducible
control plane for AI coding"*; *"superset of CC Switch"* is a tactical hook, not the
headline. Three surfaces over one kernel (`@clihub/core`): CLI/TUI
(`@wikieden/clihub`), desktop GUI (`clihub-desktop`, Tauri 2), and the opt-in
gateway (`@clihub/gateway`, off by default, not in the default install). The
gateway's differentiator is **not** failover (LiteLLM wins that) — it is that the
routing topology is **pinned + signed + CI-drift-gated**. See
[`00-VISION.md`](00-VISION.md) and the threat model
[`22-GATEWAY-SECURITY.md`](22-GATEWAY-SECURITY.md).

> **Honesty notes (from the design review):** `v1.61→1.70` is **a quarter, not ten
> point-releases**. Cross-provider **format conversion is removed** from the
> committed roadmap (Anthropic↔OpenAI↔Gemini translation is a correctness liability
> — pass-through only). **OAuth/subscription account-pooling is not shipped** (vendor
> ToS / ban risk) — API-key pooling only. Several "pure reuse" claims were wrong
> against the code (only anthropic/openai/google have base-URL injectors;
> goose/YAML can't be pointed at the gateway via the existing seam; gateway egress
> is a net-new HTTP client; `endpoints.json` did not exist pre-P1a, now shipped) — tracked in the
> threat model.

| Phase | Versions | Scope | Headless? | Effort |
|---|---|---|---|---|
| **P0** (now) | docs | reframe VISION/COMPETITIVE non-goals to *hosted/multi-tenant only*; write the gateway threat model **first** as a design constraint | docs | S ✅ landing |
| **P1a** ✅ shipped v1.61–1.65 | v1.51–1.54 | signed `providers.json` preset catalog (50+); **1-click `provider switch`** (anthropic/openai/google only — others need new injectors); deep-link `import` (clihub:// + best-effort ccswitch://); **bidirectional MCP reconcile** (read-back + 3-way merge, default `--union`) | **YES, fully** | M |
| **P1b** ✅ shipped v1.60 | v1.55–1.60 | cross-CLI **system-prompt** mgmt; **cloud-folder sync** (iCloud/Dropbox/OneDrive/WebDAV) + `sync --watch` + redaction guard; `self-update` channel; **`clihub exec`** (ephemeral run-with-injected-context); **per-machine overlay** (`clihub.local.yaml` + `{{hostname}}`/`${VAR}` + extends/merge + team 3-way); usage = **tokens-only best-effort (never a $ figure)**; **provider pinned in `clihub.lock` + CI drift gate — the 1.60 headline.** CC Switch CONFIG PARITY declared | **YES** | M |
| **P2 GATE** | decision | start the gateway **only** if P1 shows real adoption AND there is budget for a 3–4-month key-holding-daemon project incl. human-in-loop live-key testing. Else STOP — P1 is a complete, differentiated product | — | — |
| **P2** ❌ not started (behind P2 GATE) | TBD | **gateway MVP**, separate `@clihub/gateway`, OFF by default, **pass-through only**: loopback bind + DNS-rebind/Host guard + 256-bit bearer on **every** endpoint + **mandatory keychain floor** (hard-refuse `file` backend) + **per-request key zeroize** + default-no-body-logging + **signed-host-pinset re-verified at start** + API-key-only pool + circuit-breaker. **Blocking external security review = the exit criterion** (never self-approved) | **partly** (live-key tests need humans) | **L (≈ a quarter)** |
| **P2b** | post-review | account-pool selection, active health probes → doctor matrix, **`gateway:` block lockfile-pinned + CI-drift-gated** (the moat differentiator), rate-limit/drain, OS-service install. **No format conversion.** | partly | M |
| **P3** 🚧 shipping early v1.69–1.74 (ahead of P2) | v2.0 → pulled forward | **native Tauri 2 desktop GUI** (owner decision) — thin shell over `@clihub/core` via a `@clihub/daemon` sidecar; lead panels = **drift / lockfile / gateway dashboard** (never a provider dropdown first); golden parity tests (GUI == CLI == kernel). Code-signing / notarization (Apple Developer ID + Windows EV) is a funded effort. **CLI/TUI stay co-equal, never the only entry point** | shell needs human QA | M (new toolchain) |

Ongoing alongside: grow catalog skills / MCP entries; newcomer-experience polish.

### Planned — CN model breadth + ACP editor wiring 📋

Full design + verified install/config details in [`27-CN-CLI-ACP-SUPPORT.md`](27-CN-CLI-ACP-SUPPORT.md).
Extends the two existing seams (endpoint catalog + ToolProvider) to the domestic
Chinese ecosystem, and adds a third surface — registering installed CLIs into
editors (Zed / JetBrains) over **ACP (Agent Client Protocol)**.

| Phase | Scope | Headless? | Effort |
|---|---|---|---|
| **CN-P1** | 4 endpoint rows in [`endpoints.json`](../packages/catalog/endpoints.json) — `glm` (z.ai), `moonshot` (Kimi), `minimax` + `minimax-cn` (anthropic+openai dialects) + auth-env wiring; refresh DeepSeek models. **Zero new code** — reuses the binding machinery so all 6 endpoint-capable CLIs can run CN models | **YES** | S |
| **CN-P2** | **Kimi Code CLI** ToolProvider (`@moonshot-ai/kimi-code`, binary `kimi`, `~/.kimi-code/config.toml` TOML) + a TOML BindingAdapter so it is both a managed tool and an endpoint target | **YES** | M |
| **CN-P3** | **ACP wiring** — per-provider `acp?: {command,args}` metadata + `clihub acp wire <tool> --editor zed` writes the editor `agent_servers` block. clihub's 8 providers are all in the 43-agent ACP registry; this covers GUI users without per-tool GUI providers | shell QA | M |
| **CN-P4** | **Qoder CLI** ToolProvider (binary `qoder`, ACP `qoder acp`, `~/.qoder-cn/settings.json`, proprietary backend → model-only binding). Install command TBD | partly | M |
| **CN-P5** (opt) | GLM Agent ACP entry / ZCode GUI provider | — | low pri |

> **Scope note.** DeepSeek + MiniMax have no official CLI → endpoint-only. GLM has
> no standalone CLI (ZCode is a GUI ADE) → endpoint-first. Only **Kimi** and **Qoder**
> ship an official CLI binary worth a ToolProvider. ACP is the lever that turns
> "install + switch" into "install + switch + one-click editor integration".
> Verify-before-build checklist lives in doc 27 §6.

## Enterprise line (future spin-off)

The shipped team primitives — `team`, `ci`, `status`, `conformance`, signed
catalogs, profiles/proxy — form the base. The control plane on top is
**deferred and will be packaged separately** (its own product / pricing),
not on the personal main line. Each item is also blocked on external
infrastructure; the specs fix the contracts:

- **Registry server** (`clihub.dev`) — hosted publish/search backend. [`spec/04-REGISTRY.md`](spec/04-REGISTRY.md)
- **clihub Cloud** — managed team backend (Phase-2 monetisation, [`13-MONETIZATION.md`](13-MONETIZATION.md)); git-repo team sharing already ships (v1.2)
- **SSO + central admin console + license-compliance scan + usage dashboards**
- **Distribution gaps:** winget (needs an MSI/exe), VS Code / JetBrains marketplace clients
- Polyglot thin clients (Rust / Go); CNCF Sandbox proposal

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
| CC Switch (or another AI-CLI switcher) adds breadth | high | moat is lockfile + CI drift gate + signed *federated* catalog + native-schema fan-out + E2E sync — keep widening CLI coverage and depth, don't compete on the runtime-proxy axis |
| AI CLI shake-out: a CLI dies | high | provider abstraction; drop the provider, no user impact |
| nobody cares (silent fail) | medium | HN / Reddit / V2EX launch on the 1.x stable line |
| translation drift | low | LLM-assisted + native-speaker review on release |
| Windows compat | medium | recruit Windows beta users early |
| maintainer bandwidth | high | declarative provider SDK opens up provider development |
