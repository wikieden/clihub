# clihub — Vision

## One-liner

**The infrastructure layer for AI coding.** One control plane to install Claude Code, Codex, Gemini, Kiro, Cursor and Goose side by side, keep their skills / MCP servers / plugins / memory files in sync, switch between accounts and proxies, pin and roll back versions, sign and verify catalogs, sync config across machines, and gate CI on a shared lockfile — with any new CLI added via a declarative spec, no fork.

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

1. **Multi-CLI power users** — running 2+ CLIs, deepest pain, seed users.
2. **Enterprise dev-tooling teams** — standardise the team's AI CLI stack, lock versions, audit backups.
3. **Skill / plugin authors** — clihub becomes the distribution channel (oh-my-zsh : zsh).
4. **Newcomers** — TUI onboarding, one-shot presets.

## Competitive moat

| Competitor | Stars | Overlap | clihub-only |
|---|---|---|---|
| alirezarezvani/claude-skills | 16k | skill fan-out | install the CLIs + preset + rollback |
| multica-ai/multica | 33k | multi-CLI orchestration | manager, not orchestrator |
| jeremylongshore/ccpi | 2k | Claude Code plugin marketplace | cross-CLI + MCP + backup |
| oh-my-claudecode | — | Claude Code plugin | cross-CLI |

**Moat depth** (deepest first):
1. CLI install matrix across 6 CLIs — others don't bother.
2. Backup / one-command rollback + per-tool version pin/rollback of `~/.claude` (and siblings).
3. Reproducibility: `clihub.yaml` → `clihub.lock.json` → `install --frozen` → `status` CI gate.
4. Cross-CLI memory sync (one source → `CLAUDE.md`/`AGENTS.md`/`GEMINI.md`/...).
5. Signed catalogs (ed25519 trust store) + cross-machine E2E-encrypted sync.
6. Declarative provider SDK — add any CLI via JSON spec, no fork.
7. Presets bundling tools + skills + MCP + plugin; installer for the open `agentskills.io` SKILL.md standard.
8. i18n (zh / ja / ko / es) — non-English market grab.

## Engineering footprint

This repo (formerly `CCEnvOneCLick`) carries:

1. **`@wikieden/clihub` npm package** — cross-platform CLI + bundled library.
2. **`clihub` Claude Code skill** — calls the same kernel from inside Claude Code.
3. **`/clihub` slash command** — same menu inside the agent.
4. **Catalog** — `skills.json`, `tools.json`, `presets.json`, `mcp.json` (and `plugins.json`).
5. **Install scripts** — `curl | sh` with git-clone fallback.
6. **Statusline** — preserved two-line statusline from v0.0.

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
- [`docs/13-MONETIZATION.md`](13-MONETIZATION.md) — three-phase business model.
- [`docs/14-SPRINT.md`](14-SPRINT.md) — day-by-day sprint plan.
- [`docs/17-INFRA-PILLARS.md`](17-INFRA-PILLARS.md) — ten pillars in depth.
- [`docs/18-CONFIG-PROXY-PROFILE.md`](18-CONFIG-PROXY-PROFILE.md) — proxy + profile + keychain design.
- [`docs/19-CLIHUBYAML.md`](19-CLIHUBYAML.md) — `clihub.yaml` schema draft.
