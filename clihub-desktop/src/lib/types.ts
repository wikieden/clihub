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
