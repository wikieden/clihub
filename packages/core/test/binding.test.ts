import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  useBinding,
  setModelBinding,
  clearBinding,
  readBindings,
  writeBindings,
  endpointUrls,
  generateLockfile,
  computeStatus,
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
  test('no --for: deepseek binds every capable CLI (claude-code/codex/qwen/goose)', async () => {
    const home = await sandbox();
    const res = await useBinding('deepseek', { home, loader, keyLookup: async () => FAKE_KEY });
    expect(res.targets.map((t) => t.cli).sort()).toEqual(['claude-code', 'codex', 'goose', 'qwen']);
    const b = await readBindings({ home });
    expect(b['claude-code']?.endpoint).toBe('deepseek');
    expect(b.codex?.endpoint).toBe('deepseek');
    expect(b.qwen?.endpoint).toBe('deepseek');
    expect(b.goose?.endpoint).toBe('deepseek');
  });

  test('anthropic-only preset targets claude-code and goose', async () => {
    const home = await sandbox();
    const res = await useBinding('anthropic', { home, loader, keyLookup: async () => FAKE_KEY });
    expect(res.targets.map((t) => t.cli).sort()).toEqual(['claude-code', 'goose']);
  });

  test('--for a model-only CLI (kiro/cursor) throws an honest pointer to `clihub model`', async () => {
    const home = await sandbox();
    await expect(
      useBinding('deepseek', { cli: 'kiro', home, loader, keyLookup: async () => FAKE_KEY }),
    ).rejects.toThrow(/model-only.*clihub model kiro/);
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

describe('useBinding — gemini (~/.gemini/.env + settings model.name)', () => {
  test('writes base URL + key as .env lines, preserving foreign lines; model into settings.json', async () => {
    const home = await sandbox();
    const envFile = path.join(home, '.gemini', '.env');
    const fs = await import('node:fs/promises');
    await fs.mkdir(path.dirname(envFile), { recursive: true });
    await fs.writeFile(envFile, 'OTHER_VAR=keep-me\n', 'utf8');

    const res = await useBinding('google', {
      cli: 'gemini',
      model: 'gemini-2.5-pro',
      home,
      loader,
      keyLookup: async () => FAKE_KEY,
    });
    expect(res.targets[0]?.protocol).toBe('google');
    expect(res.targets[0]?.keyDelivered).toBe(true);

    const env = await readFile(envFile, 'utf8');
    expect(env).toContain('OTHER_VAR=keep-me');
    expect(env).toContain('GOOGLE_GEMINI_BASE_URL=https://generativelanguage.googleapis.com');
    expect(env).toContain(`GEMINI_API_KEY=${FAKE_KEY}`);
    expect(((await stat(envFile)).mode & 0o777)).toBe(0o600);

    const settings = JSON.parse(await readFile(path.join(home, '.gemini', 'settings.json'), 'utf8'));
    expect(settings.model.name).toBe('gemini-2.5-pro');
  });

  test('clear removes the .env lines and model.name, keeps foreign lines', async () => {
    const home = await sandbox();
    const envFile = path.join(home, '.gemini', '.env');
    const fs = await import('node:fs/promises');
    await fs.mkdir(path.dirname(envFile), { recursive: true });
    await fs.writeFile(envFile, 'OTHER_VAR=keep-me\n', 'utf8');
    await useBinding('google', { cli: 'gemini', model: 'gemini-2.5-pro', home, loader, keyLookup: async () => FAKE_KEY });

    await clearBinding('gemini', { home, loader });
    const env = await readFile(envFile, 'utf8');
    expect(env).toContain('OTHER_VAR=keep-me');
    expect(env).not.toContain('GOOGLE_GEMINI_BASE_URL');
    expect(env).not.toContain('GEMINI_API_KEY');
    const settings = JSON.parse(await readFile(path.join(home, '.gemini', 'settings.json'), 'utf8'));
    expect(settings.model?.name).toBeUndefined();
    expect((await readBindings({ home })).gemini).toBeUndefined();
  });
});

describe('useBinding — qwen (modelProviders entries ARE models)', () => {
  test('deepseek auto-model: entry id=model, marker name, envKey, selectedType, model.name, env key', async () => {
    const home = await sandbox();
    await useBinding('deepseek', { cli: 'qwen', home, loader, keyLookup: async () => FAKE_KEY });

    const s = JSON.parse(await readFile(path.join(home, '.qwen', 'settings.json'), 'utf8'));
    const entry = s.modelProviders.openai[0];
    expect(entry).toEqual({
      id: 'deepseek-chat', // first catalog model — model.name must match an entry id
      name: 'clihub:deepseek',
      baseUrl: 'https://api.deepseek.com',
      envKey: 'DEEPSEEK_API_KEY',
    });
    expect(s.security.auth.selectedType).toBe('openai');
    expect(s.model.name).toBe('deepseek-chat');
    expect(s.env.DEEPSEEK_API_KEY).toBe(FAKE_KEY);
    expect((await readBindings({ home })).qwen).toEqual({ endpoint: 'deepseek', model: 'deepseek-chat' });
  });

  test('--for qwen on a preset with no catalog models and no --model throws', async () => {
    const home = await sandbox();
    await expect(
      useBinding('groq', { cli: 'qwen', home, loader, keyLookup: async () => FAKE_KEY }),
    ).rejects.toThrow(/--model/);
  });

  test('clear removes only clihub-marked entries and the env key slot', async () => {
    const home = await sandbox();
    await useBinding('deepseek', { cli: 'qwen', home, loader, keyLookup: async () => FAKE_KEY });
    await clearBinding('qwen', { home, loader });
    const s = JSON.parse(await readFile(path.join(home, '.qwen', 'settings.json'), 'utf8'));
    expect(s.modelProviders).toBeUndefined();
    expect(s.model?.name).toBeUndefined();
    expect(s.env?.DEEPSEEK_API_KEY).toBeUndefined();
  });
});

describe('useBinding — goose (config.yaml built-in provider host route)', () => {
  test('deepseek → GOOSE_PROVIDER anthropic + ANTHROPIC_HOST + GOOSE_MODEL; key NEVER written', async () => {
    const home = await sandbox();
    const res = await useBinding('deepseek', { cli: 'goose', home, loader, keyLookup: async () => FAKE_KEY });
    expect(res.targets[0]?.protocol).toBe('anthropic');
    // goose reads keys only from its keyring/env — config.yaml must stay key-free.
    expect(res.targets[0]?.keyDelivered).toBe(false);

    const yaml = await readFile(path.join(home, '.config', 'goose', 'config.yaml'), 'utf8');
    expect(yaml).toContain('GOOSE_PROVIDER: anthropic');
    expect(yaml).toContain('ANTHROPIC_HOST: https://api.deepseek.com/anthropic');
    expect(yaml).toContain('GOOSE_MODEL: deepseek-chat');
    expect(yaml).not.toContain(FAKE_KEY);

    const keyNote = res.targets[0]?.patches.find((p) => p.field === 'key');
    expect(keyNote?.applied).toBe(false);
    expect(keyNote?.detail).toContain('ANTHROPIC_API_KEY');
  });

  test('clear removes provider/model/host keys, keeps the rest of config.yaml', async () => {
    const home = await sandbox();
    const file = path.join(home, '.config', 'goose', 'config.yaml');
    const fs = await import('node:fs/promises');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, 'extensions:\n  - name: dev\n', 'utf8');
    await useBinding('deepseek', { cli: 'goose', home, loader, keyLookup: async () => FAKE_KEY });
    await clearBinding('goose', { home, loader });
    const yaml = await readFile(file, 'utf8');
    expect(yaml).toContain('extensions:');
    expect(yaml).not.toContain('GOOSE_PROVIDER');
    expect(yaml).not.toContain('ANTHROPIC_HOST');
  });
});

describe('setModelBinding — the kiro/cursor model-only path', () => {
  test('kiro writes the flat dotted key chat.defaultModel', async () => {
    const home = await sandbox();
    const res = await setModelBinding('kiro', 'claude-sonnet-4.6', { home });
    expect(res.patches[0]?.field).toBe('chat.defaultModel');
    const s = JSON.parse(await readFile(path.join(home, '.kiro', 'settings', 'cli.json'), 'utf8'));
    expect(s['chat.defaultModel']).toBe('claude-sonnet-4.6');
    // model-only binding: no endpoint recorded
    expect((await readBindings({ home })).kiro).toEqual({ model: 'claude-sonnet-4.6' });
  });

  test('cursor writes model.modelId + hasChangedDefaultModel', async () => {
    const home = await sandbox();
    await setModelBinding('cursor', 'composer-3', { home });
    const s = JSON.parse(await readFile(path.join(home, '.cursor', 'cli-config.json'), 'utf8'));
    expect(s.model.modelId).toBe('composer-3');
    expect(s.hasChangedDefaultModel).toBe(true);
  });

  test('kiro clear removes the key (service-side default resumes)', async () => {
    const home = await sandbox();
    await setModelBinding('kiro', 'claude-sonnet-4.6', { home });
    await clearBinding('kiro', { home, loader });
    const s = JSON.parse(await readFile(path.join(home, '.kiro', 'settings', 'cli.json'), 'utf8'));
    expect(s['chat.defaultModel']).toBeUndefined();
  });
});

describe('clearBinding — restore official', () => {
  test('claude-code: env keys + model removed, unrelated settings preserved, binding entry dropped', async () => {
    const home = await sandbox();
    await useBinding('deepseek', { cli: 'claude-code', model: 'deepseek-chat', home, loader, keyLookup: async () => FAKE_KEY });
    const file = path.join(home, '.claude', 'settings.json');
    const fs = await import('node:fs/promises');
    const before = JSON.parse(await readFile(file, 'utf8'));
    before.permissions = { allow: ['Bash'] };
    await fs.writeFile(file, JSON.stringify(before));

    await clearBinding('claude-code', { home, loader });
    const after = JSON.parse(await readFile(file, 'utf8'));
    expect(after.env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(after.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(after.model).toBeUndefined();
    expect(after.permissions).toEqual({ allow: ['Bash'] });
    expect(await readBindings({ home })).toEqual({});
  });

  test('clear with no cli id restores every bound CLI', async () => {
    const home = await sandbox();
    await useBinding('deepseek', { home, loader, keyLookup: async () => FAKE_KEY });
    const res = await clearBinding(undefined, { home, loader });
    expect(res.targets.map((t) => t.cli).sort()).toEqual(['claude-code', 'codex', 'goose', 'qwen']);
    expect(await readBindings({ home })).toEqual({});
    const toml = await readFile(path.join(home, '.codex', 'config.toml'), 'utf8');
    expect(toml).not.toContain('model_provider');
  });
});

describe('lockfile bindings drift gate (status --strict)', () => {
  const emptyCfg = { version: 1, tools: [], skills: [], presets: [], mcp: [], plugins: [] } as never;

  test('generateLockfile pins live bindings; computeStatus reports ok / drift / missing', async () => {
    const home = await sandbox();
    await writeBindings({ 'claude-code': { endpoint: 'deepseek', model: 'deepseek-chat' } }, { home });
    const lock = await generateLockfile(emptyCfg, '1.62.0', loader, { home });
    expect(lock.bindings).toEqual({ 'claude-code': { endpoint: 'deepseek', model: 'deepseek-chat' } });

    // ok: live matches the pin
    let r = await computeStatus(emptyCfg, lock, { home });
    expect(r.items.find((i) => i.kind === 'binding')?.state).toBe('ok');
    expect(r.compliant).toBe(true);

    // drift: someone re-bound to another endpoint
    await writeBindings({ 'claude-code': { endpoint: 'groq', model: 'llama-4' } }, { home });
    r = await computeStatus(emptyCfg, lock, { home });
    expect(r.items.find((i) => i.kind === 'binding')?.state).toBe('drift');
    expect(r.compliant).toBe(false);

    // missing: binding cleared entirely
    await writeBindings({}, { home });
    r = await computeStatus(emptyCfg, lock, { home });
    expect(r.items.find((i) => i.kind === 'binding')?.state).toBe('missing');
    expect(r.compliant).toBe(false);
  });

  test('lockfile without bindings adds no binding items', async () => {
    const home = await sandbox();
    const lock = await generateLockfile(emptyCfg, '1.62.0', loader, { home });
    expect(lock.bindings).toBeUndefined();
    const r = await computeStatus(emptyCfg, lock, { home });
    expect(r.items.find((i) => i.kind === 'binding')).toBeUndefined();
  });
});
