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
import type { EndpointPreset } from '../types.js';

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
export function validateEndpointPreset(p: EndpointPreset): string[] {
  const errs: string[] = [];
  if (!p.id) errs.push('missing id');
  if (!p.label) errs.push(`${p.id}: missing label`);
  if (!ENDPOINT_FAMILIES.includes(p.family)) errs.push(`${p.id}: bad family "${p.family}"`);

  try {
    const u = new URL(p.baseURL);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') errs.push(`${p.id}: baseURL must be http(s)`);
    if (!u.host) errs.push(`${p.id}: baseURL missing host`);
  } catch {
    errs.push(`${p.id}: invalid baseURL "${p.baseURL}"`);
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
