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
/** The floor/void envelope. The runtime implies it — a crossing from floor
 * into void is one nobody can make, and authoring a wall there is refused
 * ("the envelope is implied, never written") — so it is drawn DIMMER than an
 * authored wall: it is a fact about the floor's edge, not a thing in the file.
 * Drawn at all because a room that is sealed but shows no boundary does not
 * read as a room (rpg-dnd5e-web#902, Kirk: "i click room and drag across but
 * am left without a room"). */
export const ENVELOPE_STROKE = 'rgba(244, 241, 234, 0.34)';
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
