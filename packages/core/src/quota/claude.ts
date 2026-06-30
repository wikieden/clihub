/**
 * Claude quota fetcher.
 *
 * Primary path (robust): read Claude Code's OAuth token from the login Keychain
 * (`security find-generic-password -s "Claude Code-credentials" -w` → JSON with
 * claudeAiOauth.accessToken) and call Anthropic's usage endpoint, the same as
 * CodexBar's preferred source:
 *   GET https://api.anthropic.com/api/oauth/usage
 *   Authorization: Bearer <token>; anthropic-beta: oauth-2025-04-20
 * Response windows: five_hour / seven_day / seven_day_opus / seven_day_sonnet,
 * each { utilization (percent used), resets_at }.
 *
 * Fallback: spawn `claude /usage` and scrape the TUI panel (needs a TTY).
 */
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

import {
  type QuotaFetcher,
  type QuotaOptions,
  type QuotaSnapshot,
  type QuotaWindow,
  clampWindow,
  quotaUnavailable,
} from './types.js';
import { httpJson, type HttpInit } from './http.js';
import { whichCmd } from '../utils/which.js';

const execFileP = promisify(execFile);
const KEYCHAIN_SERVICE = 'Claude Code-credentials';
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const BETA_HEADER = 'oauth-2025-04-20';

// ── OAuth path ──────────────────────────────────────────────────────────────

interface OAuthWindow {
  utilization?: number;
  resets_at?: string;
}
interface OAuthUsageResponse {
  five_hour?: OAuthWindow;
  seven_day?: OAuthWindow;
  seven_day_opus?: OAuthWindow;
  seven_day_sonnet?: OAuthWindow;
}

async function keychainToken(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileP('security', [
      'find-generic-password',
      '-s',
      KEYCHAIN_SERVICE,
      '-w',
    ]);
    const raw = stdout.trim();
    if (!raw) return undefined;
    // The password is JSON: { "claudeAiOauth": { "accessToken": "…" } }
    const json = JSON.parse(raw);
    return json?.claudeAiOauth?.accessToken ?? json?.accessToken;
  } catch {
    return undefined;
  }
}

/** utilization may arrive as 0–100 (percent) or 0–1 (fraction); normalize. */
function toUsedPercent(util: number | undefined): number | undefined {
  if (typeof util !== 'number') return undefined;
  return util <= 1 ? util * 100 : util;
}

/** Pure mapping of an /api/oauth/usage response into windows. Exported for tests. */
export function parseClaudeOAuthWindows(
  res: OAuthUsageResponse,
  now: number,
): QuotaWindow[] {
  return [
    oauthWindow('session', 'Session', res.five_hour, now),
    oauthWindow('weekly', 'Weekly', res.seven_day, now),
    oauthWindow('opus', 'Opus weekly', res.seven_day_opus, now),
    oauthWindow('sonnet', 'Sonnet weekly', res.seven_day_sonnet, now),
  ].filter((w): w is QuotaWindow => w !== undefined);
}

function oauthWindow(
  id: string,
  label: string,
  w: OAuthWindow | undefined,
  now: number,
): QuotaWindow | undefined {
  const used = toUsedPercent(w?.utilization);
  if (used === undefined) return undefined;
  const { usedPercent, remainingPercent } = clampWindow(used);
  const resetsAt = w?.resets_at;
  const resetsInSeconds = resetsAt
    ? Math.max(0, Math.round((Date.parse(resetsAt) - now) / 1000))
    : undefined;
  return { id, label, usedPercent, remainingPercent, resetsAt, resetsInSeconds };
}

async function fetchOAuth(opts: QuotaOptions): Promise<QuotaWindow[] | undefined> {
  const token = await keychainToken();
  if (!token) return undefined;
  const init: HttpInit = { timeoutMs: opts.timeoutMs ?? 15000, proxy: opts.proxy };
  let res: OAuthUsageResponse;
  try {
    res = await httpJson<OAuthUsageResponse>(USAGE_URL, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'anthropic-beta': BETA_HEADER,
        'User-Agent': 'clihub',
      },
    });
  } catch {
    return undefined;
  }
  const windows = parseClaudeOAuthWindows(res, Date.now());
  return windows.length ? windows : undefined;
}

