import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { detectProjectSignals, recommend } from '../src/recommend/index.js';

test('detectProjectSignals maps files to tags', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'clihub-rec-'));
  writeFileSync(path.join(dir, 'package.json'), '{}');
  writeFileSync(path.join(dir, 'Dockerfile'), 'FROM node');
  mkdirSync(path.join(dir, '.git'));
  const sig = await detectProjectSignals(dir);
  expect(sig).toContain('frontend');
  expect(sig).toContain('docker');
  expect(sig).toContain('git');
});

test('detectProjectSignals on empty dir is empty', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'clihub-rec-'));
  expect(await detectProjectSignals(dir)).toEqual([]);
});

test('recommend returns actionable items with commands', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'clihub-rec-'));
  writeFileSync(path.join(dir, 'package.json'), '{}');
  const recs = await recommend({ cwd: dir });
  expect(Array.isArray(recs)).toBe(true);
  for (const r of recs) {
    expect(['preset', 'skill', 'mcp']).toContain(r.kind);
    expect(r.command.startsWith('clihub')).toBe(true);
    expect(r.reason.length).toBeGreaterThan(0);
  }
});
