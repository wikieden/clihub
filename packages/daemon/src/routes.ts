/**
 * @clihub/daemon — kernel route table (GET reads + POST mutations).
 *
 * The ONE rule (architecture §1 "no logic forks"): every entry delegates to an
 * `@clihub/core` export and returns JSON-serializable data. Request bodies for
 * the POST routes mirror the equivalent CLI command's inputs 1:1, so the GUI can
 * never drift from the CLI. Mutations record a best-effort audit entry.
 *
 * Key format: "<METHOD> <pathname>".
 */
import {
  runHealthMatrix,
  listEndpoints,
  listProviders,
  listMcp,
  listProfiles,
  currentProfile,
  useEndpoint,
  addMcp,
  reconcileMcp,
  reconcileMcpPlan,
  runApply,
  planApply,
  useProfile,
  findClihubYaml,
  parseClihubYaml,
  appendAudit,
  type ToolProvider,
} from '@clihub/core';
import { readFile } from 'node:fs/promises';

export interface RouteCtx {
  /** Daemon/monorepo version, surfaced by /healthz. */
  version: string;
}

/** Handlers get ctx + the raw Request; POST handlers read the JSON body. */
export type RouteHandler = (ctx: RouteCtx, req: Request) => Promise<unknown>;

/** Carry an explicit HTTP status out of a handler (e.g. 400 for bad input). */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Parse a JSON-object request body, or 400. */
async function readJson(req: Request): Promise<Record<string, unknown>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, 'invalid JSON body');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpError(400, 'body must be a JSON object');
  }
  return raw as Record<string, unknown>;
}

function reqString(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new HttpError(400, `missing required string field "${key}"`);
  }
  return v;
}

function optString(body: Record<string, unknown>, key: string): string | undefined {
  const v = body[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw new HttpError(400, `field "${key}" must be a string`);
  return v;
}

/** A `ToolProvider` carries methods + adapters that can't cross the wire — project to data. */
function projectProvider(p: ToolProvider) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    homepage: p.homepage,
    supportedPlatforms: p.supportedPlatforms,
    skillCapable: Boolean(p.skillAdapter),
  };
}

/** Record a daemon-initiated mutation. Best-effort — never blocks the response. */
function audit(action: string, extra: Record<string, unknown>): void {
  void appendAudit({ actor: 'daemon', action, ...extra }).catch(() => {});
}

/** Load the clihub.yaml the CLI would discover (used when the body omits `yaml`). */
async function discoverYaml(): Promise<string> {
  const file = await findClihubYaml();
  if (!file) throw new HttpError(400, 'no clihub.yaml found; pass "yaml" in the body');
  return readFile(file, 'utf8');
}

export const ROUTES: Record<string, RouteHandler> = {
  // ── reads ────────────────────────────────────────────────────────────────
  'GET /healthz': async (ctx) => ({ ok: true, name: 'clihub-daemon', version: ctx.version }),
  'GET /v1/doctor': async () => ({ tools: await runHealthMatrix() }),
  'GET /v1/endpoints': async () => ({ endpoints: await listEndpoints() }),
  'GET /v1/providers': async () => ({ providers: listProviders().map(projectProvider) }),
  'GET /v1/mcp': async () => ({ servers: await listMcp({ all: true }) }),
  'GET /v1/profiles': async () => ({
    profiles: await listProfiles(),
    current: (await currentProfile()) ?? null,
  }),

  // ── mutations (bodies mirror the CLI 1:1; delegate to kernel + audit) ──────
  // `endpoint use <id>` — write a preset's baseURL into the active profile.
  'POST /v1/endpoint/use': async (_ctx, req) => {
    const body = await readJson(req);
    const id = reqString(body, 'id');
    const profile = optString(body, 'profile') ?? (await currentProfile());
    if (!profile) throw new HttpError(400, 'no active profile; pass "profile"');
    const result = await useEndpoint(id, profile);
    audit('endpoint.use', { id, profile });
    return result;
  },

  // `mcp add <id> [--command|--url|--transport]`.
  'POST /v1/mcp/add': async (_ctx, req) => {
    const body = await readJson(req);
    const id = reqString(body, 'id');
    const command = optString(body, 'command');
    const url = optString(body, 'url');
    const result = await addMcp(id, { command, url, transport: optString(body, 'transport') as never });
    // Audit only a real change, and record what actually happened (not just intent).
    if (result.done.length > 0) {
      audit('mcp.add', { id, done: result.done, failed: result.failed.map((f) => f.tool) });
    }
    return result;
  },

  // `mcp reconcile [--apply]` — preview is read-only; apply converges (union).
  'POST /v1/mcp/reconcile': async (_ctx, req) => {
    const body = await readJson(req);
    if (body.apply !== true) return reconcileMcpPlan({});
    const result = await reconcileMcp({});
    audit('mcp.reconcile', { promoted: result.promoted, manual: result.manual });
    return result;
  },

  // `apply [--plan]` — plan is read-only; otherwise run the converge engine.
  'POST /v1/apply': async (_ctx, req) => {
    const body = await readJson(req);
    const cfg = parseClihubYaml(optString(body, 'yaml') ?? (await discoverYaml()));
    if (body.plan === true) return planApply(cfg);
    const result = await runApply(cfg);
    audit('apply', { done: result.done.length, failed: result.failed.length });
    return result;
  },

  // `profile use <name> [--force]` — atomic vendor-dir symlink swap.
  'POST /v1/profile/use': async (_ctx, req) => {
    const body = await readJson(req);
    const name = reqString(body, 'name');
    const result = await useProfile(name, { force: body.force === true });
    audit('profile.use', { name, archived: result.archived });
    return result;
  },
};

/** Sorted "METHOD path" keys for the data routes. */
export function routeKeys(): string[] {
  return Object.keys(ROUTES).sort();
}
