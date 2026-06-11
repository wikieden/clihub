/**
 * Per-CLI provider binding — `clihub use` / `clihub model` (docs/25-PROVIDER-BINDING.md).
 *
 * Each CLI holds its own (endpoint, default model) binding; the switching unit
 * is "claude-code uses DeepSeek's deepseek-chat", never a protocol-family
 * broadcast. Writes use each CLI's NATIVE idiom (researched 2026-06-10):
 *   claude-code → settings.json env.ANTHROPIC_BASE_URL / env.ANTHROPIC_AUTH_TOKEN
 *                 (Bearer — what third-party gateways accept) + top-level model
 *   codex       → config.toml model_provider/model + [model_providers.clihub-<id>]
 *                 (its first-class multi-provider mechanism)
 *   gemini      → ~/.gemini/.env GOOGLE_GEMINI_BASE_URL + GEMINI_API_KEY (the env
 *                 file gemini-cli auto-loads; no settings.json URL field exists)
 *                 + settings.json nested model.name
 *   qwen        → settings.json modelProviders.<authType>[] entry — entries ARE
 *                 models (unique by id+baseUrl) and model.name must match the
 *                 entry id, so an endpoint binding REQUIRES a model; key goes in
 *                 the settings.json `env` map (its documented plain-text slot)
 *   goose       → config.yaml GOOSE_PROVIDER/GOOSE_MODEL + ANTHROPIC_HOST/
 *                 OPENAI_HOST (bare host, verified in goose source). goose reads
 *                 keys ONLY from its keyring or fixed env names — config.yaml
 *                 never stores keys, so key delivery is reported, not written.
 *                 (custom_providers JSON was rejected: its base_url wants a full
 *                 chat-completions path for openai and is unverified for
 *                 anthropic — we do not guess.)
 *   kiro/cursor → model-only (proprietary backends; endpoints unsupported):
 *                 ~/.kiro/settings/cli.json "chat.defaultModel" (flat dotted key)
 *                 and ~/.cursor/cli-config.json model.modelId + hasChangedDefaultModel.
 *
 * Key policy (owner-approved): the key is written into the CLI's native config
 * slot (file chmod 0600); the clihub keychain stays the master copy, and
 * sync/backup redaction keeps keys from leaving the machine. Binding an
 * endpoint whose key is missing THROWS unless `allowMissingKey` is set —
 * never a silent half-binding.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonSettingsAdapter } from '../settings/index.js';
import { TomlSettingsAdapter } from '../settings/toml.js';
import { YamlSettingsAdapter } from '../settings/yaml.js';
import { findEndpoint, endpointUrls } from '../endpoint/index.js';
import type { CatalogLoader } from '../catalog/index.js';
import type { EndpointPreset, EndpointProtocol } from '../types.js';

export interface CliBinding {
  /** Absent for model-only bindings (kiro/cursor, or `clihub model`). */
  endpoint?: string;
  model?: string;
}

/** tool id → binding. */
export type Bindings = Record<string, CliBinding>;

export function defaultBindingsPath(home = os.homedir()): string {
  return path.join(home, '.clihub', 'bindings.json');
}

export interface BindingIoOpts {
  /** Home dir override (tests). */
  home?: string;
}

export async function readBindings(opts: BindingIoOpts = {}): Promise<Bindings> {
  try {
    const raw = await fs.readFile(defaultBindingsPath(opts.home), 'utf8');
    return JSON.parse(raw) as Bindings;
  } catch {
    return {};
  }
}

export async function writeBindings(b: Bindings, opts: BindingIoOpts = {}): Promise<void> {
  const file = defaultBindingsPath(opts.home);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(b, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, file);
}

export interface BindingPatch {
  cli: string;
  file: string;
  field: string;
  applied: boolean;
  detail?: string;
}

export interface BindingApplyOpts {
  endpointId: string;
  label: string;
  url: string;
  protocol: EndpointProtocol;
  /** Key VALUE to deliver into the CLI's native slot (absent = don't write one). */
  key?: string;
  /** Env-var NAME the endpoint's key lives under (codex env_key / qwen envKey). */
  authEnv?: string;
  model?: string;
  home: string;
}

