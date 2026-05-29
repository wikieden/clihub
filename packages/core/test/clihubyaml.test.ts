import { test, expect } from 'bun:test';
import { parseClihubYaml } from '../src/clihubyaml/full.js';

test('parses scalars, scalar lists, and single-level maps', () => {
  const cfg = parseClihubYaml(
    [
      'version: 1',
      'profile: work',
      'tools:',
      '  - claude-code',
      '  - id: codex',
      '    version: "1.2"',
      'skills:',
      '  - superpowers',
      'presets: []',
      'mcp: []',
      'plugins: []',
    ].join('\n'),
  );
  expect(cfg.version).toBe(1);
  expect(cfg.profile).toBe('work');
  expect(cfg.tools.length).toBe(2);
  expect(cfg.tools[0]!.id).toBe('claude-code');
  expect(cfg.tools[1]!.id).toBe('codex');
  expect(cfg.tools[1]!.version).toBe('1.2');
  expect(cfg.skills[0]!.id).toBe('superpowers');
});

test('ignores unknown deep nesting without throwing', () => {
  const cfg = parseClihubYaml('version: 1\nweird:\n  deep:\n    - a\ntools:\n  - claude-code\n');
  expect(cfg.version).toBe(1);
  expect(cfg.tools.length).toBe(1);
});
