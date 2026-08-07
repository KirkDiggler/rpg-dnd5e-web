/**
 * walkMovement — pure movement-legality for the author-walkthrough's Walk
 * mode (rpg-project#169, Kirk's day-one ask: "a 3d view from the player
 * perspective that has the lighting loaded"). Answers exactly one
 * question, in world space: given a proposed step, where does the camera
 * actually end up, honoring the SAME document truth every other view in
 * this concept already renders?
 *
 * **Reuses the existing legality/footprint/crossing modules, does not
 * reimplement geometry** (this unit's own scope note): a straight wall's
 * FOOTPRINT and CROSSED-EDGE math come straight from
 * `creation/straightWallGeometry.ts` (`straightWallFootprint`,
 * `straightWallCrossedEdges`) — the exact functions the 2D board's own
 * hatch/warning overlays and `canvasFloor.ts`'s placement-legality gate
 * already call, not a parallel derivation. The floor-cell set this module
 * walks (`cells: PlaceableCell[]`) is `DungeonPreview3D.tsx`'s own
 * `buildPlaceableCells` output — the SAME per-cell col/row/world-position
 * list click-to-place already resolves against, so "which cell is the
 * camera standing in" and "which cell would a click place into" can never
 * disagree.
 *
 * **Blocking rule, matched to Kirk's own rule for a drawn straight wall**
 * ("any hex that is not 100% uncovered would not be traversable") and
 * generalized to every source of impassability this document can author:
 * a cell is walkable floor MINUS three things — a straight-wall
 * (`wallLines:`) footprint cell, a `place:`/room-`place:` entry whose
 * `resolvePlacement(...).blocksMovement` resolves true (the SAME
 * inherited-default-aware resolver `isEntranceBlocked` already reads, so
 * a `defaults:`-inherited block is honored here exactly like an explicit
 * one), and a room's `boss:` cell (a monster standing there is always an
 * obstacle — `BossDoc` carries no `blocks_movement` field to resolve, so
 * this is a flat rule, not a resolved one). Separately, EDGE-crossing
 * between two individually-walkable cells is blocked by an edge-native
 * `walls:` (or server-truth `FloorPlan.edges`) entry whose `kind ===
 * 'solid'` — a `kind: 'door'` edge is deliberately NOT added to the
 * blocked-edge set, so a door is simply passable, matching this file's
 * neighbor `DungeonPreview3D.tsx`'s own `DoorGap` rendering (a genuine
 * open span, not a shortened solid box). A `wallLines:` door is already
 * handled one layer down: its cell is excluded from the OWNING line's own
 * footprint (`WallLineDoorDoc`'s own doc comment — "as if the line never
 * clipped it"), so it never enters `blockedCells`, and its own boundary
 * crossings fall out of `straightWallCrossedEdges`'s ordinary
 * both-clear-cells rule with no separate door-crossing code needed here
 * either.
 */
import { HEX_SIZE } from '@/components/hex-grid/hexMath';
import type { FloorPlan } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { facingToRotationY, neighborCell } from '../boardGeometry';
import { DEFAULT_CANVAS } from '../creation/emptyCanvasDoc';
import {
  cellKey,
  straightWallCrossedEdges,
  straightWallFootprint,
} from '../creation/straightWallGeometry';
import {
  resolvePlacement,
  type DungeonDoc,
  type PlacementDoc,
} from '../dungeonYaml';
import { floorPlanEdgesToServerEdges, hasServerEdges } from '../edgesAdapter';
import type { PlaceableCell } from './DungeonPreview3D';

