# Sprint plan — next 4 weeks + 3-month outlook

High-level releases live in [`11-ROADMAP.md`](11-ROADMAP.md). This file is the tactical view: which task happens which day, what "done" looks like, where the risk lands.

## Snapshot (as of 2026-05-27)

| Metric | Now | v0.4 target |
|---|---|---|
| npm version | 0.3.2 (publish queued) | 0.4.0 |
| GitHub stars | seed | 200 |
| Weekly npm downloads | seed | 500 |
| Catalog skills | 30 | 50 |
| MCP servers | 7 | 15 |
| Plugins | 0 | 10 |

---

## Sprint 1 (2026-05-26 → 05-30) — v0.4 Step C · Plugin install

**Goal**: ship plugin install for Claude Code; publish as v0.3.3.

| Day | Task | Deliverable |
|---|---|---|
| Mon | `PluginManifest` type + `plugins.json` seed (5 examples) | `packages/catalog/plugins.json` |
| Tue | `ClaudeCodePluginAdapter` (git clone + lock entry) | `packages/core/src/plugin/` |
| Wed | CLI: `clihub plugin <action> [id]` (list / install / uninstall / update) | `packages/cli/src/cli.ts` |
| Thu | TUI: Claude Code submenu gets a Plugins lane | `packages/cli/src/tui/index.ts` |
| Fri | Podman smoke test + publish v0.3.3 | npm + git tag |

**Acceptance**

```bash
clihub plugin install superpowers --tool claude-code
clihub plugin list --tool claude-code           # shows the new plugin
clihub plugin uninstall superpowers --tool claude-code
```

---

## Sprint 2 (2026-05-31 → 06-06) — v0.4 Step D · Remote catalog sync

**Goal**: `clihub catalog sync` pulls a remote catalog into `~/.clihub/catalog/`; ship as v0.3.4.

| Day | Task |
|---|---|
| Mon | Design `~/.clihub/catalog/` layout + version stamp (`catalog.json` with `etag` / `lastSync`) |
| Tue | `clihub catalog sync [url]` command (default → `raw.githubusercontent.com/wikieden/clihub/main/packages/catalog/`) |
| Wed | `CatalogLoader` prefers user dir, falls back to bundled |
| Thu | SHA256 checksum verification on downloaded JSON |
| Fri | Publish v0.3.4 |

**Acceptance**

```bash
clihub catalog sync                                    # default URL
clihub catalog sync https://my.team/catalog/           # private team catalog
clihub catalog status                                  # shows version + source
```

---

## Sprint 3 (2026-06-07 → 06-13) — v0.4 Step A · agentskills.io SKILL.md

**Goal**: clihub becomes an installer for the open SKILL.md standard; cut v0.4.0.

| Day | Task |
|---|---|
| Mon | YAML frontmatter parser (custom mini-parser, no `gray-matter` dep) |
| Tue | `CatalogLoader` accepts `skills/<id>/SKILL.md` directory trees alongside `skills.json` |
| Wed | `clihub skill install <git-url>` clones a SKILL.md repo and adapts to every supported CLI |
| Thu | Write `docs/15-SKILL-MD.md` describing the compatibility surface |
| Fri | Cut v0.4.0, tag release |

**Acceptance**

```bash
clihub skill install https://github.com/foo/bar-skill
# clones repo → reads SKILL.md → fans out via every matching adapter
```

---

## Sprint 4 (2026-06-14 → 06-20) — Launch

**Goal**: HN / Reddit / V2EX launch + CI release pipeline.

| Day | Task |
|---|---|
| Mon | GitHub Actions: tag → `npm publish` (Classic Automation token in repo secret) |
| Tue | Docker image: `wikieden/clihub:latest` (multi-arch) |
| Wed | Record 60-second demo (asciinema → GIF) |
| Thu | Draft HN post + Reddit en/zh + V2EX + X thread + 掘金 long-form |
| Fri | Synchronised launch (HN at US-East morning, all socials within 30 min) |

**Acceptance**: PR comments on at least three competitor repos linking back; ≥ 200 stars by end of week.

---

## 3-month outlook

### Month 1 (now → 2026-06-30)

- ✅ v0.3.2 — Codex TOML (shipped)
- 🚧 v0.4.0 — plugin install + remote sync + SKILL.md
- 📋 Public launch (Sprint 4)
- **KPI target**: 500 weekly downloads, 200 stars

### Month 2 (2026-07)

- v0.5 — Windows support (paths, PowerShell shebang)
- `clihub watch` — detect CLI upgrades, auto-backup, surface rollback CTA
- `clihub search <query>` — full-text over catalog
- New providers: Cursor, Goose
- Recruit 3 Windows beta testers
- **KPI target**: 1k weekly downloads, 500 stars

### Month 3 (2026-08)

- v0.6 — team mode: `clihub.lock.json` (per-project pins)
- HTTP transport for MCP servers (currently stdio-only)
- New providers: OpenCode, Junie
- First enterprise pilot conversation (still free)
- **KPI target**: 1.5k weekly downloads, 700 stars

---

## Risk hotspots + mitigations

| When | Risk | Mitigation |
|---|---|---|
| Sprint 1 | Plugin lock-file design rabbit hole | Simple JSON now, OCI later if ever |
| Sprint 2 | Catalog signing scope creep | Ship SHA256 checksum only; ed25519 signing waits for v0.5 |
| Sprint 4 launch | HN flatlines | Pre-arrange 3 friend upvotes; lead with the wedge in the title |
| Month 2 | Windows compat hell | Test from day 1 with `bun build --target node-win32` |
| Throughout | alirezarezvani/claude-skills adds CLI install | Ship plugin + presets + rollback first; lead positioning |

---

## Out of scope this quarter

- Marketplace / paid skills (v2.0+)
- Cloud sync (waits for trigger conditions in [13-MONETIZATION](13-MONETIZATION.md))
- Enterprise tier (waits for 5k DAU)
- Web UI (CLI + TUI first)
- House LLM (never)

---

## Daily ritual

- Morning: `clihub doctor --json` against a clean podman container; commit any drift.
- Afternoon: triage GitHub issues, label `good-first-issue` wherever possible.
- EOD: push WIP branch even if incomplete; tomorrow continues from there.
