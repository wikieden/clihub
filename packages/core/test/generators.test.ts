import { test, expect } from 'bun:test';
import { clihubYamlSchemaJson } from '../src/schema/index.js';
import { packManifest } from '../src/pack/index.js';
import { ciWorkflow } from '../src/ci/index.js';

test('schema: valid draft-07 JSON with expected props', () => {
  const j = JSON.parse(clihubYamlSchemaJson());
  expect(j.$schema).toContain('json-schema.org');
  const props = Object.keys(j.properties);
  for (const k of ['version', 'tools', 'skills', 'presets', 'mcp', 'plugins', 'proxy']) {
    expect(props).toContain(k);
  }
});

test('pack docker pins the version', () => {
  expect(packManifest('docker', { version: '1.0.0' })).toContain('npm install -g @wikieden/clihub@1.0.0');
});

test('pack scoop is valid JSON', () => {
  const j = JSON.parse(packManifest('scoop', { version: '1.0.0' }));
  expect(j.version).toBe('1.0.0');
  expect(j.bin).toBe('clihub');
});

test('ci github + gitlab validate clihub.yaml', () => {
  expect(ciWorkflow('github')).toContain('clihub apply --plan');
  expect(ciWorkflow('gitlab', { nodeVersion: '22' })).toContain('node:22');
});
