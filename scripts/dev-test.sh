#!/usr/bin/env bash
# dev-test.sh — run clihub in a fully isolated HOME for manual testing.
# Usage: bash scripts/dev-test.sh [--keep] [-- <extra args>]
#   --keep   don't delete tmpdir on exit (inspect files afterwards)
#   --       pass remaining args directly to CLI (skips TUI)
#
# Examples:
#   bash scripts/dev-test.sh                          # interactive TUI
#   bash scripts/dev-test.sh -- tool list             # one-shot command
#   bash scripts/dev-test.sh -- skill install tdd     # install a skill
#   bash scripts/dev-test.sh -- preset apply starter  # apply preset

set -euo pipefail

KEEP=0
CLI_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep) KEEP=1; shift ;;
    --) shift; CLI_ARGS=("$@"); break ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$REPO_ROOT/packages/cli/dist/cli.js"

if [[ ! -f "$CLI" ]]; then
  echo "▶ Building first..."
  (cd "$REPO_ROOT" && npm run build --silent)
fi

TEST_HOME=$(mktemp -d)

cleanup() {
  echo ""
  echo "─────────────────────────────────────────"
  echo "Files written during test:"
  find "$TEST_HOME" -type f | sort | sed "s|$TEST_HOME|~|" || true
  if [[ $KEEP -eq 1 ]]; then
    echo ""
    echo "Kept test HOME: $TEST_HOME"
    echo "To clean up: rm -rf $TEST_HOME"
  else
    rm -rf "$TEST_HOME"
    echo "Cleaned up. Real HOME untouched."
  fi
}
trap cleanup EXIT

echo "─────────────────────────────────────────"
echo "clihub dev test"
echo "Isolated HOME: $TEST_HOME"
echo "Real HOME:     $HOME  (untouched)"
echo "─────────────────────────────────────────"
echo ""

export HOME="$TEST_HOME"

if [[ ${#CLI_ARGS[@]} -gt 0 ]]; then
  node "$CLI" "${CLI_ARGS[@]}"
else
  node "$CLI"
fi
