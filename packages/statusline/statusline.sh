#!/usr/bin/env bash
# ~/.claude/statusline.sh
# Claude Code statusline — optimized for embodied AI / game dev workflows
#
# References & inspirations:
#   - sirmalloc/ccstatusline   (multi-line layout, powerline separators)
#   - chongdashu/cc-statusline (progress-bar aesthetics)
#   - SippieCup gist (2026-03-30, severity color thresholds)
#   - Yiğit Konur statusline comparison (2026-04-16)
#
# Layout:
#   ◆ opus·high·🧠 │ ⎇l3-planner │ 🌿main ±3 │ #1234 pending │ 🎨style
#   ctx ▓▓▓▓░░░░░░ 44% │ 5h ░░░░░░░░░░ 0% │ wk ▓▓▓░░░░░░░ 36% │ $2.31 · 38m
#
# Dependencies: jq (required), git (optional)
# Test:  echo '{...json...}' | ./statusline.sh

set -o pipefail
input=$(cat)
j() { echo "$input" | jq -r "$1" 2>/dev/null; }

# ─── Field extraction ────────────────────────────────────────────────
MODEL=$(j '.model.display_name // "Claude"')
EFFORT=$(j '.effort.level // empty')
THINKING=$(j '.thinking.enabled // false')
CTX=$(j '.context_window.used_percentage // 0' | cut -d. -f1)
COST=$(j '.cost.total_cost_usd // 0')
SESSION_MS=$(j '.cost.total_duration_ms // 0')
LINES_ADD=$(j '.cost.total_lines_added // 0')
LINES_DEL=$(j '.cost.total_lines_removed // 0')
FIVE_H=$(j '.rate_limits.five_hour.used_percentage // empty' | cut -d. -f1)
WEEK=$(j '.rate_limits.seven_day.used_percentage // empty' | cut -d. -f1)
WORKTREE=$(j '.workspace.git_worktree // empty')
CWD=$(j '.workspace.current_dir // "/"')
STYLE=$(j '.output_style.name // "default"')
AGENT=$(j '.agent.name // empty')
PR_NUM=$(j '.pr.number // empty')
PR_STATE=$(j '.pr.review_state // empty')
SID=$(j '.session_id // "default"')
EXCEEDS_200K=$(j '.exceeds_200k_tokens // false')
VIM_MODE=$(j '.vim.mode // empty')

# ─── Colors (ANSI) ───────────────────────────────────────────────────
RST='\033[0m';     DIM='\033[2m';     BLD='\033[1m'
RED='\033[31m';    GRN='\033[32m';    YLW='\033[33m'
BLU='\033[34m';    MAG='\033[35m';    CYN='\033[36m'
GRY='\033[90m'

# Severity coloring — used for context, rate limits
# 50% yellow / 75% red / 90% bold red — earlier than default to avoid wall-hits
sev() {
    local v=${1:-0}
    if   [ "$v" -ge 90 ]; then printf "%b" "${BLD}${RED}"
    elif [ "$v" -ge 75 ]; then printf "%b" "${RED}"
    elif [ "$v" -ge 50 ]; then printf "%b" "${YLW}"
    else                       printf "%b" "${GRN}"
    fi
}

# 10-char progress bar with unicode block characters
bar() {
    local v=${1:-0}; local w=10
    [ "$v" -lt 0 ] && v=0
    [ "$v" -gt 100 ] && v=100
    local f=$(( v * w / 100 ))
    local e=$(( w - f ))
    local fill="" empty=""
    [ "$f" -gt 0 ] && printf -v fill "%${f}s" "" && fill="${fill// /▓}"
    [ "$e" -gt 0 ] && printf -v empty "%${e}s" "" && empty="${empty// /░}"
    printf "%s%s" "${fill}" "${empty}"
}

# ─── Git info (cached 5s, keyed by session_id) ───────────────────────
# Mirrors official docs recommendation — avoids slow git in large repos
CACHE="/tmp/cc-statusline-git-$SID"
TTL=5
needs_refresh() {
    [ ! -f "$CACHE" ] && return 0
    local now=$(date +%s)
    local mtime
    mtime=$(stat -f %m "$CACHE" 2>/dev/null) \
        || mtime=$(stat -c %Y "$CACHE" 2>/dev/null) \
        || mtime=0
    [ $((now - mtime)) -gt $TTL ]
}

