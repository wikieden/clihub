# Competitive landscape & positioning

> Evidence-backed competitive analysis (2026-06). Built from a fan-out research
> pass over official docs/repos, an adversarial verification pass, and a `gh`
> existence / stars / claims check of every single-source repo (§4 — all 10
> confirmed, none refuted). Confidence is labelled per claim.
>
> Companion to [`00-VISION.md`](00-VISION.md) (positioning / moat) and
> [`11-ROADMAP.md`](11-ROADMAP.md) (near-term direction).

## TL;DR

The field splits into **two camps**:

1. **Runtime / version managers** (mise, asdf, proto, chezmoi, aqua) — where
   clihub *borrows primitives* (exec wrapper, lockfile integrity, per-machine
   overlay, supply-chain verification).
2. **AI-CLI managers / switchers** (CC Switch, Smithery, skill-sync tools,
   config-sync tools, LLM gateways) — clihub's *actual competitors*.

clihub's verified, defensible edge: **7-CLI install+config breadth**,
**native-idiomatic-schema fan-out**, **ed25519-signed federated catalog**,
**resolved-version lockfile + CI drift gate**, **E2E cross-machine sync**.
Scope line (2026-06 pivot): clihub is a **reproducible control plane** — config +
an **opt-in, local-only, pass-through gateway** + CLI/TUI/GUI surfaces. Still OUT:
a **hosted / multi-tenant** request-routing service, metered virtual keys, or
cross-provider format conversion (see revised Non-goals in
[`00-VISION.md`](00-VISION.md) and [`22-GATEWAY-SECURITY.md`](22-GATEWAY-SECURITY.md)).

---

## 1. Runtime / version managers (borrow primitives)

| Capability | mise | asdf | proto | chezmoi | aqua | **clihub** |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Lockfile (resolved version) | have | partial¹ | have² | no | have³ | **partial⁴** |
| Plugin / catalog registry | have | have | have | no | have | **have (signed, federated)** |
| Exec / run-with-env wrapper | have | have | have | partial | have | **no** |
| Shims (PATH interception) | have | have | have | no | have | no⁵ |
| Secrets / encryption | partial | no | partial | have | partial | partial |
| Templating / interpolation | have | no | partial | have | no | **no** |
| Per-machine / per-host override | have | partial | have | have | partial | **no** |
| Auto version-bump | partial | no | partial | partial | have⁶ | **no** |
| Provenance / signing | partial | no | partial | partial | have | **have** |

¹ asdf's `.tool-versions` doubles as the pin (no second artifact; bans ranges/`latest`).
² proto's `.protolock` is opt-in **and marked unstable**.
³ aqua splits `aqua.yaml` (versions) + `aqua-checksums.json` (checksums).
⁴ `clihub.lock.json` pins **version + method only** — no checksum/URL/platform fields yet.
⁵ clihub rewrites each CLI's native config in place rather than shimming — appropriate for config mgmt, not a true gap.
⁶ aqua's Renovate preset bumps **versions only**; checksums need a separate `update-checksum-action` / `aqua upc`.

### mise (jdx/mise) — runtime + env + tasks
TOML config that **recurses upwards** (deep dir overrides shallow); `mise.local.toml`
git-ignored overlay. First-class **`mise x [tool@ver] -- cmd`** run-with-env wrapper.
`mise.lock` stores **per-platform** version + checksum (SHA256/Blake3) + size + URL.
Shims-vs-activate split (static shims dir for IDE/non-TTY, prompt-hook PATH for
interactive). Tera templating + opt-in `${VAR:-default}`. sops/age secrets + glob
redaction. Untrusted-config-path prompting. **Borrow:** `clihub exec`, per-platform
checksum lockfile, redaction globs, trust-path allowlist.

### asdf (asdf-vm) — minimal version manager
Plain-text `.tool-versions` (no lockfile; bans ranges → deterministic). Plugins =
external git repos; central short-name registry is optional sugar. Shim → `asdf exec`
runtime resolution. `legacy_version_file` reads rival managers' files for migration.
No secrets/templating/signing. **Borrow:** single-file spec=lock, `$PWD→$HOME`
cascade, explicit-git-URL-over-registry, opt-in read-rival-config migration.

