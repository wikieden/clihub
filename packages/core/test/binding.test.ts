import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  useBinding,
  readBindings,
  writeBindings,
  endpointUrls,
  CatalogLoader,
  type EndpointPreset,
} from '../src/index.js';

const loader = new CatalogLoader({ dir: path.resolve(import.meta.dir, '../../catalog') });
const FAKE_KEY = 'sk-test-fake-0000000000000000';

async function sandbox(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'clihub-bind-'));
}

describe('endpointUrls (v2 normalization)', () => {
  test('v1 family+baseURL upgrades to a urls map', () => {
    const p: EndpointPreset = { id: 'x', label: 'X', family: 'openai', baseURL: 'https://api.x.com/v1' };
    expect(endpointUrls(p)).toEqual({ openai: 'https://api.x.com/v1' });
  });

  test('v2 urls wins over legacy fields', () => {
    const p: EndpointPreset = {
      id: 'x',
      label: 'X',
      urls: { anthropic: 'https://a.x.com' },
      family: 'openai',
      baseURL: 'https://api.x.com/v1',
    };
    expect(endpointUrls(p)).toEqual({ anthropic: 'https://a.x.com' });
  });

  test('bundled deepseek serves both protocols', async () => {
    const eps = (await loader.load()).endpoints;
    const ds = eps.find((e) => e.id === 'deepseek');
    expect(endpointUrls(ds!)).toEqual({
      anthropic: 'https://api.deepseek.com/anthropic',
      openai: 'https://api.deepseek.com',
    });
  });
});

describe('useBinding — claude-code', () => {
  test('writes ANTHROPIC_BASE_URL + AUTH_TOKEN + model into settings.json (0600)', async () => {
    const home = await sandbox();
    const res = await useBinding('deepseek', {
      cli: 'claude-code',
      model: 'deepseek-chat',
      home,
      loader,
      keyLookup: async () => FAKE_KEY,
    });

    expect(res.targets).toHaveLength(1);
    expect(res.targets[0]?.protocol).toBe('anthropic');

    const file = path.join(home, '.claude', 'settings.json');
    const settings = JSON.parse(await readFile(file, 'utf8'));
    expect(settings.env.ANTHROPIC_BASE_URL).toBe('https://api.deepseek.com/anthropic');
    expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe(FAKE_KEY);
    expect(settings.model).toBe('deepseek-chat');

    const mode = (await stat(file)).mode & 0o777;
    expect(mode).toBe(0o600);

    expect(await readBindings({ home })).toEqual({
      'claude-code': { endpoint: 'deepseek', model: 'deepseek-chat' },
    });
  });

  test('preserves unrelated existing settings fields', async () => {
    const home = await sandbox();
    await useBinding('anthropic', { cli: 'claude-code', home, loader, keyLookup: async () => FAKE_KEY });
    const file = path.join(home, '.claude', 'settings.json');
    const before = JSON.parse(await readFile(file, 'utf8'));
    before.permissions = { allow: ['Bash'] };
    const fs = await import('node:fs/promises');
    await fs.writeFile(file, JSON.stringify(before));

    await useBinding('deepseek', { cli: 'claude-code', home, loader, keyLookup: async () => FAKE_KEY });
    const after = JSON.parse(await readFile(file, 'utf8'));
    expect(after.permissions).toEqual({ allow: ['Bash'] });
    expect(after.env.ANTHROPIC_BASE_URL).toBe('https://api.deepseek.com/anthropic');
  });
});

describe('useBinding — codex', () => {
  test('writes model_provider + [model_providers.clihub-deepseek] into config.toml', async () => {
    const home = await sandbox();
    await useBinding('deepseek', {
      cli: 'codex',
      model: 'deepseek-chat',
      home,
      loader,
      keyLookup: async () => FAKE_KEY,
    });

    const raw = await readFile(path.join(home, '.codex', 'config.toml'), 'utf8');
    expect(raw).toContain('model_provider = "clihub-deepseek"');
    expect(raw).toContain('model = "deepseek-chat"');
    expect(raw).toContain('base_url = "https://api.deepseek.com"');
    expect(raw).toContain('env_key = "DEEPSEEK_API_KEY"');
    expect(raw).toContain(`experimental_bearer_token = "${FAKE_KEY}"`);

    expect((await readBindings({ home })).codex).toEqual({ endpoint: 'deepseek', model: 'deepseek-chat' });
  });
});

describe('useBinding — key preflight (never silently bind)', () => {
  test('missing key throws BEFORE writing any file', async () => {
    const home = await sandbox();
    await expect(
      useBinding('deepseek', { cli: 'claude-code', home, loader, keyLookup: async () => undefined }),
    ).rejects.toThrow(/DEEPSEEK_API_KEY/);
    // nothing written
    await expect(readFile(path.join(home, '.claude', 'settings.json'), 'utf8')).rejects.toThrow();
    expect(await readBindings({ home })).toEqual({});
  });

  test('allowMissingKey binds without writing a key field', async () => {
    const home = await sandbox();
    await useBinding('deepseek', {
      cli: 'claude-code',
      home,
      loader,
      keyLookup: async () => undefined,
      allowMissingKey: true,
    });
    const settings = JSON.parse(await readFile(path.join(home, '.claude', 'settings.json'), 'utf8'));
    expect(settings.env.ANTHROPIC_BASE_URL).toBe('https://api.deepseek.com/anthropic');
    expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  });

  test('ollama (no authEnv) binds without any key lookup', async () => {
    const home = await sandbox();
    const res = await useBinding('ollama', { cli: 'codex', home, loader });
    expect(res.targets[0]?.keyDelivered).toBe(false);
    const raw = await readFile(path.join(home, '.codex', 'config.toml'), 'utf8');
    expect(raw).toContain('base_url = "http://localhost:11434/v1"');
    expect(raw).not.toContain('experimental_bearer_token');
  });
});

describe('useBinding — target selection', () => {
  test('no --for: deepseek binds BOTH claude-code and codex', async () => {
    const home = await sandbox();
    const res = await useBinding('deepseek', { home, loader, keyLookup: async () => FAKE_KEY });
    expect(res.targets.map((t) => t.cli).sort()).toEqual(['claude-code', 'codex']);
    const b = await readBindings({ home });
    expect(b['claude-code']?.endpoint).toBe('deepseek');
    expect(b.codex?.endpoint).toBe('deepseek');
  });

  test('anthropic-only preset targets only claude-code', async () => {
    const home = await sandbox();
    const res = await useBinding('anthropic', { home, loader, keyLookup: async () => FAKE_KEY });
    expect(res.targets.map((t) => t.cli)).toEqual(['claude-code']);
  });

  test('--for a CLI whose protocol the endpoint lacks throws', async () => {
    const home = await sandbox();
    await expect(
      useBinding('anthropic', { cli: 'codex', home, loader, keyLookup: async () => FAKE_KEY }),
    ).rejects.toThrow(/no openai URL/);
  });

  test('unknown cli / unknown endpoint throw', async () => {
    const home = await sandbox();
    await expect(useBinding('deepseek', { cli: 'nope', home, loader })).rejects.toThrow(/no binding adapter/);
    await expect(useBinding('nope', { home, loader })).rejects.toThrow(/unknown endpoint/);
  });
});

describe('bindings io', () => {
  test('read/write round-trip', async () => {
    const home = await sandbox();
    await writeBindings({ codex: { endpoint: 'groq' } }, { home });
    expect(await readBindings({ home })).toEqual({ codex: { endpoint: 'groq' } });
  });
});
