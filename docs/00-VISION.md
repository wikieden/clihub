# clihub — Vision

## One-liner

**The install + sync + rollback control plane for multi-CLI AI coding.** One command installs Claude Code, Codex, Gemini and Kiro side by side, keeps their skills / MCP servers / plugins in sync, and ships one-command rollback when an upgrade breaks something.

## Mission

Make switching between AI CLIs as painless as switching browsers. No vendor lock-in. When a new CLI lands, the user brings their skill / MCP / config stack with them.

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
| v0.5 | 1.5k | 500 | Windows, watch, search |
| v1.0 | 5k | 2k | stable API, plugin SDK |
| v2.0 | 50k/month | 10k | enterprise pilot ≥3 |

See `docs/11-ROADMAP.md` for the release plan and `docs/13-MONETIZATION.md` for the long-term business model.
