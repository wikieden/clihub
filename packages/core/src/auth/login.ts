/**
 * Unified OAuth login — device grant (v1.5.0, Pillar IX).
 *
 * Implements the OAuth 2.0 Device Authorization Grant (RFC 8628), which is
 * headless/CI-friendly (no browser redirect, no loopback). The flow itself
 * is vendor-neutral code; the per-vendor specifics (endpoints, client id,
 * scope) are DATA the user supplies in `~/.clihub/auth-providers.json`
 * (BYO — the spec's vendor-neutral default). On success the token is
 * written to that CLI's native credential file so the CLI works unchanged.
 *
 *   - readAuthProviders()              → BYO provider configs
 *   - startDeviceLogin(cfg)            → request a device + user code
 *   - pollDeviceToken(cfg, deviceCode) → poll until the user authorizes
 *   - writeNativeCredential(tool, tok) → persist to the CLI's creds file
 *
 * Secrets are never logged. `fetch` is injectable for testing.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CREDENTIAL_SOURCES } from './credentials.js';

export interface AuthProviderConfig {
  /** Tool/provider id (matches the registry + CREDENTIAL_SOURCES). */
  id: string;
  /** RFC 8628 device authorization endpoint. */
  deviceCodeUrl: string;
  /** Token endpoint. */
  tokenUrl: string;
  /** OAuth client id (public; device-flow clients are public). */
  clientId: string;
  /** Space-delimited scopes. */
  scope?: string;
}

export interface AuthProvidersFile {
  version: 1;
  providers: Record<string, Omit<AuthProviderConfig, 'id'>>;
}

export interface AuthIoOpts {
  /** Path override (default ~/.clihub/auth-providers.json). */
  file?: string;
  /** Home dir override (tests). */
  home?: string;
  /** Injected fetch (tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** "now" epoch ms override (tests). */
  now?: number;
}

export function defaultAuthProvidersPath(): string {
  return path.join(os.homedir(), '.clihub', 'auth-providers.json');
}

export async function readAuthProviders(opts: AuthIoOpts = {}): Promise<AuthProviderConfig[]> {
  const file = opts.file ?? defaultAuthProvidersPath();
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as AuthProvidersFile;
    return Object.entries(parsed.providers ?? {}).map(([id, c]) => ({ id, ...c }));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function getAuthProvider(id: string, opts: AuthIoOpts = {}): Promise<AuthProviderConfig | undefined> {
  return (await readAuthProviders(opts)).find((p) => p.id === id);
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

function form(body: Record<string, string>): string {
  return new URLSearchParams(body).toString();
}

const FORM_HEADERS = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };

/** Request a device + user code from the provider. */
export async function startDeviceLogin(cfg: AuthProviderConfig, opts: AuthIoOpts = {}): Promise<DeviceCodeResponse> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(cfg.deviceCodeUrl, {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ client_id: cfg.clientId, ...(cfg.scope ? { scope: cfg.scope } : {}) }),
  });
  if (!res.ok) throw new Error(`device authorization failed: HTTP ${res.status}`);
  const json = (await res.json()) as Partial<DeviceCodeResponse>;
  if (!json.device_code || !json.user_code || !json.verification_uri) {
    throw new Error('device authorization response missing required fields');
  }
  return { interval: 5, expires_in: 600, ...json } as DeviceCodeResponse;
}

export interface TokenResult {
  access_token: string;
  refresh_token?: string;
  /** Absolute expiry (epoch ms), if the provider returned expires_in. */
  expires_at?: number;
  token_type?: string;
  scope?: string;
}

const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll the token endpoint until the user authorizes (or the code expires).
 * Honours RFC 8628 `authorization_pending` / `slow_down` / `expired_token`.
 */
export async function pollDeviceToken(
  cfg: AuthProviderConfig,
  device: DeviceCodeResponse,
  opts: AuthIoOpts = {},
): Promise<TokenResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const now = () => opts.now ?? Date.now();
  const start = now();
  let intervalMs = (device.interval || 5) * 1000;
  const deadline = start + (device.expires_in || 600) * 1000;

  for (;;) {
    if (now() >= deadline) throw new Error('device code expired before authorization');
    await sleep(intervalMs);
    const res = await doFetch(cfg.tokenUrl, {
      method: 'POST',
      headers: FORM_HEADERS,
      body: form({ grant_type: DEVICE_GRANT, device_code: device.device_code, client_id: cfg.clientId }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && typeof json.access_token === 'string') {
      const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : undefined;
      return {
        access_token: json.access_token,
        refresh_token: typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
        expires_at: expiresIn ? now() + expiresIn * 1000 : undefined,
        token_type: typeof json.token_type === 'string' ? json.token_type : undefined,
        scope: typeof json.scope === 'string' ? json.scope : undefined,
      };
    }
    const error = typeof json.error === 'string' ? json.error : `HTTP ${res.status}`;
    if (error === 'authorization_pending') continue;
    if (error === 'slow_down') { intervalMs += 5000; continue; }
    throw new Error(`authorization failed: ${error}`);
  }
}

/** Exchange a refresh_token for a fresh access token (RFC 6749 §6). */
export async function refreshToken(
  cfg: AuthProviderConfig,
  refreshTokenValue: string,
  opts: AuthIoOpts = {},
): Promise<TokenResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now();
  const res = await doFetch(cfg.tokenUrl, {
    method: 'POST',
    headers: FORM_HEADERS,
    body: form({ grant_type: 'refresh_token', refresh_token: refreshTokenValue, client_id: cfg.clientId }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== 'string') {
    const error = typeof json.error === 'string' ? json.error : `HTTP ${res.status}`;
    throw new Error(`token refresh failed: ${error}`);
  }
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : undefined;
  return {
    access_token: json.access_token,
    // providers may rotate refresh tokens; keep the old one if none returned
    refresh_token: typeof json.refresh_token === 'string' ? json.refresh_token : refreshTokenValue,
    expires_at: expiresIn ? now + expiresIn * 1000 : undefined,
    token_type: typeof json.token_type === 'string' ? json.token_type : undefined,
    scope: typeof json.scope === 'string' ? json.scope : undefined,
  };
}

/** Read the stored refresh_token from a CLI's native credential file. */
export async function readNativeRefreshToken(tool: string, opts: AuthIoOpts = {}): Promise<string | undefined> {
  const home = opts.home ?? os.homedir();
  const file = credentialPath(tool, home);
  if (!file) return undefined;
  try {
    const raw = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
    return typeof raw.refresh_token === 'string' ? raw.refresh_token : undefined;
  } catch {
    return undefined;
  }
}

function credentialPath(tool: string, home: string): string | undefined {
  const source = CREDENTIAL_SOURCES.find((s) => s.tool === tool);
  if (!source) return undefined;
  return path.join(home, ...source.paths[0]!.split('/'));
}

/** Persist a token to the CLI's native credential file (atomic, 0600). */
export async function writeNativeCredential(tool: string, token: TokenResult, opts: AuthIoOpts = {}): Promise<string> {
  const home = opts.home ?? os.homedir();
  const file = credentialPath(tool, home);
  if (!file) throw new Error(`no known credential file for "${tool}"`);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const payload = {
    access_token: token.access_token,
    ...(token.refresh_token ? { refresh_token: token.refresh_token } : {}),
    ...(token.expires_at ? { expires_at: token.expires_at } : {}),
    ...(token.token_type ? { token_type: token.token_type } : {}),
  };
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tmp, file);
  return file;
}
