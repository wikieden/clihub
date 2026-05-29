import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const catalogDir = path.join(import.meta.dir, '../../catalog');
const load = (f: string) => JSON.parse(readFileSync(path.join(catalogDir, f), 'utf8'));

test('every preset skill id exists in skills.json', () => {
  const skillIds = new Set((load('skills.json') as Array<{ id: string }>).map((s) => s.id));
  const presets = load('presets.json') as Array<{ id: string; skills: string[]; tools: string[] }>;
  for (const p of presets) {
    for (const s of p.skills) {
      expect({ preset: p.id, skill: s, known: skillIds.has(s) }).toEqual({ preset: p.id, skill: s, known: true });
    }
  }
});

test('preset tool ids are known providers', () => {
  const known = new Set(['claude-code', 'codex', 'kiro-cli', 'gemini-cli', 'cursor', 'goose']);
  const presets = load('presets.json') as Array<{ id: string; tools: string[] }>;
  for (const p of presets) {
    for (const t of p.tools) expect({ preset: p.id, tool: t, known: known.has(t) }).toEqual({ preset: p.id, tool: t, known: true });
  }
});

test('preset ids are unique and the new dev presets are present', () => {
  const presets = load('presets.json') as Array<{ id: string }>;
  const ids = presets.map((p) => p.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ['starter', 'fullstack', 'python', 'go', 'rust', 'research', 'devops']) {
    expect(ids).toContain(id);
  }
});
