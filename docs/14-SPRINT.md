# Sprint plan — next 4 weeks + 3-month outlook

High-level releases live in [`11-ROADMAP.md`](11-ROADMAP.md). This file is the tactical view: which task happens which day, what "done" looks like, where the risk lands.

Sprints 6+ are re-prioritised after the 2026-05 demand audit — see [`20-MARKET-RESEARCH.md`](20-MARKET-RESEARCH.md).

## Snapshot (as of 2026-05-28)

| Metric | Now | v0.5 target | v1.0 target |
|---|---|---|---|
| npm version | 0.5.0 ✅ | 0.5.3 | 1.0 |
| GitHub stars | seed | 1k | 5k |
| Weekly npm downloads | seed | 1.5k | 5k |
| Catalog skills | 30 | 60 | 100+ |
| MCP servers | 7 | 15 | 50+ |
| Plugins | 5 | 15 | 20+ |

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

## Sprint 5 ✅ (shipped 2026-05-28) — v0.5.0 · Windows + watch + search

Shipped as `@wikieden/clihub@0.5.0`.

- Windows-safe `whichCmd` + regex `parseVersion` across 4 providers (v0.4.2)
- `clihub watch` — file-watcher + debounced auto-backup + JSON-lines log
- `clihub search <query>` — fuzzy across skills / plugins / MCP / presets / tools with score
- Tab completion (bash / zsh / fish / PowerShell)
- man page via `clihub completion man`

---

## Sprint 6 (2026-06-28 → 07-04) — v0.5.1 · Proxy + CA + live quota + ease wins

**Goal**: ship Pillar IX (Config) first half + Pillar X (Ease) + the most-requested observability gap (live quota).

| Day | Task |
|---|---|
| Mon | Env detection (`HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` / `NO_PROXY`) + persistent config (`~/.clihub/config.json:proxy.*`) + `clihub config get|set proxy.*` |
| Tue | SOCKS5 + basic-auth URL parsing; per-CLI inject into settings.json / config.toml; custom CA bundle (`clihub config set ca-bundle <path>`) |
| Wed | `doctor` live quota meter — pull usage from each vendor's quota endpoint where exposed (Anthropic `/v1/usage`, OpenAI `/dashboard/billing/usage`); render alongside cross-CLI matrix |
| Thu | `clihub doctor --fix` auto-remediation (stale catalog, missing settings, broken proxy, drift) |
| Fri | Error-code system (`CLIHUB-E-NNN` + `clihub.dev/errors/<code>` redirect) + first-run TUI wizard; publish v0.5.1 |

**Acceptance**

```bash
HTTPS_PROXY=socks5://corp.proxy:1080 clihub catalog sync
clihub config set ca-bundle /etc/ssl/corp-ca.pem
clihub doctor                      # shows live quota + 5h/weekly burn
clihub doctor --fix
# First-run on clean machine ≤ 60 s to first working CLI
```

---

## Sprint 7 (2026-07-05 → 07-11) — v0.5.2 · 🎯 Multi-account profile switching (headline)

**Goal**: take the cc-switch / V2EX demand cluster (research §3 — 75K stars unmet) head-on. This is the launch wedge after v0.4 public reveal.

