import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  InstalledSkill,
  SkillManifest,
  SkillSyncAdapter,
} from '../tools/types.js';

export interface CursorSkillAdapterOpts {
  /** Override the commands directory. Defaults to ~/.cursor/commands. */
  commandsDir?: string;
}

/**
 * Cursor custom commands ("/" prompts) are plain Markdown files in
 * `~/.cursor/commands/<name>.md` (global) or `.cursor/commands/<name>.md`
 * (project). The filename becomes the slash-command name and the file body
 * IS the prompt — no frontmatter is required. Verified against Cursor docs
 * (cursor.com/docs/context/commands). We prefix files with `clihub-` so
 * `list`/`uninstall` only touch what clihub wrote.
 */
export class CursorSkillAdapter implements SkillSyncAdapter {
  private readonly commandsDir: string;

  constructor(opts: CursorSkillAdapterOpts = {}) {
    this.commandsDir =
      opts.commandsDir ?? path.join(os.homedir(), '.cursor', 'commands');
  }

  async install(skill: SkillManifest, source: string): Promise<void> {
    await fs.mkdir(this.commandsDir, { recursive: true });
    await fs.writeFile(
      path.join(this.commandsDir, `clihub-${skill.id}.md`),
      renderCommandMd(skill, source),
      'utf8',
    );
  }

  async uninstall(skillId: string): Promise<void> {
    await fs.rm(path.join(this.commandsDir, `clihub-${skillId}.md`), {
      force: true,
    });
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
      .filter((f) => f.startsWith('clihub-') && f.endsWith('.md'))
      .map((f) => {
        const id = f.replace(/^clihub-/, '').replace(/\.md$/, '');
        return {
          id,
          name: id,
          version: 'unknown',
          path: path.join(this.commandsDir, f),
        };
      });
  }
}

/** Plain-Markdown prompt body. First line/heading is the command's intent. */
function renderCommandMd(skill: SkillManifest, source: string): string {
  return `# ${skill.name}

${skill.description}

Installed by clihub from ${source}.
`;
}
