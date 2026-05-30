#!/usr/bin/env bash
# Thin wrapper around podman for the clihub test environment.
#
#   ./run.sh build [version]   # build image (default: latest from npm)
#   ./run.sh report [version]  # build + run the automated newcomer report
#   ./run.sh shell [version]   # build + drop into an interactive shell (wizard/TUI)
#   ./run.sh bare              # build a "nothing installed" machine + report
#
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
  bare)
    "$ENGINE" build -t "${IMAGE}-bare" --build-arg WITH_STUBS=false "$HERE"
    "$ENGINE" run --rm "${IMAGE}-bare" /opt/report.sh ;;
  *) sed -n '2,12p' "$0" ;;
esac
