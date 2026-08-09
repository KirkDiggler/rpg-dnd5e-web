#!/bin/sh
# Compatibility entry point; all local and Docker asset syncs use the same
# exact-provider atomic stage implementation.
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$SCRIPT_DIR/stage-locked-synty-assets.sh" "$@"
