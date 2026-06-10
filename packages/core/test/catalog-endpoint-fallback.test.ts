import { describe, expect, test } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CatalogLoader } from '../src/index.js';

const BUNDLED_DIR = path.resolve(import.meta.dir, '../../catalog');

async function writeMinimalCatalog(opts: { endpoints?: unknown } = {}): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'clihub-cat-'));
  await writeFile(path.join(dir, 'skills.json'), '[]');
  await writeFile(path.join(dir, 'tools.json'), '[]');
  await writeFile(path.join(dir, 'presets.json'), '[]');
  if (opts.endpoints !== undefined) {
    await writeFile(path.join(dir, 'endpoints.json'), JSON.stringify(opts.endpoints));
  }
  return dir;
}

describe('catalog endpoints fallback', () => {
  test('a catalog dir WITHOUT endpoints.json falls back to the bundled seed', async () => {
    const dir = await writeMinimalCatalog();
    const cat = await new CatalogLoader({ dir }).load();
    const bundled = await new CatalogLoader({ dir: BUNDLED_DIR }).load();

    expect(cat.endpoints.length).toBeGreaterThan(0);
    expect(cat.endpoints).toEqual(bundled.endpoints);
    expect(cat.endpoints.map((e) => e.id)).toContain('anthropic');
  });

  test('a present-but-empty endpoints.json stays authoritative (no fallback)', async () => {
    const dir = await writeMinimalCatalog({ endpoints: [] });
    const cat = await new CatalogLoader({ dir }).load();
    expect(cat.endpoints).toEqual([]);
  });

  test('a present endpoints.json overrides the bundled seed entirely', async () => {
    const custom = [{ id: 'corp', label: 'Corp Proxy', family: 'anthropic', baseURL: 'https://llm.corp.example' }];
    const dir = await writeMinimalCatalog({ endpoints: custom });
    const cat = await new CatalogLoader({ dir }).load();
    expect(cat.endpoints.map((e) => e.id)).toEqual(['corp']);
  });
});
