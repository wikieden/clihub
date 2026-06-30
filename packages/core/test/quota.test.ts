import { describe, expect, test } from 'bun:test';

import { parseCodexWindows, codexPlanLabel } from '../src/quota/codex.js';
import { collectQuota } from '../src/quota/index.js';

// A trimmed wham/usage payload shaped like ChatGPT's backend response.
const NOW = Date.parse('2026-06-29T20:25:00Z');
const SAMPLE = {
  plan_type: 'pro',
  rate_limit: {
    primary_window: {
      used_percent: 1,
      reset_at: '2026-06-30T01:14:00Z', // ~4h49m later
      limit_window_seconds: 18000,
    },
    secondary_window: {
      used_percent: 0,
      reset_at: '2026-07-06T19:25:00Z',
      limit_window_seconds: 604800,
    },
  },
  additional_rate_limits: [
    {
      limit_name: 'Codex Spark',
      rate_limit: {
        primary_window: { used_percent: 0, reset_at: '2026-06-30T01:23:00Z' },
        secondary_window: { used_percent: 0, reset_at: '2026-07-06T19:25:00Z' },
      },
    },
  ],
};

describe('codex quota parse', () => {
  test('maps primary/secondary into session + weekly windows', () => {
    const w = parseCodexWindows(SAMPLE, NOW);
    const session = w.find((x) => x.id === 'session')!;
    expect(session.label).toBe('Session');
    expect(session.usedPercent).toBe(1);
    expect(session.remainingPercent).toBe(99);
    // reset ~4h49m = 17340s
    expect(session.resetsInSeconds).toBe(17340);

    const weekly = w.find((x) => x.id === 'weekly')!;
    expect(weekly.remainingPercent).toBe(100);
  });

  test('maps additional_rate_limits into named 5h + weekly windows', () => {
    const w = parseCodexWindows(SAMPLE, NOW);
    const spark5h = w.find((x) => x.id === 'codex-spark-5h')!;
    expect(spark5h.label).toBe('Codex Spark 5-hour');
    expect(spark5h.remainingPercent).toBe(100);
    expect(w.some((x) => x.id === 'codex-spark-weekly')).toBe(true);
  });

  test('clamps out-of-range used_percent', () => {
    const w = parseCodexWindows(
      { rate_limit: { primary_window: { used_percent: 142 } } },
      NOW,
    );
    expect(w[0]!.usedPercent).toBe(100);
    expect(w[0]!.remainingPercent).toBe(0);
  });

  test('plan label prettifies known plans, passes through unknown', () => {
    expect(codexPlanLabel('pro')).toBe('Pro');
    expect(codexPlanLabel('plus')).toBe('Plus');
    expect(codexPlanLabel('mystery')).toBe('mystery');
    expect(codexPlanLabel(undefined)).toBeUndefined();
  });
});

describe('collectQuota fault isolation', () => {
  test('unknown tool filter yields no snapshots, never throws', async () => {
    const res = await collectQuota({ tools: ['does-not-exist'], timeoutMs: 1 });
    expect(res.snapshots).toEqual([]);
  });

  test('codex without auth.json degrades to an unsupported snapshot', async () => {
    // No network and (in CI) no ~/.codex/auth.json → supported:false, no throw.
    const res = await collectQuota({ tools: ['codex'], timeoutMs: 1 });
    expect(res.snapshots).toHaveLength(1);
    const snap = res.snapshots[0]!;
    expect(snap.tool).toBe('codex');
    if (!snap.supported) expect(typeof snap.error).toBe('string');
  });
});
