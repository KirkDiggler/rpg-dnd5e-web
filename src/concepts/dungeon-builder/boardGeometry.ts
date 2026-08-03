/**
 * boardGeometry — pure lookups over a compiled `FloorPlan` + the parallel
 * `DungeonDoc`, shared by `Board.tsx` and its drag logic. Kept separate
 * from the component so it's unit-testable without React.
 */
import { facingDirection } from '@/components/hex-grid/authorGridHelpers';
import type {
  FloorPlan,
  FloorPlanConnector,
  FloorPlanRoom,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { resolvePlacement, type DungeonDoc, type WallDoc } from './dungeonYaml';
import {
  cellCenter,
  cubeAtColRow,
  hexColumn,
  hexRow,
  type CellPos,
} from './hexLayout';
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
      // Resolved, not raw `p.blocksMovement` — a `blocks_movement: true`
      // ref-level default (`defaults:`, target dialect, proposed) must trip
      // this warning exactly like an explicit one does. Reading the raw
      // field here would silently miss an inherited block, reintroducing
      // the exact gap CONTRACT.md's "entrance-blocked" UX learning exists
      // to catch, just one layer removed (via a default instead of a
      // direct per-instance flag).
      if (
        absCol === column &&
        p.at[1] === row &&
        resolvePlacement(doc, p).blocksMovement
      ) {
        return true;
      }
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

/** The neighbor cell (col, row) in a given `facing` direction (0-5,
 * HEX_FACING_LABELS order) from an absolute cell — the same
 * `facingDirection` + cube-neighbor math `wallMountRotationY`
 * (`preview3d/DungeonPreview3D.tsx`) already uses for its rotation, here
 * exposed as a pure coordinate lookup so both the 3D renderer and this
 * file's own edge logic below share one derivation instead of two. */
export function neighborCell(
  absCol: number,
  row: number,
  facing: number
): { col: number; row: number } {
  const here = cubeAtColRow(absCol, row);
  const dir = facingDirection(facing);
  const there = { x: here.x + dir.x, y: here.y + dir.y, z: here.z + dir.z };
  return { col: hexColumn(there), row: hexRow(there) };
}

/** The `facing` indices (0-5) where `walls` actually has an edge between
 * `(absCol, row)` and that neighbor — checked both authoring orders (a
 * wall can be recorded `{from: here, to: there}` or `{from: there, to:
 * here}`; `dungeonYaml.ts`'s own `wallIndexAtEdge` only ever matches one
 * fixed order, which is fine for its own toggle-by-the-same-caller use
 * but wrong for this lookup, which has to recognize a wall regardless of
 * which side authored it). Kirk's 2026-08-02 finding this exists to fix:
 * "I can only line up 1 direction — flush with a wall on one side but
 * not the other" — a mount's `facing` stepper cycling ALL 6 hex
 * directions blindly, most of which have no real wall to be flush
 * against, made the one direction that DOES look right hard to find by
 * feel. Restricting the stepper to exactly this list is the fix; see
 * `stepWallFacing` below. */
export function wallBearingFacings(
  walls: readonly WallDoc[],
  absCol: number,
  row: number
): number[] {
  const result: number[] = [];
  for (let facing = 0; facing < 6; facing++) {
    const { col: nCol, row: nRow } = neighborCell(absCol, row, facing);
    const hasWall = walls.some(
      (w) =>
        (w.from[0] === absCol &&
          w.from[1] === row &&
          w.to[0] === nCol &&
          w.to[1] === nRow) ||
        (w.to[0] === absCol &&
          w.to[1] === row &&
          w.from[0] === nCol &&
          w.from[1] === nRow)
    );
    if (hasWall) result.push(facing);
  }
  return result;
}

/** Step a `mount: wall` placement's `facing` to the NEXT (delta +1) or
 * PREVIOUS (delta -1) wall-bearing edge in `bearing` (from
 * `wallBearingFacings`), cyclically — the edge-selection stepping
 * interaction itself. Falls back to plain 6-direction stepping when
 * `bearing` is empty (a wall-mounted prop with no adjacent wall at all
 * — an incomplete authoring state, not one this control should go fully
 * inert over) or when the current facing isn't one of the bearing edges
 * yet (snaps forward to the first real one rather than guessing a
 * direction to step from). */
export function stepWallFacing(
  current: number | null,
  bearing: readonly number[],
  delta: 1 | -1
): number {
  if (bearing.length === 0) {
    return ((((current ?? 0) + delta) % 6) + 6) % 6;
  }
  const idx = bearing.indexOf(current ?? -1);
  if (idx === -1) return bearing[0]!;
  const next =
    (((idx + delta) % bearing.length) + bearing.length) % bearing.length;
  return bearing[next]!;
}
