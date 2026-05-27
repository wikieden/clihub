# Config, proxy & profile design (Pillar IX)

This document is the implementation contract for Sprints 6 and 7 (v0.5.1 + v0.5.2). It supersedes the higher-level summary in [`17-INFRA-PILLARS.md`](17-INFRA-PILLARS.md).

## 1. On-disk layout

```
~/.clihub/
├── config.json              ← global clihub config (proxy, ca-bundle, default profile)
├── audit.log                ← JSON-lines audit trail (v0.5.3+)
├── catalog/                 ← synced upstream catalog (already implemented)
│   ├── manifest.json
│   ├── skills.json
│   ├── tools.json
│   ├── presets.json
│   ├── mcp.json
│   └── plugins.json
├── skill-md-cache/<sha>/    ← cached git clones from `skill install <url>`
└── profiles/                ← multi-account
    ├── personal/
    │   ├── .claude/
    │   ├── .codex/
    │   ├── .gemini/
    │   └── .kiro/
    ├── work/
    │   └── ...
    └── client-x/
        └── ...
```

A single symlink `~/.clihub/current-profile → profiles/<name>` records the active profile. Each `clihub profile use <name>` updates the symlink atomically (via `rename(2)`).

## 2. `~/.clihub/config.json` schema

```jsonc
{
  "version": 1,
  "language": "auto",                       // override $LANG / CLIHUB_LANG
  "defaultProfile": "personal",             // used when no `clihub.yaml profile:` set

  "proxy": {
    "http":  "http://corp.proxy:8080",      // optional; falls back to env
    "https": "http://corp.proxy:8080",
    "all":   null,                          // when set, overrides http+https
    "noProxy": "localhost,127.0.0.1,*.corp.example.com",
    "applyTo": ["clihub", "claude-code", "codex", "gemini-cli", "kiro-cli"]
  },

  "caBundle": "/etc/ssl/corp-ca.pem",       // optional; injected as NODE_EXTRA_CA_CERTS etc.

  "telemetry": false,                        // never on by default
  "catalogMirror": null                      // override DEFAULT_CATALOG_URL
}
```

All keys optional. Missing = inherit env / defaults.

## 3. Proxy resolution order

For any outbound request clihub itself makes:

1. `--proxy <url>` flag (per-invocation)
2. `~/.clihub/config.json:proxy.{http,https,all}` matching the URL scheme
3. `ALL_PROXY` env
4. `HTTPS_PROXY` / `HTTP_PROXY` env
5. None.

`NO_PROXY` always honoured (host + suffix matches).

For each managed CLI, the resolved proxy is written into its native settings file on `clihub apply` / `clihub proxy set`:

| CLI | Setting written |
|---|---|
| Claude Code | `~/.claude/settings.json:env.HTTPS_PROXY` (env-injection block) |
| Codex | `~/.codex/config.toml:[env]\nHTTPS_PROXY = "..."` |
| Gemini | `~/.gemini/settings.json:proxy` |
| Kiro | `~/.kiro/settings/config:proxy` (TBD when Kiro stabilises) |

Plus `npm config set proxy <url>` and `git config --global http.proxy <url>` if the user passes `--apply-to-system`.

## 4. CA bundle

When `caBundle` is set, on each `clihub apply` / profile activation:

- export `NODE_EXTRA_CA_CERTS=<path>` for the launched CLI
- export `GIT_SSL_CAINFO=<path>`
- export `CURL_CA_BUNDLE=<path>`
- write the bundle path into each CLI's settings where the CLI exposes a custom-CA field

Validation:

```bash
clihub doctor --fix
# CLIHUB-E-201: ca-bundle file unreadable
# CLIHUB-E-202: ca-bundle does not validate against the configured proxy
```

## 5. Proxy CLI surface

