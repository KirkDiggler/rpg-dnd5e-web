#!/bin/sh
# Mirror the two approved private runtime roots from rpg-game-assets into the
# web app. Source-library and review artifacts remain outside this boundary.
#
# Usage: npm run assets:sync
#   or:  sh scripts/sync-game-assets.sh
#
# Local/automation overrides:
#   RPG_GAME_ASSETS_PATH    explicit private provider checkout (never updated)
#   RPG_GAME_ASSETS_DIR     legacy private provider checkout override
#   RPG_WEB_ROOT            destination web checkout
#   RPG_CHARACTER_CUSTOMIZATION_CATALOG_GENERATOR test-only generator override
#   RPG_CHARACTER_CUSTOMIZATION_CATALOG_RUNNER    test-only TypeScript runner override
#   ASSETS_SYNC_SKIP_UPDATE skip clone/pull when set to 1

set -e

WORLD_ASSETS_ONLY=0
CHECK_ONLY=0
for ARG in "$@"; do
  case "$ARG" in
    --world-assets) WORLD_ASSETS_ONLY=1 ;;
    --check) CHECK_ONLY=1 ;;
    *)
      echo "ERROR: unknown asset sync argument: $ARG" >&2
      exit 2
      ;;
  esac
done
if [ "$CHECK_ONLY" = "1" ] && [ "$WORLD_ASSETS_ONLY" != "1" ]; then
  echo "ERROR: --check currently requires --world-assets" >&2
  exit 2
fi

ASSETS_REPO_URL="git@github.com:KirkDiggler/rpg-game-assets.git"
ASSETS_REPO_URL_HTTPS="https://github.com/KirkDiggler/rpg-game-assets.git"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEFAULT_WEB_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
WEB_ROOT=${RPG_WEB_ROOT:-$DEFAULT_WEB_ROOT}
PARENT_DIR=$(CDPATH= cd -- "$WEB_ROOT/.." && pwd)
if [ -n "${RPG_GAME_ASSETS_PATH:-}" ]; then
  ASSETS_DIR=$RPG_GAME_ASSETS_PATH
  EXPLICIT_ASSETS_SOURCE=1
  echo "Using explicit rpg-game-assets source at $ASSETS_DIR"
else
  ASSETS_DIR=${RPG_GAME_ASSETS_DIR:-$PARENT_DIR/rpg-game-assets}
  EXPLICIT_ASSETS_SOURCE=0
fi

if [ "$EXPLICIT_ASSETS_SOURCE" != "1" ] && [ "${ASSETS_SYNC_SKIP_UPDATE:-0}" != "1" ]; then
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

# A generated tracked catalog may never describe a moving or locally-mutated
# source. Resolve and validate the provider authority before either rsync
# destination can be changed.
if [ ! -d "$ASSETS_DIR" ] || [ -L "$ASSETS_DIR" ]; then
  echo "ERROR: provider root must be a real non-symlink directory: $ASSETS_DIR" >&2
  exit 1
fi
ASSETS_DIR=$(CDPATH= cd -- "$ASSETS_DIR" && pwd -P)
if ! ASSETS_HEAD=$(git -C "$ASSETS_DIR" rev-parse --verify 'HEAD^{commit}'); then
  echo "ERROR: provider HEAD must resolve to an exact commit" >&2
  exit 1
fi
case "$ASSETS_HEAD" in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
  *)
    echo "ERROR: provider HEAD must be an exact 40-character commit id" >&2
    exit 1
    ;;
esac
if [ -n "$(git -C "$ASSETS_DIR" status --porcelain=v1 --untracked-files=all)" ]; then
  echo "ERROR: provider checkout must be exactly clean" >&2
  exit 1
fi
echo "Pinned clean rpg-game-assets provider at $ASSETS_HEAD"

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

