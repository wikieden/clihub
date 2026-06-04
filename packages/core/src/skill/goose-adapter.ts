import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  InstalledSkill,
  SkillManifest,
  SkillSyncAdapter,
} from '../tools/types.js';

export interface GooseSkillAdapterOpts {
  /** Override the recipes directory. Defaults to ~/.config/goose/recipes. */
  recipesDir?: string;
}

/**
 * Goose has no SKILL.md concept — its reusable-prompt unit is a *recipe*.
 * The CLI reads recipes from `~/.config/goose/recipes/<name>.yaml` and
 * `goose recipe list` enumerates that dir. A minimal valid recipe needs
 * `version`, `title`, `description`, `instructions` (verified against
 * block.github.io/goose recipe-reference + storing-recipes docs); `prompt`
 * is an optional kickoff message. We map a clihub skill onto that shape and
 * prefix files with `clihub-` so list/uninstall only touch our own recipes.
 */
export class GooseSkillAdapter implements SkillSyncAdapter {
  private readonly recipesDir: string;

  constructor(opts: GooseSkillAdapterOpts = {}) {
    this.recipesDir =
      opts.recipesDir ??
      path.join(os.homedir(), '.config', 'goose', 'recipes');
  }

  async install(skill: SkillManifest, source: string): Promise<void> {
    await fs.mkdir(this.recipesDir, { recursive: true });
    await fs.writeFile(
      path.join(this.recipesDir, `clihub-${skill.id}.yaml`),
      renderRecipeYaml(skill, source),
      'utf8',
    );
  }

  async uninstall(skillId: string): Promise<void> {
    await fs.rm(path.join(this.recipesDir, `clihub-${skillId}.yaml`), {
      force: true,
    });
  }

  async list(): Promise<InstalledSkill[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.recipesDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    return entries
      .filter((f) => f.startsWith('clihub-') && f.endsWith('.yaml'))
      .map((f) => {
        const id = f.replace(/^clihub-/, '').replace(/\.yaml$/, '');
        return {
          id,
          name: id,
          version: 'unknown',
          path: path.join(this.recipesDir, f),
        };
      });
  }
}

/**
 * Render a minimal valid goose recipe. `title`/`description` are emitted as
 * double-quoted scalars (JSON.stringify is valid YAML for strings), and
 * `instructions`/`prompt` use literal block scalars so skill bodies need no
 * escaping.
 */
function renderRecipeYaml(skill: SkillManifest, source: string): string {
  const body = `${skill.description}\n\nInstalled by clihub from ${source}.`;
  return `version: 1.0.0
title: ${JSON.stringify(skill.name)}
description: ${JSON.stringify(skill.description)}
instructions: |
${indentBlock(body, 2)}
prompt: |
${indentBlock(body, 2)}
`;
}

function indentBlock(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.length ? pad + line : line))
    .join('\n');
}
