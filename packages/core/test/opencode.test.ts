import { describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  useBinding,
  setModelBinding,
  clearBinding,
  readBindings,
  parseJsonc,
  OpencodeMcpAdapter,
  BINDING_ADAPTERS,
  MEMORY_TARGETS,
  skillAdapterFor,
  opencodeProvider,
  CatalogLoader,
} from '../src/index.js';

const loader = new CatalogLoader({ dir: path.resolve(import.meta.dir, '../../catalog') });
const FAKE_KEY = 'sk-test-fake-0000000000000000';

async function sandbox(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'clihub-oc-'));
}

function ocPath(home: string): string {
  return path.join(home, '.config', 'opencode', 'opencode.json');
}

describe('parseJsonc', () => {
  test('strips comments and trailing commas, keeps strings intact', () => {
    const raw = `{
  // line comment
  "url": "https://x.com/a//b", /* not a comment inside the string above */
  "list": [1, 2, 3,],
  "nested": { "a": "/*literal*/", },
}`;
    expect(parseJsonc(raw)).toEqual({
      url: 'https://x.com/a//b',
      list: [1, 2, 3],
      nested: { a: '/*literal*/' },
    });
  });

  test('plain JSON passes through', () => {
    expect(parseJsonc('{"a":1}')).toEqual({ a: 1 });
  });
});

describe('opencode provider', () => {
  test('registry identity + config path', () => {
    expect(opencodeProvider.id).toBe('opencode');
    expect(opencodeProvider.settingsAdapter.configPath()).toBe(
      path.join(os.homedir(), '.config', 'opencode', 'opencode.json'),
    );
  });

  test('has skill + memory surfaces', () => {
    expect(skillAdapterFor('opencode')).toBeDefined();
    const target = MEMORY_TARGETS.find((t) => t.tool === 'opencode');
    expect(target?.project).toBe('AGENTS.md');
    expect(target?.user?.endsWith(path.join('.config', 'opencode', 'AGENTS.md'))).toBe(true);
  });
});

describe('useBinding — opencode (openai-compatible route)', () => {
  test('writes clihub-<id> provider + slash model into opencode.json (0600)', async () => {
    const home = await sandbox();
    const res = await useBinding('deepseek', {
      cli: 'opencode',
      model: 'deepseek-chat',
      home,
      loader,
      keyLookup: async () => FAKE_KEY,
    });

    expect(res.targets).toHaveLength(1);
    // adapter prefers openai when the preset serves both protocols
    expect(res.targets[0]?.protocol).toBe('openai');
    expect(res.targets[0]?.keyDelivered).toBe(true);

    const cfg = JSON.parse(await readFile(ocPath(home), 'utf8'));
    const p = cfg.provider['clihub-deepseek'];
    expect(p.npm).toBe('@ai-sdk/openai-compatible');
    expect(p.options.baseURL).toBe('https://api.deepseek.com');
    expect(p.options.apiKey).toBe(FAKE_KEY);
    expect(Object.keys(p.models)).toEqual(['deepseek-chat']);
    expect(cfg.model).toBe('clihub-deepseek/deepseek-chat');

    const mode = (await stat(ocPath(home))).mode & 0o777;
    expect(mode).toBe(0o600);

    expect(await readBindings({ home })).toEqual({
      opencode: { endpoint: 'deepseek', model: 'deepseek-chat' },
    });
  });

  test('explicit --for without model throws (requiresModel)', async () => {
    const home = await sandbox();
    // groq preset lists no models in the bundled catalog
    await expect(
      useBinding('groq', { cli: 'opencode', home, loader, keyLookup: async () => FAKE_KEY }),
    ).rejects.toThrow(/model/);
  });
});

describe('opencode binding adapter — anthropic override route', () => {
  test('apply(protocol=anthropic) overrides the built-in provider', async () => {
    const home = await sandbox();
    const adapter = BINDING_ADAPTERS.opencode!;
    await adapter.apply!({
      endpointId: 'deepseek',
      label: 'DeepSeek',
      url: 'https://api.deepseek.com/anthropic',
      protocol: 'anthropic',
      key: FAKE_KEY,
      model: 'deepseek-chat',
      home,
    });
    const cfg = JSON.parse(await readFile(ocPath(home), 'utf8'));
    expect(cfg.provider.anthropic.options.baseURL).toBe('https://api.deepseek.com/anthropic');
    expect(cfg.provider.anthropic.options.apiKey).toBe(FAKE_KEY);
    expect(cfg.model).toBe('anthropic/deepseek-chat');
  });
});

