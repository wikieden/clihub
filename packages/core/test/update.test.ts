import { test, expect } from 'bun:test';
import { checkForUpdate, compareSemver } from '../src/index.js';

function fakeFetch(distTags: Record<string, string> | null, ok = true): typeof fetch {
  return (async () =>
    ({
      ok,
      status: ok ? 200 : 503,
      json: async () => (distTags ? { 'dist-tags': distTags } : {}),
    }) as unknown as Response) as unknown as typeof fetch;
}

test('compareSemver orders major.minor.patch', () => {
  expect(compareSemver('1.60.0', '1.50.0')).toBe(1);
  expect(compareSemver('1.50.0', '1.60.0')).toBe(-1);
  expect(compareSemver('1.50.0', '1.50.0')).toBe(0);
  expect(compareSemver('2.0.0', '1.99.99')).toBe(1);
  expect(compareSemver('v1.60.0', '1.60.0')).toBe(0); // tolerant of v-prefix
});

test('updateAvailable true when registry latest is newer', async () => {
  const r = await checkForUpdate({ current: '1.50.0', fetchImpl: fakeFetch({ latest: '1.60.0' }) });
  expect(r.latest).toBe('1.60.0');
  expect(r.updateAvailable).toBe(true);
  expect(r.error).toBeUndefined();
});

test('no-op when current equals latest', async () => {
  const r = await checkForUpdate({ current: '1.60.0', fetchImpl: fakeFetch({ latest: '1.60.0' }) });
  expect(r.updateAvailable).toBe(false);
});

test('respects an explicit dist-tag', async () => {
  const r = await checkForUpdate({ current: '1.60.0', distTag: 'next', fetchImpl: fakeFetch({ latest: '1.60.0', next: '1.61.0-rc.1' }) });
  expect(r.distTag).toBe('next');
  expect(r.latest).toBe('1.61.0-rc.1');
});

test('registry error degrades to no-update + error note (never throws)', async () => {
  const r = await checkForUpdate({ current: '1.50.0', fetchImpl: fakeFetch(null, false) });
  expect(r.updateAvailable).toBe(false);
  expect(r.error).toBeTruthy();
});

test('missing dist-tag reported as error, not crash', async () => {
  const r = await checkForUpdate({ current: '1.50.0', distTag: 'beta', fetchImpl: fakeFetch({ latest: '1.60.0' }) });
  expect(r.updateAvailable).toBe(false);
  expect(r.error).toContain('beta');
});