export interface BindingModelOpts {
  model: string;
  home: string;
}

export interface BindingClearOpts {
  home: string;
  /** authEnv of the endpoint being cleared (so env-map slots can be scrubbed). */
  authEnv?: string;
}

export interface BindingAdapter {
  cli: string;
  /** Protocols this CLI can speak, in preference order. Empty = model-only. */
  protocols: EndpointProtocol[];
  /** Endpoint binding cannot work without a model (qwen: model.name must match the entry id). */
  requiresModel?: boolean;
  /** False when the CLI's native config cannot carry a key (goose: keyring/env only). */
  deliversKey?: boolean;
  apply?(opts: BindingApplyOpts): Promise<BindingPatch[]>;
  applyModel(opts: BindingModelOpts): Promise<BindingPatch[]>;
  /** Restore-to-official: remove every field a binding may have written. */
  clear(opts: BindingClearOpts): Promise<BindingPatch[]>;
}

async function chmod600(file: string): Promise<void> {
  try {
    await fs.chmod(file, 0o600);
  } catch {
    /* best-effort (e.g. Windows) */
  }
}

/* ── dotenv-style line editing (gemini's ~/.gemini/.env) ─────────────── */

function envLineMatches(line: string, name: string): boolean {
  return new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`).test(line);
}

/** Replace or append NAME=value, preserving every other line verbatim. */
export function upsertEnvLine(content: string, name: string, value: string): string {
  const lines = content.length ? content.split('\n') : [];
  const next = `${name}=${value}`;
  let found = false;
  const out = lines.map((l) => {
    if (!found && envLineMatches(l, name)) {
      found = true;
      return next;
    }
    return l;
  });
  if (!found) {
    while (out.length && out[out.length - 1] === '') out.pop();
    out.push(next);
  }
  return out.join('\n') + '\n';
}

/** Drop every NAME=… line, preserving the rest verbatim. */
export function removeEnvLine(content: string, name: string): string {
  const lines = content.split('\n');
  const out = lines.filter((l) => !envLineMatches(l, name));
  const joined = out.join('\n');
  return joined.trim().length === 0 ? '' : joined;
}

async function readFileOr(file: string, fallback: string): Promise<string> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return fallback;
  }
}

/* ── adapters ────────────────────────────────────────────────────────── */

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** claude-code: settings.json env block + top-level model (verified fields). */
const claudeCodeAdapter: BindingAdapter = {
  cli: 'claude-code',
  protocols: ['anthropic'],
  deliversKey: true,
  async apply(o) {
    const file = path.join(o.home, '.claude', 'settings.json');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const ad = new JsonSettingsAdapter({ path: file });
    const current = asObject(await ad.read());
    const env = asObject(current.env);
    env.ANTHROPIC_BASE_URL = o.url;
    const patches: BindingPatch[] = [
      { cli: 'claude-code', file, field: 'env.ANTHROPIC_BASE_URL', applied: true },
    ];
    if (o.key) {
      // Bearer auth — the header third-party anthropic-compatible gateways accept.
      env.ANTHROPIC_AUTH_TOKEN = o.key;
      patches.push({ cli: 'claude-code', file, field: 'env.ANTHROPIC_AUTH_TOKEN', applied: true });
    }
    const next: Record<string, unknown> = { ...current, env };
    if (o.model) {
      next.model = o.model;
      patches.push({ cli: 'claude-code', file, field: 'model', applied: true });
    }
    await ad.write(next);
    if (o.key) await chmod600(file);
    return patches;
  },
  async applyModel(o) {
    const file = path.join(o.home, '.claude', 'settings.json');
    const ad = new JsonSettingsAdapter({ path: file });
    const current = asObject(await ad.read());
    await ad.write({ ...current, model: o.model });
    return [{ cli: 'claude-code', file, field: 'model', applied: true }];
  },
  async clear(o) {
    const file = path.join(o.home, '.claude', 'settings.json');
    const ad = new JsonSettingsAdapter({ path: file });
    const current = asObject(await ad.read());
    const env = asObject(current.env);
    // Dropping the env keys restores OAuth (CC Switch's `{"env":{}}` insight);
    // dropping model restores Claude's own default selection.
    delete env.ANTHROPIC_BASE_URL;
    delete env.ANTHROPIC_AUTH_TOKEN;
    const next: Record<string, unknown> = { ...current, env };
    delete next.model;
    await ad.write(next);
    return [
      { cli: 'claude-code', file, field: 'env.ANTHROPIC_BASE_URL', applied: true, detail: 'removed' },
      { cli: 'claude-code', file, field: 'env.ANTHROPIC_AUTH_TOKEN', applied: true, detail: 'removed' },
      { cli: 'claude-code', file, field: 'model', applied: true, detail: 'removed' },
    ];
  },
};

/** codex: config.toml [model_providers.clihub-<id>] — its native mechanism. */
const codexAdapter: BindingAdapter = {
  cli: 'codex',
  protocols: ['openai'],
  deliversKey: true,
  async apply(o) {
    const file = path.join(o.home, '.codex', 'config.toml');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const ad = new TomlSettingsAdapter({ path: file });
    const current = asObject(await ad.read());
    const providerId = `clihub-${o.endpointId}`;
    const providers = asObject(current.model_providers);
    providers[providerId] = {
      name: o.label,
      base_url: o.url,
      // env_key names the env var codex reads at runtime; the bearer token is
      // the file-delivered carrier (keeps ChatGPT OAuth in auth.json intact).
      ...(o.authEnv ? { env_key: o.authEnv } : {}),
      wire_api: 'chat',
      ...(o.key ? { experimental_bearer_token: o.key } : {}),
    };
    const next: Record<string, unknown> = {
      ...current,
      model_provider: providerId,
      model_providers: providers,
    };
    const patches: BindingPatch[] = [
      { cli: 'codex', file, field: 'model_provider', applied: true },
      { cli: 'codex', file, field: `model_providers.${providerId}`, applied: true },
    ];
    if (o.model) {
      next.model = o.model;
      patches.push({ cli: 'codex', file, field: 'model', applied: true });
    }
    await ad.write(next);
    if (o.key) await chmod600(file);
    return patches;
  },
  async applyModel(o) {
    const file = path.join(o.home, '.codex', 'config.toml');
    const ad = new TomlSettingsAdapter({ path: file });
    const current = asObject(await ad.read());
    await ad.write({ ...current, model: o.model });
    return [{ cli: 'codex', file, field: 'model', applied: true }];
  },
  async clear(o) {
    const file = path.join(o.home, '.codex', 'config.toml');
    const ad = new TomlSettingsAdapter({ path: file });
    const current = asObject(await ad.read());
    const providers = asObject(current.model_providers);
    const removed: string[] = [];
    for (const id of Object.keys(providers)) {
      if (id.startsWith('clihub-')) {
        delete providers[id];
        removed.push(id);
      }
    }
    const next: Record<string, unknown> = { ...current, model_providers: providers };
    delete next.model_provider; // back to codex's built-in default
    delete next.model;
    if (Object.keys(providers).length === 0) delete next.model_providers;
    await ad.write(next);
    return [
      { cli: 'codex', file, field: 'model_provider', applied: true, detail: 'removed' },
      ...removed.map((id) => ({ cli: 'codex', file, field: `model_providers.${id}`, applied: true, detail: 'removed' })),
      { cli: 'codex', file, field: 'model', applied: true, detail: 'removed' },
    ];
  },
};

/**
 * gemini-cli: no settings.json URL field exists — the base URL and key live in
 * ~/.gemini/.env (auto-loaded at startup). Model is settings.json `model.name`
 * (nested v2 schema). Verified at source/docs level 2026-06-10.
 */
const geminiAdapter: BindingAdapter = {
  cli: 'gemini',
  protocols: ['google'],
  deliversKey: true,
  async apply(o) {
    const envFile = path.join(o.home, '.gemini', '.env');
    await fs.mkdir(path.dirname(envFile), { recursive: true });
    let content = await readFileOr(envFile, '');
    content = upsertEnvLine(content, 'GOOGLE_GEMINI_BASE_URL', o.url);
    const patches: BindingPatch[] = [
      { cli: 'gemini', file: envFile, field: 'GOOGLE_GEMINI_BASE_URL', applied: true },
    ];
    if (o.key) {
      content = upsertEnvLine(content, 'GEMINI_API_KEY', o.key);
      patches.push({ cli: 'gemini', file: envFile, field: 'GEMINI_API_KEY', applied: true });
    }
    await fs.writeFile(envFile, content, 'utf8');
    if (o.key) await chmod600(envFile);
    if (o.model) patches.push(...(await geminiAdapter.applyModel({ model: o.model, home: o.home })));
    return patches;
  },
  async applyModel(o) {
    const file = path.join(o.home, '.gemini', 'settings.json');
    const ad = new JsonSettingsAdapter({ path: file });
    const current = asObject(await ad.read());
    const model = asObject(current.model);
    model.name = o.model;
    await ad.write({ ...current, model });
    return [{ cli: 'gemini', file, field: 'model.name', applied: true }];
  },
  async clear(o) {
    const envFile = path.join(o.home, '.gemini', '.env');
    const content = await readFileOr(envFile, '');
    if (content) {
      let next = removeEnvLine(content, 'GOOGLE_GEMINI_BASE_URL');
      next = removeEnvLine(next, 'GEMINI_API_KEY');
      await fs.writeFile(envFile, next, 'utf8');
    }
    const file = path.join(o.home, '.gemini', 'settings.json');
    const ad = new JsonSettingsAdapter({ path: file });
    const current = asObject(await ad.read());
    const model = asObject(current.model);
    delete model.name;
    const next: Record<string, unknown> = { ...current, model };
    if (Object.keys(model).length === 0) delete next.model;
    await ad.write(next);
    return [
      { cli: 'gemini', file: envFile, field: 'GOOGLE_GEMINI_BASE_URL', applied: true, detail: 'removed' },
      { cli: 'gemini', file: envFile, field: 'GEMINI_API_KEY', applied: true, detail: 'removed' },
      { cli: 'gemini', file, field: 'model.name', applied: true, detail: 'removed' },
    ];
  },
};

/** qwen protocol → settings.json authType key (AUTH_ENV_MAPPINGS, verified). */
const QWEN_AUTH_TYPE: Record<EndpointProtocol, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'gemini',
};

/**
 * qwen-code: settings.json modelProviders entries ARE models (unique by
 * id+baseUrl) and `model.name` must match an entry id — so an endpoint binding
 * requires a model. Our entries carry name "clihub:<endpoint>" as the marker
 * `clear` removes. The key goes in the settings.json `env` map — qwen's
 * documented plain-text slot (lowest precedence; shell/.env override it).
 */
const qwenAdapter: BindingAdapter = {
  cli: 'qwen',
  protocols: ['openai', 'anthropic'],
  requiresModel: true,
  deliversKey: true,
  async apply(o) {
    const file = path.join(o.home, '.qwen', 'settings.json');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const ad = new JsonSettingsAdapter({ path: file });
    const current = asObject(await ad.read());
    const authType = QWEN_AUTH_TYPE[o.protocol];
    const marker = `clihub:${o.endpointId}`;
    const providers = asObject(current.modelProviders);
    const list = Array.isArray(providers[authType]) ? (providers[authType] as Record<string, unknown>[]) : [];
    const entry: Record<string, unknown> = {
      id: o.model,
      name: marker,
      baseUrl: o.url,
      ...(o.authEnv ? { envKey: o.authEnv } : {}),
    };
    providers[authType] = [
      ...list.filter((e) => !(typeof e.name === 'string' && e.name.startsWith('clihub:'))),
      entry,
    ];
    const security = asObject(current.security);
    const auth = asObject(security.auth);
    auth.selectedType = authType;
    const model = asObject(current.model);
    model.name = o.model;
    const next: Record<string, unknown> = {
      ...current,
      modelProviders: providers,
      security: { ...security, auth },
      model,
    };
    const patches: BindingPatch[] = [
      { cli: 'qwen', file, field: `modelProviders.${authType}[${marker}]`, applied: true },
      { cli: 'qwen', file, field: 'security.auth.selectedType', applied: true },
      { cli: 'qwen', file, field: 'model.name', applied: true },
    ];
    if (o.key && o.authEnv) {
      const env = asObject(current.env);
      env[o.authEnv] = o.key;
      next.env = env;
      patches.push({ cli: 'qwen', file, field: `env.${o.authEnv}`, applied: true });
    }
    await ad.write(next);
    if (o.key) await chmod600(file);
    return patches;
  },
  async applyModel(o) {
    const file = path.join(o.home, '.qwen', 'settings.json');
    const ad = new JsonSettingsAdapter({ path: file });
    const current = asObject(await ad.read());
    const model = asObject(current.model);
    model.name = o.model;
    await ad.write({ ...current, model });
    return [{ cli: 'qwen', file, field: 'model.name', applied: true }];
  },
  async clear(o) {
    const file = path.join(o.home, '.qwen', 'settings.json');
    const ad = new JsonSettingsAdapter({ path: file });
    const current = asObject(await ad.read());
    const providers = asObject(current.modelProviders);
    const removedIds = new Set<string>();
    for (const [authType, v] of Object.entries(providers)) {
      if (!Array.isArray(v)) continue;
      const kept = (v as Record<string, unknown>[]).filter((e) => {
        const ours = typeof e.name === 'string' && e.name.startsWith('clihub:');
        if (ours && typeof e.id === 'string') removedIds.add(e.id);
        return !ours;
      });
      if (kept.length > 0) providers[authType] = kept;
      else delete providers[authType];
    }
    const next: Record<string, unknown> = { ...current, modelProviders: providers };
    if (Object.keys(providers).length === 0) delete next.modelProviders;
    // Only un-point model.name when it referenced an entry we removed.
    const model = asObject(current.model);
    if (typeof model.name === 'string' && removedIds.has(model.name)) {
      delete model.name;
      next.model = model;
      if (Object.keys(model).length === 0) delete next.model;
    }
    if (o.authEnv) {
      const env = asObject(current.env);
      delete env[o.authEnv];
      next.env = env;
      if (Object.keys(env).length === 0) delete next.env;
    }
    await ad.write(next);
    return [{ cli: 'qwen', file, field: 'modelProviders[clihub:*]', applied: true, detail: 'removed' }];
  },
};

/** goose protocol → built-in provider name + its host config key (source-verified). */
const GOOSE_PROVIDER_FOR: Partial<Record<EndpointProtocol, { provider: string; hostKey: string; keyEnv: string }>> = {
  anthropic: { provider: 'anthropic', hostKey: 'ANTHROPIC_HOST', keyEnv: 'ANTHROPIC_API_KEY' },
  openai: { provider: 'openai', hostKey: 'OPENAI_HOST', keyEnv: 'OPENAI_API_KEY' },
};

/**
 * goose: config.yaml GOOSE_PROVIDER/GOOSE_MODEL + ANTHROPIC_HOST/OPENAI_HOST
 * (bare host — verified in goose source: get_param("ANTHROPIC_HOST") feeds
 * ApiClient::new(host) which appends paths itself). Keys live ONLY in goose's
 * keyring or the provider's fixed env name; config.yaml never stores keys, so
 * deliversKey=false and the patch tells the user the exact env var to export.
 */
const gooseAdapter: BindingAdapter = {
  cli: 'goose',
  protocols: ['anthropic', 'openai'],
  deliversKey: false,
  async apply(o) {
    const target = GOOSE_PROVIDER_FOR[o.protocol];
    if (!target) throw new Error(`goose has no built-in provider for protocol "${o.protocol}"`);
    const file = path.join(o.home, '.config', 'goose', 'config.yaml');
    const ad = new YamlSettingsAdapter({ path: file });
    const current = asObject(await ad.read());
    const next: Record<string, unknown> = {
      ...current,
      GOOSE_PROVIDER: target.provider,
      [target.hostKey]: o.url,
    };
    const patches: BindingPatch[] = [
      { cli: 'goose', file, field: 'GOOSE_PROVIDER', applied: true },
      { cli: 'goose', file, field: target.hostKey, applied: true },
    ];
    if (o.model) {
      next.GOOSE_MODEL = o.model;
      patches.push({ cli: 'goose', file, field: 'GOOSE_MODEL', applied: true });
    }
    await ad.write(next);
    patches.push({
      cli: 'goose',
      file,
      field: 'key',
      applied: false,
      detail: `goose reads ${target.keyEnv} from its keyring/env — export ${target.keyEnv}${o.authEnv ? ` (your ${o.authEnv} value)` : ''} or run \`goose configure\``,
    });
    return patches;
  },
  async applyModel(o) {
    const file = path.join(o.home, '.config', 'goose', 'config.yaml');
    const ad = new YamlSettingsAdapter({ path: file });
    const current = asObject(await ad.read());
    await ad.write({ ...current, GOOSE_MODEL: o.model });
    return [{ cli: 'goose', file, field: 'GOOSE_MODEL', applied: true }];
  },
  async clear(o) {
    const file = path.join(o.home, '.config', 'goose', 'config.yaml');
    const ad = new YamlSettingsAdapter({ path: file });
    const current = asObject(await ad.read());
    const next = { ...current };
    for (const k of ['GOOSE_PROVIDER', 'GOOSE_MODEL', 'ANTHROPIC_HOST', 'OPENAI_HOST']) delete next[k];
    await ad.write(next);
    return [{ cli: 'goose', file, field: 'GOOSE_PROVIDER/GOOSE_MODEL/*_HOST', applied: true, detail: 'removed' }];
  },
};