# The generic world-asset mode reuses the same provider selection, exact clean
# revision gate, and mirror primitive without running/deleting the complete
# private runtime mirror.
if [ "$WORLD_ASSETS_ONLY" = "1" ]; then
  WORLD_GENERATOR=${RPG_WORLD_ASSET_CATALOG_GENERATOR:-$SCRIPT_DIR/generate-world-asset-catalog.mjs}
  WORLD_RUNNER=${RPG_WORLD_ASSET_CATALOG_RUNNER:-node}
  WORLD_SRC="$ASSETS_DIR/harness/models/synty/world-assets"
  SYNTY_DEST="$WEB_ROOT/public/models/synty"
  WORLD_DEST="$SYNTY_DEST/world-assets"
  WORLD_OUTPUT="$WEB_ROOT/src/generated/worldAssetCatalog.ts"
  if [ ! -f "$WORLD_GENERATOR" ] || [ -L "$WORLD_GENERATOR" ]; then
    echo "ERROR: world asset catalog generator must be a real file: $WORLD_GENERATOR" >&2
    exit 1
  fi
  if [ ! -d "$WORLD_SRC" ] || [ -L "$WORLD_SRC" ]; then
    echo "ERROR: expected world asset source dir not found: $WORLD_SRC" >&2
    exit 1
  fi

  if [ "$CHECK_ONLY" = "1" ]; then
    "$WORLD_RUNNER" "$WORLD_GENERATOR" \
      --provider-root "$ASSETS_DIR" \
      --runtime-root "$SYNTY_DEST" \
      --output "$WORLD_OUTPUT" \
      --check
    echo "Done. synchronized world assets and generated catalog match provider $ASSETS_HEAD."
    exit 0
  fi

  mkdir -p "$(dirname "$WORLD_OUTPUT")"
  WORLD_STAGE=$(mktemp "$WEB_ROOT/src/generated/.world-assets.XXXXXX")
  trap 'rm -f "$WORLD_STAGE"' EXIT HUP INT TERM
  "$WORLD_RUNNER" "$WORLD_GENERATOR" \
    --provider-root "$ASSETS_DIR" \
    --output "$WORLD_STAGE"
  sync_runtime_root "$WORLD_SRC" "$WORLD_DEST"
  "$WORLD_RUNNER" "$WORLD_GENERATOR" \
    --provider-root "$ASSETS_DIR" \
    --runtime-root "$SYNTY_DEST" \
    --output "$WORLD_STAGE"
  mv -f "$WORLD_STAGE" "$WORLD_OUTPUT"
  trap - EXIT HUP INT TERM
  echo "Done. public/models/synty/world-assets and the exact generated catalog are current."
  exit 0
fi

CATALOG_GENERATOR=${RPG_CHARACTER_CUSTOMIZATION_CATALOG_GENERATOR:-${RPG_DWARF_CATALOG_GENERATOR:-$SCRIPT_DIR/generateCharacterCustomizationCatalog.ts}}
CATALOG_RUNNER=${RPG_CHARACTER_CUSTOMIZATION_CATALOG_RUNNER:-${RPG_DWARF_CATALOG_RUNNER:-$WEB_ROOT/node_modules/.bin/tsx}}
if [ ! -f "$CATALOG_GENERATOR" ] || [ -L "$CATALOG_GENERATOR" ]; then
  echo "ERROR: customization catalog generator must be a real file: $CATALOG_GENERATOR" >&2
  exit 1
fi
if [ ! -x "$CATALOG_RUNNER" ]; then
  echo "ERROR: customization catalog TypeScript runner is unavailable: $CATALOG_RUNNER" >&2
  exit 1
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

# Validate and generate against the clean provider before either rsync --delete
# can mutate a destination. The tracked catalog becomes visible only after both
# independent runtime mirrors succeed.
CATALOG_OUTPUT="$WEB_ROOT/src/generated/characterCustomizationCatalog.ts"
mkdir -p "$(dirname "$CATALOG_OUTPUT")"
CATALOG_STAGE=$(mktemp "$WEB_ROOT/src/generated/.character-customization.XXXXXX")
trap 'rm -f "$CATALOG_STAGE"' EXIT HUP INT TERM
"$CATALOG_RUNNER" "$CATALOG_GENERATOR" \
  --provider-root "$ASSETS_DIR" \
  --output "$CATALOG_STAGE"

# Keep these as independent mirrors: neither runtime root is allowed to supply
# or delete files in the other.
sync_runtime_root "$SYNTY_SRC" "$SYNTY_DEST"
sync_runtime_root "$CUSTOM_DICE_SRC" "$CUSTOM_DICE_DEST"
mv -f "$CATALOG_STAGE" "$CATALOG_OUTPUT"
trap - EXIT HUP INT TERM

echo "Done. public/models/{synty,custom-dice}/ mirror the approved provider and the aggregate customization catalog is current."
