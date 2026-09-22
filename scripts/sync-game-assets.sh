#!/bin/sh
# Mirror the two approved private runtime roots from rpg-game-assets into the
# web app. Source-library and review artifacts remain outside this boundary.
#
# Usage: npm run assets:sync
#   or:  sh scripts/sync-game-assets.sh
#
# Modes:
#   --runtime-assets        mirror only the two production runtime roots at provider HEAD
#   --pinned-runtime        mirror those roots from the commits the committed catalogs pin,
#                           never rewriting a tracked catalog
#   --world-assets          mirror world assets and generate their catalog
#   --world-assets --check  validate the world runtime/catalog without changes
#
# Flags:
#   --allow-provider-bump   adopt provider HEAD when it differs from the commit the
#                           committed catalogs pin, regenerating those catalogs
#
# The committed catalog is the pin. A default sync regenerates it only for the
# provider revision it already describes; adopting a different provider revision
# is a reviewed source change and needs the explicit flag.
#
# Local/automation overrides:
#   RPG_GAME_ASSETS_PATH    explicit private provider checkout (never updated)
#   RPG_GAME_ASSETS_DIR     legacy private provider checkout override
#   RPG_WEB_ROOT            destination web checkout
#   RPG_CHARACTER_CUSTOMIZATION_CATALOG_GENERATOR test-only generator override
#   RPG_CHARACTER_CUSTOMIZATION_CATALOG_RUNNER    test-only TypeScript runner override
#   RPG_NPC_APPEARANCE_CATALOG_GENERATOR          test-only generator override
#   RPG_NPC_APPEARANCE_CATALOG_RUNNER             test-only generator runner override
#   RPG_NPC_APPEARANCE_RELEASE_SELECTION          release-selection override
#   RPG_ASSETS_ALLOW_PROVIDER_BUMP same as --allow-provider-bump
#   ASSETS_SYNC_SKIP_UPDATE skip clone/pull when set to 1

set -e

RUNTIME_ASSETS_ONLY=0
WORLD_ASSETS_ONLY=0
CHECK_ONLY=0
PINNED_RUNTIME=0
ALLOW_PROVIDER_BUMP=${RPG_ASSETS_ALLOW_PROVIDER_BUMP:-0}
for ARG in "$@"; do
  case "$ARG" in
    --runtime-assets) RUNTIME_ASSETS_ONLY=1 ;;
    --pinned-runtime) PINNED_RUNTIME=1 ;;
    --world-assets) WORLD_ASSETS_ONLY=1 ;;
    --check) CHECK_ONLY=1 ;;
    --allow-provider-bump) ALLOW_PROVIDER_BUMP=1 ;;
    *)
      echo "ERROR: unknown asset sync argument: $ARG" >&2
      exit 2
      ;;
  esac
done
if [ "$RUNTIME_ASSETS_ONLY" = "1" ] && { [ "$WORLD_ASSETS_ONLY" = "1" ] || [ "$CHECK_ONLY" = "1" ] || [ "$PINNED_RUNTIME" = "1" ]; }; then
  echo "ERROR: --runtime-assets cannot be combined with other modes" >&2
  exit 2
fi
if [ "$PINNED_RUNTIME" = "1" ] && { [ "$WORLD_ASSETS_ONLY" = "1" ] || [ "$CHECK_ONLY" = "1" ]; }; then
  echo "ERROR: --pinned-runtime cannot be combined with other modes" >&2
  exit 2
fi
if [ "$CHECK_ONLY" = "1" ] && [ "$WORLD_ASSETS_ONLY" != "1" ]; then
  echo "ERROR: --check currently requires --world-assets" >&2
  exit 2
fi
if [ "$ALLOW_PROVIDER_BUMP" = "1" ] && { [ "$RUNTIME_ASSETS_ONLY" = "1" ] || [ "$PINNED_RUNTIME" = "1" ] || [ "$WORLD_ASSETS_ONLY" = "1" ] || [ "$CHECK_ONLY" = "1" ]; }; then
  echo "ERROR: --allow-provider-bump applies only to the default catalog sync" >&2
  exit 2
