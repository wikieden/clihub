/**
 * Per-CLI proxy injection (v1.23.0).
 *
 * The global `clihub proxy` command stores a proxy in clihub's own config
 * (used for catalog sync / proxy test). This module instead writes the
 * proxy into a SINGLE CLI's settings `env`, so that CLI actually uses it:
 *
 *   - setToolProxy(toolId, url)   → write HTTP_PROXY/HTTPS_PROXY[/ALL_PROXY]
 *   - getToolProxy(toolId)        → read it back
 *
 * Works across every provider via its settingsAdapter (JSON or TOML). A
 * socks5 url also sets ALL_PROXY. Pass `undefined` to clear.
 */
import { getProvider } from '../tools/registry.js';

const PROXY_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY'] as const;

/** Merge (or clear) proxy env vars into a settings object. Pure. */
export function applyProxyEnv(settings: Record<string, unknown>, url: string | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = { ...settings };
  const env: Record<string, unknown> = { ...((out.env as Record<string, unknown>) ?? {}) };
  if (url) {
    env.HTTP_PROXY = url;
    env.HTTPS_PROXY = url;
    if (url.toLowerCase().startsWith('socks')) env.ALL_PROXY = url;
    else delete env.ALL_PROXY;
  } else {
    for (const k of PROXY_KEYS) delete env[k];
  }
  if (Object.keys(env).length > 0) out.env = env;
  else delete out.env;
  return out;
}

/** Read the proxy from a settings env object, if any. */
export function readProxyFromEnv(env: Record<string, unknown> | undefined): string | undefined {
  if (!env) return undefined;
  const v = env.HTTPS_PROXY ?? env.HTTP_PROXY ?? env.ALL_PROXY;
  return typeof v === 'string' ? v : undefined;
}

/** True when a CLI's config is YAML — clihub's JSON env-injection can't touch it. */
function isYamlConfig(toolId: string): boolean {
  const p = getProvider(toolId);
  return p ? /\.ya?ml$/i.test(p.settingsAdapter.configPath()) : false;
}

/** Write (or clear with `undefined`) the proxy into a CLI's settings env. */
export async function setToolProxy(toolId: string, url: string | undefined): Promise<void> {
  const provider = getProvider(toolId);
  if (!provider) throw new Error(`unknown tool: ${toolId}`);
  // goose (and any YAML-config CLI) can't take JSON env-injection — writing
  // would emit JSON, and reading its real YAML throws JSON.parse. Refuse with
  // guidance instead of a cryptic crash.
  if (isYamlConfig(toolId)) {
    const where = provider.settingsAdapter.configPath();
    throw new Error(
      `${toolId} stores config as YAML (${where}); clihub can't inject proxy env there. ` +
      `Set it in your shell instead, e.g. export HTTPS_PROXY=${url ?? '<url>'}`,
    );
  }
  const current = (await provider.settingsAdapter.read()) as Record<string, unknown>;
  await provider.settingsAdapter.write(applyProxyEnv(current ?? {}, url));
}

/** Read a CLI's currently-configured proxy (from its settings env). */
export async function getToolProxy(toolId: string): Promise<string | undefined> {
  const provider = getProvider(toolId);
  if (!provider) return undefined;
  if (isYamlConfig(toolId)) return undefined; // YAML config — not JSON-readable here
  try {
    const obj = (await provider.settingsAdapter.read()) as Record<string, unknown>;
    return readProxyFromEnv(obj?.env as Record<string, unknown> | undefined);
  } catch {
    return undefined;
  }
}
