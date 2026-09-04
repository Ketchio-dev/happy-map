#!/usr/bin/env bash
# Runs on the VPS every five minutes (see happy-map-ttc-logger.timer). Pulls the latest
# log, records the TTC accessibility feed, and pushes when the outage set changed.
# Everything else about the logger lives in tools/log-once.mjs.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/../.."

git pull -q --rebase --autostash origin main
LOGGER_SOURCE=oci node tools/log-once.mjs

if [ -z "$(git status --porcelain -- 'data/ttc-alerts/*.jsonl')" ]; then
  exit 0
fi
git add -- 'data/ttc-alerts/*.jsonl'
git commit -q -m "data: TTC accessibility alerts $(date -u +'%Y-%m-%dT%H:%MZ') [skip ci]"
git push -q origin HEAD:main
