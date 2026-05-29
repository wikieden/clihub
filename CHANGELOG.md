# Changelog

All notable changes to `@wikieden/clihub`. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions are published to
npm on each `vX.Y.Z` tag.

## [1.10.0] — clihub recommend

- `clihub recommend [--json]` suggests skills / presets / MCP from two
  read-only signals: which CLIs are installed + what the current project
  looks like (cwd files → tags: frontend / python / docker / git / ...).
  Each suggestion carries a reason and a ready-to-run command. Advisory
  and non-writing. (MCP items point at the TUI until `clihub mcp install`
  lands in v1.12.)

## [1.9.0] — onboarding polish + quality pass

Individual/newcomer-focused line.

- **First-run guidance:** `clihub` TUI now detects an empty machine and
  shows a welcome note + a top-level "🚀 Quick start" option that applies
  the `starter` preset (Claude Code + 5 core skills) in one step.
- `clihub doctor` prints a get-started hint (`preset apply starter` /
  `clihub`) when no CLI is installed.
- **Quality (internal):** `bun test` suite expanded to 33 tests / 10 files
  — i18n key-set parity guard (en/zh-CN/ja/ko/es), plus IO coverage for
  status / conformance / memory. CI `unit` job runs them on push/PR.

## [1.8.0] — auth login --browser (PKCE)

- `clihub auth login <provider> --browser` implements OAuth Authorization
  Code + PKCE (RFC 7636) over a 127.0.0.1 loopback redirect, for providers
  without a device flow. CSPRNG `state` (CSRF protection, verified on
  redirect), S256 code challenge, loopback bound to localhost and closed
  in `finally`. Security-reviewed (1 HIGH fixed: state now uses
  `crypto.randomBytes`). Completes the three login modes:
  device grant / PKCE browser / refresh.

## [1.7.0] — clihub conformance

- `clihub conformance [dir] [--json]` validates a catalog against the
  published specs: manifest + sha256 integrity, JSON parse, declarative
  provider specs, signature status (unsigned = soft warning), optional
  `clihub.lock.json` v1. Read-only; the machine-checkable basis for a
  `clihub-compatible` badge. Exits non-zero when not conformant.

## [1.6.0] — auth login --refresh

- `clihub auth login <provider> --refresh` re-mints an access token from
  the stored `refresh_token` (RFC 6749 §6 refresh grant) with no browser —
  the token-expiry-recovery half of unified auth. Rotates the refresh
  token when the provider returns a new one; rewrites the native
  credential file (0600).

## [1.5.0] — clihub auth login

- `clihub auth login <provider>` implements the OAuth 2.0 Device
  Authorization Grant (RFC 8628) — headless/CI-friendly, no browser
  redirect. Vendor specifics (endpoints, client id, scope) are BYO config
  in `~/.clihub/auth-providers.json`; the token is written to the CLI's
  native credential file (0600, atomic). Honours
  `authorization_pending` / `slow_down`, bounded by the device-code
  deadline. Security-reviewed: no token material logged, parent dir 0700,
  provider strings sanitized before printing.

## [1.4.0] — clihub pack

- `clihub pack <docker|brew|scoop> [--out file]` generates distribution
  manifests (Dockerfile / Homebrew formula / Scoop manifest) for the
  current version. Reach beyond npm; pure generation, no new deps.
  (brew carries a `__FILL_SHA256__` placeholder for the tap maintainer.)

## [1.3.0] — clihub auth status

- `clihub auth status [--json]` reports cross-CLI login + token-expiry
  visibility — a best-effort, read-only inspection of each CLI's
  credential file (Claude Code / Codex / Gemini), showing logged-in /
  expiring / expired without printing token contents. First slice of
  unified auth (GH #33811 / #34306); a full OAuth login flow follows.

## [1.2.0] — clihub team

- `clihub team <add|list|pull|use|push|rm>` shares a reproducible
  toolchain through a plain git repo (cloned into `~/.clihub/team/<name>`).
  `push` commits `clihub.yaml` / `clihub.lock.json` / `clihub.memory.md` /
  `clihub.schema.json`; `use` pulls them into a project. No clihub-specific
  backend; team config is unencrypted (sign the catalog for authenticity).

## [1.1.0] — clihub ci

- `clihub ci [github|gitlab] [--out file] [--node]` generates a CI
  workflow that validates `clihub.yaml` (`apply --plan`) on every push,
  with commented opt-ins for `memory generate --check` and
  `status --strict`. Pure generation, no new dependencies.

## [1.0.0] — 2026-05-29

First stable release. clihub is now a complete, vendor-neutral manager for
multiple AI coding CLIs: install them, keep their skills/MCP/plugins in
sync, pin and roll back versions, carry config across machines, and gate
CI on a shared lockfile.

Stable surface (no breaking changes planned without a major bump):
`clihub.yaml` schema v1, `clihub.lock.json` v1, the `@clihub/core` public
API, and the `clihub` CLI command set.

## [0.12.0] — clihub schema

- `clihub schema [--out file]` emits a draft-07 JSON Schema for
  `clihub.yaml`, enabling autocomplete + inline validation via the YAML
  language server (`# yaml-language-server: $schema=...`).

## [0.11.0] — clihub status

- `clihub status [--json] [--strict]` checks this machine against the
  pinned `clihub.lock.json` (ok / drift / missing / unlocked). `--strict`
  exits non-zero for CI drift gates.
- `clihub lock` now also resolves declarative providers.

## [0.10.0] — declarative provider SDK

- Teach clihub a new AI CLI with a JSON spec (`~/.clihub/providers.json`
  or a catalog `providers.json`) — detection + npm/bun/brew install, no
  code or fork. `clihub provider list|add|remove`.
- Shell-command installs gated behind `--allow-scripts`; built-in
  providers cannot be shadowed.

## [0.9.0] — signed catalogs

- ed25519 catalog signing (`catalog keygen` / `sign`) + a local trust
  store (`catalog trust add --source`). `catalog verify` now checks both
  sha256 integrity and publisher authenticity. Pure `node:crypto`.

## [0.8.0] — clihub sync

- `clihub sync export|import`: cross-machine, end-to-end-encrypted config
  bundle (global config + catalog sources + profile metadata). scrypt +
  AES-256-GCM, passphrase-only, zero backend.

## [0.7.0] — clihub memory

- `clihub memory generate`: one source (`clihub.memory.md` → `AGENTS.md`
  → `CLAUDE.md`) fans out to `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` /
  `.cursor/rules/*.mdc` / `.goosehints` / `.kiro/steering/*.md`.
  Managed-block markers preserve hand-edits; `--check` for CI.

## [0.6.1] — clihub apply + lockfile

- `clihub apply [--plan]`, `clihub lock`, `clihub install --frozen`:
  converge a machine to `clihub.yaml`, pin to `clihub.lock.json`.

## [0.6.0] — federation + more CLIs

- Multi-source catalog federation (`catalog add`), Cursor + Goose
  providers (6 CLIs total), HTTP/SSE MCP transport.

## [0.5.x]

- `watch` / `search` / shell completion / man; proxy + CA bundle;
  `doctor --fix` + error codes; multi-account profiles + keychain vault +
  per-profile `BASE_URL` injection; per-tool version pin/rollback; skill
  audit.

## [0.1.0 – 0.4.0]

- Providers (Claude Code / Codex / Kiro / Gemini), 30 skills, presets,
  cross-tool skill fan-out, i18n, per-CLI TUI, MCP catalog, agentskills.io
  SKILL.md installer, plugin install, remote catalog sync with sha256,
  Codex TOML, Windows-safe paths.