/** kiro-cli: model-only (AWS proprietary protocol). Flat dotted key, verified live. */
const kiroAdapter: BindingAdapter = {
  cli: 'kiro',
  protocols: [],
  async applyModel(o) {
    const file = path.join(o.home, '.kiro', 'settings', 'cli.json');
    const ad = new JsonSettingsAdapter({ path: file });
    const current = asObject(await ad.read());
    await ad.write({ ...current, 'chat.defaultModel': o.model });
    return [{ cli: 'kiro', file, field: 'chat.defaultModel', applied: true }];
  },
  async clear(o) {
    const file = path.join(o.home, '.kiro', 'settings', 'cli.json');
    const ad = new JsonSettingsAdapter({ path: file });
    const current = asObject(await ad.read());
    const next = { ...current };
    delete next['chat.defaultModel'];
    await ad.write(next);
    return [{ cli: 'kiro', file, field: 'chat.defaultModel', applied: true, detail: 'removed (service default)' }];
  },
};

/** cursor-cli: model-only (own backend). model object + hasChangedDefaultModel, verified live. */
const cursorAdapter: BindingAdapter = {
  cli: 'cursor',
  protocols: [],
  async applyModel(o) {
    const file = path.join(o.home, '.cursor', 'cli-config.json');
    const ad = new JsonSettingsAdapter({ path: file });
    const current = asObject(await ad.read());
    const model = asObject(current.model);
    await ad.write({
      ...current,
      model: {
        ...model,
        modelId: o.model,
        displayModelId: o.model,
        displayName: o.model,
        displayNameShort: o.model,
      },
      hasChangedDefaultModel: true,
    });
    return [
      { cli: 'cursor', file, field: 'model.modelId', applied: true },
      { cli: 'cursor', file, field: 'hasChangedDefaultModel', applied: true },
    ];
  },
  async clear(o) {
    const file = path.join(o.home, '.cursor', 'cli-config.json');
    const ad = new JsonSettingsAdapter({ path: file });
    const current = asObject(await ad.read());
    const next: Record<string, unknown> = { ...current, hasChangedDefaultModel: false };
    delete next.model; // cursor re-resolves its default from the server
    await ad.write(next);
    return [{ cli: 'cursor', file, field: 'model', applied: true, detail: 'removed (server default)' }];
  },
};

