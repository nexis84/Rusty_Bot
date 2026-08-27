#!/usr/bin/env bash
# Auto SDE Refresh cron for PI data
# Runs build-pi-data.js -> validate, bumps PI_ASSET_VERSION if SDE changed, then commits.
# Usage: add to crontab: 0 4 * * * /path/scripts/cron-sde-refresh.sh >> /var/log/pi-sde.log 2>&1
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDE_META="$ROOT/sde/_sde.jsonl"
PI_INDEX="$ROOT/PI/index.html"

echo "[$(date -Is)] SDE refresh check"

# read current build from _sde.jsonl if present
NEW_BUILD=""
if [ -f "$SDE_META" ]; then
  NEW_BUILD=$(head -n1 "$SDE_META" | grep -o '"buildNumber"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*' || true)
fi

node "$ROOT/scripts/build-pi-data.js"
node "$ROOT/scripts/validate-pi-data.js"

# bump PI_ASSET_VERSION if files changed
if ! git -C "$ROOT" diff --quiet -- PI/pi-data.js PI/pi-systems.js PI/pi-jumps.js PI/pi-planets.js 2>/dev/null; then
  echo "PI data changed (build ${NEW_BUILD:-unknown}), bumping asset version"
  # increment numeric version in PI/index.html: window.PI_ASSET_VERSION = 'NN'
  perl -i -pe 's/window\.PI_ASSET_VERSION = .(\d+)./window.PI_ASSET_VERSION = '\'' . ($1+1) . '\''/e' "$PI_INDEX" || true
  echo "New PI_ASSET_VERSION: $(grep -o "PI_ASSET_VERSION = '[^']*'" "$PI_INDEX" || true)"
  # optional git commit (uncomment when running on Oracle with write access)
  # git -C "$ROOT" add PI/pi-data.js PI/pi-systems.js PI/pi-jumps.js PI/pi-planets.js PI/index.html
  # git -C "$ROOT" commit -m "chore(pi): refresh SDE build ${NEW_BUILD:-unknown} [auto]" || true
  # git -C "$ROOT" push || true
else
  echo "No PI data changes"
fi
echo "[$(date -Is)] done"
