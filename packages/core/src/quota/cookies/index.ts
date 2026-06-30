/**
 * Unified browser-cookie lookup for quota fetchers. Tries each browser in order
 * and returns the freshest non-expired cookie per name across all of them.
 *
 * macOS only for now (Chromium Keychain + Safari binarycookies are macOS
 * paths). On other platforms it simply finds nothing and the caller degrades.
 */
import { chromeCookies } from './chrome.js';
import { safariCookies } from './safari.js';
import { firefoxCookies } from './firefox.js';
import { type Cookie, type CookieQuery } from './types.js';

export { cookieHeader } from './types.js';
export type { Cookie } from './types.js';

/** Default browser try-order; chromium variants share the chrome extractor. */
const DEFAULT_ORDER = ['chrome', 'edge', 'brave', 'arc', 'chromium', 'safari', 'firefox'];

export async function getCookies(query: CookieQuery): Promise<Cookie[]> {
  const order = query.browsers?.length ? query.browsers : DEFAULT_ORDER;
  const chromiumIds = order.filter((b) => ['chrome', 'edge', 'brave', 'arc', 'chromium'].includes(b));

  const results = await Promise.all([
    chromiumIds.length ? chromeCookies(query.domains, chromiumIds).catch(() => []) : Promise.resolve([]),
    order.includes('safari') ? safariCookies(query.domains).catch(() => []) : Promise.resolve([]),
    order.includes('firefox') ? firefoxCookies(query.domains).catch(() => []) : Promise.resolve([]),
  ]);

  // Keep the freshest (latest-expiring) cookie per name. Session cookies
  // (no expiry) rank below dated ones only when a dated one exists.
  const best = new Map<string, Cookie>();
  for (const c of results.flat()) {
    const cur = best.get(c.name);
    if (!cur || (c.expires ?? 0) >= (cur.expires ?? 0)) best.set(c.name, c);
  }
  return [...best.values()];
}
