import { test, expect } from 'bun:test';
import { generateClihubYaml, scaffoldFromInstalled } from '../src/init/index.js';
import { parseClihubYaml } from '../src/clihubyaml/full.js';

test('generateClihubYaml defaults parse back to a valid config', () => {
  const cfg = parseClihubYaml(generateClihubYaml());
  expect(cfg.version).toBe(1);
  expect(cfg.tools[0]!.id).toBe('claude-code');
  expect(cfg.skills[0]!.id).toBe('superpowers');
});

test('generateClihubYaml honours tools / skills / profile / preset / schema', () => {
  const yaml = generateClihubYaml({ profile: 'work', preset: 'python', tools: ['codex', 'antigravity'], skills: ['tdd'], schema: true });
  expect(yaml.startsWith('# yaml-language-server: $schema=./clihub.schema.json')).toBe(true);
  const cfg = parseClihubYaml(yaml);
  expect(cfg.profile).toBe('work');
  expect(cfg.tools.map((t) => t.id)).toEqual(['codex', 'antigravity']);
  expect(cfg.skills[0]!.id).toBe('tdd');
  expect(cfg.presets).toContain('python');
});

test('empty skills renders skills: []', () => {
  expect(generateClihubYaml({ skills: [] })).toContain('skills: []');
});

test('tool-scoped skill entries render id+tool and parse back', () => {
  const yaml = generateClihubYaml({ tools: ['codex'], skills: [{ id: 'tdd', tool: 'codex' }, 'superpowers'] });
  expect(yaml).toContain('  - id: tdd');
  expect(yaml).toContain('    tool: codex');
  const cfg = parseClihubYaml(yaml);
  const tdd = cfg.skills.find((s) => s.id === 'tdd');
  expect(tdd?.tool).toBe('codex');
  expect(cfg.skills.some((s) => s.id === 'superpowers')).toBe(true);
});

test('scaffoldFromInstalled returns non-empty tools + skills', async () => {
  const s = await scaffoldFromInstalled({ cwd: process.cwd() });
  expect(s.tools.length).toBeGreaterThan(0);
  expect(s.skills.length).toBeGreaterThan(0);
});
