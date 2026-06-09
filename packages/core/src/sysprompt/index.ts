/**
 * `clihub prompt` — cross-CLI system-prompt / persona management (v1.55).
 *
 * These 7 CLIs have no universal *separate* system-prompt config file; their
 * "system prompt" is the same instruction file `clihub memory` already writes
 * (CLAUDE.md / AGENTS.md / GEMINI.md / …). Rather than invent unverified paths,
 * `prompt` writes a SECOND managed block — its own markers, its own source file
 * (`clihub.systemprompt.md`) — into those *already-verified* target files. So a
 * user keeps shared team rules in `memory` and a distinct persona / system
 * prompt in `prompt`; the two blocks coexist in one file, each independently
 * regenerated, hand-written text between them preserved.
 *
 * Implementation is a thin invocation of the parameterized memory engine
 * (markers + targets), so there is one block engine, not two.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  planMemory,
  generateMemory,
  stripManagedBlock,
  MEMORY_TARGETS,
  type MemoryTarget,
  type MemoryOptions,
  type MemoryPlanItem,
  type MemoryResult,
  type MemorySource,
} from '../memory/index.js';

export const PROMPT_START =
  '<!-- clihub:prompt:start - managed by `clihub prompt`; edit your source file instead -->';
export const PROMPT_END = '<!-- clihub:prompt:end -->';
const MARKERS = { start: PROMPT_START, end: PROMPT_END };

/** Source files we look for, in priority order. */
export const PROMPT_SOURCE_CANDIDATES = ['clihub.systemprompt.md'];

/** Reuses the verified per-CLI instruction-file locations; distinct block. */
export const SYSPROMPT_TARGETS: MemoryTarget[] = MEMORY_TARGETS;

/** Find the canonical system-prompt source. */
export async function resolvePromptSource(
  cwd = process.cwd(),
  explicit?: string,
): Promise<MemorySource | undefined> {
  const candidates = explicit ? [explicit] : PROMPT_SOURCE_CANDIDATES;
  for (const name of candidates) {
    const file = path.isAbsolute(name) ? name : path.join(cwd, name);
    try {
      let body = await fs.readFile(file, 'utf8');
      body = stripManagedBlock(body, PROMPT_START, PROMPT_END).trim();
      if (body) return { file, body };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  return undefined;
}

/** Read-only plan for the system-prompt block across CLIs. */
export function planSysprompt(body: string, opts: MemoryOptions = {}): Promise<MemoryPlanItem[]> {
  return planMemory(body, { ...opts, markers: MARKERS, targets: SYSPROMPT_TARGETS });
}

/** Write the system-prompt block into each CLI's instruction file. */
export function generateSysprompt(body: string, opts: MemoryOptions = {}): Promise<MemoryResult> {
  return generateMemory(body, { ...opts, markers: MARKERS, targets: SYSPROMPT_TARGETS });
}

/** sha256 of the resolved system-prompt source body, or undefined if none.
 *  Lets `clihub.lock.json` pin the prompt and `status --strict` gate its drift. */
export async function systemPromptHash(cwd = process.cwd(), explicit?: string): Promise<string | undefined> {
  const src = await resolvePromptSource(cwd, explicit);
  if (!src) return undefined;
  return crypto.createHash('sha256').update(src.body, 'utf8').digest('hex');
}
