/**
 * SkillSyncAdapter for Codex CLI. Codex auto-discovers Agent Skills under
 * `$CODEX_HOME/skills/<name>/` (defaults to `~/.codex/skills`), same layout as
 * Claude Code: a directory per skill containing `SKILL.md` (YAML frontmatter).
 * Earlier clihub wrote a flat `skills/<id>.md`, which Codex did not discover.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  InstalledSkill,
  SkillManifest,
  SkillSyncAdapter,
} from '../tools/types.js';
import { renderSkillMd } from './index.js';

export interface CodexSkillAdapterOpts {
  /** Override skills directory. Defaults to ~/.codex/skills. */
  skillsDir?: string;
}

export class CodexSkillAdapter implements SkillSyncAdapter {
  private readonly skillsDir: string;

  constructor(opts: CodexSkillAdapterOpts = {}) {
    this.skillsDir = opts.skillsDir ?? path.join(os.homedir(), '.codex', 'skills');
  }

  async install(skill: SkillManifest, source: string): Promise<void> {
    const dir = path.join(this.skillsDir, skill.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'SKILL.md'), renderSkillMd(skill, source), 'utf8');
    await fs.writeFile(
      path.join(dir, 'manifest.json'),
      JSON.stringify({ ...skill, source }, null, 2) + '\n',
      'utf8',
    );
    // Clean up the legacy flat file from older clihub versions.
    await fs.rm(path.join(this.skillsDir, `${skill.id}.md`), { force: true }).catch(() => {});
  }

  async uninstall(skillId: string): Promise<void> {
    await fs.rm(path.join(this.skillsDir, skillId), { recursive: true, force: true });
    await fs.rm(path.join(this.skillsDir, `${skillId}.md`), { force: true }).catch(() => {});
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
      let manifest: SkillManifest | undefined;
      try {
        manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')) as SkillManifest;
      } catch { /* no manifest */ }
      out.push({ id, name: manifest?.name ?? id, version: manifest?.version ?? 'unknown', path: dir });
    }
    return out;
  }
}