fi

ASSETS_REPO_URL="git@github.com:KirkDiggler/rpg-game-assets.git"
ASSETS_REPO_URL_HTTPS="https://github.com/KirkDiggler/rpg-game-assets.git"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEFAULT_WEB_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
WEB_ROOT=${RPG_WEB_ROOT:-$DEFAULT_WEB_ROOT}
PARENT_DIR=$(CDPATH= cd -- "$WEB_ROOT/.." && pwd)
CATALOG_OUTPUT="$WEB_ROOT/src/generated/characterCustomizationCatalog.ts"
NPC_CATALOG_OUTPUT="$WEB_ROOT/src/generated/npcAppearanceCatalog.ts"
WORLD_CATALOG_OUTPUT="$WEB_ROOT/src/generated/worldAssetCatalog.ts"

# A committed catalog records the exact provider commit it was generated from.
# That commit is the pin: the mirror has to reproduce it, and only an explicit
# provider bump may move it. An absent or pinless catalog prints nothing.
catalog_provider_commit() {
  CATALOG_FILE=$1
  [ -f "$CATALOG_FILE" ] || return 0
  sed -n "s/.*providerCommit: '\([0-9a-f]\{40\}\)'.*/\1/p" "$CATALOG_FILE" | head -n 1
}

catalog_commit() {
  CATALOG_FILE=$1
  [ -f "$CATALOG_FILE" ] || return 0
  sed -n "s/^[[:space:]]*commit: '\([0-9a-f]\{40\}\)'.*/\1/p" "$CATALOG_FILE" | head -n 1
}

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
CHARACTER_PIN=$(catalog_provider_commit "$CATALOG_OUTPUT")
NPC_PIN=$(catalog_commit "$NPC_CATALOG_OUTPUT")
WORLD_PIN=$(catalog_commit "$WORLD_CATALOG_OUTPUT")
echo "Resolved clean rpg-game-assets provider checkout at $ASSETS_HEAD"
if [ -n "$CHARACTER_PIN$NPC_PIN$WORLD_PIN" ]; then
  echo "Committed catalogs pin provider: customization ${CHARACTER_PIN:-none}, NPC appearance ${NPC_PIN:-none}, world ${WORLD_PIN:-none}"
else
  echo "Committed catalogs carry no provider pin yet"
fi

# A default sync regenerates only the customization and NPC catalogs, so only
# their pins decide whether the next catalog generation is a reviewed bump.
UNBUMPED_PINS=
for PIN in "$CHARACTER_PIN" "$NPC_PIN"; do
  if [ -n "$PIN" ] && [ "$PIN" != "$ASSETS_HEAD" ]; then
    UNBUMPED_PINS="${UNBUMPED_PINS:+$UNBUMPED_PINS, }$PIN"
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

# The committed catalog is the pin. Regenerating it for a provider revision it
# does not already describe is a reviewed source change, not a side effect of a
# sync, so refuse it loudly unless the caller opts in. The mirror-only modes do
# not regenerate catalogs and are handled below.
if [ "$RUNTIME_ASSETS_ONLY" != "1" ] && [ "$PINNED_RUNTIME" != "1" ] \
  && [ -n "$UNBUMPED_PINS" ] && [ "$ALLOW_PROVIDER_BUMP" != "1" ]; then
  echo "ERROR: provider HEAD $ASSETS_HEAD differs from the commit pinned by the committed catalogs ($UNBUMPED_PINS)" >&2
  echo "       Moving the pin rewrites tracked catalogs; it must be its own reviewed change." >&2
  echo "       Adopt $ASSETS_HEAD deliberately: npm run assets:sync:bump" >&2
  echo "       Or serve the pinned revision instead: npm run assets:sync:pinned" >&2
  exit 1
