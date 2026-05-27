# clihub Docker image — single-binary install of @wikieden/clihub plus
# the runtime tools it shells out to (git for plugin/SKILL.md clones,
# bash for the install.sh fallback).
#
# Usage:
#   docker run --rm -it wikieden/clihub               # TUI
#   docker run --rm -it wikieden/clihub doctor        # one-shot command
#   docker run --rm -it -v ~/.claude:/root/.claude wikieden/clihub \
#       skill install superpowers                     # persist into host
#
# Build args:
#   CLIHUB_VERSION — npm version to install. Defaults to latest.
#
# Multi-arch image is produced by .github/workflows/docker.yml on each
# `v*.*.*` tag push.

FROM node:20-alpine

ARG CLIHUB_VERSION=latest

# git: needed by `clihub plugin install` (git clone into ~/.claude/plugins/)
#      and `clihub skill install <git-url>` (cache clone).
# bash + curl: nice-to-have for users dropping into the container shell.
# ca-certificates: TLS for fetching the npm catalog.
RUN apk add --no-cache git bash curl ca-certificates \
    && npm install -g "@wikieden/clihub@${CLIHUB_VERSION}" \
    && clihub --version

# Default to TUI; override at `docker run`.
ENTRYPOINT ["clihub"]
