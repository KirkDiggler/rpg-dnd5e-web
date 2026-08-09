#!/bin/sh
# Stage the complete Synty runtime bundle from the immutable Wave B provider.
# The producer verifier owns the atomic swap; this script only proves the
# tracked aggregate lock and points the legacy /models/synty URL at that bundle.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
WEB_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
LOCK="$WEB_ROOT/src/rendering/visualPlacement/provider-lock.json"
DESTINATION="$WEB_ROOT/.asset-stage"
PROVIDER_CHECKOUT=""
CREATED_WORKTREE=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --provider-checkout) PROVIDER_CHECKOUT=$2; shift 2 ;;
    --destination) DESTINATION=$2; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

lock_value() {
  node -e "const v=require(process.argv[1]); let x=v; for (const p of process.argv[2].split('.')) x=x[p]; process.stdout.write(String(x))" "$LOCK" "$1"
}

PROVIDER_SHA=$(lock_value provider.commit)
CATALOG_SHA=$(lock_value catalog.sha256)
INVENTORY_SHA=$(lock_value inventory.sha256)
TREE_SHA=$(lock_value inventory.treeSha256)
FILE_COUNT=$(lock_value inventory.fileCount)

cleanup() {
  if [ -n "$CREATED_WORKTREE" ]; then
    git -C "$WEB_ROOT/../rpg-game-assets" worktree remove --force "$CREATED_WORKTREE" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT HUP INT TERM

if [ -z "$PROVIDER_CHECKOUT" ]; then
  PROVIDER_REPO="$WEB_ROOT/../rpg-game-assets"
  test -d "$PROVIDER_REPO/.git" || {
    echo "locked provider checkout required (expected $PROVIDER_REPO or --provider-checkout)" >&2
    exit 1
  }
  CREATED_WORKTREE=$(mktemp -d "${TMPDIR:-/tmp}/rpg-game-assets-locked.XXXXXX")
  rmdir "$CREATED_WORKTREE"
  git -C "$PROVIDER_REPO" worktree add --detach "$CREATED_WORKTREE" "$PROVIDER_SHA" >/dev/null
  PROVIDER_CHECKOUT=$CREATED_WORKTREE
fi

ACTUAL_HEAD=$(git -C "$PROVIDER_CHECKOUT" rev-parse HEAD)
test "$ACTUAL_HEAD" = "$PROVIDER_SHA" || {
  echo "provider HEAD mismatch: expected $PROVIDER_SHA, got $ACTUAL_HEAD" >&2
  exit 1
}
if git -C "$PROVIDER_CHECKOUT" symbolic-ref -q HEAD >/dev/null 2>&1; then
  echo "provider checkout must be detached at the exact locked commit" >&2
  exit 1
fi
test -z "$(git -C "$PROVIDER_CHECKOUT" status --porcelain)" || {
  echo "provider checkout must be clean" >&2
  exit 1
}

printf '%s  %s\n' "$CATALOG_SHA" "$PROVIDER_CHECKOUT/harness/catalogs/synty-web-assets.json" | sha256sum -c -
printf '%s  %s\n' "$INVENTORY_SHA" "$PROVIDER_CHECKOUT/harness/catalogs/synty-complete-inventory.json" | sha256sum -c -
printf '%s  %s\n' "$CATALOG_SHA" "$WEB_ROOT/src/rendering/visualPlacement/synty-web-assets.json" | sha256sum -c -
cmp "$PROVIDER_CHECKOUT/harness/catalogs/synty-web-assets.json" "$WEB_ROOT/src/rendering/visualPlacement/synty-web-assets.json"

(
  cd "$PROVIDER_CHECKOUT"
  python3 scripts/build_web_asset_catalog.py --check
  python3 scripts/build_synty_complete_inventory.py --check
  python3 scripts/verify_web_asset_stage.py --verify-only
  python3 scripts/verify_web_asset_stage.py --destination "$DESTINATION"
)

test -z "$(git -C "$PROVIDER_CHECKOUT" status --porcelain)" || {
  echo "producer checks dirtied the locked checkout" >&2
  exit 1
}

# Independent aggregate check against the staged tree. The private inventory
# remains only in the provider checkout and is never copied into tracked web data.
python3 - "$DESTINATION" "$TREE_SHA" "$FILE_COUNT" <<'PY'
import hashlib, pathlib, sys
root = pathlib.Path(sys.argv[1]) / 'models' / 'synty'
expected_tree, expected_count = sys.argv[2], int(sys.argv[3])
rows=[]
for path in sorted(p for p in root.rglob('*') if p.is_file()):
    rel=path.relative_to(root).as_posix()
    data=path.read_bytes()
    rows.append(f"{rel}\0{len(data)}\0{hashlib.sha256(data).hexdigest()}\n")
actual=hashlib.sha256(''.join(rows).encode()).hexdigest()
if len(rows) != expected_count or actual != expected_tree:
    raise SystemExit(f"staged tree mismatch: count={len(rows)} sha256={actual}")
print(f"staged locked provider: {len(rows)} files treeSha256={actual}")
PY

mkdir -p "$WEB_ROOT/public/models"
LINK_TMP="$WEB_ROOT/public/models/.synty-link.$$"
ln -s ../../.asset-stage/models/synty "$LINK_TMP"
mv -Tf "$LINK_TMP" "$WEB_ROOT/public/models/synty"
echo "legacy and Docker build path /models/synty now uses atomic locked stage $DESTINATION"
