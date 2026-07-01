/**
 * `clihub endpoint` — LLM API endpoint presets (v1.51).
 *
 * An EndpointPreset is a named {baseURL, family, key-NAME} bundle (Anthropic,
 * OpenAI, DeepSeek, …). It is NOT a declarative CLI provider (`clihub provider`)
 * and NOT a runtime proxy. v1.51 ships the signed catalog + listing + validation;
 * `endpoint use <id>` (writing the preset into each CLI's native config via the
 * base-URL injectors) lands in v1.52.
 *
 * Conformance: a preset carries an env-var NAME only — an inline secret value is
 * rejected, and the baseURL must be a real http(s) URL with a host.
 */
import { CatalogLoader } from '../catalog/index.js';
import type { EndpointPreset, EndpointProtocol } from '../types.js';
import { applyProfileBaseUrls, type BaseUrlPatch } from '../profile/baseurls.js';
import { readProfileMeta, writeProfileMeta, type ProfileBaseUrls } from '../profile/index.js';

export type { EndpointPreset };

/** Value shapes that must never appear inline in a preset. */
const SECRET_SHAPES: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
];

export const ENDPOINT_FAMILIES = ['anthropic', 'openai', 'google'] as const;

export async function listEndpoints(loader = new CatalogLoader()): Promise<EndpointPreset[]> {
  return (await loader.load()).endpoints;
}

export async function findEndpoint(
  id: string,
  loader = new CatalogLoader(),
): Promise<EndpointPreset | undefined> {
  return (await loader.load()).endpoints.find((e) => e.id === id);
}

/** Conformance validation. Returns a list of human-readable errors (empty = ok). */
/**
 * Normalized protocol→URL map for a preset: v2 `urls` wins; the v1
 * `family`+`baseURL` pair is upgraded in memory. Empty map = unusable preset.
 */
export function endpointUrls(p: EndpointPreset): Partial<Record<EndpointProtocol, string>> {
  if (p.urls && Object.keys(p.urls).length > 0) return p.urls;
  if (p.family && p.baseURL) return { [p.family]: p.baseURL };
  return {};
}

export function validateEndpointPreset(p: EndpointPreset): string[] {
  const errs: string[] = [];
  if (!p.id) errs.push('missing id');
  if (!p.label) errs.push(`${p.id}: missing label`);
  if (p.family !== undefined && !ENDPOINT_FAMILIES.includes(p.family)) {
    errs.push(`${p.id}: bad family "${p.family}"`);
  }

  const urlEntries = Object.entries(endpointUrls(p));
  if (urlEntries.length === 0) errs.push(`${p.id}: no URLs (need urls{} or family+baseURL)`);
  for (const [proto, raw] of urlEntries) {
    if (!ENDPOINT_FAMILIES.includes(proto as EndpointProtocol)) {
      errs.push(`${p.id}: bad protocol "${proto}"`);
    }
    try {
      const u = new URL(raw as string);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') errs.push(`${p.id}: ${proto} baseURL must be http(s)`);
      if (!u.host) errs.push(`${p.id}: ${proto} baseURL missing host`);
    } catch {
      errs.push(`${p.id}: invalid baseURL "${raw}"`);
    }
  }

  // authEnv must be an env-var NAME, never an inline secret.
  if (p.authEnv !== undefined && !/^[A-Z][A-Z0-9_]*$/.test(p.authEnv)) {
    errs.push(`${p.id}: authEnv must be an env-var NAME (UPPER_SNAKE), got "${p.authEnv}"`);
  }
  const blob = JSON.stringify(p);
  if (SECRET_SHAPES.some((re) => re.test(blob))) {
    errs.push(`${p.id}: preset contains an inline secret (forbidden — use authEnv NAME only)`);
  }
  return errs;
}

export interface UseEndpointResult {
  preset: EndpointPreset;
  profile: string;
  patches: BaseUrlPatch[];
}

export interface UseEndpointOpts {
  /** Profiles root override (tests). */
  root?: string;
  /** Catalog loader override (tests). */
  loader?: CatalogLoader;
}

/**
 * Switch a profile to an endpoint preset (v1.52): writes the preset's baseURL
 * into the matching family's native CLI config via the existing base-URL
 * injectors, and records it in the profile meta. The credential is NOT moved —
 * it stays in the OS keychain under the preset's authEnv NAME.
 *
 * Only the anthropic / openai families have base-URL injectors today (Claude
 * Code / Codex); other families — including google (Antigravity has no
 * base-URL concept) — return zero patches.
 */
export async function useEndpoint(
  id: string,
  profileName: string,
  opts: UseEndpointOpts = {},
): Promise<UseEndpointResult> {
  const preset = await findEndpoint(id, opts.loader);
  if (!preset) throw new Error(`unknown endpoint preset "${id}" (run \`clihub endpoint\` to list)`);
  const urls = endpointUrls(preset);
  const family = preset.family ?? (Object.keys(urls)[0] as EndpointProtocol | undefined);
  const familyUrl = family ? urls[family] : undefined;
  if (!family || !familyUrl) throw new Error(`endpoint "${id}" has no usable URL`);
  const baseUrls: ProfileBaseUrls = { [family]: familyUrl };
  const patches = await applyProfileBaseUrls(profileName, baseUrls, { root: opts.root });
  try {
    const meta = await readProfileMeta(profileName, { root: opts.root });
    await writeProfileMeta(
      profileName,
      { baseUrls: { ...meta.baseUrls, [family]: familyUrl } },
      { root: opts.root },
    );
  } catch {
    // meta is best-effort; the settings write above is the source of truth
  }
  return { preset, profile: profileName, patches };
}

/** Validate every preset in the catalog; returns id→errors for any that fail. */
export async function validateEndpointCatalog(
  loader = new CatalogLoader(),
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const p of await listEndpoints(loader)) {
    const errs = validateEndpointPreset(p);
    if (errs.length) out[p.id] = errs;
  }
  return out;
}
