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
