import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  InstalledSkill,
  SkillManifest,
  SkillSyncAdapter,
} from '../tools/types.js';

export interface KiroSkillAdapterOpts {
  steeringDir?: string;
}

export class KiroCliSkillAdapter implements SkillSyncAdapter {
  private readonly steeringDir: string;

  constructor(opts: KiroSkillAdapterOpts = {}) {
    this.steeringDir =
      opts.steeringDir ?? path.join(os.homedir(), '.kiro', 'steering');
  }

  async install(skill: SkillManifest, source: string): Promise<void> {
    await fs.mkdir(this.steeringDir, { recursive: true });
    const body = renderSteeringMd(skill, source);
    await fs.writeFile(
      path.join(this.steeringDir, `clihub-${skill.id}.md`),
      body,
      'utf8',
    );
  }

  async uninstall(skillId: string): Promise<void> {
    await fs.rm(
      path.join(this.steeringDir, `clihub-${skillId}.md`),
      { force: true },
    );
  }

  async list(): Promise<InstalledSkill[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.steeringDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    return entries
      .filter((f) => f.startsWith('clihub-') && f.endsWith('.md'))
      .map((f) => {
        const id = f.replace(/^clihub-/, '').replace(/\.md$/, '');
        return { id, name: id, version: 'unknown', path: path.join(this.steeringDir, f) };
      });
  }
}

function renderSteeringMd(skill: SkillManifest, source: string): string {
  return `---
inclusion: manual
---

# ${skill.name}

${skill.description}

Installed by clihub from ${source}.
`;
}
