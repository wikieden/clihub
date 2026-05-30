import { test, expect } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  snapshotBeforeWrite,
  listSettingsBackups,
  restoreLatestSettings,
  backupKey,
} from '../src/settings/backup.js';

function fixture(): { file: string; root: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'clihub-sb-'));
  return { file: path.join(dir, 'settings.json'), root: path.join(dir, 'backups') };
}

test('snapshotBeforeWrite: OFF by default (opt-in) — no snapshot without enable', async () => {
  const { file, root } = fixture();
  await fs.writeFile(file, '{"a":1}', 'utf8');
  const res = await snapshotBeforeWrite(file, '{"a":2}', { root }); // no enabled flag
  expect(res).toBeNull();
  expect(await listSettingsBackups(file, { root })).toHaveLength(0);
});

test('snapshotBeforeWrite: no-op when file is absent', async () => {
  const { file, root } = fixture();
  const res = await snapshotBeforeWrite(file, '{"a":1}', { root, enabled: true });
  expect(res).toBeNull();
  expect(await listSettingsBackups(file, { root })).toHaveLength(0);
});

test('snapshotBeforeWrite: no-op when content unchanged', async () => {
  const { file, root } = fixture();
  await fs.writeFile(file, '{"a":1}', 'utf8');
  const res = await snapshotBeforeWrite(file, '{"a":1}', { root, enabled: true });
  expect(res).toBeNull();
});

test('snapshotBeforeWrite: snapshots the OLD content when changed', async () => {
  const { file, root } = fixture();
  await fs.writeFile(file, '{"a":1}', 'utf8');
  const snap = await snapshotBeforeWrite(file, '{"a":2}', { root, enabled: true, now: new Date(2026, 4, 30, 10, 0, 0) });
  expect(snap).not.toBeNull();
  const list = await listSettingsBackups(file, { root });
  expect(list).toHaveLength(1);
  expect(await fs.readFile(list[0]!.path, 'utf8')).toBe('{"a":1}'); // old, not new
});

test('CLIHUB_NO_BACKUP forces off even when enabled would be on', async () => {
  const { file, root } = fixture();
  await fs.writeFile(file, '{"a":1}', 'utf8');
  process.env.CLIHUB_NO_BACKUP = '1';
  try {
    // env hard-off only wins when enabled is not explicitly set
    const res = await snapshotBeforeWrite(file, '{"a":2}', { root });
    expect(res).toBeNull();
  } finally {
    delete process.env.CLIHUB_NO_BACKUP;
  }
});

test('CLIHUB_BACKUP=1 turns it on', async () => {
  const { file, root } = fixture();
  await fs.writeFile(file, '{"a":1}', 'utf8');
  process.env.CLIHUB_BACKUP = '1';
  try {
    const res = await snapshotBeforeWrite(file, '{"a":2}', { root });
    expect(res).not.toBeNull();
  } finally {
    delete process.env.CLIHUB_BACKUP;
  }
});

test('restoreLatestSettings: rolls back to prior content and is itself undoable', async () => {
  const { file, root } = fixture();
  await fs.writeFile(file, 'v1', 'utf8');
  await snapshotBeforeWrite(file, 'v2', { root, enabled: true, now: new Date(2026, 4, 30, 10, 0, 0) });
  await fs.writeFile(file, 'v2', 'utf8');

  const restored = await restoreLatestSettings(file, { root, now: new Date(2026, 4, 30, 10, 0, 5) });
  expect(restored).not.toBeNull();
  expect(await fs.readFile(file, 'utf8')).toBe('v1'); // rolled back

  // restore snapshotted the current (v2) before clobbering → both v1 and v2 are on disk
  const list = await listSettingsBackups(file, { root });
  expect(list).toHaveLength(2);
  const contents = await Promise.all(list.map((e) => fs.readFile(e.path, 'utf8')));
  expect(contents).toContain('v2');
  expect(contents).toContain('v1');
});

test('restoreLatestSettings: null when no backups exist', async () => {
  const { file, root } = fixture();
  await fs.writeFile(file, 'v1', 'utf8');
  expect(await restoreLatestSettings(file, { root })).toBeNull();
});

test('prune keeps only the most recent N', async () => {
  const { file, root } = fixture();
  for (let i = 0; i < 5; i++) {
    await fs.writeFile(file, `v${i}`, 'utf8');
    await snapshotBeforeWrite(file, `v${i + 1}`, { root, enabled: true, keep: 2, now: new Date(2026, 4, 30, 10, 0, i) });
  }
  const list = await listSettingsBackups(file, { root });
  expect(list).toHaveLength(2);
});

test('backupKey: distinct keys for same basename in different dirs', () => {
  expect(backupKey('/a/config.json')).not.toBe(backupKey('/b/config.json'));
});
