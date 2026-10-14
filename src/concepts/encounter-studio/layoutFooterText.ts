import type { RoomDraft } from '../world-building/roomDraft';

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/** "{areas} areas · {creatures} creatures · {hexes} hexes · {doors} doors".
 * Areas counts regions, not occupants: a fill is never membership (V9). */
export function layoutFooterText(draft: Readonly<RoomDraft>): string {
  const doors = (draft.room.walls ?? []).reduce(
    (count, wall) =>
      count + wall.openings.filter((opening) => opening.door).length,
    0
  );
  return [
    plural(draft.scene.authoringRegions?.length ?? 0, 'area', 'areas'),
    plural(draft.room.monsterDeclarations.length, 'creature', 'creatures'),
    plural(draft.room.walkableHexes.length, 'hex', 'hexes'),
    plural(doors, 'door', 'doors'),
  ].join(' · ');
}
