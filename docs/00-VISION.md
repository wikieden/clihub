# clihub — Vision

## One-liner

**The infrastructure layer for AI coding.** One control plane to install Claude Code, Codex, Gemini and Kiro side by side, keep their skills / MCP servers / plugins in sync, switch between accounts and proxies, and roll back when an upgrade breaks something.

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
1. CLI install matrix — others don't bother.
2. Backup / one-command rollback of `~/.claude` (and siblings).
3. Presets bundling tools + skills + MCP + plugin.
4. Installer for the open `agentskills.io` SKILL.md standard.
5. i18n (zh / ja / ko / es) — non-English market grab.

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
| I | **Spec & standards** | clihub authors / endorses open specs for SKILL.md, MCP, PluginManifest, LockFile, Catalog. Other clients can implement against the spec without using clihub. | v0.4 partial (SKILL.md installer); RFC drafts in v0.7. |
| II | **Reproducibility** | `clihub.lock.json`, `clihub install --frozen`, plan/apply (Terraform-style), structured audit log. Same lockfile → same world. | v0.5.3 (yaml + lockfile + version pin/rollback). |
| III | **Federation** | Multiple catalogs (`clihub catalog add <url>`), regional mirrors, private team catalogs, conflict arbitration. | v0.5 partial (sync); multi-source v0.6. |
| IV | **Trust** | sigstore-cosign signed catalog releases, SHA256 verified files, npm provenance, transparency log. | v0.6 (signing). |
| V | **Composability** | Provider SDK + Adapter SDK + lifecycle hooks. Third-party `clihub-plugin-*` packages add CLIs we don't ship. | v0.7 (SDK alpha). |
| VI | **Reach** | macOS / Linux / Windows; npm / brew / scoop / winget / apt / docker; CI action; VS Code / JetBrains thin clients. | v0.5.0 ✅ Windows portability, v0.6 winget/scoop, v0.7 IDE. |
| VII | **Community** | Public registry, RFC process, compatibility test suite, `clihub-compatible` badge. | v1.0 (registry beta). |
| VIII | **Adoption** | Vendor partnerships (Anthropic, OpenAI, Google, AWS), competitor inter-op, course / book inclusions. | continuous from v0.4. |
| **IX** | **Config management** | Proxy support (HTTP/HTTPS/SOCKS5, MITM CA bundle), profile switching for multi-account (personal / work / client-X), system-keychain credential vault, unified OAuth across CLIs, per-profile `BASE_URL` injection. | v0.5.1 proxy + v0.5.2 profile/keychain. |
| **X** | **Ease of use** | First-run wizard, in-TUI search, recent / favourites, tab completion, error codes with linked docs, `doctor --fix` autoremediation, man pages, live quota meter, smart defaults. | v0.5.0 ✅ search/completion/man; v0.5.1 wizard + quota. |
| **XI** | **Cross-machine sync** | E2E-encrypted sync of catalog selection + presets + profile metadata + `clihub.yaml`/`clihub.lock.json` (not API keys — those stay in OS keychain). Self-host first; clihub Cloud optional. | v0.8 (self-host); Phase-2 monetisation: managed clihub Cloud. |

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

| Stage | Weekly npm downloads | GitHub stars | Notes |
|---|---|---|---|
| v0.4 | 500 | 200 | HN / Reddit / V2EX launch |
| v0.5 | 1.5k | 500 | Windows, watch, search, proxy + profiles |
| v0.6 | 3k | 1k | catalog signing, multi-source federation |
| v0.7 | 4k | 1.5k | provider SDK alpha, RFC spec draft |
| v1.0 | 5k | 2k | stable API, plugin SDK, registry beta |
| v2.0 | 50k/month | 10k | enterprise pilot ≥3 |

## Related design docs

- [`docs/11-ROADMAP.md`](11-ROADMAP.md) — release plan v0.1 → v2.0.
- [`docs/13-MONETIZATION.md`](13-MONETIZATION.md) — three-phase business model.
- [`docs/14-SPRINT.md`](14-SPRINT.md) — day-by-day sprint plan.
- [`docs/17-INFRA-PILLARS.md`](17-INFRA-PILLARS.md) — ten pillars in depth.
- [`docs/18-CONFIG-PROXY-PROFILE.md`](18-CONFIG-PROXY-PROFILE.md) — proxy + profile + keychain design.
- [`docs/19-CLIHUBYAML.md`](19-CLIHUBYAML.md) — `clihub.yaml` schema draft.
