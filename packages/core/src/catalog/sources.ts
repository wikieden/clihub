/**
 * Multi-source catalog federation (Pillar III).
 *
 * A registry of named catalog sources lives at `~/.clihub/sources.json`.
 * Each source is synced into `~/.clihub/catalog-sources/<name>/` (reuses
 * the single-source `syncCatalog`). When more than one source is
 * configured, `CatalogLoader` merges them by ascending priority —
 * higher priority wins on id conflicts — so a private team source can
 * override the public default.
 *
 * The bundled / single `~/.clihub/catalog/` path still works for users
 * who never call `catalog add`; sources are purely additive.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CATALOG_URL, syncCatalog, type SyncResult } from './sync.js';
import { createError } from '../errors/index.js';

const NAME_RE = /^[a-z][a-z0-9-]{0,30}$/;

export interface CatalogSource {
  name: string;
  url: string;
  /** Higher wins on id conflict. Default source is 0. */
  priority: number;
  /** ISO 8601 UTC. */
  addedAt: string;
}

export interface SourcesFile {
  version: 1;
  sources: CatalogSource[];
}

export interface SourcesIoOpts {
  /** Override the sources.json path (tests). */
  path?: string;
  /** Override the per-source catalog root (tests). */
  root?: string;
}

export function defaultSourcesPath(): string {
  return path.join(os.homedir(), '.clihub', 'sources.json');
}

export function catalogSourcesRoot(): string {
  return path.join(os.homedir(), '.clihub', 'catalog-sources');
}

export function sourceDir(name: string, opts: SourcesIoOpts = {}): string {
  return path.join(opts.root ?? catalogSourcesRoot(), name);
}

function isoNow(): string {
  return new Date().toISOString();
}

export async function readSources(opts: SourcesIoOpts = {}): Promise<SourcesFile> {
  const file = opts.path ?? defaultSourcesPath();
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as SourcesFile;
    if (!Array.isArray(parsed.sources)) return { version: 1, sources: [] };
    return { version: 1, sources: parsed.sources };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, sources: [] };
    throw err;
  }
}

async function writeSources(data: SourcesFile, opts: SourcesIoOpts = {}): Promise<void> {
  const file = opts.path ?? defaultSourcesPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, file);
}

/** Add (or update) a named source and sync it immediately. */
export async function addCatalogSource(
  name: string,
  url: string,
  opts: SourcesIoOpts & { priority?: number } = {},
): Promise<{ source: CatalogSource; sync: SyncResult }> {
  if (!NAME_RE.test(name)) throw createError('CLIHUB-E-300', name);
  const data = await readSources(opts);
  const existing = data.sources.find((s) => s.name === name);
  const priority = opts.priority ?? existing?.priority ?? (name === 'default' ? 0 : 10);
  const source: CatalogSource = {
    name,
    url: url.endsWith('/') ? url : url + '/',
    priority,
    addedAt: existing?.addedAt ?? isoNow(),
  };
  data.sources = [...data.sources.filter((s) => s.name !== name), source];
  await writeSources(data, opts);
  const sync = await syncCatalog({ url: source.url, dir: sourceDir(name, opts) });
  return { source, sync };
}

export async function removeCatalogSource(name: string, opts: SourcesIoOpts = {}): Promise<void> {
  const data = await readSources(opts);
  if (!data.sources.some((s) => s.name === name)) throw createError('CLIHUB-E-301', name);
  data.sources = data.sources.filter((s) => s.name !== name);
  await writeSources(data, opts);
  await fs.rm(sourceDir(name, opts), { recursive: true, force: true });
}

export async function setSourcePriority(name: string, priority: number, opts: SourcesIoOpts = {}): Promise<void> {
  const data = await readSources(opts);
  const src = data.sources.find((s) => s.name === name);
  if (!src) throw createError('CLIHUB-E-301', name);
  src.priority = priority;
  await writeSources(data, opts);
}

/** Re-sync every configured source. Returns per-source results. */
export async function syncAllSources(
  opts: SourcesIoOpts = {},
): Promise<Array<{ name: string; ok: boolean; detail?: string }>> {
  const data = await readSources(opts);
  const out: Array<{ name: string; ok: boolean; detail?: string }> = [];
  for (const src of data.sources) {
    try {
      await syncCatalog({ url: src.url, dir: sourceDir(src.name, opts) });
      out.push({ name: src.name, ok: true });
    } catch (e) {
      out.push({ name: src.name, ok: false, detail: String(e) });
    }
  }
  return out;
}

/**
 * Ordered list of synced source directories, lowest-priority first
 * (so a caller can merge by overwriting as it goes — last wins).
 * Returns `[]` when no sources are configured (caller falls back to the
 * single ~/.clihub/catalog or bundled).
 */
export async function orderedSourceDirs(opts: SourcesIoOpts = {}): Promise<Array<{ name: string; dir: string }>> {
  const data = await readSources(opts);
  return [...data.sources]
    .sort((a, b) => a.priority - b.priority)
    .map((s) => ({ name: s.name, dir: sourceDir(s.name, opts) }));
}

export { DEFAULT_CATALOG_URL };
