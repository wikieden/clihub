/**
 * System / terminal proxy detection (v1.25.0).
 *
 * Reads a proxy the user already has, so the wizard / TUI can pre-fill it
 * instead of making them retype (and mistype) it:
 *
 *   1. Environment variables (the terminal's proxy) — HTTPS_PROXY etc.
 *   2. macOS system proxy via `scutil --proxy`.
 *
 * Read-only. `env` and `exec` are injectable for tests.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export interface SystemProxy {
  /** Best single proxy URL to use (https > all > http). */
  url?: string;
  http?: string;
  https?: string;
  source: 'env' | 'macos' | 'none';
}

export interface DetectProxyOpts {
  env?: Record<string, string | undefined>;
  /** Injected runner for `scutil --proxy` (tests). */
  exec?: () => Promise<string>;
  /** Platform override (tests). Defaults to process.platform. */
  platform?: string;
}

/** Parse `scutil --proxy` output into a proxy URL (pure). */
export function parseScutilProxy(out: string): SystemProxy | undefined {
  const kv: Record<string, string> = {};
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*(\w+)\s*:\s*(.+?)\s*$/);
    if (m) kv[m[1]!] = m[2]!;
  }
  if (kv.HTTPSEnable === '1' && kv.HTTPSProxy) {
    const url = `http://${kv.HTTPSProxy}:${kv.HTTPSPort ?? '0'}`;
    return { url, https: url, source: 'macos' };
  }
  if (kv.HTTPEnable === '1' && kv.HTTPProxy) {
    const url = `http://${kv.HTTPProxy}:${kv.HTTPPort ?? '0'}`;
    return { url, http: url, source: 'macos' };
  }
  if (kv.SOCKSEnable === '1' && kv.SOCKSProxy) {
    return { url: `socks5://${kv.SOCKSProxy}:${kv.SOCKSPort ?? '0'}`, source: 'macos' };
  }
  return undefined;
}

export async function detectSystemProxy(opts: DetectProxyOpts = {}): Promise<SystemProxy> {
  const env = opts.env ?? process.env;
  const https = env.HTTPS_PROXY ?? env.https_proxy;
  const http = env.HTTP_PROXY ?? env.http_proxy;
  const all = env.ALL_PROXY ?? env.all_proxy;
  const fromEnv = https ?? all ?? http;
  if (fromEnv) return { url: fromEnv, http, https, source: 'env' };

  const platform = opts.platform ?? process.platform;
  if (platform === 'darwin') {
    try {
      const out = opts.exec ? await opts.exec() : (await execFileP('scutil', ['--proxy'])).stdout;
      const parsed = parseScutilProxy(out);
      if (parsed) return parsed;
    } catch {
      /* scutil unavailable — fall through */
    }
  }
  return { source: 'none' };
}
