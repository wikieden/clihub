#!/usr/bin/env bash
# install.sh — One-shot installer for the Claude Code statusline
#
# What it does:
#   1. Verifies jq is installed (required by the statusline script)
#   2. Copies statusline.sh to ~/.claude/statusline.sh
#   3. Backs up existing ~/.claude/settings.json
#   4. Merges statusLine config into settings.json (preserving everything else)
#   5. Runs a smoke test to make sure the script works

set -e

CLAUDE_DIR="${HOME}/.claude"
SCRIPT_SRC="$(cd "$(dirname "$0")" && pwd)/statusline.sh"
SCRIPT_DST="${CLAUDE_DIR}/statusline.sh"
SETTINGS="${CLAUDE_DIR}/settings.json"
TS=$(date +%Y%m%d-%H%M%S)

GRN='\033[32m'; YLW='\033[33m'; RED='\033[31m'; CYN='\033[36m'; RST='\033[0m'
info()  { printf "${CYN}[i]${RST} %s\n" "$1"; }
ok()    { printf "${GRN}[✓]${RST} %s\n" "$1"; }
warn()  { printf "${YLW}[!]${RST} %s\n" "$1"; }
err()   { printf "${RED}[✗]${RST} %s\n" "$1" >&2; }

# ─── Step 1: Verify jq ──────────────────────────────────────────────
if ! command -v jq >/dev/null 2>&1; then
    err "jq is required but not found. Install with:"
    echo "  macOS:   brew install jq"
    echo "  Ubuntu:  sudo apt install jq"
    echo "  Arch:    sudo pacman -S jq"
    echo "  Fedora:  sudo dnf install jq"
    exit 1
fi
ok "jq found: $(jq --version)"

# ─── Step 2: Verify source script exists ────────────────────────────
if [ ! -f "$SCRIPT_SRC" ]; then
    err "statusline.sh not found at $SCRIPT_SRC"
    exit 1
fi

# ─── Step 3: Create ~/.claude/ if missing ───────────────────────────
mkdir -p "$CLAUDE_DIR"

# ─── Step 4: Backup existing statusline.sh if present ───────────────
if [ -f "$SCRIPT_DST" ]; then
    BACKUP="${SCRIPT_DST}.bak.${TS}"
    cp "$SCRIPT_DST" "$BACKUP"
    warn "Existing statusline.sh backed up to $BACKUP"
fi

# ─── Step 5: Install new script ─────────────────────────────────────
cp "$SCRIPT_SRC" "$SCRIPT_DST"
chmod +x "$SCRIPT_DST"
ok "Installed statusline.sh to $SCRIPT_DST"

# ─── Step 6: Smoke test ─────────────────────────────────────────────
TEST_JSON='{
  "model": {"display_name": "Opus"},
  "effort": {"level": "high"},
  "thinking": {"enabled": true},
  "context_window": {"used_percentage": 44},
  "cost": {"total_cost_usd": 2.31, "total_duration_ms": 7800000},
  "rate_limits": {"five_hour": {"used_percentage": 0}, "seven_day": {"used_percentage": 36}},
  "workspace": {"current_dir": "'"$PWD"'", "git_worktree": "test"},
  "output_style": {"name": "default"},
  "session_id": "install-smoke-test"
}'

if ! echo "$TEST_JSON" | "$SCRIPT_DST" >/dev/null 2>&1; then
    err "Smoke test failed. Try running manually:"
    echo "  echo '$TEST_JSON' | $SCRIPT_DST"
    exit 1
fi
ok "Smoke test passed"
info "Sample output (what you'll see in Claude Code):"
echo ""
echo "$TEST_JSON" | "$SCRIPT_DST" | sed 's/^/    /'
echo ""

# ─── Step 7: Merge into settings.json ───────────────────────────────
STATUSLINE_CONFIG='{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh",
    "padding": 0,
    "refreshInterval": 5
  }
}'

if [ -f "$SETTINGS" ]; then
    # Validate existing JSON
    if ! jq empty "$SETTINGS" 2>/dev/null; then
        err "Existing settings.json is not valid JSON. Fix it manually first."
        echo "    File: $SETTINGS"
        exit 1
    fi

    # Backup
    SETTINGS_BAK="${SETTINGS}.bak.${TS}"
    cp "$SETTINGS" "$SETTINGS_BAK"
    info "Backed up settings.json to $SETTINGS_BAK"

    # Check if statusLine already configured
    if jq -e '.statusLine' "$SETTINGS" >/dev/null 2>&1; then
        warn "settings.json already has a statusLine entry — overwriting"
    fi

    # Merge: existing settings + new statusLine (deep merge)
    TMP=$(mktemp)
    jq -s '.[0] * .[1]' "$SETTINGS" <(echo "$STATUSLINE_CONFIG") > "$TMP"
    mv "$TMP" "$SETTINGS"
    ok "Merged statusLine into existing settings.json"
else
    echo "$STATUSLINE_CONFIG" | jq '.' > "$SETTINGS"
    ok "Created new settings.json with statusLine config"
fi

# ─── Step 8: Verify final settings.json is valid ────────────────────
if ! jq empty "$SETTINGS" 2>/dev/null; then
    err "Final settings.json is not valid JSON. Restore from backup:"
    echo "    cp $SETTINGS_BAK $SETTINGS"
    exit 1
fi

# ─── Summary ────────────────────────────────────────────────────────
echo ""
ok "Installation complete."
echo ""
info "Next steps:"
echo "    1. Restart Claude Code (or wait for next interaction — it auto-reloads)"
echo "    2. If statusline doesn't appear, accept the 'workspace trust' prompt"
echo "    3. Customize by editing: $SCRIPT_DST"
echo ""
info "Test anytime with:"
echo "    echo '{\"model\":{\"display_name\":\"Opus\"},\"context_window\":{\"used_percentage\":50},\"session_id\":\"x\"}' | $SCRIPT_DST"
