# Per-CLI provider binding (`clihub use`) — design

> Owner decision (2026-06-10): **each CLI holds its own (provider, default model)
> binding** — the switching unit is "claude-code uses DeepSeek's deepseek-chat",
> not "broadcast a baseURL to every CLI of one protocol family". Replaces the
> v1.51/52 family-broadcast model in [`endpoint/`](../packages/core/src/endpoint/index.ts).
> Key delivery: **write into each CLI's native config** (CC Switch's proven model),
> 0600 + sync/backup redaction; the OS keychain stays clihub's own master store.
> Command name: **`clihub use`** (`clihub provider` is taken by the declarative
> CLI-SDK; `endpoint use` becomes a deprecated alias).

## 1. Why the old model was wrong

`endpoint use deepseek` mapped preset→family→one injector: DeepSeek (family
`openai`) silently configured **Codex**, while the user meant Claude Code (which
DeepSeek serves via its Anthropic-compatible `/anthropic` endpoint). One preset
could carry only one protocol URL; the key never reached the CLI at all
(`profileEnvVector` exports config-dir paths only — verified); and the whole flow
was gated on an active profile. Five real breaks: inverted mental model, broken
key loop, profile prerequisite, silent zero-patch, no GUI guidance.

## 2. Empirical per-CLI configuration matrix (2026-06-10 research, 8-agent sweep)

Confidence: claude-code/codex/kiro/cursor verified on local installs; gemini/qwen/
goose verified at source/docs level.

| CLI | custom base URL | key the CLI actually reads | default model | native multi-provider |
|---|---|---|---|---|
| claude-code | env `ANTHROPIC_BASE_URL` (persist in settings.json `env`) | `ANTHROPIC_AUTH_TOKEN` (Bearer; what 3rd-party gateways want) or `ANTHROPIC_API_KEY` (x-api-key); `apiKeyHelper` script is lower-precedence | settings.json top-level `model`; tier slots `ANTHROPIC_DEFAULT_{HAIKU,SONNET,OPUS}_MODEL`; `ANTHROPIC_MODEL` is session-only | none |
| codex | `[model_providers.<id>].base_url` + top-level `model_provider` in config.toml | per-provider `env_key` names the env var; official auth lives in auth.json | config.toml top-level `model` (+ `model_reasoning_effort`) | **yes — first-class** |
| gemini-cli | env `GOOGLE_GEMINI_BASE_URL` only — **no settings.json field exists**; persist via `~/.gemini/.env` (auto-loaded) | `GEMINI_API_KEY` | settings.json `model.name` (nested v2 schema) | none |
| qwen-code | settings.json `modelProviders.<authType>[].baseUrl` | per-entry `envKey` names the env var | `model.name` (must match a modelProviders id) | **yes** — and supports the `anthropic` protocol natively |
| goose | config.yaml `ANTHROPIC_HOST`/`OPENAI_HOST`, or `custom_providers/<id>.json` `base_url` | per-provider env names (`ANTHROPIC_API_KEY`…); keyring first, never config.yaml | config.yaml `GOOSE_PROVIDER` + `GOOSE_MODEL` | **yes** — custom_providers JSON (engine: openai/anthropic/ollama) |
| kiro-cli | **unsupported** (AWS proprietary protocol) | `KIRO_API_KEY` (subscription key, not a provider key) | settings key `chat.defaultModel` ✅ | none |
| cursor-cli | **unsupported** (own backend; hidden local mode excluded) | `CURSOR_API_KEY` (own backend) | cli-config.json `model.modelId` ✅ | none |

**⇒ 5 CLIs are endpoint-switchable; kiro + cursor are model-only.** The UI must
say so honestly, never pretend.

CC Switch cross-check: its `UniversalProvider` is `{name, baseUrl, apiKey,
models: {claude: {model, haikuModel, sonnetModel, opusModel}, codex: {model,
reasoningEffort}, gemini: {model}}}` generating per-app native configs — the same
shape as this design. It writes keys into the live files, full-file swap with
backfill-on-switch; Claude Code hot-reloads, other CLIs need a manual restart.

## 3. Data model

### Catalog (`endpoints.json` schema v2)

```json
{
  "id": "deepseek",
  "label": "DeepSeek",
  "urls": {
    "anthropic": "https://api.deepseek.com/anthropic",
    "openai": "https://api.deepseek.com"
  },
  "authEnv": "DEEPSEEK_API_KEY",
  "models": ["deepseek-chat", "deepseek-reasoner"]
}
```

- `urls` (multi-protocol) replaces `family`+`baseURL`; one preset can serve both
  Claude Code (anthropic) and Codex/qwen/goose (openai). Loader accepts the old
  single-`family` shape and upgrades it in memory (migration shim, one release).
- `authEnv` stays a NAME; inline secrets stay forbidden (conformance unchanged).

### Bindings (state + lockfile)

`~/.clihub/bindings.json` (mirrored into the active profile when one exists):

