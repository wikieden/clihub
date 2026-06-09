/**
 * Structured audit log — every clihub config / profile / auth / proxy
 * mutation appends a JSON-lines record to `~/.clihub/audit.log`
 * (overridable). Reads are deliberately not provided as a streaming API;
 * use `jq` / `tail -f` over the file directly.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type AuditActor = 'cli' | 'tui' | 'core' | 'daemon';

export interface AuditEntryBase {
  /** ISO 8601 UTC. */
  ts: string;
  actor: AuditActor;
  action: string;
}

export type AuditEntry = AuditEntryBase & Record<string, unknown>;

export interface AppendAuditOpts {
  path?: string;
}

export function defaultAuditPath(): string {
  return path.join(os.homedir(), '.clihub', 'audit.log');
}

let bestEffort = true;

/**
 * Append one JSON-lines record to the audit log. Errors are swallowed
 * by default so an unreachable disk doesn't break the command the user
 * actually ran; flip `bestEffort` off when testing.
 */
export interface AppendAuditInput {
  ts?: string;
  actor: AuditActor;
  action: string;
  [extra: string]: unknown;
}

export async function appendAudit(
  partial: AppendAuditInput,
  opts: AppendAuditOpts = {},
): Promise<void> {
  const { ts, actor, action, ...extra } = partial;
  const entry: AuditEntry = {
    ts: ts ?? new Date().toISOString(),
    actor,
    action,
    ...extra,
  };
  const file = opts.path ?? defaultAuditPath();
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    if (!bestEffort) throw err;
  }
}

export function setAuditBestEffort(value: boolean): void {
  bestEffort = value;
}
