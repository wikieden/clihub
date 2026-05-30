#!/usr/bin/env bash
# Automated newcomer-experience report. Runs the non-interactive clihub flows
# inside the throwaway container and prints a structured pass/fail report.
# Interactive flows (wizard / TUI menu) need a real TTY — drive those by hand
# with `podman run -it clihub-test bash`.
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

printf '\033[1mclihub container report\033[0m — %s\n' "$(clihub --version 2>/dev/null)"
printf 'node %s | %s\n' "$(node --version)" "$(uname -srm)"

section "install & help"
check "clihub --version prints a version" "." -- clihub --version
check "--help shows newcomer banner"      "clihub wizard" -- clihub --help

section "discovery / health"
check "doctor renders the matrix"         "STATUS" -- clihub doctor
check "doctor detects a stubbed CLI"      "Claude Code" -- clihub doctor
check "recommend suggests skills"         "clihub skill install" -- clihub recommend

section "newcomer guard rails"
check "unknown command suggests a fix"    "did you mean" -- clihub instll
check "bare clihub (non-TTY) is friendly" "terminal (TTY)" -- clihub
check "wizard --dry-run (non-TTY) friendly" "terminal (TTY)" -- clihub wizard --dry-run

section "config scaffold + auto-backup/rollback"
cd "$(mktemp -d)"
check "init writes clihub.yaml"           "clihub.yaml" -- clihub init
# `config show <tool>` only renders installed CLIs, so the round-trip assert
# needs a detected CLI. On a bare (WITH_STUBS=false) image, skip it cleanly.
if clihub doctor claude-code 2>/dev/null | grep 'Claude Code' | grep -q '✓'; then
  export CLIHUB_BACKUP=1   # auto-backup is opt-in (off by default); turn it on for this check
  clihub proxy set http://proxyA:1 --tool claude-code >/dev/null 2>&1
  clihub proxy set http://proxyB:2 --tool claude-code >/dev/null 2>&1
  check "config backups lists a snapshot"   "settings.json" -- clihub config backups claude-code
  check "config restore rolls back"         "restored" -- clihub config restore claude-code
  check "restore really reverted to proxyA" "proxyA" -- clihub config show claude-code
else
  printf '  \033[33m–\033[0m auto-backup/restore round-trip skipped (no CLI installed on this image)\n'
fi

printf '\n\033[1m== summary ==\033[0m  \033[32m%s passed\033[0m, \033[31m%s failed\033[0m\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
