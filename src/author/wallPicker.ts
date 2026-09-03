/**
 * wallPicker — where a wall can go from a picked position, and what each
 * choice costs (rpg-project#360 slice 2, design §2.6–§2.9).
 *
 * The wall tool is a PICKER, not a drag. Click a hex and its seven
 * positions appear; pick one as the start and the twelve rays are drawn
 * from it, each trimmed to the ends that make a legal wall, each labelled
 * with what it costs — thin lines seal nothing, thick lines seal the
 * cells they run through the centre of, and those cells grey out before
 * the author commits. Then pick an end. There is no angle snap, no
 * tolerance and no freehand: every offered end IS one of the seven
 * positions on one of the twelve directions, so the wall the author sees
 * is the wall the file gets.
 *
 * Kirk: *"snapping could snap to one of those 12 points"*, and
 * *"maybe in the design we can visualize where we can go"*.
 *
 * # What "cost" is, and what it is not
 *
 * `sealed` on an offered end is the closed-form fact design §4.3 states
 * — a single wall seals exactly the cells its line halves — computed in
 * `hexGeometry.ts` from the lattice. It is NOT a mirror of the
 * compiler's area rule (C11's named empty shelf): what two walls seal
 * BETWEEN them (a hexagonal room's 7/12 corner) is the compiler's answer
 * alone, and it reaches the builder as `sealed` off the wire after the
 * commit. The preview promises what one wall costs; the hatch on the
 * board tells the truth about the whole document.
 */

import { floorKeys, sealedKeys, type DungeonDoc } from './dungeonYaml';
import {
  cellAtPoint,
  directionDegrees,
  DIRECTIONS,
  latticeKey,
  latticeOf,
  latticePoint,
  latticeWalk,
  lineIsThick,
  positionAt,
  positionCells,
  positionCrossing,
  positionKey,
  POSITIONS,
  positionsAlongRay,
  sealedBy,
  type Direction,
  type Lattice,
  type PositionRef,
} from './hexGeometry';
import { areAdjacent, axialKey, type Axial, type Edge } from './hexOffset';

/** One end a ray offers, with what picking it would cost. */
export interface PickerEnd {
  position: PositionRef;
  lattice: Lattice;
  /** The floor cells this wall would seal — grey at pick time. Empty for
   * every thin line. */
  sealed: Axial[];
  /** Another wall already ends exactly here, so picking it closes a
   * corner: the same `{cell, offset}` is written to both walls and that
   * IS the whole of snapping (design §2.7, F5). */
  joins: boolean;
}

/** One of the twelve rays from the picked start. */
export interface PickerRay {
  direction: Direction;
  /** The ray's plane angle in degrees, y-down — a multiple of 30. */
  degrees: number;
  /** THE COST LABEL, not a kind of wall. A thick ray runs through cell
   * centres and seals every cell it halves; a thin one shaves at most
   * 5/24 off its neighbours and seals nothing (design §4.3, F16a: thin
   * and thick are in neither the file nor the compiler). */
  thick: boolean;
  /** Nearest first. A ray with none is not offered at all. */
  ends: PickerEnd[];
}

export interface PickerOptions {
  /** How far out to offer ends before the ray is cut off. The floor's
   * own edge usually stops it first. */
  maxEnds?: number;
}

/** Every position some wall already ends at, keyed on the lattice — the
 * corner targets (§2.7). */
export function wallEndKeys(doc: DungeonDoc): Set<string> {
  const o = doc.orientation;
  const keys = new Set<string>();
  for (const wall of doc.walls) {
    keys.add(latticeKey(latticeOf(o, wall.start)));
    keys.add(latticeKey(latticeOf(o, wall.end)));
  }
  return keys;
}

/**
 * The twelve rays from `start`, each trimmed to the ends that make a
 * legal wall.
 *
 * A ray stops where the wall would leave the floor: the first end whose
 * step adds no new floor cell to the footprint ends it, and everything
 * past that is a wall standing in nothing (C2). That is what makes the
 * picture read as "here is where a wall can go" rather than as twelve
 * infinite lines over empty space. Rays with no legal end are dropped,
 * so a start on the floor's edge offers only the directions that stay on
 * it.
 */
