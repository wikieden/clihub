/**
 * Antigravity / Gemini quota fetcher (Google Code Assist).
 *
 * Antigravity (and Gemini CLI before it) authenticate with a Google account and
 * store the OAuth tokens in `~/.gemini/oauth_creds.json`. The rolling per-model
 * quotas come from Google's private Code Assist API — the same calls the CLI
 * and CodexBar make:
 *   POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist   → tier + project
 *   POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota → buckets[]
 * with `Authorization: Bearer <access_token>`. Tokens refresh against
 * https://oauth2.googleapis.com/token using the public Gemini CLI OAuth client.
 *
 * Each bucket carries `{ modelId, remainingFraction, resetTime }`; we keep the
 * lowest fraction per model and render one 24h window per model. Undocumented
 * API — never throw; degrade to an errored snapshot on any shape change.
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

const CREDS_PATH = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
const BASE = 'https://cloudcode-pa.googleapis.com/v1internal';
const LOAD_URL = `${BASE}:loadCodeAssist`;
const QUOTA_URL = `${BASE}:retrieveUserQuota`;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
// Public Gemini CLI OAuth client (shipped in the open-source @google/gemini-cli).
const CLIENT_ID = process.env.GEMINI_OAUTH_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.GEMINI_OAUTH_CLIENT_SECRET ?? '';

interface GeminiCreds {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiryDate?: number; // epoch ms
}

interface QuotaBucket {
  modelId?: string;
  remainingFraction?: number;
  resetTime?: string;
  tokenType?: string;
}

async function readCreds(): Promise<GeminiCreds | undefined> {
  try {
    const raw = JSON.parse(await fs.readFile(CREDS_PATH, 'utf8'));
    const accessToken = raw.access_token ?? raw.accessToken;
    if (!accessToken) return undefined;
    return {
      accessToken,
      refreshToken: raw.refresh_token ?? raw.refreshToken,
      idToken: raw.id_token ?? raw.idToken,
      expiryDate: raw.expiry_date ?? raw.expiryDate,
    };
  } catch {
    return undefined;
  }
}

function emailFromIdToken(idToken?: string): string | undefined {
  const part = idToken?.split('.')[1];
  if (!part) return undefined;
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')).email;
  } catch {
    return undefined;
  }
}

async function ensureFreshToken(creds: GeminiCreds, init: HttpInit): Promise<string> {
  const now = Date.now();
  if (!creds.refreshToken || (creds.expiryDate && creds.expiryDate - now > 60_000)) {
    return creds.accessToken;
  }
  try {
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token',
    }).toString();
    const res = await httpJson<{ access_token?: string }>(TOKEN_URL, {
      ...init,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    return res?.access_token ?? creds.accessToken;
  } catch {
    return creds.accessToken;
  }
}

/** free-tier | standard-tier | legacy-tier → display plan. */
function planFromTier(tier?: string): string | undefined {
  switch (tier) {
    case 'standard-tier':
      return 'Paid';
    case 'free-tier':
      return 'Free';
    case 'legacy-tier':
      return 'Legacy';
    default:
      return tier;
  }
}

/** "gemini-2.5-pro" → "Gemini 2.5 Pro". */
function modelLabel(id: string): string {
  return id
    .split(/[-_]/)
    .map((p) => (/^\d/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

export const antigravityQuotaFetcher: QuotaFetcher = {
  tool: 'antigravity',
  label: 'Antigravity',

  async fetch(opts: QuotaOptions): Promise<QuotaSnapshot> {
    const creds = await readCreds();
    if (!creds) {
      return quotaUnavailable(
        'antigravity',
        'Antigravity',
        'Not signed in (no ~/.gemini/oauth_creds.json). Sign in with `agy`.',
      );
    }
    const init: HttpInit = { timeoutMs: opts.timeoutMs ?? 20000, proxy: opts.proxy };
    const token = await ensureFreshToken(creds, init);
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'clihub',
    };
    const account = emailFromIdToken(creds.idToken);

    // 1) loadCodeAssist → tier + project id
    let tier: string | undefined;
    let project: string | undefined;
    try {
      const load = await httpJson<{
        currentTier?: { id?: string };
        cloudaicompanionProject?: string | { id?: string; projectId?: string };
      }>(LOAD_URL, { ...init, method: 'POST', headers, body: '{"metadata":{"pluginType":"GEMINI"}}' });
      tier = load?.currentTier?.id;
      const p = load?.cloudaicompanionProject;
      project = typeof p === 'string' ? p : p?.id ?? p?.projectId;
    } catch (err) {
      return quotaUnavailable('antigravity', 'Antigravity', `loadCodeAssist failed: ${(err as Error).message}`, {
        account,
      });
    }

    // 2) retrieveUserQuota → buckets[]
    let buckets: QuotaBucket[] = [];
    try {
      const body = project ? JSON.stringify({ project }) : '{}';
      const q = await httpJson<{ buckets?: QuotaBucket[] }>(QUOTA_URL, {
        ...init,
        method: 'POST',
        headers,
        body,
      });
      buckets = q?.buckets ?? [];
    } catch (err) {
      return quotaUnavailable('antigravity', 'Antigravity', `retrieveUserQuota failed: ${(err as Error).message}`, {
        account,
        plan: planFromTier(tier),
      });
    }

    // Keep the lowest remaining fraction per model (the binding constraint).
    const now = Date.now();
    const byModel = new Map<string, QuotaBucket>();
    for (const b of buckets) {
      if (!b.modelId || typeof b.remainingFraction !== 'number') continue;
      const cur = byModel.get(b.modelId);
      if (!cur || b.remainingFraction < (cur.remainingFraction ?? 1)) byModel.set(b.modelId, b);
    }
    const windows: QuotaWindow[] = [...byModel.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([modelId, b]) => {
        const { usedPercent, remainingPercent } = clampWindow(100 - (b.remainingFraction ?? 0) * 100);
        const resetsAt = b.resetTime;
        const resetsInSeconds = resetsAt
          ? Math.max(0, Math.round((Date.parse(resetsAt) - now) / 1000))
          : undefined;
        return {
          id: modelId,
          label: `${modelLabel(modelId)} (24h)`,
          usedPercent,
          remainingPercent,
          resetsAt,
          resetsInSeconds,
          windowSeconds: 86400,
        };
      });

    if (windows.length === 0) {
      return quotaUnavailable('antigravity', 'Antigravity', 'No quota buckets returned.', {
        account,
        plan: planFromTier(tier),
      });
    }

    return {
      tool: 'antigravity',
      label: 'Antigravity',
      supported: true,
      account,
      plan: planFromTier(tier),
      windows,
      source: 'gemini-codeassist',
      updatedAt: new Date().toISOString(),
    };
  },
};
