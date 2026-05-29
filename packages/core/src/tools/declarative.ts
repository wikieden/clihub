/**
 * Declarative providers (v0.10.0, provider SDK).
 *
 * Add support for a new AI CLI WITHOUT writing a TypeScript provider or
 * forking clihub: describe it with a small JSON spec (how to detect it,
 * how to install it) and clihub builds a real ToolProvider from it. Specs
 * live in `~/.clihub/providers.json` and/or a catalog's `providers.json`.
 *
 *   - makeProvider(spec)          → a ToolProvider backed by the spec
 *   - loadExternalProviders()     → read spec files + register them
 *   - addProviderSpec / removeProviderSpec → manage ~/.clihub/providers.json
 *
 * SECURITY: `install.script` / `install.command` run an arbitrary shell
 * command. A catalog you federate could ship a malicious one, so these
 * methods are REFUSED unless the caller explicitly opts in (allowScripts).
 * The package-manager methods (npm / bun / brew) run a named package
 * through a trusted package manager and are allowed by default.
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { whichCmd } from '../utils/which.js';
import { parseVersion } from '../utils/version.js';
import { JsonSettingsAdapter } from '../settings/index.js';
import { registerProvider } from './registry.js';
import type {
  DetectResult,
  HealthReport,
  InstallMethod,
  InstallOpts,
  Platform,
  SettingsAdapter,
  ToolProvider,
} from './types.js';

const execFileP = promisify(execFile);

/** Built-in provider ids a declarative spec may never shadow. */
export const BUILTIN_PROVIDER_IDS = new Set([
  'claude-code',
  'codex',
  'kiro-cli',
  'gemini-cli',
  'cursor',
  'goose',
]);

export interface DeclarativeInstall {
  /** npm package name → `npm install -g <pkg>`. */
  npm?: string;
  /** package name → `bun add -g <pkg>`. */
  bun?: string;
  /** brew formula → `brew install <formula>`. */
  brew?: string;
  /** Shell snippet (e.g. a curl|sh install line). Gated by allowScripts. */
  script?: string;
  /** Raw command run via `sh -c`. Gated by allowScripts. */
  command?: string;
}

export interface DeclarativeProviderSpec {
  id: string;
  name: string;
  description?: string;
  homepage?: string;
  /** Binary name used for detection (whichCmd) and version probing. */
  bin: string;
  /** Args to print the version (default: ['--version']). */
  versionArgs?: string[];
  supportedPlatforms?: Platform[];
  install: DeclarativeInstall;
  /** Optional JSON settings file (\`~\` expanded). */
  configPath?: string;
}

export interface ProviderSpecsFile {
  version: 1;
  providers: DeclarativeProviderSpec[];
}

export interface MakeProviderOpts {
  /** Permit install.script / install.command (arbitrary shell). Default false. */
  allowScripts?: boolean;
}

function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

/** Throw if a spec is missing required fields. */
export function validateProviderSpec(spec: DeclarativeProviderSpec): void {
  if (!spec || typeof spec !== 'object') throw new Error('provider spec must be an object');
  if (!spec.id || !/^[a-z0-9][a-z0-9-]*$/.test(spec.id)) throw new Error(`invalid provider id: ${String(spec.id)}`);
  if (!spec.name) throw new Error(`provider ${spec.id}: missing name`);
  if (!spec.bin) throw new Error(`provider ${spec.id}: missing bin`);
  if (!spec.install || Object.keys(spec.install).length === 0) throw new Error(`provider ${spec.id}: no install method`);
}

function installMethodsOf(spec: DeclarativeProviderSpec): InstallMethod[] {
  const m: InstallMethod[] = [];
  if (spec.install.npm) m.push('npm');
  if (spec.install.bun) m.push('bun');
  if (spec.install.brew) m.push('brew');
  if (spec.install.script || spec.install.command) m.push('curl');
  return m;
}

function noopAdapter(configPath: string): SettingsAdapter {
  return {
    configPath: () => configPath,
    read: async () => ({}),
    write: async () => {},
    validate: () => true,
    backup: async () => '',
  };
}