```json
{ "claude-code": { "endpoint": "deepseek", "model": "deepseek-chat" },
  "codex":       { "endpoint": "openai",   "model": "gpt-5.5" } }
```

`Lockfile` already has a `provider` field (v1.60); it becomes the bindings map →
`status --strict` / `clihub diff` gate binding drift. **This is the moat step CC
Switch doesn't have: bindings are pinned, signed-catalog-sourced, CI-gated.**

### No profile prerequisite

`clihub use` works with zero profiles (writes the live config dirs directly —
which are the profile's vendor dirs when a profile is active, real dirs
otherwise). Profiles remain the multi-account layer on top, not a gate.

## 4. Write actions per CLI (the new injector table)

Each is the CLI's native idiom — we invent nothing. All writes atomic
(tmp+rename) + `snapshotBeforeWrite`, files chmod 0600 when a key is written.

| CLI | endpoint write | key write (owner-approved: native config) | model write |
|---|---|---|---|
| claude-code | settings.json `env.ANTHROPIC_BASE_URL` | `env.ANTHROPIC_AUTH_TOKEN` (default; gateway-compatible) | settings.json `model` |
| codex | config.toml `[model_providers.clihub-<id>]` `base_url`/`env_key`/`wire_api` + `model_provider` | `env_key = "<authEnv>"`; key carrier decided at impl (`experimental_bearer_token` keeps ChatGPT OAuth intact — CC Switch's opt-in mode) | config.toml `model` |
| gemini-cli | `~/.gemini/.env` `GOOGLE_GEMINI_BASE_URL` | `~/.gemini/.env` `GEMINI_API_KEY` | settings.json `model.name` |
| qwen-code | settings.json `modelProviders.<authType>[]` entry — **entry id = MODEL id** (`model.name` must match it; entries are models, unique by id+baseUrl), marker `name: "clihub:<endpoint>"`; binding therefore requires a model (`--model` or first catalog model) | entry `envKey` (NAME) + key value in the settings.json `env` map (qwen's documented plain-text slot, lowest precedence) | settings.json `model.name` |
| goose | config.yaml `GOOSE_PROVIDER` + `ANTHROPIC_HOST`/`OPENAI_HOST` (bare host, source-verified). ~~custom_providers JSON~~ rejected at impl: its `base_url` wants a full chat-completions path for openai and is unverified for anthropic — we don't guess | **not file-delivered** — goose reads keys only from its keyring or the provider's fixed env (`ANTHROPIC_API_KEY`/`OPENAI_API_KEY`); the bind reports the exact `export` to run | config.yaml `GOOSE_MODEL` |
| kiro-cli | — (report "endpoint: unsupported") | — | settings key `chat.defaultModel` |
| cursor-cli | — (report "endpoint: unsupported") | — | cli-config.json `model.modelId` (+`hasChangedDefaultModel`) |

Restore-to-official: each adapter knows how to clear its fields (claude: drop the
env keys → OAuth resumes — CC Switch's `{"env":{}}` insight; codex:
`model_provider` back to default; etc.).

Key flow on `use`: look up `authEnv` in the clihub keychain → found: write it into
the CLI slot above; missing: interactive prompt (TTY) or explicit error with
`clihub auth set <authEnv>` guidance — never silently bind an endpoint whose key
is absent. Keychain remains the master copy; sync/backup redaction already strips
key-shaped values from anything leaving the machine.

## 5. Command surface

```
clihub use <endpoint> --for <cli> [--model <m>]   # bind one CLI
clihub use <endpoint>                              # bind every installed CLI the preset supports (prints per-CLI plan first)
clihub use current                                 # one line per CLI: endpoint · model · key-present?
clihub use clear --for <cli>                       # restore official/default
clihub model <cli> <model>                         # model-only (the kiro/cursor path)
clihub endpoint …                                  # deprecated alias → forwards to `use`, prints a notice
```

GUI: Endpoints panel becomes a **CLI × endpoint matrix** (rows = installed CLIs,
current binding + model picker per row; kiro/cursor rows show model-only).
Daemon routes: `GET /v1/bindings`, `POST /v1/use {endpoint, cli?, model?}` —
same 1:1 kernel delegation rules.

## 6. Implementation slices

| Slice | Content | Size |
|---|---|---|
| **v1.62a** ✅ | catalog schema v2 + loader shim; `bindings.json`; `src/binding/` kernel module; claude-code + codex adapters; `clihub use` CLI; tests (sandbox HOME) | M |
| **v1.62b** ✅ | gemini/qwen/goose adapters; kiro/cursor model-only (`clihub model <cli> <m>`); `use clear [--for]`; lockfile `bindings` + `status --strict` gate; auto fan-out skips a model-requiring CLI when the preset lists no models (explicit `--for` still fails loud) | M |
| **v1.63** | daemon routes + GUI matrix panel + TUI menu; `endpoint` deprecation notice | S–M |

Out of scope: per-request routing/failover (gateway territory, P2-gated);
OAuth/subscription account pooling (ToS risk — unchanged).
