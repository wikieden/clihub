/**
 * Codex quota fetcher.
 *
 * Reuses the OAuth token Codex CLI already stored in `~/.codex/auth.json`
 * (`tokens.access_token` + `tokens.account_id`) and calls ChatGPT's private
 * usage endpoints — the same ones CodexBar uses:
 *   GET https://chatgpt.com/backend-api/wham/usage
 *   GET https://chatgpt.com/backend-api/wham/rate-limit-reset-credits
 * with `Authorization: Bearer <access_token>` and `ChatGPT-Account-Id`.
 *
 * These are undocumented endpoints; treat shape changes as expected and never
 * throw — fall back to an errored snapshot. Tokens are refreshed against
 * https://auth.openai.com/oauth/token when expired.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  type QuotaFetcher,
  type QuotaOptions,
  type QuotaSnapshot,
  type QuotaWindow,
  clampWindow,
  quotaUnavailable,
} from './types.js';
import { httpJson, type HttpInit } from './http.js';

const AUTH_PATH = path.join(os.homedir(), '.codex', 'auth.json');
const BASE = 'https://chatgpt.com/backend-api';
const USAGE_URL = `${BASE}/wham/usage`;
const CREDITS_URL = `${BASE}/wham/rate-limit-reset-credits`;
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
// Public Codex CLI client id (same one the CLI uses for its OAuth flow).
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

interface CodexAuth {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  accountId?: string;
}

interface WindowSnapshot {
  used_percent?: number;
  reset_at?: string;
  limit_window_seconds?: number;
}
interface RateLimitDetails {
  primary_window?: WindowSnapshot;
  secondary_window?: WindowSnapshot;
}
interface AdditionalRateLimit {
  limit_name?: string;
  metered_feature?: string;
  rate_limit?: RateLimitDetails;
}
interface CodexUsageResponse {
  plan_type?: string;
  rate_limit?: RateLimitDetails;
  credits?: { has_credits?: boolean; unlimited?: boolean; balance?: number };
  additional_rate_limits?: AdditionalRateLimit[];
}
interface ResetCreditsResponse {
  credits?: Array<{ expires_at?: string }>;
  available_count?: number;
}

async function readAuth(): Promise<CodexAuth | undefined> {
  try {
    const raw = JSON.parse(await fs.readFile(AUTH_PATH, 'utf8'));
    const t = raw?.tokens ?? {};
    const accessToken = t.access_token ?? t.accessToken;
    if (!accessToken) return undefined;
    return {
      accessToken,
      refreshToken: t.refresh_token ?? t.refreshToken,
      idToken: t.id_token ?? t.idToken,
      accountId: t.account_id ?? t.accountId,
    };
  } catch {
    return undefined;
  }
}

/** Decode a JWT exp claim (seconds) without verifying the signature. */
function jwtExp(token?: string): number | undefined {
  if (!token) return undefined;
  const part = token.split('.')[1];
  if (!part) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return typeof claims.exp === 'number' ? claims.exp : undefined;
  } catch {
    return undefined;
  }
}

/** Plan label from chatgpt_plan_type-style strings: "pro" → "Pro". */
function planLabel(plan?: string): string | undefined {
  if (!plan) return undefined;
  const map: Record<string, string> = {
    free: 'Free',
    plus: 'Plus',
    pro: 'Pro',
    team: 'Team',
    business: 'Business',
    enterprise: 'Enterprise',
    edu: 'Education',
    education: 'Education',
  };
  return map[plan.toLowerCase()] ?? plan;
}

function account(idToken?: string): string | undefined {
  const part = idToken?.split('.')[1];
  if (!part) return undefined;
  try {
    const c = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return c.email ?? c['https://api.openai.com/profile']?.email;
  } catch {
    return undefined;
  }
}

/** Pure mapping of a wham/usage response into ordered quota windows. Exported for tests. */
export function parseCodexWindows(
  usage: CodexUsageResponse,
  now: number,
): QuotaWindow[] {
  const windows: QuotaWindow[] = [];
  const primary = toWindow('session', 'Session', usage.rate_limit?.primary_window, now);
  const secondary = toWindow('weekly', 'Weekly', usage.rate_limit?.secondary_window, now);
  if (primary) windows.push(primary);
  if (secondary) windows.push(secondary);
  for (const extra of usage.additional_rate_limits ?? []) {
    const base = extra.limit_name?.trim() || extra.metered_feature?.trim() || 'Extra';
    const p = toWindow(`${slug(base)}-5h`, `${base} 5-hour`, extra.rate_limit?.primary_window, now);
    const w = toWindow(`${slug(base)}-weekly`, `${base} Weekly`, extra.rate_limit?.secondary_window, now);
    if (p) windows.push(p);
    if (w) windows.push(w);
  }
  return windows;
}

