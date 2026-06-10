/**
 * Per-CLI provider binding — `clihub use` (docs/25-PROVIDER-BINDING.md).
 *
 * Each CLI holds its own (endpoint, default model) binding; the switching unit
 * is "claude-code uses DeepSeek's deepseek-chat", never a protocol-family
 * broadcast. Writes use each CLI's NATIVE idiom (researched 2026-06-10):
 *   claude-code → settings.json env.ANTHROPIC_BASE_URL / env.ANTHROPIC_AUTH_TOKEN
 *                 (Bearer — what third-party gateways accept) + top-level model
 *   codex       → config.toml model_provider/model + [model_providers.clihub-<id>]
 *                 (its first-class multi-provider mechanism)
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
import { findEndpoint, endpointUrls } from '../endpoint/index.js';
import type { CatalogLoader } from '../catalog/index.js';
import type { EndpointPreset, EndpointProtocol } from '../types.js';

export interface CliBinding {
  endpoint: string;
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
  /** Key VALUE to deliver into the CLI's native slot (absent = don't write one). */
  key?: string;
  /** Env-var NAME the endpoint's key lives under (codex env_key). */
  authEnv?: string;
  model?: string;
  home: string;
}

export interface BindingAdapter {
  cli: string;
  /** Protocols this CLI can speak, in preference order. Empty = model-only. */
  protocols: EndpointProtocol[];
  apply(opts: BindingApplyOpts): Promise<BindingPatch[]>;
}

async function chmod600(file: string): Promise<void> {
  try {
    await fs.chmod(file, 0o600);
  } catch {
    /* best-effort (e.g. Windows) */
  }
}

/** claude-code: settings.json env block + top-level model (verified fields). */
const claudeCodeAdapter: BindingAdapter = {
  cli: 'claude-code',
  protocols: ['anthropic'],
  async apply(o) {
    const file = path.join(o.home, '.claude', 'settings.json');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const ad = new JsonSettingsAdapter({ path: file });
    const current = ((await ad.read()) as Record<string, unknown>) ?? {};
    const env =
      current.env && typeof current.env === 'object' && !Array.isArray(current.env)
        ? (current.env as Record<string, unknown>)
        : {};
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
};

/** codex: config.toml [model_providers.clihub-<id>] — its native mechanism. */
const codexAdapter: BindingAdapter = {
  cli: 'codex',
  protocols: ['openai'],
  async apply(o) {
    const file = path.join(o.home, '.codex', 'config.toml');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const ad = new TomlSettingsAdapter({ path: file });
    const current = ((await ad.read()) as Record<string, unknown>) ?? {};
    const providerId = `clihub-${o.endpointId}`;
    const providers =
      current.model_providers && typeof current.model_providers === 'object'
        ? (current.model_providers as Record<string, unknown>)
        : {};
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
};

/** v1.62a ships claude-code + codex; gemini/qwen/goose + model-only kiro/cursor land in v1.62b. */
export const BINDING_ADAPTERS: Record<string, BindingAdapter> = {
  'claude-code': claudeCodeAdapter,
  codex: codexAdapter,
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
 * endpoint it cannot authenticate against.
 */
export async function useBinding(endpointId: string, opts: UseBindingOpts = {}): Promise<UseBindingResult> {
  const preset = await findEndpoint(endpointId, opts.loader);
  if (!preset) throw new Error(`unknown endpoint preset "${endpointId}" (run \`clihub endpoint\` to list)`);
  const urls = endpointUrls(preset);
  const home = opts.home ?? os.homedir();

  let adapters: BindingAdapter[];
  if (opts.cli) {
    const one = BINDING_ADAPTERS[opts.cli];
    if (!one) {
      throw new Error(
        `no binding adapter for "${opts.cli}" (available: ${Object.keys(BINDING_ADAPTERS).join(', ')})`,
      );
    }
    adapters = [one];
  } else {
    adapters = Object.values(BINDING_ADAPTERS).filter((a) => a.protocols.some((p) => urls[p]));
    if (adapters.length === 0) throw new Error(`endpoint "${endpointId}" serves no protocol any adapter speaks`);
  }

  // Resolve protocol + key per target BEFORE any write.
  const plans: Array<{ adapter: BindingAdapter; protocol: EndpointProtocol; url: string }> = [];
  for (const adapter of adapters) {
    const protocol = adapter.protocols.find((p) => urls[p]);
    if (!protocol) {
      throw new Error(
        `endpoint "${endpointId}" has no ${adapter.protocols.join('/')} URL for ${adapter.cli}`,
      );
    }
    plans.push({ adapter, protocol, url: urls[protocol] as string });
  }

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
    const patches = await plan.adapter.apply({
      endpointId: preset.id,
      label: preset.label,
      url: plan.url,
      key,
      authEnv: preset.authEnv,
      model: opts.model,
      home,
    });
    targets.push({ cli: plan.adapter.cli, protocol: plan.protocol, patches, keyDelivered: Boolean(key) });
  }

  const bindings = await readBindings({ home });
  for (const t of targets) {
    bindings[t.cli] = { endpoint: preset.id, ...(opts.model ? { model: opts.model } : {}) };
  }
  await writeBindings(bindings, { home });

  return { preset, targets, bindings };
}
