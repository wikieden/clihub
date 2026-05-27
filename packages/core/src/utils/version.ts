/**
 * Extract a semver string from arbitrary `<tool> --version` output.
 *
 * Real-world outputs vary: `2.1.150 (Claude Code)`, `codex-cli 0.133.0`,
 * `0.37.2`, `0.12.224\n<git-sha>`. Picking by token index is fragile;
 * regex-match the first `MAJOR.MINOR(.PATCH)?` instead.
 *
 * Returns the version string or `undefined` if none found.
 */
export function parseVersion(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = raw.match(/\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?/);
  return match?.[0];
}
