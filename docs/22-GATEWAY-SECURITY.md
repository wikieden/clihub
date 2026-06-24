# clihub gateway — threat model & security design

> 🌐 中文: [`22-GATEWAY-SECURITY.zh.md`](22-GATEWAY-SECURITY.zh.md)

> **Design-first, not release-afterthought.** clihub's local gateway is the first
> component to hold live provider API keys in the request path, inverting the
> prior "keys never leave the keychain" posture. This threat model is a **design
> constraint** that gates the architecture — the gateway cannot leave
> `experimental` until a separate-lane (never self-approved) security review
> confirms every control below. Companion to [`00-VISION.md`](00-VISION.md)
> (Non-goals) and [`11-ROADMAP.md`](11-ROADMAP.md) (Phase 2).

## What the gateway is (scope)

An **optional, off-by-default, loopback-only** local daemon (`@clihub/gateway`, a
separate package — **not** in the default `clihub` install). It accepts requests
from the AI CLIs at `http://127.0.0.1:PORT/<provider>`, selects an account/key
from the OS keychain, attaches it to the upstream call, and applies
failover / circuit-breaker / account-pool. **Same-format pass-through only** — no
cross-provider format conversion. It never binds a non-loopback address, never
proxies for other users, never operates as a hosted service.

## Revised key invariant

Old: *keys never leave the OS keychain.* New: **keys never *persist* outside the
OS keychain.** They are:
- read into the gateway heap **at request time** via `getSecret(profile, key)`,
- injected into the upstream `Authorization` / `x-api-key` header,
- **zeroized immediately after the upstream request completes** (per-request, NOT
  on shutdown — a key held until shutdown is resident for the whole session),
- never written to `~/.clihub`, `clihub.yaml`, `clihub.lock.json`, logs, or the
  sync bundle (the existing keychain-exclusion in `sync` is preserved verbatim).

The downstream CLI never holds the key — that is a security *improvement* over
today, where each CLI stores its own key.

## Threat model

| # | Threat | Control | Residual |
|---|---|---|---|
| T1 | Remote / LAN access to the daemon | Bind `127.0.0.1`/`::1` only; refuse `0.0.0.0` without `--unsafe-bind` + confirm | none if loopback holds |
| T2 | Browser-driven access (DNS-rebind / CSRF) | Reject any non-loopback `Host`/`Origin`; resolve-and-check Host names that map to loopback; no `Access-Control-Allow-Origin`; **bearer required on EVERY endpoint incl. `/health` `/metrics`** | none for browsers |
| T3 | Same-user process reads `gateway.json` token | 256-bit token, `0600`, constant-time compare, bound to daemon PID+start-nonce; **every authed request audited** | **accepted, documented**: same-user is not a real boundary |
| T4 | Key exfiltration via poisoned preset (SSRF) | **Linchpin** — upstream host read ONLY from **signed preset bytes**, signature re-verified at **gateway start** (not just catalog-sync); allowed-upstream-host pinset; untrusted/unsigned preset → empty pinset → refuse to dial | none if signing covers preset bodies |
| T5 | Weak keychain floor (`file` backend) | Gateway **hard-refuses to start** on the `file` backend (scrypt-over-`hostname:username`, no user secret → offline-derivable). No `--insecure-keychain` escape for gateway mode | none (refuses) |
| T6 | Key leaks into logs / error bodies | **Default-deny on request/response BODIES** (metadata only); audit path uses **allowlist** of loggable fields; strip injected `Authorization`/`x-api-key` from any error before it reaches a log or an HTTP error returned to the CLI | pattern-glob redaction is backup only |
| T7 | In-memory key exposure (core dump, swap, `/proc/pid/mem`) | `setrlimit(RLIMIT_CORE, 0)`; per-request zeroize; never log process memory | swap/ptrace by same-user root: accepted |
| T8 | Cross-account key leakage | Per-request profile binding + `CliPolicy` default-deny unknown tool ids; one CLI cannot be served another account's key | none |
| T9 | OAuth/subscription pooling → vendor ban | **Not shipped in v1.x, not even opt-in.** Pooling is **API-key accounts only.** A ToS warning does not protect users from bans | removed from scope |
| T10 | Audit tampering | Append-only audit is **forensics-if-it-survives**, not a security control; a same-user attacker who can drive the gateway can also truncate it. **Do not market it as a control** | accepted, documented |
| T11 | Upstream MITM | TLS verify on by default via existing `caBundle` → `NODE_EXTRA_CA_CERTS`; egress honors `resolveProxy()` (corporate proxy/CA) | none |

## Reproducibility as a security feature (the moat)

The gateway's differentiator is not failover — it is that its **entire config**
(routing rules, pool members, breaker thresholds, **pinned upstream hosts**) lives
in `clihub.yaml`, is pinned into the signed `clihub.lock.json`, and is enforced by
`status --strict`. "Your team's whole LLM routing topology is a reviewable, signed,
reproducible artifact" is a claim no competitor makes. A `status --strict` check
**fails CI if a gateway preset is configured against an untrusted catalog source.**

## Corrections folded in (vs. the first design draft)

These "pure reuse" assumptions were wrong against the actual code and are now
explicit new-work, not reuse:
- `profile/baseurls.ts` INJECTORS cover **only** `anthropic`/`openai`/`google`.
  Pointing qwen/kiro/cursor/goose at the gateway is **net-new** per-CLI work.
- **goose / YAML CLIs cannot be pointed at the gateway** via the existing seam
  (`proxy/inject.ts` throws for YAML configs; no YAML base-URL writer exists).
  Either build a YAML writer or **exclude goose from gateway takeover** explicitly.
- Gateway **outbound egress is a net-new HTTP client** (undici/fetch honoring the
  proxy URL + `NODE_EXTRA_CA_CERTS`). `proxy/inject.ts` only *writes* config;
  `proxy/detect.ts` only *reads* the system proxy. Neither is an HTTP client.
- `providers.json` **does not exist yet** — the ed25519 signing machinery is
  reusable, but the providers array, its conformance schema, and its inclusion in
  the signed checksum set are net-new signed content.
- `canonicalPayload` signs `{source, version, sorted checksums}` — **file hashes,
  not field bodies.** The upstream-host pinset is trustworthy only if the preset
  **bytes** containing the host are inside the signed checksum AND the gateway
  reads the host from the verified bytes AND re-verifies at start (T4).

## Exit criterion

Phase 2 leaves `experimental` **only** when a separate-lane security review (per
the project's code-review rules — never self-approved) confirms: loopback-only
enforcement, no-key-persist invariant (grep `~/.clihub` / `audit.log` /
`session.json` / sync bundle / logs for a planted secret → absent), per-request
zeroize, default-no-body-logging, bearer on every endpoint, signed-host-pinset
re-verified at start, mandatory keychain floor, API-key-only pool, audit on every
authed request.
