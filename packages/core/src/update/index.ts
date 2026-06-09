/**
 * `clihub self-update --check` — npm dist-tag aware update check (v1.59).
 *
 * Read-only: queries the npm registry for the published version on a dist-tag
 * (default `latest`) and compares it to the running version. The fetch is
 * injectable so it is fully headless-testable without network. Never installs;
 * the install path stays in the CLI's `self-update` action.
 */

export const CLIHUB_PKG = '@wikieden/clihub';
const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

export interface UpdateCheck {
  current: string;
  latest?: string;
  distTag: string;
  updateAvailable: boolean;
  error?: string;
}

export interface CheckOptions {
  current: string;
  distTag?: string;
  pkg?: string;
  registry?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Numeric semver-lite compare; returns sign of a-b over major.minor.patch. */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v.replace(/^v/, '').split('-')[0]!.split('.').map((n) => Number(n) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

export async function checkForUpdate(opts: CheckOptions): Promise<UpdateCheck> {
  const distTag = opts.distTag ?? 'latest';
  const pkg = opts.pkg ?? CLIHUB_PKG;
  const registry = (opts.registry ?? DEFAULT_REGISTRY).replace(/\/+$/, '');
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${registry}/${pkg.replace('/', '%2F')}`;

  try {
    const res = await doFetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 5000) });
    if (!res.ok) {
      return { current: opts.current, distTag, updateAvailable: false, error: `registry ${res.status}` };
    }
    const json = (await res.json()) as { 'dist-tags'?: Record<string, string> };
    const latest = json['dist-tags']?.[distTag];
    if (!latest) {
      return { current: opts.current, distTag, updateAvailable: false, error: `no dist-tag "${distTag}"` };
    }
    return {
      current: opts.current,
      latest,
      distTag,
      updateAvailable: compareSemver(latest, opts.current) > 0,
    };
  } catch (e) {
    return { current: opts.current, distTag, updateAvailable: false, error: String(e) };
  }
}
