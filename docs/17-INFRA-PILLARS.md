# Infrastructure pillars

How clihub graduates from "useful CLI" to "AI coding substrate".

Status anchors: ✅ shipped · 🚧 in progress · 📋 planned

## The pillars at a glance

| # | Pillar | One-line | First version |
|---|---|---|---|
| I | Spec & standards | Own / co-author open formats (SKILL.md, MCP, LockFile, Catalog). | v0.4 (SKILL.md installer) → v0.7 (RFC drafts) |
| II | Reproducibility | `clihub.yaml` + lockfile + plan/apply + audit log. | v0.5.3 |
| III | Federation | Multiple catalogs, regional mirrors, private team catalogs. | v0.5 partial → v0.6 multi-source |
| IV | Trust | sigstore-cosign signing, SHA256, npm provenance. | v0.6 |
| V | Composability | Provider SDK + Adapter SDK + lifecycle hooks. | v0.7 |
| VI | Reach | All OSes, all package managers, CI, IDEs. | v0.5 Windows → v0.7 IDE |
| VII | Community | Public registry, RFC process, compatibility badge. | v1.0 beta |
| VIII | Adoption | Vendor partnerships, competitor inter-op, course coverage. | continuous |
| **IX** | **Config management** | Proxy / CA / multi-account profiles / keychain. | v0.5.1–0.5.2 |
| **X** | **Ease of use** | First-run wizard, search, `doctor --fix`, tab completion, error codes. | v0.5.0–0.5.1 |

I–IV make clihub credible as infra. V–VII make it self-sustaining. VIII gets it picked up. IX–X stop new users bouncing.

---

## I. Spec & standards

- Own / co-author RFCs for:
  - `SKILL.md` (agentskills.io alignment + clihub extensions)
  - `PLUGIN.json` (plugin manifest beyond the catalog row)
  - `MCP-MANIFEST.json` (MCP server packaging, beyond `mcpServers` entries)
  - `LockFile` schema (clihub.lock.json)
  - `Catalog` protocol (manifest.json + JSON sources + sha256)
- Host RFCs under `docs/spec/*` and mirror to `clihub.dev/spec/v1/*`.
- Compatibility test suite + `clihub-compatible` badge.

**Why**: standards keepers win the long game. Even if a competing client wins user share, our spec wins the ecosystem.

## II. Reproducibility

- `clihub.yaml` declarative project config (Pillar X usability).
- `clihub.lock.json` pinning every skill / plugin / MCP / tool to a SHA + version.
- `clihub apply --plan` (no writes; show diff) → `apply` (commits).
- `clihub install --frozen` refuses to run without a lockfile, errors on drift.
- Structured `~/.clihub/audit.log` (JSON-lines): every write traceable.

**Why**: AI coding environments are about to ship into production. Teams need "you did what I did" guarantees.

## III. Federation

- `clihub catalog add <url>` (apt-style sources).
- `clihub catalog list` / `remove` / `priority`.
- Regional mirror env: `CLIHUB_CATALOG_MIRROR=https://cn.catalog.example.com/`.
- Conflict arbitration: same ID in two sources → user-pinned priority or explicit `--from <catalog>`.
- Private team catalogs: any HTTPS-served static dir works.

**Why**: not everyone can reach the same URL. China firewall, corp proxy, private skills. Federation = inclusivity.

## IV. Trust

- sigstore-cosign signs `manifest.json` and each catalog file.
- `clihub catalog verify` checks signatures + SHA256.
- npm provenance attestation (already on; via `--provenance`).
- Transparency log: catalog releases pushed to Rekor.
- Custom CA bundle support (Pillar IX) — corp MITM never breaks `clihub`.

**Why**: as soon as one supply-chain incident hits, every project that doesn't sign loses trust overnight.

## V. Composability

- **Provider SDK**: third-party npm packages name-spaced `clihub-plugin-*` add `ToolProvider`s for CLIs we don't ship.
- **Adapter SDK**: `SkillSyncAdapter`, `PluginAdapter`, `McpAdapter` exposed under `@clihub/sdk`.
- **Lifecycle hooks**: `pre-install`, `post-install`, `pre-rollback`, `post-apply` per skill / plugin / preset.
- **i18n SDK**: locale packs from npm.

