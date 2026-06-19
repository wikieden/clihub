# clihub version plan (post-pivot)

> Per-version delivery spec for the CC-Switch-superset pivot. Granular companion to
> [`11-ROADMAP.md`](11-ROADMAP.md) (phase overview) and
> [`23-ARCHITECTURE.md`](23-ARCHITECTURE.md) (design). Each row: what ships, what it
> reuses vs builds new, whether it is headless-verifiable, and the acceptance gate.
>
> **Honesty bands (from the design review):** `v1.61→1.70` is **a quarter, not ten
> point-releases** — version labels mark *deliverables*, not weeks. Conversion is
> **out**. OAuth pooling is **out**. The gateway ships only after the **P2 GATE**
> (real P1 adoption + budget for a key-holding-daemon project).

Status: ✅ done · 🚧 in progress · 📋 planned · ⛔ gated/blocked

---

## Phase 0 — Foundation (docs + threat model) 🚧

| Item | Deliverable | Status |
|---|---|---|
| Positioning | VISION reframed to *reproducible control plane*; gateway non-goal → hosted/multi-tenant only | ✅ |
| Threat model | `22-GATEWAY-SECURITY.md` written **first** as a design constraint | ✅ |
| Architecture | `23-ARCHITECTURE.md` (one kernel, many shells) | ✅ |
| This plan | `24-VERSION-PLAN.md` | ✅ |

---

## Phase 1a — Config superset, switch + import + MCP (headless) ✅ SHIPPED (held)

