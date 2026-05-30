#!/usr/bin/env bash
# Thin wrapper around podman for the clihub REAL-CLI test environment.
#
#   ./run.sh build [version]   # build image (default: latest clihub from npm)
#   ./run.sh report [version]  # build + run the automated real-CLI report
#   ./run.sh shell [version]   # build + interactive shell (clihub wizard / TUI)
#
# The image installs the real Claude Code / Gemini / Codex CLIs from npm.
# Requires podman (or set ENGINE=docker).
set -euo pipefail
ENGINE="${ENGINE:-podman}"
IMAGE="${IMAGE:-clihub-test}"
HERE="$(cd "$(dirname "$0")" && pwd)"

build() { "$ENGINE" build -t "$IMAGE" --build-arg "CLIHUB_VERSION=${1:-latest}" "$HERE"; }

case "${1:-help}" in
  build)  build "${2:-latest}" ;;
  report) build "${2:-latest}"; "$ENGINE" run --rm "$IMAGE" /opt/report.sh ;;
  shell)  build "${2:-latest}"; "$ENGINE" run --rm -it "$IMAGE" bash ;;
  *) sed -n '2,9p' "$0" ;;
esac
