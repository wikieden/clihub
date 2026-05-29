/**
 * `clihub.yaml` minimal detector + parser.
 *
 * v0.5.3 ships only what the auto-switch hook needs: the top-level
 * `profile:` (and `version:`) field. The full schema described in
 * `docs/19-CLIHUBYAML.md` lands in v0.6 alongside `clihub apply` /
 * `clihub install --frozen`. We use a tiny regex pass here instead of
 * pulling in a full YAML parser.
 *
 * The walk-up search stops at the user's home dir or at any filesystem
 * boundary (when `path.dirname(d) === d`).
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface ClihubYamlMeta {
  filePath: string;
  profile?: string;
  version?: number;
  raw: Record<string, string>;
}

const FILENAMES = ['clihub.yaml', 'clihub.yml'] as const;

/** Walk up from `startDir` looking for clihub.yaml; returns absolute path or undefined. */
export async function findClihubYaml(startDir: string = process.cwd()): Promise<string | undefined> {
  let dir = path.resolve(startDir);
  const home = os.homedir();
  while (true) {
    for (const name of FILENAMES) {
      const candidate = path.join(dir, name);
      try {
        await fs.access(candidate);
        return candidate;
      } catch { /* keep walking */ }
    }
    if (dir === home) return undefined;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Tiny top-level YAML scalar reader. Ignores nested mappings + lists. */
export function parseTopLevelYaml(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '');
    if (/^\s/.test(line)) continue;          // indented → nested, skip
    const m = line.match(/^([\w.-]+)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const value = stripQuotes(m[2]!.trim());
    out[m[1]!] = value;
  }
  return out;
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

export async function loadClihubYaml(startDir?: string): Promise<ClihubYamlMeta | undefined> {
  const file = await findClihubYaml(startDir);
  if (!file) return undefined;
  const text = await fs.readFile(file, 'utf8');
  const raw = parseTopLevelYaml(text);
  const versionStr = raw.version;
  const version = versionStr ? Number(versionStr) : undefined;
  return {
    filePath: file,
    profile: raw.profile,
    version: Number.isFinite(version) ? version : undefined,
    raw,
  };
}