describe('setModelBinding — opencode', () => {
  test('rejects a model without a provider prefix', async () => {
    const home = await sandbox();
    await expect(setModelBinding('opencode', 'deepseek-chat', { home })).rejects.toThrow(
      /provider/,
    );
  });

  test('reads JSONC config and preserves unrelated keys', async () => {
    const home = await sandbox();
    await mkdir(path.dirname(ocPath(home)), { recursive: true });
    await writeFile(
      ocPath(home),
      `{
  // user's own comment
  "$schema": "https://opencode.ai/config.json",
  "theme": "tokyonight",
  "model": "anthropic/claude-sonnet-4-5",
}`,
      'utf8',
    );
    await setModelBinding('opencode', 'openai/gpt-5', { home });
    const cfg = JSON.parse(await readFile(ocPath(home), 'utf8'));
    expect(cfg.theme).toBe('tokyonight');
    expect(cfg.$schema).toBe('https://opencode.ai/config.json');
    expect(cfg.model).toBe('openai/gpt-5');
  });
});

describe('clearBinding — opencode', () => {
  test('removes clihub-* providers + model, keeps user keys', async () => {
    const home = await sandbox();
    await useBinding('deepseek', {
      cli: 'opencode',
      model: 'deepseek-chat',
      home,
      loader,
      keyLookup: async () => FAKE_KEY,
    });
    // user-owned key written after binding survives the clear
    const before = JSON.parse(await readFile(ocPath(home), 'utf8'));
    before.theme = 'tokyonight';
    await writeFile(ocPath(home), JSON.stringify(before), 'utf8');

    await clearBinding('opencode', { home, loader });
    const cfg = JSON.parse(await readFile(ocPath(home), 'utf8'));
    expect(cfg.provider).toBeUndefined();
    expect(cfg.model).toBeUndefined();
    expect(cfg.theme).toBe('tokyonight');
    expect(await readBindings({ home })).toEqual({});
  });
});

describe('OpencodeMcpAdapter', () => {
  test('stdio install → {type:"local", command:[exe,...args]}; round-trips', async () => {
    const home = await sandbox();
    const file = ocPath(home);
    const ad = new OpencodeMcpAdapter({ path: file });
    await ad.install({
      id: 'everything',
      name: 'everything',
      description: '',
      supports: {},
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everything'],
    });
    const cfg = JSON.parse(await readFile(file, 'utf8'));
    expect(cfg.mcp.everything).toEqual({
      type: 'local',
      command: ['npx', '-y', '@modelcontextprotocol/server-everything'],
    });

    const listed = await ad.list();
    expect(listed).toEqual([
      {
        id: 'everything',
        name: 'everything',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-everything'],
      },
    ]);

    await ad.uninstall('everything');
    const after = JSON.parse(await readFile(file, 'utf8'));
    expect(after.mcp).toEqual({});
  });

  test('http install → {type:"remote", url, headers}', async () => {
    const home = await sandbox();
    const file = ocPath(home);
    const ad = new OpencodeMcpAdapter({ path: file });
    await ad.install({
      id: 'remote-x',
      name: 'remote-x',
      description: '',
      supports: {},
      transport: 'http',
      url: 'https://mcp.example.com/mcp',
      headers: { Authorization: 'Bearer T' },
    });
    const cfg = JSON.parse(await readFile(file, 'utf8'));
    expect(cfg.mcp['remote-x']).toEqual({
      type: 'remote',
      url: 'https://mcp.example.com/mcp',
      headers: { Authorization: 'Bearer T' },
    });
  });

  test('reads JSONC (comments survive a list)', async () => {
    const home = await sandbox();
    const file = ocPath(home);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      `{
  "mcp": {
    // local helper
    "tooly": { "type": "local", "command": ["bunx", "tooly"], },
  },
}`,
      'utf8',
    );
    const ad = new OpencodeMcpAdapter({ path: file });
    expect(await ad.list()).toEqual([
      { id: 'tooly', name: 'tooly', command: 'bunx', args: ['tooly'] },
    ]);
  });
});
