#!/usr/bin/env bash
# One-time setup of the outage logger on the VPS. Idempotent; run as the ubuntu user.
# Needs: node >= 20, git, sudo, and a deploy key with write access registered on the repo.
#   bash install.sh
set -euo pipefail
REPO_DIR=${REPO_DIR:-$HOME/apps/happy-map}
KEY=${KEY:-$HOME/.ssh/happy-map-logger}
REMOTE=${REMOTE:-git@github.com:Ketchio-dev/happy-map.git}
SSH_CMD="ssh -i $KEY -o IdentitiesOnly=yes"

if [ ! -d "$REPO_DIR/.git" ]; then
  # blob-less partial clone plus a sparse checkout: the logger needs the alert log and
  # two scripts, not the 74 MB routing graph.
  GIT_SSH_COMMAND="$SSH_CMD" git clone --filter=blob:none --no-checkout "$REMOTE" "$REPO_DIR"
  cd "$REPO_DIR"
  git config core.sshCommand "$SSH_CMD"
  git sparse-checkout set --no-cone '/.gitignore' '/data/ttc-alerts/' '/tools/log-once.mjs' '/tools/analyze-outages.mjs' '/tools/vps/' '/research/*.json'
  git checkout -q main
fi
cd "$REPO_DIR"
# idempotent: an older clone gets the patterns the logger script needs today
git sparse-checkout set --no-cone '/.gitignore' '/data/ttc-alerts/' '/tools/log-once.mjs' '/tools/analyze-outages.mjs' '/tools/vps/' '/research/*.json'
git config core.sshCommand "$SSH_CMD"
git config user.name "happy-map logger"
git config user.email "${GIT_EMAIL:-sr.junsoo.park@gmail.com}"
chmod +x tools/vps/ttc-logger.sh

sudo install -m 644 tools/vps/happy-map-ttc-logger.service tools/vps/happy-map-ttc-logger.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now happy-map-ttc-logger.timer
systemctl list-timers happy-map-ttc-logger.timer --no-pager
