import { test, expect } from 'bun:test';
import { diffLockfiles, compareVersions } from '../src/diff/index.js';
import type { Lockfile } from '../src/apply/index.js';

const lock = (tools: Record<string, string>, skills: string[] = []): Lockfile => ({
  version: 1, generatedAt: 't', source: 'clihub.yaml', clihub: '1.12.0',
  tools: Object.fromEntries(Object.entries(tools).map(([k, v]) => [k, { version: v }])),
  skills: Object.fromEntries(skills.map((s) => [s, { tools: [] }])),
  mcp: {}, plugins: {},
});

test('compareVersions numeric + fallback', () => {
  expect(compareVersions('1.2.0', '1.10.0')).toBe(-1);
  expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
  expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
});

test('diff detects added / removed / upgraded / downgraded', () => {
  const a = lock({ 'claude-code': '2.1.0', codex: '0.5.0', kiro: '1.0.0' }, ['s1']);
  const b = lock({ 'claude-code': '2.2.0', codex: '0.4.0', gemini: '1.0.0' }, ['s2']);
  const d = diffLockfiles(a, b);
  const byId = Object.fromEntries(d.tools.map((e) => [e.id, e.kind]));
  expect(byId['claude-code']).toBe('upgraded');
  expect(byId['codex']).toBe('downgraded');
  expect(byId['kiro']).toBe('removed');
  expect(byId['gemini']).toBe('added');
  expect(d.skills.find((e) => e.id === 's1')?.kind).toBe('removed');
  expect(d.skills.find((e) => e.id === 's2')?.kind).toBe('added');
  expect(d.changed).toBeGreaterThan(0);
});

test('identical lockfiles → no changes', () => {
  const a = lock({ 'claude-code': '2.1.0' });
  expect(diffLockfiles(a, a).changed).toBe(0);
});
