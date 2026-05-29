/**
 * `clihub status` engine (v0.11.0, team lockfile compliance).
 *
 * Answers one question for CI and teammates: does THIS machine match the
 * pinned `clihub.lock.json`? `apply --plan` diffs against `clihub.yaml`
 * (intent); status diffs against the LOCKFILE (exact pinned versions), so
 * it can gate a build when someone drifts off the agreed toolchain.
 *
 *   - computeStatus(cfg, lock) → StatusReport (read-only; no installs)
 *
 * Tools are checked precisely (provider.detect() vs locked version).
 * Skills are reported from the lockfile for visibility but not probed —
 * per-CLI skill detection is adapter-specific and out of scope here.
 */
import type { ClihubYamlConfig } from '../clihubyaml/full.js';
import type { Lockfile } from '../apply/index.js';
import { getProvider } from '../tools/registry.js';

export type ComplianceState = 'ok' | 'drift' | 'missing' | 'unlocked';

export interface StatusItem {
  kind: 'tool' | 'skill';
  id: string;
  state: ComplianceState;
  /** Version pinned in the lockfile (if any). */
  locked?: string;
  /** Version actually detected on this machine. */
  actual?: string;
  detail?: string;
}

export interface StatusReport {
  items: StatusItem[];
  ok: number;
  drift: number;
  missing: number;
  unlocked: number;
  /** No drift and nothing missing. */
  compliant: boolean;
  /** A lockfile was supplied. */
  lockfile: boolean;
}

export async function computeStatus(cfg: ClihubYamlConfig, lock?: Lockfile): Promise<StatusReport> {
  const items: StatusItem[] = [];

  for (const tool of cfg.tools) {
    const provider = getProvider(tool.id);
    const locked = lock?.tools[tool.id]?.version;
    if (!provider) {
      items.push({ kind: 'tool', id: tool.id, state: 'missing', locked, detail: 'unknown tool' });
      continue;
    }
    const det = await provider.detect();
    if (!det.installed) {
      items.push({ kind: 'tool', id: tool.id, state: 'missing', locked, detail: 'not installed' });
      continue;
    }
    const actual = det.version;
    // A lockfile entry of 'latest' is not a precise pin → can't assert drift.
    if (locked && locked !== 'latest') {
      if (actual && actual !== locked) {
        items.push({ kind: 'tool', id: tool.id, state: 'drift', locked, actual });
      } else {
        items.push({ kind: 'tool', id: tool.id, state: 'ok', locked, actual });
      }
    } else {
      items.push({ kind: 'tool', id: tool.id, state: 'unlocked', actual, detail: lock ? 'no precise pin' : 'no lockfile' });
    }
  }

  // skills: visibility only, sourced from the lockfile.
  if (lock) {
    for (const [id, entry] of Object.entries(lock.skills)) {
      items.push({ kind: 'skill', id, state: 'ok', detail: entry.tools.join(', ') || undefined });
    }
  }

  const drift = items.filter((i) => i.state === 'drift').length;
  const missing = items.filter((i) => i.state === 'missing').length;
  const ok = items.filter((i) => i.state === 'ok').length;
  const unlocked = items.filter((i) => i.state === 'unlocked').length;

  return {
    items,
    ok,
    drift,
    missing,
    unlocked,
    compliant: drift === 0 && missing === 0,
    lockfile: Boolean(lock),
  };
}
