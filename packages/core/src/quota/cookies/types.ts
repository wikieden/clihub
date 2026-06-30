/**
 * Browser cookie extraction for quota fetchers.
 *
 * Several providers (Cursor, OpenCode-web, …) have no local credential file —
 * their session lives only as a browser cookie. To show their quota without a
 * second login, we read the cookie the way CodexBar/ClaudeBar do: straight from
 * the browser's own cookie store on disk, decrypting Chromium values via the
 * login Keychain.
 *
 * This only ever runs locally, only reads cookies for the explicit domains a
 * fetcher asks for, and a cookie is sent ONLY to the same vendor that issued it
 * (cursor.com cookie → cursor.com). Nothing is logged or sent anywhere else.
 */
export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  /** Epoch ms expiry when known; undefined = session cookie. */
  expires?: number;
  /** Which browser it came from, for diagnostics. */
  source: string;
}

export interface CookieQuery {
  /** Host suffixes to match, e.g. ["cursor.com", "www.cursor.com"]. */
  domains: string[];
  /** Browsers to try, in order. Default: all detected. */
  browsers?: string[];
}

/** Build a `Cookie: a=b; c=d` header from a cookie list (deduped by name). */
export function cookieHeader(cookies: Cookie[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const c of cookies) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    parts.push(`${c.name}=${c.value}`);
  }
  return parts.join('; ');
}

/** True when a cookie host matches any requested domain suffix. */
export function hostMatches(host: string, domains: string[]): boolean {
  const h = host.replace(/^\./, '').toLowerCase();
  return domains.some((d) => {
    const dd = d.replace(/^\./, '').toLowerCase();
    return h === dd || h.endsWith(`.${dd}`);
  });
}