**Why**: a single maintainer can't keep up with the CLI ecosystem. Composability turns clihub into a platform, not a tool.

## VI. Reach

- **Platforms**: macOS, Linux, Windows (incl. WSL).
- **Package managers**: npm, bun, brew tap, scoop, winget, apt PPA, docker, curl|sh.
- **CI**: `clihub/setup-action@v1` (GitHub Actions), GitLab CI templates, CircleCI orb.
- **IDEs**: VS Code panel + JetBrains plugin (thin clients delegating to local `clihub`).

**Why**: ubiquity is the moat against future entrants. If you can `apt install clihub` in every Linux distro and `winget install clihub` on every Windows box, switching cost is enormous.

## VII. Community

- `clihub.dev` registry (npm-style publish for skills / plugins / MCP, no PR needed).
- RFC governance: `RFC-NNNN` numbered proposals, TSC reviews quarterly.
- SIGs: Catalog, Provider, Spec, i18n.
- Compatibility test suite + `clihub-compatible` badge.
- Bounties (sponsorships) for under-served CLIs.

**Why**: a project this broad won't survive a single maintainer. Governance compounds.

## VIII. Adoption

- Vendor partnerships: Anthropic, OpenAI, Google, AWS — get listed in their official "set up your CLI" pages.
- Competitor inter-op: ccpi, claude-skills, multica — treat as upstream catalogs not competitors.
- Course / book coverage: ship a chapter to AI-engineering authors.
- Conference talks: HN, QCon, KubeCon (CNCF Sandbox target).

**Why**: adoption snowballs. Each official mention drops time-to-trust for the next user.

---

## IX. Config management — *new pillar*

### Proxy support

Three audiences:

1. **Corp users** with mandatory HTTP/HTTPS proxy + custom CA.
2. **China users** behind GFW needing SOCKS5 or rotating proxies.
3. **Dev rigs** with mitmproxy / Charles for debugging.

What clihub provides:

| Surface | Mechanism |
|---|---|
| clihub itself | `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` / `NO_PROXY` env. Persistent via `clihub config set proxy.http <url>`. Supports `http://`, `https://`, `socks5://`, with optional basic auth (`user:pass@`). |
| Managed CLIs | Inject `ANTHROPIC_API_URL` / `OPENAI_BASE_URL` / `GOOGLE_API_BASE` / Kiro equivalent into each CLI's settings file. `clihub proxy set --tool all <url>` one-shots all of them. |
| Underlying tools | `npm config set proxy` + `git config --global http.proxy` + `curl` invocations all inherit. |
| TLS | Custom CA: `clihub config set ca-bundle <path>` writes `NODE_EXTRA_CA_CERTS`, `GIT_SSL_CAINFO`, `CURL_CA_BUNDLE`. |
| Mirrors | `CLIHUB_CATALOG_MIRROR` env for catalog source override; same SHA verified. |

See [`18-CONFIG-PROXY-PROFILE.md`](18-CONFIG-PROXY-PROFILE.md) for the design spec.

### Multi-account profiles

Many devs juggle personal + work + client-X Anthropic accounts (or want sandbox environments). clihub ships first-class profile switching:

| Command | Behaviour |
|---|---|
| `clihub profile create <name>` | Provisions `~/.clihub/profiles/<name>/{.claude,.codex,.gemini,.kiro}/` |
| `clihub profile use <name>` | Switches the active profile (HOME / XDG override). Subsequent CLI invocations see the profile's files. |
| `clihub profile current` | Prints the active profile + the path it resolves to. |
| `clihub profile clone <src> <dest>` | Copies the src tree as a starting point. |
| `clihub profile rm <name>` | Removes (refuses if currently active). |

Per-project default: `clihub.yaml` carries a `profile:` field; entering the directory triggers an automatic `profile use` via a shell hook (`clihub completion zsh` installs the hook).

Cross-profile sharing rules:

```yaml
profile: work
shared:
  - skills              # share skill installs across profiles
  - plugins
  - mcp.filesystem      # MCP filesystem server shared
not-shared:
  - settings.api-keys   # API keys stay per-profile
```

### Credential vault

System-keychain integration prevents API keys from sitting in plaintext files:

- macOS: Keychain (`security` CLI).
- Linux: `libsecret` via `secret-tool`.
- Windows: Credential Manager via `cmdkey`.