/** Build a ToolProvider from a declarative spec. */
export function makeProvider(spec: DeclarativeProviderSpec, opts: MakeProviderOpts = {}): ToolProvider {
  validateProviderSpec(spec);
  const versionArgs = spec.versionArgs ?? ['--version'];
  const settingsAdapter: SettingsAdapter = spec.configPath
    ? new JsonSettingsAdapter({ path: expandHome(spec.configPath) })
    : noopAdapter('');

  async function runInstall(method: InstallMethod, version?: string): Promise<void> {
    if (method === 'npm' && spec.install.npm) {
      await execFileP('npm', ['install', '-g', version ? `${spec.install.npm}@${version}` : spec.install.npm]);
      return;
    }
    if (method === 'bun' && spec.install.bun) {
      await execFileP('bun', ['add', '-g', version ? `${spec.install.bun}@${version}` : spec.install.bun]);
      return;
    }
    if (method === 'brew' && spec.install.brew) {
      await execFileP('brew', ['install', spec.install.brew]);
      return;
    }
    const shell = spec.install.command ?? spec.install.script;
    if (shell) {
      if (!opts.allowScripts) {
        throw new Error(
          `provider ${spec.id} installs via a shell command; re-run with --allow-scripts to permit it (review the command first)`,
        );
      }
      await execFileP('sh', ['-c', shell]);
      return;
    }
    throw new Error(`provider ${spec.id}: no usable install method for "${method}"`);
  }

  return {
    id: spec.id,
    name: spec.name,
    description: spec.description ?? `${spec.name} (declarative provider)`,
    homepage: spec.homepage ?? '',
    supportedPlatforms: spec.supportedPlatforms ?? ['macos', 'linux', 'windows'],
    installMethods: installMethodsOf(spec),

    async detect(): Promise<DetectResult> {
      const binPath = await whichCmd(spec.bin);
      if (!binPath) return { installed: false };
      let version: string | undefined;
      try {
        const { stdout } = await execFileP(spec.bin, versionArgs);
        version = parseVersion(stdout);
      } catch {
        /* version probe failed; still installed */
      }
      return { installed: true, path: binPath, version };
    },

    async install(installOpts: InstallOpts = {}): Promise<void> {
      const method = installOpts.method ?? installMethodsOf(spec)[0];
      if (!method) throw new Error(`provider ${spec.id}: no install method`);
      if (installOpts.dryRun) return;
      await runInstall(method, installOpts.version);
    },

    async uninstall(): Promise<void> {
      if (spec.install.npm) { try { await execFileP('npm', ['uninstall', '-g', spec.install.npm]); return; } catch { /* fall through */ } }
      if (spec.install.bun) { try { await execFileP('bun', ['remove', '-g', spec.install.bun]); return; } catch { /* fall through */ } }
      if (spec.install.brew) { try { await execFileP('brew', ['uninstall', spec.install.brew]); } catch { /* best-effort */ } }
    },

    async update(): Promise<void> {
      await this.install({ version: 'latest' });
    },

    async doctor(): Promise<HealthReport> {
      const det = await this.detect();
      return { healthy: det.installed, issues: det.installed ? [] : [`${spec.name} is not installed`] };
    },

    settingsAdapter,
  };
}

export function parseProvidersJson(text: string): DeclarativeProviderSpec[] {
  const data = JSON.parse(text) as ProviderSpecsFile | DeclarativeProviderSpec[];
  const specs = Array.isArray(data) ? data : data.providers;
  if (!Array.isArray(specs)) throw new Error('providers file must be an array or { providers: [...] }');
  for (const s of specs) validateProviderSpec(s);
  return specs;
}

export function defaultProvidersPath(): string {
  return path.join(os.homedir(), '.clihub', 'providers.json');
}

async function readSpecsFromFile(file: string): Promise<DeclarativeProviderSpec[]> {
  try {
    return parseProvidersJson(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function readProviderSpecsFile(file = defaultProvidersPath()): Promise<DeclarativeProviderSpec[]> {
  return readSpecsFromFile(file);
}

async function writeSpecs(specs: DeclarativeProviderSpec[], file: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const payload: ProviderSpecsFile = { version: 1, providers: specs };
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, file);
}

/** Add (or replace by id) a spec in `~/.clihub/providers.json`. */
export async function addProviderSpec(spec: DeclarativeProviderSpec, file = defaultProvidersPath()): Promise<void> {
  validateProviderSpec(spec);
  const specs = (await readSpecsFromFile(file)).filter((s) => s.id !== spec.id);
  specs.push(spec);
  await writeSpecs(specs, file);
}

export async function removeProviderSpec(id: string, file = defaultProvidersPath()): Promise<boolean> {
  const specs = await readSpecsFromFile(file);
  const next = specs.filter((s) => s.id !== id);
  if (next.length === specs.length) return false;
  await writeSpecs(next, file);
  return true;
}

export interface LoadExternalProvidersOpts {
  /** User spec file (default ~/.clihub/providers.json). */
  file?: string;
  /** A synced catalog dir whose providers.json should also be loaded. */
  catalogDir?: string;
  /** Permit script/command install methods on the built providers. */
  allowScripts?: boolean;
}

export interface LoadExternalProvidersResult {
  registered: string[];
  skipped: Array<{ id: string; reason: string }>;
}

/**
 * Read declarative specs from the user file and (optionally) a catalog
 * dir, then register each as a ToolProvider. Built-in providers are never
 * overridden — a spec colliding with a built-in id is skipped.
 */
export async function loadExternalProviders(
  opts: LoadExternalProvidersOpts = {},
): Promise<LoadExternalProvidersResult> {
  const file = opts.file ?? defaultProvidersPath();
  const registered: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  const specs = [...(await readSpecsFromFile(file))];
  if (opts.catalogDir) {
    specs.push(...(await readSpecsFromFile(path.join(opts.catalogDir, 'providers.json'))));
  }

  const seen = new Set<string>();
  for (const spec of specs) {
    if (seen.has(spec.id)) continue;
    seen.add(spec.id);
    if (BUILTIN_PROVIDER_IDS.has(spec.id)) {
      // never let a declarative spec shadow a built-in provider
      skipped.push({ id: spec.id, reason: 'built-in provider with this id exists' });
      continue;
    }
    try {
      registerProvider(makeProvider(spec, { allowScripts: opts.allowScripts }));
      registered.push(spec.id);
    } catch (e) {
      skipped.push({ id: spec.id, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { registered, skipped };
}
