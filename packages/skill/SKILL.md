---
name: clihub
description: |
  Claude Code configuration manager. Edit settings.json, permissions, hooks,
  MCP servers, statusline; install/uninstall skills; switch model/effort;
  back up and roll back. Triggers: clihub / edit config / add permission /
  install MCP / install skill / change statusline / switch model / backup config.
metadata:
  type: configuration
  version: 0.1.0
allowed-tools: [Bash, Read]
---

# clihub — Claude Code configuration manager

## Core rules

1. All writes go through the `clihub` CLI (never edit settings.json directly).
2. Read current state before changing it (`clihub config show`).
3. Destructive operations require explicit user confirmation.
4. Report changes in plain language and list file paths so the user can verify.

## Workflow

When the user asks for a change:

1. Run `clihub config show --json` (or the relevant `list` command) to capture state.
2. Summarize current config + planned change in plain language.
3. Wait for confirmation unless the user already said "just do it" / "yes".
4. Run the corresponding `clihub` subcommand (auto-backups happen via BackupManager).
5. Report the change and the backup path.

## Intent → command routing

| User intent | Command |
|---|---|
| "Add permission X" | `clihub perm add "$X"` |
| "Install MCP X with command $cmd" | `clihub mcp add "$X" "$cmd"` |
| "Uninstall MCP X" | `clihub mcp remove "$X"` |
| "Install skill X" | `clihub skill install "$X"` |
| "Uninstall skill X" | `clihub skill uninstall "$X"` |
| "Switch to Opus / Sonnet / Haiku" | `clihub model set <name>` |
| "Set hook" | `clihub hook add <event> <command>` |
| "Tweak statusline" | `clihub statusline tweak` |
| "Backup" | `clihub backup` |
| "Roll back to X" | `clihub restore <timestamp>` |
| "Show current state" | `clihub config show` |
| "What can I install?" | `clihub skill catalog` |

## Script protocol

Each invocation supports `--json` for structured output.
Exit 0 = success, non-zero = failure with stderr.
Backups land in `~/.clihub/backups/<timestamp>/`.
Failures auto-roll-back without polluting config.

After running, translate JSON results to plain language for the user.

## Do not

- Edit `~/.claude/settings.json` directly — always use `clihub`.
- Silently fail — surface every non-zero exit.
- Make destructive changes without confirmation (skill remove / restore).
- Assume the user remembers backup locations — always report the path.

## Fallback

If `clihub` is not installed, prompt the user to run:

```
curl -fsSL https://raw.githubusercontent.com/wikieden/clihub/main/scripts/install.sh | sh
```
