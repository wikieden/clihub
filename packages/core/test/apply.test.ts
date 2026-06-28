import { test, expect } from 'bun:test';
import { lockfileToConfig, type Lockfile } from '../src/apply/index.js';

const lock: Lockfile = {
  version: 1,
  generatedAt: '2026-01-01T00:00:00.000Z',
  source: 'clihub.yaml',
  clihub: '1.41.0',
  tools: { 'claude-code': { version: '2.1.158', method: 'npm' }, 'antigravity': { version: '0.44.1' } },
  skills: { superpowers: { tools: ['claude-code', 'codex'] }, lonely: { tools: [] } },
  mcp: { filesystem: {}, github: {} },
  plugins: { 'some-plugin': {} },
};

test('lockfileToConfig pins tool versions from the lock (not re-resolved)', () => {
  const cfg = lockfileToConfig(lock);
  const claude = cfg.tools.find((t) => t.id === 'claude-code')!;
  expect(claude.version).toBe('2.1.158');
  expect(claude.method).toBe('npm');
  expect(cfg.tools.find((t) => t.id === 'antigravity')!.version).toBe('0.44.1');
});

test('lockfileToConfig fans skills to their locked tools, mcp + plugins by id', () => {
  const cfg = lockfileToConfig(lock);
  // superpowers locked to two tools → two scoped entries
  const sp = cfg.skills.filter((s) => s.id === 'superpowers');
  expect(sp.map((s) => s.tool).sort()).toEqual(['claude-code', 'codex']);
  // a skill with no locked tools → one unscoped entry
  expect(cfg.skills.filter((s) => s.id === 'lonely')).toEqual([{ id: 'lonely' }]);
  expect(cfg.mcp.map((m) => m.id).sort()).toEqual(['filesystem', 'github']);
  expect(cfg.plugins.map((p) => p.id)).toEqual(['some-plugin']);
  expect(cfg.presets).toEqual([]);
});