if needs_refresh; then
    BRANCH=""; DIRTY=0; AHEAD=0; BEHIND=0
    if (cd "$CWD" 2>/dev/null && git rev-parse --git-dir >/dev/null 2>&1); then
        BRANCH=$(cd "$CWD" && git branch --show-current 2>/dev/null)
        DIRTY=$(cd "$CWD" && git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
        # ahead/behind upstream (silent if no upstream)
        if AB=$(cd "$CWD" && git rev-list --left-right --count "@{u}...HEAD" 2>/dev/null); then
            BEHIND=$(echo "$AB" | awk '{print $1}')
            AHEAD=$(echo "$AB" | awk '{print $2}')
        fi
    fi
    printf "%s|%s|%s|%s" "$BRANCH" "$DIRTY" "$AHEAD" "$BEHIND" > "$CACHE"
fi
IFS='|' read -r BRANCH DIRTY AHEAD BEHIND < "$CACHE"

# ─── Line 1: Identity & Location ─────────────────────────────────────
SEP=" ${GRY}│${RST} "

# Short model name: "Claude Opus 4.7" → "opus"
SHORT_MODEL=$(echo "$MODEL" \
    | sed -E 's/Claude //g; s/ [0-9]+(\.[0-9]+)*//g' \
    | tr '[:upper:]' '[:lower:]')

ID="${CYN}${BLD}◆ ${SHORT_MODEL}${RST}"
[ -n "$EFFORT" ] && ID="${ID}${DIM}·${EFFORT}${RST}"
[ "$THINKING" = "true" ] && ID="${ID} 🧠"
[ "$EXCEEDS_200K" = "true" ] && ID="${ID} ${YLW}⚠1M${RST}"
[ -n "$VIM_MODE" ] && ID="${ID} ${DIM}[${VIM_MODE}]${RST}"

# Location: worktree wins (more useful than basename when juggling branches)
if [ -n "$WORKTREE" ]; then
    LOC="${YLW}⎇ ${WORKTREE}${RST}"
else
    LOC="${DIM}📁 ${CWD##*/}${RST}"
fi

# Git info
GIT_PART=""
if [ -n "$BRANCH" ]; then
    GIT_PART="${GRN}🌿 ${BRANCH}${RST}"
    [ "$DIRTY" -gt 0 ] && GIT_PART="${GIT_PART} ${YLW}±${DIRTY}${RST}"
    [ "$AHEAD"  -gt 0 ] 2>/dev/null && GIT_PART="${GIT_PART} ${GRN}↑${AHEAD}${RST}"
    [ "$BEHIND" -gt 0 ] 2>/dev/null && GIT_PART="${GIT_PART} ${RED}↓${BEHIND}${RST}"
fi

# PR badge
PR_PART=""
if [ -n "$PR_NUM" ]; then
    case "$PR_STATE" in
        approved)          PR_COLOR="$GRN" ;;
        changes_requested) PR_COLOR="$RED" ;;
        pending)           PR_COLOR="$YLW" ;;
        draft)             PR_COLOR="$DIM" ;;
        *)                 PR_COLOR="$BLU" ;;
    esac
    PR_PART="${PR_COLOR}#${PR_NUM}${RST}"
    [ -n "$PR_STATE" ] && PR_PART="${PR_PART}${DIM} ${PR_STATE}${RST}"
fi

# Context tags: agent + non-default output_style
CTX_TAGS=""
[ -n "$AGENT" ] && CTX_TAGS="${MAG}⚙ ${AGENT}${RST}"
if [ "$STYLE" != "default" ]; then
    [ -n "$CTX_TAGS" ] && CTX_TAGS="${CTX_TAGS}${SEP}"
    CTX_TAGS="${CTX_TAGS}${BLU}🎨 ${STYLE}${RST}"
fi

# Assemble
LINE1="${ID}${SEP}${LOC}"
[ -n "$GIT_PART" ] && LINE1="${LINE1}${SEP}${GIT_PART}"
[ -n "$PR_PART" ]  && LINE1="${LINE1}${SEP}${PR_PART}"
[ -n "$CTX_TAGS" ] && LINE1="${LINE1}${SEP}${CTX_TAGS}"

# ─── Line 2: Resource Usage ──────────────────────────────────────────
CTX_C=$(sev "$CTX")
CTX_BAR=$(bar "$CTX")
RES="${DIM}ctx${RST} ${CTX_C}$(echo -e "$CTX_BAR")${RST} ${CTX_C}$(printf '%3d' $CTX)%${RST}"

if [ -n "$FIVE_H" ]; then
    FH_C=$(sev "$FIVE_H")
    FH_BAR=$(bar "$FIVE_H")
    RES="${RES}${SEP}${DIM}5h${RST} ${FH_C}$(echo -e "$FH_BAR")${RST} ${FH_C}$(printf '%3d' $FIVE_H)%${RST}"
fi

if [ -n "$WEEK" ]; then
    WK_C=$(sev "$WEEK")
    WK_BAR=$(bar "$WEEK")
    RES="${RES}${SEP}${DIM}wk${RST} ${WK_C}$(echo -e "$WK_BAR")${RST} ${WK_C}$(printf '%3d' $WEEK)%${RST}"
fi

# Cost + session time + lines changed
COST_FMT=$(printf '$%.2f' "$COST" 2>/dev/null || echo '$0.00')
SEC=$((SESSION_MS / 1000))
H=$((SEC / 3600)); M=$(((SEC % 3600) / 60))
if [ "$H" -gt 0 ]; then TIME="${H}h${M}m"; else TIME="${M}m"; fi

LINES_PART=""
[ "$LINES_ADD" -gt 0 ] 2>/dev/null && LINES_PART="${GRN}+${LINES_ADD}${RST}"
[ "$LINES_DEL" -gt 0 ] 2>/dev/null && {
    [ -n "$LINES_PART" ] && LINES_PART="${LINES_PART}${DIM}/${RST}"
    LINES_PART="${LINES_PART}${RED}-${LINES_DEL}${RST}"
}

RES="${RES}${SEP}${DIM}${COST_FMT} · ${TIME}${RST}"
[ -n "$LINES_PART" ] && RES="${RES} ${LINES_PART}"

# ─── Output ──────────────────────────────────────────────────────────
echo -e "$LINE1"
echo -e "$RES"
