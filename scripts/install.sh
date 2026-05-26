#!/usr/bin/env bash
# clihub installer — curl | sh entry.
#
# Strategy: prefer npm (most users have it). Fall back to bun if available,
# then to a git clone for hackers. After install, prints next steps.

set -e

GRN='\033[32m'; YLW='\033[33m'; RED='\033[31m'; CYN='\033[36m'; RST='\033[0m'
info()  { printf "${CYN}[i]${RST} %s\n" "$1"; }
ok()    { printf "${GRN}[✓]${RST} %s\n" "$1"; }
warn()  { printf "${YLW}[!]${RST} %s\n" "$1"; }
err()   { printf "${RED}[✗]${RST} %s\n" "$1" >&2; }

PKG="clihub"

install_with_npm() {
    info "Installing $PKG via npm..."
    npm install -g "$PKG"
}

install_with_bun() {
    info "Installing $PKG via bun..."
    bun add -g "$PKG"
}

if command -v npm >/dev/null 2>&1; then
    install_with_npm
elif command -v bun >/dev/null 2>&1; then
    install_with_bun
else
    err "Neither npm nor bun found on PATH."
    echo ""
    echo "Install one of:"
    echo "  - Node.js (which ships npm): https://nodejs.org"
    echo "  - Bun: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

if ! command -v clihub >/dev/null 2>&1; then
    err "clihub binary not found after install. Check your PATH."
    exit 1
fi

ok "clihub installed: $(clihub --version 2>/dev/null || echo unknown)"
echo ""
info "Next steps:"
echo "  clihub                     # open TUI"
echo "  clihub tool install claude-code"
echo "  clihub preset apply starter"
