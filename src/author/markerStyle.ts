/** Region swatches — index-stable so a region keeps its colour while the
 * author works. Intensity darkens the fill so the dark tomb reads dark
 * on the board as it will in the game. */
const REGION_SWATCHES = [
  '#5b8def',
  '#e0a458',
  '#7bc67e',
  '#c77dff',
  '#ef6f6c',
  '#4ecdc4',
  '#f7d774',
  '#9a8c98',
];

export function regionColor(index: number): string {
  return REGION_SWATCHES[index % REGION_SWATCHES.length];
}

/** The region fill at a lighting intensity: 0 = near black, 1 = the
 * swatch. Mixes toward #101318 linearly. */
export function litColor(hex: string, intensity: number): string {
  const t = Math.max(0, Math.min(1, intensity));
  const mix = (a: number, b: number) => Math.round(a * (1 - t) + b * t);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [dr, dg, db] = [0x10, 0x13, 0x18];
  return `rgb(${mix(dr, r)}, ${mix(dg, g)}, ${mix(db, b)})`;
}

export const VOID_FILL = '#0b0d11';
export const VOID_STROKE = '#22262e';
export const WALL_STROKE = '#f4f1ea';
/** The floor's outer edge. NOT a wall — a wall is something the author put
 * there on purpose (Kirk: "walls are intentional"), and an unwalled boundary
 * is a real authored choice: a region is allowed a cliff edge. Drawn dimmer
 * AND dashed so it can never be mistaken for a wall; it says "the floor stops
 * here", which is the only thing it knows.
 *
 * Drawn at all because a region with no boundary at all reads as an unfinished
 * patch of floor rather than a place (rpg-dnd5e-web#902). */
export const ENVELOPE_STROKE = 'rgba(244, 241, 234, 0.34)';
/** The dash that keeps the floor's edge from reading as a wall. */
export const ENVELOPE_DASH = '2 4';
export const DOOR_STROKE = '#d97706';
export const DOOR_LOCKED_STROKE = '#dc2626';
export const START_COLOR = '#22c55e';
export const ERROR_STROKE = '#ff3b30';
export const HOVER_STROKE = '#ffffff';
export const MONSTER_COLOR = '#a02020';
export const BOSS_COLOR = '#7a1414';
export const PROP_COLOR = '#b8922a';
/** A region the builder currently derives as concealed (rpg-dnd5e-web#893)
 * — "reachable only through a concealed door". Distinct from every other
 * stroke on the board (door orange, error red, wall cream, hover white)
 * so a newly-hidden room reads as its own kind of fact, not an error. */
export const CONCEALED_STROKE = '#a855f7';

/** Scenery — floor no room owns (rpg-project#360 §2.1). It reads as FLOOR
 * (a wall stands on it, a prop sits on it) and never as a room, so it gets
 * a stone grey of its own rather than a ninth region swatch, hatched so
 * "nobody stands here" is visible at a glance without a legend. Distinct
 * from void's near-black, which is the absence of floor entirely. */
export const SCENERY_FILL = '#343a44';
export const SCENERY_HATCH = 'rgba(226, 232, 240, 0.30)';
export const SCENERY_STROKE = 'rgba(226, 232, 240, 0.45)';
/** The `<pattern>` the board defines once and every scenery cell fills
 * with. Exported so the board and its tests name the same thing. */
export const SCENERY_HATCH_ID = 'dg-scenery-hatch';
