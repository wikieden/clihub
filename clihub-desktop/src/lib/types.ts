/**
 * Wire types — the JSON shapes the @clihub/daemon routes return. These mirror
 * the daemon contract (not @clihub/core directly): the SPA is a separate build,
 * coupled only by the HTTP/JSON surface. Kept intentionally loose where the
 * kernel row shape may carry extra fields.
 */

export interface HealthRow {
  id: string;
  installed?: boolean;
  version?: string | null;
  skillCount?: number;
  mcpCount?: number;
  [extra: string]: unknown;
}

export interface DoctorResponse {
  tools: HealthRow[];
}

export interface EndpointPreset {
  id: string;
  label: string;
  family: string;
  baseURL: string;
  models?: string[];
  authEnv?: string;
}

export interface EndpointsResponse {
  endpoints: EndpointPreset[];
}

export interface ProfilesResponse {
  profiles: string[];
  current: string | null;
}

export interface McpServerRow {
  id: string;
  [extra: string]: unknown;
}

export interface McpToolRow {
  tool: string;
  servers: McpServerRow[];
}

export interface McpResponse {
  servers: McpToolRow[];
}

export interface McpReconcileItem {
  id: string;
  presentIn: string[];
  absentIn: string[];
  state: 'synced' | 'drift';
}

export interface McpReconcilePlan {
  tools: string[];
  items: McpReconcileItem[];
  driftCount: number;
}

export interface McpReconcileResult {
  promoted: string[];
  manual: string[];
  /** Per-promotion kernel results — `failed` entries are partial failures. */
  results: { done: string[]; failed: { tool: string; error: string }[] }[];
}

export interface InstalledSkillRow {
  id: string;
  name: string;
  version: string;
  path: string;
}

export interface SkillToolRow {
  tool: string;
  installed: boolean;
  skills: InstalledSkillRow[];
  error?: string;
}

export interface SkillsResponse {
  tools: SkillToolRow[];
}

export interface StatusItemRow {
  kind: string;
  id: string;
  state: string;
  locked?: string;
  actual?: string;
  detail?: string;
}

export interface StatusResponse {
  file: string;
  items: StatusItemRow[];
  ok: number;
  drift: number;
  missing: number;
  unlocked: number;
  compliant: boolean;
}
