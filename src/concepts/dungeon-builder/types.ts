export type PaletteSelection =
  | { kind: 'prop'; ref: string }
  | { kind: 'monster'; ref: string }
  | { kind: 'boss'; ref: string };

export type PlacementSelection =
  | { roomId: string; index: number; boss?: false }
  | { roomId: string; boss: true };
