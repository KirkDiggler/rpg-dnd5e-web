/**
 * boardGeometry — pure lookups over a compiled `FloorPlan` + the parallel
 * `DungeonDoc`, shared by `Board.tsx` and its drag logic. Kept separate
 * from the component so it's unit-testable without React.
 */
import { facingDirection } from '@/components/hex-grid/authorGridHelpers';
import { cubeToWorld, hexEdgeBetween } from '@/components/hex-grid/hexMath';
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
 * — no room offset to add).
 *
 * `floorPlan` is OPTIONAL (rpg-project#169's creation-3D-editing unit) — a
 * from-scratch creation-mode canvas has no compiled `FloorPlan` to resolve
 * a room-scoped placement's `startColumn` against, but its `doc.rooms` is
 * always `[]` (`creation/emptyCanvasDoc.ts`'s own "no room chain exists
 * yet" doc comment), so the room-scoped loop is already a no-op there
 * regardless — the `if (floorPlan)` guard just keeps this honestly typed
 * for `FloorPlan | undefined` rather than asserting non-null, matching
 * this file's neighbors (`buildPlacements` in `DungeonPreview3D.tsx`
 * already does the identical thing for the same reason). The top-level
 * `doc.place` loop below never depended on `floorPlan` in the first
 * place — it's the one this optionality exists to keep working for a
 * canvas's own top-level placements. */
export function isCellOccupied(
  floorPlan: FloorPlan | undefined,
  doc: DungeonDoc,
  absCol: number,
  row: number,
  exclude?: OccupiedCheck
): boolean {
  if (floorPlan) {
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

/** A `facing:` index (0-5, HEX_FACING_LABELS order) to a Y rotation
 * (radians) — same `atan2(-dz, dx)` convention every other facing-to-
 * rotationY conversion in this codebase uses (`hexMath.ts`'s own
 * `hexEdgeBetween`, `wallRuns.ts`'s envelope-corner rotation). Floor-
 * standing props' base rotation; a `mount: wall` placement uses
 * `wallMountRotationY` below instead — NOT interchangeable (see that
 * function's own doc comment for why). Moved here from
 * `preview3d/DungeonPreview3D.tsx` (fine-rotation generalization round)
 * so the Inspector's flush-snap affordance and the 3D renderer share one
 * definition instead of two. `hexSize` doesn't affect the resulting
 * angle (`hexEdgeBetween`'s `rotationY` is a pure atan2 of a scaled
 * vector, scale-invariant) so `1` is used rather than importing a
 * rendering-specific size constant this pure-geometry module has no
 * other reason to depend on. */
export function facingToRotationY(facing: number): number {
  const dir = facingDirection(facing);
  const world = cubeToWorld(dir, 1);
  return Math.atan2(-world.z, world.x);
}

/** A wall-mounted prop's rotation: flush against the wall face it hangs
 * on, squared to the real edge between `(absCol, row)` and its neighbor
 * in `facing`'s direction — the same `hexEdgeBetween` convention every
 * edge-aligned piece in this codebase uses, NOT `facingToRotationY`'s
 * "point toward the neighbor" approximation (which orients a model's
 * local +X straight out through the wall, perpendicular to the face
 * it's supposedly flush against). Moved here from
 * `preview3d/DungeonPreview3D.tsx` for the same sharing reason
 * `facingToRotationY` was. Also the base angle `computeFlushRotation`
 * below solves against for a FLOOR prop's flush snap — the "which angle
 * counts as flush" question has exactly one correct answer regardless of
 * whether the thing asking is a wall mount or a floor prop standing next
 * to the same wall. */
export function wallMountRotationY(
  absCol: number,
  row: number,
  facing: number
): number {
  const here = cubeAtColRow(absCol, row);
  const dir = facingDirection(facing);
  const there = { x: here.x + dir.x, y: here.y + dir.y, z: here.z + dir.z };
  return hexEdgeBetween(here, there, 1).rotationY;
}

/** The entry in `bearing` (a cell's wall-bearing facings, from
 * `wallBearingFacings`) closest to `current` by circular distance in
 * 60°-step units — used by `computeFlushRotation` to pick which wall to
 * snap to when a cell has more than one, biasing toward the direction
 * the placement is already roughly facing rather than an arbitrary one.
 * Falls back to the first bearing facing when `current` is `null`
 * (nothing to be "nearest" to yet — same fallback shape
 * `stepWallFacing` already uses). */
export function nearestBearingFacing(
  bearing: readonly number[],
  current: number | null
): number | null {
  if (bearing.length === 0) return null;
  if (current === null) return bearing[0]!;
  let best = bearing[0]!;
  let bestDist = Infinity;
  for (const f of bearing) {
    const raw = Math.abs(f - current) % 6;
    const dist = Math.min(raw, 6 - raw);
    if (dist < bestDist) {
      bestDist = dist;
      best = f;
    }
  }
  return best;
}

/** Circular distance between two facing indices (0-5) in 60°-step
 * units — 0..3. Shared by `computeFlushRotation`'s candidate scoring. */
function facingCircularDistance(a: number, b: number): number {
  const raw = Math.abs(a - b) % 6;
  return Math.min(raw, 6 - raw);
}

/** The `(facing, rotationDegrees)` pair that sits a FLOOR-standing
 * placement edge-parallel — flush — against the nearest wall on this
 * cell. Kirk's actual ask behind the fine-rotation slider ("adjust it
 * the 30 [degrees] so on some hexes it can be flush with the wall"):
 * the 6-direction `facing` enum can never reach a wall-flush angle by
 * stepping alone (the 2026-08-02 "30 deg to be flat on the wall"
 * finding — the pointy-top interleave between neighbor/facing
 * directions and edge orientations). Verified numerically, not assumed:
 * `wallMountRotationY(absCol, row, wallFacing)` and
 * `facingToRotationY(wallFacing)` for the SAME index differ by a fixed
 * 90° (the edge is perpendicular to the radial line to the neighbor
 * it's shared with) — picking the wall's OWN facing index as the floor
 * prop's `facing` would need a 90° nudge, outside the slider's ±30°
 * range entirely. The two 6-value angle sets (`facingToRotationY`'s
 * `{0,60,...,300}` and `wallMountRotationY`'s `{30,90,...,330}`) are
 * genuinely interleaved 30° apart, so the facing indices that CAN reach
 * a given wall's flush angle within ±30° are its two NEIGHBORS in the
 * facing cycle, one on each side — this searches all 6 for whichever
 * lands within range (by construction, always exactly two, tied at
 * ±30°) and prefers the one closer to `currentFacing` (minimal visual
 * jump on the click), falling back to the lowest facing index
 * deterministically when there's no current facing to bias toward.
 * Returns `null` when the cell has no adjacent wall to snap to. */
export function computeFlushRotation(
  walls: readonly WallDoc[],
  absCol: number,
  row: number,
  currentFacing: number | null
): { facing: number; rotationDegrees: number } | null {
  const bearing = wallBearingFacings(walls, absCol, row);
  const wallFacing = nearestBearingFacing(bearing, currentFacing);
  if (wallFacing === null) return null;
  const target = wallMountRotationY(absCol, row, wallFacing);

  let best: { facing: number; rotationDegrees: number } | null = null;
  let bestScore = Infinity;
  for (let facing = 0; facing < 6; facing++) {
    const base = facingToRotationY(facing);
    const rawDeg = ((target - base) * 180) / Math.PI;
    // Normalize into (-180, 180] — hexEdgeBetween's atan2 and
    // facingToRotationY's atan2 can each independently land on either
    // side of the +-180 seam.
    const normalizedDeg = ((((rawDeg + 180) % 360) + 360) % 360) - 180;
    if (Math.abs(normalizedDeg) > 30.5) continue; // unreachable within the slider's range
    const score =
      currentFacing === null
        ? 0
        : facingCircularDistance(facing, currentFacing);
    if (score < bestScore) {
      bestScore = score;
      best = { facing, rotationDegrees: Math.round(normalizedDeg) };
    }
  }
  return best;
}
