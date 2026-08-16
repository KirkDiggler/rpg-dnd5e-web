# Error summary

## Accepted evidence

- Forbidden console errors: **0**
- Page errors: **0**
- Failed canonical standing/downed requests: **0**
- GLTF / ErrorBoundary / WebGL context loss / standing-zero-clip warnings: **0**
- Rejected RPCs inside the eight accepted per-class standing/downed UTC windows: **0**
- Accepted browser/runtime error counts remain **zero**.

The exact inclusive windows are machine-readable in `runtime-receipt.json` and span the ordered final run from Fighter standing at `2026-08-16T05:42:19.280921814Z` through Barbarian downed at `2026-08-16T05:43:38.713149275Z`. Accepted capture windows contain **zero rejected RPCs**.

## Discarded preliminary traffic

`logs/api.log` contains one rejected RPC at `2026-08-16T05:37:00Z`: `MoveEntity` failed with `FailedPrecondition` because movement remaining was insufficient. This was a **discarded preliminary click diagnostic**, not an accepted capture, and it lies outside every accepted window.

## Classified non-error noise

- Expected development StrictMode stream aborts: **8** (one initial effect abort per fresh standing/downed context; every replacement stream completed).
- Chrome headless SwiftShader `ReadPixels` GPU-stall message: a performance warning, not WebGL context loss or a render error.
- Redis memory-overcommit/default-config warnings and Envoy deprecation/internal-address/resource-limit warnings: **expected infrastructure startup/deprecation/resource-limit noise**, with **no observed capture impact**.

No arbitrary authorization credential is retained. Network records contain only Dev scheme/player identity.
