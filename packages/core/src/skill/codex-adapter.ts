import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  InstalledSkill,
  SkillManifest,
  SkillSyncAdapter,
} from '../tools/types.js';

export interface CodexSkillAdapterOpts {
  promptsDir?: string;
  agentsFile?: string;
}

export class CodexSkillAdapter implements SkillSyncAdapter {
  private readonly promptsDir: string;
  private readonly agentsFile: string;

  constructor(opts: CodexSkillAdapterOpts = {}) {
    const base = path.join(os.homedir(), '.codex');
    this.promptsDir = opts.promptsDir ?? path.join(base, 'skills');
    this.agentsFile = opts.agentsFile ?? path.join(base, 'AGENTS.md');
  }

  async install(skill: SkillManifest, source: string): Promise<void> {
    await fs.mkdir(this.promptsDir, { recursive: true });
    const body = renderPromptMd(skill, source);
    await fs.writeFile(path.join(this.promptsDir, `${skill.id}.md`), body, 'utf8');
    await appendAgentsRef(this.agentsFile, skill);
  }

  async uninstall(skillId: string): Promise<void> {
    await fs.rm(path.join(this.promptsDir, `${skillId}.md`), { force: true });
    await removeAgentsRef(this.agentsFile, skillId);
  }

  async list(): Promise<InstalledSkill[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.promptsDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    return entries
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const id = f.replace(/\.md$/, '');
        return { id, name: id, version: 'unknown', path: path.join(this.promptsDir, f) };
      });
  }
}

function renderPromptMd(skill: SkillManifest, source: string): string {
  return `# ${skill.name}\n\n${skill.description}\n\nInstalled by clihub from ${source}.\n`;
}

async function appendAgentsRef(agentsFile: string, skill: SkillManifest): Promise<void> {
  const line = `\n<!-- clihub:skill:${skill.id} -->\n`;
  let existing = '';
  try {
    existing = await fs.readFile(agentsFile, 'utf8');
  } catch {
    // file may not exist yet
  }
  if (existing.includes(`clihub:skill:${skill.id}`)) return;
  await fs.appendFile(agentsFile, line, 'utf8');
}

async function removeAgentsRef(agentsFile: string, skillId: string): Promise<void> {
  let content: string;
  try {
    content = await fs.readFile(agentsFile, 'utf8');
  } catch {
    return;
  }
  const tag = `<!-- clihub:skill:${skillId} -->`;
  const updated = content
    .split('\n')
    .filter((line) => !line.includes(tag))
    .join('\n');
  await fs.writeFile(agentsFile, updated, 'utf8');
}
