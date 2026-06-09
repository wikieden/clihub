import { test, expect } from 'bun:test';
import path from 'node:path';
import {
  CatalogLoader,
  listEndpoints,
  findEndpoint,
  validateEndpointPreset,
  validateEndpointCatalog,
  type EndpointPreset,
} from '../src/index.js';

// Force the bundled catalog dir so the test is deterministic regardless of a
// machine-local ~/.clihub synced/federated catalog.
const BUNDLED = path.resolve(import.meta.dir, '../../catalog');
const loader = (): CatalogLoader => new CatalogLoader({ dir: BUNDLED });

test('bundled catalog ships verified endpoint presets', async () => {
  const eps = await listEndpoints(loader());
  expect(eps.length).toBeGreaterThanOrEqual(7);
  const ids = eps.map((e) => e.id);
  expect(ids).toContain('anthropic');
  expect(ids).toContain('openai');
  expect(ids).toContain('google');
});

test('findEndpoint resolves by id with a real baseURL', async () => {
  const a = await findEndpoint('anthropic', loader());
  expect(a?.baseURL).toBe('https://api.anthropic.com');
  expect(a?.family).toBe('anthropic');
  expect(a?.authEnv).toBe('ANTHROPIC_API_KEY');
});

test('every shipped preset passes conformance (no inline secrets, real URL)', async () => {
  const failures = await validateEndpointCatalog(loader());
  expect(failures).toEqual({});
});

test('validateEndpointPreset rejects an inline secret', () => {
  const bad: EndpointPreset = { id: 'x', label: 'X', family: 'openai', baseURL: 'https://api.x.com', authEnv: 'sk-abcdefghij1234567890' };
  const errs = validateEndpointPreset(bad);
  expect(errs.some((e) => e.includes('env-var NAME') || e.includes('inline secret'))).toBe(true);
});

test('validateEndpointPreset rejects a bad baseURL and bad family', () => {
  const bad = { id: 'y', label: 'Y', family: 'bogus', baseURL: 'not-a-url' } as unknown as EndpointPreset;
  const errs = validateEndpointPreset(bad);
  expect(errs.some((e) => e.includes('baseURL'))).toBe(true);
  expect(errs.some((e) => e.includes('family'))).toBe(true);
});

test('validateEndpointPreset accepts a clean preset', () => {
  const ok: EndpointPreset = { id: 'z', label: 'Z', family: 'openai', baseURL: 'https://api.z.com/v1', authEnv: 'Z_API_KEY' };
  expect(validateEndpointPreset(ok)).toHaveLength(0);
});