### proto (moonrepo/proto) — WASM-plugin toolchain
`.prototools` TOML, 3 scopes (local/user/global). **WASM plugins** (language-agnostic
core) + new **OCI registry** (`registry://`, ghcr.io, CAS). `proto run -- args` exec.
`.protolock` (opt-in/unstable) stores version + sha256. `proto pin --tool-native`
writes the pin into the tool's own location (package.json `devEngines`) for
ecosystem interop. **Borrow:** WASM/declarative plugins, OCI artifact distribution,
`--tool-native` bidirectional interop.

### chezmoi — dotfile manager (closest per-machine model)
Source state = git dir; **deploy semantics encoded in filenames** (`private_`,
`encrypted_`, `run_once_`, `.tmpl`…) — no central manifest to drift. **Machine-local
config kept OUTSIDE the repo**, generated from a repo-side `.tmpl` via `promptStringOnce`.
Go template + sprig + machine vars (`.chezmoi.hostname/.os/.arch`). **Secrets first-class**
(~15 managers, resolved at render time, never in repo). `apply --dry-run` + `diff`
first-class. `.chezmoiexternal` with `refreshPeriod` + per-file checksums.
`run_once_`/`run_onchange_` content-hash hooks. **Borrow (highest relevance):**
machine-local overlay + prompt-once, `{{hostname}}` conditionals, dry-run/diff,
external+refresh+checksum, render-time secrets, run-once hooks.

### aqua (aquaproj) — strongest supply chain
`aqua.yaml` (strict pins) + separate `aqua-checksums.json`. **Single `aqua-proxy`
binary** + per-command symlinks, **lazy install on first run**. **Full supply-chain
chain:** checksum + cosign (keyless) + SLSA + minisign + GitHub Artifact Attestations,
auto-bootstrapped (aqua installs cosign/slsa-verifier itself), failure aborts install.
**Policy-as-Code default-deny** (only Standard Registry trusted by default).
Registry pinned by `ref`. **Borrow:** single dispatch binary, lazy install,
checksum-lock + `upc -prune`, auto-bootstrapping verification, default-deny policy,
catalog-ref pinning.

---

## 2. AI-CLI managers / switchers (actual competitors)

### A. Provider / account switchers — most direct 🔴
- **CC Switch** (`farion1231/cc-switch`) — **high confidence** (~89k★, corroborated
  by augmentcode / x-cmd). Tauri desktop app over SQLite: 1-click provider switch
  (system tray, 50+ presets), **unified MCP panel with bidirectional sync**, Skills
  management, Deep Link `ccswitch://` import, **local proxy** (auto-failover, circuit
  breaker, health monitoring, per-app provider takeover), built-in auto-updater,
  device settings split from synced DB + cloud sync (Dropbox/OneDrive/iCloud/WebDAV).
  **The 800-lb gorilla** — already does unified MCP + skills + switching + cloud sync.
- **ccs / CLIProxyAPI**, **CCSwitcher** — multi-account/provider via OAuth runtime proxy.

### B. Network gateways / routers — clihub now plays here, **narrowly** (2026-06 pivot)
- **claude-code-router** (~30k★) — **per-request** context routing (background→DeepSeek,
  coding→Sonnet, reasoning→Opus).
- **LiteLLM** — gateway + virtual keys + spend tracking + hosted/enterprise. **CliGate**
  — multi-protocol gateway, account pools, key routing, free-model fallback. CC Switch's
  bundled proxy.

**Pivot:** clihub now ships an **opt-in, off-by-default, loopback-only local gateway**
(`@clihub/gateway`) — it crossed the former "not an LLM gateway" line in exactly one
place. But it does **not** fight these head-on. The **winnable wedge is one sentence**:
*the only LLM gateway whose entire config is a signed, version-pinned, CI-drift-gated,
reproducible lockfile that also installs and configures the CLIs that talk to it.*
Deliberately ceded to LiteLLM/router: **format conversion** (correctness liability —
clihub is **pass-through only**), **smart per-request model routing** (claude-code-router's
reason to exist), **virtual keys / spend metering / hosted multi-tenancy**. clihub keeps:
failover + account-pool + circuit-breaker for the common 80% case (multiple keys/accounts
of the **same** provider), all **self-hosted with zero key egress to a third party**, and
the routing topology pinned + signed + drift-gated. See
[`22-GATEWAY-SECURITY.md`](22-GATEWAY-SECURITY.md).

