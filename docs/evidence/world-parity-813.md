# Live verification: world parity — builder preview vs the live game

Kirk reported the dungeon builder's 3D preview and the live game route
reading as "flipped/mirrored" for the same authored dungeon: a room
authored in the builder came out with the layout flipped and prop facings
"wrongly-angled" once actually played.

Driven against the real Wave-0 `rpg-api` server (`localhost:8092`) via
`grpcurl` and Playwright, own dev server, never touching the shared
3001/live-view instance. Two authored docs used: a minimal purpose-built
probe (a canvas, one wall corner near `start`, one bookcase at a known
cell/facing, isolated from any other geometry) and the real `dungeon-one`
doc (the reported case).

## Position/layout: verified correct, not a bug

1. **Server ground truth, not client math alone.** `grpcurl GetEncounter`
   against a real started encounter for both docs shows the server assigns
   the EXACT SAME cube coordinate to a given authored `[col, row]` that the
   client's `cubeAtColRow` computes — for `start`, for every wall edge, and
   for the bookcase placement, down to the exact `{x,y,z}`. No client/server
   coordinate mismatch exists.
2. **Screen orientation agrees everywhere it can be checked without a
   camera-angle confound.** The builder's 2D board (a plain top-down
   projection with no camera angle to get wrong) and the live game agree:
   row 0 near the top, higher columns to the right, in both.
   `world-parity-dungeonone-game-spawn.png` (live game, dungeon-one, at
   spawn, unmoved) shows `start` near the top of the room, matching the
   builder's own "row 0 at top" convention — not the "bottom-center" flip
   originally reported. This does not reproduce on current `dev`
   (tip is #720, "game walls from truth — zones are not rooms").

## Facing: the math is correct and shared; the camera preview isn't

Confirmed live, not just by reading source: injected a temporary
`console.log` into `HexGrid.tsx`'s rotation computation and read it back
from the running browser. `facing: 5` (SE) on the wire resolves to the
exact same `-60°` (`facingToRotationY(5)`) the builder computes — same
shared function, same shared `PropModel`, no divergence in the
value or the wiring PR #724 added.

What actually differs:

| | `world-parity-orbit-broad.png` | `world-parity-playmode-edgeon.png` | `world-parity-game-edgeon.png` |
|---|---|---|---|
| Surface | Builder, **Orbit** mode | Builder, **Play** mode | Live game route |
| Camera | Perspective, free-look | Orthographic, byte-cited port of the game's own camera math (`playCameraRig.ts`) | Orthographic, the real tactical camera |
| Same probe bookcase (`facing: SE`) | Broad face, shelf detail visible | Thin, edge-on | Thin, edge-on |

Play mode and the live game agree with each other — confirming that edge-on
rendering IS the correct, intended appearance of `facingToRotationY(SE)`
under the tactical camera's actual viewing angle, not a bug in it. Only
Orbit (the builder's default/general-purpose editing camera) disagrees.

Isolated with a single-variable experiment: matched Orbit's polar angle to
the tactical camera's own cited constant (`playCameraRig.POLAR_ANGLE =
Math.PI / 3.5`) while leaving Orbit's projection as perspective — no
change, still broad-faced. So it's specifically **perspective vs
orthographic projection**, not azimuth or polar angle: for a prop placed
off-center from the camera's orbit target (true of nearly every real
placement), perspective's diverging rays give that specific prop a
genuinely different effective viewing angle than the nominal
camera-to-target one; orthographic (parallel rays) views every object from
the exact same fixed angle regardless of position.

## What shipped

No changes to position math, facing math, or the wire/render pipeline —
all independently verified already correct and already shared between the
builder and the live game. Documented the canonical convention and this
finding in ONE place (`boardGeometry.ts`'s own "THE CANONICAL WORLD" doc
comment) so the next renderer can't rediscover it the hard way, plus a
regression test (`DungeonPreview3D.test.ts`,
`ORBIT_INITIAL_CAMERA_POSITION` describe block) pinning that Orbit's fixed
starting azimuth stays matched to the tactical camera's own
`INITIAL_AZIMUTH` — necessary, though (per the above) not sufficient on its
own, for Orbit to preview a facing-sensitive placement accurately.

Deliberately NOT changed: Orbit's projection type. Switching it to
orthographic would remove the remaining gap for facing preview, but at the
cost of Orbit's general-purpose legibility for everything else it's used
for (wall/region editing, free-look review) — a real product tradeoff, not
a geometry fix, and Kirk's call to make.

## Tests

Full repo `vitest run`: 2323 tests, 140 files, all passing (includes PR
#724's own cherry-picked coverage). `npm run ci-check` clean
(format/lint/typecheck/build/tests all pass).
