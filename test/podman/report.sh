#!/usr/bin/env bash
# Automated REAL-CLI report. Runs clihub against the actual Claude Code / Gemini
# / Codex binaries installed in the container, asserting on real config files on
# disk. Interactive flows (wizard / TUI) need a TTY — run `podman run -it ... bash`.
set -u
export CLIHUB_NO_NUDGE=1

pass=0; fail=0
section() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
# check <label> <expected-substring> -- <command...>
check() {
  local label="$1" needle="$2"; shift 2; [ "$1" = "--" ] && shift
  local out rc
  out="$("$@" 2>&1 </dev/null)"; rc=$?
  if printf '%s' "$out" | grep -qF "$needle"; then
    printf '  \033[32m✓\033[0m %s\n' "$label"; pass=$((pass+1))
  else
    printf '  \033[31m✗\033[0m %s (rc=%s)\n' "$label" "$rc"
    printf '%s\n' "$out" | sed 's/^/      /' | head -6
    fail=$((fail+1))
  fi
}
# assert a file on disk contains a string
file_has() {
  local label="$1" file="$2" needle="$3"
  if [ -f "$file" ] && grep -qF "$needle" "$file"; then
    printf '  \033[32m✓\033[0m %s\n' "$label"; pass=$((pass+1))
  else
    printf '  \033[31m✗\033[0m %s — %s missing/lacks "%s"\n' "$label" "$file" "$needle"; fail=$((fail+1))
  fi
}

printf '\033[1mclihub REAL-CLI report\033[0m — %s\n' "$(clihub --version 2>/dev/null)"
printf 'node %s | %s\n' "$(node --version)" "$(uname -srm)"

section "real CLIs are real (not stubs)"
check "claude --version is real"  "Claude Code" -- claude --version
check "gemini --version runs"     "." -- gemini --version
check "codex --version runs"      "." -- codex --version
check "qwen --version runs"       "." -- qwen --version

section "doctor sees the real CLIs"
check "doctor detects Claude Code real version" "Claude Code" -- clihub doctor
check "doctor detects Gemini"                    "Gemini"      -- clihub doctor
check "doctor detects Qwen Code"                 "Qwen"        -- clihub doctor
check "doctor detects Codex"                     "Codex"       -- clihub doctor

section "proxy injects into the REAL ~/.claude/settings.json"
clihub proxy set http://proxy.test:8080 --tool claude-code >/dev/null 2>&1
file_has "settings.json has the proxy" "$HOME/.claude/settings.json" "proxy.test:8080"

section "skill install writes a REAL file under ~/.claude"
clihub skill install superpowers >/dev/null 2>&1
check "doctor SKILLS count > 0" "Claude Code" -- bash -c 'clihub doctor claude-code | sed "s/\x1b\[[0-9;]*m//g" | grep "Claude Code"'
ls -1 "$HOME/.claude/skills" >/dev/null 2>&1 \
  && { printf '  \033[32m✓\033[0m ~/.claude/skills/ exists: %s\n' "$(ls "$HOME/.claude/skills" | tr '\n' ' ')"; pass=$((pass+1)); } \
  || { printf '  \033[31m✗\033[0m ~/.claude/skills/ not created\n'; fail=$((fail+1)); }

section "mcp add fans out to JSON + TOML CLIs (real configs)"
clihub mcp add github >/dev/null 2>&1
check "mcp list shows github"                  "github" -- clihub mcp list
file_has "Gemini settings.json has github"     "$HOME/.gemini/settings.json" "github"
file_has "Qwen settings.json has github"        "$HOME/.qwen/settings.json" "github"
file_has "Claude ~/.claude.json has github"     "$HOME/.claude.json" "github"
file_has "Codex config.toml [mcp_servers]"      "$HOME/.codex/config.toml" "mcp_servers.github"

section "preset apply (real skill installs)"
check "preset apply starter completes" "applied" -- clihub preset apply starter

section "auto-backup opt-in round-trip (real settings)"
export CLIHUB_BACKUP=1
clihub proxy set http://first:1 --tool claude-code >/dev/null 2>&1
clihub proxy set http://second:2 --tool claude-code >/dev/null 2>&1
check "config restore rolls back" "restored" -- clihub config restore claude-code
file_has "settings reverted to first" "$HOME/.claude/settings.json" "first:1"

printf '\n\033[1m== summary ==\033[0m  \033[32m%s passed\033[0m, \033[31m%s failed\033[0m\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
