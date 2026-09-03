/**
 * boardWallRuns — the 2D canvas's picture of the document's walls and
 * doors.
 *
 * # There is nothing left to fit
 *
 * This module used to map the document into an atlas-shaped input, hand
 * it to the 3D route's chain-fitting engine, and project the result into
 * SVG space — an elaborate way to make the board draw the same GUESS the
 * 3D preview drew, because a wall on disk was a list of crossings and
 * neither view could know which line the author meant. Kirk's walk:
 * *"with the follow-the-hexes it seems we need to do some guessing."*
 *
 * A wall is a line now (rpg-project#360 slice 2). The board draws it by
 * placing its two authored positions and joining them. So does the 3D
 * preview, from the same two numbers by way of the server's segment.
 * There is no fitting, no tolerance, no corner closure and no projection
 * identity to pin, because there is only one geometry: `hexGeometry.ts`
 * places a position, and the board's `size` and the game's `HEX_SIZE`
 * are the same formula at two scales.
 *
 * # Flat-top draws too
 *
 * The old module returned null for a flat-top document, because the
 * engine it borrowed placed pointy-top only. The position lattice places
 * both, so a flat-top document's walls now draw on the board — the 3D
 * preview still refuses it by name (rpg-dnd5e-web#763), which is a
 * renderer limit, not a geometry one.
 */
import type { Point } from '../../concepts/session-tomb/atlas';
import { doorCrossing, type DungeonDoc } from '../dungeonYaml';
import {
  latticeOf,
  latticeWalk,
  positionKey,
  positionPoint,
  wallFootprint,
  type PlanePoint,
} from '../hexGeometry';
import { axialKey, type Axial, type Edge } from '../hexOffset';

/** One wall as the board draws it: the line between its two authored
 * positions, carrying the index of the `walls[]` entry behind it so a
 * click can select, name, raise or delete that wall. */
export interface BoardWall {
  index: number;
  a: Point;
  b: Point;
  /** The authored height multiplier; `undefined` = standard. The 2D
   * board stays schematic about it — a label, not scaled geometry. */
  height?: number;
  name?: string;
  /** The cells this wall seals on its own — hatched, so the cost the
   * picker previewed stays visible after the commit. */
  sealed: Axial[];
}

/** One door, drawn as a gap on the wall it stands in. */
export interface BoardDoor {
  doorId: string;
  /** The position it stands on — the gap's centre. */
  at: Point;
  /** The gap's two ends along the wall. */
  a: Point;
  b: Point;
  /** The crossing it opens, for the inspector and for error overlays. */
  crossing: Edge | null;
}

export interface BoardWallScene {
  walls: BoardWall[];
  doors: BoardDoor[];
}

/** The door gap's length as a fraction of the hex's own side — design
 * C15's "one side's length in all", half either side of the position. */
const GAP_SIDES = 1;

const asPoint = (p: PlanePoint): Point => ({ x: p.x, y: p.y });

/**
 * The document's walls and doors in SVG user space at `size`.
 *
 * A wall whose ends are not on one of the twelve directions is dropped
 * rather than drawn crooked: the picker cannot author one, and a
 * hand-edited file that carries one gets the compiler's refusal, which
 * is where that news belongs.
 */
export function boardWallScene(doc: DungeonDoc, size: number): BoardWallScene {
  const o = doc.orientation;
  const walls: BoardWall[] = [];
  doc.walls.forEach((wall, index) => {
    const a = latticeOf(o, wall.start);
    const b = latticeOf(o, wall.end);
    if (!latticeWalk(a, b)) return;
    const floor = new Set(
      [...doc.regions.flatMap((r) => r.cells), ...doc.scenery].map(axialKey)
    );
    walls.push({
      index,
      a: asPoint(positionPoint(o, wall.start, size)),
      b: asPoint(positionPoint(o, wall.end, size)),
      height: wall.height,
      name: wall.name,
      sealed: wallFootprint(o, a, b).filter(
        (c) => floor.has(axialKey(c)) && isCentreOn(doc, a, b, c)
      ),
    });
  });

  const doors: BoardDoor[] = doc.doors.map((door) => {
    const at = positionPoint(o, door.at, size);
    const host = doc.walls.find((wall) => {
      const walk = latticeWalk(
        latticeOf(o, wall.start),
        latticeOf(o, wall.end)
      );
      return walk?.some((l) => `${l.u},${l.v}` === positionKey(o, door.at));
    });
    // The gap runs along the wall it stands in; a door on no wall (a file
    // the compiler refuses, F10) draws its gap square to the crossing it
    // opens so the author can see and move it.
    const line = host
      ? {
          a: positionPoint(o, host.start, size),
          b: positionPoint(o, host.end, size),
        }
      : null;
    const dir = line ? unit(line.a, line.b) : { x: 1, y: 0 };
    const half = (GAP_SIDES * size) / 2;
    return {
      doorId: door.id,
      at: asPoint(at),
      a: { x: at.x - dir.x * half, y: at.y - dir.y * half },
      b: { x: at.x + dir.x * half, y: at.y + dir.y * half },
      crossing: doorCrossing(doc, door),
    };
  });

  return { walls, doors };
}

function unit(a: PlanePoint, b: PlanePoint): PlanePoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  return len === 0 ? { x: 1, y: 0 } : { x: dx / len, y: dy / len };
}

/** Whether the wall runs through this cell's own centre — the one thing
 * that seals it (design §4.3). */
function isCentreOn(
  doc: DungeonDoc,
  a: { u: number; v: number },
  b: { u: number; v: number },
  cell: Axial
): boolean {
  const o = doc.orientation;
  const centre = latticeOf(o, { cell, offset: [0, 0] });
  const walk = latticeWalk(a, b);
  return !!walk?.some((l) => l.u === centre.u && l.v === centre.v);
}
