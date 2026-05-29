# clihub specifications (RFC drafts)

Pillar I (Spec & standards): clihub authors open specs so **any** client —
not just clihub — can read/write the same formats. Two are already shipped
and stable; two are designs for infra-blocked roadmap items.

| # | Spec | Status | Shipped in |
|---|---|---|---|
| [01](01-PROVIDER-SPEC.md) | Declarative provider JSON | **stable** | v0.10.0 |
| [02](02-LOCKFILE.md) | `clihub.lock.json` v1 | **stable** | v0.6.1 |
| [03](03-OAUTH-FLOW.md) | Unified OAuth login | draft (design) | v1.5 (planned) |
| [04](04-REGISTRY.md) | Catalog registry API | draft (design) | v1.7 (planned) |

"Stable" specs describe formats clihub already produces and consumes; they
will not change without a major version bump. "Draft" specs are designs for
features blocked on external infrastructure (vendor OAuth client IDs, a
hosted registry backend) — they capture the intended contract so the
implementation, when unblocked, has a fixed target.

Related: [`../19-CLIHUBYAML.md`](../19-CLIHUBYAML.md) (clihub.yaml schema,
also emitted as JSON Schema by `clihub schema`).
