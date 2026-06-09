# clihub — Vision

## One-liner

**The reproducible control plane for AI coding.** One kernel — reachable from CLI, TUI, and a desktop GUI — to install, configure, and switch 7 AI coding CLIs (Claude Code, Codex, Gemini, Qwen Code, Kiro, Cursor, Goose); keep their skills / MCP / memory / system-prompts in sync; 1-click-switch providers from a **signed** preset catalog; optionally route every request through a **self-hosted local gateway** (failover, account pool, circuit-breaker); and pin **all of it** — versions, providers, routing topology — into a signed `clihub.lock.json` that a CI drift gate enforces. A superset of CC Switch that stays reproducible, local-first, and supply-chain-signed.

> **Strategic vs tactical.** "Reproducible control plane" is the strategic position; "superset of CC Switch" is a tactical comparison hook, not the headline. The defensible moat is the four things no switcher or gateway has — resolved-version lockfile + CI drift gate, ed25519-signed *federated* catalog, install-the-CLIs breadth, version pin/rollback — and **every new surface (provider switch, gateway routing) is expressed as pinned + signed + drift-gated**, or it is just a me-too feature. The gateway's killer differentiator is not failover (LiteLLM does it better) — it is that *your whole LLM routing topology is a reviewable, signed, reproducible artifact*.

Stable since `@wikieden/clihub@1.0.0`.

## Mission

Make AI coding tooling feel like `git`, `npm` and `brew` — boring, reliable, vendor-neutral. When a new CLI lands, users bring their entire stack (skills, MCP servers, accounts, proxy config) with them. When a team needs reproducible environments, clihub locks them. When a vendor changes its skill format, clihub absorbs the delta.

clihub aims to be the **default substrate** every AI coding workflow runs on top of — not a tool you choose, but the layer that makes the choice irrelevant.

## Why this exists

Every AI coding CLI ships its own bespoke layout for skills, plugins and MCP servers. Running more than one means:

- Reinstalling the same skill in four different folders.
- Manually copying `superpowers` to `~/.claude/skills/`, `~/.codex/skills/`, `~/.kiro/skills/`, `~/.gemini/skills/`.
- Watching an unrelated upgrade flatten your config with no way back.

clihub fixes all three with a single binary.

## Three-layer positioning

| Layer | What clihub is | Analogy |
|---|---|---|
| **Bottom** | Meta-installer for AI CLIs | brew for AI CLIs |
| **Middle** | Cross-CLI skill / MCP / plugin sync engine | rsync for agent config |
| **Top** | Personal & team AI-coding environment manager | dotfiles for 2026 |

## Target users (priority order)

Near-term focus is **individuals and newcomers**; the enterprise control
plane is a later, separately-packaged line (see [`11-ROADMAP.md`](11-ROADMAP.md) → "Enterprise line").

1. **Newcomers** — TUI onboarding, one-shot presets, native language, no-fear backup/rollback. Zero → working in minutes.
2. **Multi-CLI power users (individual)** — running 2+ CLIs; cross-CLI skill/MCP/memory sync, version pin/rollback, multi-account profiles, cross-machine sync. Deepest daily pain, seed users.
3. **Skill / plugin authors** — clihub becomes the distribution channel (oh-my-zsh : zsh).
4. **Teams & enterprises** — reproducibility (lock/status/CI), signed catalogs, audit. Already usable at team scale via git; the SSO/registry/console layer spins off into a separate enterprise product later.

## Competitive moat

Landscape splits into two camps: **AI-CLI provider-switchers** (our real
competitors) and **runtime/version managers** (where we borrow primitives).
Verified against each project's docs/repos (2026-06 competitive analysis).

| Competitor | Camp | What it does | clihub-only |
|---|---|---|---|
| **CC Switch** (`farion1231/cc-switch`) | AI-CLI switcher | desktop app: 1-click provider switch + unified MCP + Skills across Claude Code / Codex / Gemini / OpenCode | 7-CLI breadth (adds Kiro/Cursor/Goose/Qwen); native-schema fan-out; signed **federated** catalog; resolved-version lockfile + CI drift gate; E2E cross-machine sync |
| **ccs / CLIProxyAPI** | AI-CLI switcher | multi-account via an OAuth **runtime proxy** that routes LLM traffic | clihub writes each CLI's *native* config — a config-adapter, **not** a data-plane proxy (see Non-goals) |
| mise / asdf / proto / aqua | version manager | manage tool *versions* vertically; ship exec wrappers, registries, lockfiles, signing | none unify a heterogeneous fleet of AI CLIs or speak their config schemas; we adopt their `exec` + lockfile-integrity primitives |
| chezmoi | dotfile manager | Go-template files + per-machine vars + encrypted secrets | schema-aware of 7 AI CLIs (writes idiomatic JSON/TOML/YAML), not opaque file blobs |

