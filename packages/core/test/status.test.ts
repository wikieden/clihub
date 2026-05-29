import { test, expect } from 'bun:test';
import { makeProvider } from '../src/tools/declarative.js';
import { registerProvider } from '../src/tools/registry.js';
import { computeStatus } from '../src/status/index.js';
import type { ClihubYamlConfig } from '../src/clihubyaml/full.js';
import type { Lockfile } from '../src/apply/index.js';

// register a declarative provider whose binary (node) is always present
const prov = makeProvider({ id: 'faketool-status', name: 'FakeStatus', bin: 'node', install: { npm: 'x' } });
registerProvider(prov);

const cfg = (id: string): ClihubYamlConfig => ({ tools: [{ id }], skills: [], presets: [], mcp: [], plugins: [] });
const lock = (id: string, version: string): Lockfile => ({
  version: 1, generatedAt: 't', source: 'clihub.yaml', clihub: '1.9.0',
  tools: { [id]: { version } }, skills: {}, mcp: {}, plugins: {},
});

test('drift when locked version differs from installed', async () => {
  const r = await computeStatus(cfg('faketool-status'), lock('faketool-status', '0.0.0'));
  expect(r.drift).toBe(1);
  expect(r.compliant).toBe(false);
});

test('missing when provider/binary absent', async () => {
  const r = await computeStatus(cfg('no-such-provider-xyz'));
  expect(r.missing).toBe(1);
  expect(r.compliant).toBe(false);
});

test('unlocked when no lockfile entry', async () => {
  const r = await computeStatus(cfg('faketool-status'));
  expect(r.lockfile).toBe(false);
  expect(r.items.find((i) => i.id === 'faketool-status')?.state).toBe('unlocked');
});
