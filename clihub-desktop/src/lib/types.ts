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
  /** v2 multi-protocol map (anthropic/openai/google → base URL). */
  urls?: Record<string, string>;
  /** Legacy v1 fields (still emitted for older readers). */
  family?: string;
  baseURL?: string;
  models?: string[];
  authEnv?: string;
}

export interface EndpointsResponse {
  endpoints: EndpointPreset[];
}

/** GET /v1/bindings — live per-CLI bindings + what each CLI can do. */
export interface CliBindingRow {
  endpoint?: string;
  model?: string;
}

export interface BindingAdapterRow {
  cli: string;
  protocols: string[];
  modelOnly: boolean;
  requiresModel: boolean;
  deliversKey: boolean;
}

export interface BindingsResponse {
  bindings: Record<string, CliBindingRow>;
  adapters: BindingAdapterRow[];
}

/** POST /v1/use result (subset the panel renders). */
export interface UseResultRow {
  targets: Array<{
    cli: string;
    protocol: string;
    keyDelivered: boolean;
    patches: Array<{ field: string; applied: boolean; detail?: string }>;
  }>;
  bindings: Record<string, CliBindingRow>;
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

/** GET /v1/versions — per-tool install history + the rollback target. */
export interface VersionRecordRow {
  version: string;
  at: string;
  method?: string;
  rolledBack?: boolean;
}

export interface VersionToolRow {
  id: string;
  name: string;
  installed: boolean;
  current: string | null;
  target: string | null;
  records: VersionRecordRow[];
}

export interface VersionsResponse {
  tools: VersionToolRow[];
}

export interface RollbackResult {
  tool: string;
  from: string | null;
  to: string;
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

/** GET /v1/proxy — detected system proxy + each CLI's own HTTP(S)_PROXY env. */
export interface SystemProxyRow {
  url?: string;
  http?: string;
  https?: string;
  source: 'env' | 'macos' | 'none';
}

export interface ProxyToolRow {
  id: string;
  name: string;
  installed: boolean;
  /** false for YAML-config CLIs (goose) — clihub can't inject env there. */
  supported: boolean;
  configPath: string;
  proxy: string | null;
}

export interface ProxyResponse {
  system: SystemProxyRow;
  tools: ProxyToolRow[];
}

export interface ProxySetResult {
  tool: string;
  proxy: string | null;
}

/** GET /v1/gui — desktop GUI apps clihub can launch with a proxy applied.
 * Each app's remembered proxy is fully independent of every other app. */
export interface GuiAppRow {
  id: string;
  name: string;
  installed: boolean;
  osSupported: boolean;
  mechanism: 'electron-flag' | 'env';
  note?: string;
  /** This app's own remembered "Launch with proxy" url, or null if unset. */
  proxy: string | null;
}

export interface GuiResponse {
  supported: boolean;
  apps: GuiAppRow[];
}

/** GET /v1/auth — cross-CLI credential/expiry visibility (read-only, never
 * the token itself). "not found" ≠ logged out — paths are best-effort. */
export interface CredentialRow {
  tool: string;
  label: string;
  found: boolean;
  path?: string;
  modified?: string;
  expiresAt?: string;
  expired?: boolean;
}

/** Shared shape for GET /v1/memory and GET /v1/prompt (cross-CLI block sync). */
export interface SyncPlanItem {
  tool: string;
  label: string;
  path: string;
  verb: 'create' | 'update' | 'unchanged' | 'skip';
  detail?: string;
}

export interface SyncPlanResponse {
  file: string | null;
  plan: SyncPlanItem[];
}

export interface SyncGenerateResult {
  written: SyncPlanItem[];
  failed: Array<{ tool: string; path: string; error: string }>;
}

/** GET /v1/doctor/network — on-demand vendor API reachability probe
 * (mirrors `clihub doctor --check-network`). Never run automatically. */
export interface NetworkProbeRow {
  toolId: string;
  host: string;
  proxy?: string;
  status?: number;
  latencyMs?: number;
  error?: string;
}

/** GET /v1/quota — live rate-limit rollup (mirrors `clihub quota`). Shared
 * between Popover (quick-glance) and the main-window Quota panel. */
export interface QuotaWindow {
  id: string;
  label: string;
  usedPercent: number;
  remainingPercent: number;
  resetsAt?: string;
  resetsInSeconds?: number;
  resetLabel?: string;
}

export interface QuotaSnapshot {
  tool: string;
  label: string;
  supported: boolean;
  account?: string;
  plan?: string;
  windows: QuotaWindow[];
  credits?: { available: number; nextExpiresInSeconds?: number };
  updatedAt: string;
  error?: string;
}

export interface QuotaResponse {
  snapshots: QuotaSnapshot[];
}
