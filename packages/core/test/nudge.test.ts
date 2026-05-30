import { test, expect } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { shouldNudgeStar, readNudge, markNudged, STAR_NUDGE_PROBABILITY, STAR_NUDGE_MAX_ASKS } from '../src/nudge/index.js';

test('shouldNudgeStar: probability gate', () => {
  expect(shouldNudgeStar({ asks: 0 }, STAR_NUDGE_PROBABILITY - 0.01)).toBe(true);
  expect(shouldNudgeStar({ asks: 0 }, STAR_NUDGE_PROBABILITY + 0.01)).toBe(false);
});

test('shouldNudgeStar: stops when starred or asked enough', () => {
  expect(shouldNudgeStar({ starred: true, asks: 0 }, 0)).toBe(false);
  expect(shouldNudgeStar({ asks: STAR_NUDGE_MAX_ASKS }, 0)).toBe(false);
});

test('markNudged: dismissed counts, opened stops', async () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'clihub-nudge-')), 'nudge.json');
  await markNudged('dismissed', file);
  let s = await readNudge(file);
  expect(s.asks).toBe(1);
  expect(s.starred).toBeUndefined();

  await markNudged('opened', file);
  s = await readNudge(file);
  expect(s.asks).toBe(2);
  expect(s.starred).toBe(true);
  expect(shouldNudgeStar(s, 0)).toBe(false);
});
