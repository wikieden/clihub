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

## Sprint 5 (2026-06-21 → 06-27) — v0.5.0 · Windows + watch + search

**Goal**: ship v0.5.0 — Windows compat + observability tranche.

| Day | Task |
|---|---|
| Mon | Windows paths / PowerShell shebang / CRLF normalisation across providers |
| Tue | `clihub watch` — file-watcher on each CLI's settings dir; auto-snapshot on changes |
| Wed | `clihub search <query>` — full-text fuzzy over skills/plugins/MCP/presets |
| Thu | Tab completion: `clihub completion <bash|zsh|fish|powershell>` |
| Fri | man-page auto-gen from cac → `man clihub`; publish v0.5.0 |

**Acceptance**

```bash
clihub search auth                          # finds auth-related skills + MCP
clihub watch                                # daemonised; logs to ~/.clihub/watch.log
clihub completion zsh >> ~/.zshrc
man clihub
```

---

## Sprint 6 (2026-06-28 → 07-04) — v0.5.1 · Proxy + CA + ease wins

**Goal**: Pillar IX (Config) + Pillar X (Ease of Use) first half.

| Day | Task |
|---|---|
| Mon | Env detection: `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` / `NO_PROXY`; persist via `clihub config set proxy.*` |
| Tue | SOCKS5 + basic-auth URL parsing; per-CLI inject into settings.json/config.toml |
| Wed | Custom CA bundle: `clihub config set ca-bundle <path>`; route into npm/git/curl/CLI env |
| Thu | `clihub doctor --fix`: auto-remediate stale catalog, missing settings, bad proxy |
| Fri | Error code system (`CLIHUB-E-NNN` + `clihub.dev/errors/<code>`); first-run TUI wizard |

**Acceptance**

```bash
HTTPS_PROXY=socks5://corp.proxy:1080 clihub catalog sync
clihub config set ca-bundle /etc/ssl/corp-ca.pem
clihub doctor --fix
# First-run on clean machine ≤ 60 s to first working CLI
```

---

## Sprint 7 (2026-07-05 → 07-11) — v0.5.2 · Profiles + keychain

**Goal**: Pillar IX (Config) second half — multi-account.

| Day | Task |
|---|---|
| Mon | Profile storage layout at `~/.clihub/profiles/<name>/{.claude,.codex,.gemini,.kiro}/` + activation via HOME / XDG_CONFIG_HOME override |
| Tue | `clihub profile <create\|use\|list\|switch\|rm\|clone\|current>` CLI + TUI lane |
| Wed | System-keychain integration (macOS Keychain / libsecret / Windows Credential Manager) for API keys |
| Thu | `clihub.yaml profile:` field auto-switch on directory entry; shell hook installer |
| Fri | Unified OAuth flow (Anthropic + OpenAI + Google) routed into each CLI's credentials; publish v0.5.2 |

**Acceptance**

```bash
clihub profile create work
clihub profile use work && clihub doctor    # work account active
cd ~/projects/client-x && clihub doctor     # auto-switches via clihub.yaml
clihub auth set ANTHROPIC_API_KEY            # encrypted in keychain
```

---

## Sprint 8 (2026-07-12 → 07-18) — v0.5.3 · `clihub.yaml` + lockfile + apply

**Goal**: Pillar II (Reproducibility) draft.

| Day | Task |
|---|---|
| Mon | `clihub.yaml` schema implementation (see [`19-CLIHUBYAML.md`](19-CLIHUBYAML.md)) |
| Tue | `clihub init` interactive scaffold + `--non-interactive` for CI |
| Wed | `clihub apply --plan` (no writes; show diff) + `--dry-run` |
| Thu | `clihub.lock.json` generator + `clihub install --frozen` (refuses if lock missing) |
| Fri | Structured `~/.clihub/audit.log` (JSON-lines); publish v0.5.3 |

**Acceptance**

```bash
clihub init                                    # writes clihub.yaml
clihub apply --plan                            # diff vs current world
clihub install --frozen                        # uses clihub.lock.json
tail -f ~/.clihub/audit.log | jq .             # who installed what when
```

---

## 3-month outlook

### Month 1 (2026-06) — v0.4 launch

- ✅ v0.3.2 — Codex TOML (shipped)
- ✅ v0.4.0/0.4.1 — plugin install + remote sync + SKILL.md (shipped)
- 📋 Public launch (Sprint 4)
- **KPI target**: 500 weekly downloads, 200 stars

### Month 2 (2026-07) — v0.5 ramp

- v0.5.0 Windows + watch + search (Sprint 5)
- v0.5.1 Proxy + CA + ease (Sprint 6)
- v0.5.2 Profiles + keychain (Sprint 7)
- v0.5.3 `clihub.yaml` + apply + lockfile (Sprint 8)
- Recruit 3 Windows beta testers + 3 corp-proxy beta testers
- **KPI target**: 1.5k weekly downloads, 500 stars

### Month 3 (2026-08) — v0.6 federation

- v0.6 — sigstore signing, multi-source catalogs, mirror support
- HTTP transport for MCP servers
- New providers: Cursor, Goose, OpenCode, Junie
- First enterprise pilot conversation (free)
- **KPI target**: 3k weekly downloads, 1k stars

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
