#!/usr/bin/env bash
# Runs on the VPS every five minutes (see happy-map-ttc-logger.timer). Pulls the latest
# log, records the TTC accessibility feed, and pushes when the outage set changed.
# Everything else about the logger lives in tools/log-once.mjs.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/../.."

git pull -q --rebase --autostash origin main
LOGGER_SOURCE=oci node tools/log-once.mjs

# Keep the routing function warm: its cold start is a 30 MB graph load, and a request every
# five minutes is enough to hold a Fluid Compute instance. Failures here must not stop the log.
curl -s -m 25 -o /dev/null -X POST -H 'content-type: application/json' \
  -d '{"from":[-79.3791,43.6435],"to":[-79.3806,43.6544],"walkOnly":true}' \
  "${HM_URL:-https://happy-map-ashy.vercel.app}/api/routes" || true

if [ -z "$(git status --porcelain -- 'data/ttc-alerts/*.jsonl')" ]; then
  exit 0
fi
# Recompute the summary the evidence page reads, so the live site follows the log.
node tools/analyze-outages.mjs > /dev/null
git add -- 'data/ttc-alerts/*.jsonl' research/outages-summary.json
git commit -q -m "data: TTC accessibility alerts $(date -u +'%Y-%m-%dT%H:%MZ') [skip ci]"
git push -q origin HEAD:main
