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
    // Gemini CLI custom commands MUST be TOML with a `prompt` field; a .md file
    // in ~/.gemini/commands/ is silently ignored. (gemini docs: custom-commands)
    const body = renderCommandToml(skill, source);
    await fs.writeFile(
      path.join(this.commandsDir, `${skill.id}.toml`),
      body,
      'utf8',
    );
    await appendGeminiRef(this.geminiMd, skill);
  }

  async uninstall(skillId: string): Promise<void> {
    await fs.rm(path.join(this.commandsDir, `${skillId}.toml`), { force: true });
    // Clean up any legacy .md written by older clihub versions.
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
      .filter((f) => f.endsWith('.toml'))
      .map((f) => {
        const id = f.replace(/\.toml$/, '');
        return { id, name: id, version: 'unknown', path: path.join(this.commandsDir, f) };
      });
  }
}

/**
 * Render a Gemini CLI custom-command TOML file. `prompt` is what gets sent to
 * the model when the user runs `/<id>`. Uses a TOML multiline *literal* string
 * ('''…''') so skill content needs no backslash/quote escaping.
 */
function renderCommandToml(skill: SkillManifest, source: string): string {
  const desc = (skill.description ?? skill.name)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, ' ')
    .trim();
  const prompt = `${skill.name}\n\n${skill.description ?? ''}\n\n(Installed by clihub from ${source}.)`
    .replace(/'''/g, "' ''"); // a literal string cannot contain '''
  return `# clihub:skill:${skill.id}\ndescription = "${desc}"\nprompt = '''\n${prompt}\n'''\n`;
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
