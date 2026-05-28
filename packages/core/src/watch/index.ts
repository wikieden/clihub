/**
 * Watch each managed CLI's settings dir; on change, snapshot via
 * BackupManager so an unrelated upgrade can be rolled back cleanly.
 *
 * Events are debounced per-tool (default 5 s) so a vendor that
 * rewrites multiple files in sequence yields one backup, not many.
 * The log file at `~/.clihub/watch.log` is JSON-lines for easy
 * `jq` filtering.
 */
import { promises as fs, watch, type FSWatcher } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BackupManager } from '../backup/index.js';
import { listProviders } from '../tools/registry.js';

export interface WatchEvent {
  ts: string;
  toolId: string;
  reason: 'change' | 'rename' | 'initial';
  file: string;
  backupId?: string;
  backupPath?: string;
  error?: string;
}

export interface WatchOpts {
  /** ms between change detection and snapshot. Default 5000. */
  debounceMs?: number;
  /** Override log path. Default `~/.clihub/watch.log`. */
  logPath?: string;
  /** Optional event sink — called for every event. */
  onEvent?: (e: WatchEvent) => void;
  /** Limit to specific tool ids; default: every installed tool. */
  toolIds?: string[];
}

export interface WatchHandle {
  stop(): Promise<void>;
  events(): AsyncIterable<WatchEvent>;
}

export async function startWatch(opts: WatchOpts = {}): Promise<WatchHandle> {
  const debounceMs = opts.debounceMs ?? 5000;
  const logPath = opts.logPath ?? path.join(os.homedir(), '.clihub', 'watch.log');
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  const queue: WatchEvent[] = [];
  let resolveNext: ((e: IteratorResult<WatchEvent>) => void) | undefined;
  const pushEvent = async (e: WatchEvent) => {
    queue.push(e);
    try { opts.onEvent?.(e); } catch { /* sink */ }
    try {
      await fs.appendFile(logPath, JSON.stringify(e) + '\n', 'utf8');
    } catch { /* ignore log write failures */ }
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = undefined;
      r({ value: queue.shift()!, done: false });
    }
  };

  const watchers: FSWatcher[] = [];
  const timers = new Map<string, NodeJS.Timeout>();
  const backups = new BackupManager();

  const targets = listProviders().filter(
    (p) => !opts.toolIds || opts.toolIds.includes(p.id),
  );

  for (const provider of targets) {
    const det = await provider.detect();
    if (!det.installed) continue;
    const settingsPath = provider.settingsAdapter.configPath();
    const watchDir = path.dirname(settingsPath);

    let w: FSWatcher;
    try {
      w = watch(watchDir, { persistent: true }, (eventType, filename) => {
        if (!filename) return;
        const filePath = path.join(watchDir, String(filename));
        const key = `${provider.id}:${filePath}`;
        const existing = timers.get(key);
        if (existing) clearTimeout(existing);
        timers.set(
          key,
          setTimeout(async () => {
            timers.delete(key);
            try {
              const entry = await backups.create({
                sourceDir: watchDir,
              });
              await pushEvent({
                ts: new Date().toISOString(),
                toolId: provider.id,
                reason: eventType === 'rename' ? 'rename' : 'change',
                file: filePath,
                backupId: entry.id,
                backupPath: entry.path,
              });
            } catch (err) {
              await pushEvent({
                ts: new Date().toISOString(),
                toolId: provider.id,
                reason: eventType === 'rename' ? 'rename' : 'change',
                file: filePath,
                error: String(err),
              });
            }
          }, debounceMs),
        );
      });
      watchers.push(w);

      await pushEvent({
        ts: new Date().toISOString(),
        toolId: provider.id,
        reason: 'initial',
        file: watchDir,
      });
    } catch (err) {
      await pushEvent({
        ts: new Date().toISOString(),
        toolId: provider.id,
        reason: 'initial',
        file: watchDir,
        error: String(err),
      });
    }
  }

  return {
    async stop() {
      for (const w of watchers) w.close();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      if (resolveNext) {
        resolveNext({ value: undefined as unknown as WatchEvent, done: true });
        resolveNext = undefined;
      }
    },
    events(): AsyncIterable<WatchEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<IteratorResult<WatchEvent>> {
              if (queue.length > 0) {
                return Promise.resolve({ value: queue.shift()!, done: false });
              }
              return new Promise<IteratorResult<WatchEvent>>((resolve) => {
                resolveNext = resolve;
              });
            },
          };
        },
      };
    },
  };
}
