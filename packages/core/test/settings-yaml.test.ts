import { test, expect } from 'bun:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { YamlSettingsAdapter } from '../src/settings/yaml.js';

async function tmpFile(name: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clihub-yaml-'));
  return path.join(dir, name);
}

test('read returns {} for a missing file', async () => {
  const p = await tmpFile('config.yaml');
  const a = new YamlSettingsAdapter({ path: p });
  expect(await a.read()).toEqual({});
});

test('read parses real goose-style YAML (would throw under JSON adapter)', async () => {
  const p = await tmpFile('config.yaml');
  await fs.writeFile(
    p,
    'GOOSE_PROVIDER: openai\nGOOSE_MODEL: gpt-4o\nextensions:\n  developer:\n    enabled: true\n',
  );
  const a = new YamlSettingsAdapter({ path: p });
  const cfg = (await a.read()) as Record<string, unknown>;
  expect(cfg.GOOSE_PROVIDER).toBe('openai');
  expect(cfg.GOOSE_MODEL).toBe('gpt-4o');
  expect((cfg.extensions as any).developer.enabled).toBe(true);
});

test('write emits YAML, NOT JSON — file stays valid goose config', async () => {
  const p = await tmpFile('config.yaml');
  const a = new YamlSettingsAdapter({ path: p });
  await a.write({ GOOSE_PROVIDER: 'openai', extensions: { developer: { enabled: true } } });

  const raw = await fs.readFile(p, 'utf8');
  // JSON would start with `{` and quote every key; YAML does neither.
  expect(raw.trimStart().startsWith('{')).toBe(false);
  expect(raw).toContain('GOOSE_PROVIDER: openai');
  // Round-trips back through a YAML parser to the same object.
  expect(parse(raw)).toEqual({ GOOSE_PROVIDER: 'openai', extensions: { developer: { enabled: true } } });
});

test('round-trips an existing config without data loss', async () => {
  const p = await tmpFile('config.yaml');
  const original = { GOOSE_PROVIDER: 'openai', GOOSE_MODEL: 'gpt-4o', extensions: { developer: { enabled: true }, memory: { enabled: false } } };
  await fs.writeFile(p, 'GOOSE_PROVIDER: openai\nGOOSE_MODEL: gpt-4o\nextensions:\n  developer:\n    enabled: true\n  memory:\n    enabled: false\n');

  const a = new YamlSettingsAdapter({ path: p });
  const cfg = (await a.read()) as Record<string, unknown>;
  await a.write({ ...cfg, GOOSE_TEMPERATURE: 0.2 });

  const reparsed = parse(await fs.readFile(p, 'utf8'));
  expect(reparsed).toEqual({ ...original, GOOSE_TEMPERATURE: 0.2 });
});

test('write rejects non-object input', async () => {
  const p = await tmpFile('config.yaml');
  const a = new YamlSettingsAdapter({ path: p });
  await expect(a.write([1, 2, 3])).rejects.toThrow(/plain object/);
});
