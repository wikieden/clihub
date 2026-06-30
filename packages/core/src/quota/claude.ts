/**
 * Claude quota fetcher.
 *
 * Claude Code surfaces server-side limits (Current session / Current week /
 * Sonnet, with reset times) only in the interactive `/usage` TUI — there is no
 * public local file or consumer API (the only Anthropic endpoint is the
 * admin-key `organizations/cost_report`, which is org-level and lacks the
 * rolling session/weekly windows). So, like CodexBar, we drive the `claude`
 * binary in a PTY and scrape the panel.
 *
 * Reality on real machines: the `/usage` panel renders in an alternate-screen
 * buffer and the REPL is often customized (auto-mode, plugins) — full window
 * scraping is best-effort and may fail. The plan + account, however, render on
 * the welcome screen and are reliably captured. So this fetcher:
 *   • prefers `expect` (a real PTY driver that answers the trust prompt and
 *     sends `/usage`); falls back to a plain spawn when `expect` is absent;
 *   • always extracts plan + account when present;
 *   • returns rolling windows when the panel parses, otherwise a supported
 *     snapshot carrying just plan/account (so the UI still shows the account),
 *     or an unsupported snapshot with a clear reason when nothing is readable.
 *
 * A future revision can lift CodexBar's full ClaudeStatusProbe (alt-screen
 * isolation + retry) into a dedicated native PTY probe for robust windows.
 */
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  type QuotaFetcher,
  type QuotaOptions,
  type QuotaSnapshot,
  type QuotaWindow,
  clampWindow,
  quotaUnavailable,
} from './types.js';
import { whichCmd } from '../utils/which.js';

const LABELS: Array<{ id: string; label: string; needles: string[] }> = [
  { id: 'session', label: 'Session', needles: ['Current session'] },
  { id: 'weekly', label: 'Weekly', needles: ['Current week (all models)'] },
  {
    id: 'sonnet',
    label: 'Sonnet',
    needles: ['Current week (Sonnet only)', 'Current week (Sonnet)'],
  },
  { id: 'opus', label: 'Opus', needles: ['Current week (Opus)'] },
];

const ANSI =
  // eslint-disable-next-line no-control-regex
  /\x1b\[[0-9;?]*[a-zA-Z]|\x1b[()][AB0]|\x1b[<=>]|\x1b\][^\x07]*\x07/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI, '').replace(/\r/g, '\n');
}

/**
 * An expect(1) script that opens claude, accepts the trust prompt, asks for
 * `/usage`, waits for the panel labels, then quits. Written to a temp file and
 * run with `expect -f`. expect is the most portable real-PTY driver (ships on
 * macOS; common on Linux). When absent we fall back to a plain spawn that at
 * least yields the welcome screen (plan/account) on most setups.
 */
const EXPECT_SCRIPT = `set timeout 28
spawn -noecho claude
expect {
  "trust this folder" { send "\\r"; exp_continue }
  "shortcuts" { }
  "Welcome" { }
  timeout { }
}
sleep 3
send "/usage\\r"
expect {
  "Current session" { sleep 3 }
  "Current week" { sleep 3 }
  timeout { }
}
send "\\u0003"
sleep 1
`;

async function runViaExpect(expectBin: string, timeoutMs: number): Promise<string> {
  const file = path.join(os.tmpdir(), `clihub-claude-usage-${process.pid}.exp`);
  await fs.writeFile(file, EXPECT_SCRIPT, 'utf8');
  try {
    return await runCapture(expectBin, ['-f', file], timeoutMs);
  } finally {
    await fs.rm(file, { force: true }).catch(() => {});
  }
}

function runCapture(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const finish = () => {
      if (done) return;
      done = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      resolve(out);
    };
    const timer = setTimeout(finish, timeoutMs);
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString()));
    child.on('error', () => {
      clearTimeout(timer);
      finish();
    });
    child.on('close', () => {
      clearTimeout(timer);
      finish();
    });
  });
}

function extractPercent(lines: string[], needles: string[]): number | undefined {
  const idx = lines.findIndex((l) => needles.some((n) => l.includes(n)));
  if (idx < 0) return undefined;
  for (const line of lines.slice(idx, idx + 12)) {
    const m = line.match(/(\d{1,3})\s*%/);
    if (m) return Math.max(0, Math.min(100, Number(m[1])));
  }
  return undefined;
}

function extractReset(lines: string[], needles: string[]): string | undefined {
  const idx = lines.findIndex((l) => needles.some((n) => l.includes(n)));
  if (idx < 0) return undefined;
  for (const line of lines.slice(idx, idx + 12)) {
    const m = line.match(/Resets?\b[^\n]*/i);
    if (m) return m[0].trim();
  }
  return undefined;
}

/** Plan label from the welcome banner, e.g. "Claude Max", "Claude Pro". */
function extractPlan(text: string): string | undefined {
  const m = text.match(/Claude\s+(Max|Pro|Team|Enterprise|Free)\b/i);
  const tier = m?.[1];
  if (!tier) return undefined;
  return `Claude ${tier[0]!.toUpperCase()}${tier.slice(1).toLowerCase()}`;
}

function extractAccount(text: string): string | undefined {
  const m = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0] : undefined;
}

export const claudeQuotaFetcher: QuotaFetcher = {
  tool: 'claude-code',
  label: 'Claude',

  async fetch(opts: QuotaOptions): Promise<QuotaSnapshot> {
    const bin = await whichCmd('claude');
    if (!bin) {
      return quotaUnavailable('claude-code', 'Claude', 'Claude Code is not installed.');
    }
    const timeoutMs = opts.timeoutMs ?? 30000;
    const expectBin = await whichCmd('expect');
    const raw = expectBin
      ? await runViaExpect(expectBin, timeoutMs)
      : await runCapture(bin, ['/usage'], timeoutMs);
    const text = stripAnsi(raw);
    const lines = text.split('\n');

    const plan = extractPlan(text);
    const account = extractAccount(text);

    const windows: QuotaWindow[] = [];
    for (const def of LABELS) {
      const pctLeft = extractPercent(lines, def.needles);
      if (pctLeft === undefined) continue;
      const { usedPercent, remainingPercent } = clampWindow(100 - pctLeft); // panel = "% left"
      windows.push({
        id: def.id,
        label: def.label,
        usedPercent,
        remainingPercent,
        resetLabel: extractReset(lines, def.needles),
      });
    }

    if (windows.length > 0) {
      return {
        tool: 'claude-code',
        label: 'Claude',
        supported: true,
        account,
        plan,
        windows,
        source: 'claude-cli',
        updatedAt: new Date().toISOString(),
      };
    }

    // No windows, but if we at least learned the plan/account, surface that so
    // the card shows the account — the rolling windows just couldn't be scraped.
    if (plan || account) {
      return {
        tool: 'claude-code',
        label: 'Claude',
        supported: true,
        account,
        plan,
        windows: [],
        source: 'claude-cli',
        updatedAt: new Date().toISOString(),
        error:
          'Live session/weekly windows unavailable — the /usage panel did not render (interactive TUI). Plan and account shown.',
      };
    }

    return quotaUnavailable(
      'claude-code',
      'Claude',
      'Could not read the /usage panel (needs an interactive TTY, or the CLI version has no usage panel).',
      { source: 'claude-cli' },
    );
  },
};
