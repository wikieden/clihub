/**
 * Quota exhaustion alerts — opt-in, notification-only.
 *
 * Modeled on Symbioose/claude-account-switcher's most conservative policy
 * (researched against the ccswitch-family landscape): off by default, one
 * opt-in per tool, fires only when a window is fully exhausted (0% left) —
 * never an early warning, never a silent credential swap. This module only
 * *detects*; delivery (an OS notification) is the caller's job, so detection
 * stays pure and testable.
 */
import { collectQuota, type QuotaOptions, type QuotaSnapshot } from './index.js';
import { listProfiles } from '../profile/index.js';

export interface QuotaAlert {
  tool: string;
  label: string;
  /** Stable id combining tool + window, e.g. "codex:session" — use this to
   * dedupe repeat notifications across poll cycles. */
  key: string;
  windowLabel: string;
  message: string;
}

/**
 * Pure detection: given already-fetched snapshots + how many other profiles
 * exist, produce one alert per exhausted window (remainingPercent <= 0).
 * Exported separately from `checkQuotaAlerts` so the threshold/message logic
 * is testable without a live network fetch.
 */
export function alertsFromSnapshots(snapshots: QuotaSnapshot[], profileCount: number): QuotaAlert[] {
  const alerts: QuotaAlert[] = [];
  for (const s of snapshots) {
    if (!s.supported) continue;
    for (const w of s.windows) {
      if (w.remainingPercent > 0) continue;
      const suggestion =
        profileCount > 0
          ? ` You have ${profileCount} other profile${profileCount === 1 ? '' : 's'} — \`clihub profile use <name>\` to switch.`
          : '';
      alerts.push({
        tool: s.tool,
        label: s.label,
        key: `${s.tool}:${w.id}`,
        windowLabel: w.label,
        message: `${s.label} ${w.label} limit reached (0% left).${suggestion}`,
      });
    }
  }
  return alerts;
}

/**
 * Detect exhausted windows for the given opted-in tools. Returns one alert
 * per exhausted window (remainingPercent <= 0) — empty if nothing is
 * exhausted or no tools are opted in.
 */
export async function checkQuotaAlerts(
  enabledTools: string[],
  opts: QuotaOptions = {},
): Promise<QuotaAlert[]> {
  if (enabledTools.length === 0) return [];
  const [{ snapshots }, profiles] = await Promise.all([
    collectQuota({ ...opts, tools: enabledTools }),
    listProfiles().catch(() => [] as string[]),
  ]);
  return alertsFromSnapshots(snapshots, profiles.length);
}
