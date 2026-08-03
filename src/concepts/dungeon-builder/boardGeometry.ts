/**
 * boardGeometry — pure lookups over a compiled `FloorPlan` + the parallel
 * `DungeonDoc`, shared by `Board.tsx` and its drag logic. Kept separate
 * from the component so it's unit-testable without React.
 */
import type {
  FloorPlan,
  FloorPlanConnector,
  FloorPlanRoom,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { DungeonDoc } from './dungeonYaml';
import { cellCenter, type CellPos } from './hexLayout';
import type { PlacementSelection } from './types';

/** Whether `current` (a board's live `selectedPlacement` state) IS `sel`
 * (one specific marker's own identity) — the `roomId`/`index`/`boss`
 * equality both `Board.tsx`'s 2D marker loops and
 * `DungeonPreview3D.tsx`'s 3D ones need identically (Kirk's 2026-08-02
 * "3D editing" arc, part 2 — click-select now exists in both views, so
 * this check now has two real callers, not one; consolidated here rather
 * than staying duplicated inline three times in `Board.tsx` alone).
 * `roomId: null` is a real, distinct identity (a top-level placement),
 * never a wildcard that matches anything — and a boss selection only
 * ever matches another boss selection in the same room, never a
 * non-boss placement at the same index. */
export function isSameSelection(
  current: PlacementSelection | null | undefined,
  sel: PlacementSelection
): boolean {
  if (!current) return false;
  if (current.boss || sel.boss) {
    return !!current.boss && !!sel.boss && current.roomId === sel.roomId;
  }
  return current.roomId === sel.roomId && current.index === sel.index;
}

export function roomAtColumn(
  floorPlan: FloorPlan,
  absCol: number
): FloorPlanRoom | null {
  return (
    floorPlan.rooms.find(
      (r) => absCol >= r.startColumn && absCol < r.startColumn + r.width
    ) ?? null
  );
}

export function connectorAtColumn(
  floorPlan: FloorPlan,
  absCol: number
): FloorPlanConnector | null {
  return floorPlan.connectors.find((c) => c.column === absCol) ?? null;
}

export function totalColumns(floorPlan: FloorPlan): number {
  const roomEnds = floorPlan.rooms.map((r) => r.startColumn + r.width);
  const connectorEnds = floorPlan.connectors.map((c) => c.column + 1);
  return Math.max(0, ...roomEnds, ...connectorEnds);
}

export interface OccupiedCheck {
  /** `null` means the excluded placement is TOP-LEVEL (`doc.place`), not
   * room-scoped — see `DungeonDoc.place`'s own doc comment. */
  roomId: string | null;
  index: number | 'boss';
}

/** Whether `(absCol, row)` already holds a placement or the boss pin,
 * optionally excluding one specific placement (the one being dragged).
 * Checks room-scoped placements (room-local `at` + the room's compiled
 * `startColumn`) AND top-level placements (`doc.place`, already absolute
 * — no room offset to add). */
export function isCellOccupied(
  floorPlan: FloorPlan,
  doc: DungeonDoc,
  absCol: number,
  row: number,
  exclude?: OccupiedCheck
): boolean {
  for (const room of doc.rooms) {
    const fpRoom = floorPlan.rooms.find((r) => r.id === room.id);
    if (!fpRoom) continue;
    if (room.boss) {
      const bc = fpRoom.startColumn + room.boss.at[0];
      const br = room.boss.at[1];
      if (bc === absCol && br === row) {
        if (
          !(exclude && exclude.roomId === room.id && exclude.index === 'boss')
        ) {
          return true;
        }
      }
    }
    for (let i = 0; i < room.place.length; i++) {
      if (exclude && exclude.roomId === room.id && exclude.index === i)
        continue;
      const p = room.place[i];
      const pc = fpRoom.startColumn + p.at[0];
      const pr = p.at[1];
      if (pc === absCol && pr === row) return true;
    }
  }
  for (let i = 0; i < doc.place.length; i++) {
    if (exclude && exclude.roomId === null && exclude.index === i) continue;
    const p = doc.place[i];
    if (p.at[0] === absCol && p.at[1] === row) return true;
  }
  return false;
}

export function isEntranceBlocked(
  floorPlan: FloorPlan,
  doc: DungeonDoc
): boolean {
  if (!floorPlan.entrance) return false;
  const { column, row } = floorPlan.entrance;
  for (const room of doc.rooms) {
    const fpRoom = floorPlan.rooms.find((r) => r.id === room.id);
    if (!fpRoom) continue;
    for (const p of room.place) {
      const absCol = fpRoom.startColumn + p.at[0];
      if (absCol === column && p.at[1] === row && p.blocksMovement) return true;
    }
  }
  return false;
}

/** Nearest board cell to a board-space point — used to resolve a drag's
 * drop target. Brute-force over every cell in the floor plan's bounding
 * rectangle; the board is small enough (well under a thousand cells for
 * any dungeon this concept has seen) that this is simpler and cheaper to
 * verify than a closed-form inverse of `cellCenter`. */
export function nearestCell(
  point: CellPos,
  floorPlan: FloorPlan
): { absCol: number; row: number; room: FloorPlanRoom | null } {
  let best = { absCol: 0, row: 0, room: null as FloorPlanRoom | null };
  let bestDist = Infinity;
  const cols = totalColumns(floorPlan);
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < floorPlan.height; row++) {
      const c = cellCenter(col, row);
      const d = (c.x - point.x) ** 2 + (c.y - point.y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = { absCol: col, row, room: roomAtColumn(floorPlan, col) };
      }
    }
  }
  return best;
}
