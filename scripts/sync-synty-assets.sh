#!/bin/sh
# Sync Synty-derived GLBs used by the playtest harness from the private
# rpg-game-assets repo. Synty's license permits shipping converted assets in
# game builds but forbids redistributing them via a public repo, so
# public/models/synty/ is gitignored here and populated from this script
# instead. See rpg-game-assets/README.md for the license rationale and the
# harness/ vs library/ split.
#
# Usage: npm run assets:sync
#   or:  sh scripts/sync-synty-assets.sh

set -e

ASSETS_REPO_URL="git@github.com:KirkDiggler/rpg-game-assets.git"
ASSETS_REPO_URL_HTTPS="https://github.com/KirkDiggler/rpg-game-assets.git"

# Resolve this script's directory, then the web repo root (one level up).
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
WEB_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
PARENT_DIR=$(CDPATH= cd -- "$WEB_ROOT/.." && pwd)
ASSETS_DIR="$PARENT_DIR/rpg-game-assets"

if [ -d "$ASSETS_DIR/.git" ]; then
  echo "Found existing rpg-game-assets checkout at $ASSETS_DIR — pulling latest..."
  git -C "$ASSETS_DIR" pull
else
  echo "Cloning rpg-game-assets into $ASSETS_DIR..."
  if ! git clone "$ASSETS_REPO_URL" "$ASSETS_DIR"; then
    echo "SSH clone failed, retrying over HTTPS..."
    git clone "$ASSETS_REPO_URL_HTTPS" "$ASSETS_DIR"
  fi
fi

SRC="$ASSETS_DIR/harness/models/synty/"
DEST="$WEB_ROOT/public/models/synty/"

if [ ! -d "$SRC" ]; then
  echo "ERROR: expected asset source dir not found: $SRC" >&2
  exit 1
fi

mkdir -p "$DEST"

echo "Syncing $SRC -> $DEST"
rsync -a --delete "$SRC" "$DEST"

echo "Done. public/models/synty/ now mirrors rpg-game-assets:harness/models/synty/."