export function wallRaysFrom(
  doc: DungeonDoc,
  start: PositionRef,
  options: PickerOptions = {}
): PickerRay[] {
  const o = doc.orientation;
  const maxEnds = options.maxEnds ?? 8;
  const from = latticeOf(o, start);
  const floor = floorKeys(doc);
  const corners = wallEndKeys(doc);
  const rays: PickerRay[] = [];

  for (const direction of DIRECTIONS) {
    const ends: PickerEnd[] = [];
    let previous = from;
    for (const lattice of positionsAlongRay(from, direction, maxEnds)) {
      // THE STEP'S OWN MIDPOINT decides whether the ray continues. It
      // lies strictly inside the step, so it falls in a floor cell
      // exactly when the wall genuinely runs through floor there — the
      // first step off the map ends the ray, and so does every one past
      // it (C2: a wall must pass through floor).
      //
      // Counting the footprint instead does not work at either end. A
      // ray straight out of the floor's edge would be offered, because
      // its first segment TOUCHES the cell it starts on; and a wall's
      // last step would be refused, because the step that finally cuts
      // the last row's crossings adds no new cell to the footprint. The
      // midpoint gets both right and costs one point-in-hex test.
      if (
        !floor.has(
          axialKey(cellAtPoint(o, stepMidpoint(o, previous, lattice), 1))
        )
      ) {
        break;
      }
      previous = lattice;
      const position = positionAt(o, lattice);
      if (!position) continue;
      ends.push({
        position,
        lattice,
        sealed: sealedBy(o, from, lattice).filter((c) =>
          floor.has(axialKey(c))
        ),
        joins: corners.has(latticeKey(lattice)),
      });
    }
    if (ends.length === 0) continue;
    rays.push({
      direction,
      degrees: directionDegrees(o, direction),
      thick: lineIsThick(from, direction),
      ends,
    });
  }
  return rays;
}

/** The midpoint of one step along a ray, in the plane at unit hex size
 * — the point that decides whether the ray keeps going. */
function stepMidpoint(
  o: DungeonDoc['orientation'],
  a: Lattice,
  b: Lattice
): { x: number; y: number } {
  const pa = latticePoint(o, a, 1);
  const pb = latticePoint(o, b, 1);
  return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
}

/** Where a picked position and each offered end land on the board, for
 * the caller that draws them. */
export const pickerPoint = (doc: DungeonDoc, lattice: Lattice, size: number) =>
  latticePoint(doc.orientation, lattice, size);

// ---------------------------------------------------------------------------
// Wall this boundary (design §2.9)
// ---------------------------------------------------------------------------

/** One of the two walls the boundary gesture offers. */
export interface BoundaryWall {
  start: PositionRef;
  end: PositionRef;
  thick: boolean;
  sealed: Axial[];
}

/** The side midpoint two adjacent cells share, or null when they are not
 * adjacent. */
export function crossingMidpoint(
  doc: DungeonDoc,
  [a, b]: Edge
): Lattice | null {
  if (!areAdjacent(a, b)) return null;
  const o = doc.orientation;
  const wanted = new Set([axialKey(a), axialKey(b)]);
  for (const offset of POSITIONS[o]) {
    const l = latticeOf(o, { cell: a, offset });
    const cells = positionCells(o, l);
    if (cells.length === 2 && cells.every((c) => wanted.has(axialKey(c)))) {
      return l;
    }
  }
  return null;
}

/**
 * "Wall this boundary": one gesture along a room's edge picks a whole
 * wall's ends (design §2.9 — the common case is a straight wall between
 * two rooms).
 *
 * Given a crossing out of `regionId`, the THIN line is the line through
 * that crossing's midpoint that follows the boundary as far as it stays
 * straight; the THICK line is the parallel one through the centres of
 * the cells just outside, which leaves the room's own cells whole and
 * seals what it halves out there instead. Both are returned, so the
 * toggle is a choice between two ready walls rather than a second
 * gesture.
 *
 * Null when the crossing is not a boundary of that region, or when the
 * boundary turns immediately (there is no straight wall to offer and the
 * author picks the ends themselves).
 */
