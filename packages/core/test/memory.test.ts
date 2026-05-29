import { test, expect } from 'bun:test';
import {
  applyManagedBlock,
  stripManagedBlock,
  renderTarget,
  MEMORY_START,
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