fi

MIRROR_ROOT=$ASSETS_DIR
PINNED_MIRROR_ROOT=

# A serving environment must reproduce exactly the bytes its committed catalogs
# describe. Each catalog governs its own subtree, so the mirror is a union:
# pinned subtrees from their own commits and everything else from the clean
# provider checkout. Nothing here touches the provider worktree or its HEAD.
if [ "$PINNED_RUNTIME" = "1" ]; then
  if [ -z "$CHARACTER_PIN$NPC_PIN$WORLD_PIN" ]; then
    echo "ERROR: --pinned-runtime needs a committed catalog that pins a provider commit" >&2
    echo "       Establish one deliberately with: npm run assets:sync:bump" >&2
    exit 1
  fi

  require_pinned_commit() {
    if git -C "$ASSETS_DIR" cat-file -e "$1^{commit}" 2>/dev/null; then
      return 0
    fi
    if [ "$EXPLICIT_ASSETS_SOURCE" != "1" ] && [ "${ASSETS_SYNC_SKIP_UPDATE:-0}" != "1" ]; then
      echo "Fetching pinned provider commit $1..."
      git -C "$ASSETS_DIR" fetch origin "$1" || true
    fi
    if ! git -C "$ASSETS_DIR" cat-file -e "$1^{commit}" 2>/dev/null; then
      echo "ERROR: committed catalogs pin provider $1 but that commit is not in $ASSETS_DIR" >&2
      echo "       Fetch it in the provider, or adopt the current HEAD deliberately: npm run assets:sync:bump" >&2
      exit 1
    fi
  }

  NEEDS_UNION=0
  for PIN in "$CHARACTER_PIN" "$NPC_PIN" "$WORLD_PIN"; do
    [ -n "$PIN" ] || continue
    require_pinned_commit "$PIN"
    [ "$PIN" != "$ASSETS_HEAD" ] && NEEDS_UNION=1
  done

  if [ "$NEEDS_UNION" = "1" ]; then
    MIRROR_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/rpg-assets-pin.XXXXXX")
    PINNED_MIRROR_ROOT=$MIRROR_ROOT
    trap 'rm -rf "$PINNED_MIRROR_ROOT"' EXIT HUP INT TERM
    echo "Assembling pinned runtime roots (provider HEAD is $ASSETS_HEAD)..."
    git -C "$ASSETS_DIR" archive HEAD harness/models/synty harness/models/custom-dice \
      | tar -x -C "$MIRROR_ROOT"

    overlay_pinned_subtree() {
      OVERLAY_PIN=$1
      OVERLAY_SUBTREE=$2
      [ -n "$OVERLAY_PIN" ] || return 0
      [ "$OVERLAY_PIN" != "$ASSETS_HEAD" ] || return 0
      [ -n "$OVERLAY_SUBTREE" ] || return 0
      echo "  harness/models/synty/$OVERLAY_SUBTREE <- $OVERLAY_PIN"
      rm -rf "$MIRROR_ROOT/harness/models/synty/$OVERLAY_SUBTREE"
      git -C "$ASSETS_DIR" archive "$OVERLAY_PIN" "harness/models/synty/$OVERLAY_SUBTREE" \
        | tar -x -C "$MIRROR_ROOT"
    }

    # Catalog-to-subtree contract: customization and NPC appearance each own one
    # subtree; the world catalog owns world-assets. Every other synty entry and
    # the custom dice roots carry no committed pin and stay at provider HEAD.
    overlay_pinned_subtree "$CHARACTER_PIN" characters
    overlay_pinned_subtree "$NPC_PIN" npcs
    overlay_pinned_subtree "$WORLD_PIN" world-assets
  fi
fi

SYNTY_SRC="$MIRROR_ROOT/harness/models/synty"
CUSTOM_DICE_SRC="$MIRROR_ROOT/harness/models/custom-dice"
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

