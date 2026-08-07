/**
 * markerStyle — a placement ref's marker color + short label, resolved
 * once instead of near-verbatim duplicated in `Board.tsx` and
 * `creation/CreationBoard.tsx` (graduation audit item). `isBoss` stays a
 * caller-supplied flag rather than something derivable from `ref` alone
 * — only edit mode's compiled `FloorPlan` has a boss-pin concept at all;
 * creation mode's freeform canvas has none (TARGET-YAML.md), so it never
 * passes it. Monster-vs-prop is derived from the ref prefix, the same
 * check both original implementations used. `PALETTE_PROPS` never
 * contains a monster ref (its `SHOWCASE_PROP_KEYS` are all
 * `dnd5e:props:*`), so checking it before falling back to the monster
 * check is safe and matches both originals' real-world behavior exactly.
 */
import {
  BOSS_COLOR,
  MONSTER_COLOR,
  PALETTE_PROPS,
  ROLE_COLOR,
} from './paletteData';

export interface MarkerStyle {
  color: string;
  short: string;
}

/** `doc.start`/`doc.end` marker colors — independently hardcoded to the
 * identical `#5fd1c9`/`#c9a227` values in Board.tsx, CreationBoard.tsx,
 * and the 3D preview (graduation audit item) before this consolidation.
 * Only the color constants are shared here: the three renderers' actual
 * start/end circle+label JSX still differs by design intent (Board.tsx's
 * filled swatch + "ST"/"EN" abbreviation vs CreationBoard.tsx's outline
 * ring + full "START"/"END" label above it) — unifying THAT is a visual
 * decision for Kirk to make, not a mechanical dedup, so it's left alone
 * here; only the genuinely-identical-with-zero-semantic-difference color
 * values are consolidated. */
export const START_COLOR = '#5fd1c9';
export const END_COLOR = '#c9a227';

/** Cell-authored semantic region overlay color (rpg-project#180), by
 * `RegionDoc.archetype` — the SAME vocabulary `RoomDoc.archetype` uses
 * (entrance|chamber|corridor|boss), reusing that alignment rather than
 * inventing a second color scheme. Shared by `Board.tsx`'s read-only edit-
 * mode overlay and `creation/CreationBoard.tsx`'s interactive one, so a
 * region reads as the same archetype in both boards. Falls back to a
 * neutral gray for an archetype string outside this vocabulary (nothing
 * validates `archetype` against an enum client-side — see
 * `setRegionArchetype`'s own doc comment). */
const REGION_ARCHETYPE_COLOR: Record<string, string> = {
  entrance: '#5fd1c9',
  chamber: '#3a9b6a',
  corridor: '#c9a227',
  boss: '#a02020',
};

export function regionArchetypeColor(archetype: string): string {
  return REGION_ARCHETYPE_COLOR[archetype] ?? '#8a7a5a';
}

export function resolveMarkerStyle(
  ref: string,
  opts: { isBoss?: boolean } = {}
): MarkerStyle {
  if (opts.isBoss) return { color: BOSS_COLOR, short: 'BOSS' };

  const prop = PALETTE_PROPS.find((p) => p.ref === ref);
  if (prop) return { color: ROLE_COLOR[prop.role], short: prop.short };

  const isMonster = ref.startsWith('dnd5e:monsters:');
  return {
    color: isMonster ? MONSTER_COLOR : '#888',
    short: isMonster ? 'M' : '?',
  };
}
