/**
 * Cross-CLI credential visibility (v1.3.0, Pillar IX — unified auth).
 *
 * Each AI CLI stores its own OAuth/login credentials in its own file.
 * `inspectCredentials()` reports, per CLI, whether a credential file is
 * present and — best-effort — when its token expires, so a user can see
 * at a glance which CLIs are logged in or need re-auth (addresses the
 * token-expiry pain in GH #33811 / #34306).
 *
 * This is READ-ONLY and conservative: it never prints token contents and
 * never writes. Paths are vendor-internal and may change; a "not found"
 * means clihub couldn't locate the file, not that you're logged out.
 * A full unified OAuth login flow (writing tokens) is a later milestone.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface CredentialSource {
  tool: string;
  label: string;
  /** Candidate credential files, first match wins (relative to home). */
  paths: string[];
}

/** Best-effort, documented credential locations per CLI. */
export const CREDENTIAL_SOURCES: CredentialSource[] = [
  { tool: 'claude-code', label: 'Claude Code', paths: ['.claude/.credentials.json'] },
  { tool: 'codex', label: 'Codex', paths: ['.codex/auth.json'] },
];

export interface CredentialStatus {
  tool: string;
  label: string;
  found: boolean;
  path?: string;
  /** File mtime (ISO 8601). */
  modified?: string;
  /** Parsed token expiry (ISO 8601), if a known field was present. */
  expiresAt?: string;
  /** True when expiresAt is in the past. */
  expired?: boolean;
}

export interface InspectOpts {
  /** Home dir override (tests). */
  home?: string;
  /** "now" epoch ms override (tests). */
  now?: number;
}

const EXPIRY_FIELDS = ['expires_at', 'expiresAt', 'expiry', 'expiry_date', 'expiryDate', 'exp'];

/** Normalise a raw expiry value (epoch s/ms or ISO string) to epoch ms. */
function toEpochMs(value: unknown): number | undefined {
  if (typeof value === 'number') {
    // Heuristic: < 1e12 → seconds, else ms.
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const n = Number(value);
    if (!Number.isNaN(n) && value.trim() !== '') return toEpochMs(n);
    const t = Date.parse(value);
    return Number.isNaN(t) ? undefined : t;
  }
  return undefined;
}

function findExpiry(obj: unknown): number | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const record = obj as Record<string, unknown>;
  for (const field of EXPIRY_FIELDS) {
    if (field in record) {
      const ms = toEpochMs(record[field]);
      if (ms !== undefined) return ms;
    }
  }
  // one level of nesting (e.g. { tokens: { expiry_date } })
  for (const v of Object.values(record)) {
    if (v && typeof v === 'object') {
      const ms = findExpiry(v);
      if (ms !== undefined) return ms;
    }
  }
  return undefined;
}

export async function inspectCredentials(opts: InspectOpts = {}): Promise<CredentialStatus[]> {
  const home = opts.home ?? os.homedir();
  const now = opts.now ?? Date.now();
  const out: CredentialStatus[] = [];

  for (const source of CREDENTIAL_SOURCES) {
    let status: CredentialStatus = { tool: source.tool, label: source.label, found: false };
    for (const rel of source.paths) {
      const file = path.join(home, ...rel.split('/'));
      try {
        const stat = await fs.stat(file);
        status = {
          tool: source.tool,
          label: source.label,
          found: true,
          path: file,
          modified: new Date(stat.mtimeMs).toISOString(),
        };
        try {
          const raw = await fs.readFile(file, 'utf8');
          const ms = findExpiry(JSON.parse(raw));
          if (ms !== undefined) {
            status.expiresAt = new Date(ms).toISOString();
            status.expired = ms < now;
          }
        } catch {
          /* unparseable / not JSON — presence still reported */
        }
        break;
      } catch {
        /* try next candidate */
      }
    }
    out.push(status);
  }
  return out;
}
