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

/**
 * The global default clihub.yaml — used when no project-level file is found by
 * walking up from cwd. Honors `XDG_CONFIG_HOME`, else `~/.config/clihub/`.
 * This is where the GUI scaffolds a default config on first launch, so a
 * machine always has a config even when you launch outside any project.
 */
export function globalClihubYamlPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  const base = xdg ? xdg : path.join(os.homedir(), '.config');
  return path.join(base, 'clihub', 'clihub.yaml');
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the active clihub.yaml: walk up from `startDir` looking for a
 * project-level file, then fall back to the global default
 * (`~/.config/clihub/clihub.yaml`) if it exists. Returns an absolute path or
 * undefined when neither is present.
 */
export async function findClihubYaml(startDir: string = process.cwd()): Promise<string | undefined> {
  let dir = path.resolve(startDir);
  const home = os.homedir();
  for (;;) {
    for (const name of FILENAMES) {
      const candidate = path.join(dir, name);
      if (await pathExists(candidate)) return candidate;
    }
    if (dir === home) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // No project-level file — fall back to the global default if present.
  const global = globalClihubYamlPath();
  return (await pathExists(global)) ? global : undefined;
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
