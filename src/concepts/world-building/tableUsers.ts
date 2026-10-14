import type { RoomGameplayData } from './roomDraft';
import type { SiteScope } from './siteScope';

/** Who names one table: the factions whose `table` is it, and the placements
 * whose binding's `table` is it, in document order. Read for the summary
 * only; the engine resolves the names. */
export function tableUsers(
  scope: SiteScope,
  room: RoomGameplayData | undefined,
  id: string
): { factions: string[]; placements: string[] } {
  return {
    factions: (scope.factions ?? [])
      .filter((faction) => faction.table === id)
      .map((faction) => faction.id),
    placements: (room?.monsterDeclarations ?? [])
      .filter((monster) => room?.monsterBindings?.[monster.id]?.table === id)
      .map((monster) => monster.id),
  };
}
