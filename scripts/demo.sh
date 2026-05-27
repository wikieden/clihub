#!/usr/bin/env bash
# clihub demo script — 60-second tour to record with asciinema.
#
# Records into a clean $HOME so it never touches the host config.
# Pacing uses `pv` to throttle text output. If `pv` is missing, every
# step still works — output just appears instantly.
#
# To produce a GIF for README / launch posts:
#
#   asciinema rec --command "bash scripts/demo.sh" demo.cast
#   agg --speed 1.0 demo.cast demo.gif        # https://github.com/asciinema/agg
#
# Tip: bump terminal font to 18pt and resize to 100×24 before recording.

set -euo pipefail

say() { printf "\n\033[1;36m▸ %s\033[0m\n" "$1"; sleep 1; }
type_line() {
  if command -v pv >/dev/null 2>&1; then
    printf "\033[1;37m$ \033[0m"; printf "%s" "$1" | pv -qL 30; echo
  else
    printf "\033[1;37m$ \033[0m%s\n" "$1"
  fi
  sleep 0.4
}

DEMO_HOME=$(mktemp -d)
export HOME="$DEMO_HOME"

trap 'rm -rf "$DEMO_HOME"' EXIT

clear
echo
echo "  clihub — install Claude Code, Codex, Gemini & Kiro,"
echo "          keep their skills in sync, with one-command rollback."
echo
sleep 2

say "1. version + cross-CLI health"
type_line "clihub --version"
clihub --version
sleep 1
type_line "clihub doctor"
clihub doctor || true
sleep 2

say "2. pull the live catalog"
type_line "clihub catalog sync"
clihub catalog sync
sleep 2

say "3. install a SKILL.md skill straight from a git URL"
type_line "clihub skill install https://github.com/anthropics/skills.git --tool claude-code"
clihub skill install https://github.com/anthropics/skills.git --tool claude-code || true
sleep 2

say "4. install a plugin (git clone into ~/.claude/plugins)"
type_line "clihub plugin install superpowers --tool claude-code"
clihub plugin install superpowers --tool claude-code || true
sleep 2

say "5. snapshot before risky upgrades; rollback if it bites"
type_line "clihub backup"
clihub backup || true
sleep 1

echo
echo "    For more: https://github.com/wikieden/clihub"
echo
sleep 2