if [ "$RUNTIME_ASSETS_ONLY" = "1" ] || [ "$PINNED_RUNTIME" = "1" ]; then
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
  const excludedSegment = segments.find(
    (segment, index) =>
      segment.endsWith('.blend') ||
      (index < segments.length - 1 &&
        (segment === 'evidence' || segment === 'review'))
  );
  if (excludedSegment) {
    throw new Error(
      `production d20 model path is excluded from runtime sync: ${modelPath}`
    );
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
  if [ "$PINNED_RUNTIME" = "1" ]; then
    echo "Done. public/models/{synty,custom-dice}/ reproduce the subtrees pinned by the committed catalogs."
  else
    echo "Done. production public/models/{synty,custom-dice}/ runtime roots are complete for provider $ASSETS_HEAD."
  fi
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
NPC_CATALOG_GENERATOR=${RPG_NPC_APPEARANCE_CATALOG_GENERATOR:-$SCRIPT_DIR/generate-npc-appearance-catalog.mjs}
NPC_CATALOG_RUNNER=${RPG_NPC_APPEARANCE_CATALOG_RUNNER:-node}
NPC_SELECTION=${RPG_NPC_APPEARANCE_RELEASE_SELECTION:-$SCRIPT_DIR/configs/npc-appearance-releases.json}
if [ ! -f "$NPC_CATALOG_GENERATOR" ] || [ -L "$NPC_CATALOG_GENERATOR" ]; then
  echo "ERROR: NPC appearance catalog generator must be a real file: $NPC_CATALOG_GENERATOR" >&2
  exit 1
fi
if ! command -v "$NPC_CATALOG_RUNNER" >/dev/null 2>&1; then
  echo "ERROR: NPC appearance catalog runner is unavailable: $NPC_CATALOG_RUNNER" >&2
  exit 1
fi
if [ ! -f "$NPC_SELECTION" ] || [ -L "$NPC_SELECTION" ]; then
  echo "ERROR: NPC appearance release selection must be a real file: $NPC_SELECTION" >&2
  exit 1
fi

mkdir -p "$(dirname "$CATALOG_OUTPUT")"
CATALOG_STAGE=$(mktemp "$WEB_ROOT/src/generated/.character-customization.XXXXXX")
NPC_CATALOG_STAGE=$(mktemp "$WEB_ROOT/src/generated/.npc-appearances.XXXXXX")
trap 'rm -f "$CATALOG_STAGE" "$NPC_CATALOG_STAGE"' EXIT HUP INT TERM
"$CATALOG_RUNNER" "$CATALOG_GENERATOR" \
  --provider-root "$ASSETS_DIR" \
  --output "$CATALOG_STAGE"
"$NPC_CATALOG_RUNNER" "$NPC_CATALOG_GENERATOR" \
  --provider-root "$ASSETS_DIR" \
  --selection "$NPC_SELECTION" \
  --output "$NPC_CATALOG_STAGE"

# Keep these as independent mirrors: neither runtime root is allowed to supply
# or delete files in the other.
sync_runtime_root "$SYNTY_SRC" "$SYNTY_DEST"
sync_runtime_root "$CUSTOM_DICE_SRC" "$CUSTOM_DICE_DEST"
"$NPC_CATALOG_RUNNER" "$NPC_CATALOG_GENERATOR" \
  --provider-root "$ASSETS_DIR" \
  --selection "$NPC_SELECTION" \
  --runtime-root "$SYNTY_DEST" \
  --output "$NPC_CATALOG_STAGE"
mv -f "$CATALOG_STAGE" "$CATALOG_OUTPUT"
mv -f "$NPC_CATALOG_STAGE" "$NPC_CATALOG_OUTPUT"
trap - EXIT HUP INT TERM

echo "Done. public/models/{synty,custom-dice}/ mirror the approved provider and the aggregate customization and NPC appearance catalogs are current."
