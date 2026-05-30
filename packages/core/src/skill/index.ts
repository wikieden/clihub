/**
 * SkillSyncAdapter implementation for Claude Code. Skills live at
 * `~/.claude/skills/<skillId>/SKILL.md`.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  InstalledSkill,
  SkillManifest,
  SkillSyncAdapter,
} from '../tools/types.js';

export interface ClaudeSkillAdapterOpts {
  /** Override skills directory. Defaults to ~/.claude/skills. */
  skillsDir?: string;
}

export class ClaudeCodeSkillAdapter implements SkillSyncAdapter {
  private readonly skillsDir: string;

  constructor(opts: ClaudeSkillAdapterOpts = {}) {
    this.skillsDir =
      opts.skillsDir ?? path.join(os.homedir(), '.claude', 'skills');
  }

  async install(skill: SkillManifest, source: string): Promise<void> {
    const dir = path.join(this.skillsDir, skill.id);
    await fs.mkdir(dir, { recursive: true });
    const body = renderSkillMd(skill, source);
    await fs.writeFile(path.join(dir, 'SKILL.md'), body, 'utf8');
    await fs.writeFile(
      path.join(dir, 'manifest.json'),
      JSON.stringify({ ...skill, source }, null, 2) + '\n',
      'utf8',
    );
  }

  async uninstall(skillId: string): Promise<void> {
    const dir = path.join(this.skillsDir, skillId);
    await fs.rm(dir, { recursive: true, force: true });
  }

  async list(): Promise<InstalledSkill[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.skillsDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const out: InstalledSkill[] = [];
    for (const id of entries) {
      const dir = path.join(this.skillsDir, id);
      const stat = await fs.stat(dir).catch(() => null);
      if (!stat?.isDirectory()) continue;
      const manifest = await readManifest(dir);
      out.push({
        id,
        name: manifest?.name ?? id,
        version: manifest?.version ?? 'unknown',
        path: dir,
      });
    }
    return out;
  }
}

async function readManifest(
  dir: string,
): Promise<SkillManifest | undefined> {
  try {
    const raw = await fs.readFile(path.join(dir, 'manifest.json'), 'utf8');
    return JSON.parse(raw) as SkillManifest;
  } catch {
    return undefined;
  }
}

/** Render an Agent-Skills `SKILL.md` (YAML frontmatter + body). Shared by the
 *  Claude Code and Codex adapters — both auto-discover `<dir>/<id>/SKILL.md`. */
export function renderSkillMd(skill: SkillManifest, source: string): string {
  return `---
name: ${skill.id}
description: ${escapeYaml(skill.description)}
metadata:
  version: ${skill.version}
  source: ${escapeYaml(source)}
  tags: [${skill.tags.join(', ')}]
---

# ${skill.name}

${skill.description}

Installed by clihub from ${source}.
`;
}

function escapeYaml(s: string): string {
  if (/[:#\n]/.test(s)) return JSON.stringify(s);
  return s;
}
