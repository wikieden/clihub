import { test, expect } from 'bun:test';
import { generateClihubYaml, importMachine } from '../src/index.js';

test('generateClihubYaml emits mcp entries when given ids', () => {
  const y = generateClihubYaml({ tools: ['claude-code'], skills: ['superpowers'], mcp: ['github', 'postgres'] });
  expect(y).toContain('mcp:');
  expect(y).toContain('- id: github');
  expect(y).toContain('- id: postgres');
});

test('generateClihubYaml emits `mcp: []` when no ids', () => {
  const y = generateClihubYaml({ tools: ['claude-code'] });
  expect(y).toContain('mcp: []');
});

test('importMachine returns a normalized model + a valid clihub.yaml', async () => {
  const res = await importMachine();
  expect(Array.isArray(res.tools)).toBe(true);
  expect(Array.isArray(res.skills)).toBe(true);
  expect(Array.isArray(res.mcp)).toBe(true);
  expect(res.yaml).toContain('version: 1');
  expect(res.yaml).toContain('tools:');
  // each captured skill is scoped to the CLI it was found in
  for (const s of res.skills) {
    expect(typeof s.id).toBe('string');
    expect(res.tools).toContain(s.tool);
  }
});
