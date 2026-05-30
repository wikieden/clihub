import { test, expect } from 'bun:test';
import { mkdtempSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CodexSkillAdapter } from '../src/skill/codex-adapter.js';

function skillsDir(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), 'clihub-cdx-')), 'skills');
}

const skill = {
  id: 'superpowers',
  name: 'Superpowers',
  description: 'Core skill workflows',
  version: 'latest',
  tags: ['core', 'workflow'],
};

test('install writes the Agent-Skills dir layout codex discovers (<id>/SKILL.md), not a flat .md', async () => {
  const dir = skillsDir();
  const a = new CodexSkillAdapter({ skillsDir: dir });
  await a.install(skill as never, 'oh-my-claudecode');

  const skillMd = path.join(dir, 'superpowers', 'SKILL.md');
  const flat = path.join(dir, 'superpowers.md');
  expect(await fs.access(skillMd).then(() => true).catch(() => false)).toBe(true);
  expect(await fs.access(flat).then(() => true).catch(() => false)).toBe(false);

  const body = await fs.readFile(skillMd, 'utf8');
  expect(body).toContain('name: superpowers');
  expect(body).toContain('description:');
});

test('list reads skill dirs; uninstall removes the dir', async () => {
  const dir = skillsDir();
  const a = new CodexSkillAdapter({ skillsDir: dir });
  await a.install(skill as never, 'src');
  expect((await a.list()).map((s) => s.id)).toContain('superpowers');
  await a.uninstall('superpowers');
  expect(await a.list()).toHaveLength(0);
});

test('install cleans up a legacy flat skills/<id>.md', async () => {
  const dir = skillsDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'superpowers.md'), 'legacy', 'utf8');
  const a = new CodexSkillAdapter({ skillsDir: dir });
  await a.install(skill as never, 'src');
  expect(await fs.access(path.join(dir, 'superpowers.md')).then(() => true).catch(() => false)).toBe(false);
});
