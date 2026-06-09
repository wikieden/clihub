/**
 * @clihub/daemon — kernel route table.
 *
 * The ONE rule (architecture §1 "no logic forks"): every entry below delegates
 * to an `@clihub/core` export and returns JSON-serializable data. No domain
 * logic lives here. Golden-parity tests prove `route result === direct kernel
 * call`, so the GUI can never drift from the CLI.
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
  type ToolProvider,
} from '@clihub/core';

export interface RouteCtx {
  /** Daemon/monorepo version, surfaced by /healthz. */
  version: string;
}

export type RouteHandler = (ctx: RouteCtx) => Promise<unknown>;

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

/**
 * Read-only routes (increment 1). Mutating routes (endpoint use / apply / mcp
 * add) come later behind the same delegation rule + an audit entry.
 */
export const ROUTES: Record<string, RouteHandler> = {
  'GET /healthz': async (ctx) => ({ ok: true, name: 'clihub-daemon', version: ctx.version }),
  'GET /v1/doctor': async () => ({ tools: await runHealthMatrix() }),
  'GET /v1/endpoints': async () => ({ endpoints: await listEndpoints() }),
  'GET /v1/providers': async () => ({ providers: listProviders().map(projectProvider) }),
  'GET /v1/mcp': async () => ({ servers: await listMcp({ all: true }) }),
  'GET /v1/profiles': async () => ({
    profiles: await listProfiles(),
    current: (await currentProfile()) ?? null,
  }),
};

/** Sorted "METHOD path" keys — used by the self-describing route index. */
export function routeKeys(): string[] {
  return Object.keys(ROUTES).sort();
}
