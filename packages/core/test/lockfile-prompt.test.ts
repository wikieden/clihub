import { test, expect } from 'bun:test';
import { mkdtempSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  generateLockfile,
  computeStatus,
  systemPromptHash,
  CatalogLoader,
  type Lockfile,
} from '../src/index.js';

const emptyCfg = { version: 1, tools: [], skills: [], presets: [], mcp: [], plugins: [] } as never;

test('generateLockfile pins systemPromptHash when a prompt source exists', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'clihub-lock-'));
  await fs.writeFile(path.join(dir, 'clihub.systemprompt.md'), 'BE TERSE AND HONEST', 'utf8');
  const lock = await generateLockfile(emptyCfg, '1.60.0', new CatalogLoader(), { cwd: dir });
  expect(lock.systemPromptHash).toBeTruthy();
  expect(lock.systemPromptHash).toBe(await systemPromptHash(dir));
});

test('generateLockfile omits systemPromptHash when no prompt source', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'clihub-lock-'));
  const lock = await generateLockfile(emptyCfg, '1.60.0', new CatalogLoader(), { cwd: dir });
  expect(lock.systemPromptHash).toBeUndefined();
});

function lockWithPrompt(hash?: string): Lockfile {
  return {
    version: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    source: 'clihub.yaml',
    clihub: '1.60.0',
    tools: {},
    skills: {},
    mcp: {},
    plugins: {},
    ...(hash ? { systemPromptHash: hash } : {}),
  };
}

test('status: prompt ok when current hash matches the lock', async () => {
  const lock = lockWithPrompt('a'.repeat(64));
  const r = await computeStatus(emptyCfg, lock, { systemPromptHash: 'a'.repeat(64) });
  const it = r.items.find((i) => i.kind === 'prompt')!;
  expect(it.state).toBe('ok');
  expect(r.compliant).toBe(true);
});

test('status: prompt drift fails compliance', async () => {
  const lock = lockWithPrompt('a'.repeat(64));
  const r = await computeStatus(emptyCfg, lock, { systemPromptHash: 'b'.repeat(64) });
  expect(r.items.find((i) => i.kind === 'prompt')!.state).toBe('drift');
  expect(r.drift).toBeGreaterThan(0);
  expect(r.compliant).toBe(false);
});

test('status: pinned prompt but no local source → missing (gates CI)', async () => {
  const lock = lockWithPrompt('a'.repeat(64));
  const r = await computeStatus(emptyCfg, lock, {});
  expect(r.items.find((i) => i.kind === 'prompt')!.state).toBe('missing');
  expect(r.compliant).toBe(false);
});

test('status: no pinned prompt → no prompt item', async () => {
  const r = await computeStatus(emptyCfg, lockWithPrompt(), { systemPromptHash: 'whatever' });
  expect(r.items.find((i) => i.kind === 'prompt')).toBeUndefined();
});
