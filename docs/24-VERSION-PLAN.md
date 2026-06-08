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

## Phase 1a — Config superset, switch + import + MCP (headless) 📋

| Ver | Deliverable | Reuses | New | Headless | Acceptance gate |
|---|---|---|---|---|---|
| **v1.51** | `providers.json` signed preset catalog (50+: Anthropic, OpenAI, DeepSeek, Moonshot/Kimi, Zhipu/GLM, OpenRouter, Groq, Ollama…) | `CatalogLoader`, `signing`/`trust`, conformance | `ProviderPreset` type; 6th catalog array; conformance rule **rejects inline secrets + unpinned host** | YES | load + signature verify + untrusted-key refusal over temp catalog |
| **v1.52** | `clihub provider list\|current\|switch <preset>` — 1-click switch | `baseurls.ts` INJECTORS, keychain `getSecret` | switch writer (baseURL+model+key into native settings) — **anthropic/openai/google only** | YES | assert on-disk JSON/TOML after switch; key stays in keychain |
| **v1.53** | `clihub import [--link <url>]` — reverse-ingest existing per-CLI config; clihub:// + best-effort ccswitch:// | `SettingsAdapter.read`, `inspectCredentials`, `listMcp`, `skillAdapter.list`, `generateClihubYaml` | `src/import/index.ts` normalized model + deep-link decoder | YES | round-trip: real per-CLI config → import → emitted `clihub.yaml` matches |
| **v1.54** | `clihub mcp reconcile` — bidirectional, 3-way merge | `listMcp` (reads every CLI back), `diff.ts` | `src/mcp/reconcile.ts` + conflict policy (`--union` default, `--source-wins` CI); `snapshotBeforeWrite` each write | YES | drift plan + convergence over fixtures; promote-into-source path |

**Correction baked in:** qwen/kiro/cursor/goose have **no** base-URL injector yet —
v1.52 ships the 3 that do; the rest are net-new (gateway-era work).

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

## P2 GATE ⛔ (decision, not a version)

Start the gateway **only if**: (a) Phase 1 shows real adoption, **and** (b) there is
budget for a **3–4-month** key-holding-daemon project including human-in-loop
live-key testing. Otherwise **STOP** — Phase 1 is a complete, differentiated,
shippable product. The gateway is a **separate `@clihub/gateway` package, OFF by
default, not in the default install.**

---

## Phase 2 — Local gateway (pass-through only, security-gated) 📋⛔

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

## Phase 3 — Native desktop GUI (v2.0, thin shell) 📋

| Component | Deliverable | Reuses | New | Headless |
|---|---|---|---|---|
| `@clihub/daemon` | Bun HTTP+WS sidecar, 1:1 kernel route table, loopback+token, SSE/WS streams | full `@clihub/core` API | route table (mechanical) | YES (golden parity: daemon == CLI == kernel) |
| Tauri 2 Rust shell | window/tray/single-instance/`clihub://` deep-link/auto-update/sidecar supervisor | v1.59 update channel | boilerplate Rust | shell NO (human QA); deep-link parse YES |
| Frontend SPA (~9 panels) | Dashboard·Switch·MCP·Skills·**Gateway**·Profiles/Auth·Versions/Rollback·yaml-editor(drift banner)·Sync/Team/Catalog | all kernel functions; i18n | all-new UI | render NO (Playwright click-paths + human pixels) |
| Packaging | notarized dmg / signed nsis+msi / AppImage+deb + Tauri updater + minisign | `pack/` patterns | Apple Dev ID + Windows EV (**funded**) | artifact build in CI YES; notarize NO |

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
