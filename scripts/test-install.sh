#!/usr/bin/env bash
# Isolated install test — runs the statusline installer against a sandboxed
# $HOME so it never touches the real ~/.claude/. Spec: docs/12-TESTING.md.

set -e
TMPDIR=$(mktemp -d)
echo "→ Testing in: $TMPDIR"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INSTALLER="$REPO_ROOT/packages/statusline/install.sh"
if [ ! -f "$INSTALLER" ]; then
    INSTALLER="$REPO_ROOT/install.sh"
fi

HOME="$TMPDIR" bash "$INSTALLER"

echo "--- Installed files ---"
find "$TMPDIR" -type f

rm -rf "$TMPDIR"
echo "PASS"
