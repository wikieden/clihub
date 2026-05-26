import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  InstalledSkill,
  SkillManifest,
  SkillSyncAdapter,
} from '../tools/types.js';

export interface GeminiSkillAdapterOpts {
  commandsDir?: string;
  geminiMd?: string;
}

export class GeminiCliSkillAdapter implements SkillSyncAdapter {
  private readonly commandsDir: string;
  private readonly geminiMd: string;

  constructor(opts: GeminiSkillAdapterOpts = {}) {
    const base = path.join(os.homedir(), '.gemini');
    this.commandsDir = opts.commandsDir ?? path.join(base, 'commands');
    this.geminiMd = opts.geminiMd ?? path.join(base, 'GEMINI.md');
  }

  async install(skill: SkillManifest, source: string): Promise<void> {
    await fs.mkdir(this.commandsDir, { recursive: true });
    const body = renderCommandMd(skill, source);
    await fs.writeFile(
      path.join(this.commandsDir, `${skill.id}.md`),
      body,
      'utf8',
    );
    await appendGeminiRef(this.geminiMd, skill);
  }

  async uninstall(skillId: string): Promise<void> {
    await fs.rm(path.join(this.commandsDir, `${skillId}.md`), { force: true });
    await removeGeminiRef(this.geminiMd, skillId);
  }

  async list(): Promise<InstalledSkill[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.commandsDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    return entries
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const id = f.replace(/\.md$/, '');
        return { id, name: id, version: 'unknown', path: path.join(this.commandsDir, f) };
      });
  }
}

function renderCommandMd(skill: SkillManifest, source: string): string {
  return `# ${skill.name}\n\n${skill.description}\n\nInstalled by clihub from ${source}.\n`;
}

async function appendGeminiRef(geminiMd: string, skill: SkillManifest): Promise<void> {
  const line = `\n<!-- clihub:skill:${skill.id} -->\n`;
  let existing = '';
  try {
    existing = await fs.readFile(geminiMd, 'utf8');
  } catch {
    // file may not exist yet
  }
  if (existing.includes(`clihub:skill:${skill.id}`)) return;
  await fs.appendFile(geminiMd, line, 'utf8');
}

async function removeGeminiRef(geminiMd: string, skillId: string): Promise<void> {
  let content: string;
  try {
    content = await fs.readFile(geminiMd, 'utf8');
  } catch {
    return;
  }
  const tag = `<!-- clihub:skill:${skillId} -->`;
  const updated = content
    .split('\n')
    .filter((line) => !line.includes(tag))
    .join('\n');
  await fs.writeFile(geminiMd, updated, 'utf8');
}
