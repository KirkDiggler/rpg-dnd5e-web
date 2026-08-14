#!/bin/sh
# Compatibility entrypoint. The private asset boundary now requires both the
# Synty and custom-dice runtime roots to be preflighted and synced together.

set -e

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec sh "$SCRIPT_DIR/sync-game-assets.sh" "$@"
