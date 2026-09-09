#!/usr/bin/env bash
# Vercel's Ignored Build Step (wired up in vercel.json). The VPS logger pushes a data
# commit whenever the TTC or STM outage set changes — dozens a day — and each push was
# costing a full production deployment. Nothing the logger writes affects the build
# output, so skip those and build only when real files changed.
#
# Exit 1 = build, exit 0 = skip. Anything unexpected builds: a missed skip wastes a
# deployment, a wrong skip ships stale code.
set -uo pipefail

# The paths the logger touches (see tools/vps/ttc-logger.sh).
DATA_ONLY='^(data/|research/outages-summary)'

changed=$(git diff --name-only HEAD^ HEAD 2>/dev/null) || { echo "no HEAD^ — building"; exit 1; }
[ -z "$changed" ] && { echo "empty diff — building"; exit 1; }

if printf '%s\n' "$changed" | grep -qvE "$DATA_ONLY"; then
  echo "code changed — building:"
  printf '%s\n' "$changed" | grep -vE "$DATA_ONLY" | head
  exit 1
fi
echo "data-only commit — skipping build"
exit 0
