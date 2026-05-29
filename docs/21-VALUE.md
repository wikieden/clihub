# Who clihub is for

clihub serves three audiences with the same kernel. Each gets a different
slice of the value.

---

## 1. Newcomers — "I just want it working"

**Pain:** which CLI? how to install? config is empty, copy-pasting a skill
into the wrong folder errors out, an upgrade broke everything and there's
no way back.

**What clihub gives:**

- One install line, then `clihub` — an interactive TUI wizard (≤ 5 steps to
  a working CLI).
- `clihub preset apply starter` — one command installs a CLI + 5 core skills.
- `clihub doctor` shows what's wrong at a glance; `clihub doctor --fix`
  auto-remediates.
- Every error has a code (`CLIHUB-E-NNN`) with a linked doc.
- Auto i18n — English / 简体中文 / 日本語 / 한국어 / Español from `$LANG`.
- `clihub backup` before anything risky, `clihub rollback` to undo. Nothing
  to fear.

**Outcome:** zero → working in ~5 minutes, without learning any CLI's folder
layout.

---

## 2. Individual developers — "keep my whole stack in sync"

**Pain:** several CLIs, each with its own skill install; hand-syncing skills
across folders; an unrelated upgrade breaks a tool; juggling work/personal
accounts; writing `CLAUDE.md` + `AGENTS.md` + `GEMINI.md` separately.

**What clihub gives:**

- Cross-CLI fan-out: `clihub skill install <id>` lands the skill in every
  installed CLI. Same for MCP servers and plugins.
- `clihub memory generate` — one source (`clihub.memory.md`) writes
  `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` / `.cursor/rules` / `.goosehints`
  / `.kiro/steering`, preserving your hand edits.
- Version pin + rollback per tool — survive a bad release (`tool install
  <id>@<version>`, `tool rollback <id>`).
- Multi-account profiles + OS-keychain vault; per-profile `BASE_URL` to
  point at a self-hosted gateway.
- Declare your environment in `clihub.yaml`; reproduce it on a new machine
  with `clihub apply`.
- `clihub sync export|import` — carry config across machines, E2E-encrypted.
- Daily ergonomics: `search`, `watch`, shell completion, man page.

**Outcome:** one source of truth across every CLI and every machine; upgrades
stop being scary.

---

## 3. Teams & enterprises — "make it reproducible, governed, recoverable"

**Pain:** every dev's toolchain drifts; no way to gate "are we all on the
same versions"; supply-chain risk from unvetted skills; secrets and proxies
to manage on a corp network; no audit trail.

**What clihub gives:**

- **Reproducibility:** `clihub.yaml` → `lock` → `install --frozen`; `clihub
  status --strict` fails CI when a machine drifts off the pinned toolchain.
- **Team distribution:** `clihub team push|use` shares config through a plain
  git repo — no clihub backend. `clihub ci` generates the CI gate.
- **Supply-chain trust:** `skill audit` flags shell/hooks/network risks;
  ed25519 **signed catalogs** + a local trust store — a forged manifest
  can't be re-signed; private catalog federation (`catalog add`).
- **Blast-radius control:** timestamped backup before every write +
  one-command rollback; per-tool version pin/rollback; `doctor --fix`.
- **Accounts / network:** keychain vault, work/client profiles, HTTP/HTTPS/
  SOCKS5 proxy + MITM CA bundle, per-profile `BASE_URL` for self-hosted
  gateways, unified OAuth login (device / PKCE / refresh).
- **Vendor-neutral + extensible:** declarative provider SDK adds an internal
  or new CLI via a JSON spec (no fork); never a data-plane gateway, no
  lock-in, zero telemetry by default.

**Outcome:** a team can lock, sign, audit, roll back, and sync its AI
toolchain like `package-lock.json` + Terraform.

**Not yet (gated on external infra — see [`11-ROADMAP.md`](11-ROADMAP.md)):**
SSO + a central admin console, a hosted private registry (`clihub.dev`),
license-compliance scanning, centralized usage/quota dashboards. Today's
value is **team-scale and self-hosted / git-based**; the enterprise control
plane is the v2.0 milestone.
