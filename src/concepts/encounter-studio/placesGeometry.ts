/**
 * WHERE A JOIN IS DRAWN (rpg-project#972). Positions are presentation, the
 * studio's own: the engine says which places join and how; the draft says
 * where the regions, doors and props stand. Nothing here decides whether a
 * join exists.
 */
import {
  regionCells,
  type RoomDraft,
  type RoomHexCell,
} from '../world-building/roomDraft';
import type { WorldPoint } from '../world-building/types';
import { layoutCellCenter } from './layoutGeometry';
import type { PlaceJoin } from './placesView';

export type JoinAnchor =
  | { kind: 'point'; at: WorldPoint }
  | { kind: 'arrow'; from: WorldPoint[]; to: WorldPoint };

const cellKey = (cell: RoomHexCell): string => `${cell.q},${cell.r}`;

const NEIGHBOURS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
];

const mean = (points: readonly WorldPoint[]): WorldPoint | null =>
  points.length === 0
    ? null
    : {
        x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
        z: points.reduce((sum, p) => sum + p.z, 0) / points.length,
      };

/** The centre of a region's cells; null for an unpainted or unknown one. */
export function regionCentre(
  draft: Pick<RoomDraft, 'room'>,
  regionId: string
): WorldPoint | null {
  const region = draft.room.regions.find((entry) => entry.id === regionId);
  return region ? mean(regionCells(region).map(layoutCellCenter)) : null;
}

/** A door's point on its wall, as the Layout draws its marker. */
export function doorPoint(
  draft: Pick<RoomDraft, 'room'>,
  doorId: string
): WorldPoint | null {
  for (const wall of draft.room.walls ?? [])
    for (const opening of wall.openings) {
      if (opening.door?.id !== doorId) continue;
      const { start, end } = wall.line;
      const length = Math.hypot(end.x - start.x, end.z - start.z);
      if (length === 0) return { ...start };
      const t = opening.position / length;
      return {
        x: start.x + (end.x - start.x) * t,
        z: start.z + (end.z - start.z) * t,
      };
    }
  return null;
}

/** The middle of where two regions' cells touch: the mean of the midpoints
 * of every touching pair. */
export function sharedBoundaryMidpoint(
  draft: Pick<RoomDraft, 'room'>,
  a: string,
  b: string
): WorldPoint | null {
  const ra = draft.room.regions.find((region) => region.id === a);
  const rb = draft.room.regions.find((region) => region.id === b);
  if (!ra || !rb) return null;
  const inB = new Set(regionCells(rb).map(cellKey));
  const mids: WorldPoint[] = [];
  for (const cell of regionCells(ra))
    for (const [dq, dr] of NEIGHBOURS) {
      const next: RoomHexCell = { q: cell.q + dq, r: cell.r + dr };
      if (!inB.has(cellKey(next))) continue;
      const p = layoutCellCenter(cell);
      const n = layoutCellCenter(next);
      mids.push({ x: (p.x + n.x) / 2, z: (p.z + n.z) / 2 });
    }
  return mean(mids);
}

/** Where to draw a join: a door join at its door, an open join on the
 * shared boundary, a passage as an arrow from its carrier prop (or its
 * `from` regions) to its `to` region. Any other join at the midpoint of its
 * regions. Null when the draft cannot place it. */
export function joinAnchor(
  join: PlaceJoin,
  draft: Pick<RoomDraft, 'room' | 'scene'>
): JoinAnchor | null {
  if (join.door) {
    const at = doorPoint(draft, join.door);
    if (at) return { kind: 'point', at };
  }
  if (join.to) {
    const to = regionCentre(draft, join.to);
    if (!to) return null;
    const prop = join.carriers.find((c) => c.kind === 'prop');
    const item = prop
      ? draft.scene.items.find((entry) => entry.id === prop.id)
      : undefined;
    const from = item
      ? [{ x: item.transform.x, z: item.transform.z }]
      : join.from
          .map((id) => regionCentre(draft, id))
          .filter((p): p is WorldPoint => p !== null);
    return from.length > 0 ? { kind: 'arrow', from, to } : null;
  }
  if (join.regions.length >= 2) {
    const at = sharedBoundaryMidpoint(
      draft,
      join.regions[0]!,
      join.regions[1]!
    );
    if (at) return { kind: 'point', at };
  }
  const at = mean(
    join.regions
      .map((id) => regionCentre(draft, id))
      .filter((p): p is WorldPoint => p !== null)
  );
  return at ? { kind: 'point', at } : null;
}
