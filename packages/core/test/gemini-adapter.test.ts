import { test, expect } from 'bun:test';
import { mkdtempSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { GeminiCliSkillAdapter } from '../src/skill/gemini-adapter.js';

function fixture() {
  const base = mkdtempSync(path.join(tmpdir(), 'clihub-gem-'));
  return {
    commandsDir: path.join(base, 'commands'),
    geminiMd: path.join(base, 'GEMINI.md'),
  };
}

const skill = { id: 'superpowers', name: 'Superpowers', description: 'Adds "superpowers" to your agent.' };

test('install writes a Gemini-valid .toml command (not .md) with a prompt field', async () => {
  const f = fixture();
  const a = new GeminiCliSkillAdapter(f);
  await a.install(skill as never, 'catalog');

  const toml = path.join(f.commandsDir, 'superpowers.toml');
  const md = path.join(f.commandsDir, 'superpowers.md');
  expect(await fs.access(toml).then(() => true).catch(() => false)).toBe(true);
  expect(await fs.access(md).then(() => true).catch(() => false)).toBe(false);

  // Gemini requires valid TOML with a `prompt` string field.
  const parsed = parseToml(await fs.readFile(toml, 'utf8')) as Record<string, unknown>;
  expect(typeof parsed.prompt).toBe('string');
  expect(parsed.prompt as string).toContain('Superpowers');
  expect(typeof parsed.description).toBe('string');
});

test('list reads .toml commands; uninstall removes them', async () => {
  const f = fixture();
  const a = new GeminiCliSkillAdapter(f);
  await a.install(skill as never, 'catalog');
  expect((await a.list()).map((s) => s.id)).toContain('superpowers');
  await a.uninstall('superpowers');
  expect(await a.list()).toHaveLength(0);
});

test('quotes/special chars in description do not break TOML', async () => {
  const f = fixture();
  const a = new GeminiCliSkillAdapter(f);
  await a.install({ id: 'q', name: 'Q', description: 'has "quotes" and \\ backslash' } as never, 'src');
  const parsed = parseToml(await fs.readFile(path.join(f.commandsDir, 'q.toml'), 'utf8')) as Record<string, unknown>;
  expect(parsed.description).toBe('has "quotes" and \\ backslash');
});
