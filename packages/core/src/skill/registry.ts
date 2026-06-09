/**
 * Single source of truth for "which skill adapter does each CLI use".
 *
 * This map used to be copy-pasted in three places (`apply`, `doctor`, and the
 * CLI's `skill` command). Every time a CLI was added or its skill surface
 * changed, all three had to be edited in lockstep — and the one that got
 * missed silently skipped that CLI. Centralising it here means a new CLI is
 * wired once.
 *
 * Keyed by provider id (see tools/registry.ts). A CLI with no entry has no
 * skill-sync surface (e.g. nothing here for a settings-only provider).
 */
import os from 'node:os';
import path from 'node:path';
import type { SkillSyncAdapter } from '../tools/types.js';
import { ClaudeCodeSkillAdapter } from './index.js';
import { CodexSkillAdapter } from './codex-adapter.js';
import { KiroCliSkillAdapter } from './kiro-adapter.js';
import { GeminiCliSkillAdapter } from './gemini-adapter.js';
import { CursorSkillAdapter } from './cursor-adapter.js';
import { GooseSkillAdapter } from './goose-adapter.js';

export const SKILL_ADAPTERS: Record<string, () => SkillSyncAdapter> = {
  'claude-code': () => new ClaudeCodeSkillAdapter(),
  'codex': () => new CodexSkillAdapter(),
  'kiro-cli': () => new KiroCliSkillAdapter(),
  'gemini-cli': () => new GeminiCliSkillAdapter(),
  'qwen-code': () =>
    new GeminiCliSkillAdapter({
      commandsDir: path.join(os.homedir(), '.qwen', 'commands'),
      geminiMd: path.join(os.homedir(), '.qwen', 'QWEN.md'),
    }),
  'cursor': () => new CursorSkillAdapter(),
  'goose': () => new GooseSkillAdapter(),
};

/** Tool ids that have a skill-sync surface. */
export function skillCapableTools(): string[] {
  return Object.keys(SKILL_ADAPTERS);
}

/** Construct the skill adapter for a CLI, or undefined if it has none. */
export function skillAdapterFor(toolId: string): SkillSyncAdapter | undefined {
  return SKILL_ADAPTERS[toolId]?.();
}
