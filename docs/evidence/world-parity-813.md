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

## Orbit projection toggle — let Kirk judge the tradeoff by feel

Rather than this file silently picking a side of "editing legibility vs
preview fidelity," Orbit mode now has a projection toggle (perspective ↔
orthographic, default unchanged = perspective, persisted per-browser in
`localStorage`). The exact same probe doc, same Orbit camera, same
bookcase — toggled live:

| `world-parity-toggle-perspective.png` | `world-parity-toggle-orthographic.png` |
|---|---|
| Perspective (default) — broad face, shelf detail visible | Orthographic — thin, edge-on, matching Play mode and the live game exactly |

Wired through the existing camera rig: `<Canvas orthographic={...} key={...}>`
remounts cleanly on toggle (same pattern `HexGrid.tsx`'s own ortho/persp
dial already uses — R3F doesn't swap camera type on a prop change alone).
The read/write localStorage plumbing is pulled into its own pure module
(`orbitProjectionPreference.ts`) with direct unit tests, rather than only
ever exercised through a full component mount.

## Investigated but not reproduced: the scattered/tumbled bookcases

Kirk's own screenshots (from the combined #723+#724 preview tree on
:3001) show something the probe-bookcase edge-on finding above doesn't
fully explain on its own: in the builder's 2D board, `dungeon-one`'s five
bookcases run cleanly along the room's east wall (col 14); in the live
game, what read as bookcase-shaped objects appeared scattered near the
room's south connector-wall area instead, at inconsistent angles — not
just uniformly edge-on.

Ruled out: **PR #723 cannot be the cause.** Every file it touches is under
`src/author/` (the builder tool itself — `dungeonYaml.ts`,
`canvasFloor.ts`, `CreationBoard.tsx`, `DungeonPreview3D.tsx` and their
tests); nothing under `src/components/hex-grid/`, `src/components/game/`,
or `src/hooks/useEncounterState.ts`. It cannot touch the live game route's
rendering at all, for any doc — confirmed by direct diff inspection
(`gh pr diff 723`), not assumed from its description. Whatever Kirk's
combined-tree screenshot shows, the game-route behavior in it is #724's
alone; a plain #724 cherry-pick (what this branch carries) should
reproduce it exactly.

Attempted to reproduce directly against the same live encounter
(`dungeon-one`, `b9237b88-...`) three ways: browser click-to-move (fog of
war only reveals what's actually explored, and pixel-coordinate clicking
proved unreliable to aim precisely at this scale), the dev-only
`PlaytestHarness` (`?encounterId=`) Q/R/S move form (blocked — its
`myPosition` resolution keys off a synthesized `char-<playerId>` entity id
that doesn't match the real `char_<uuid>` id the server actually uses, so
`canMove` never turns true), and direct `grpcurl MoveEntity` calls with
hand-computed contiguous hex paths (silently no-ops on any path that
crosses the room's real wall geometry — a one-hex sanity move worked, but
every longer path toward the other four bookcases' cells got rejected
without error). The one bookcase I could reliably reveal and check
(`canvas-prop-4`, authored at `[14, 0]`) matched its authored position and
facing exactly, both server-side and in the client render, from every
vantage point tried — including one at a normal play distance (not
close-up) where it read clearly broad-faced, not edge-on, underscoring
that viewing distance/framing matters as much as azimuth here.

**Not closed out.** The single-bookcase verification plus the ruled-out
#723 involvement are solid; the specific "scattered to the wrong wall"
pattern from Kirk's screenshot is not independently reproduced in this
unit's own testing. Needs either Kirk's exact repro steps/encounter, or a
more reliable in-repo way to move a test character past real wall
geometry, to pin down further.

## What shipped

No changes to position math, facing math, or the wire/render pipeline —
all independently verified already correct and already shared between the
builder and the live game (see the one-bookcase verification above; the
scattered-pattern reproduction remains open, see previous section).
Documented the canonical convention and this finding in ONE place
(`boardGeometry.ts`'s own "THE CANONICAL WORLD" doc comment) so the next
renderer can't rediscover it the hard way, plus a regression test
(`DungeonPreview3D.test.ts`, `ORBIT_INITIAL_CAMERA_POSITION` describe
block) pinning that Orbit's fixed starting azimuth stays matched to the
tactical camera's own `INITIAL_AZIMUTH`, and the new Orbit projection
toggle above so the editing-legibility/preview-fidelity tradeoff is Kirk's
to make by feel, not this file's to guess at.

One more open item, explicitly flagged rather than asserted: Kirk's own
left/right screen-orientation observation (separate from the scattering
above) most likely comes from the tactical camera's azimuth/rotation
differing from whatever angle he happened to view the builder from — this
unit measured azimuth as identical (45°) across Orbit, Play, and the live
game (see the "Position/layout" section above), so a further, specific
left/right flip would have to come from somewhere this investigation
didn't independently verify (e.g. Q/E rotation applied before the
screenshot). Stated as likely, not proven.

## Tests

Full repo `vitest run`: 2331 tests, 141 files, all passing (includes PR
#724's own cherry-picked coverage plus this unit's new tests). `npm run
ci-check` clean (format/lint/typecheck/build/tests all pass).
