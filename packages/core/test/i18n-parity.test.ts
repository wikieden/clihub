import { test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dir, '../src/i18n/locales');

function leafKeys(obj: unknown, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object') return [prefix.slice(0, -1)];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    v && typeof v === 'object' ? leafKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

const load = (f: string) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
const locales = readdirSync(dir).filter((f) => f.endsWith('.json'));

test('en.json is the reference and is non-empty', () => {
  expect(locales).toContain('en.json');
  expect(leafKeys(load('en.json')).length).toBeGreaterThan(0);
});

test('every locale has the exact same key set as en (debt budget: 100% parity)', () => {
  const en = new Set(leafKeys(load('en.json')));
  for (const f of locales) {
    if (f === 'en.json') continue;
    const keys = new Set(leafKeys(load(f)));
    const missing = [...en].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !en.has(k));
    expect({ locale: f, missing, extra }).toEqual({ locale: f, missing: [], extra: [] });
  }
});

test('no locale has an empty string value', () => {
  for (const f of locales) {
    const flat = (o: unknown): string[] =>
      !o || typeof o !== 'object'
        ? [String(o)]
        : Object.values(o as Record<string, unknown>).flatMap(flat);
    expect(flat(load(f)).every((v) => v.trim().length > 0)).toBe(true);
  }
});
