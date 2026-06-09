import { test, expect } from 'bun:test';
import { redactBundle, REDACTED, type SyncBundle } from '../src/index.js';

function bundleWith(path: string, content: string): SyncBundle {
  return {
    version: 1,
    tool: 'clihub',
    clihub: '1.58.0',
    generatedAt: '2026-01-01T00:00:00.000Z',
    files: [{ path, encoding: 'utf8', content }],
  };
}

test('redacts secret-named keys, keeps innocuous ones', () => {
  const b = bundleWith(
    '.clihub/config.json',
    JSON.stringify({ baseURL: 'https://api.example.com', apiKey: 'plaintext-key', proxy: { token: 'abc123' } }),
  );
  const { bundle, redactions } = redactBundle(b);
  const out = bundle.files[0]!.content;
  expect(out).toContain('https://api.example.com'); // baseURL kept
  expect(out).toContain(REDACTED);
  expect(out).not.toContain('plaintext-key');
  expect(out).not.toContain('abc123');
  const keys = redactions.map((r) => r.key).sort();
  expect(keys).toContain('apiKey');
  expect(keys).toContain('proxy.token');
});

test('redacts known token shapes even under an innocuous key', () => {
  const b = bundleWith('.clihub/config.json', JSON.stringify({ note: 'remember sk-abcdefghij1234567890XYZ' }));
  const { bundle, redactions } = redactBundle(b);
  expect(bundle.files[0]!.content).not.toContain('sk-abcdefghij');
  expect(redactions.length).toBe(1);
});

test('clean bundle is unchanged and reports no redactions', () => {
  const b = bundleWith('.clihub/sources.json', JSON.stringify({ sources: ['https://example.com/catalog'] }));
  const { redactions } = redactBundle(b);
  expect(redactions).toHaveLength(0);
});

test('non-JSON file: inline token is redacted', () => {
  const b = bundleWith('.clihub/notes.txt', 'deploy key ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345 end');
  const { bundle, redactions } = redactBundle(b);
  expect(bundle.files[0]!.content).toContain(REDACTED);
  expect(bundle.files[0]!.content).not.toContain('ghp_ABCDEFGHIJ');
  expect(redactions).toHaveLength(1);
});
