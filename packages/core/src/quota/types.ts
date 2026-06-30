/**
 * Live quota / rate-limit snapshots for the AI coding CLIs.
 *
 * Unlike the `usage` module (which sums tokens from local log files), quota
 * talks to each provider's own usage endpoint — reusing the credentials the
 * CLI already stored, so the user never logs in again. This mirrors what
 * CodexBar does: read `~/.codex/auth.json` and call ChatGPT's `wham/usage`,
 * spawn `claude /usage`, etc. Every fetcher is best-effort and must degrade to
 * `{ supported, error }` rather than throw, so one offline provider never
 * breaks the rollup.
 */

/** One rolling rate-limit window (e.g. Codex 5-hour session, Claude weekly). */
export interface QuotaWindow {
  /** Stable id, e.g. `session`, `weekly`, `spark-5h`, `sonnet`. */
  id: string;
  /** Human label shown in the UI, e.g. "Session", "Weekly", "Codex Spark 5-hour". */
  label: string;
  /** 0–100, percent of the window consumed. */
  usedPercent: number;
  /** 0–100, percent remaining (== 100 - usedPercent), pre-computed for the UI. */
  remainingPercent: number;
  /** Absolute reset time (ISO-8601) when known. */
  resetsAt?: string;
  /** Seconds until reset when known (derived or provider-supplied). */
  resetsInSeconds?: number;
  /** Raw reset text when only a label is available (e.g. Claude "Resets in 1h 31m"). */
  resetLabel?: string;
  /** Length of the window in seconds, when the provider reports it. */
  windowSeconds?: number;
}

/** Manual rate-limit reset credits (Codex "3 manual resets available"). */
export interface QuotaCredits {
  /** How many manual resets are available right now. */
  available: number;
  /** Seconds until the next credit expires, when known. */
  nextExpiresInSeconds?: number;
}

/** One provider's quota snapshot. */
export interface QuotaSnapshot {
  /** clihub tool id, e.g. `codex`, `claude-code`. */
  tool: string;
  /** Display label, e.g. "Codex", "Claude". */
  label: string;
  /** Whether quota reporting is implemented + reachable for this tool. */
  supported: boolean;
  /** Account identifier (email) when derivable. */
  account?: string;
  /** Subscription/plan label, e.g. "Pro 5x", "Preview 2", "plus". */
  plan?: string;
  /** Rolling windows, ordered as the UI should render them. */
  windows: QuotaWindow[];
  /** Manual reset credits, when the provider exposes them. */
  credits?: QuotaCredits;
  /** Where the data came from, e.g. `codex-oauth`, `claude-cli`. */
  source?: string;
  /** ISO-8601 timestamp this snapshot was taken. */
  updatedAt: string;
  /** Set when unsupported/unreachable; a short human reason. */
  error?: string;
}

export interface QuotaOptions {
  /** Restrict to these tool ids; default = all registered fetchers. */
  tools?: string[];
  /** Per-fetch timeout in ms (default 20000). */
  timeoutMs?: number;
  /** Proxy URL (e.g. http://127.0.0.1:7897). Defaults to HTTPS_PROXY env. */
  proxy?: string;
}

export interface QuotaResult {
  snapshots: QuotaSnapshot[];
}

/** A pluggable per-provider quota fetcher. */
export interface QuotaFetcher {
  tool: string;
  label: string;
  fetch(opts: QuotaOptions): Promise<QuotaSnapshot>;
}

/** Build a not-supported / errored snapshot in one place. */
export function quotaUnavailable(
  tool: string,
  label: string,
  error: string,
  extra: Partial<QuotaSnapshot> = {},
): QuotaSnapshot {
  return {
    tool,
    label,
    supported: false,
    windows: [],
    updatedAt: new Date().toISOString(),
    error,
    ...extra,
  };
}

/** Normalize a used-percent into a {usedPercent, remainingPercent} pair. */
export function clampWindow(usedPercent: number): {
  usedPercent: number;
  remainingPercent: number;
} {
  const used = Math.max(0, Math.min(100, usedPercent));
  return { usedPercent: used, remainingPercent: Math.max(0, 100 - used) };
}