| Day | Task |
|---|---|
| Mon | Profile storage layout at `~/.clihub/profiles/<name>/{.claude,.codex,.gemini,.kiro}/` + activation via HOME / XDG_CONFIG_HOME / vendor-specific env overrides |
| Tue | `clihub profile <create\|use\|list\|switch\|rm\|clone\|current>` CLI + Settings/Profile TUI lane + shell hook for auto-switch via `clihub.yaml profile:` on `cd` |
| Wed | System-keychain integration (macOS Keychain / libsecret / Windows Credential Manager) + `clihub auth set|list|rotate|rm` |
| Thu | Unified `clihub login <anthropic\|openai\|google\|kiro>` OAuth + token-expiry recovery (addresses GH #33811 / #34306); per-profile `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` / `GOOGLE_API_BASE` injection so users can point at LiteLLM / Nyro |
| Fri | Cross-profile share rules + audit-log entries; publish v0.5.2 + draft HN/Reddit/V2EX launch post: *"open-source cc-switch, cross-CLI"* |

**Acceptance**

```bash
clihub profile create work
clihub profile use work && clihub doctor    # work account active
cd ~/projects/client-x && clihub doctor     # auto-switches via clihub.yaml
clihub auth set ANTHROPIC_API_KEY            # encrypted in OS keychain
clihub login anthropic                       # OAuth flow → keychain → CLI credential file
clihub profile clone work staging --no-credentials
```

---

## Sprint 8 (2026-07-12 → 07-18) — v0.5.3 · `clihub.yaml` + lockfile + version pin/rollback

**Goal**: Pillar II (Reproducibility) draft, plus the per-tool version-pin/rollback feature that addresses "Claude Code is getting worse" (research §2 #7-#8).

| Day | Task |
|---|---|
| Mon | `clihub.yaml` schema implementation (see [`19-CLIHUBYAML.md`](19-CLIHUBYAML.md)) + `clihub init` (interactive + `--non-interactive` for CI) |
| Tue | `clihub apply --plan` / `--dry-run` (no writes; show diff in plan format) |
| Wed | `clihub install <tool>@<version>` — semver-range support per-provider + version registry per `tools.json` |
| Thu | `clihub rollback <tool>` — per-tool previous-version restore using version-history file (`~/.clihub/history/<toolId>.json`) |
| Fri | `clihub.lock.json` generator + `clihub install --frozen` + audit log lines; publish v0.5.3 |

**Acceptance**

```bash
clihub init                                  # writes clihub.yaml
clihub apply --plan                          # diff vs current world
clihub install claude-code@1.2.3             # pin to specific build
clihub rollback claude-code                  # restore previous build
clihub install --frozen                      # uses clihub.lock.json
tail -f ~/.clihub/audit.log | jq .            # who installed what when
```

---

## Sprint 9 (2026-07-19 → 07-25) — v0.6 slice · Skill audit + federation start

**Goal**: ship the supply-chain audit dashboard + first federation commands. Full v0.6 (sigstore signing + new providers) closes in Sprint 10.

| Day | Task |
|---|---|
| Mon | `clihub catalog add <url>` / `list` / `remove` / `priority` — multi-source federation primitives |
| Tue | `clihub skill list --loaded --by-cli` — cross-CLI inventory |
| Wed | `--permissions` flag: detect skill hooks / symlink-out / shell exec / network access from SKILL.md frontmatter + body scan |
| Thu | `clihub skill audit <id>` — deep inspection of a single skill: source, sha256, hooks, files written, last-modified |
| Fri | TUI Settings → Catalogs branch; publish v0.6.0-alpha |

**Acceptance**

```bash
clihub skill list --loaded --by-cli           # cross-CLI inventory
clihub skill audit superpowers --json
clihub catalog add https://my.team/clihub-catalog/
```

---

## Sprint 10 (2026-07-26 → 08-01) — v0.6 finish · sigstore + new providers

| Day | Task |
|---|---|
| Mon | sigstore-cosign sign on catalog publish + `clihub catalog verify --sigs` |
| Tue | HTTP MCP transport (alongside existing stdio) |
| Wed | Cursor provider |
| Thu | Goose provider |
| Fri | `clihub team init` group-lockfile push/pull stub; publish v0.6.0 |

---

## Sprint 11 (2026-08-02 → 08-08) — v0.7 · Provider SDK alpha + unified memory

| Day | Task |
|---|---|
| Mon | Extract `SkillSyncAdapter` / `PluginAdapter` / `McpAdapter` / `ToolProvider` into `@clihub/sdk` |
| Tue | Lifecycle hooks (`pre-install` / `post-install` / `pre-rollback` / `post-apply`) |
| Wed | `clihub memory generate` — `CONTEXT.md` → `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` / `.kiro/steering/*` |
| Thu | RFC drafts at `docs/spec/*` (SKILL.md v1, MCP-MANIFEST.json, PLUGIN.json, LockFile, Catalog) |
| Fri | `clihub/setup-action@v1` GitHub Action; publish v0.7.0 |

---

## Sprint 12 (2026-08-09 → 08-15) — v0.8 · Cross-machine sync (Pillar XI)

**Goal**: ship E2E-encrypted sync. Self-host backend day one; clihub Cloud is opt-in later.

| Day | Task |
|---|---|
| Mon | Sync payload schema (catalog selection + presets + profile metadata + `clihub.yaml`/`clihub.lock.json` — never API keys) |
| Tue | E2E crypto: argon2id KDF from passphrase → xchacha20-poly1305 encrypted blob; sodium |
| Wed | Backend adapter: S3 / R2 / minio / generic HTTPS blob put-get |
| Thu | `clihub sync push` / `pull` / `status` / `init` (key import/export) |
| Fri | Conflict resolution prompt + audit-log; publish v0.8.0 |

**Acceptance**

```bash
clihub sync init                             # generate passphrase + show recovery
clihub sync push                             # upload encrypted blob
# on machine B:
clihub sync init --passphrase < ~/recovery
clihub sync pull                             # downloads + decrypts + applies
```

---

## 3-month outlook

### Month 1 (2026-06) — v0.4 / v0.5.0 / v0.5.1 ship + launch

- ✅ v0.3.2 — Codex TOML
- ✅ v0.4.0/0.4.1/0.4.2 — plugin install + remote sync + SKILL.md + Windows portability
- ✅ v0.5.0 — Windows + watch + search + completion + man
- 🚧 v0.5.1 — proxy + CA + live quota + ease wins (Sprint 6)
- 📋 Public launch (delay until after v0.5.2 ships so headline includes multi-account)
- **KPI target**: 500 weekly downloads, 300 stars
- **KPI target**: 500 weekly downloads, 200 stars

### Month 2 (2026-07) — v0.5 ramp

- 🚧 v0.5.1 Proxy + CA + live quota (Sprint 6)
- 🚧 v0.5.2 **Multi-account profiles** (Sprint 7) — headline ship
- 🚧 v0.5.3 `clihub.yaml` + lockfile + version pin/rollback (Sprint 8)
- Recruit 3 corp-proxy beta testers + 3 multi-account beta testers
- HN / Reddit / V2EX launch after v0.5.2 ships (headline: "open-source cc-switch, cross-CLI")
- **KPI target**: 1.5k weekly downloads, 700 stars

### Month 3 (2026-08) — v0.6 federation / audit + v0.7 SDK / memory + v0.8 sync

- 🚧 v0.6.0-alpha — skill audit + multi-source catalogs (Sprint 9)
- 🚧 v0.6.0 — sigstore signing, HTTP MCP, Cursor + Goose providers (Sprint 10)
- 🚧 v0.7.0 — provider SDK + lifecycle hooks + `clihub memory generate` + RFC drafts (Sprint 11)
- 🚧 v0.8.0 — cross-machine sync (Pillar XI) (Sprint 12)
- First enterprise pilot conversation (free)
- **KPI target**: 3k weekly downloads, 1.5k stars

---

## Risk hotspots + mitigations

| When | Risk | Mitigation |
|---|---|---|
| Sprint 6 | Vendor quota APIs unstable / unauth-only | Fall back to "best-effort" indicator; clearly mark when data is missing |
| Sprint 7 | Profile activation flaky across shells / OSes | Ship targeted env vars first (`CLAUDE_HOME` etc.); directory swap as fallback; large beta cohort |
| Sprint 7 launch | HN flatlines for v0.5.2 reveal | Pre-arrange 3 friend upvotes; lead with the wedge `"open-source cc-switch, cross-CLI"`; demo GIF mandatory |
| Sprint 8 | Version pin requires per-tool history table | Cap initial version-pin support to npm-installed CLIs (Claude Code, Codex, Gemini); Kiro brew rollback in v0.6 |
| Sprint 11 | Unified-memory format drift across CLIs | Ship the lowest-common-denominator first; vendor-specific extensions via `${ext:CLAUDE}` blocks |
| Sprint 12 | E2E-crypto bugs leak plaintext | Pin to libsodium (xchacha20-poly1305); ship `--audit-self` flag that prints encrypted bytes; no rollout to clihub Cloud until passphrase-recovery tested |
| Throughout | alirezarezvani/claude-skills adds CLI install | Ship multi-account + version pin first; lead positioning |
| Throughout | cc-switch ships cross-CLI support | Demand audit shows they haven't — but watch their commits |

---

## Out of scope this quarter

- Marketplace / paid skills (v2.0+)
- LLM gateway / provider router data plane (research §5 — **NEVER**)
- Managed clihub Cloud backend (Sprint 12 ships only self-host; managed is Phase-2 monetisation)
- Enterprise tier (waits for 5k DAU)
- Web UI (CLI + TUI first)
- House LLM (never)

---

## Daily ritual

- Morning: `clihub doctor --json` against a clean podman container; commit any drift.
- Afternoon: triage GitHub issues, label `good-first-issue` wherever possible.
- EOD: push WIP branch even if incomplete; tomorrow continues from there.
