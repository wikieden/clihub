import { test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateMemory, planMemory } from '../src/memory/index.js';

test('generateMemory writes project files with the body (all targets)', async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'clihub-mem-'));
  const body = '# Team rules\nUse 2-space indent.';
  const res = await generateMemory(body, { cwd, all: true });

  const written = res.written.filter((w) => w.verb !== 'skip').map((w) => w.path);
  expect(written.length).toBeGreaterThan(0);
  expect(res.failed.length).toBe(0);

  const claude = path.join(cwd, 'CLAUDE.md');
  expect(existsSync(claude)).toBe(true);
  expect(readFileSync(claude, 'utf8')).toContain('Use 2-space indent.');
});

test('planMemory reports unchanged after a generate (idempotent)', async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'clihub-mem-'));
  const body = 'rules v1';
  await generateMemory(body, { cwd, all: true });
  const plan = await planMemory(body, { cwd, all: true });
  expect(plan.every((i) => i.verb === 'unchanged')).toBe(true);
});

test('hand edits outside the managed block survive regeneration', async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'clihub-mem-'));
  await generateMemory('v1', { cwd, all: true });
  const claude = path.join(cwd, 'CLAUDE.md');
  appendFileSync(claude, '\n## my notes\nkeep me\n');
  await generateMemory('v2', { cwd, all: true });
  const out = readFileSync(claude, 'utf8');
  expect(out).toContain('v2');
  expect(out).not.toContain('v1');
  expect(out).toContain('keep me');
});
