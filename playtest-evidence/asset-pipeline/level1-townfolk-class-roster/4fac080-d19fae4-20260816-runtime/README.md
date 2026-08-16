# Townfolk pinned real-WebGL runtime candidate

Status: **PASS**. This private candidate binds the exact provider, web, API, Redis, and Envoy identities in `runtime-receipt.json` and `services/service-identities.json`.

## What is proved

For Fighter, Monk, Rogue, and Barbarian:

- a real `GetEncounter` bound player/entity/class/HP/placement before capture;
- a fresh 1600x1000 Google Chrome context loaded the ordinary query harness (never `attackDiePerf`) with Dev player auth;
- the canonical standing response was HTTP 200, valid GLB 2, byte-equal to the provider, and contained exactly ordered `Idle_Relaxed`, `Walk_Forward` clips;
- Canvas pointer hover/click caused two real 3-entry paths, with streamed `EntityMoved.actualPath` exactly equal to the source-derived A* plan;
- screenshots and continuous WebM show idle, visible walking stride, materially different headings/facing, and return to idle;
- after an immediate reseed, only real `MoveEntity`/`EndTurn` RPCs and normal NPC attacks produced target HP 0 plus `dnd5e:conditions:unconscious`;
- a fresh browser context loaded the canonical downed GLB, byte-equal to the provider with zero animations, and rendered a stable prone model without extra consumer tilt.

The Rogue destructive pass used Bob-auth turns, moved Bob away, and moved Alice adjacent through real RPCs. Bob was also downed by authentic NPC combat in the accepted attempt; Alice remains the bound target and has independent HP/status/class/asset proof.

## Review order

1. `runtime-receipt.json` and `validation-output.txt`
2. each class `review-sheet.jpg`
3. each class `standing.json`, `downed.json`, and `downed-provenance.json`
4. original `standing.webm` / `downed.webm` plus extracted `*-video-frame*.png`
5. sanitized network summaries and service identities
6. `evidence.sha256`

## Accepted capture scope and raw-log accounting

`runtime-receipt.json` records these exact inclusive UTC windows, derived from final-run seed completion mtimes, final class network-record mtimes, the API log, class records, and capture-progress ordering:

| Class | Standing | Downed |
|---|---|---|
| Fighter | `05:42:19.280921814–05:42:31.866041087Z` | `05:42:31.879041210–05:42:39.176110352Z` |
| Monk | `05:42:39.189110474–05:42:51.584501689Z` | `05:42:51.598228030–05:42:58.987435677Z` |
| Rogue | `05:42:59.000298139–05:43:11.716001140Z` | `05:43:11.731418696–05:43:19.002117364Z` |
| Barbarian | `05:43:19.015487659–05:43:31.525136751Z` | `05:43:31.539606211–05:43:38.713149275Z` |

The `05:37:00Z` failed `MoveEntity` (`FailedPrecondition: insufficient movement remaining`) in `logs/api.log` was a **discarded preliminary click diagnostic**, not an accepted capture. Accepted capture windows contain **zero rejected RPCs**. Accepted browser/runtime error counts remain **zero**.

## Expected development and infrastructure noise

React StrictMode aborted the first `StreamEncounter` effect once per fresh context. Each replacement stream completed and supplied the accepted snapshot/events. This expected abort is separately counted; no forbidden console error, page error, failed canonical request, GLTF error, ErrorBoundary error, zero-standing-clip warning, or WebGL context-loss error occurred.

Chrome's headless SwiftShader `ReadPixels` GPU-stall message is a performance warning, not a context-loss or render error. Redis memory-overcommit/default-config warnings and Envoy deprecation/internal-address/resource-limit warnings are **expected infrastructure startup/deprecation/resource-limit noise**, with **no observed capture impact**.

## Stack

The pinned isolated stack remains running on the host ports recorded in the receipt. Exact cleanup: `bash "$RUN_ROOT/runtime-support/cleanup.sh"`.
