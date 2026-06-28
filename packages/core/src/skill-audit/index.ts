/**
 * Skill audit (Pillar IX / security). Inventories installed skills
 * across every CLI and flags risky capabilities so users can tell what
 * the 100 skills they accreted actually do — addressing the skill-sprawl
 * and malicious-skill (CVE-2026-39861) concerns.
 *
 * Read-only. Each CLI's skills dir is scanned; each `SKILL.md` is parsed
 * for capability signals:
 *   - shell:    `allowed-tools` includes Bash/Shell/exec
 *   - hooks:    `hooks` frontmatter present (runs code on lifecycle)
 *   - network:  body / tools mention curl|wget|fetch|http
 *   - symlink:  a file in the skill dir symlinks outside the dir
 *               (the symlink-escape vector)
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseSkillMd } from '../skill-md/parser.js';

export type SkillRisk = 'shell' | 'hooks' | 'network' | 'symlink-escape';

export interface SkillAuditEntry {
  toolId: string;
  id: string;
  name: string;
  dir: string;
  risks: SkillRisk[];
  /** Per-risk human-readable evidence. */
  evidence: Partial<Record<SkillRisk, string>>;
}

/** CLI id → skills directory. */
const SKILL_DIRS: Record<string, string> = {
  'claude-code': path.join(os.homedir(), '.claude', 'skills'),
  'codex': path.join(os.homedir(), '.codex', 'skills'),
  'antigravity': path.join(os.homedir(), '.gemini', 'antigravity-cli', 'skills'),
  'kiro-cli': path.join(os.homedir(), '.kiro', 'skills'),
};

export interface SkillAuditOpts {
  /** Limit to one CLI. */
  toolId?: string;
  /** Override the dir map (tests). */
  dirs?: Record<string, string>;
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

const SHELL_TOOLS = /\b(bash|shell|exec|run_shell|terminal)\b/i;
const NETWORK_HINT = /\b(curl|wget|fetch\(|https?:\/\/|axios|net\/http)\b/i;

async function detectSymlinkEscape(skillDir: string): Promise<string | undefined> {
  let entries;
  try {
    entries = await fs.readdir(skillDir, { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    if (!entry.isSymbolicLink()) continue;
    const linkPath = path.join(skillDir, entry.name);
    try {
      const target = await fs.readlink(linkPath);
      const resolved = path.resolve(skillDir, target);
      const rel = path.relative(skillDir, resolved);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return `${entry.name} → ${target}`;
      }
    } catch {
      return `${entry.name} (unreadable symlink)`;
    }
  }
  return undefined;
}

async function auditOneSkill(toolId: string, skillDir: string, id: string): Promise<SkillAuditEntry | undefined> {
  const mdPath = path.join(skillDir, 'SKILL.md');
  let body = '';
  let frontmatter: Record<string, string | string[]> = {};
  try {
    const raw = await fs.readFile(mdPath, 'utf8');
    const parsed = parseSkillMd(raw);
    body = parsed.body;
    frontmatter = parsed.frontmatter;
  } catch {
    // No SKILL.md → still report the dir, no md-based risks.
  }

  const risks: SkillRisk[] = [];
  const evidence: Partial<Record<SkillRisk, string>> = {};

  const allowedTools = frontmatter['allowed-tools'];
  const allowedStr = Array.isArray(allowedTools) ? allowedTools.join(', ') : (allowedTools ?? '');
  if (SHELL_TOOLS.test(allowedStr)) {
    risks.push('shell');
    evidence.shell = `allowed-tools: ${allowedStr}`;
  }

  if ('hooks' in frontmatter) {
    risks.push('hooks');
    evidence.hooks = 'declares `hooks` frontmatter';
  }

  if (NETWORK_HINT.test(body) || NETWORK_HINT.test(allowedStr)) {
    risks.push('network');
    const m = body.match(NETWORK_HINT);
    evidence.network = m ? `mentions "${m[0]}"` : 'network access hinted';
  }

  const symlink = await detectSymlinkEscape(skillDir);
  if (symlink) {
    risks.push('symlink-escape');
    evidence['symlink-escape'] = symlink;
  }

  const name = typeof frontmatter.name === 'string' ? frontmatter.name : id;
  return { toolId, id, name, dir: skillDir, risks, evidence };
}

/**
 * Audit every installed skill across the requested CLIs.
 */
export async function auditSkills(opts: SkillAuditOpts = {}): Promise<SkillAuditEntry[]> {
  const dirs = opts.dirs ?? SKILL_DIRS;
  const out: SkillAuditEntry[] = [];
  for (const [toolId, skillsDir] of Object.entries(dirs)) {
    if (opts.toolId && opts.toolId !== toolId) continue;
    if (!(await dirExists(skillsDir))) continue;
    let entries;
    try {
      entries = await fs.readdir(skillsDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const skillDir = path.join(skillsDir, entry.name);
      const stat = await fs.stat(skillDir).catch(() => undefined);
      if (!stat?.isDirectory()) continue;
      const audited = await auditOneSkill(toolId, skillDir, entry.name);
      if (audited) out.push(audited);
    }
  }
  return out;
}

/** Audit a single skill id (first match across CLIs, or scoped by toolId). */
export async function auditSkill(id: string, opts: SkillAuditOpts = {}): Promise<SkillAuditEntry | undefined> {
  const all = await auditSkills(opts);
  return all.find((s) => s.id === id);
}
