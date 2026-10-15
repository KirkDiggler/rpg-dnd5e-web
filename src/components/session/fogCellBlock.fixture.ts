/**
 * The castle's cell block as one seat learns it (fog of war walkthrough,
 * rpg-project ideas/fog-of-war/README.md "Walk one thing through"): a corridor
 * of four hexes with an open archway on its east side into a prison cell of six
 * hexes. Axial `{x: q, y: r}`, the wire's Position.
 *
 * After the rogue's first sight pass the atlas holds the corridor and the THREE
 * cell hexes the archway frames; the other three are absent.
 */
export const CORRIDOR = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 2, y: 0 },
  { x: 3, y: 0 },
] as const;

/** The prison cell's six hexes, east of the archway at (3,0)→(4,0). */
export const PRISON_CELL = [
  { x: 4, y: 0 },
  { x: 5, y: 0 },
  { x: 4, y: -1 },
  { x: 5, y: -1 },
  { x: 3, y: 1 },
  { x: 4, y: 1 },
] as const;

/** The three prison hexes the archway frames from the corridor. */
export const FRAMED = PRISON_CELL.slice(0, 3);
/** The three behind the jamb: never seen, never in the atlas. */
export const BEHIND_JAMB = PRISON_CELL.slice(3);

/** The rogue's atlas after the first pass: corridor + the framed three. */
export const ATLAS_CELLS = [...CORRIDOR, ...FRAMED];

/** Standing in the corridor looking through the archway: all seven seen. */
export const VISIBLE_AT_ARCHWAY = [...ATLAS_CELLS];

/** Walked back west out of line of the archway: the corridor only. */
export const VISIBLE_AFTER_LEAVING = [...CORRIDOR];
