import { paletteNameForRef } from '@/author/paletteData';
import { castOf } from './cast';
import type { RoomDraftDocument, RoomMonsterPlacement } from './roomDraft';

/** The words a placement is shown by (rpg-project#579): its authored map
 * name, else its kind's name. Two placements that read alike are told apart
 * by document order, "Guard", "Guard (2)". The studio invents no name, and
 * the id stays the value every control stores. */
export function placementDisplayNames(input: {
  declarations: readonly RoomMonsterPlacement[];
  actorNames?: Readonly<Record<string, string>>;
  /** The cast member's name, else the rulebook's name for the ref. */
  castName(ref: string): string;
}): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  const used = new Set<string>();
  for (const placement of input.declarations) {
    const authored =
      input.actorNames && Object.hasOwn(input.actorNames, placement.id)
        ? input.actorNames[placement.id]
        : undefined;
    const base = authored?.trim() || input.castName(placement.ref);
    // An authored "Guard (2)" is a name too: take the first unused suffix,
    // so no two placements ever read alike.
    let name = base;
    for (let n = 2; used.has(name); n += 1) name = `${base} (${n})`;
    used.add(name);
    names.set(placement.id, name);
  }
  return names;
}

/** Every placement's shown name in one document: its map name, else its
 * cast member's name. */
export function documentPlacementNames(
  document: Readonly<RoomDraftDocument>
): ReadonlyMap<string, string> {
  const cast = castOf(document);
  return placementDisplayNames({
    declarations: document.draft.room.monsterDeclarations,
    actorNames: document.draft.scene.actorNames,
    castName: (ref) =>
      cast.find((member) => member.ref === ref)?.name ?? paletteNameForRef(ref),
  });
}
