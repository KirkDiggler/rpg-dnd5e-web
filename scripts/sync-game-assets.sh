#!/bin/sh
# Mirror the two approved private runtime roots from rpg-game-assets into the
# web app. Source-library and review artifacts remain outside this boundary.
#
# Usage: npm run assets:sync
#   or:  sh scripts/sync-game-assets.sh
#
# Test/automation overrides:
#   RPG_GAME_ASSETS_DIR     private provider checkout
#   RPG_WEB_ROOT            destination web checkout
#   ASSETS_SYNC_SKIP_UPDATE skip clone/pull when set to 1

set -e

ASSETS_REPO_URL="git@github.com:KirkDiggler/rpg-game-assets.git"
ASSETS_REPO_URL_HTTPS="https://github.com/KirkDiggler/rpg-game-assets.git"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEFAULT_WEB_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
WEB_ROOT=${RPG_WEB_ROOT:-$DEFAULT_WEB_ROOT}
PARENT_DIR=$(CDPATH= cd -- "$WEB_ROOT/.." && pwd)
ASSETS_DIR=${RPG_GAME_ASSETS_DIR:-$PARENT_DIR/rpg-game-assets}

if [ "${ASSETS_SYNC_SKIP_UPDATE:-0}" != "1" ]; then
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
fi

SYNTY_SRC="$ASSETS_DIR/harness/models/synty"
CUSTOM_DICE_SRC="$ASSETS_DIR/harness/models/custom-dice"
SYNTY_DEST="$WEB_ROOT/public/models/synty"
CUSTOM_DICE_DEST="$WEB_ROOT/public/models/custom-dice"

# Preflight the complete approved boundary before rsync --delete can mutate
# either destination.
for SRC in "$SYNTY_SRC" "$CUSTOM_DICE_SRC"; do
  if [ ! -d "$SRC" ]; then
    echo "ERROR: expected asset source dir not found: $SRC" >&2
    exit 1
  fi
done

sync_runtime_root() {
  SRC=$1
  DEST=$2
  mkdir -p "$DEST"
  echo "Syncing $SRC/ -> $DEST/"
  rsync -a --delete --delete-excluded \
    --exclude='*.blend' \
    --exclude='evidence/' \
    --exclude='*/evidence/' \
    "$SRC/" "$DEST/"
}

# Keep these as independent mirrors: neither runtime root is allowed to supply
# or delete files in the other.
sync_runtime_root "$SYNTY_SRC" "$SYNTY_DEST"
sync_runtime_root "$CUSTOM_DICE_SRC" "$CUSTOM_DICE_DEST"

echo "Done. public/models/{synty,custom-dice}/ now mirror the approved rpg-game-assets runtime roots."
