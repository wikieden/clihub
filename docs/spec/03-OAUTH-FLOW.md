# Spec 03 — Unified OAuth login (draft, v1.5 planned)

> **Status: design.** Implementation is blocked on external infrastructure:
> each vendor (Anthropic / OpenAI / Google) requires its own OAuth client
> registration (client id, redirect URI, scopes) and token endpoints.
> clihub will not ship a half-working login, so this spec fixes the
> contract; `clihub auth status` (v1.3) already ships the read-only half.

## Goal

`clihub auth login [provider]` runs the provider's OAuth (PKCE) flow once
and writes the resulting token into that CLI's **native** credentials file,
so the CLI works unchanged. No clihub proxy sits in the data plane
(vendor-neutrality: config-adapter only, never a gateway).

## Flow

1. Start a localhost loopback redirect server on an ephemeral port.
2. Open the provider authorize URL with PKCE `code_challenge`.
3. Receive `code`, exchange at the token endpoint for `{access_token,
   refresh_token, expires_at}`.
4. Write to the native credential path (mirrored from `auth/credentials.ts`):
   - claude-code → `~/.claude/.credentials.json`
   - codex → `~/.codex/auth.json`
   - gemini-cli → `~/.gemini/oauth_creds.json`
5. Record nothing sensitive in clihub state; the OS keychain remains the
   vault for any clihub-managed secret.

## Expiry recovery

`clihub auth status` already detects `expired`. `login --refresh` uses a
stored `refresh_token` (when the provider issues one) to mint a new access
token without a browser round-trip; otherwise it re-runs the full flow.

## Open questions

- Per-vendor client-id distribution (ship clihub's own, or BYO via
  `CLIHUB_<VENDOR>_CLIENT_ID`). BYO is the vendor-neutral default.
- Device-code flow for headless/CI hosts with no browser.