`clihub auth set <KEY>` reads from stdin (or prompts), stores in the active profile's keychain namespace, and rewrites the CLI's credentials file on each `clihub profile use` so the underlying CLIs find the key without knowing clihub is in the middle.

### Unified OAuth

A single `clihub login <provider>` runs the right OAuth flow (Anthropic / OpenAI / Google / Kiro) once, parks the token in the profile's vault, and writes whatever credentials file each CLI expects.

---

## X. Ease of use — *new pillar*

### First run

```text
$ clihub
┌  clihub — first run wizard
│
◇  What's your preferred language?    ▸ 中文
│
◇  Which CLIs do you want to set up?  ▸ Claude Code, Codex
│
◇  Do you sit behind a corporate proxy?  ▸ Yes — autodetected
│   HTTPS_PROXY=http://corp.proxy:8080
│
◇  Create a profile name              ▸ personal
│
◇  Apply the `starter` preset now?    ▸ Yes
│
└  Done in 47 s. Try: clihub catalog status
```

Cap: 5 steps, ≤ 60 seconds from `clihub` to "first CLI works".

### In-TUI search

- `/` opens a fuzzy search panel across skills / plugins / MCP / presets / settings.
- Recent actions pinned at the top of the main menu.
- Favourites: ★-pin a skill, one-key install.

### Tab completion

```bash
clihub completion bash       > /etc/bash_completion.d/clihub
clihub completion zsh        > "${fpath[1]}/_clihub"
clihub completion fish       > ~/.config/fish/completions/clihub.fish
clihub completion powershell > $PROFILE
```

### Self-healing

- `clihub doctor --fix` attempts auto-remediation: stale catalog → resync; missing settings → re-init; bad proxy → unset; orphaned skill → clean.
- `clihub repair <toolId>` resets a single CLI to vendor defaults (with backup).
- `clihub upgrade` self-updates clihub (already wraps `npm i -g @wikieden/clihub@latest`).

### Error codes

Every error has a stable code (`CLIHUB-E-NNN`) + a URL: `https://clihub.dev/errors/CLIHUB-E-007`. Codes are i18n; URLs link to FAQ pages with copy-pasteable fixes.

### Documentation surfaces

- `man clihub` auto-generated.
- `clihub help <topic>` inline long-form.
- `clihub examples` prints common recipes.
- 60-second demo GIF in README (Sprint 4 deliverable).

### Smart defaults

- Detect `git config user.email` → suggested profile name.
- Detect `$LANG` → i18n locale (already shipped).
- Detect `npm config get registry` → catalog mirror guess.
- Detect `HTTPS_PROXY` env → import into `clihub config`.

---

## Pillar ownership matrix

| Pillar | Owner area | Released by | Status |
|---|---|---|---|
| I — Spec & standards | maintainer + SIG-Spec | v0.4 (SKILL.md) → v0.7 (RFC) | 🚧 |
| II — Reproducibility | maintainer | v0.5.3 | 📋 |
| III — Federation | maintainer | v0.5/v0.6 | 🚧 |
| IV — Trust | maintainer + SIG-Catalog | v0.6 | 📋 |
| V — Composability | maintainer + SIG-Provider | v0.7 | 📋 |
| VI — Reach | maintainer | rolling | 🚧 |
| VII — Community | TSC | v1.0 | 📋 |
| VIII — Adoption | maintainer | continuous | 🚧 |
| IX — Config mgmt | maintainer | v0.5.1–0.5.2 | 📋 |
| X — Ease of use | maintainer + SIG-Locale | v0.5.0–0.5.1 | 📋 |

---

## Pointers

- [`docs/00-VISION.md`](00-VISION.md) — high-level positioning.
- [`docs/11-ROADMAP.md`](11-ROADMAP.md) — version-by-version plan.
- [`docs/14-SPRINT.md`](14-SPRINT.md) — sprint-by-sprint tactical plan.
- [`docs/18-CONFIG-PROXY-PROFILE.md`](18-CONFIG-PROXY-PROFILE.md) — Pillar IX design.
- [`docs/19-CLIHUBYAML.md`](19-CLIHUBYAML.md) — `clihub.yaml` schema for Pillar II.
- [`docs/13-MONETIZATION.md`](13-MONETIZATION.md) — how the pillars become a business.