export { planLabel as codexPlanLabel };

function toWindow(
  id: string,
  label: string,
  w: WindowSnapshot | undefined,
  now: number,
): QuotaWindow | undefined {
  if (!w || typeof w.used_percent !== 'number') return undefined;
  const { usedPercent, remainingPercent } = clampWindow(w.used_percent);
  const resetsAt = w.reset_at;
  const resetsInSeconds = resetsAt
    ? Math.max(0, Math.round((Date.parse(resetsAt) - now) / 1000))
    : undefined;
  return {
    id,
    label,
    usedPercent,
    remainingPercent,
    resetsAt,
    resetsInSeconds,
    windowSeconds: w.limit_window_seconds,
  };
}

/** Refresh the access token when within 60s of expiry. Returns a fresh token. */
async function ensureFreshToken(
  auth: CodexAuth,
  init: HttpInit,
): Promise<string> {
  const exp = jwtExp(auth.accessToken);
  const now = Math.floor(Date.now() / 1000);
  if (!auth.refreshToken || (exp && exp - now > 60)) return auth.accessToken;
  try {
    const res = await httpJson<{ access_token?: string; id_token?: string }>(
      TOKEN_URL,
      {
        ...init,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: auth.refreshToken,
          scope: 'openid profile email',
        }),
      },
    );
    return res?.access_token ?? auth.accessToken;
  } catch {
    return auth.accessToken; // stale token may still work briefly
  }
}

export const codexQuotaFetcher: QuotaFetcher = {
  tool: 'codex',
  label: 'Codex',

  async fetch(opts: QuotaOptions): Promise<QuotaSnapshot> {
    const auth = await readAuth();
    if (!auth) {
      return quotaUnavailable(
        'codex',
        'Codex',
        'Not signed in (no ~/.codex/auth.json). Run `codex` to log in.',
      );
    }
    const init: HttpInit = { timeoutMs: opts.timeoutMs ?? 20000, proxy: opts.proxy };
    const token = await ensureFreshToken(auth, init);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'clihub',
      Accept: 'application/json',
    };
    if (auth.accountId) headers['ChatGPT-Account-Id'] = auth.accountId;

    let usage: CodexUsageResponse;
    try {
      usage = await httpJson<CodexUsageResponse>(USAGE_URL, { ...init, headers });
    } catch (err) {
      return quotaUnavailable(
        'codex',
        'Codex',
        `Usage request failed: ${(err as Error).message}`,
        { account: account(auth.idToken) },
      );
    }

    const now = Date.now();
    const windows: QuotaWindow[] = [];
    const primary = toWindow('session', 'Session', usage.rate_limit?.primary_window, now);
    const secondary = toWindow('weekly', 'Weekly', usage.rate_limit?.secondary_window, now);
    if (primary) windows.push(primary);
    if (secondary) windows.push(secondary);

    for (const extra of usage.additional_rate_limits ?? []) {
      const base = extra.limit_name?.trim() || extra.metered_feature?.trim() || 'Extra';
      const p = toWindow(
        `${slug(base)}-5h`,
        `${base} 5-hour`,
        extra.rate_limit?.primary_window,
        now,
      );
      const w = toWindow(
        `${slug(base)}-weekly`,
        `${base} Weekly`,
        extra.rate_limit?.secondary_window,
        now,
      );
      if (p) windows.push(p);
      if (w) windows.push(w);
    }

    // Manual reset credits (best-effort; absence is fine).
    let credits: QuotaSnapshot['credits'];
    try {
      const c = await httpJson<ResetCreditsResponse>(CREDITS_URL, { ...init, headers });
      if (typeof c?.available_count === 'number') {
        const next = (c.credits ?? [])
          .map((x) => (x.expires_at ? Date.parse(x.expires_at) : NaN))
          .filter((n) => !Number.isNaN(n))
          .sort((a, b) => a - b)[0];
        credits = {
          available: c.available_count,
          nextExpiresInSeconds: next
            ? Math.max(0, Math.round((next - now) / 1000))
            : undefined,
        };
      }
    } catch {
      /* reset-credits is optional */
    }

    return {
      tool: 'codex',
      label: 'Codex',
      supported: true,
      account: account(auth.idToken),
      plan: planLabel(usage.plan_type),
      windows,
      credits,
      source: 'codex-oauth',
      updatedAt: new Date().toISOString(),
    };
  },
};

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
