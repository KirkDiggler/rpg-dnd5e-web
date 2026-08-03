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
 * selection) — target-dialect-only, proposed authoring actions from the
 * Structural (wall/door/hole/region) and Markers (start/end) palette
 * categories. See TARGET-YAML.md's "Structural palette category" section.
 * Mutually exclusive with `PaletteSelection`/`PlacementSelection`/connector
 * selection — `DungeonBuilderConcept.tsx`'s `clearOtherSelections` keeps
 * that invariant. `'region'` (rpg-project#180, "cell-authored semantic
 * room regions") is creation-mode-only this round — see
 * `creation/CreationBoard.tsx`'s region-painting handling and
 * `RegionPanel.tsx`; edit mode renders any authored `regions:` read-only,
 * with no tool to create/edit them there yet. */
export type BoardTool = 'wall' | 'door' | 'hole' | 'start' | 'end' | 'region';
