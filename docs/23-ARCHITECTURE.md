# clihub architecture (post-pivot)

> The technical design for clihub as a **reproducible control plane** = one kernel,
> many thin shells, an opt-in local gateway, and a desktop GUI. Companion to
> [`00-VISION.md`](00-VISION.md), [`11-ROADMAP.md`](11-ROADMAP.md) (phases),
> [`22-GATEWAY-SECURITY.md`](22-GATEWAY-SECURITY.md) (threat model), and
> [`24-VERSION-PLAN.md`](24-VERSION-PLAN.md) (per-version spec).

## 1. The one rule: one kernel, no logic forks

`@clihub/core` is the **single source of truth**. Every front-end — CLI, TUI, the
Claude-Code skill, the desktop GUI, and the gateway daemon — is a thin shell that
imports the same public API from `packages/core/src/index.ts` (~50 exports). No
shell ever re-implements domain logic. This is enforced by **golden parity tests**:
*GUI route result == CLI command result == direct kernel call*. The CLI already
embodies this — `packages/cli/src/cli.ts` "delegates all domain logic to
@clihub/core"; the daemon and gateway copy that mapping pattern.

```
                       ┌──────────────────────────────┐
                       │        @clihub/core           │  ← single source of truth
                       │  providers · settings adapters │     (~50-export public API)
                       │  catalog(+sign/trust) · skill  │
                       │  mcp · memory · sysprompt      │
                       │  profile · baseurls · proxy    │
                       │  auth(keychain/OAuth) · apply  │
                       │  lock · status · diff · sync   │
                       │  usage · import · audit · i18n │
                       └──────────────────────────────┘
            ┌───────────────┬───────────┴───────────┬────────────────┐
            ▼               ▼                       ▼                ▼
   @wikieden/clihub   clihub skill /         @clihub/daemon     @clihub/gateway
   (CLI + Clack TUI)  /clihub command        (Bun HTTP+WS        (opt-in local
   first-class,       (in-agent)             sidecar)            data-plane,
   headless/CI                                   │               OFF by default)
                                                 ▼
                                          clihub-desktop
                                          (Tauri 2 Rust shell
                                          + WebView SPA)
```

## 2. Package layout (monorepo)

| Package | Role | New? |
|---|---|---|
| `@clihub/core` | kernel — all domain logic | exists |
| `@wikieden/clihub` | CLI (cac) + Clack **TUI**; bundles core | exists |
| `@clihub/catalog` | signed manifests: `skills/tools/presets/mcp/plugins.json` + **`providers.json`** | exists (+ providers) |
| `@clihub/gateway` | opt-in loopback HTTP daemon (routing/failover/pool); **not in default install** | **new (P2)** |
| `@clihub/daemon` | thin Bun HTTP+WS sidecar — 1:1 kernel→JSON route table; the only IPC surface for the GUI | **new (P3)** |
| `clihub-desktop` | Tauri 2 Rust shell + WebView SPA (~9 panels) | **new (P3)** |

## 3. Kernel module map (where logic lives)

Domain modules under `packages/core/src/` — each new feature is a **module + a
targets/registry table**, not a new architectural layer:

