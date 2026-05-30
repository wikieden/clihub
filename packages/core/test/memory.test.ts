import { test, expect } from 'bun:test';
import path from 'node:path';
import {
  applyManagedBlock,
  stripManagedBlock,
  renderTarget,
  MEMORY_START,
  MEMORY_TARGETS,
} from '../src/memory/index.js';

test('managed block: insert, replace, preserve outside text', () => {
  const v1 = applyManagedBlock('', 'body1');
  expect(v1).toContain(MEMORY_START);
  expect(v1).toContain('body1');

  const withHand = v1 + '\n## hand notes\nkeep me';
  const v2 = applyManagedBlock(withHand, 'body2');
  expect(v2).toContain('body2');
  expect(v2).not.toContain('body1');
  expect(v2).toContain('keep me');
});

test('stripManagedBlock removes block, keeps surrounding', () => {
  const v = applyManagedBlock('outside', 'b');
  expect(stripManagedBlock(v)).toBe('outside');
});

test('renderTarget prepends frontmatter (cursor)', () => {
  const target = { tool: 'cursor', label: 'Cursor', project: 'x', frontmatter: 'description: d\nalwaysApply: true' };
  const out = renderTarget(target, '', 'body');
  expect(out.startsWith('---\ndescription: d')).toBe(true);
  expect(out).toContain('body');
});

// Memory-file conventions, locked to what was verified against the real CLI
// binaries/docs in a podman container (Sprint 49). A refactor that changes one
// of these should fail loudly.
const memById = Object.fromEntries(MEMORY_TARGETS.map((t) => [t.tool, t]));

test('memory targets match each CLI real convention', () => {
  expect(memById['claude-code']!.project).toBe('CLAUDE.md');
  expect(memById['codex']!.project).toBe('AGENTS.md');
  expect(memById['gemini-cli']!.project).toBe('GEMINI.md');
  expect(memById['cursor']!.project).toBe(path.join('.cursor', 'rules', 'clihub.mdc'));
  expect(memById['cursor']!.frontmatter ?? '').toContain('alwaysApply');
  expect(memById['goose']!.project).toBe('.goosehints');
  expect(memById['kiro-cli']!.project).toBe(path.join('.kiro', 'steering', 'clihub.md'));
});

test('every memory target has a tool id and project path', () => {
  for (const t of MEMORY_TARGETS) {
    expect(t.tool).toBeTruthy();
    expect(t.project).toBeTruthy();
  }
});
