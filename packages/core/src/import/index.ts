/**
 * `clihub import` — reverse-ingest this machine's existing CLI config into a
 * `clihub.yaml` (v1.53). The inverse of the writers: it reads what is ALREADY
 * installed/configured (installed CLIs, each CLI's actual skills, MCP servers)
 * and emits a clihub.yaml so a user can adopt clihub on top of an existing
 * setup. Unlike `init --from-installed` (which *recommends* skills), import
 * captures the REAL installed skills + MCP servers. Read-only scan.
 */
import { listProviders } from '../tools/registry.js';
import { SKILL_ADAPTERS } from '../skill/registry.js';
import { listMcp } from '../mcp/manage.js';
import { generateClihubYaml, type SkillEntry } from '../init/index.js';

export interface ImportSkill {
  id: string;
  tool: string;
}

export interface ImportResult {
  tools: string[];
  skills: ImportSkill[];
  mcp: string[];
  yaml: string;
}

export interface ImportOpts {
  /** Home override (MCP scan; tests). */
  home?: string;
  /** Include the yaml-language-server schema ref. */
  schema?: boolean;
}

export async function importMachine(opts: ImportOpts = {}): Promise<ImportResult> {
  // 1. installed CLIs
  const tools: string[] = [];
  for (const p of listProviders()) {
    try {
      if ((await p.detect()).installed) tools.push(p.id);
    } catch {
      /* detect best-effort */
    }
  }

  // 2. each installed CLI's ACTUAL skills (not recommendations)
  const skills: ImportSkill[] = [];
  for (const tool of tools) {
    const make = SKILL_ADAPTERS[tool];
    if (!make) continue;
    try {
      for (const s of await make().list()) skills.push({ id: s.id, tool });
    } catch {
      /* adapter best-effort */
    }
  }

  // 3. MCP servers across CLIs (union of ids)
  const rows = await listMcp({ home: opts.home }).catch(() => []);
  const mcp = [...new Set(rows.flatMap((r) => r.servers.map((s) => s.id)))];

  const yaml = generateClihubYaml({
    tools,
    skills: skills.map((s): SkillEntry => ({ id: s.id, tool: s.tool })),
    mcp,
    schema: opts.schema,
  });

  return { tools, skills, mcp, yaml };
}
