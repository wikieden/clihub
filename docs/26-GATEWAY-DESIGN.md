# clihub gateway — build-ready implementation design

> **GATE NOT CLEARED — this is design, not a build order.** Per
> [`24-VERSION-PLAN.md`](24-VERSION-PLAN.md) the P2 gate opens only when (a) Phase 1
> shows real adoption **and** (b) there is budget for a 3–4-month key-holding-daemon
> project with human-in-loop live-key testing and a separate-lane security review.
> No `packages/gateway/` code exists or should be written until the gate opens.
> This doc lets an engineer start on day one without re-deciding architecture.
>
> Reads on top of: [`22-GATEWAY-SECURITY.md`](22-GATEWAY-SECURITY.md) (threat model
> = the binding constraints) and [`23-ARCHITECTURE.md`](23-ARCHITECTURE.md) §5
> (where the gateway sits). This doc is the **implementation spec** between them and
> the code — module layout, type contracts, request lifecycle, config schema,
> egress client, per-CLI takeover matrix, CLI surface, and the test plan mapped to
> the acceptance gates.

## 0. What this is / is NOT

- **IS:** an optional, off-by-default, loopback-only local daemon (`@clihub/gateway`,
  a **separate package, not in the default `clihub` install**). Accepts requests from
  the AI CLIs at `http://127.0.0.1:PORT/<provider>`, picks an API-key account from the
  OS keychain per-request, attaches it to the upstream call, applies
  account-pool / failover / circuit-breaker, and forwards **same-format** to the real
  provider.
- **IS NOT:** a hosted service, a multi-user proxy, a cross-provider format converter
  (no Anthropic↔OpenAI↔Gemini IR — that correctness liability is ceded to
  claude-code-router / LiteLLM), or an OAuth/subscription pooler (API-key accounts
  only — see [`22`](22-GATEWAY-SECURITY.md) T9).

## 1. Reuse vs net-new (corrected against the real code)

Confirmed kernel symbols the gateway composes (all exist today):

| Symbol | File | Gateway use |
|---|---|---|
| `getSecret(profile, key)` | `auth/keychain.ts:325` | per-request key fetch (then zeroize) |
| `INJECTORS` / `applyProfileBaseUrls` / `clearProfileBaseUrl` | `profile/baseurls.ts:37,95,143` | `takeover` writes/restores each CLI's base URL |
| `resolveProxy(...)` | `config/index.ts:140` | egress honors corporate proxy |
| `canonicalPayload` / `verifyCatalogPayload` | `catalog/signing.ts:44,60` | re-verify signed upstream-host pinset at start |
| `caBundle` → `NODE_EXTRA_CA_CERTS` | `config/index.ts` | egress TLS trust |

**Net-new (NOT reuse — the first-draft "pure reuse" claim was wrong):**

1. **Egress HTTP client.** `proxy/inject.ts` only *writes* config; `proxy/detect.ts`
   only *reads* the system proxy. Neither dials. The gateway needs a real outbound
   client (undici / `fetch`) honoring `resolveProxy()` + `NODE_EXTRA_CA_CERTS`.
2. **Per-CLI takeover injectors.** `INJECTORS` covers **only** `anthropic`/`openai`/
   `google`. Pointing qwen/kiro/cursor/goose at the gateway is net-new per-CLI work;
   **goose / YAML CLIs throw on the existing seam** (`proxy/inject.ts` rejects YAML;
   no YAML base-URL writer exists) → either build a YAML writer or **exclude goose**
   from takeover explicitly. v1 ships the 3 covered injectors + an explicit
   support/exclude matrix (§7).
3. **`providers.json` signed content.** Does not exist yet. The ed25519 machinery is
   reusable, but the providers array + its conformance schema + its inclusion in the
   signed checksum set are net-new signed content. The **upstream-host pinset is only
   trustworthy if the preset bytes carrying the host are inside the signed checksum,
   the gateway reads the host from the verified bytes, and re-verifies at start**
   (T4 linchpin — `canonicalPayload` signs file hashes, not field bodies).

## 2. Package skeleton (`packages/gateway/`)

```
packages/gateway/
  package.json            @clihub/gateway — depends on @clihub/core only
  src/
    index.ts              public API: startGateway/stopGateway/gatewayStatus/health
    server.ts             Node http.Server wiring; per-request handler; auth gate
    auth-guard.ts         bearer (constant-time) + Host/Origin DNS-rebind guard (T1,T2,T3)
    lifecycle.ts          daemon spawn/detach, gateway.json (0600)+flock, PID+nonce (T3)
    routing.ts            clihub.yaml gateway: block → in-memory RoutingTable
    pool.ts               AccountPool: round-robin/LRU/weighted/sticky + cooldown
    breaker.ts            per-target CircuitBreaker state machine (closed/open/half-open)
    egress.ts             net-new outbound client (undici) — proxy + caBundle aware
    pinset.ts             signed upstream-host allowlist; re-verify at start (T4)
    keyflow.ts            per-request getSecret → inject header → zeroize (T6,T7)
    takeover.ts           point/restore each CLI base URL via core INJECTORS (§7)
    observe.ts            append-only requests.jsonl (key-redacted) + stats (T6,T10)
    config.ts             GatewayConfig load/merge (clihub.yaml + ~/.clihub/config.json)
    types.ts              all interfaces below
  test/                   unit + curl-vs-fake-upstream integration
```

