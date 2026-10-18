/**
 * watchZoneCells — the red floor's cells, read off what the server sent and
 * nothing else (sneaking, rpg-project#619, design R5, R15).
 *
 * `GetViewResponse.watch_zones` lists one zone per watcher this seat holds
 * live, and only while this seat sneaks. The red floor is the UNION of those
 * zones' cells, keyed `coordToKey(positionToCube(cell))` — the same key the
 * scene's floor tiles and `cellKnowledge` use, so the floor looks a tile up
 * with no conversion of its own.
 *
 * # What this module refuses
 *
 * It computes no zone. There is no line of sight, no reach, no cone and no
 * facing here, and nothing downstream may add one (fog of war R5): which
 * cells are red is the server's answer. It also keeps no sneaking flag: an
 * empty list paints nothing, and the server sends none to a seat that is not
 * sneaking, so the list alone decides.
 *
 * Who watches is not drawn: the watcher id is the zone's identity on the
 * wire, not a colour. One tint covers every zone, and a cell two watchers
 * reach is in the set once.
 */

import { coordToKey } from '@/components/hex-grid/hexMath';
import type { Position } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { positionToCube } from './positionBridge';

/** The empty red floor: shared so a view with no zones never changes
 * identity, and nothing memoized on it re-runs. */
export const NO_WATCH_ZONE_CELLS: ReadonlySet<string> = new Set();

/** The union of every zone's cells, by floor-tile key. */
export function watchZoneCells(
  zones: readonly { readonly cells: readonly Pick<Position, 'x' | 'y'>[] }[]
): ReadonlySet<string> {
  if (zones.length === 0) return NO_WATCH_ZONE_CELLS;
  const cells = new Set<string>();
  for (const zone of zones) {
    for (const cell of zone.cells) cells.add(coordToKey(positionToCube(cell)));
  }
  return cells.size === 0 ? NO_WATCH_ZONE_CELLS : cells;
}
