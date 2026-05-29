import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { checkConformance } from '../src/conformance/index.js';

function seedCatalog(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'clihub-conf-'));
  const body = '{"skills":[]}\n';
  writeFileSync(path.join(dir, 'skills.json'), body);
  const sha = crypto.createHash('sha256').update(Buffer.from(body)).digest('hex');
  writeFileSync(
    path.join(dir, 'providers.json'),
    JSON.stringify({ version: 1, providers: [{ id: 'aider', name: 'Aider', bin: 'aider', install: { brew: 'aider' } }] }),
  );
  writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ source: 'https://example.com/', lastSync: 't', checksums: { 'skills.json': `sha256:${sha}` } }, null, 2),
  );
  return dir;
}

test('clean catalog is conformant (unsigned is a soft warning)', async () => {
  const dir = seedCatalog();
  const r = await checkConformance(dir);
  expect(r.conformant).toBe(true);
  expect(r.checks.some((c) => c.name === 'catalog signed')).toBe(true);
});

test('corrupt checksum fails conformance', async () => {
  const dir = seedCatalog();
  writeFileSync(path.join(dir, 'skills.json'), '{"skills":["evil"]}\n');
  const r = await checkConformance(dir);
  expect(r.conformant).toBe(false);
  expect(r.checks.find((c) => c.name.includes('checksums'))?.pass).toBe(false);
});

test('invalid provider spec fails conformance', async () => {
  const dir = seedCatalog();
  writeFileSync(path.join(dir, 'providers.json'), JSON.stringify({ version: 1, providers: [{ name: 'no-id' }] }));
  const r = await checkConformance(dir);
  expect(r.conformant).toBe(false);
});