export function boundaryWalls(
  doc: DungeonDoc,
  crossing: Edge,
  regionId: string
): { thin: BoundaryWall; thick: BoundaryWall } | null {
  const o = doc.orientation;
  const region = doc.regions.find((r) => r.id === regionId);
  if (!region) return null;
  const inside = new Set(region.cells.map(axialKey));
  const [a, b] = crossing;
  const [near, far] = inside.has(axialKey(a)) ? [a, b] : [b, a];
  if (!inside.has(axialKey(near)) || inside.has(axialKey(far))) return null;
  const mid = crossingMidpoint(doc, [near, far]);
  if (!mid) return null;

  const isBoundaryMidpoint = (l: Lattice): boolean => {
    const cells = positionCells(o, l);
    if (cells.length !== 2) return false;
    const insideCount = cells.filter((c) => inside.has(axialKey(c))).length;
    return insideCount === 1;
  };

  // The direction the boundary continues in: the one whose next position
  // both ways is another boundary midpoint of this room, on a thin line.
  const direction = DIRECTIONS.find((d) => {
    if (lineIsThick(mid, d)) return false;
    const forward = positionsAlongRay(mid, d, 1)[0];
    return forward !== undefined && isBoundaryMidpoint(forward);
  });
  if (!direction) return null;

  const walk = (d: Direction): Lattice => {
    let last = mid;
    for (const l of positionsAlongRay(mid, d, 32)) {
      if (!isBoundaryMidpoint(l)) break;
      last = l;
    }
    return last;
  };
  const back: Direction = { du: -direction.du, dv: -direction.dv };
  const head = walk(direction);
  const tail = walk(back);
  const thinStart = positionAt(o, tail);
  const thinEnd = positionAt(o, head);
  if (!thinStart || !thinEnd) return null;

  // The thick alternative: the same direction through the OUTSIDE cell's
  // centre. Every line through a centre is thick (F15), so this is the
  // thick line of that family by construction, offset the same number of
  // steps each way as the thin one.
  const outside = latticeOf(o, { cell: far, offset: [0, 0] });
  const steps = (l: Lattice): number =>
    direction.du !== 0
      ? (l.u - mid.u) / direction.du
      : (l.v - mid.v) / direction.dv;
  const shift = (n: number): Lattice => ({
    u: outside.u + n * direction.du,
    v: outside.v + n * direction.dv,
  });
  const thickTail = shift(steps(tail));
  const thickHead = shift(steps(head));
  const thickStart = positionAt(o, thickTail);
  const thickEnd = positionAt(o, thickHead);
  if (!thickStart || !thickEnd || !latticeWalk(thickTail, thickHead)) {
    return null;
  }
  const floor = floorKeys(doc);
  const onFloor = (cells: Axial[]) =>
    cells.filter((c) => floor.has(axialKey(c)));
  return {
    thin: {
      start: thinStart,
      end: thinEnd,
      thick: false,
      sealed: onFloor(sealedBy(o, tail, head)),
    },
    thick: {
      start: thickStart,
      end: thickEnd,
      thick: true,
      sealed: onFloor(sealedBy(o, thickTail, thickHead)),
    },
  };
}

// ---------------------------------------------------------------------------
// Doors (design §2.8)
// ---------------------------------------------------------------------------

/** One position a door may stand on. */
export interface DoorTarget {
  position: PositionRef;
  lattice: Lattice;
  /** The index of the wall it would stand in. */
  wallIndex: number;
  /** A door already stands here. */
  taken: boolean;
}

/**
 * Every position a door may stand on: the side midpoints the walls pass
 * through. A centre is offered nowhere — it is the midpoint of no side,
 * so it opens no crossing (F11) — and a position two walls pass through
 * is offered once, under the first of them, because a door there is
 * refused anyway (F10).
 *
 * A door between two SEALED cells is offered like any other: it is legal
 * (F11a), nobody passes it, and open, sight passes the gap. That is a
 * window, and the label says so rather than the picker hiding it.
 */
export function doorTargetsOf(doc: DungeonDoc): DoorTarget[] {
  const o = doc.orientation;
  const taken = new Set(doc.doors.map((d) => positionKey(o, d.at)));
  const seen = new Set<string>();
  const out: DoorTarget[] = [];
  doc.walls.forEach((wall, wallIndex) => {
    const walk = latticeWalk(latticeOf(o, wall.start), latticeOf(o, wall.end));
    for (const lattice of walk ?? []) {
      const key = latticeKey(lattice);
      if (seen.has(key)) continue;
      if (positionCrossing(o, lattice) === null) continue;
      const position = positionAt(o, lattice);
      if (!position) continue;
      seen.add(key);
      out.push({ position, lattice, wallIndex, taken: taken.has(key) });
    }
  });
  return out;
}

/** Whether a door standing here could ever be walked through — false
 * when both its cells are sealed, which the design calls a window and
 * the designer labels rather than refuses (F11a). */
export function doorIsWindow(doc: DungeonDoc, at: PositionRef): boolean {
  const o = doc.orientation;
  const crossing = positionCrossing(o, latticeOf(o, at));
  if (!crossing) return false;
  const sealed = sealedKeys(doc);
  return crossing.every((c) => sealed.has(axialKey(c)));
}
