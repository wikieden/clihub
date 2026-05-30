/**
 * Project scaffold files (v1.19.0) — fills the wizard's "project scaffold"
 * step and `clihub init --scaffold`.
 *
 * Emits neutral starter files a real project wants on day one. It does NOT
 * write agent memory files (AGENTS.md / CLAUDE.md / …) — those are owned by
 * `clihub memory generate`, which manages its own block.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ciWorkflow } from '../ci/index.js';

const EDITORCONFIG = `root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
`;

const GITIGNORE = `node_modules/
dist/
build/
.env
.env.*
*.log
.DS_Store
`;

/** The scaffold file set, as { relative-path → content }. */
export function scaffoldFiles(): Record<string, string> {
  return {
    '.editorconfig': EDITORCONFIG,
    '.gitignore': GITIGNORE,
    '.github/workflows/clihub.yml': ciWorkflow('github'),
  };
}

export interface ScaffoldResult {
  written: string[];
  skipped: string[];
}

async function exists(p: string): Promise<boolean> {
  return fs.access(p).then(() => true).catch(() => false);
}

/** Write scaffold files into `cwd`, never overwriting an existing file. */
export async function writeScaffold(cwd: string): Promise<ScaffoldResult> {
  const files = scaffoldFiles();
  const written: string[] = [];
  const skipped: string[] = [];
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(cwd, ...rel.split('/'));
    if (await exists(target)) { skipped.push(rel); continue; }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
    written.push(rel);
  }
  return { written, skipped };
}
