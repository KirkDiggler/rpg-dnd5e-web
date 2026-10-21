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

/** One zone as the floor reads it: whose it is, and its cells. */
export interface WatcherZone {
  readonly watcher: string;
  readonly cells: readonly Pick<Position, 'x' | 'y'>[];
}

/**
 * THE RED FLOOR NEVER RUNS AHEAD OF ITS WATCHER (rpg-project#630).
 *
 * A creature's walk arrives as ONE act carrying its whole path, and the view
 * it triggers already holds the zone the creature will cast from where it
 * STOPS. Painted at once, that zone sits at the end of the walk while the
 * token is still crossing to it. The server computes every zone and this
 * client computes none, so there is no per-step zone to show (#635 asks the
 * server for that). The least this can do is not show the future: while a
 * watcher's token is still walking, the floor keeps the zone it last showed
 * for that watcher (or none, if it showed none) and takes the new one when
 * the token arrives.
 *
 * `walking` is the members whose movement the canvas has not finished
 * painting. Returns `incoming` itself when nobody in it is walking.
 */
export function zonesBehindWalkers<Z extends WatcherZone>(
  shown: readonly Z[],
  incoming: readonly Z[],
  walking: ReadonlySet<string>
): readonly Z[] {
  if (walking.size === 0) return incoming;
  const held = (watcher: string) => shown.filter((z) => z.watcher === watcher);
  const out: Z[] = [];
  const seen = new Set<string>();
  for (const zone of incoming) {
    seen.add(zone.watcher);
    if (walking.has(zone.watcher)) {
      if (!out.some((z) => z.watcher === zone.watcher))
        out.push(...held(zone.watcher));
    } else {
      out.push(zone);
    }
  }
  for (const watcher of walking) {
    if (!seen.has(watcher)) out.push(...held(watcher));
  }
  return out;
}
