/**
 * Tool provider contracts. Re-exports shared domain types so consumers
 * can `import { ToolProvider, DetectResult } from '@clihub/core/tools'`.
 */
import type {
  DetectResult,
  HealthReport,
  InstallMethod,
  InstallOpts,
  InstalledSkill,
  Platform,
  SkillManifest,
} from '../types.js';

export type {
  DetectResult,
  HealthReport,
  InstallMethod,
  InstallOpts,
  InstalledSkill,
  Platform,
  SkillManifest,
};

export interface SettingsAdapter {
  /** Absolute path to the tool's settings file (e.g. ~/.claude/settings.json). */
  configPath(): string;
  read(): Promise<unknown>;
  write(data: unknown): Promise<void>;
  validate(data: unknown): boolean;
  /** Copy current settings to a timestamped sibling file; returns the backup path. */
  backup(): Promise<string>;
}

export interface SkillSyncAdapter {
  install(skill: SkillManifest, source: string): Promise<void>;
  uninstall(skillId: string): Promise<void>;
  list(): Promise<InstalledSkill[]>;
}

export interface ToolProvider {
  id: string;
  name: string;
  description: string;
  homepage: string;
  supportedPlatforms: Platform[];
  installMethods: InstallMethod[];
  detect(): Promise<DetectResult>;
  install(opts: InstallOpts): Promise<void>;
  uninstall(): Promise<void>;
  update(): Promise<void>;
  doctor(): Promise<HealthReport>;
  configure?(): Promise<void>;
  settingsAdapter: SettingsAdapter;
  skillAdapter?: SkillSyncAdapter;
}
