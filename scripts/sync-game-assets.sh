#!/bin/sh
# Mirror the two approved private runtime roots from rpg-game-assets into the
# web app. Source-library and review artifacts remain outside this boundary.
#
# Usage: npm run assets:sync
#   or:  sh scripts/sync-game-assets.sh
#
# Modes:
#   --runtime-assets        mirror only the two production runtime roots
#   --world-assets          mirror world assets and generate their catalog
#   --world-assets --check  validate the world runtime/catalog without changes
#
# Local/automation overrides:
#   RPG_GAME_ASSETS_PATH    explicit private provider checkout (never updated)
#   RPG_GAME_ASSETS_DIR     legacy private provider checkout override
#   RPG_WEB_ROOT            destination web checkout
#   RPG_CHARACTER_CUSTOMIZATION_CATALOG_GENERATOR test-only generator override
#   RPG_CHARACTER_CUSTOMIZATION_CATALOG_RUNNER    test-only TypeScript runner override
#   ASSETS_SYNC_SKIP_UPDATE skip clone/pull when set to 1

set -e

RUNTIME_ASSETS_ONLY=0
WORLD_ASSETS_ONLY=0
CHECK_ONLY=0
for ARG in "$@"; do
  case "$ARG" in
    --runtime-assets) RUNTIME_ASSETS_ONLY=1 ;;
    --world-assets) WORLD_ASSETS_ONLY=1 ;;
    --check) CHECK_ONLY=1 ;;
    *)
      echo "ERROR: unknown asset sync argument: $ARG" >&2
      exit 2
      ;;
  esac
done
if [ "$RUNTIME_ASSETS_ONLY" = "1" ] && { [ "$WORLD_ASSETS_ONLY" = "1" ] || [ "$CHECK_ONLY" = "1" ]; }; then
  echo "ERROR: --runtime-assets cannot be combined with other modes" >&2
  exit 2
fi
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
    --exclude='review/' \
    --exclude='*/review/' \
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

SYNTY_SRC="$ASSETS_DIR/harness/models/synty"
CUSTOM_DICE_SRC="$ASSETS_DIR/harness/models/custom-dice"
SYNTY_DEST="$WEB_ROOT/public/models/synty"
CUSTOM_DICE_DEST="$WEB_ROOT/public/models/custom-dice"

# Preflight the complete approved boundary before rsync --delete can mutate
# either destination. Runtime roots and required dice files must be real
# provider entries rather than links to material outside the approved roots.
for SRC in "$SYNTY_SRC" "$CUSTOM_DICE_SRC"; do
  if [ ! -d "$SRC" ] || [ -L "$SRC" ]; then
    echo "ERROR: expected asset source dir not found: $SRC" >&2
    exit 1
  fi
done

if [ "$RUNTIME_ASSETS_ONLY" = "1" ]; then
  DICE_MANIFEST="$CUSTOM_DICE_SRC/dice-tray-presets.json"
  if [ ! -f "$DICE_MANIFEST" ] || [ -L "$DICE_MANIFEST" ]; then
    echo "ERROR: required production dice manifest not found: $DICE_MANIFEST" >&2
    exit 1
  fi
  DICE_MODEL_RELATIVE_PATH=$(
    node - "$DICE_MANIFEST" <<'NODE'
const fs = require('node:fs');

try {
  const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const matches = Array.isArray(manifest.presets)
    ? manifest.presets.filter(
        (entry) => entry?.presetId === 'dice.original.carved.d20'
      )
    : [];
  if (matches.length !== 1) {
    throw new Error(
      'expected exactly one dice.original.carved.d20 production preset'
    );
  }
  const modelPath = matches[0]?.model?.path;
  const segments =
    typeof modelPath === 'string' ? modelPath.split('/') : [];
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === '.' || segment === '..') ||
    modelPath.startsWith('/') ||
    modelPath.includes('\\')
  ) {
    throw new Error('production d20 model path must stay within custom-dice');
  }
  process.stdout.write(modelPath);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
NODE
  ) || {
    echo "ERROR: invalid production dice manifest: $DICE_MANIFEST" >&2
    exit 1
  }
  DICE_MODEL="$CUSTOM_DICE_SRC/$DICE_MODEL_RELATIVE_PATH"
  if [ ! -f "$DICE_MODEL" ] || [ -L "$DICE_MODEL" ]; then
    echo "ERROR: required manifest-referenced production dice model not found: $DICE_MODEL" >&2
    exit 1
  fi

  # Production packaging intentionally skips tracked catalog generation: the
  # clean provider checkout remains authoritative for these private bytes.
  sync_runtime_root "$SYNTY_SRC" "$SYNTY_DEST"
  sync_runtime_root "$CUSTOM_DICE_SRC" "$CUSTOM_DICE_DEST"
  echo "Done. production public/models/{synty,custom-dice}/ runtime roots are complete for provider $ASSETS_HEAD."
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
