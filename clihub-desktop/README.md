# clihub-desktop

Tauri 2 + Svelte 5 desktop shell for clihub. A thin supervisor: it spawns the
`@clihub/daemon` sidecar, injects `window.__CLIHUB__ = { baseUrl, token }` into
the WebView before any SPA code runs, and renders 9 panels (Dashboard, Drift,
Endpoints, MCP, Skills, Profiles, Versions, Yaml, Sync/Team) against the
daemon's HTTP surface. All logic lives in `@clihub/core` — golden parity:
daemon == CLI == kernel.

## Dev

```sh
bun install            # repo root
cd clihub-desktop
bun tauri dev          # vite on :1420 + Rust shell; spawns the daemon via bun
```

Browser-only iteration (no Rust build): `clihub daemon start` + `npm run dev`,
then open http://localhost:1420 — the SPA falls back to `~/.clihub/daemon.json`
discovery when `window.__CLIHUB__` is absent.

## Shell behavior (v1.64)

- **Tray**: closing the window hides it to the system tray; the daemon keeps
  running. Tray menu: Open clihub · Panels (all 9) · Check for updates… · Quit.
  Real exit paths (tray Quit, Cmd+Q) kill the daemon in `RunEvent::Exit`.
  Linux note: tray click events are not emitted there — use the menu.
- **Deep links**: `clihub://<panel>` (e.g. `clihub://drift`, also
  `clihub://panel/drift`) opens/focuses the window and switches the SPA panel
  via `location.hash`. Panel ids are whitelisted in `src-tauri/src/lib.rs`
  (`PANELS`) and must match `App.svelte`. macOS registers the scheme only at
  bundle time — test with the built .app installed in /Applications
  (`open "clihub://versions"`); dev-mode testing works on Windows/Linux only.
- **Updater**: checks
  `https://github.com/wikieden/clihub/releases/latest/download/latest.json`
  (tauri-action's static JSON format) on startup in packaged builds, and on
  demand from the tray. Update archives are minisign-verified against the
  pubkey pinned in `tauri.conf.json`.

## Update signing

`bundle.createUpdaterArtifacts` is on, so `tauri build` requires the signing
key:

```sh
export TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/clihub.key"   # path or content
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""                  # key has no password
bun tauri build
```

The keypair was generated with `tauri signer generate`. The private key lives
outside the repo (`~/.tauri/clihub.key`, 0600) — **never commit it**; losing it
means existing installs can never update again.

## CI release (v1.67)

`.github/workflows/desktop-release.yml` builds macOS (universal) / Windows /
Linux bundles via `tauri-action` and publishes them to a **draft** GitHub
Release with the updater `latest.json` the app polls. It's a separate lane from
the npm release (`release.yml`):

```sh
git tag desktop-v1.66.0
git push origin desktop-v1.66.0   # → builds 3 platforms, opens a draft release
```

(or run the workflow manually with a `tag` input). Requires two repo secrets —
`TAURI_SIGNING_PRIVATE_KEY` (content of `~/.tauri/clihub.key`) and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (empty for this key). The release is created
as a draft so a human reviews artifacts before publishing — and the updater only
reads `latest.json` from the **published** `releases/latest`, so the rollout is
gated on that manual publish.

## Not yet wired

- Packaged sidecar (`externalBin`) — packaged builds still resolve `bun` from
  the usual install paths and run the daemon from source.
- macOS notarization / Windows code signing certificates (user-side).
