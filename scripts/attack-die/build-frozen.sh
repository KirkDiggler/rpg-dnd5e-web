#!/usr/bin/env bash
set -euo pipefail

OUT=
while (($#)); do
  case "$1" in
    --out) OUT=${2:-}; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
: "${OUT:?--out is required}"
: "${VITE_ATTACK_DIE_WEB_COMMIT:?VITE_ATTACK_DIE_WEB_COMMIT is required}"
[[ "$VITE_ATTACK_DIE_WEB_COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo 'web commit must be a full SHA' >&2; exit 1; }
ROOT=$(git rev-parse --show-toplevel)
DIST="$ROOT/dist"
OUT_ABS=$(realpath -m "$OUT")
case "$OUT_ABS" in "$DIST"|"$DIST"/*) echo '--out must be outside dist' >&2; exit 1;; esac
# Ignore unrelated runtime artifacts, but require the tracked tree and index clean.
test -z "$(git status --porcelain=v1 --untracked-files=no)" || { echo 'tracked/index state must be clean' >&2; exit 1; }

SYNTY_PROVIDER="$ROOT/public/models/synty"
CUSTOM_DICE_PROVIDER="$ROOT/public/models/custom-dice"
TEMP=$(mktemp -d "$ROOT/.attack-die-frozen-providers.XXXXXX")
SYNTY_MOVED=0
CUSTOM_DICE_MOVED=0
restore_providers() {
  if [[ "$SYNTY_MOVED" = 1 && -e "$TEMP/synty" ]]; then
    rm -rf "$SYNTY_PROVIDER"
    mkdir -p "$(dirname "$SYNTY_PROVIDER")"
    mv "$TEMP/synty" "$SYNTY_PROVIDER"
    SYNTY_MOVED=0
  fi
  if [[ "$CUSTOM_DICE_MOVED" = 1 && -e "$TEMP/custom-dice" ]]; then
    rm -rf "$CUSTOM_DICE_PROVIDER"
    mkdir -p "$(dirname "$CUSTOM_DICE_PROVIDER")"
    mv "$TEMP/custom-dice" "$CUSTOM_DICE_PROVIDER"
    CUSTOM_DICE_MOVED=0
  fi
  rm -rf "$TEMP"
}
trap restore_providers EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ -e "$SYNTY_PROVIDER" ]]; then
  SYNTY_MOVED=1
  mv "$SYNTY_PROVIDER" "$TEMP/synty"
fi
if [[ -e "$CUSTOM_DICE_PROVIDER" ]]; then
  CUSTOM_DICE_MOVED=1
  mv "$CUSTOM_DICE_PROVIDER" "$TEMP/custom-dice"
fi

npm run attack-die:build
for PRIVATE_TREE in models/synty models/custom-dice; do
  if [[ -e "$DIST/$PRIVATE_TREE" ]]; then
    echo "private provider entered dist: $PRIVATE_TREE" >&2
    exit 1
  fi
done
npm run attack-die:hash-build -- --dist "$DIST" --out "$OUT_ABS"
restore_providers
trap - EXIT INT TERM