- **tools/** `registry.ts` (`getProvider`/`listProviders`), `types.ts`
  (`ToolProvider`, `SettingsAdapter`, `SkillSyncAdapter`), declarative provider SDK.
- **settings/** JSON / TOML / YAML adapters (`read`/`write`/`backup`,
  `snapshotBeforeWrite`).
- **catalog/** `CatalogLoader` (bundled→user→federated merge by id), `signing.ts`
  (ed25519 `canonicalPayload`), `trust.ts`, conformance.
- **skill/** 6 adapters + `registry.ts` (single `SKILL_ADAPTERS` map), `search`,
  `auditSkills`.
- **mcp/** `manage.ts` (`addMcp`/`listMcp`/`removeMcp`, `MCP_RELPATHS`,
  `adapterFor`/`dialectFor`), Json/Toml adapters. **+ `reconcile.ts` (new, P1).**
- **memory/** managed-block engine (`applyManagedBlock`/`planMemory`/`MEMORY_TARGETS`).
  **`sysprompt/` (new, P1) is a near-verbatim second instance with its own targets.**
- **profile/** multi-account profiles, `profileEnvVector`, `baseurls.ts`
  (`applyProfileBaseUrls` INJECTORS), symlink activation.
- **auth/** `keychain.ts` (`getSecret`/`listSecrets`), `login.ts` (device/PKCE/
  refresh), `credentials.ts` (`inspectCredentials`).
- **apply/** `planApply`/`runApply`/`generateLockfile`/`Lockfile`/`lockfileToConfig`.
- **status/ · diff/** drift gate + lockfile diff. **sync/** E2E bundle. **+ `sync/transport.ts` (new, P1).**
- **usage/** (new, P1) read-only per-CLI telemetry rollup. **import/** (new, P1)
  reverse-ingest. **proxy/ · doctor/ · version/ · backup/ · team/ · audit/ · errors/ · i18n/.**

## 4. Config-surface superset (Phase 1 — no new layer)

All six CC-Switch-parity features **compose existing primitives**:

| Feature | Mechanism | Reuses | New |
|---|---|---|---|
| Provider presets + 1-click switch | `providers.json` = 6th signed catalog array; `provider use` writes baseURL+model+key via a **catalog-driven** injector table | `CatalogLoader`, `signing`/`trust`, `baseurls.ts`, keychain | `ProviderPreset` type; generalize INJECTORS from 3 hard-coded → catalog map covering all 7 CLIs |
| `clihub import` | read-direction of the same writers → normalized model → `clihub.yaml`/preset | `SettingsAdapter.read`, `inspectCredentials`, `listMcp`, `skillAdapter.list`, `generateClihubYaml` | `src/import/index.ts` + `--link` decoder (clihub:// + best-effort ccswitch://) |
| Bidirectional MCP reconcile | 3-way merge: desired vs each CLI live (`listMcp`) vs lockfile-base | `listMcp`, `diff.ts` comparators | `src/mcp/reconcile.ts` + conflict policy (`--union` default, `--source-wins` for CI) |
| Usage/cost rollup | per-CLI `USAGE_SOURCES` parsers → typed rows (read-only) | shape of `inspectCredentials`/`runHealthMatrix` | `src/usage/index.ts` (**fragile** per-CLI parsers); **tokens-only, never a $ figure asserted as fact** |
| System-prompt mgmt | second managed-block targets table | `memory/` engine verbatim | `src/sysprompt/index.ts` (small) |
| Cloud-folder sync | `SyncTransport` interface BELOW `encryptBundle` PEM output | `sync/` crypto untouched | `FsFolderTransport` (iCloud/Dropbox/OneDrive folder) + `WebDavTransport` |

**Moat hook:** `Lockfile` gains `provider` + `systemPromptHash`, so `status --strict`
and `clihub diff` gate provider/system-prompt drift too.

## 5. Gateway (Phase 2 — the one new runtime subsystem)

Opt-in `@clihub/gateway`, loopback-only, **off by default, not in default install**,
**pass-through only** (no format conversion). Built on Node `http` (Node 18 / bun),
no native deps.

- **Process model.** `clihub gateway start|stop|status|restart|logs`; default
  detached daemon, PID+port+token in `~/.clihub/gateway/gateway.json` (0600) + flock.
  Bind `127.0.0.1`/`::1` only; refuse `0.0.0.0` without `--unsafe-bind`.
- **Pointing CLIs at it = reuse the config-adapter.** `gateway/takeover.ts`
  calls the SAME `baseurls.ts` machinery to write
  `http://127.0.0.1:PORT/<provider>` as each CLI's base URL, and `clearProfileBaseUrl`
  to restore. **Correction (vs first draft):** only `anthropic/openai/google` have
  injectors today — qwen/kiro/cursor/goose are **net-new**, and **goose/YAML throws**
  on the existing seam (needs a YAML base-URL writer or explicit exclusion).
- **Same-format pass-through.** v1 forwards same-format only; a neutral IR +
  conversion is **out of scope** (correctness liability ceded to claude-code-router/
  LiteLLM).
- **Routing / failover / breaker.** `gateway:` block in `clihub.yaml` (+ global
  default in `~/.clihub/config.json`) resolved into an in-memory routing table;
  per-target circuit-breaker (closed/open/half-open) on 429/5xx/timeout; ordered
  fallback chain.
- **Account pool.** Keys fetched **per-request** via `getSecret(profile, key)`,
  injected into the upstream header, **zeroized after the request** — never
  persisted. **API-key accounts only** (no OAuth/subscription pooling — ToS/ban risk).
- **Egress is net-new.** A real outbound HTTP client (undici/fetch) honoring the
  proxy URL + `NODE_EXTRA_CA_CERTS` — `proxy/inject.ts` only *writes* config.
- **Observability.** Append-only `requests.jsonl` (key-redacted) + `gateway stats`;
  security events via `audit/`.
- **Security.** Per-daemon 256-bit bearer on **every** endpoint (incl. `/health`,
  `/metrics`); Host/Origin DNS-rebind guard; **mandatory keychain floor** (hard-refuse
  the `file` backend); **signed upstream-host pinset re-verified at gateway start**
  (the anti-SSRF/key-exfil linchpin). Full model + threat table:
  [`22-GATEWAY-SECURITY.md`](22-GATEWAY-SECURITY.md). The gateway cannot leave
  `experimental` until a **separate-lane** security review passes.

## 6. Desktop GUI (Phase 3 — a face on the moat)

Native **Tauri 2** (owner decision): Rust shell (window/tray/single-instance/
deep-link/auto-update/sidecar supervisor) + WebView SPA (~9 panels). The kernel is
TS/ESM and runs in a Bun/Node process the Rust WebView can't host in-process, so:

- **`@clihub/daemon`** — a thin Bun HTTP+WS sidecar, a ~300-line **1:1 route table**
  over kernel exports (same shape as `cli.ts`'s cac→kernel mapping). Loopback-bound +
  per-session bearer; SSE/WS for live doctor/gateway/watch streams. The **only** new
  IPC surface; all secret-handling stays in the kernel, never duplicated in Rust.
- **Panels bind to existing kernel functions** — Dashboard→`runHealthMatrix`,
  Switch→`listProviders`+`applyProfileBaseUrls`+presets, MCP→`listMcp`/reconcile,
  Skills→adapters+`auditSkills`, Gateway→`@clihub/gateway` start/stop/health,
  Versions→`recordVersion`/`diffLockfiles`/`BackupManager`, yaml-editor→`computeStatus`
  drift banner. **Lead panels = drift / lockfile / gateway dashboard** — never a
  provider dropdown first (that would make us a worse CC Switch).
- **Packaging:** `tauri-action` → notarized dmg / signed nsis+msi / AppImage+deb;
  Tauri updater JSON + minisign. Apple Developer ID + Windows EV cert = a **funded**
  one-time effort. Inherits i18n (zh/ja/ko/es) and the "rollback is sacred" invariant
  from the kernel. **CLI/TUI stay co-equal — the GUI is never the only entry point.**

## 7. Cross-cutting invariants

1. **No logic forks** — every surface action maps to a shipped `@clihub/core`
   function; golden parity tests prove GUI == CLI == kernel.
2. **Keys never persist outside the OS keychain** — read at request time, zeroized
   per-request, never written to `~/.clihub`/`clihub.yaml`/`lock`/logs/sync bundle.
3. **Every new surface is pinned + signed + drift-gated** (providers, gateway
   topology, system-prompt hash all enter `clihub.lock` + `status --strict`), or it
   is a commodity me-too feature. This is the moat, applied uniformly.
4. **Opt-in, off by default, separate package** for anything that holds keys at
   runtime (the gateway) — the config-adapter identity survives the pivot.
5. **Atomic writes** (`.tmp`+rename) + `snapshotBeforeWrite` auto-backup on every
   config mutation; `--dry-run`/`rollback` everywhere.
