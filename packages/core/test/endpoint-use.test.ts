import { test, expect } from 'bun:test';
import { mkdtempSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { useEndpoint, CatalogLoader } from '../src/index.js';

const BUNDLED = path.resolve(import.meta.dir, '../../catalog');
const loader = (): CatalogLoader => new CatalogLoader({ dir: BUNDLED });

async function profile(): Promise<{ root: string; name: string }> {
  const root = mkdtempSync(path.join(tmpdir(), 'clihub-ep-'));
  const name = 'work';
  await fs.mkdir(path.join(root, name), { recursive: true });
  await fs.writeFile(
    path.join(root, name, 'meta.json'),
    JSON.stringify({ name, created: '2026-01-01T00:00:00.000Z', updated: '2026-01-01T00:00:00.000Z' }),
    'utf8',
  );
  return { root, name };
}

test('endpoint use anthropic writes ANTHROPIC_BASE_URL into the profile claude settings + meta', async () => {
  const { root, name } = await profile();
  const res = await useEndpoint('anthropic', name, { root, loader: loader() });
  expect(res.preset.baseURL).toBe('https://api.anthropic.com');
  expect(res.patches.some((p) => p.applied && p.envVar === 'ANTHROPIC_BASE_URL')).toBe(true);

  const settings = JSON.parse(await fs.readFile(path.join(root, name, '.claude', 'settings.json'), 'utf8'));
  expect(settings.env.ANTHROPIC_BASE_URL).toBe('https://api.anthropic.com');

  const meta = JSON.parse(await fs.readFile(path.join(root, name, 'meta.json'), 'utf8'));
  expect(meta.baseUrls.anthropic).toBe('https://api.anthropic.com');
});

test('OpenAI-compatible preset (deepseek) writes OPENAI_BASE_URL into codex config', async () => {
  const { root, name } = await profile();
  const res = await useEndpoint('deepseek', name, { root, loader: loader() });
  expect(res.preset.family).toBe('openai');
  const toml = await fs.readFile(path.join(root, name, '.codex', 'config.toml'), 'utf8');
  expect(toml).toContain('https://api.deepseek.com');
});

test('unknown preset id throws', async () => {
  const { root, name } = await profile();
  await expect(useEndpoint('nope', name, { root, loader: loader() })).rejects.toThrow();
});
