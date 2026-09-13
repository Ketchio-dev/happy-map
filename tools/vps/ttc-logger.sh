#!/usr/bin/env bash
# Runs on the VPS every five minutes (see happy-map-ttc-logger.timer). Pulls the latest
# log, records the TTC accessibility feed, and pushes when the outage set changed.
# Everything else about the logger lives in tools/log-once.mjs.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/../.."

git pull -q --rebase --autostash origin main
# files added after the first install: idempotent, and the pull above only updates what is already checked out
git sparse-checkout add '/tools/log-once-stm.mjs' '/tools/stm-parse.mjs' '/data/stm-alerts/' >/dev/null 2>&1 || true
LOGGER_SOURCE=oci node tools/log-once.mjs
# Montréal's elevator status page, same cadence; a failure there must not stop the TTC log
LOGGER_SOURCE=oci node tools/log-once-stm.mjs || true

# The app moved to this same box (happy-map-web.service), where the process holds the
# routing graph for its lifetime. There is no cold start left to warm.

if [ -z "$(git status --porcelain -- 'data/ttc-alerts/*.jsonl' 'data/stm-alerts/*.jsonl')" ]; then
  exit 0
fi
# Recompute the summaries the evidence page and the replay read, so the live site follows the log.
node tools/analyze-outages.mjs > /dev/null
CITY=montreal node tools/analyze-outages.mjs > /dev/null || true
git add -- 'data/ttc-alerts/*.jsonl' 'data/stm-alerts/*.jsonl' research/outages-summary.json research/outages-summary-montreal.json 2>/dev/null || git add -- 'data/ttc-alerts/*.jsonl' 'data/stm-alerts/*.jsonl' research/outages-summary.json
git commit -q -m "data: TTC accessibility alerts $(date -u +'%Y-%m-%dT%H:%MZ') [skip ci]"
git push -q origin HEAD:main
