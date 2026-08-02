export type PaletteSelection =
  | { kind: 'prop'; ref: string }
  | { kind: 'monster'; ref: string }
  | { kind: 'boss'; ref: string };

export type PlacementSelection =
  | { roomId: string; index: number; boss?: false }
  | { roomId: string; boss: true };

/** A board TOOL (as opposed to `PaletteSelection`'s draggable-item
 * selection) — v2-only, proposed authoring actions from the Structural
 * (wall/door/hole) and Markers (start/end) palette categories. See
 * TARGET-YAML.md's "Structural palette category" section. Mutually
 * exclusive with `PaletteSelection`/`PlacementSelection`/connector
 * selection — `DungeonBuilderConcept.tsx`'s `clearOtherSelections` keeps
 * that invariant. */
export type BoardTool = 'wall' | 'door' | 'hole' | 'start' | 'end';
