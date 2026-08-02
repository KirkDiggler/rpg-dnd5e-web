/**
 * emptyCanvasDoc — the starting target-dialect-only YAML for a
 * from-scratch "New Dungeon" canvas, now that creation mode authors onto
 * the SAME
 * cst/DungeonDoc edit mode does (see CONTRACT.md's "unifying New Dungeon
 * onto the shared CST" section for the full history — including the
 * synthetic-`archetype: canvas`-room bridge this file used briefly and
 * the decision that rejected it).
 *
 * `rooms: []` is genuinely empty here — a from-scratch canvas has
 * nothing "carved" yet, and there is no fictional room standing in for
 * one. What makes that possible: `place:` is TOP-LEVEL (`DungeonDoc.place`,
 * absolute `[col,row]`), not nested under a room — the decided shape for
 * the target dialect (room-scoped `place:` is v1's own heritage; the
 * target dialect makes rooms organizational, not existential — see
 * TARGET-YAML.md's "top-level placement" section for the full rationale
 * dungeonYaml.ts's mutators implement). `boss:` stays room-scoped even in
 * the target dialect (dungeonspec's `validateBossCardinality` needs an owning
 * `archetype: boss` room, and a from-scratch canvas has none) — canvas
 * mode's own Boss tool honestly rejects rather than pretending, see
 * `CreationBoard.tsx`.
 *
 * The generated YAML below is `version: 1`, not `version: 2` — per Kirk's
 * settled model (rpg-project#175, TARGET-YAML.md's "Settled early model"
 * section): "the current concept's legacy `version: 2` marker is only a
 * local UI signal and is not a target-contract requirement or a server
 * version." Additive target-dialect capabilities stay on `version: 1`; a
 * real version bump is reserved for an incompatible room/topology change,
 * which this from-scratch canvas is not.
 */
export const DEFAULT_CANVAS = { width: 20, height: 30 };

export function emptyCanvasYaml(width: number, height: number): string {
  return `version: 1
key: untitled-creation
name: "Untitled Dungeon"
height: 1 # unused placeholder — no compiled room chain exists yet; canvas.height below is what the board actually reads
canvas:
  width: ${width}
  height: ${height}
rooms: []
connectors: []
walls: []
holes: []
start: null
end: null
place: []
`;
}