| Ver | Deliverable | Shipped | Notes |
|---|---|---|---|
| **v1.51** | `endpoints.json` signed preset catalog + `clihub endpoint` | ✅ `d5e3c7f` | `EndpointPreset` type, 6th catalog array, conformance (no inline secret / real host). **7 verified-endpoint seed** (Anthropic/OpenAI/Google/DeepSeek/OpenRouter/Groq/Ollama) — grow to 50+ later, real URLs only |
| **v1.52** | `clihub endpoint list\|current\|use <id>` 1-click switch | ✅ `1f6cdf2` | writes baseURL into active profile via `baseurls.ts` injectors + meta; key stays in keychain. anthropic/openai/google families only (qwen/kiro/cursor/goose have no injector) |
| **v1.53** | `clihub import` reverse-ingest → clihub.yaml | ✅ `9cb16a7` | scans installed CLIs + actual skills + MCP; `generateClihubYaml` gained `mcp?`. `--link` deep-link decoder **deferred** (ccswitch:// schema unverified) |
| **v1.54** | `clihub mcp reconcile` bidirectional drift + union apply | ✅ `5b1e253` | `reconcileMcpPlan` (cross-CLI presence) + `--apply` union via `addMcp`; non-catalog servers reported manual. `--source-wins`/interactive deferred |

**Naming:** the LLM-endpoint feature ships as `clihub endpoint` / `endpoints.json` /
`EndpointPreset` — **not** `provider` (that is the declarative CLI-SDK command,
v0.10) and not a runtime proxy. qwen/kiro/cursor/goose have no base-URL injector
yet (gateway-era work).

---

## Phase 1b — Reproducibility-forward parity (headless) 📋

| Ver | Deliverable | Reuses | New | Headless | Acceptance gate |
|---|---|---|---|---|---|
| **v1.55** | `clihub prompt set\|show\|sync` — cross-CLI system-prompt mgmt | `memory/` managed-block engine verbatim | `src/sysprompt/index.ts` + `SYSPROMPT_TARGETS` | YES | managed-block round-trip preserves hand-written text |
| **v1.56** | `clihub usage [--json]` — token rollup (**tokens-only, never $**) | shape of `inspectCredentials`/`runHealthMatrix` | `src/usage/index.ts` + per-CLI `USAGE_SOURCES` parsers (**fragile**) | YES (fixtures); **real parsers re-validated in Podman** | fixture usage parsed → typed rows; no network; no $ asserted |
| **v1.57** | `clihub sync push\|pull --to <transport>` — cloud-folder sync | `sync/` E2E crypto untouched | `src/sync/transport.ts` + `FsFolderTransport` (iCloud/Dropbox/OneDrive) + `WebDavTransport` | YES (Fs); WebDAV vs local mock | push→pull→decrypt equality to temp dir |
| **v1.58** | `clihub sync --watch` daemon + redaction guard before any snapshot | `sync/` | watch loop + redaction allowlist | YES (unit) | planted secret absent from snapshot |
| **v1.59** | `clihub self-update` + update-check (npm dist-tag aware) | — | update channel | YES | dist-tag resolution; no-op on current |
| **v1.60** | **Phase-1 wrap** — `Lockfile` records `provider` + `systemPromptHash`; `status --strict` gates provider/prompt drift; conformance for `providers.json`. **← CC SWITCH CONFIG PARITY DECLARED** (headline: *provider pinned + drift-gated*, not "parity") | `apply`/`status`/`diff`/conformance | Lockfile field extensions | YES | `status --strict` non-zero on provider drift |

---

## Phase 1c — Per-CLI provider binding + GUI pull-forward ✅ SHIPPED (2026-06)

> Reality update: after the v1.61.0 npm release wrapped Phase 1, the **GUI thin
> shell (Phase 3) was pulled forward** ahead of the gateway, and the endpoint
> model was redesigned per owner decision ([`25-PROVIDER-BINDING.md`](25-PROVIDER-BINDING.md)).
> The v1.61–v1.63 labels below therefore belong to THIS work — the gateway
> versions in Phase 2 are **vacated** and will be renumbered when the P2 gate opens.

| Ver | Deliverable | Shipped | Notes |
|---|---|---|---|
| **v1.61.0** | Phase-1 wrap npm release | ✅ released | last published version; later work unreleased on main |
| — | `@clihub/daemon` sidecar (bearer + CORS + SSE) · Tauri 2 + Svelte 5 desktop scaffold · 6 GUI panels | ✅ `222472f`…`04cfa07` | golden parity (daemon == CLI == kernel); LaunchServices PATH fixes |
| **v1.62a** | catalog v2 multi-protocol `urls` + `src/binding/` kernel + claude-code/codex adapters + `clihub use` | ✅ `eb36f6e` | replaces the v1.52 family-broadcast `endpoint use` |
| **v1.62b** | gemini/qwen/goose adapters · kiro/cursor model-only (`clihub model`) · `use clear` · lockfile `bindings` + `status --strict` drift gate | ✅ `a9781fe` | the moat step CC Switch lacks: bindings pinned + CI-gated |
| **v1.63** | daemon bindings routes · GUI CLI×endpoint matrix panel · TUI binding menu · `endpoint use` deprecation | ✅ `3f1edfb` | headless-verified end-to-end (gstack browse) |
| — | `clihub daemon start\|stop\|status` — sidecar lifecycle from the CLI; npm package ships `dist/daemon.js` | ✅ `04839b7` | browser/dev GUI flows no longer need the Tauri shell |
| **v1.64** | Tauri shell: system tray (hide-to-tray, daemon survives close) · `clihub://<panel>` deep links (single-instance) · updater scaffold (GitHub releases + minisign pubkey pinned) | ✅ `95e4b92` | cargo check clean; runtime tray/deep-link/update needs a packaged real-machine pass; signing key outside repo (`~/.tauri/clihub.key`) |
| — | GUI redesign — control-plane industrial theme (graphite + amber tokens, IBM Plex, grouped sidebar) | ✅ `05177c5` | svelte-check + build + headless screenshots |
| **v1.65** | **OpenCode (8th CLI)** — provider (`opencode-ai` npm, pin/rollback) · JSONC config adapter · `mcp` map adapter · binding (openai-compat custom provider / anthropic override + `provider/model`) · skills `~/.config/opencode/skills` · AGENTS.md memory | ✅ `eee7104` | all paths doc/schema-verified (anomalyco/opencode); tsc ×3 + 239/239 tests. **npm published `b4b8bb9`→OIDC trusted publishing `5c8ba85`** |
| **v1.66** | OpenCode parity tail — catalog `mcp.json` supports opencode on all 14 servers · `usage` reports opencode (honest unsupported) · catalog-integrity + usage tests | ✅ `d3e3256` | tsc + 240/240; tools.json/skills.json unchanged (installs via provider registry, like qwen) |
| **v1.67** | Desktop release pipeline — `desktop-release.yml` tauri-action matrix (macOS univ / Win / Linux) on `desktop-v*` tag → draft GitHub Release; app version 0.1.0→1.67.0 | ✅ `784f494` | cargo check clean; superseded by the unsigned + crash-fix work below |
| — | Unsigned packaging — disable updater artifacts via `--config` (no signing key), `tauri` npm script, install non-workspace `clihub-desktop` deps in CI | ✅ `3c79568`/`7626d23`/`82f3dc8` | first green 3-platform build: dmg/nsis/msi/deb/AppImage/rpm |
| — | **Packaged-app crash fix** — `daemon_entry()` resolved daemon at COMPILE-TIME (`CARGO_MANIFEST_DIR` = CI machine path) → packaged .app exited on launch. Now bundles `daemon.js` as a Tauri resource + resolves it at runtime (dev falls back to repo source) | ✅ `7d51066` | verified on the local release `.app`: process stays alive + daemon child spawns from `Contents/Resources/daemon.js`; CI `desktop-v1.67.0` green. Bun-less compiled sidecar (`externalBin`) + notarization still pending |

---

## P2 GATE ⛔ (decision, not a version)

Start the gateway **only if**: (a) Phase 1 shows real adoption, **and** (b) there is
budget for a **3–4-month** key-holding-daemon project including human-in-loop
live-key testing. Otherwise **STOP** — Phase 1 is a complete, differentiated,
shippable product. The gateway is a **separate `@clihub/gateway` package, OFF by
default, not in the default install.**

---

## Phase 2 — Local gateway (pass-through only, security-gated) 📋⛔

> **Version labels below are vacated** (taken by Phase 1c) — read them as
> deliverable slots, renumbered when the P2 gate opens.

| Ver | Deliverable | Reuses | New | Headless | Acceptance gate |
|---|---|---|---|---|---|
| **v1.61** | Gateway MVP `gateway start\|stop\|status\|restart\|logs` — loopback HTTP daemon, **same-format pass-through**, takeover via `baseurls.ts`, PID+token `gateway.json` (0600)+flock, bearer on every endpoint, Host/Origin guard | `baseurls.ts`, `audit/`, `config/` | `@clihub/gateway` pkg; daemon lifecycle; **net-new egress HTTP client** | PARTLY (daemon/forward unit + curl vs fake upstream; mock keychain) | start/stop/PID/port-pick; takeover writes+restores base URL+token; bearer rejects unauth/wrong-Host; refuse `0.0.0.0` |
| **v1.62** | Account pool + key selection — per-request `getSecret`, **zeroize per-request**, round-robin/LRU/weighted/sticky; **API-key only**; extend injectors for qwen/kiro/cursor/goose (or exclude goose/YAML) | `auth/keychain`, `auth/credentials` | pool strategies + cooldown; new injectors | PARTLY | pool rotation + cooldown; **no-persist invariant** (grep keychain/audit/logs/sync for planted secret → absent) |
| **v1.63** | Failover + per-target circuit-breaker (closed/open/half-open) on 429/5xx/timeout; ordered fallback | — | breaker state machine | PARTLY (injected clock) | breaker transitions + failover order |
| **v1.64** | Active health probes → doctor matrix; `gateway health --json` | `doctor/` ToolHealthRow | prober | PARTLY | health surfaced; honors 429 Retry-After |
| **v1.66** | **⛔ BLOCKING security review** (separate lane, never self-approved) — loopback-only, no-key-persist, per-request zeroize, no-body-logging, signed-host-pinset re-verified at start, mandatory keychain floor, audit every authed request. **Exit criterion to leave `experimental`** | `audit/`, `signing`/`trust`, `caBundle` | review + hardening | PARTLY (static + audited) | every control in `22-GATEWAY-SECURITY.md` confirmed |

> **Removed from the committed roadmap:** cross-provider **format conversion**
> (Anthropic↔OpenAI↔Gemini IR + SSE translation) — parked as research only.
> **per-request smart routing** stays minimal/label-based if shipped at all.

---

## Phase 2b — Gateway hardening (post-review) 📋

| Ver | Deliverable | Acceptance |
|---|---|---|
| **v1.67–1.70** | `gateway:` block in `clihub.yaml` → **lockfile-pinned + CI-drift-gated** (the moat differentiator); rate-limit/backpressure; graceful drain; OS-service install (launchd/systemd) via `pack` | `status --strict` fails CI on gateway-topology drift or untrusted preset source |

---

## Phase 3 — Native desktop GUI (v2.0, thin shell) 🚧 (pulled forward, see Phase 1c)

| Component | Deliverable | Reuses | New | Headless | Status |
|---|---|---|---|---|---|
| `@clihub/daemon` | Bun HTTP+WS sidecar, 1:1 kernel route table, loopback+token, SSE/WS streams | full `@clihub/core` API | route table (mechanical) | YES (golden parity: daemon == CLI == kernel) | ✅ shipped (29 routes incl. bindings) |
| Tauri 2 Rust shell | window/tray/single-instance/`clihub://` deep-link/auto-update/sidecar supervisor | v1.59 update channel | boilerplate Rust | shell NO (human QA); deep-link parse YES | 🚧 window + sidecar supervisor done; tray/deep-link/auto-update pending |
| Frontend SPA (~9 panels) | Dashboard·Endpoints(CLI×endpoint matrix)·MCP·Skills·Drift·Profiles·Versions/Rollback·yaml-editor(drift banner)·Sync/Team/Catalog | all kernel functions; i18n | all-new UI (Svelte 5) | render via gstack-browse click-paths + human pixels | 🚧 6 panels live incl. the binding matrix |
| Packaging | notarized dmg / signed nsis+msi / AppImage+deb + Tauri updater + minisign | `pack/` patterns | Apple Dev ID + Windows EV (**funded**) | artifact build in CI YES; notarize NO | 📋 certs pending (user-side) |

**Invariants:** lead panels = drift/lockfile/gateway (never provider-dropdown-first);
golden parity tests; **CLI/TUI stay co-equal, never the only entry point.**

---

## Effort summary

| Phase | Effort | Note |
|---|---|---|
| P0 | S | docs (landing now) |
| P1a + P1b | **M** (~6–10 wk, one strong engineer) | mostly composition; MCP reconcile + cloud-sync + **usage parsers** are the M/L outliers |
| P2 | **L (≈ a quarter)** | the only large net-new subsystem; security review carries weight |
| P2b | M | hardening + lockfile-pin |
| P3 | M | thin over kernel, but new toolchain (Rust/Tauri) + signing/notarization + visual QA |

**Critical-path advice:** P1 is a complete shippable product on its own. Treat P2 as
a separately-funded effort with its own security budget; treat P3 native GUI as a
second product. Ship P1, measure adoption, then decide P2.
