# Spec 04 — Catalog registry API (draft, v1.7 planned)

> **Status: design.** Blocked on a hosted backend (`clihub.dev`). Today
> catalogs are static JSON federated by URL (`clihub catalog add`) and
> signed with ed25519 (`clihub catalog sign`). This spec describes the
> npm-style publish API that removes the PR-to-a-repo step.

## Principle

The registry is **optional and additive**. A registry is just another
catalog source; clients that only speak the static-file format (Spec 01 +
catalog JSON) keep working. No lock-in.

## Endpoints (HTTP/JSON)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/catalog/manifest.json` | signed manifest + per-file sha256 |
| `GET` | `/v1/catalog/{skills,tools,presets,mcp,plugins,providers}.json` | catalog files |
| `GET` | `/v1/search?q=` | server-side search (mirror of `clihub search`) |
| `PUT` | `/v1/publish/{kind}/{id}` | authenticated publish (token in header) |
| `GET` | `/v1/keys` | publisher public keys (for the trust store) |

## Publish

`clihub publish <kind> <path>` packages an entry, signs it with the
publisher's ed25519 key, and `PUT`s it. The server verifies the signature
against a registered public key before accepting — the same trust model as
local `catalog verify`, enforced server-side.

## Compatibility

- Manifest + signature format identical to the static catalog, so
  `catalog sync` / `verify` work against a registry URL with no changes.
- `clihub-compatible` badge = passes the published conformance suite
  (reads Spec 01/02 + catalog JSON, verifies a signed manifest).

## Why blocked

Needs a hosted service (storage, auth, abuse controls) — out of scope for
the local, backend-free tool. The static-file + git-federation path
(shipped) covers teams today; the registry is the public-scale step.
