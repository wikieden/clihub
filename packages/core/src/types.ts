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

export interface SkillManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  supports: {
    'claude-code'?: boolean;
    codex?: boolean;
    kiro?: boolean;
  };
  /** npm package, git url, or symbolic source like "oh-my-claudecode" */
  source: string;
  tags: string[];
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
