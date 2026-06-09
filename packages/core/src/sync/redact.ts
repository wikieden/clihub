/**
 * Redaction guard + watch daemon for `clihub sync` (v1.58).
 *
 * The sync bundle already excludes OS-keychain secrets and per-CLI home dirs
 * by construction. `redactBundle` is a defence-in-depth guard: before any
 * snapshot leaves the machine it masks any secret-looking value that slipped
 * into a bundled config file (a key whose NAME looks secret, or a value with a
 * known token prefix). It is a pure, deterministic transform over an in-memory
 * bundle — no I/O.
 *
 * `watchAndPush` is a small polling daemon: on a change to the portable config
 * surface it re-collects, redacts, and pushes through a transport.
 */
import {
  collectBundle,
  type SyncBundle,
  type SyncFile,
  type SyncIoOpts,
} from './index.js';
import type { SyncTransport } from './transport.js';
import { pushBundle } from './transport.js';

export const REDACTED = '***REDACTED***';

/** Key names that should never carry a value off-machine. */
const SECRET_KEY_RE = /(token|secret|password|passwd|api[_-]?key|apikey|auth|credential|bearer|access[_-]?key|private[_-]?key|session)/i;
/** Value shapes that are unambiguously credentials regardless of key name. */
const SECRET_VALUE_RES: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/,        // OpenAI / Anthropic style
  /ghp_[A-Za-z0-9]{20,}/,         // GitHub PAT
  /gh[opsu]_[A-Za-z0-9]{20,}/,    // GitHub other tokens
  /AKIA[0-9A-Z]{16}/,             // AWS access key id
  /xox[baprs]-[A-Za-z0-9-]{10,}/, // Slack
];

export interface Redaction {
  file: string;
  key: string;
}

function redactValueString(v: string): { value: string; hit: boolean } {
  for (const re of SECRET_VALUE_RES) {
    if (re.test(v)) return { value: REDACTED, hit: true };
  }
  return { value: v, hit: false };
}

function walk(node: unknown, file: string, keyPath: string, out: Redaction[]): unknown {
  if (Array.isArray(node)) return node.map((n, i) => walk(n, file, `${keyPath}[${i}]`, out));
  if (node && typeof node === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const kp = keyPath ? `${keyPath}.${k}` : k;
      if (SECRET_KEY_RE.test(k) && (typeof v === 'string' || typeof v === 'number')) {
        out.push({ file, key: kp });
        result[k] = REDACTED;
      } else if (typeof v === 'string') {
        const { value, hit } = redactValueString(v);
        if (hit) out.push({ file, key: kp });
        result[k] = value;
      } else {
        result[k] = walk(v, file, kp, out);
      }
    }
    return result;
  }
  return node;
}

/** Mask secret-looking values in every bundled file. Pure; returns a copy. */
export function redactBundle(bundle: SyncBundle): { bundle: SyncBundle; redactions: Redaction[] } {
  const redactions: Redaction[] = [];
  const files: SyncFile[] = bundle.files.map((f) => {
    // Structured (JSON) files: walk + redact by key/value.
    try {
      const parsed = JSON.parse(f.content);
      const cleaned = walk(parsed, f.path, '', redactions);
      return { ...f, content: JSON.stringify(cleaned, null, 2) + '\n' };
    } catch {
      // Non-JSON: redact known token shapes inline.
      let content = f.content;
      let hit = false;
      for (const re of SECRET_VALUE_RES) {
        content = content.replace(new RegExp(re.source, 'g'), () => { hit = true; return REDACTED; });
      }
      if (hit) redactions.push({ file: f.path, key: '(inline)' });
      return { ...f, content };
    }
  });
  return { bundle: { ...bundle, files }, redactions };
}

export interface WatchOptions extends SyncIoOpts {
  clihubVersion: string;
  passphrase: string;
  /** Poll interval in ms (default 3000). */
  intervalMs?: number;
  /** Called after each successful push with the redaction count. */
  onPush?: (redactions: number) => void;
  onError?: (err: unknown) => void;
}

export interface SyncWatchHandle {
  stop: () => void;
}

/** Collect → redact → push when the portable config surface changes. Polling. */
export function watchAndPush(transport: SyncTransport, opts: WatchOptions): SyncWatchHandle {
  let last = '';
  let stopped = false;
  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const raw = await collectBundle(opts.clihubVersion, { home: opts.home });
      const { bundle, redactions } = redactBundle(raw);
      const sig = JSON.stringify(bundle.files);
      if (sig !== last) {
        await pushBundle(transport, bundle, opts.passphrase);
        last = sig;
        opts.onPush?.(redactions.length);
      }
    } catch (e) {
      opts.onError?.(e);
    }
  };
  const timer = setInterval(() => void tick(), opts.intervalMs ?? 3000);
  if (typeof timer === 'object' && 'unref' in timer) (timer as { unref: () => void }).unref();
  void tick(); // initial push
  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
