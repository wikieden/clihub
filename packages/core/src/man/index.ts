/**
 * Auto-generated `man clihub` page (groff format).
 *
 * Kept compact and hand-tuned. We don't try to scrape help text from
 * cac — easier to maintain alongside the README than to round-trip
 * through reflection.
 */

export function generateMan(version: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `.TH CLIHUB 1 "${today}" "clihub ${version}" "User Commands"
.SH NAME
clihub \\- install + sync + rollback control plane for AI coding CLIs
.SH SYNOPSIS
.B clihub
[\\fIcommand\\fR] [\\fIoptions\\fR]
.SH DESCRIPTION
.B clihub
installs and manages multiple AI coding CLIs (Claude Code, OpenAI Codex,
Google Gemini, AWS Kiro) side by side. It keeps their skills, plugins
and MCP servers in sync and ships one-command rollback when an upgrade
breaks something.
.PP
Run with no arguments to enter the interactive TUI.
.SH COMMANDS
.TP
.B tool \\fIaction\\fR [\\fIid\\fR]
Manage CLIs. Actions: \\fBlist\\fR, \\fBinstall\\fR, \\fBuninstall\\fR, \\fBupdate\\fR.
.TP
.B doctor \\fR[\\fIid\\fR] [\\fB--json\\fR]
Cross-CLI health matrix: install status, version, settings path,
skill / MCP counts.
.TP
.B skill \\fIaction\\fR [\\fIid|git-url|path\\fR]
Manage skills. Actions: \\fBlist\\fR, \\fBinstall\\fR, \\fBuninstall\\fR.
The install argument may be a catalog id, a git URL, or a local path
containing SKILL.md (agentskills.io format).
.TP
.B preset \\fIaction\\fR [\\fIid\\fR]
Manage preset bundles (tools + skills + MCP + plugins).
Actions: \\fBlist\\fR, \\fBapply\\fR.
.TP
.B plugin \\fIaction\\fR [\\fIid\\fR] [\\fB--tool\\fR \\fIcli\\fR]
Manage plugins (currently Claude Code only).
Actions: \\fBlist\\fR, \\fBinstall\\fR, \\fBuninstall\\fR, \\fBupdate\\fR.
.TP
.B catalog \\fIaction\\fR [\\fIurl\\fR]
Manage the local catalog. Actions: \\fBsync\\fR, \\fBstatus\\fR, \\fBverify\\fR.
.TP
.B backup \\fR[\\fIaction\\fR]
Backup configs (default: create). \\fBlist\\fR shows existing snapshots.
.TP
.B restore \\fIid\\fR
Restore a backup by id.
.TP
.B rollback
Restore the most recent backup.
.TP
.B config \\fIaction\\fR [\\fItool\\fR]
Show or edit config. Currently: \\fBshow\\fR.
.TP
.B search \\fIquery\\fR
Full-text search across the catalog (skills, plugins, MCP, presets, tools).
.TP
.B watch
Watch each installed CLI's settings dir; auto-backup on change.
Foreground process; logs JSON-lines to \\fI~/.clihub/watch.log\\fR.
.TP
.B self-update
Update clihub to the latest npm version.
.TP
.B completion \\fIshell\\fR
Print shell completion script. \\fIshell\\fR is one of \\fBbash\\fR, \\fBzsh\\fR, \\fBfish\\fR, \\fBpowershell\\fR, \\fBman\\fR.
.SH ENVIRONMENT
.TP
.B CLIHUB_LANG
Override locale (en, zh-CN, ja, ko, es). Defaults to \\fI$LANG\\fR detection.
.TP
.B CLIHUB_INSTALL_DIR
Source-install destination used by \\fBscripts/install.sh\\fR when npm is unavailable.
.TP
.B CLIHUB_CATALOG_MIRROR
Override the default catalog URL (planned for v0.6).
.TP
.B HTTPS_PROXY / HTTP_PROXY / NO_PROXY
Standard proxy env (full support in v0.5.1).
.SH FILES
.TP
.I ~/.clihub/catalog/
Synced catalog (skills.json, tools.json, presets.json, mcp.json, plugins.json, manifest.json).
.TP
.I ~/.clihub/skill-md-cache/<sha>/
Git clones for SKILL.md skills installed by URL.
.TP
.I ~/.clihub/watch.log
JSON-lines log emitted by \\fBclihub watch\\fR.
.TP
.I ~/.claude/ ~/.codex/ ~/.gemini/ ~/.kiro/
Per-CLI settings the providers read and write.
.SH EXAMPLES
.PP
Set up everything from scratch:
.PP
.RS
.nf
$ clihub preset apply starter
.fi
.RE
.PP
Install a skill from a git repo into Claude Code:
.PP
.RS
.nf
$ clihub skill install https://github.com/anthropics/skills.git --tool claude-code
.fi
.RE
.PP
Run cross-CLI health check in JSON for a dashboard:
.PP
.RS
.nf
$ clihub doctor --json | jq '.[] | select(.installed)'
.fi
.RE
.SH SEE ALSO
.BR claude (1),
.BR codex (1),
.BR gemini (1).
.PP
Home page: \\fIhttps://github.com/wikieden/clihub\\fR
.SH AUTHORS
clihub contributors. License: MIT.
`;
}
