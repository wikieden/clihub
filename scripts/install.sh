#!/usr/bin/env bash
# clihub installer — curl | sh entry.
#
# Strategy:
#   1. Try `npm install -g clihub` (or bun).
#   2. If the package is not on npm yet (404), fall back to a git-clone +
#      local build + npm link.
# After install, prints next steps.

set -e

GRN='\033[32m'; YLW='\033[33m'; RED='\033[31m'; CYN='\033[36m'; RST='\033[0m'
info()  { printf "${CYN}[i]${RST} %s\n" "$1"; }
ok()    { printf "${GRN}[✓]${RST} %s\n" "$1"; }
warn()  { printf "${YLW}[!]${RST} %s\n" "$1"; }
err()   { printf "${RED}[✗]${RST} %s\n" "$1" >&2; }

PKG="clihub"
REPO="https://github.com/wikieden/clihub.git"
INSTALL_DIR="${CLIHUB_INSTALL_DIR:-$HOME/.local/share/clihub}"

install_with_npm() {
    info "Installing $PKG via npm..."
    npm install -g "$PKG"
}

install_with_bun() {
    info "Installing $PKG via bun..."
    bun add -g "$PKG"
}

install_from_source() {
    warn "Falling back to source install (npm package not yet published)."

    if ! command -v git >/dev/null 2>&1; then
        err "git not found. Install git first."
        exit 1
    fi

    local builder=""
    if command -v bun >/dev/null 2>&1; then
        builder="bun"
    elif command -v npm >/dev/null 2>&1; then
        builder="npm"
    else
        err "Neither bun nor npm found. Install Node.js (https://nodejs.org) or Bun (https://bun.sh)."
        exit 1
    fi

    info "Cloning $REPO → $INSTALL_DIR"
    if [ -d "$INSTALL_DIR/.git" ]; then
        info "Existing checkout found, pulling latest..."
        (cd "$INSTALL_DIR" && git pull --ff-only)
    else
        mkdir -p "$(dirname "$INSTALL_DIR")"
        git clone --depth=1 "$REPO" "$INSTALL_DIR"
    fi

    info "Installing dependencies with $builder..."
    if [ "$builder" = "bun" ]; then
        (cd "$INSTALL_DIR" && bun install && bun run build)
    else
        (cd "$INSTALL_DIR" && npm install && npm run build)
    fi

    info "Linking clihub globally..."
    (cd "$INSTALL_DIR/packages/cli" && npm link)
}

attempt_registry_install() {
    if command -v npm >/dev/null 2>&1; then
        install_with_npm && return 0
        return 1
    fi
    if command -v bun >/dev/null 2>&1; then
        install_with_bun && return 0
        return 1
    fi
    return 1
}

# Try the registry first. If npm/bun isn't on PATH or the package isn't
# published yet, fall through to the source install.
if attempt_registry_install; then
    :
else
    install_from_source
fi

if ! command -v clihub >/dev/null 2>&1; then
    err "clihub binary not found after install. Check your PATH."
    echo ""
    echo "Hint: ensure your global npm bin dir is in PATH:"
    echo "  npm bin -g 2>/dev/null || npm config get prefix"
    exit 1
fi

ok "clihub installed: $(clihub --version 2>/dev/null || echo unknown)"
echo ""
info "Next steps:"
echo "  clihub                     # open TUI"
echo "  clihub tool install claude-code"
echo "  clihub preset apply starter"
