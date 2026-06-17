import { test, expect } from 'bun:test';
import { mkdtempSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectUsage } from '../src/usage/index.js';

async function fakeHome(): Promise<string> {
  const home = mkdtempSync(path.join(tmpdir(), 'clihub-usage-'));
  const proj = path.join(home, '.claude', 'projects', 'proj-1');
  await fs.mkdir(proj, { recursive: true });
  const lines = [
    JSON.stringify({ type: 'user', message: { role: 'user' } }), // no usage → skipped
    JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 10 } } }),
    JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 50, output_tokens: 20, cache_creation_input_tokens: 5 } } }),
    'this is not json {{{', // defensive: must be skipped, not throw
  ].join('\n');
  await fs.writeFile(path.join(proj, 'session-a.jsonl'), lines, 'utf8');
  return home;
}

test('claude-code usage sums tokens from session jsonl (skips non-usage + bad lines)', async () => {
  const home = await fakeHome();
  const res = await collectUsage({ home });
  const cc = res.rows.find((r) => r.tool === 'claude-code')!;
  expect(cc.supported).toBe(true);
  expect(cc.inputTokens).toBe(150);
  expect(cc.outputTokens).toBe(60);
  expect(cc.cacheTokens).toBe(15);
  expect(cc.totalTokens).toBe(225);
  expect(cc.sessions).toBe(1);
  expect(res.totals.totalTokens).toBe(225);
});

test('other CLIs are reported unsupported, never fabricated', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'clihub-usage-empty-'));
  const res = await collectUsage({ home });
  const cc = res.rows.find((r) => r.tool === 'claude-code')!;
  expect(cc.supported).toBe(false); // no files → not supported, no fake number
  expect(cc.totalTokens).toBeUndefined();
  for (const tool of ['codex', 'gemini-cli', 'qwen-code', 'cursor', 'goose', 'kiro-cli', 'opencode']) {
    const r = res.rows.find((x) => x.tool === tool)!;
    expect(r.supported).toBe(false);
    expect(r.note).toBeTruthy();
  }
  expect(res.totals.totalTokens).toBe(0);
});
