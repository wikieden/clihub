/**
 * Per-profile BASE_URL injection.
 *
 * Writes the right vendor-specific env vars into each CLI's settings
 * file inside the active profile's vendor dir, so when the CLI launches
 * it sees the gateway URL the profile points at.
 *
 * We do *not* route traffic ourselves — that's data-plane work for
 * LiteLLM / Nyro. clihub is just the config adapter.
 *
 * Provider → env var:
 *   anthropic → ANTHROPIC_BASE_URL  (Claude Code reads from settings.env)
 *   openai    → OPENAI_BASE_URL     (Codex reads from config.toml [env])
 *   google    → GOOGLE_API_BASE     (Gemini reads from settings.env)
 *   kiro      → (no canonical setting yet — recorded in meta only)
 */
import path from 'node:path';
import { JsonSettingsAdapter } from '../settings/index.js';
import { TomlSettingsAdapter } from '../settings/toml.js';
import {
  defaultProfilesRoot,
  type ProfileBaseUrls,
  type VendorId,
} from './index.js';

interface ProviderInjector {
  vendor: VendorId;
  envVar: string;
  relativePath: string;
  /** Build the settings adapter scoped to the profile dir. */
  build(profileDir: string): {
    read: () => Promise<Record<string, unknown>>;
    write: (data: Record<string, unknown>) => Promise<void>;
  };
}

const INJECTORS: Partial<Record<keyof ProfileBaseUrls, ProviderInjector>> = {
  anthropic: {
    vendor: 'claude-code',
    envVar: 'ANTHROPIC_BASE_URL',
    relativePath: '.claude/settings.json',
    build: (dir) => {
      const ad = new JsonSettingsAdapter({ path: path.join(dir, '.claude', 'settings.json') });
      return {
        read: async () => ((await ad.read()) as Record<string, unknown>) ?? {},
        write: (data) => ad.write(data),
      };
    },
  },
  openai: {
    vendor: 'codex',
    envVar: 'OPENAI_BASE_URL',
    relativePath: '.codex/config.toml',
    build: (dir) => {
      const ad = new TomlSettingsAdapter({ path: path.join(dir, '.codex', 'config.toml') });
      return {
        read: async () => ((await ad.read()) as Record<string, unknown>) ?? {},
        write: (data) => ad.write(data),
      };
    },
  },
  google: {
    vendor: 'gemini-cli',
    envVar: 'GOOGLE_API_BASE',
    relativePath: '.gemini/settings.json',
    build: (dir) => {
      const ad = new JsonSettingsAdapter({ path: path.join(dir, '.gemini', 'settings.json') });
      return {
        read: async () => ((await ad.read()) as Record<string, unknown>) ?? {},
        write: (data) => ad.write(data),
      };
    },
  },
};

export interface ApplyBaseUrlsOpts {
  /** Profiles root override (tests). */
  root?: string;
}

export interface BaseUrlPatch {
  provider: keyof ProfileBaseUrls;
  vendor: VendorId;
  envVar: string;
  filePath: string;
  applied: boolean;
  detail?: string;
}

/**
 * Apply `baseUrls` to the profile's vendor settings. Only providers
 * with a value are touched; absent providers leave the file alone.
 * Returns the list of patches attempted.
 */
export async function applyProfileBaseUrls(
  profileName: string,
  baseUrls: ProfileBaseUrls | undefined,
  opts: ApplyBaseUrlsOpts = {},
): Promise<BaseUrlPatch[]> {
  if (!baseUrls) return [];
  const root = opts.root ?? defaultProfilesRoot();
  const profileDir = path.join(root, profileName);
  const out: BaseUrlPatch[] = [];

  for (const [provider, url] of Object.entries(baseUrls) as Array<[keyof ProfileBaseUrls, string | undefined]>) {
    const injector = INJECTORS[provider];
    if (!injector) continue;
    if (!url) continue;
    const { read, write } = injector.build(profileDir);
    try {
      const current = await read();
      const env = current.env && typeof current.env === 'object' && !Array.isArray(current.env)
        ? (current.env as Record<string, unknown>)
        : {};
      env[injector.envVar] = url;
      const next = { ...current, env };
      await write(next);
      out.push({
        provider,
        vendor: injector.vendor,
        envVar: injector.envVar,
        filePath: path.join(profileDir, injector.relativePath),
        applied: true,
      });
    } catch (err) {
      out.push({
        provider,
        vendor: injector.vendor,
        envVar: injector.envVar,
        filePath: path.join(profileDir, injector.relativePath),
        applied: false,
        detail: String(err),
      });
    }
  }
  return out;
}

/**
 * Remove the injected env var for a single provider from the profile's
 * vendor settings (no-op if absent).
 */
export async function clearProfileBaseUrl(
  profileName: string,
  provider: keyof ProfileBaseUrls,
  opts: ApplyBaseUrlsOpts = {},
): Promise<void> {
  const injector = INJECTORS[provider];
  if (!injector) return;
  const root = opts.root ?? defaultProfilesRoot();
  const profileDir = path.join(root, profileName);
  const { read, write } = injector.build(profileDir);
  try {
    const current = await read();
    if (!current.env || typeof current.env !== 'object') return;
    const env = current.env as Record<string, unknown>;
    if (!(injector.envVar in env)) return;
    delete env[injector.envVar];
    await write({ ...current, env });
  } catch {
    // Best-effort.
  }
}
