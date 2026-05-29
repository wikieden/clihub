/**
 * `clihub diff` (v1.12.0, quality of life).
 *
 * Diff two `clihub.lock.json` files (or a lock vs a previous one): what
 * tools / skills / MCP / plugins were added, removed, upgraded, or
 * downgraded. Pure + read-only.
 */
import type { Lockfile } from '../apply/index.js';

export type ChangeKind = 'added' | 'removed' | 'upgraded' | 'downgraded' | 'changed';

export interface DiffEntry {
  id: string;
  kind: ChangeKind;
  from?: string;
  to?: string;
}

export interface LockDiff {
  tools: DiffEntry[];
  skills: DiffEntry[];
  mcp: DiffEntry[];
  plugins: DiffEntry[];
  /** Total number of changed entries across all sections. */
  changed: number;
}

/** Compare two version strings numerically where possible. -1 / 0 / 1. */
export function compareVersions(a: string, b: string): number {
  if (a === b) return 0;
  const pa = a.split('.');
  const pb = b.split('.');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = Number(pa[i]);
    const nb = Number(pb[i]);
    const bothNum = !Number.isNaN(na) && !Number.isNaN(nb);
    if (bothNum) {
      if (na !== nb) return na < nb ? -1 : 1;
    } else {
      const sa = pa[i] ?? '';
      const sb = pb[i] ?? '';
      if (sa !== sb) return sa < sb ? -1 : 1;
    }
  }
  return 0;
}

function diffVersionMaps(a: Record<string, string>, b: Record<string, string>): DiffEntry[] {
  const out: DiffEntry[] = [];
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of [...ids].sort()) {
    const va = a[id];
    const vb = b[id];
    if (va === undefined && vb !== undefined) { out.push({ id, kind: 'added', to: vb }); continue; }
    if (va !== undefined && vb === undefined) { out.push({ id, kind: 'removed', from: va }); continue; }
    if (va === vb) continue;
    const cmp = compareVersions(va!, vb!);
    out.push({ id, kind: cmp < 0 ? 'upgraded' : cmp > 0 ? 'downgraded' : 'changed', from: va, to: vb });
  }
  return out;
}

function diffPresence(a: string[], b: string[]): DiffEntry[] {
  const sa = new Set(a);
  const sb = new Set(b);
  const out: DiffEntry[] = [];
  for (const id of [...new Set([...a, ...b])].sort()) {
    if (!sa.has(id) && sb.has(id)) out.push({ id, kind: 'added' });
    else if (sa.has(id) && !sb.has(id)) out.push({ id, kind: 'removed' });
  }
  return out;
}

export function diffLockfiles(a: Lockfile, b: Lockfile): LockDiff {
  const toolVers = (l: Lockfile) =>
    Object.fromEntries(Object.entries(l.tools).map(([id, t]) => [id, t.version]));
  const tools = diffVersionMaps(toolVers(a), toolVers(b));
  const skills = diffPresence(Object.keys(a.skills), Object.keys(b.skills));
  const mcp = diffPresence(Object.keys(a.mcp), Object.keys(b.mcp));
  const plugins = diffPresence(Object.keys(a.plugins), Object.keys(b.plugins));
  return { tools, skills, mcp, plugins, changed: tools.length + skills.length + mcp.length + plugins.length };
}
