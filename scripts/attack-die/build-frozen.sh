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

PROVIDER="$ROOT/public/models/synty"
TEMP=$(mktemp -d)
MOVED=0
restore_provider() {
  if [[ "$MOVED" = 1 && -e "$TEMP/synty" ]]; then
    rm -rf "$PROVIDER"
    mkdir -p "$(dirname "$PROVIDER")"
    mv "$TEMP/synty" "$PROVIDER"
  fi
  rm -rf "$TEMP"
}
trap restore_provider EXIT INT TERM
if [[ -e "$PROVIDER" ]]; then mv "$PROVIDER" "$TEMP/synty"; MOVED=1; fi
npm run attack-die:build
npm run attack-die:hash-build -- --dist "$DIST" --out "$OUT_ABS"
restore_provider
MOVED=0
trap - EXIT INT TERM
