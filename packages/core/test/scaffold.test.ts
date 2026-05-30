import { test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scaffoldFiles, writeScaffold } from '../src/scaffold/index.js';

test('scaffoldFiles has the expected starter files', () => {
  const files = scaffoldFiles();
  expect(Object.keys(files)).toContain('.editorconfig');
  expect(Object.keys(files)).toContain('.gitignore');
  expect(Object.keys(files)).toContain('.github/workflows/clihub.yml');
  expect(files['.editorconfig']).toContain('root = true');
  expect(files['.github/workflows/clihub.yml']).toContain('clihub apply --plan');
  // does NOT manage agent memory files
  expect(Object.keys(files)).not.toContain('AGENTS.md');
  expect(Object.keys(files)).not.toContain('CLAUDE.md');
});

test('writeScaffold writes new files and never overwrites', async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'clihub-scaffold-'));
  writeFileSync(path.join(cwd, '.gitignore'), 'KEEP\n');

  const res = await writeScaffold(cwd);
  expect(res.written).toContain('.editorconfig');
  expect(res.written).toContain('.github/workflows/clihub.yml');
  expect(res.skipped).toContain('.gitignore');

  // existing file preserved
  expect(readFileSync(path.join(cwd, '.gitignore'), 'utf8')).toBe('KEEP\n');
  // nested CI file created
  expect(existsSync(path.join(cwd, '.github', 'workflows', 'clihub.yml'))).toBe(true);
});