The gateway imports `@clihub/core` only — **never re-implements** keychain, signing,
proxy, or config logic (cross-cutting invariant #1). CLI verbs live in the existing
`@wikieden/clihub` package as thin delegations to `index.ts`, same as every other
command group.

## 3. Type contracts (`types.ts`)

```ts
// Persisted handshake file — ~/.clihub/gateway/gateway.json, mode 0600
interface GatewayHandshake {
  pid: number;
  port: number;
  host: '127.0.0.1' | '::1';
  token: string;          // 256-bit, base64url
  startNonce: string;     // bound into auth; rotates each start (T3)
  startedAt: string;      // ISO
  pinsetDigest: string;   // sha256 of the verified upstream-host pinset (T4 audit)
}

interface UpstreamTarget {
  id: string;             // e.g. "anthropic-acct-a"
  provider: 'anthropic' | 'openai' | 'google' | string;
  baseUrl: string;        // MUST match a host in the signed pinset
  profile: string;        // which account profile to getSecret from
  keyRef: string;         // keychain key name (NOT the key)
  weight?: number;        // weighted strategy
}

type PoolStrategy = 'round-robin' | 'lru' | 'weighted' | 'sticky';

interface RouteRule {
  match: { provider: string; model?: string };  // label/header based only (no body parse)
  targets: string[];      // ordered fallback chain of UpstreamTarget ids
  strategy: PoolStrategy;
}

interface BreakerThresholds {
  failures: number;       // consecutive failures → open
  resetMs: number;        // open → half-open after
  tripOn: number[];       // status codes, default [429, 500, 502, 503, 504]
}

interface RoutingTable {
  rules: RouteRule[];
  targets: Record<string, UpstreamTarget>;
  breaker: BreakerThresholds;
}
```

## 4. Request lifecycle (the zeroize point is load-bearing)

```
CLI → POST http://127.0.0.1:PORT/<provider>/...   (Authorization: Bearer <gateway-token>)
 1. auth-guard: constant-time bearer compare + PID/nonce bind   → 401 on mismatch (T3)
 2. auth-guard: Host/Origin must resolve to loopback            → 403 on rebind (T2)
 3. routing.resolve(provider, model-from-header/label)          → RouteRule
 4. pool.pick(rule)  honoring breaker state                     → UpstreamTarget (or 503 all-open)
 5. pinset.assert(target.baseUrl)  re-verified-at-start digest  → refuse to dial if absent (T4)
 6. key = await getSecret(target.profile, target.keyRef)        → 502 if keychain floor unmet (T5)
 7. egress.forward(req, target, key)  same-format pass-through
 8. FINALLY: zeroize(key) immediately after upstream completes  → per-request, NOT on shutdown (T6,T7)
 9. breaker.record(target, status); observe.append(redacted)    → requests.jsonl (T6,T10)
10. stream/return upstream response verbatim to the CLI
```

Hard rules folded from [`22`](22-GATEWAY-SECURITY.md): bearer on **every** endpoint
incl. `/health` `/metrics` (T2); `setrlimit(RLIMIT_CORE, 0)` at start (T7);
default-deny on request/response **bodies** in logs, allowlist loggable fields (T6);
strip injected `Authorization`/`x-api-key` from any error before it reaches a log or
the CLI (T6); hard-refuse the keychain `file` backend, no `--insecure-keychain`
escape in gateway mode (T5); refuse `0.0.0.0` without `--unsafe-bind` + confirm (T1).

## 5. `gateway:` config schema (the moat surface)

In `clihub.yaml` (per-project) with a global default in `~/.clihub/config.json`:

```yaml
gateway:
  bind: 127.0.0.1          # never 0.0.0.0 without --unsafe-bind
  port: 0                  # 0 = auto-pick, persisted to gateway.json
  strategy: round-robin
  breaker: { failures: 3, resetMs: 30000 }
  targets:
    - id: anthropic-a
      provider: anthropic
      baseUrl: https://api.anthropic.com   # MUST be in signed pinset
      profile: work
      keyRef: anthropic_key
      weight: 2
    - id: anthropic-b
      provider: anthropic
      baseUrl: https://api.anthropic.com
      profile: personal
      keyRef: anthropic_key
  routes:
    - match: { provider: anthropic }
      targets: [anthropic-a, anthropic-b]   # ordered failover
```

**Lockfile additions** (`clihub.lock.json`): the resolved gateway topology —
`targets` (sans secrets), `routes`, `breaker`, and the **pinned upstream hosts** —
enter the signed checksum set. `status --strict` then **fails CI on gateway-topology
drift OR on a gateway preset configured against an untrusted catalog source**
([`22`](22-GATEWAY-SECURITY.md) §"Reproducibility as a security feature"). This is the
claim no competitor makes: *the whole LLM-routing topology is a reviewable, signed,
reproducible artifact.*

## 6. Egress client (`egress.ts`, net-new)

- undici (or Node `fetch`) outbound. Honor `resolveProxy(...)` for corporate proxy and
  `NODE_EXTRA_CA_CERTS` ← `caBundle` for TLS trust (T11). TLS verify **on** by default.
- Same-format pass-through: copy method, path-suffix, query, and allowlisted headers;
  swap the auth header for the per-request key; **stream** the upstream body back
  (no buffering of bodies into logs).
- Timeout + abort wired to the breaker (step 9). Retry only via the failover chain
  (next target), never silent same-target retry.

## 7. Per-CLI takeover matrix (corrected)

`takeover.ts` reuses `applyProfileBaseUrls` / `clearProfileBaseUrl` to point a CLI's
base URL at the gateway and restore it.

| CLI | Config | Injector status | v1 plan |
|---|---|---|---|
| Claude Code | JSON | exists (`anthropic`) | ✅ takeover |
| Codex | TOML | exists (`openai`) | ✅ takeover |
| Gemini | JSON | exists (`google`) | ✅ takeover |
| Qwen Code | JSON | net-new | ⏳ add injector |
| Cursor | JSON | net-new | ⏳ add injector |
| Kiro | JSON | net-new | ⏳ add injector |
| Goose | **YAML** | seam throws | ⛔ **exclude** (or build YAML base-URL writer first) |
| OpenCode | JSONC | net-new | ⏳ add injector |

v1 acceptance only requires the 3 existing injectors to work end-to-end; the rest are
explicitly tracked as net-new, and goose is excluded until a YAML base-URL writer
lands. **No silent partial coverage** — `gateway takeover` lists exactly which CLIs it
will and won't touch.

## 8. CLI surface (in `@wikieden/clihub`, thin delegation)

```
clihub gateway start [--bind ADDR] [--port N] [--unsafe-bind]
clihub gateway stop
clihub gateway status [--json]
clihub gateway restart
clihub gateway logs [--tail N]
clihub gateway health [--json]      # active upstream probes → doctor matrix
clihub gateway takeover <cli...>    # point CLIs at the gateway (lists covered/excluded)
clihub gateway restore  <cli...>    # restore original base URLs
clihub gateway stats                # rollup from requests.jsonl
```

Exit codes follow the existing `errors/` taxonomy. `start` on an unmet keychain floor
or untrusted pinset **fails loudly** (no degraded start).

## 9. Build order (when the gate opens) → maps to 24-VERSION-PLAN P2 slots

| Slot (vacated #) | Deliverable | Acceptance gate (from 24) |
|---|---|---|
| MVP | lifecycle + server + auth-guard + same-format forward + takeover (3 injectors) | start/stop/PID/port-pick; takeover writes+restores base URL+token; bearer rejects unauth/wrong-Host; refuse `0.0.0.0` |
| +pool | `pool.ts` strategies + cooldown; qwen/kiro/cursor/opencode injectors | pool rotation + cooldown; **no-persist invariant**: grep keychain/audit/logs/sync for a planted secret → absent |
| +breaker | `breaker.ts` failover + per-target circuit-breaker (injected clock) | breaker transitions + failover order |
| +health | active probes → doctor matrix; `gateway health --json` | health surfaced; honors 429 `Retry-After` |
| ⛔ review | **BLOCKING separate-lane security review** (never self-approved) | every control in [`22`](22-GATEWAY-SECURITY.md) confirmed → exit `experimental` |

## 10. Test plan

- **Unit (headless, CI-safe — never touches real `~/.claude` or Keychain):**
  routing resolution, pool strategies + cooldown, breaker state machine (injected
  clock), pinset verify/refuse, auth-guard bearer + Host/Origin matrix, keyflow
  zeroize (assert buffer cleared after forward).
- **Integration:** `curl` the gateway against a **fake upstream** (local http server)
  with a **mock keychain** — assert same-format forward, failover order, breaker trip,
  and the **no-persist invariant** (plant a secret, run a request, grep
  `~/.clihub` / `requests.jsonl` / sync bundle / logs → secret absent).
- **Golden parity:** `gateway status` / `health` results == direct kernel-call results
  (invariant #1).
- **The security review (§9 ⛔) is a separate lane** and is the exit criterion — it is
  never satisfied by these self-run tests alone.
