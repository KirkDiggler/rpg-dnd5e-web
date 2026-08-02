/**
 * emptyCanvasDoc — the starting v2-only YAML for a from-scratch "New
 * Dungeon" canvas, now that creation mode authors onto the SAME
 * cst/DungeonDoc edit mode does (see CONTRACT.md's "unifying New Dungeon
 * onto the shared CST" section for the full reasoning; this file is that
 * plan's synthetic-room bridge, built).
 *
 * `rooms:` can't be genuinely empty here even though this is a freeform
 * canvas with nothing "carved" yet — every placement mutator in
 * dungeonYaml.ts (placeItem, movePlacement, moveBoss, setPlacementFacing,
 * setPlacementMount, ...) requires an owning `roomId`, verified by
 * reading dungeonYaml.ts directly, not assumed. A single synthetic room
 * (`id: "canvas"`) bridges that gap: it owns every `place:`/`boss:` entry
 * until/unless real rooms get carved out of the canvas by drawn walls —
 * a v2-only construct that never reaches `PutDungeon` (this whole
 * document has 0 real connectors and typically fewer than dungeonspec's
 * `minRooms=2`, so `stripToV1Subset` would leave nothing compilable
 * anyway — creation mode makes no server calls today regardless, see
 * CreationConcept.tsx's own doc comment).
 *
 * `at` coordinates on the synthetic room's placements are absolute canvas
 * coordinates, not room-local — the room has no real `startColumn` (no
 * compiled FloorPlan exists for a canvas draft), so `Inspector.tsx`'s
 * `(fpRoom?.startColumn ?? 0) + at[0]` naturally resolves to `at[0]`
 * unchanged when `floorPlan` is absent, with no special-casing needed.
 */
export const CANVAS_ROOM_ID = 'canvas';

export const DEFAULT_CANVAS = { width: 20, height: 30 };

export function emptyCanvasYaml(width: number, height: number): string {
  return `version: 2
key: untitled-creation
name: "Untitled Dungeon"
height: 1 # unused placeholder — no compiled room chain exists yet; canvas.height below is what the board actually reads
canvas:
  width: ${width}
  height: ${height}
rooms:
  - id: ${CANVAS_ROOM_ID}
    archetype: canvas
    width: ${width}
    place: []
    boss: null
connectors: []
walls: []
holes: []
start: null
end: null
`;
}