```bash
clihub config get proxy
clihub config set proxy.http   http://corp.proxy:8080
clihub config set proxy.https  http://corp.proxy:8080
clihub config set proxy.noProxy localhost,127.0.0.1,*.corp.example.com

# shorthand: apply to every CLI in proxy.applyTo
clihub proxy set http://corp.proxy:8080 [--tool all]

# unset
clihub proxy unset [--tool all]

# diagnose
clihub proxy test                 # tries to reach catalog + each vendor API
```

## 6. Profiles

### Provisioning

```bash
clihub profile create personal
clihub profile create work --from personal     # clone
clihub profile create client-x --empty          # blank dotdirs
```

`create` is idempotent: re-running on an existing profile is a no-op.

### Switching

Activation is symlink swap + env mutation:

```bash
clihub profile use work
# ln -sfn ~/.clihub/profiles/work ~/.clihub/current-profile
```

The shell hook (installed via `clihub completion <shell>`) maps `~/.clihub/current-profile` to `HOME` for any child process invoking `claude` / `codex` / `gemini` / `kiro` — so the *underlying CLIs* keep finding their own `~/.claude` etc., they just see a different one per profile.

Implementation note: rather than literally re-writing `$HOME`, the hook exports four targeted env vars the vendors accept:

| CLI | Env override |
|---|---|
| Claude Code | `CLAUDE_HOME` (proposed; falls back to copying files into `$HOME/.claude`) |
| Codex | `CODEX_CONFIG_DIR` |
| Gemini | `GEMINI_CONFIG_DIR` |
| Kiro | `KIRO_CONFIG_DIR` |

If a vendor lacks an override env var, clihub falls back to a directory swap (`rename(2)` of `~/.claude` ↔ `~/.clihub/profiles/<name>/.claude`) at `profile use` time. The swap is recorded in `audit.log` and reversed on next switch.

### Per-project default

```yaml
# clihub.yaml
profile: work
```

The shell hook (`__clihub_chpwd`) calls `clihub profile use <name>` whenever the user `cd`s into a directory whose `clihub.yaml` declares a profile.

### Sharing rules

```yaml
profile: work
shared:
  - skills              # ~/.clihub/profiles/work/.claude/skills/ → symlink to ~/.clihub/shared/skills/
  - plugins
  - mcp.filesystem
not-shared:
  - settings.api-keys   # explicit redaction; never share
```

Implementation: `shared:` items are stored at `~/.clihub/shared/` and symlinked into each profile that opts in. Removing the share rule replaces the symlink with a real copy.

## 7. Credential vault

`clihub auth set <KEY>` writes to the active profile's keychain namespace and rewrites the CLI's credentials file:

| Platform | Backing store | Service name |
|---|---|---|
| macOS | Keychain (`security add-generic-password`) | `clihub:<profile>` |
| Linux | libsecret via `secret-tool` | service = `clihub`, attribute `profile=<name>` |
| Windows | Credential Manager (`cmdkey`) | `clihub:<profile>:<KEY>` |

CLI surface:

```bash
clihub auth set ANTHROPIC_API_KEY            # prompts (TTY) or reads stdin
clihub auth set OPENAI_API_KEY < /run/secrets/openai.txt
clihub auth list                              # KEY (masked) → CLIs using it
clihub auth rm OPENAI_API_KEY
clihub auth rotate ANTHROPIC_API_KEY          # new value + re-write all CLIs
```