/** A cell-pair key with no notion of direction — `edgeKey(a,b) ===
 * edgeKey(b,a)` always, by sorting the two `[col,row]` pairs
 * lexicographically before joining them. Deliberately independent of
 * `creationGeometry.ts`'s own `canonicalHexEdge` (a facing-derived
 * convention) — this module ingests edges from THREE different sources
 * (`doc.walls`, server-truth `FloorPlan.edges`, and
 * `straightWallCrossedEdges`'s own `EdgeGeometry.cellA/cellB`, itself
 * already canonical under a DIFFERENT rule), so a single self-contained
 * key format that only needs the two endpoints — not which cell a caller
 * happened to start from, nor which of the three sources produced it —
 * is simpler than reconciling three conventions into one. */
function edgeKey(
  colA: number,
  rowA: number,
  colB: number,
  rowB: number
): string {
  const a = cellKey(colA, rowA);
  const b = cellKey(colB, rowB);
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

export interface WalkContext {
  cellList: readonly PlaceableCell[];
  cellsByKey: ReadonlyMap<string, PlaceableCell>;
  blockedCells: ReadonlySet<string>;
  blockedEdges: ReadonlySet<string>;
}

/** Build the walk-time legality index once per render (memoized by the
 * caller, same as every other derived structure `DungeonPreview3D.tsx`
 * already computes) — everything below is a plain lookup against this,
 * no re-derivation per frame. */
export function buildWalkContext(
  floorPlan: FloorPlan | undefined,
  doc: DungeonDoc,
  cells: readonly PlaceableCell[],
  wallLineFootprint: ReadonlySet<string>
): WalkContext {
  const cellsByKey = new Map<string, PlaceableCell>();
  for (const c of cells) cellsByKey.set(cellKey(c.col, c.row), c);

  const blockedCells = new Set<string>(wallLineFootprint);
  const addIfBlocking = (p: PlacementDoc, absCol: number, row: number) => {
    if (resolvePlacement(doc, p).blocksMovement) {
      blockedCells.add(cellKey(absCol, row));
    }
  };
  if (floorPlan) {
    for (const room of doc.rooms) {
      const fpRoom = floorPlan.rooms.find((r) => r.id === room.id);
      if (!fpRoom) continue;
      for (const p of room.place) {
        addIfBlocking(p, fpRoom.startColumn + p.at[0], p.at[1]);
      }
      if (room.boss) {
        blockedCells.add(
          cellKey(fpRoom.startColumn + room.boss.at[0], room.boss.at[1])
        );
      }
    }
  }
  for (const p of doc.place) addIfBlocking(p, p.at[0], p.at[1]);

  const blockedEdges = new Set<string>();
  for (const w of doc.walls) {
    if (w.kind === 'solid') {
      blockedEdges.add(edgeKey(w.from[0], w.from[1], w.to[0], w.to[1]));
    }
  }
  if (floorPlan && hasServerEdges(floorPlan)) {
    for (const e of floorPlanEdgesToServerEdges(floorPlan)) {
      if (e.kind === 'solid') {
        blockedEdges.add(edgeKey(e.from[0], e.from[1], e.to[0], e.to[1]));
      }
    }
  }
  const grid = doc.canvas ?? DEFAULT_CANVAS;
  for (const line of doc.wallLines) {
    const doorCells = line.doors.map((d) => d.cell);
    const footprint = straightWallFootprint(
      line.from,
      line.to,
      grid,
      doorCells
    );
    for (const edge of straightWallCrossedEdges(
      line.from,
      line.to,
      grid,
      footprint
    )) {
      blockedEdges.add(
        edgeKey(edge.cellA[0], edge.cellA[1], edge.cellB[0], edge.cellB[1])
      );
    }
  }

  return { cellList: cells, cellsByKey, blockedCells, blockedEdges };
}

/** Whether `(col, row)` is real floor AND not blocked — the single
 * per-cell legality check every function below composes from. */
export function canStandAt(
  ctx: WalkContext,
  col: number,
  row: number
): boolean {
  const key = cellKey(col, row);
  return ctx.cellsByKey.has(key) && !ctx.blockedCells.has(key);
}

/** Nearest cell (standable or not — callers that need "which cell would
 * this land in" use this, then apply their own legality check) to a
 * world-space point, by squared XZ distance. Brute-force over `cellList`,
 * the same "simpler and cheaper to verify than a closed-form inverse"
 * reasoning `boardGeometry.ts`'s own `nearestCell` already uses — this
 * one is cheaper still, since it only ever scans the real floor-cell list
 * `buildPlaceableCells` already produced, not a full bounding rectangle. */
export function nearestCell(
  ctx: WalkContext,
  worldX: number,
  worldZ: number
): PlaceableCell | null {
  let best: PlaceableCell | null = null;
  let bestDistSq = Infinity;
  for (const c of ctx.cellList) {
    const d = (c.worldX - worldX) ** 2 + (c.worldZ - worldZ) ** 2;
    if (d < bestDistSq) {
      bestDistSq = d;
      best = c;
    }
  }
  return best;
}

function nearestStandableCell(
  ctx: WalkContext,
  worldX: number,
  worldZ: number
): PlaceableCell | null {
  let best: PlaceableCell | null = null;
  let bestDistSq = Infinity;
  for (const c of ctx.cellList) {
    if (!canStandAt(ctx, c.col, c.row)) continue;
    const d = (c.worldX - worldX) ** 2 + (c.worldZ - worldZ) ** 2;
    if (d < bestDistSq) {
      bestDistSq = d;
      best = c;
    }
  }
  return best;
}

/** The mean world position across every real floor cell — NOT
 * `doc.canvas`'s nominal bounds center (`canvasFloor.ts`'s own "every
 * cell inside canvas bounds, minus holes" semantic means the drawn floor
 * can be a small, off-center subset of a much larger declared canvas).
 * `null` for an empty floor. Shared by `resolveWalkStart`'s own fallback
 * below and `WalkCamera.tsx`'s default look-at target — "roughly toward
 * the middle of the dungeon" is the same useful direction for both. */
export function floorCentroid(
  ctx: WalkContext
): { worldX: number; worldZ: number } | null {
  if (ctx.cellList.length === 0) return null;
  let sumX = 0;
  let sumZ = 0;
  for (const c of ctx.cellList) {
    sumX += c.worldX;
    sumZ += c.worldZ;
  }
  return {
    worldX: sumX / ctx.cellList.length,
    worldZ: sumZ / ctx.cellList.length,
  };
}

/** Where Walk mode starts: the doc's own `start:` marker when it resolves
 * to a real, standable cell; else the standable cell nearest the floor's
 * own centroid (`floorCentroid`, above); else the first standable cell
 * found at all (an exotic fully-surrounded `start:` with no better
 * fallback); else `null` (no floor to walk on — the caller's own honest
 * degrade, not this module's). */
export function resolveWalkStart(
  ctx: WalkContext,
  doc: Pick<DungeonDoc, 'start'>
): PlaceableCell | null {
  if (doc.start) {
    const [col, row] = doc.start;
    if (canStandAt(ctx, col, row)) {
      const cell = ctx.cellsByKey.get(cellKey(col, row));
      if (cell) return cell;
    }
  }
  const centroid = floorCentroid(ctx);
  if (!centroid) return null;
  const nearest = nearestStandableCell(ctx, centroid.worldX, centroid.worldZ);
  if (nearest) return nearest;
  return ctx.cellList.find((c) => canStandAt(ctx, c.col, c.row)) ?? null;
}

/** How far a target point may sit from the nearest real floor cell and
 * still be considered "standing in" that cell, for `resolveWalkStep`'s
 * own collision check — `nearestCell` itself always returns SOMETHING
 * (the closest cell in the list, however far), which is correct for a
 * query like "which real cell is closest to this centroid"
 * (`resolveWalkStart`) but wrong for per-frame collision: without a
 * cutoff, an abnormally large single-frame delta (a dropped frame, a
 * runaway input) would silently snap the camera onto whatever real floor
 * cell happens to be globally nearest, potentially straight through
 * solid geometry in between, rather than correctly reading as "this step
 * doesn't land on any floor at all." `HEX_SIZE * 2` is generous against
 * real adjacent-hex spacing (~1.73 world units center-to-center at
 * `HEX_SIZE = 1`) — comfortably larger than any single frame's real
 * movement at `WalkCamera.tsx`'s own walk speed, so it never rejects a
 * genuine step, only a wildly out-of-range one. */
const MAX_STEP_CONTAINMENT_DISTANCE = HEX_SIZE * 2;

/**
 * Whether moving in world-space direction `(ndx, ndz)` from `fromCell`
 * would cross one of `fromCell`'s own blocked edges — rpg-project#169
 * regression fix. Deliberately does NOT ask "which cell does the TARGET
 * point belong to, and is THAT pair blocked" (the earlier approach,
 * `nearestCell`-based): found live that this silently failed for any
 * PERIMETER wall, because a `FloorPlan.edges` boundary edge's own far
 * side is a col/row that was never a real, tracked floor tile
 * (`FloorPlanEdge`'s own doc comment: "one endpoint may be outside the
 * rendered floor-plan bounds" — verified directly against
 * `SHOWCASE_FLOORPLAN.edges`, e.g. `{from:[0,7], to:[-1,7]}`) — so
 * `nearestCell` could never resolve a target point TO that nonexistent
 * neighbor, the "did the nearest cell change" crossing test never
 * fired, and the player walked straight through every perimeter wall in
 * the dungeon into unmapped void (which then correctly rendered as
 * nothing — not a rendering bug, a genuine collision gap).
 *
 * This version asks a geometrically different, correct question
 * instead: "does `fromCell` — a cell that's DEFINITELY real, since the
 * player is standing in it — have a blocked edge in roughly the
 * direction I'm trying to move," using `boardGeometry.ts`'s own
 * `neighborCell` (pure cube-coordinate math — it computes where a
 * neighbor WOULD be regardless of whether that coordinate is a tracked
 * floor tile) and `facingToRotationY` (the same world-angle-per-facing
 * convention every other edge-aligned piece in this codebase uses) to
 * find the nearest of the 6 hex directions to the movement vector. This
 * strictly subsumes the old interior-wall behavior (an interior wall's
 * computed neighbor IS the real adjacent cell, so the same `edgeKey`
 * lookup still matches) while now ALSO correctly blocking perimeter
 * walls, and — as a welcome side effect — stops the player from ANY
 * point inside their current cell the moment they try to move toward a
 * blocked edge, rather than letting them approach all the way to the
 * unbuffered cell-Voronoi boundary first (itself close enough to a
 * wall's own thin rendered geometry, `WallBox`'s `WALL_THICKNESS =
 * 0.12`, to read as uncomfortably flush against it).
 */
function directionCrossesBlockedEdge(
  blockedEdges: ReadonlySet<string>,
  fromCol: number,
  fromRow: number,
  ndx: number,
  ndz: number
): boolean {
  if (ndx === 0 && ndz === 0) return false;
  const angle = Math.atan2(-ndz, ndx);
  let bestFacing = 0;
  let bestDist = Infinity;
  for (let facing = 0; facing < 6; facing++) {
    const raw = Math.abs(angle - facingToRotationY(facing)) % (2 * Math.PI);
    const dist = Math.min(raw, 2 * Math.PI - raw);
    if (dist < bestDist) {
      bestDist = dist;
      bestFacing = facing;
    }
  }
  const neighbor = neighborCell(fromCol, fromRow, bestFacing);
  return blockedEdges.has(
    edgeKey(fromCol, fromRow, neighbor.col, neighbor.row)
  );
}

/** One frame's worth of proposed movement, resolved against the walk
 * context — "simple grid-constrained motion... slide-along or stop at
 * blocks" (this unit's own scope): tries the full diagonal step first,
 * then each axis independently (the slide-along-a-wall feel), and
 * finally gives up and holds position — never a physics engine, never
 * anything more than three legality checks against cells already
 * resolved above. `x`/`z` and `dx`/`dz` are all world-space units; `y`
 * (eye height) is the caller's own fixed constant, untouched here. */
export function resolveWalkStep(
  ctx: WalkContext,
  x: number,
  z: number,
  dx: number,
  dz: number
): { x: number; z: number } {
  const canMove = (ndx: number, ndz: number): boolean => {
    if (ndx === 0 && ndz === 0) return false;
    const fromCell = nearestCell(ctx, x, z);
    if (
      fromCell &&
      directionCrossesBlockedEdge(
        ctx.blockedEdges,
        fromCell.col,
        fromCell.row,
        ndx,
        ndz
      )
    ) {
      return false;
    }
    const targetX = x + ndx;
    const targetZ = z + ndz;
    const toCell = nearestCell(ctx, targetX, targetZ);
    if (!toCell) return false;
    const distSq =
      (toCell.worldX - targetX) ** 2 + (toCell.worldZ - targetZ) ** 2;
    if (distSq > MAX_STEP_CONTAINMENT_DISTANCE ** 2) return false;
    if (!canStandAt(ctx, toCell.col, toCell.row)) return false;
    return true;
  };
  if (canMove(dx, dz)) return { x: x + dx, z: z + dz };
  if (canMove(dx, 0)) return { x: x + dx, z };
  if (canMove(0, dz)) return { x, z: z + dz };
  return { x, z };
}

export { edgeKey };

// --- Shared WASD input, reused by BOTH camera modes that walk
// (`WalkCamera.tsx`'s first-person mode, `PlayCamera.tsx`'s tactical
// mode) — rpg-project#169 follow-up unit (Kirk, live: "walk is pretty
// literal. that is not the view we have when playing... really cool
// though" — Play reuses this exact movement, only the CAMERA rig
// differs). Kept here, not per-component, so "movement identical to
// Walk" is a real, enforced-by-sharing fact, not a claim two separate
// implementations happen to agree with today. ---

export type MoveAxis = 'forward' | 'back' | 'left' | 'right';

/** Keyboard-code -> movement axis, shared by every walking camera mode.
 * Arrow keys included alongside WASD for the same reason any other
 * movement-key convention would: no reason to support one and not the
 * other once either is being handled at all. */
export const KEY_TO_AXIS: Record<string, MoveAxis> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/**
 * The raw world-space (dx, dz) a frame's held keys produce, given the
 * caller's own notion of "forward"/"right" (a first-person camera's own
 * facing for `WalkCamera`; the tactical rig's azimuth-derived heading for
 * `PlayCamera` — see that component's own doc comment for why the two
 * necessarily differ even though the KEYS and the resulting MOVEMENT
 * resolution — `resolveWalkStep`, below — are identical). Pure: takes the
 * already-read key set, not a live listener. Diagonal input (e.g. W+D) is
 * normalized so it doesn't move faster than a single key.
 */
export function resolveMoveVector(
  pressedKeys: ReadonlySet<string>,
  forward: { x: number; z: number },
  right: { x: number; z: number },
  speed: number,
  delta: number
): { dx: number; dz: number } {
  let f = 0;
  let r = 0;
  for (const code of pressedKeys) {
    switch (KEY_TO_AXIS[code]) {
      case 'forward':
        f += 1;
        break;
      case 'back':
        f -= 1;
        break;
      case 'right':
        r += 1;
        break;
      case 'left':
        r -= 1;
        break;
    }
  }
  if (f === 0 && r === 0) return { dx: 0, dz: 0 };
  const inputLen = Math.hypot(f, r) || 1;
  const step = (speed * delta) / inputLen;
  return {
    dx: (forward.x * f + right.x * r) * step,
    dz: (forward.z * f + right.z * r) * step,
  };
}