**Moat depth** (verified, deepest first):
1. **7-CLI horizontal unification** — install **and** configure 7 distinct AI CLIs. Version managers manage versions vertically; CC Switch tops out at ~4 CLIs.
2. **Native idiomatic-schema fan-out** — one source maps into each CLI's own layout (skills / memory / MCP across JSON / TOML / YAML). No version manager does semantic config fan-out; chezmoi templates files but doesn't speak each CLI's schema.
3. **ed25519-signed *federated* catalog** + pinned-publisher trust store — unique in the AI-CLI field (CC Switch / Smithery don't sign); on par with aqua's supply-chain posture, but federated multi-source.
4. **Resolved-version lockfile + CI drift gate** (`status --strict`) — rare even among version managers; no AI-CLI competitor ships a lockfile + CI gate.
5. **E2E-encrypted cross-machine sync** + git-backed team config — schema-aware of the 7 CLIs, not opaque blobs.
6. Per-CLI proxy / base-URL / profile injection + cross-CLI OAuth/keychain credential visibility.
7. Skill audit (shell / hooks / network / symlink risk) on install — no competitor reviews skill payloads.
8. Declarative provider SDK — add any CLI via JSON spec, no fork; presets + the open `agentskills.io` SKILL.md installer; i18n (zh / ja / ko / es).

## Engineering footprint

One kernel, many surfaces — **`@clihub/core` is the single source of truth**; every
front-end is a thin shell over it and they never fork logic (enforced by golden
parity tests: GUI result == CLI result == kernel call). This repo (formerly
`CCEnvOneCLick`) carries:

1. **`@clihub/core`** — the kernel (providers, adapters, catalog, lock, sync, gateway logic).
2. **`@wikieden/clihub` npm package** — CLI + Clack **TUI** (first-class; headless / CI / server / power-user surface).
3. **`clihub-desktop` (Tauri 2)** — native **desktop GUI**; tray, 1-click switch, MCP/skills panels, gateway dashboard, drift/lockfile banners. Co-equal with the CLI/TUI, never the only entry point.
4. **`@clihub/gateway`** — optional, off-by-default, loopback-only local gateway daemon (separate package, not in default install).
5. **`clihub` Claude Code skill** + **`/clihub` slash command** — the same kernel from inside the agent.
6. **Catalog** — `skills.json`, `tools.json`, `presets.json`, `mcp.json`, `plugins.json`, and `endpoints.json` (signed LLM-endpoint presets).
7. **Install scripts** (`curl | sh` + git-clone fallback) + **statusline**.

## Core value props

1. **One entry covers the whole flow** — install the CLI, install its skills, patch settings, add MCP, set hooks.
2. **In-tool self-hosting** — once installed, the user runs operations from inside Claude Code via the `clihub` skill.
3. **Cross-CLI** — Claude Code / Codex / Kiro / Gemini share one source of truth.
4. **One skill source, many adapters** — provider abstraction maps the same skill into each CLI's extension mechanism.
5. **i18n by default** — auto-detect from `$LANG`, override with `CLIHUB_LANG`.
6. **Safety rails** — every write is preceded by a timestamped backup; `--dry-run` + `rollback` available everywhere.

## Infrastructure pillars

clihub graduates from "useful CLI" to "AI coding substrate" along eleven pillars. The first eight describe the technical substrate; IX–X are what make ordinary people pick it up; XI is what makes them stay.

| # | Pillar | What it means | Status |
|---|---|---|---|
| I | **Spec & standards** | clihub authors / endorses open specs for SKILL.md, MCP, PluginManifest, LockFile, Catalog. Other clients can implement against the spec without using clihub. | ✅ SKILL.md installer (v0.4) + `clihub.yaml` JSON Schema (v0.12); RFC drafts 📋 v1.4. |
| II | **Reproducibility** | `clihub.lock.json`, `clihub install --frozen`, plan/apply (Terraform-style), structured audit log, compliance gate. Same lockfile → same world. | ✅ apply/lock/install --frozen (v0.6.1) + `clihub status` (v0.11). |
| III | **Federation** | Multiple catalogs (`clihub catalog add <url>`), regional mirrors, private team catalogs, conflict arbitration. | ✅ multi-source federation (v0.6.0); team push/pull 📋 v1.3. |
| IV | **Trust** | signed catalog releases, SHA256 verified files, npm provenance, local trust store. | ✅ ed25519 signing + trust store (v0.9); npm provenance ✅. |
| V | **Composability** | Provider SDK + Adapter SDK + lifecycle hooks. Third-party specs add CLIs we don't ship. | ✅ declarative provider SDK (v0.10); lifecycle hooks 📋. |
| VI | **Reach** | macOS / Linux / Windows; npm / brew / scoop / winget / apt / docker; CI action; VS Code / JetBrains thin clients. | ✅ Windows (v0.5.0) + `clihub ci` workflow gen (v1.1); winget/scoop/IDE 📋 v1.4. |
| VII | **Community** | Public registry, RFC process, compatibility test suite, `clihub-compatible` badge. | 📋 registry beta v1.5. |
| VIII | **Adoption** | Vendor partnerships (Anthropic, OpenAI, Google, AWS), competitor inter-op, course / book inclusions. | continuous; 1.x stable line is the launch surface. |
| **IX** | **Config management** | Proxy support (HTTP/HTTPS/SOCKS5, MITM CA bundle), profile switching for multi-account, system-keychain credential vault, unified OAuth across CLIs, per-profile `BASE_URL` injection. | ✅ proxy (v0.5.1) + profiles/keychain/BASE_URL (v0.5.2–0.5.3); unified OAuth 📋 v1.2. |
| **X** | **Ease of use** | First-run wizard, in-TUI search, recent / favourites, tab completion, error codes with linked docs, `doctor --fix` autoremediation, man pages, live quota meter, smart defaults. | ✅ search/completion/man (v0.5.0) + wizard/quota/`doctor --fix`/error codes (v0.5.1). |
| **XI** | **Cross-machine sync** | E2E-encrypted sync of catalog selection + presets + profile metadata + `clihub.yaml`/`clihub.lock.json` (not API keys — those stay in OS keychain). Self-host first; clihub Cloud optional. | ✅ `clihub sync` export/import (v0.8); managed clihub Cloud 📋 (Phase-2 monetisation). |

Each pillar feeds the others: Pillars I–IV make clihub credible as infra; V–VII make it self-sustaining; VIII gets it picked up; IX–X stop new users bouncing; XI keeps them across machines.

## Cultural principles

1. **Vendor-neutral** — never favour one CLI, even though Claude Code is the lead workload.
2. **Open standards first** — agentskills.io SKILL.md, MCP, OCI images when relevant.
3. **Zero telemetry by default** — opt-in only, and only for aggregate counters.
4. **TUI is first-class** — never a second-class citizen to the flag-driven CLI.
5. **Rollback is sacred** — backups are never overwritten; we never lose user state.

## Non-goals

- Don't replace the AI CLIs (no Claude Code rewrite).
- **The gateway is local-only and opt-in — never a hosted data-plane.** clihub ships an *optional, off-by-default, loopback-only* local gateway (`@clihub/gateway`, a separate package, **not** in the default install) for provider failover / account-pooling / circuit-breaking. It must never become a hosted/multi-tenant request-routing **service**, a metered virtual-key SaaS (that lane is LiteLLM / CliGate), or bind a non-loopback address without an explicit `--unsafe-bind` + confirmation. Keys never persist outside the OS keychain — read in only at request time, zeroized per-request, never synced, never logged. **Same-format pass-through only**: no cross-provider format conversion (Anthropic↔OpenAI↔Gemini translation is a correctness liability that stays with claude-code-router / LiteLLM). The gateway holds live keys in the request path, so it ships behind a blocking security review (see [`22-GATEWAY-SECURITY.md`](22-GATEWAY-SECURITY.md)).
- Don't ship a closed enterprise console (that's a paid future tier, but the local CLI stays open).
- Don't require a cloud account for the local tool.

