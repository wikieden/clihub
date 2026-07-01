/**
 * Quota exhaustion alerts — opt-in, notification-only.
 *
 * Modeled on Symbioose/claude-account-switcher's most conservative policy
 * (researched against the ccswitch-family landscape): off by default, one
 * opt-in per tool, fires only when a window is fully exhausted (0% left) —
 * never an early warning, never a silent credential swap. This module only
 * *detects*; delivery (an OS notification) is the caller's job, so detection
 * stays pure and testable.
 *
 * Cross-profile headroom scanning (Codex only): clihub's profile system
 * (`~/.clihub/profiles/<name>/`) only snapshots claude-code/codex/kiro-cli —
 * Antigravity's credentials live outside it entirely, and Claude's fetcher
 * spawns the live CLI (can't safely point at another profile without
 * swapping the active symlink). Codex's fetcher is a simple file read, so
 * it's the one case where checking "does another stored profile have
 * headroom" is both meaningful and safe to do without touching anything live.
 */
import { collectQuota, fetchCodexQuotaFrom, type QuotaOptions, type QuotaSnapshot } from './index.js';
import { listProfiles, defaultProfilesRoot } from '../profile/index.js';
import path from 'node:path';

export interface QuotaAlert {
  tool: string;
  label: string;
  /** Stable id combining tool + window, e.g. "codex:session" — use this to
   * dedupe repeat notifications across poll cycles. */
  key: string;
  windowLabel: string;
  message: string;
}

export interface ProfileHeadroom {
  profile: string;
  /** Lowest remainingPercent across that profile's windows — the binding
   * constraint, same convention as picking the tightest window to display. */
  remainingPercent: number;
}

/**
 * Check every stored profile's own Codex credentials (never the active,
 * live one) and report each profile's remaining headroom, best first.
 * Read-only — never touches the active symlink or any live session.
 */
export async function scanCodexProfiles(opts: QuotaOptions = {}): Promise<ProfileHeadroom[]> {
  const names = await listProfiles().catch(() => [] as string[]);
  const root = defaultProfilesRoot();
  const results = await Promise.all(
    names.map(async (name): Promise<ProfileHeadroom | undefined> => {
      const authPath = path.join(root, name, '.codex', 'auth.json');
      const snap = await fetchCodexQuotaFrom(authPath, opts).catch(() => undefined);
      if (!snap?.supported || snap.windows.length === 0) return undefined;
      const remainingPercent = Math.min(...snap.windows.map((w) => w.remainingPercent));
      return { profile: name, remainingPercent };
    }),
  );
  return results
    .filter((r): r is ProfileHeadroom => r !== undefined)
    .sort((a, b) => b.remainingPercent - a.remainingPercent);
}

/**
 * Pure detection: given already-fetched snapshots + how many other profiles
 * exist, produce one alert per exhausted window (remainingPercent <= 0).
 * `codexHeadroom` (optional) names a specific profile with headroom instead
 * of the generic "N other profiles" hint — only meaningful for tool="codex".
 * Exported separately from `checkQuotaAlerts` so the threshold/message logic
 * is testable without a live network fetch.
 */
export function alertsFromSnapshots(
  snapshots: QuotaSnapshot[],
  profileCount: number,
  codexHeadroom?: ProfileHeadroom[],
): QuotaAlert[] {
  const alerts: QuotaAlert[] = [];
  for (const s of snapshots) {
    if (!s.supported) continue;
    for (const w of s.windows) {
      if (w.remainingPercent > 0) continue;
      let suggestion = '';
      const best = s.tool === 'codex' ? codexHeadroom?.find((p) => p.remainingPercent > 0) : undefined;
      if (best) {
        suggestion = ` Profile "${best.profile}" has ${best.remainingPercent}% left — \`clihub profile use ${best.profile}\` to switch.`;
      } else if (profileCount > 0) {
        suggestion = ` You have ${profileCount} other profile${profileCount === 1 ? '' : 's'} — \`clihub profile use <name>\` to switch.`;
      }
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
 * exhausted or no tools are opted in. When Codex is exhausted, scans other
 * stored profiles' headroom (read-only) to name a specific one to switch to.
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
  const codexExhausted = snapshots.some(
    (s) => s.tool === 'codex' && s.supported && s.windows.some((w) => w.remainingPercent <= 0),
  );
  const codexHeadroom = codexExhausted ? await scanCodexProfiles(opts) : undefined;
  return alertsFromSnapshots(snapshots, profiles.length, codexHeadroom);
}
