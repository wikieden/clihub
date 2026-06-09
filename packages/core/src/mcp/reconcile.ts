/**
 * Bidirectional MCP reconcile (v1.54). `clihub mcp add` fans a server OUT to
 * every CLI; reconcile adds the missing READ-BACK half: detect when a server
 * lives in some CLIs but not others (drift), and converge.
 *
 * - reconcileMcpPlan: read-only — per-server presence across CLIs (synced/drift).
 * - reconcileMcp: union apply — promote each drifting, catalog-resolvable server
 *   to every CLI via addMcp. Servers not in the catalog can't be auto-promoted
 *   (no portable definition) and are reported for manual action — honest, not
 *   silently dropped.
 */
import { listMcp, addMcp, type McpManageResult } from './manage.js';

export interface McpReconcileItem {
  id: string;
  /** Tool ids that already have the server. */
  presentIn: string[];
  /** Active mcp-capable tool ids that lack it. */
  absentIn: string[];
  state: 'synced' | 'drift';
}

export interface McpReconcilePlan {
  tools: string[];
  items: McpReconcileItem[];
  driftCount: number;
}

export interface McpReconcileOpts {
  home?: string;
  /** Include all mcp-capable CLIs, not just installed ones (tests / full view). */
  all?: boolean;
}

export async function reconcileMcpPlan(opts: McpReconcileOpts = {}): Promise<McpReconcilePlan> {
  const rows = await listMcp({ home: opts.home, all: opts.all });
  const tools = rows.map((r) => r.tool);
  const presence = new Map<string, Set<string>>();
  for (const r of rows) {
    for (const s of r.servers) {
      if (!presence.has(s.id)) presence.set(s.id, new Set());
      presence.get(s.id)!.add(r.tool);
    }
  }
  const items: McpReconcileItem[] = [];
  for (const [id, present] of presence) {
    const absentIn = tools.filter((t) => !present.has(t));
    items.push({
      id,
      presentIn: [...present],
      absentIn,
      state: absentIn.length === 0 ? 'synced' : 'drift',
    });
  }
  items.sort((a, b) => a.id.localeCompare(b.id));
  return { tools, items, driftCount: items.filter((i) => i.state === 'drift').length };
}

export interface McpReconcileResult {
  /** Servers promoted to the CLIs that lacked them. */
  promoted: string[];
  /** Drifting servers not in the catalog — promote manually with --command/--url. */
  manual: string[];
  results: McpManageResult[];
}

/** Union policy: add every drifting, catalog-resolvable server to all CLIs. */
export async function reconcileMcp(opts: McpReconcileOpts = {}): Promise<McpReconcileResult> {
  const plan = await reconcileMcpPlan(opts);
  const promoted: string[] = [];
  const manual: string[] = [];
  const results: McpManageResult[] = [];
  for (const it of plan.items) {
    if (it.state !== 'drift') continue;
    const res = await addMcp(it.id, { home: opts.home, all: opts.all });
    if (res.done.length > 0) {
      promoted.push(it.id);
      results.push(res);
    } else {
      manual.push(it.id);
    }
  }
  return { promoted, manual, results };
}