## Success metrics (per stage)

Feature surface is built; v0.1 → v1.1 all shipped to npm. The metrics
below are now the **adoption** targets for the stable 1.x line, not
feature gates.

| Stage | Weekly npm downloads | GitHub stars | Notes |
|---|---|---|---|
| 1.0 launch | 500 | 200 | HN / Reddit / V2EX launch on the stable line |
| 1.x | 1.5k | 500 | demo GIF, docs site, early adopters |
| 1.x + unified auth (v1.2) | 3k | 1k | OAuth + team lockfile pull-in |
| registry beta (v1.5) | 4k | 1.5k | community publish, `clihub-compatible` badge |
| v2.0 | 50k/month | 10k | registry GA, enterprise pilot ≥3 |

## Related design docs

- [`docs/11-ROADMAP.md`](11-ROADMAP.md) — release plan v0.1 → v2.0.
- [`docs/20-COMPETITIVE.md`](20-COMPETITIVE.md) — competitive landscape + positioning (version managers + AI-CLI field).
- [`docs/22-GATEWAY-SECURITY.md`](22-GATEWAY-SECURITY.md) — gateway threat model + security design.
- [`docs/23-ARCHITECTURE.md`](23-ARCHITECTURE.md) — post-pivot architecture (one kernel, many shells, gateway, GUI).
- [`docs/24-VERSION-PLAN.md`](24-VERSION-PLAN.md) — per-version delivery spec (P0 → v2.0).
- [`docs/13-MONETIZATION.md`](13-MONETIZATION.md) — three-phase business model.
- [`docs/14-SPRINT.md`](14-SPRINT.md) — day-by-day sprint plan.
- [`docs/17-INFRA-PILLARS.md`](17-INFRA-PILLARS.md) — ten pillars in depth.
- [`docs/18-CONFIG-PROXY-PROFILE.md`](18-CONFIG-PROXY-PROFILE.md) — proxy + profile + keychain design.
- [`docs/19-CLIHUBYAML.md`](19-CLIHUBYAML.md) — `clihub.yaml` schema draft.
