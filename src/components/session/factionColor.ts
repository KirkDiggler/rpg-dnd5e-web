/**
 * factionColor — one colour per declared faction on the roster, assigned
 * in order of first appearance, so every surface that colours a member by
 * side (the map's entities, the sides legend) agrees (rpg-project#375 §7:
 * "roster coloured by faction").
 *
 * # Factions are content, so the palette is positional
 *
 * `PublicMemberInfo.faction` is an open string the author declared per
 * dungeon (its own doc comment: "a client groups or colours by the word
 * without knowing what a goblin is"). Nothing here knows a faction's name;
 * the first declared faction the roster lists gets the first swatch, the
 * second the second, which is stable for a session because the roster is
 * loaded once and only ever grows (JOINED, ARRIVED append).
 *
 * # The two reserved sides keep the colours they always had
 *
 * `party` is every player and `monsters` is every unauthored monster (R4),
 * and both have been blue and red since before factions existed; a
 * dungeon that declares no faction must look exactly as it did. So those
 * two, and an empty faction (a world NPC, in no faction), answer no colour
 * here and the entity keeps its kind's own.
 */
import type { PublicMemberInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

/** The reserved sides, mirrored from `dungeonYaml.ts`'s `PARTY` and
 * `MONSTERS` — spelled here rather than imported so the game screen does
 * not depend on the builder. */
export const PARTY_SIDE = 'party';
export const MONSTERS_SIDE = 'monsters';

/** Distinct from the player blue and the monster red the map already
 * uses, and from the gold a world NPC wears, so a declared side never
 * reads as one of the three kinds. */
export const FACTION_PALETTE: readonly string[] = [
  '#38b2ac', // teal
  '#d53f8c', // pink
  '#ecc94b', // yellow
  '#9f7aea', // purple
  '#48bb78', // green
  '#ed8936', // orange
];

/** The colours the two reserved sides show in a legend — the map's own
 * player blue and monster red (`HexEntity`'s COLORS), repeated here so the
 * legend and the entity agree without the legend importing three.js. */
export const SIDE_COLORS: Readonly<Record<string, string>> = {
  [PARTY_SIDE]: '#3182ce',
  [MONSTERS_SIDE]: '#e53e3e',
};

/** Whether a faction id is one an author declared — not a reserved side,
 * not empty. */
export function isDeclaredFaction(faction: string): boolean {
  return faction !== '' && faction !== PARTY_SIDE && faction !== MONSTERS_SIDE;
}

/** A member's side, or `null` for none. EMPTY AND MISSING ALIKE: the wire
 * says empty means "in no faction" (a world NPC), and a roster row from a
 * server older than the field — or a partial fixture — has no field at
 * all; both are the same absence, and neither may crash a legend. */
function sideOf(member: PublicMemberInfo): string | null {
  return member.faction ? member.faction : null;
}

/** Every side on the roster, once each, in roster order — the reserved
 * ones included, a member with no side excluded. */
export function sidesOnRoster(
  roster: ReadonlyMap<string, PublicMemberInfo>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const member of roster.values()) {
    const side = sideOf(member);
    if (side === null || seen.has(side)) continue;
    seen.add(side);
    out.push(side);
  }
  return out;
}

/** Declared faction -> its swatch, by first appearance on the roster. The
 * reserved sides are absent: they keep their kind's colour. A seventh
 * declared faction wraps around the palette, which is honest about there
 * being six swatches rather than inventing a seventh. */
export function factionColors(
  roster: ReadonlyMap<string, PublicMemberInfo>
): ReadonlyMap<string, string> {
  const colors = new Map<string, string>();
  for (const side of sidesOnRoster(roster)) {
    if (!isDeclaredFaction(side)) continue;
    colors.set(side, FACTION_PALETTE[colors.size % FACTION_PALETTE.length]);
  }
  return colors;
}

/** How many members the roster lists on each side, in roster order. */
export function sideCounts(
  roster: ReadonlyMap<string, PublicMemberInfo>
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const member of roster.values()) {
    const side = sideOf(member);
    if (side === null) continue;
    counts.set(side, (counts.get(side) ?? 0) + 1);
  }
  return counts;
}
