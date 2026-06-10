/**
 * @clihub/core — shared domain types.
 *
 * These types are deliberately small and dependency-free. UI layers
 * (CLI, TUI, slash commands) consume them; provider implementations
 * fulfill them.
 */

export type Platform = 'macos' | 'linux' | 'windows';

export type InstallMethod = 'npm' | 'bun' | 'brew' | 'apt' | 'curl';

export interface DetectResult {
  installed: boolean;
  version?: string;
  path?: string;
}

export interface InstallOpts {
  method?: InstallMethod;
  version?: string;
  dryRun?: boolean;
}

export interface HealthReport {
  healthy: boolean;
  issues: string[];
}

export interface InstalledSkill {
  id: string;
  name: string;
  version: string;
  path: string;
}

/**
 * Map of tool id → supported flag. Tool ids match provider ids
 * (`claude-code`, `codex`, `kiro-cli`, `gemini-cli`, ...).
 */
export type Supports = Record<string, boolean | undefined>;

export interface SkillManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  supports: Supports;
  /** npm package, git url, or symbolic source like "oh-my-claudecode" */
  source: string;
  tags: string[];
}

/**
 * MCP (Model Context Protocol) server definition for the catalog.
 * Installing patches each CLI's settings file with a `mcpServers` entry
 * keyed by `id`.
 */
export type McpTransport = 'stdio' | 'http' | 'sse';

export interface McpServerManifest {
  id: string;
  name: string;
  description: string;
  supports: Supports;
  /** Transport. Defaults to 'stdio' when omitted. */
  transport?: McpTransport;
  /** Executable + args used to launch the server (stdio transport). */
  command?: string;
  args?: string[];
  /** Endpoint URL (http / sse transports). */
  url?: string;
  /** Optional headers for http / sse (e.g. Authorization). */
  headers?: Record<string, string>;
  /** Required env vars; user is prompted or instructed to set these. */
  env?: Record<string, string>;
  homepage?: string;
  tags?: string[];
}

/**
 * Plugin manifest. Plugins are heavier than skills (often a directory
 * tree with assets, slash commands, hooks) and are CLI-specific.
 */
export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  supports: Supports;
  /** Install source — usually a git URL. CLI-specific shorthands allowed. */
  source: string;
  homepage?: string;
  tags?: string[];
}

export interface InstalledPlugin {
  id: string;
  name: string;
  version: string;
  path: string;
}

export interface InstalledMcpServer {
  id: string;
  name: string;
  command: string;
  args?: string[];
}

export interface ToolCatalogEntry {
  id: string;
  name: string;
  description: string;
  homepage: string;
  installMethods: InstallMethod[];
  npmPackage?: string;
  supportedPlatforms: Platform[];
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  tools: string[];
  skills: string[];
}

/**
 * A named LLM API endpoint preset (v1.51). Switching endpoints writes the
 * preset's baseURL + key (by NAME) into each CLI's native config — it is NOT a
 * declarative CLI provider (see ToolProvider) and NOT a runtime proxy. Presets
 * carry an env-var NAME only; an inline secret is rejected by conformance.
 */
export type EndpointProtocol = 'anthropic' | 'openai' | 'google';

export interface EndpointPreset {
  id: string;
  label: string;
  /**
   * v2 (docs/25): wire protocol → base URL. One preset can serve several CLIs
   * (e.g. DeepSeek exposes both an anthropic- and an openai-compatible URL).
   */
  urls?: Partial<Record<EndpointProtocol, string>>;
  /** v1 legacy single-protocol shape — kept so older CLIs can read newer catalogs. */
  family?: EndpointProtocol;
  /** v1 legacy companion to `family`. */
  baseURL?: string;
  /** Default model hints (GUI/TUI pickers; not enforced). */
  models?: string[];
  /** NAME of the env var the credential lives under — never an inline secret. */
  authEnv?: string;
}

/**
 * Detect current platform. Windows is recognized but not yet supported
 * by any provider in v0.1.
 */
export function detectPlatform(): Platform {
  switch (process.platform) {
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    default:
      return 'linux';
  }
}