export const BINDING_ADAPTERS: Record<string, BindingAdapter> = {
  'claude-code': claudeCodeAdapter,
  codex: codexAdapter,
  gemini: geminiAdapter,
  qwen: qwenAdapter,
  goose: gooseAdapter,
  kiro: kiroAdapter,
  cursor: cursorAdapter,
};

export interface UseBindingOpts {
  /** Bind one CLI only; default = every adapter whose protocol the endpoint serves. */
  cli?: string;
  model?: string;
  home?: string;
  loader?: CatalogLoader;
  /** Resolve the key VALUE for an authEnv NAME (default wiring: clihub keychain). */
  keyLookup?: (authEnv: string) => Promise<string | undefined>;
  /** Permit binding without a key present (explicit opt-in; default throws). */
  allowMissingKey?: boolean;
}

export interface UseBindingTarget {
  cli: string;
  protocol: EndpointProtocol;
  patches: BindingPatch[];
  keyDelivered: boolean;
}

export interface UseBindingResult {
  preset: EndpointPreset;
  targets: UseBindingTarget[];
  bindings: Bindings;
}

/**
 * Bind an endpoint (and optional default model) to one or all capable CLIs.
 * Pre-flights the key BEFORE writing anything: a missing key throws unless
 * `allowMissingKey` — a binding must never silently point a CLI at an
 * endpoint it cannot authenticate against. When no model is given, the
 * preset's first catalog model is used (a bound CLI keeping its old model
 * name against a new endpoint would break at the first request).
 */
