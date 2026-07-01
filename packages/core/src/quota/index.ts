/**
 * Cross-CLI live quota rollup.
 *
 * Mirrors CodexBar: each registered fetcher reuses the credentials its CLI
 * already stored and reports rolling rate-limit windows + reset times. Fetchers
 * run concurrently and are individually fault-isolated — an offline or
 * unimplemented provider yields an errored snapshot, never a thrown rollup.
 *
 * Implemented: Codex (HTTP), Claude (CLI /usage). Others are added one fetcher
 * at a time; until then they simply don't appear in the registry.
 */
import { codexQuotaFetcher, fetchCodexQuotaFrom } from './codex.js';
import { claudeQuotaFetcher } from './claude.js';
import { antigravityQuotaFetcher } from './antigravity.js';
import { cursorQuotaFetcher } from './cursor.js';

export { checkQuotaAlerts, alertsFromSnapshots, scanCodexProfiles, type QuotaAlert, type ProfileHeadroom } from './alerts.js';
export { fetchCodexQuotaFrom };
import {
  type QuotaFetcher,
  type QuotaOptions,
  type QuotaResult,
  type QuotaSnapshot,
  quotaUnavailable,
} from './types.js';

export * from './types.js';

/** All providers with a quota fetcher, in display order. */
const FETCHERS: QuotaFetcher[] = [
  codexQuotaFetcher,
  claudeQuotaFetcher,
  antigravityQuotaFetcher,
  cursorQuotaFetcher,
];

export function quotaFetchers(): readonly QuotaFetcher[] {
  return FETCHERS;
}

export async function collectQuota(opts: QuotaOptions = {}): Promise<QuotaResult> {
  const wanted = opts.tools?.length
    ? FETCHERS.filter((f) => opts.tools!.includes(f.tool))
    : FETCHERS;

  const snapshots = await Promise.all(
    wanted.map(async (f): Promise<QuotaSnapshot> => {
      try {
        return await f.fetch(opts);
      } catch (err) {
        return quotaUnavailable(f.tool, f.label, (err as Error).message);
      }
    }),
  );

  return { snapshots };
}
