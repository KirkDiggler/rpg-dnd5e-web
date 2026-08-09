#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
TMP=$(mktemp -d)
IMAGE="trusted-sandbox-test-$$"
cleanup() {
  docker image rm -f "$IMAGE" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT HUP INT TERM
mkdir -p "$TMP/source/public/models/synty" "$TMP/logs"
printf 'synthetic-not-licensed\n' >"$TMP/source/public/models/synty/fixture.txt"
cat >"$TMP/source/package.json" <<'JSON'
{"name":"sandbox-probe","version":"1.0.0","scripts":{"lifecycle-probe":"node lifecycle-probe.mjs"}}
JSON
cat >"$TMP/source/lifecycle-probe.mjs" <<'JS'
import dns from 'node:dns/promises';
try { await dns.lookup('github.com'); process.exit(91); } catch { process.exit(0); }
JS
chmod -R a+rwX "$TMP/source"
docker build --pull=false -q -t "$IMAGE" -f "$ROOT/scripts/trusted-sandbox.Dockerfile" "$ROOT/scripts" >"$TMP/logs/build" 2>&1
run_canary() {
  network=$1; shift
  docker run --rm --network "$network" --read-only --user 65532:65532 \
    --cap-drop ALL --security-opt no-new-privileges --pids-limit 256 --memory 1g --cpus 1 \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=128m \
    --mount "type=bind,src=$TMP/source,dst=/workspace" \
    --mount "type=bind,src=$TMP/source/public/models/synty,dst=/workspace/public/models/synty,readonly" \
    --mount "type=bind,src=$ROOT/scripts,dst=/trusted,readonly" \
    --workdir /workspace "$@" "$IMAGE" node /trusted/trusted-sandbox-canary.mjs
}
# Trusted policy passes and jointly exercises DNS, public TCP, GitHub HTTPS,
# Docker-host TCP, proxy absence, host sockets, nonroot, and read-only assets.
run_canary none >"$TMP/logs/pass" 2>&1
# Removing no-egress must be killed by at least DNS/GitHub/TCP.
if run_canary bridge >"$TMP/logs/network-mutant" 2>&1; then exit 20; fi
# Proxy control state is independently rejected.
if run_canary none --env HTTPS_PROXY=http://127.0.0.1:9 >"$TMP/logs/proxy-mutant" 2>&1; then exit 21; fi
# A host control socket is independently rejected when Docker exposes one.
if [ -S /var/run/docker.sock ]; then
  if run_canary none --mount type=bind,src=/var/run/docker.sock,dst=/run/docker.sock >"$TMP/logs/socket-mutant" 2>&1; then exit 22; fi
fi
# Removing the read-only asset mount is killed by a write probe.
if docker run --rm --network none --read-only --user 65532:65532 \
  --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,nodev,size=128m \
  --mount "type=bind,src=$TMP/source,dst=/workspace" \
  --mount "type=bind,src=$ROOT/scripts,dst=/trusted,readonly" --workdir /workspace \
  "$IMAGE" node /trusted/trusted-sandbox-canary.mjs >"$TMP/logs/writable-mutant" 2>&1; then exit 23; fi
# A PR-controlled lifecycle probe passes only after staging when egress is absent.
docker run --rm --network none --read-only --user 65532:65532 \
  --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,nodev,size=128m \
  --mount "type=bind,src=$TMP/source,dst=/workspace" --workdir /workspace \
  "$IMAGE" npm run lifecycle-probe >"$TMP/logs/lifecycle-pass" 2>&1
if docker run --rm --network bridge --read-only --user 65532:65532 \
  --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,nodev,size=128m \
  --mount "type=bind,src=$TMP/source,dst=/workspace" --workdir /workspace \
  "$IMAGE" npm run lifecycle-probe >"$TMP/logs/lifecycle-network-mutant" 2>&1; then exit 24; fi
# PR stdout is captured in private scratch, never emitted; the trusted scanner
# mutation test separately proves this canary would be rejected as evidence.
docker run --rm --network none --user 65532:65532 "$IMAGE" \
  node -e 'process.stdout.write("STDOUT-CANARY-PRIVATE\n")' >"$TMP/logs/stdout-private" 2>&1
grep -qx 'STDOUT-CANARY-PRIVATE' "$TMP/logs/stdout-private"
rm -f "$TMP/logs/stdout-private"
printf 'trusted sandbox integration: pass\n'
