import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  InstalledSkill,
  SkillManifest,
  SkillSyncAdapter,
} from '../tools/types.js';

export interface AntigravitySkillAdapterOpts {
  skillsDir?: string;
}

/**
 * Antigravity CLI (`agy`) skills. Global skills live in
 * ~/.gemini/antigravity-cli/skills/ as one directory per skill containing a
 * SKILL.md (the agentic-skill convention Antigravity shares with its peers).
 */
export class AntigravitySkillAdapter implements SkillSyncAdapter {
  private readonly skillsDir: string;

  constructor(opts: AntigravitySkillAdapterOpts = {}) {
    this.skillsDir = opts.skillsDir ?? path.join(os.homedir(), '.gemini', 'antigravity-cli', 'skills');
  }

  async install(skill: SkillManifest, source: string): Promise<void> {
    const dir = path.join(this.skillsDir, skill.id);
    await fs.mkdir(dir, { recursive: true });
    const front = [
      '---',
      `name: ${skill.id}`,
      `description: ${(skill.description ?? skill.name).replace(/[\r\n]+/g, ' ').trim()}`,
      '---',
      '',
      `# ${skill.name}`,
      '',
      skill.description ?? '',
      '',
      `<!-- Installed by clihub from ${source}. -->`,
      '',
    ].join('\n');
    await fs.writeFile(path.join(dir, 'SKILL.md'), front, 'utf8');
  }

  async uninstall(skillId: string): Promise<void> {
    await fs.rm(path.join(this.skillsDir, skillId), { recursive: true, force: true });
  }

  async list(): Promise<InstalledSkill[]> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const out: InstalledSkill[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const skillMd = path.join(this.skillsDir, e.name, 'SKILL.md');
      try {
        await fs.access(skillMd);
        out.push({ id: e.name, name: e.name, version: 'unknown', path: skillMd });
      } catch {
        /* a dir without SKILL.md isn't ours */
      }
    }
    return out;
  }
}
