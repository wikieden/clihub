/**
 * clihub stable error codes — see docs/18-CONFIG-PROXY-PROFILE.md §10 and
 * docs/19-CLIHUBYAML.md §12 for the canonical lists.
 *
 * Each code maps to a single FAQ page under https://clihub.dev/errors/.
 * Use `formatErrorMessage(code, detail)` everywhere instead of raw
 * strings so the suffix is consistent (code → message → "see <url>").
 */

export type ClihubErrorCode =
  // Proxy
  | 'CLIHUB-E-100'
  | 'CLIHUB-E-101'
  | 'CLIHUB-E-102'
  | 'CLIHUB-E-103'
  // CA bundle
  | 'CLIHUB-E-201'
  | 'CLIHUB-E-202'
  // Profile
  | 'CLIHUB-E-300'
  | 'CLIHUB-E-301'
  | 'CLIHUB-E-302'
  | 'CLIHUB-E-303'
  // Auth / keychain
  | 'CLIHUB-E-400'
  | 'CLIHUB-E-401'
  | 'CLIHUB-E-500'
  | 'CLIHUB-E-501'
  // clihub.yaml / lockfile
  | 'CLIHUB-E-600'
  | 'CLIHUB-E-601'
  | 'CLIHUB-E-602'
  | 'CLIHUB-E-603'
  | 'CLIHUB-E-604'
  | 'CLIHUB-E-605'
  | 'CLIHUB-E-606'
  // Catalog
  | 'CLIHUB-E-700'
  | 'CLIHUB-E-701';

interface ErrorMessage {
  message: string;
  /** Human-readable category for grouping in help screens. */
  category: 'proxy' | 'ca-bundle' | 'profile' | 'auth' | 'yaml' | 'catalog';
}

const TABLE: Record<ClihubErrorCode, ErrorMessage> = {
  // Proxy
  'CLIHUB-E-100': { category: 'proxy', message: 'Proxy URL unparseable. Expected http://, https://, or socks5://[user:pass@]host:port' },
  'CLIHUB-E-101': { category: 'proxy', message: 'Proxy reachable but refused CONNECT' },
  'CLIHUB-E-102': { category: 'proxy', message: 'Proxy authentication rejected (401/407)' },
  'CLIHUB-E-103': { category: 'proxy', message: 'Proxy TLS handshake failed — likely needs `clihub config set ca-bundle`' },
  // CA bundle
  'CLIHUB-E-201': { category: 'ca-bundle', message: 'CA bundle path unreadable' },
  'CLIHUB-E-202': { category: 'ca-bundle', message: 'CA bundle does not validate the target host' },
  // Profile
  'CLIHUB-E-300': { category: 'profile', message: 'Profile name invalid (must match [a-z][a-z0-9-]{0,30})' },
  'CLIHUB-E-301': { category: 'profile', message: 'Profile not found' },
  'CLIHUB-E-302': { category: 'profile', message: 'Profile is currently active; cannot delete' },
  'CLIHUB-E-303': { category: 'profile', message: 'Profile dir corrupt (missing expected sub-dirs)' },
  // Auth
  'CLIHUB-E-400': { category: 'auth', message: 'System keychain unavailable; falling back to encrypted file vault' },
  'CLIHUB-E-401': { category: 'auth', message: 'Auth key not set in active profile' },
  'CLIHUB-E-500': { category: 'auth', message: 'OAuth state mismatch (possible CSRF)' },
  'CLIHUB-E-501': { category: 'auth', message: 'OAuth provider declined' },
  // YAML / lockfile
  'CLIHUB-E-600': { category: 'yaml', message: 'clihub.yaml not found in the resolution path' },
  'CLIHUB-E-601': { category: 'yaml', message: 'clihub.yaml YAML parse error' },
  'CLIHUB-E-602': { category: 'yaml', message: 'Required env var missing during interpolation' },
  'CLIHUB-E-603': { category: 'yaml', message: 'Catalog id not found during validate / apply' },
  'CLIHUB-E-604': { category: 'yaml', message: 'Lockfile drift on `install --frozen`' },
  'CLIHUB-E-605': { category: 'yaml', message: 'Unsupported `version` in clihub.yaml' },
  'CLIHUB-E-606': { category: 'yaml', message: 'Hook command exited non-zero (use --continue-on-error to bypass)' },
  // Catalog
  'CLIHUB-E-700': { category: 'catalog', message: 'Catalog sync failed' },
  'CLIHUB-E-701': { category: 'catalog', message: 'Catalog checksum mismatch' },
};

export interface ClihubError extends Error {
  code: ClihubErrorCode;
  docUrl: string;
}

export function formatErrorMessage(code: ClihubErrorCode, detail?: string): string {
  const entry = TABLE[code];
  const docs = `https://clihub.dev/errors/${code}`;
  const base = `${code}: ${entry.message}`;
  const tail = `  See ${docs}`;
  return detail ? `${base} (${detail})\n${tail}` : `${base}\n${tail}`;
}

export function createError(code: ClihubErrorCode, detail?: string): ClihubError {
  const err = new Error(formatErrorMessage(code, detail)) as ClihubError;
  err.code = code;
  err.docUrl = `https://clihub.dev/errors/${code}`;
  return err;
}

export function listErrors(): Array<{ code: ClihubErrorCode; category: string; message: string }> {
  return (Object.keys(TABLE) as ClihubErrorCode[]).map((code) => ({
    code,
    category: TABLE[code].category,
    message: TABLE[code].message,
  }));
}
