# docs/assets

Binary assets referenced from the README and other markdown files.

## Screenshots used by the README

Drop these PNGs here (the README already links them by these exact names).
Capture at a retina/2× scale, then trim to the window/panel. Keep each ≤ 1.5 MB.

| File | What it shows | How to capture |
|---|---|---|
| `gui.png` | Desktop app hero — the Dashboard (health matrix) or Drift panel, full window | Run the desktop app (`cd clihub-desktop && bun tauri dev`), screenshot the window |
| `tui.png` | Terminal hero — `clihub` interactive main menu | Run `clihub` in a clean terminal, screenshot the menu |
| `gui-dashboard.png` | GUI Dashboard panel — cross-CLI health/version matrix | Desktop app → Dashboard |
| `gui-drift.png` | GUI Drift panel — lockfile compliance (ok / drift / missing) | Desktop app → Drift |
| `gui-endpoints.png` | GUI Endpoints panel — per-CLI endpoint + model binding matrix | Desktop app → Endpoints |
| `gui-proxy.png` | GUI Proxy panel — per-CLI proxy + detected system proxy | Desktop app → Proxy |
| `tui-menu.png` | TUI per-CLI menu (install / skill / proxy / endpoint) | `clihub` → pick a CLI |

Tip: for a clean GUI capture, point the SPA at a daemon with real data —
`clihub daemon start` then `cd clihub-desktop && bun tauri dev` (the shell
injects the token; panels render live). The `paper` (light) theme tends to
screenshot best on light READmes; `console` (default dark) on dark.

## Optional

| File | How to regenerate |
|---|---|
| `demo.gif` | `asciinema rec --command "bash scripts/demo.sh" demo.cast` then `agg --speed 1.0 demo.cast docs/assets/demo.gif`. Keep ≤ 4 MB. |

Add new assets by name; do not store generated tarballs / images
larger than 5 MB here (use Releases instead).
