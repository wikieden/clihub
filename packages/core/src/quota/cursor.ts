/**
 * Cursor quota fetcher.
 *
 * Cursor has no local credential file — its session lives as a browser cookie
 * (the desktop app and cursor.com share a WorkOS/Auth.js session). We read the
 * cookie from the browser cookie store and call Cursor's own dashboard API, the
 * same as CodexBar:
 *   GET https://cursor.com/api/usage-summary   (Cookie: …)
 * Returns membership + plan usage (used/limit) + on-demand spend (cents).
 *
 * Requires being logged in to cursor.com in a browser; otherwise no session
 * cookie is found and the snapshot degrades with a "log in" hint.
 */
import {
  type QuotaFetcher,
  type QuotaOptions,
  type QuotaSnapshot,
  type QuotaWindow,
  clampWindow,
  quotaUnavailable,
} from './types.js';
import { httpJson, type HttpInit } from './http.js';
import { getCookies, cookieHeader } from './cookies/index.js';

const DOMAINS = ['cursor.com', 'www.cursor.com'];
const SUMMARY_URL = 'https://cursor.com/api/usage-summary';
const SESSION_COOKIE_NAMES = [
  'WorkosCursorSessionToken',
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
  'wos-session',
  '__Secure-wos-session',
  'authjs.session-token',
  '__Secure-authjs.session-token',
];

interface CursorUsage {
  used?: number;
  limit?: number;
  remaining?: number;
}
interface CursorSummary {
  membershipType?: string;
  isUnlimited?: boolean;
  individualUsage?: {
    plan?: CursorUsage;
    onDemand?: { limit?: number; remaining?: number }; // cents
  };
}

function membershipLabel(t?: string): string | undefined {
  if (!t) return undefined;
  const map: Record<string, string> = {
    free: 'Free',
    free_trial: 'Free Trial',
    pro: 'Pro',
    pro_plus: 'Pro+',
    ultra: 'Ultra',
    business: 'Business',
    enterprise: 'Enterprise',
  };
  return map[t.toLowerCase()] ?? t;
}

export const cursorQuotaFetcher: QuotaFetcher = {
  tool: 'cursor',
  label: 'Cursor',

  async fetch(opts: QuotaOptions): Promise<QuotaSnapshot> {
    const cookies = await getCookies({ domains: DOMAINS });
    if (cookies.length === 0) {
      return quotaUnavailable(
        'cursor',
        'Cursor',
        'No cursor.com browser session found. Log in to cursor.com in your browser.',
      );
    }
    const hasSession = cookies.some((c) => SESSION_COOKIE_NAMES.includes(c.name));
    const header = cookieHeader(cookies);

    const init: HttpInit = { timeoutMs: opts.timeoutMs ?? 20000, proxy: opts.proxy };
    let summary: CursorSummary;
    try {
      summary = await httpJson<CursorSummary>(SUMMARY_URL, {
        ...init,
        headers: {
          Cookie: header,
          Accept: 'application/json',
          'User-Agent': 'clihub',
        },
      });
    } catch (err) {
      return quotaUnavailable(
        'cursor',
        'Cursor',
        hasSession
          ? `Cursor usage request failed: ${(err as Error).message}`
          : 'Cursor session cookie not found — log in to cursor.com in your browser.',
      );
    }

    const windows: QuotaWindow[] = [];
    const plan = summary.individualUsage?.plan;
    if (!summary.isUnlimited && plan && typeof plan.limit === 'number' && plan.limit > 0) {
      const used = plan.used ?? plan.limit - (plan.remaining ?? 0);
      const { usedPercent, remainingPercent } = clampWindow((used / plan.limit) * 100);
      windows.push({
        id: 'plan',
        label: 'Plan requests',
        usedPercent,
        remainingPercent,
      });
    }
    const od = summary.individualUsage?.onDemand;
    if (od && typeof od.limit === 'number' && od.limit > 0) {
      const remaining = od.remaining ?? 0;
      const used = od.limit - remaining;
      const { usedPercent, remainingPercent } = clampWindow((used / od.limit) * 100);
      windows.push({
        id: 'on-demand',
        label: 'On-demand spend',
        usedPercent,
        remainingPercent,
      });
    }

    if (windows.length === 0 && !summary.membershipType) {
      return quotaUnavailable('cursor', 'Cursor', 'Cursor returned no usage data for this session.');
    }

    return {
      tool: 'cursor',
      label: 'Cursor',
      supported: true,
      plan: membershipLabel(summary.membershipType),
      windows,
      source: 'cursor-cookie',
      updatedAt: new Date().toISOString(),
      ...(summary.isUnlimited && windows.length === 0
        ? { error: 'Unlimited plan — no request window.' }
        : {}),
    };
  },
};