### C. MCP registries / managers
- **Smithery** (`smithery-ai/cli`) — high confidence. Client-agnostic MCP **registry**
  (thousands of servers), `tool find/call` to actually invoke MCP tools, OAuth
  scoped-token minting. clihub manages MCP *entries* but does not invoke tools or mint tokens.
- mcp-config-manager (`holstein13`) — MCP config management.

### D. Skill-sync tools — **verified** (`gh`-checked 2026-06)
- **skillshare** (`runkids/skillshare`, **2.2k★**) — Go binary; one source dir →
  symlink / NTFS-junction to 60+ tools; git-backed team sharing (GitHub/GitLab/
  Bitbucket/Azure DevOps). Strongest non-Claude-specific skill-sync peer.
- **skills-manager** (`xingkongliang/skills-manager`, **2.0k★**) — Tauri/Rust
  **desktop + CLI** over one **SQLite** DB; manage/sync skills across 15+ tools.
- **vsync** (`nicepkg/vsync`, ~50★) — one config syncs Skills/MCP/Agents/Commands
  across Claude Code / Cursor / OpenCode / Codex.
- **sync-agents-settings** (`Leoyang183`, ~9★) — **one-way** MCP + CLAUDE.md sync
  *out of* Claude Code to ~12 targets (npm pkg).
- **skillpm** (`eddieran`, ~1★, nascent) — 10-runtime inject, `doctor` (7 checks),
  security scan + policy, atomic install + rollback, in-box default skill bundle.

### E. Declarative config-sync (plan/apply) — closest architecture, **verified**
- **coder-config** (`regression-io/coder-config`, ~46★; renamed from `claude-config`)
  — declarative JSON, global→project→sub cascade, per-project MCP toggle over a
  global registry, `${VAR}` interpolation from `.claude/.env`, **workstreams** (repo groups).
- **ai-config-sync-manager** (`slash9494`, ~7★) — **host-aware bidirectional** Claude↔Codex
  sync: permission ↔ sandbox-mode mapping, agent files (YAML frontmatter round-trip),
  MCP env/secret pass-through both ways (`AI_CONFIG_SYNC_STRIP_SECRETS=1` redacts).
  Safety via `status` (= diff), `sync --dry-run`/`--plan-json` (= plan), `sync --apply`,
  `.backups/` FIFO snapshots. *(No literal `diff`/`plan`/`apply` commands; no agent-
  frontmatter→TOML or bearer-token handling — an earlier draft overstated those.)*
- **agentsync** (`chrisleekr`, 0★, nascent) — encrypted Git vault, **auto-redaction**
  before snapshot, CLI + background daemon for continuous cross-machine sync.

### F. Skill marketplaces / standards
- **agentskills.io** — the open **SKILL.md** standard (adopted by Anthropic/OpenAI/
  Google/MS/Cursor, 20+ tools). clihub is already an installer for it.
- GuildSkills (claims 84k+ skills / 30+ clients), Hermes Hub (672), and the
  `ccpi` marketplace (`jeremylongshore/claude-code-plugins-plus-skills`, **2.3k★**;
  npm `@intentsolutionsio/ccpi`) — ~425 plugins / ~2.8k skills, Claude-Code-only.

---

## 3. clihub positioning

### Verified moat (no AI-CLI competitor has these)
1. **Resolved-version lockfile + CI drift gate** (`status --strict`) — unique in the
   field; only ai-config-sync-manager has plan/apply/backup, and none ships a true lockfile.
2. **ed25519-signed *federated* catalog** + pinned-publisher trust store — no
   third-party manager signs its own catalog (only upstream vendors sign their repos).
