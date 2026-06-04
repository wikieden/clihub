import { test, expect } from 'bun:test';
import { mkdtempSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { CursorSkillAdapter } from '../src/skill/cursor-adapter.js';
import { GooseSkillAdapter } from '../src/skill/goose-adapter.js';

const skill = {
  id: 'superpowers',
  name: 'Superpowers',
  description: 'Adds "superpowers" to your agent.',
  version: '1.0.0',
  tags: ['agent'],
};

function tmp(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

// --- Cursor: ~/.cursor/commands/<id>.md (plain markdown body = prompt) ---

test('cursor: install writes clihub-<id>.md plain markdown', async () => {
  const dir = tmp('clihub-cur-');
  const a = new CursorSkillAdapter({ commandsDir: dir });
  await a.install(skill as never, 'catalog');

  const file = path.join(dir, 'clihub-superpowers.md');
  const body = await fs.readFile(file, 'utf8');
  expect(body).toContain('# Superpowers');
  expect(body).toContain('superpowers');
});

test('cursor: list reads only clihub-*.md; uninstall removes', async () => {
  const dir = tmp('clihub-cur-');
  const a = new CursorSkillAdapter({ commandsDir: dir });
  // A user's own command must be ignored by list/uninstall.
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'mine.md'), '# mine', 'utf8');
  await a.install(skill as never, 'catalog');

  expect((await a.list()).map((s) => s.id)).toEqual(['superpowers']);
  await a.uninstall('superpowers');
  expect(await a.list()).toHaveLength(0);
  // user's file survived
  expect(await fs.access(path.join(dir, 'mine.md')).then(() => true)).toBe(true);
});

// --- Goose: ~/.config/goose/recipes/<id>.yaml (structured recipe) ---

test('goose: install writes a valid recipe yaml with required fields', async () => {
  const dir = tmp('clihub-goose-');
  const a = new GooseSkillAdapter({ recipesDir: dir });
  await a.install(skill as never, 'catalog');

  const file = path.join(dir, 'clihub-superpowers.yaml');
  const recipe = parseYaml(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
  // Goose minimal recipe = version + title + description + instructions.
  expect(recipe.version).toBe('1.0.0');
  expect(recipe.title).toBe('Superpowers');
  expect(typeof recipe.description).toBe('string');
  expect(typeof recipe.instructions).toBe('string');
  expect(recipe.instructions as string).toContain('superpowers');
});

test('goose: quotes/special chars in name+desc stay valid yaml', async () => {
  const dir = tmp('clihub-goose-');
  const a = new GooseSkillAdapter({ recipesDir: dir });
  await a.install(
    { id: 'q', name: 'Q: "test"', description: 'has "quotes"\nand newline', version: '0', tags: [] } as never,
    'src',
  );
  const recipe = parseYaml(await fs.readFile(path.join(dir, 'clihub-q.yaml'), 'utf8')) as Record<string, unknown>;
  expect(recipe.title).toBe('Q: "test"');
  expect(recipe.description).toBe('has "quotes"\nand newline');
});

test('goose: list/uninstall scoped to clihub-*.yaml', async () => {
  const dir = tmp('clihub-goose-');
  const a = new GooseSkillAdapter({ recipesDir: dir });
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'user-recipe.yaml'), 'version: 1.0.0\ntitle: x\n', 'utf8');
  await a.install(skill as never, 'catalog');

  expect((await a.list()).map((s) => s.id)).toEqual(['superpowers']);
  await a.uninstall('superpowers');
  expect(await a.list()).toHaveLength(0);
  expect(await fs.access(path.join(dir, 'user-recipe.yaml')).then(() => true)).toBe(true);
});
