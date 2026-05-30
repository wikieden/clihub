/**
 * GitHub star nudge state (v1.26.0).
 *
 * A gentle, occasional "star us on GitHub?" prompt after an install or on
 * exit. State lives at `~/.clihub/nudge.json` so we don't pester: once the
 * user opens the repo (or after a few asks) we stop.
 *
 *   - shouldNudgeStar(state, rand) → whether to ask this time (pure)
 *   - readNudge / writeNudge / markNudged → persist the decision
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface NudgeState {
  /** User opened the repo (treated as starred) — stop asking. */
  starred?: boolean;
  /** How many times we've asked. */
  asks: number;
}

/** Probability of asking on any eligible event. */
export const STAR_NUDGE_PROBABILITY = 0.2;
/** Stop asking after this many times. */
export const STAR_NUDGE_MAX_ASKS = 3;
export const CLIHUB_REPO_URL = 'https://github.com/wikieden/clihub';

export function defaultNudgePath(): string {
  return path.join(os.homedir(), '.clihub', 'nudge.json');
}

export async function readNudge(file = defaultNudgePath()): Promise<NudgeState> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as Partial<NudgeState>;
    return { starred: parsed.starred, asks: typeof parsed.asks === 'number' ? parsed.asks : 0 };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { asks: 0 };
    throw err;
  }
}

export async function writeNudge(state: NudgeState, file = defaultNudgePath()): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, file);
}

/** Decide whether to ask, given state + a random roll in [0,1). Pure. */
export function shouldNudgeStar(state: NudgeState, rand: number): boolean {
  if (state.starred) return false;
  if (state.asks >= STAR_NUDGE_MAX_ASKS) return false;
  return rand < STAR_NUDGE_PROBABILITY;
}

/** Record the outcome: `opened` marks starred + stops; `dismissed` counts the ask. */
export async function markNudged(action: 'opened' | 'dismissed', file = defaultNudgePath()): Promise<void> {
  const state = await readNudge(file);
  state.asks += 1;
  if (action === 'opened') state.starred = true;
  await writeNudge(state, file);
}