3. **7-CLI install + config breadth** — CC Switch tops out ~4-5 CLIs and **doesn't
   install the CLIs themselves**.
4. **Per-tool version pin/rollback of the CLI binaries** — competitors update
   skills/configs, not pinned CLI versions.

### Where competitors currently lead (watch / selectively adopt)
- **CC Switch** — bidirectional MCP sync, cloud sync, auto-update, 50+ presets, GUI.
- **ai-config-sync-manager** — host-aware **bidirectional** reconcile (clihub fans
  OUT one source but doesn't reconcile drift back).
- **Smithery** — actually **invokes** MCP tools + scoped tokens.
- **agentsync** — redaction + sync daemon (clihub sync is manual export/import).
- **skillpm** — in-box default skill bundle + `doctor` self-heal.

### Direction implications
1. **Pivot, but keep the moat the protagonist.** clihub now enters the switcher (A)
   and gateway (B) camps — but only as **pinned + signed + drift-gated** surfaces, the
   one axis neither incumbent has. Never lead with "superset of CC Switch" or "we have a
   proxy" (you are the late entrant on those); lead with *reproducible control plane*.
   Gateway scope is hard-bounded: local-only, pass-through, API-key pool, off by default
   (see [`22-GATEWAY-SECURITY.md`](22-GATEWAY-SECURITY.md)).
2. **Reinforce the unique axis.** Lockfile + CI drift gate + signed federated catalog
   are unmatched — make them the headline of every feature, including the gateway
   (routing topology as a signed reproducible artifact), rather than fighting CC Switch
   (~89k★) on switching-GUI or LiteLLM/router (~30k★) on routing fidelity.
3. **Selectively borrow.** Bidirectional reconcile (ai-config-sync), MCP `tool call`
   (Smithery), sync daemon + redaction (agentsync), default skill bundle (skillpm).

The three near-term gap-closers chosen from this analysis (`clihub exec`, lockfile
integrity, per-machine overlay) are detailed in [`11-ROADMAP.md`](11-ROADMAP.md) →
"Revised near-term direction".

---

## 4. Confidence & sources

**High confidence** (multiple sources / official docs): CC Switch, Smithery,
agentskills.io, claude-code-router, LiteLLM, and all five version managers
(mise/asdf/proto/chezmoi/aqua).

**Verified via `gh` (2026-06)** — all 10 single-source repos confirmed to exist;
stars + feature claims checked, **none refuted**:

| Repo | Stars | Claim |
|---|--:|---|
| `runkids/skillshare` | 2.2k | confirmed |
| `jeremylongshore/claude-code-plugins-plus-skills` (ccpi) | 2.3k | confirmed |
| `xingkongliang/skills-manager` | 2.0k | confirmed |
| `nicepkg/vsync` | ~50 | confirmed |
| `regression-io/coder-config` | ~46 | confirmed (renamed from `claude-config`) |
| `holstein13/mcp-config-manager` | ~28 | confirmed |
| `Leoyang183/sync-agents-settings` | ~9 | confirmed (one-way) |
| `slash9494/ai-config-sync-manager` | ~7 | **partial** — claims trimmed (§2.E) |
| `eddieran/skillpm` | ~1 | confirmed (nascent) |
| `chrisleekr/agentsync` | 0 | confirmed (nascent) |

Takeaway: **skillshare / ccpi / skills-manager each carry ~2k★** — real peers,
not fringe. The earlier "unverified" label is lifted. Name corrections applied:
`claude-config`→`coder-config`, `claude-code-plugins`→`claude-code-plugins-plus-skills`.

Key source URLs:
- https://github.com/farion1231/cc-switch · https://github.com/smithery-ai/cli
- https://github.com/eddieran/skillpm · https://github.com/runkids/skillshare
- https://github.com/regression-io/coder-config · https://github.com/slash9494/ai-config-sync-manager
- https://github.com/chrisleekr/agentsync · https://agentskills.io · https://guildskills.com
- mise.jdx.dev · asdf-vm.com · moonrepo.dev/proto · chezmoi.io · aquaproj.github.io
