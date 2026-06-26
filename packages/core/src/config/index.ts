/**
 * clihub global config at `~/.clihub/config.json` (overridable).
 *
 * Schema documented in `docs/18-CONFIG-PROXY-PROFILE.md` §2. This module
 * owns:
 *   - load / save / unset of `~/.clihub/config.json`
 *   - proxy resolution order (flag > config > env)
 *   - env-vector materialisation for child processes that need to
 *     inherit clihub's proxy / CA decisions
 *
 * Pillar IX (Config). No I/O happens until you call `loadConfig()` /
 * `saveConfig()`; `resolveProxy` is pure.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface ClihubConfig {
  /** Schema version. Always 1 for now. */
  version: 1;
  /** Locale override; falls back to env detection. */
  language?: string;
  /** Default profile name when `clihub.yaml` has none. */
  defaultProfile?: string;
  /** Proxy + NO_PROXY config. */
  proxy?: {
    http?: string;
    https?: string;
    /** If set, used for both http and https unless they're set explicitly. */
    all?: string;
    /** Comma-separated host / host-suffix list. */
    noProxy?: string;
    /** Which surfaces inherit this proxy. */
    applyTo?: string[];
  };
  /** Custom CA bundle path injected into NODE_EXTRA_CA_CERTS / GIT_SSL_CAINFO. */
  caBundle?: string;
  /** Remembered "Launch with proxy" url for the desktop GUI launcher. */
  guiLaunchProxy?: string;
  /** Anonymous usage telemetry — never on by default. */
  telemetry?: boolean;
  /** Override DEFAULT_CATALOG_URL. */
  catalogMirror?: string;
}

const DEFAULT_PATH = path.join(os.homedir(), '.clihub', 'config.json');

export function defaultConfigPath(): string {
  return DEFAULT_PATH;
}

const EMPTY: ClihubConfig = { version: 1 };

export interface ConfigIoOpts {
  /** Path override; defaults to `~/.clihub/config.json`. */
  path?: string;
}

/**
 * Load `~/.clihub/config.json`. Returns an empty `version: 1` config
 * when the file is missing or unreadable.
 */
export async function loadConfig(opts: ConfigIoOpts = {}): Promise<ClihubConfig> {
  const filePath = opts.path ?? DEFAULT_PATH;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ...EMPTY };
    }
    const obj = parsed as Partial<ClihubConfig>;
    return { ...obj, version: 1 };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY };
    throw err;
  }
}

/** Persist clihub config atomically (write to .tmp then rename). */
export async function saveConfig(cfg: ClihubConfig, opts: ConfigIoOpts = {}): Promise<void> {
  const filePath = opts.path ?? DEFAULT_PATH;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, filePath);
}

/**
 * Set a dotted key (e.g. `proxy.http`) to the given value. `value`
 * `undefined` removes the leaf. Returns the new config (also saved).
 */
export async function setConfigKey(
  key: string,
  value: string | string[] | boolean | undefined,
  opts: ConfigIoOpts = {},
): Promise<ClihubConfig> {
  const cfg = await loadConfig(opts);
  const parts = key.split('.');
  let node = cfg as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (typeof node[part] !== 'object' || node[part] === null) {
      node[part] = {};
    }
    node = node[part] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1]!;
  if (value === undefined) {
    delete node[leaf];
  } else {
    node[leaf] = value;
  }
  await saveConfig(cfg, opts);
  return cfg;
}

/**
 * Read a dotted key. Returns `undefined` if anywhere in the path is
 * missing or non-object.
 */
export function getConfigKey(cfg: ClihubConfig, key: string): unknown {
  const parts = key.split('.');
  let node: unknown = cfg;
  for (const part of parts) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/**
 * Resolve the effective proxy for an outbound URL.
 *
 * Order (highest first):
 *   1. `cfg.proxy.all` (any scheme)
 *   2. `cfg.proxy.https` for https://, `cfg.proxy.http` for http://
 *   3. `process.env.ALL_PROXY`
 *   4. `process.env.HTTPS_PROXY` for https://, `process.env.HTTP_PROXY` for http://
 *
 * `NO_PROXY` (env or `cfg.proxy.noProxy`) wins everything.
 */
export function resolveProxy(
  url: string,
  cfg: ClihubConfig | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const noProxy = (cfg?.proxy?.noProxy ?? env.NO_PROXY ?? env.no_proxy ?? '').trim();
  if (noProxy && hostMatchesNoProxy(extractHost(url), noProxy)) return undefined;

  const isHttps = url.toLowerCase().startsWith('https://');

  if (cfg?.proxy?.all) return cfg.proxy.all;
  if (isHttps && cfg?.proxy?.https) return cfg.proxy.https;
  if (!isHttps && cfg?.proxy?.http) return cfg.proxy.http;

  const envAll = env.ALL_PROXY ?? env.all_proxy;
  if (envAll) return envAll;
  if (isHttps) return env.HTTPS_PROXY ?? env.https_proxy;
  return env.HTTP_PROXY ?? env.http_proxy;
}

/**
 * Compute the env vector to export when launching a child process
 * (e.g. an installed CLI). Mirrors the proxy + CA decisions from
 * `cfg` so vendors that respect `HTTPS_PROXY` / `NODE_EXTRA_CA_CERTS`
 * inherit clihub's settings without explicit per-vendor patches.
 */
export function proxyEnvVector(cfg: ClihubConfig): Record<string, string> {
  const env: Record<string, string> = {};
  const httpsProxy = cfg.proxy?.https ?? cfg.proxy?.all;
  const httpProxy = cfg.proxy?.http ?? cfg.proxy?.all;
  if (httpsProxy) env.HTTPS_PROXY = httpsProxy;
  if (httpProxy) env.HTTP_PROXY = httpProxy;
  if (cfg.proxy?.all) env.ALL_PROXY = cfg.proxy.all;
  if (cfg.proxy?.noProxy) env.NO_PROXY = cfg.proxy.noProxy;
  if (cfg.caBundle) {
    env.NODE_EXTRA_CA_CERTS = cfg.caBundle;
    env.GIT_SSL_CAINFO = cfg.caBundle;
    env.CURL_CA_BUNDLE = cfg.caBundle;
  }
  return env;
}

function extractHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function hostMatchesNoProxy(host: string, noProxy: string): boolean {
  if (!host) return false;
  return noProxy
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => {
      if (rule === '*') return true;
      if (rule.startsWith('.')) return host.toLowerCase().endsWith(rule);
      if (rule.startsWith('*.')) return host.toLowerCase().endsWith(rule.slice(1));
      return host.toLowerCase() === rule;
    });
}
