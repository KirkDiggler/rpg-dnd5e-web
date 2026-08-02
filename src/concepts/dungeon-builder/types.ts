export type PaletteSelection =
  | { kind: 'prop'; ref: string }
  | { kind: 'monster'; ref: string }
  | { kind: 'boss'; ref: string };

/** `roomId: null` on the non-boss variant means a TOP-LEVEL placement
 * (`doc.place[index]`, absolute [col,row]) rather than a room-scoped one
 * (`doc.rooms.find(r => r.id === roomId).place[index]`, room-local
 * [col,row]) — see dungeonYaml.ts's `DungeonDoc.place` doc comment and
 * TARGET-YAML.md's "top-level placement" section. A boss stays
 * room-scoped always (dungeonspec's `validateBossCardinality` needs an
 * owning room even in the target dialect), so `roomId` is non-nullable
 * on that variant. */
export type PlacementSelection =
  | { roomId: string | null; index: number; boss?: false }
  | { roomId: string; boss: true };

/** A board TOOL (as opposed to `PaletteSelection`'s draggable-item
 * selection) — v2-only, proposed authoring actions from the Structural
 * (wall/door/hole) and Markers (start/end) palette categories. See
 * TARGET-YAML.md's "Structural palette category" section. Mutually
 * exclusive with `PaletteSelection`/`PlacementSelection`/connector
 * selection — `DungeonBuilderConcept.tsx`'s `clearOtherSelections` keeps
 * that invariant. */
export type BoardTool = 'wall' | 'door' | 'hole' | 'start' | 'end';