`clihub profile use <name>` re-injects all keys from the new profile's vault into each CLI's credentials file (and removes them from the previous profile's files if any of them are mutually exclusive — e.g. shared `~/.aws/credentials`-style globals).

## 8. Unified OAuth

```bash
clihub login anthropic
# opens browser → OAuth flow → token → keychain → ~/.claude/credentials.json
clihub login openai
clihub login google
clihub login --all                          # for each provider clihub knows
```

`clihub auth refresh` periodically rotates expiring tokens via the provider's refresh endpoint.

## 9. Audit log

Every config / proxy / profile / auth mutation appends a JSON-lines record:

```jsonc
{"ts":"2026-07-08T14:23:11.482Z","actor":"cli","action":"profile.use","from":"personal","to":"work"}
{"ts":"2026-07-08T14:24:02.115Z","actor":"cli","action":"auth.set","key":"ANTHROPIC_API_KEY","profile":"work"}
{"ts":"2026-07-08T14:24:18.001Z","actor":"cli","action":"proxy.set","tool":"claude-code","url":"http://corp.proxy:8080"}
```

`clihub audit tail [--profile <name>]` for human-readable view; `jq` over the file works directly.

## 10. Error codes

| Code | Meaning |
|---|---|
| `CLIHUB-E-100` | proxy URL unparseable |
| `CLIHUB-E-101` | proxy reachable but refuses CONNECT |
| `CLIHUB-E-102` | proxy auth rejected |
| `CLIHUB-E-103` | proxy TLS handshake failed (likely needs `ca-bundle`) |
| `CLIHUB-E-201` | ca-bundle path unreadable |
| `CLIHUB-E-202` | ca-bundle doesn't validate target host |
| `CLIHUB-E-300` | profile name invalid (must match `[a-z][a-z0-9-]{0,30}`) |
| `CLIHUB-E-301` | profile not found |
| `CLIHUB-E-302` | profile in use (refuses delete) |
| `CLIHUB-E-303` | profile dir corrupt (missing expected sub-dirs) |
| `CLIHUB-E-400` | keychain unavailable on this OS (fallback file-based vault, encrypted with libsodium + machine-bound key) |
| `CLIHUB-E-401` | auth key not set in active profile |
| `CLIHUB-E-500` | OAuth state mismatch (CSRF) |
| `CLIHUB-E-501` | OAuth provider declined (forwarded message) |

Every code links to `https://clihub.dev/errors/<code>`; pages provide copy-pastable fixes.

## 11. TUI surfaces

New top-level branches in the main menu (v0.5.1 / v0.5.2):

```
Main menu
├─ <existing CLI branches>
├─ Cross-tool
│   ├─ Apply preset
│   ├─ Doctor across every CLI
│   ├─ Backup / Restore
│   └─ ...
├─ Settings              ← new
│   ├─ Language
│   ├─ Proxy
│   │   ├─ Current effective proxy
│   │   ├─ Set HTTPS proxy
│   │   ├─ Set CA bundle
│   │   └─ Test connection
│   └─ Profiles
│       ├─ Current profile + path
│       ├─ Switch
│       ├─ Create
│       └─ Delete
└─ Exit
```

## 12. Acceptance scenarios

```bash
# Corp dev with MITM + custom CA
clihub config set proxy.https http://corp.proxy:8080
clihub config set ca-bundle /etc/ssl/corp-ca.pem
clihub catalog sync                              # succeeds
clihub doctor                                    # all green

# Multi-account dev
clihub profile create personal --from-current
clihub profile create work --empty
clihub profile use work
clihub login anthropic                           # browser OAuth → work account
cd ~/projects/client-x
cat clihub.yaml                                  # profile: client-x
clihub doctor                                    # auto-switched to client-x

# China dev behind GFW
CLIHUB_CATALOG_MIRROR=https://cn.catalog.example.com/ \
HTTPS_PROXY=socks5://127.0.0.1:1080 \
clihub catalog sync
# verifies sha256 against the same canonical manifest
```

## 13. Out-of-scope (this design)

- Cloud sync of profiles (Phase 2 monetisation — see [`13-MONETIZATION.md`](13-MONETIZATION.md)).
- Hardware-backed credential storage (TPM / Secure Enclave) — possible follow-up.
- Provider-side proxy enforcement (some CLIs hardcode endpoints; we can't fix that here).
- Mirroring catalog ourselves at multiple geographies — we ship the protocol; mirrors are user-supplied.
