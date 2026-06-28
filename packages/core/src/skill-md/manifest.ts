/**
 * Convert an agentskills.io-style SKILL.md (or directory containing one)
 * into a clihub `SkillManifest` the per-CLI adapters can install.
 *
 * Two entry points:
 *   · `manifestFromSkillMd(filePath)` — read a single SKILL.md, return
 *     a manifest pointed at its parent directory.
 *   · `discoverSkillMdRepo(repoDir)` — scan a cloned skill repo for the
 *     SKILL.md it ships and return the same manifest. The repo can put
 *     SKILL.md at the root, under `.claude/skills/<id>/`, or under
 *     `skills/<id>/` — we look in those locations in order.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SkillManifest, Supports } from '../types.js';
import { parseSkillMd } from './parser.js';

export interface SkillMdLocation {
  /** Absolute path to the SKILL.md file. */
  file: string;
  /** Absolute path to the directory containing SKILL.md (= the skill root). */
  dir: string;
}

/**
 * Look up a SKILL.md inside `repoDir`. Returns the first match.
 * `null` if none found.
 */
export async function findSkillMd(repoDir: string): Promise<SkillMdLocation | null> {
  for (const name of ['SKILL.md', 'skill.md']) {
    const direct = path.join(repoDir, name);
    if (await exists(direct)) return { file: direct, dir: repoDir };
  }
  for (const container of ['skills', 'claude/skills', '.claude/skills']) {
    const containerDir = path.join(repoDir, container);
    if (!(await exists(containerDir))) continue;
    const entries = await fs.readdir(containerDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(containerDir, entry.name, 'SKILL.md');
      if (await exists(candidate)) {
        return { file: candidate, dir: path.dirname(candidate) };
      }
    }
  }
  return null;
}

/**
 * Read a single SKILL.md and synthesise a `SkillManifest`. The `id`
 * defaults to the parent directory name; pass `overrides.id` to force
 * a different one.
 *
 * `supports` is inferred from agentskills.io's neutrality: SKILL.md is
 * intended to be vendor-agnostic, so by default we mark every known CLI
 * supported and let the per-CLI adapter no-op if it can't honour the
 * skill.
 */
export async function manifestFromSkillMd(
  filePath: string,
  overrides: Partial<SkillManifest> = {},
): Promise<SkillManifest> {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = parseSkillMd(raw);
  const fm = parsed.frontmatter;

  const inferredId =
    typeof fm.name === 'string' ? slugify(fm.name) : slugify(path.basename(path.dirname(filePath)));

  const supports: Supports = {
    'claude-code': true,
    codex: true,
    'kiro-cli': true,
    'antigravity': true,
  };

  const tags = asStringArray(fm.tags) ?? asStringArray(fm['allowed-tools']) ?? [];

  return {
    id: overrides.id ?? inferredId,
    name: asString(fm.name) ?? inferredId,
    description: asString(fm.description) ?? parsed.body.split('\n')[0]?.slice(0, 200) ?? '',
    version: asString(fm.version) ?? 'latest',
    supports,
    source: overrides.source ?? path.dirname(filePath),
    tags,
    ...overrides,
  };
}

/**
 * Convenience: locate SKILL.md inside `repoDir` and return both the
 * synthesised manifest and the on-disk location.
 */
export async function discoverSkillMdRepo(
  repoDir: string,
  overrides: Partial<SkillManifest> = {},
): Promise<{ manifest: SkillManifest; location: SkillMdLocation } | null> {
  const loc = await findSkillMd(repoDir);
  if (!loc) return null;
  const manifest = await manifestFromSkillMd(loc.file, {
    source: loc.dir,
    ...overrides,
  });
  return { manifest, location: loc };
}

function asString(v: string | string[] | undefined): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.join(', ');
  return undefined;
}

function asStringArray(v: string | string[] | undefined): string[] | undefined {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.length > 0) return v.split(',').map((s) => s.trim()).filter(Boolean);
  return undefined;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
