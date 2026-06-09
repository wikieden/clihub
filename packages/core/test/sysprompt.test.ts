import { test, expect } from 'bun:test';
import { mkdtempSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateMemory, MEMORY_START } from '../src/memory/index.js';
import {
  generateSysprompt,
  planSysprompt,
  PROMPT_START,
  PROMPT_END,
} from '../src/sysprompt/index.js';

function fixture(): string {
  return mkdtempSync(path.join(tmpdir(), 'clihub-prompt-'));
}

test('prompt block coexists with memory block in the same file', async () => {
  const dir = fixture();
  await generateMemory('SHARED RULES', { cwd: dir, all: true });
  await generateSysprompt('PERSONA PROMPT', { cwd: dir, all: true });

  const claude = await fs.readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
  expect(claude).toContain('SHARED RULES');
  expect(claude).toContain('PERSONA PROMPT');
  expect(claude).toContain(MEMORY_START);
  expect(claude).toContain(PROMPT_START);
  expect(claude).toContain(PROMPT_END);
});

test('regenerating memory preserves the prompt block (and vice versa)', async () => {
  const dir = fixture();
  await generateMemory('RULES v1', { cwd: dir, all: true });
  await generateSysprompt('PERSONA v1', { cwd: dir, all: true });

  await generateMemory('RULES v2', { cwd: dir, all: true });
  let claude = await fs.readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
  expect(claude).toContain('RULES v2');
  expect(claude).not.toContain('RULES v1');
  expect(claude).toContain('PERSONA v1'); // prompt block untouched by memory regen

  await generateSysprompt('PERSONA v2', { cwd: dir, all: true });
  claude = await fs.readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
  expect(claude).toContain('RULES v2'); // memory block untouched by prompt regen
  expect(claude).toContain('PERSONA v2');
  expect(claude).not.toContain('PERSONA v1');
});

test('prompt generate is idempotent (re-plan reports unchanged)', async () => {
  const dir = fixture();
  await generateSysprompt('PERSONA', { cwd: dir, all: true });
  const plan = await planSysprompt('PERSONA', { cwd: dir, all: true });
  expect(plan.every((i) => i.verb === 'unchanged')).toBe(true);
});

test('cursor .mdc keeps a single frontmatter with both blocks', async () => {
  const dir = fixture();
  await generateMemory('RULES', { cwd: dir, all: true });
  await generateSysprompt('PERSONA', { cwd: dir, all: true });
  const mdc = await fs.readFile(path.join(dir, '.cursor', 'rules', 'clihub.mdc'), 'utf8');
  // exactly one frontmatter fence pair at the top
  const fences = (mdc.match(/^---$/gm) ?? []).length;
  expect(fences).toBe(2);
  expect(mdc).toContain('RULES');
  expect(mdc).toContain('PERSONA');
});