// ── CLI /usage fallback ─────────────────────────────────────────────────────

const LABELS: Array<{ id: string; label: string; needles: string[] }> = [
  { id: 'session', label: 'Session', needles: ['Current session'] },
  { id: 'weekly', label: 'Weekly', needles: ['Current week (all models)'] },
  { id: 'sonnet', label: 'Sonnet', needles: ['Current week (Sonnet only)', 'Current week (Sonnet)'] },
  { id: 'opus', label: 'Opus', needles: ['Current week (Opus)'] },
];
const ANSI = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b[()][AB0]/g;
const stripAnsi = (s: string): string => s.replace(ANSI, '').replace(/\r/g, '\n');

function runUsage(bin: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    const isLinux = process.platform === 'linux';
    const args = isLinux ? ['-qec', `${bin} /usage`, '/dev/null'] : ['-q', '/dev/null', bin, '/usage'];
    let out = '';
    let done = false;
    const child = spawn('script', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const finish = (): void => {
      if (done) return;
      done = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* gone */
      }
      resolve(out);
    };
    const timer = setTimeout(finish, timeoutMs);
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString()));
    child.on('error', () => {
      clearTimeout(timer);
      finish();
    });
    child.on('close', () => {
      clearTimeout(timer);
      finish();
    });
  });
}

function extractPercent(lines: string[], needles: string[]): number | undefined {
  const idx = lines.findIndex((l) => needles.some((n) => l.includes(n)));
  if (idx < 0) return undefined;
  for (const line of lines.slice(idx, idx + 12)) {
    const m = line.match(/(\d{1,3})\s*%/);
    if (m) return Math.max(0, Math.min(100, Number(m[1])));
  }
  return undefined;
}
function extractReset(lines: string[], needles: string[]): string | undefined {
  const idx = lines.findIndex((l) => needles.some((n) => l.includes(n)));
  if (idx < 0) return undefined;
  for (const line of lines.slice(idx, idx + 12)) {
    const m = line.match(/Resets?\b[^\n]*/i);
    if (m) return m[0].trim();
  }
  return undefined;
}

async function fetchCli(opts: QuotaOptions): Promise<QuotaWindow[] | undefined> {
  const bin = await whichCmd('claude');
  if (!bin) return undefined;
  const text = stripAnsi(await runUsage(bin, opts.timeoutMs ?? 25000));
  const lines = text.split('\n');
  const windows: QuotaWindow[] = [];
  for (const def of LABELS) {
    const pctLeft = extractPercent(lines, def.needles);
    if (pctLeft === undefined) continue;
    const { usedPercent, remainingPercent } = clampWindow(100 - pctLeft);
    windows.push({ id: def.id, label: def.label, usedPercent, remainingPercent, resetLabel: extractReset(lines, def.needles) });
  }
  return windows.length ? windows : undefined;
}

export const claudeQuotaFetcher: QuotaFetcher = {
  tool: 'claude-code',
  label: 'Claude',

  async fetch(opts: QuotaOptions): Promise<QuotaSnapshot> {
    const oauth = await fetchOAuth(opts);
    if (oauth) {
      return {
        tool: 'claude-code',
        label: 'Claude',
        supported: true,
        windows: oauth,
        source: 'claude-oauth',
        updatedAt: new Date().toISOString(),
      };
    }
    const cli = await fetchCli(opts);
    if (cli) {
      return {
        tool: 'claude-code',
        label: 'Claude',
        supported: true,
        windows: cli,
        source: 'claude-cli',
        updatedAt: new Date().toISOString(),
      };
    }
    return quotaUnavailable(
      'claude-code',
      'Claude',
      'Could not read Claude limits (no Keychain OAuth token reachable, and /usage needs an interactive TTY).',
    );
  },
};