export async function useBinding(endpointId: string, opts: UseBindingOpts = {}): Promise<UseBindingResult> {
  const preset = await findEndpoint(endpointId, opts.loader);
  if (!preset) throw new Error(`unknown endpoint preset "${endpointId}" (run \`clihub endpoint\` to list)`);
  const urls = endpointUrls(preset);
  const home = opts.home ?? os.homedir();
  const model = opts.model ?? preset.models?.[0];

  let adapters: BindingAdapter[];
  if (opts.cli) {
    const one = BINDING_ADAPTERS[opts.cli];
    if (!one) {
      throw new Error(
        `no binding adapter for "${opts.cli}" (available: ${Object.keys(BINDING_ADAPTERS).join(', ')})`,
      );
    }
    if (one.protocols.length === 0) {
      throw new Error(
        `${opts.cli} cannot switch endpoints (proprietary backend, model-only) — use \`clihub model ${opts.cli} <model>\``,
      );
    }
    adapters = [one];
  } else {
    adapters = Object.values(BINDING_ADAPTERS).filter((a) => a.protocols.some((p) => urls[p]));
    if (adapters.length === 0) throw new Error(`endpoint "${endpointId}" serves no protocol any adapter speaks`);
  }

  // Resolve protocol + model + key per target BEFORE any write.
  const plans: Array<{ adapter: BindingAdapter; protocol: EndpointProtocol; url: string }> = [];
  for (const adapter of adapters) {
    const protocol = adapter.protocols.find((p) => urls[p]);
    if (!protocol) {
      throw new Error(
        `endpoint "${endpointId}" has no ${adapter.protocols.join('/')} URL for ${adapter.cli}`,
      );
    }
    if (adapter.requiresModel && !model) {
      // Explicit --for: fail loud. Auto fan-out: skip this CLI rather than
      // blocking every other binding on a preset that lists no models.
      if (opts.cli) {
        throw new Error(
          `${adapter.cli} needs a model for an endpoint binding (its model.name must match the provider entry) — pass --model <m>`,
        );
      }
      continue;
    }
    plans.push({ adapter, protocol, url: urls[protocol] as string });
  }
  if (plans.length === 0) throw new Error(`endpoint "${endpointId}" has no bindable target`);

  let key: string | undefined;
  if (preset.authEnv) {
    key = opts.keyLookup ? await opts.keyLookup(preset.authEnv) : undefined;
    if (!key && !opts.allowMissingKey) {
      throw new Error(
        `no key for ${preset.authEnv} — set it with \`clihub auth set ${preset.authEnv}\` or pass --skip-key`,
      );
    }
  }

  const targets: UseBindingTarget[] = [];
  for (const plan of plans) {
    const patches = await plan.adapter.apply!({
      endpointId: preset.id,
      label: preset.label,
      url: plan.url,
      protocol: plan.protocol,
      key,
      authEnv: preset.authEnv,
      model,
      home,
    });
    targets.push({
      cli: plan.adapter.cli,
      protocol: plan.protocol,
      patches,
      keyDelivered: Boolean(key) && plan.adapter.deliversKey === true,
    });
  }

  const bindings = await readBindings({ home });
  for (const t of targets) {
    bindings[t.cli] = { endpoint: preset.id, ...(model ? { model } : {}) };
  }
  await writeBindings(bindings, { home });

  return { preset, targets, bindings };
}

