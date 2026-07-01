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
  SKILL_ADAPTERS,
  readLockfile,
  systemPromptHash,
  computeStatus,
  getProvider,
  getToolProxy,
  setToolProxy,
  detectSystemProxy,
  listGuiApps,
  launchGuiAppWithProxy,
  guiLaunchSupported,
  listLaunchTargets,
  launchCliInTerminal,
  loadConfig,
  setConfigKey,
  collectUsage,
  collectQuota,
  formatErrorMessage,
  readBindings,
  useBinding,
  clearBinding,
  setModelBinding,
  BINDING_ADAPTERS,
  getSecret,
  readHistory,
  previousVersion,
  recordVersion,
  snapshotBeforeWrite,
  listTeams,
  addTeam,
  pullTeam,
  removeTeam,
  collectBundle,
  encryptBundle,
  type ToolProvider,
} from '@clihub/core';
import os from 'node:os';
import { mkdir } from 'node:fs/promises';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

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
async function discoverYaml(dir?: string): Promise<string> {
  const file = await findClihubYaml(dir);
  if (!file) throw new HttpError(400, 'no clihub.yaml found; pass "yaml" or "dir" in the body');
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
  'GET /v1/skills': async () => ({
    tools: await Promise.all(
      Object.entries(SKILL_ADAPTERS).map(async ([tool, factory]) => {
        // detect() distinguishes "CLI not installed" from "installed, zero
        // skills" — adapters return [] for both, which would render identically.
        const installed =
          (await getProvider(tool)
            ?.detect()
            .then((d) => d.installed, () => false)) ?? false;
        try {
          return { tool, installed, skills: await factory().list() };
        } catch (e) {
          return { tool, installed, skills: [], error: e instanceof Error ? e.message : String(e) };
        }
      }),
    ),
  }),
  // Mirrors `clihub use current` + adapter capabilities, in one call — the GUI
  // matrix needs both the live bindings AND what each CLI can do (endpoint-
  // switchable vs model-only, key deliverable or keyring-bound).
  'GET /v1/bindings': async () => ({
    bindings: await readBindings(),
    adapters: Object.values(BINDING_ADAPTERS).map((a) => ({
      cli: a.cli,
      protocols: a.protocols,
      modelOnly: a.protocols.length === 0,
      requiresModel: a.requiresModel === true,
      deliversKey: a.deliversKey === true,
    })),
  }),
  // `team list` — registered team config repos.
  'GET /v1/teams': async () => ({ teams: await listTeams() }),

  // Mirrors the `clihub` status PROXY column + `clihub proxy show`: each CLI's
  // own HTTP(S)_PROXY env (getToolProxy) plus the detected system proxy for a
  // one-click prefill. YAML-config CLIs (goose) can't take JSON env-injection,
  // so they report `supported: false` instead of a misleading empty proxy.
  'GET /v1/proxy': async () => {
    const system = await detectSystemProxy().catch(() => ({ source: 'none' as const }));
    const tools = await Promise.all(
      listProviders().map(async (p) => {
        const configPath = p.settingsAdapter.configPath();
        const supported = !/\.ya?ml$/i.test(configPath);
        const det = await p.detect().catch(() => ({ installed: false }));
        return {
          id: p.id,
          name: p.name,
          installed: Boolean(det.installed),
          supported,
          configPath,
          proxy: supported ? ((await getToolProxy(p.id).catch(() => undefined)) ?? null) : null,
        };
      }),
    );
    // `quickLaunchProxy`: the remembered tray/topbar quick-launch dropdown
    // value — a single shared convenience field, deliberately separate from
    // each desktop app's own independent proxy (see /v1/gui, /v1/launch-proxy).
    const cfg = await loadConfig().catch(() => ({}) as Awaited<ReturnType<typeof loadConfig>>);
    return { system, tools, quickLaunchProxy: cfg.quickLaunchProxy ?? null };
  },

  // Persist (or clear) the tray/topbar quick-launch dropdown's proxy so it's
  // remembered next session. One shared value across every quick-launch
  // target — NOT the same store as each desktop app's own proxy.
  'POST /v1/quick-launch-proxy': async (_ctx, req) => {
    const body = await readJson(req);
    const url = optString(body, 'url')?.trim() || undefined;
    await setConfigKey('quickLaunchProxy', url ?? '');
    audit('quickLaunchProxy.set', { url: url ?? null });
    return { quickLaunchProxy: url ?? null };
  },

  // Persist (or clear) one desktop GUI app's "Launch with proxy" url so it's
  // remembered next session. Fully independent per app id — setting one never
  // prefills or clears another. Blank url clears it.
  'POST /v1/launch-proxy': async (_ctx, req) => {
    const body = await readJson(req);
    const id = optString(body, 'id')?.trim();
    if (!id) throw new HttpError(400, 'field "id" (gui app id) is required');
    const url = optString(body, 'url')?.trim();
    await setConfigKey(`guiLaunchProxy.${id}`, url || undefined);
    audit('launchProxy.set', { id, url: url || null });
    return { id, launchProxy: url || null };
  },

  // Desktop GUI apps clihub can launch WITH a proxy applied (Claude desktop /
  // Codex desktop). Unlike per-CLI proxy, GUI apps don't read a config env —
  // clihub launches them with the proxy (chromium --proxy-server for Electron,
  // env for native). macOS-only; `supported` reflects the host OS. Each app's
  // remembered proxy is fully independent — never shared across apps.
  'GET /v1/gui': async () => {
    const cfg = await loadConfig().catch(() => ({}) as Awaited<ReturnType<typeof loadConfig>>);
    const remembered = cfg.guiLaunchProxy ?? {};
    const apps = listGuiApps().map((a) => ({ ...a, proxy: remembered[a.id] ?? null }));
    return { supported: guiLaunchSupported(), apps };
  },

  // CodexBar-style launcher matrix: per client, which launch methods exist
  // (GUI desktop app and/or CLI in a terminal) and whether each is installed.
  'GET /v1/launch': async () => ({ targets: await listLaunchTargets() }),

  // Token rollup across CLIs (read-only, tokens only — never a $ figure) for the
  // menubar panel's Usage section. Mirrors `clihub usage`.
  'GET /v1/usage': async () => collectUsage(),

  // Live rate-limit / quota rollup (Codex session+weekly+spark windows, Claude
  // session+weekly, plan, reset credits). Reuses each CLI's own credentials;
  // each fetcher is fault-isolated. Mirrors `clihub quota`.
  'GET /v1/quota': async (_ctx, req) => {
    const toolsParam = new URL(req.url).searchParams.get('tools');
    const tools = toolsParam ? toolsParam.split(',').filter(Boolean) : undefined;
    return collectQuota({ tools });
  },

  // The raw clihub.yaml for the editor panel (same discovery as `clihub status`).
  'GET /v1/yaml': async (_ctx, req) => {
    const startDir = new URL(req.url).searchParams.get('dir') ?? undefined;
    if (startDir && !path.isAbsolute(startDir)) {
      throw new HttpError(400, 'query "dir" must be an absolute path');
    }
    const file = await findClihubYaml(startDir);
    if (!file) throw new HttpError(400, formatErrorMessage('CLIHUB-E-600'));
    return { file, content: await readFile(file, 'utf8') };
  },

  // Mirrors `clihub tool history` across every provider, plus the rollback
  // target `clihub tool rollback` would pick (previous distinct version).
  'GET /v1/versions': async () => ({
    tools: await Promise.all(
      listProviders().map(async (p) => {
        const det = await p.detect().catch(() => ({ installed: false, version: undefined }));
        const history = await readHistory(p.id);
        const current = det.installed ? (det.version ?? null) : null;
        return {
          id: p.id,
          name: p.name,
          installed: Boolean(det.installed),
          current,
          target: previousVersion(history, current ?? undefined) ?? null,
          records: history.records,
        };
      }),
    ),
  }),
  // Mirrors `clihub status` exactly: clihub.yaml → clihub.lock.json →
  // system-prompt hash → computeStatus (the drift/compliance gate). The CLI
  // discovers the yaml from its cwd; a GUI daemon's cwd is wherever the shell
  // spawned it, so `?dir=` lets the client point at a project explicitly.
  'GET /v1/status': async (_ctx, req) => {
    const startDir = new URL(req.url).searchParams.get('dir') ?? undefined;
    if (startDir && !path.isAbsolute(startDir)) {
      throw new HttpError(400, 'query "dir" must be an absolute path');
    }
    const file = await findClihubYaml(startDir);
    if (!file) throw new HttpError(400, formatErrorMessage('CLIHUB-E-600'));
    const cfg = parseClihubYaml(await readFile(file, 'utf8'));
    const dir = path.dirname(file);
    const lock = await readLockfile(path.join(dir, 'clihub.lock.json'));
    const sph = await systemPromptHash(dir);
    const report = await computeStatus(cfg, lock, { systemPromptHash: sph });
    return { file, ...report };
  },

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

  // `use <endpoint> [--for <cli>] [--model <m>] [--skip-key]` — per-CLI binding.
  // Same key path as the CLI: clihub keychain via the active profile.
  'POST /v1/use': async (_ctx, req) => {
    const body = await readJson(req);
    const endpoint = reqString(body, 'endpoint');
    const cli = optString(body, 'cli');
    const model = optString(body, 'model');
    const result = await useBinding(endpoint, {
      cli,
      model,
      keyLookup: async (name) => getSecret((await currentProfile()) ?? 'default', name),
      allowMissingKey: body.skipKey === true,
    });
    audit('use.bind', { endpoint, cli: cli ?? result.targets.map((t) => t.cli).join(','), model: model ?? null });
    return result;
  },

  // `use clear [--for <cli>]` — restore official defaults.
  'POST /v1/use/clear': async (_ctx, req) => {
    const body = await readJson(req);
    const cli = optString(body, 'cli');
    const result = await clearBinding(cli);
    audit('use.clear', { cli: cli ?? result.targets.map((t) => t.cli).join(',') });
    return result;
  },

  // `model <cli> <model>` — model-only binding (the kiro/cursor path).
  'POST /v1/model': async (_ctx, req) => {
    const body = await readJson(req);
    const cli = reqString(body, 'cli');
    const model = reqString(body, 'model');
    const result = await setModelBinding(cli, model);
    audit('model.set', { cli, model });
    return result;
  },

  // `clihub proxy` per-CLI — write (or clear, when `url` is omitted/blank) the
  // HTTP(S)_PROXY env into one CLI's native config. Mirrors the TUI "Set proxy"
  // action 1:1 (setToolProxy → settingsAdapter env). YAML CLIs are rejected
  // with a 400 + shell-export guidance rather than a cryptic 500.
  'POST /v1/proxy': async (_ctx, req) => {
    const body = await readJson(req);
    const tool = reqString(body, 'tool');
    const provider = getProvider(tool);
    if (!provider) throw new HttpError(400, `unknown tool: ${tool}`);
    if (/\.ya?ml$/i.test(provider.settingsAdapter.configPath())) {
      throw new HttpError(
        400,
        `${tool} stores config as YAML; clihub can't inject proxy env there — set HTTPS_PROXY in your shell instead`,
      );
    }
    const raw = optString(body, 'url');
    const url = raw && raw.trim().length > 0 ? raw.trim() : undefined;
    await setToolProxy(tool, url);
    audit('proxy.set', { tool, url: url ?? null });
    return { tool, proxy: url ?? null };
  },

  // One-click launch a desktop GUI app with the proxy applied. `url` is
  // required (the panel passes the detected system proxy or a typed one).
  // Returns the launch result incl. the exact `open` argv for transparency.
  'POST /v1/gui/launch': async (_ctx, req) => {
    const body = await readJson(req);
    const id = reqString(body, 'id');
    const url = reqString(body, 'url').trim();
    if (!url) throw new HttpError(400, 'field "url" must be a non-empty proxy url');
    const result = launchGuiAppWithProxy(id, url);
    if (!result.launched) throw new HttpError(400, result.error ?? 'launch failed');
    audit('gui.launch', { id, url });
    return result;
  },

  // One-click open a client's CLI in the OS terminal, with the proxy injected
  // as env for that session. `url` is optional (blank = no proxy override).
  'POST /v1/launch/cli': async (_ctx, req) => {
    const body = await readJson(req);
    const toolId = reqString(body, 'tool');
    const proxy = optString(body, 'url')?.trim() || undefined;
    const result = await launchCliInTerminal(toolId, { proxy });
    if (!result.launched) throw new HttpError(400, result.error ?? 'launch failed');
    audit('cli.launch', { tool: toolId, url: proxy ?? null });
    return result;
  },

  // Save the edited clihub.yaml. parseClihubYaml is a LENIENT parser (it
  // skips lines it doesn't understand — schema enforcement is `clihub
  // schema`/conformance territory), so the parse here is a sanity pass, not
  // a gate. The real safety net is snapshotBeforeWrite: the previous file
  // content is snapshotted before the atomic tmp+rename replaces it.
  'POST /v1/yaml': async (_ctx, req) => {
    const body = await readJson(req);
    const content = reqString(body, 'content');
    const dir = optString(body, 'dir');
    if (dir && !path.isAbsolute(dir)) throw new HttpError(400, 'field "dir" must be an absolute path');
    let cfg;
    try {
      cfg = parseClihubYaml(content);
    } catch (e) {
      throw new HttpError(400, `invalid clihub.yaml: ${e instanceof Error ? e.message : String(e)}`);
    }
    const file = await findClihubYaml(dir);
    if (!file) throw new HttpError(400, formatErrorMessage('CLIHUB-E-600'));
    const normalized = content.endsWith('\n') ? content : content + '\n';
    await snapshotBeforeWrite(file, normalized);
    const tmp = `${file}.tmp`;
    await writeFile(tmp, normalized, 'utf8');
    await rename(tmp, file);
    audit('yaml.save', { file, tools: cfg.tools.length, skills: cfg.skills.length });
    return { file, tools: cfg.tools.length, skills: cfg.skills.length, mcp: cfg.mcp.length, plugins: cfg.plugins.length };
  },

  // `team add <name> <git-url>` — clone a shared team config repo.
  'POST /v1/team/add': async (_ctx, req) => {
    const body = await readJson(req);
    const name = reqString(body, 'name');
    const gitUrl = reqString(body, 'gitUrl');
    const dir = await addTeam(name, gitUrl);
    audit('team.add', { name, gitUrl });
    return { name, dir };
  },

  // `team pull <name>` — fetch the latest shared config.
  'POST /v1/team/pull': async (_ctx, req) => {
    const body = await readJson(req);
    const name = reqString(body, 'name');
    await pullTeam(name);
    audit('team.pull', { name });
    return { name, pulled: true };
  },

  // `team rm <name>`.
  'POST /v1/team/rm': async (_ctx, req) => {
    const body = await readJson(req);
    const name = reqString(body, 'name');
    const removed = await removeTeam(name);
    if (removed) audit('team.rm', { name });
    return { name, removed };
  },

  // `sync export` — E2E-encrypted config bundle written under ~/.clihub/
  // (never a user-chosen arbitrary path from the GUI). The passphrase rides
  // the loopback request body only — it is NOT audited or logged.
  'POST /v1/sync/export': async (ctx, req) => {
    const body = await readJson(req);
    const passphrase = reqString(body, 'passphrase');
    const bundle = await collectBundle(ctx.version);
    const encrypted = encryptBundle(bundle, passphrase);
    const dir = path.join(os.homedir(), '.clihub');
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `sync-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    await writeFile(file, encrypted, { mode: 0o600 });
    audit('sync.export', { file, files: bundle.files.length });
    return { file, files: bundle.files.length };
  },

  // `tool rollback <id>` — re-install the previous recorded version.
  'POST /v1/rollback': async (_ctx, req) => {
    const body = await readJson(req);
    const tool = reqString(body, 'tool');
    const provider = getProvider(tool);
    if (!provider) throw new HttpError(400, `unknown tool "${tool}"`);
    const det = await provider.detect();
    const history = await readHistory(tool);
    const target = previousVersion(history, det.version);
    if (!target) {
      throw new HttpError(400, `no prior version recorded for ${tool} — clihub only knows versions it installed`);
    }
    await provider.install({ version: target, dryRun: false });
    await recordVersion(tool, { version: target, method: 'npm', rolledBack: true });
    audit('tool.rollback', { tool, from: det.version ?? null, to: target });
    return { tool, from: det.version ?? null, to: target };
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
    const dir = optString(body, 'dir');
    if (dir && !path.isAbsolute(dir)) throw new HttpError(400, 'field "dir" must be an absolute path');
    const cfg = parseClihubYaml(optString(body, 'yaml') ?? (await discoverYaml(dir)));
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