export interface SetModelResult {
  cli: string;
  model: string;
  patches: BindingPatch[];
  bindings: Bindings;
}

/**
 * Set ONLY the default model of one CLI — the kiro/cursor path (their
 * endpoints are proprietary), and a light-touch tweak for everyone else.
 */
export async function setModelBinding(
  cliId: string,
  model: string,
  opts: BindingIoOpts = {},
): Promise<SetModelResult> {
  const adapter = BINDING_ADAPTERS[cliId];
  if (!adapter) {
    throw new Error(`no binding adapter for "${cliId}" (available: ${Object.keys(BINDING_ADAPTERS).join(', ')})`);
  }
  const home = opts.home ?? os.homedir();
  const patches = await adapter.applyModel({ model, home });
  const bindings = await readBindings({ home });
  bindings[cliId] = { ...bindings[cliId], model };
  await writeBindings(bindings, { home });
  return { cli: cliId, model, patches, bindings };
}

export interface ClearBindingResult {
  targets: Array<{ cli: string; patches: BindingPatch[] }>;
  bindings: Bindings;
}

export interface ClearBindingOpts extends BindingIoOpts {
  loader?: CatalogLoader;
}

/**
 * Restore one CLI (or every bound CLI) to its official defaults: each adapter
 * removes the fields a binding may have written (claude-code: dropping the env
 * keys resumes OAuth). Works even when bindings.json has no entry — useful for
 * scrubbing a half-state by hand.
 */
export async function clearBinding(
  cliId?: string,
  opts: ClearBindingOpts = {},
): Promise<ClearBindingResult> {
  const home = opts.home ?? os.homedir();
  const bindings = await readBindings({ home });
  const ids = cliId ? [cliId] : Object.keys(bindings);
  if (cliId && !BINDING_ADAPTERS[cliId]) {
    throw new Error(`no binding adapter for "${cliId}" (available: ${Object.keys(BINDING_ADAPTERS).join(', ')})`);
  }
  const targets: ClearBindingResult['targets'] = [];
  for (const id of ids) {
    const adapter = BINDING_ADAPTERS[id];
    if (!adapter) {
      targets.push({ cli: id, patches: [{ cli: id, file: '', field: '*', applied: false, detail: 'no adapter' }] });
      delete bindings[id];
      continue;
    }
    let authEnv: string | undefined;
    const bound = bindings[id]?.endpoint;
    if (bound) {
      const preset = await findEndpoint(bound, opts.loader).catch(() => undefined);
      authEnv = preset?.authEnv;
    }
    const patches = await adapter.clear({ home, authEnv });
    targets.push({ cli: id, patches });
    delete bindings[id];
  }
  await writeBindings(bindings, { home });
  return { targets, bindings };
}
