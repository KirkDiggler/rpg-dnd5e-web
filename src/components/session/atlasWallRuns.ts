/**
 * atlasWallRuns — the atlas's walls as meshes: one straight run per
 * authored segment, split around the doors standing in it.
 *
 * # What this module used to be
 *
 * It used to FIT runs. The wire carried a wall as the list of hex-to-hex
 * crossings it blocked, and this module chained those crossings back into
 * straight lines: a corner-vertex graph, a least-squares direction fit,
 * an authored-axis declaration, a `CHAIN_TOLERANCE` deciding how far a
 * vertex could stray before the chain broke, and a force-close pass that
 * dragged the fitted ends onto the door gaps because the two
 * computations only approximately agreed. All of it existed because the
 * file could not say what the author drew — on a hex grid every degree-2
 * corner turns 60°, so a room corner and a zigzag step are the same
 * angle and no local rule tells them apart.
 *
 * The file says it now. A wall is a line between two positions
 * (rpg-project#360 slice 2), the compiler carries that line to the wire
 * as an `AtlasSegment` in fractional axial, and this module draws it.
 * There is no tolerance left to tune, no chain to break, and no second
 * computation to force into agreement — a wall renders as the segment it
 * is. `boundaries` and `doorways` are unchanged and remain the
 * mechanical truth; `segments` is presentation.
 *
 * # An empty `segments` draws nothing
 *
 * A producer that has not adopted segments yet sends none. This module
 * then returns no runs — it does NOT fall back to fitting `boundaries`,
 * because a fallback is how the fitter would survive its own deletion.
 * A map with walls the server has not described draws its floor and its
 * doors and no walls, which is visible and reportable; a fitted guess
 * would look right and be wrong.
 *
 * # Facing is a pure function of the segment
 *
 * `facing` tells `WallRunMesh` which of a piece's two faces to show. The
 * old engine read it off the floor mask — which side of the wall the
 * room was on. It cannot any more, and must not: design §1.9's wall
 * invariant says a wall looks the same from the visible side whatever is
 * beyond it, and a recipient who cannot see past a wall does not have
 * the cells beyond it in their atlas (C18 puts only the wall's own
 * footing there). Facing derived from the mask would therefore differ
 * between a knower and a non-knower — the masquerade's tell, one layer
 * down. So it is the segment's own perpendicular, taken with the segment
 * oriented canonically, which makes it identical for every recipient and
 * consistent along the whole wall.
 */

import {
  coordToKey,
  cubeToWorld,
  type CubeCoord,
  type WorldPos,
} from '@/components/hex-grid/hexMath';
import { DOOR_FRAME_CALIBRATED_WIDTH } from '@/components/hex-grid/syntyHexWallHelpers';
import type { WallRunSegment } from '@/hooks/wallRuns';
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import type {
  AtlasSegment,
  AxialPoint,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { positionToCube } from './positionBridge';

/**
 * One straight wall run in world space: a piece of one authored segment,
 * between the segment's end and the first door in it, between two doors,
 * or the whole segment when no door stands in it.
 *
 * The name is unchanged from the fitting engine's own output type
 * because the thing is unchanged — a straight run `WallRunMesh` tiles —
 * and it is now literally the wall the author drew rather than a chain
 * fitted to its consequences.
 */
export interface AuthoredWallRun extends WallRunSegment {
  /** Stable across re-renders of the same atlas: the segment's index and
   * the piece's index within it. */
  key: string;
  /** The authored height MULTIPLIER, 0 meaning not authored (which
   * renders exactly as 1) — the wire's own contract, passed through
   * without arithmetic. */
  height: number;
  /** The unit normal of the run's own line — see this module's header
   * for why it is not read off the floor mask. */
  facing: WorldPos;
}

/** Where a door's frame and leaf go: the gap this segment's own runs
 * leave, rendered separately by the caller (`WallRunMesh` tiles the
 * runs, it never places doors). */
export interface DoorGapPiece {
  key: string;
  connection: string;
  /** Frame placement — the gap's own centre. */
  position: WorldPos;
  /** Leaf placement — one end of the gap. */
  leafPosition: WorldPos;
  rotationY: number;
}

export interface WallRunScene {
  wallRuns: AuthoredWallRun[];
  doorGaps: DoorGapPiece[];
}

/**
 * The door gap's total length. `DOOR_FRAME_CALIBRATED_WIDTH` is 1.0 —
 * exactly one hex SIDE at the game's `HEX_SIZE`, which is what design
 * C15 asks for ("the wall's segment through the door hex on either side
 * of the midpoint, one side's length in all"). The measured asset width
 * and the design's rule are the same number, so there is one constant
 * and no reconciliation.
 */
const GAP_LENGTH = DOOR_FRAME_CALIBRATED_WIDTH;

/** A fractional axial point in world space. `cubeToWorld` already takes
 * fractions — the wire carries no second basis and no unit (design
 * §5.2). */
function axialToWorld(p: AxialPoint | undefined, hexSize: number): WorldPos {
  const q = p?.q ?? 0;
  const r = p?.r ?? 0;
  return cubeToWorld({ x: q, y: -q - r, z: r }, hexSize);
}

const sub = (a: WorldPos, b: WorldPos): WorldPos => ({
  x: a.x - b.x,
  z: a.z - b.z,
});

const length = (v: WorldPos): number => Math.hypot(v.x, v.z);

function unit(v: WorldPos): WorldPos {
  const len = length(v);
  return len === 0 ? { x: 0, z: 0 } : { x: v.x / len, z: v.z / len };
}

const along = (from: WorldPos, dir: WorldPos, t: number): WorldPos => ({
  x: from.x + dir.x * t,
  z: from.z + dir.z * t,
});

/** The segment oriented canonically — smaller x first, then smaller z —
 * so `facing` and the run keys do not depend on which way round the
 * producer wrote the wall. */
function orient(a: WorldPos, b: WorldPos): [WorldPos, WorldPos] {
  const EPS = 1e-9;
  if (a.x < b.x - EPS) return [a, b];
  if (a.x > b.x + EPS) return [b, a];
  return a.z <= b.z ? [a, b] : [b, a];
}

/** One doorway's point on the wall: the midpoint of the two cells it
 * separates, which IS the midpoint of the side between them. */
function doorwayPoint(
  from: CubeCoord,
  to: CubeCoord,
  hexSize: number
): WorldPos {
  const a = cubeToWorld(from, hexSize);
  const b = cubeToWorld(to, hexSize);
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

/** How far along `segment` a point sits, and how far off its line, in
 * world units. */
function project(
  point: WorldPos,
  start: WorldPos,
  dir: WorldPos
): { t: number; offLine: number } {
  const d = sub(point, start);
  const t = d.x * dir.x + d.z * dir.z;
  const foot = along(start, dir, t);
  return { t, offLine: length(sub(point, foot)) };
}

interface PlacedDoor {
  connection: string;
  key: string;
  t: number;
  point: WorldPos;
}

/**
 * Every authored segment as straight runs, plus one gap per door.
 *
 * A door is placed on the segment its own crossing's midpoint lies on
 * (the compiler guarantees exactly one wall passes through a door's
 * position, F10). The gap is centred there, `GAP_LENGTH` long along the
 * segment, and the runs are what is left of the segment either side —
 * so the wall and the frame meet by construction rather than by two
 * computations agreeing.
 *
 * A doorway whose midpoint is on no segment still draws its frame, laid
 * across the crossing it opens. That is the honest picture of a door the
 * server described and a wall it did not: the door is mechanical truth
 * and is drawn; nothing is invented for the wall.
 */
export function segmentsToWallRuns(
  atlas: Pick<GetAtlasResponse, 'segments' | 'doorways'>,
  hexSize: number
): WallRunScene {
  const segments = atlas.segments ?? [];
  const doorGaps: DoorGapPiece[] = [];
  const wallRuns: AuthoredWallRun[] = [];

  // Where each segment starts, which way it runs, and how long it is —
  // computed once, then reused to place every door on it.
  const lines = segments.map((segment: AtlasSegment, index: number) => {
    const [a, b] = orient(
      axialToWorld(segment.from, hexSize),
      axialToWorld(segment.to, hexSize)
    );
    const span = sub(b, a);
    const dir = unit(span);
    return {
      index,
      start: a,
      dir,
      length: length(span),
      height: segment.height,
      doors: [] as PlacedDoor[],
    };
  });

  const ON_LINE_EPS = 1e-6 * Math.max(hexSize, 1);
  atlas.doorways.forEach((doorway, doorIndex) => {
    if (!doorway.from || !doorway.to) return;
    const from = positionToCube(doorway.from);
    const to = positionToCube(doorway.to);
    const point = doorwayPoint(from, to, hexSize);
    const key =
      doorway.connection ||
      `door:${coordToKey(from)}|${coordToKey(to)}|${doorIndex}`;
    let best: (typeof lines)[number] | undefined;
    let bestT = 0;
    let bestOff = Infinity;
    for (const line of lines) {
      const { t, offLine } = project(point, line.start, line.dir);
      if (t < -ON_LINE_EPS || t > line.length + ON_LINE_EPS) continue;
      if (offLine < bestOff) {
        bestOff = offLine;
        best = line;
        bestT = t;
      }
    }
    if (best && bestOff <= ON_LINE_EPS) {
      best.doors.push({ connection: doorway.connection, key, t: bestT, point });
      doorGaps.push({
        key,
        connection: doorway.connection,
        position: point,
        leafPosition: along(best.start, best.dir, bestT - GAP_LENGTH / 2),
        rotationY: Math.atan2(-best.dir.z, best.dir.x),
      });
      return;
    }
    // No segment carries this door. Lay the frame across the crossing it
    // opens, square to the step — a door with no wall, drawn as one.
    const across = unit(
      sub(cubeToWorld(to, hexSize), cubeToWorld(from, hexSize))
    );
    const side: WorldPos = { x: -across.z, z: across.x };
    doorGaps.push({
      key,
      connection: doorway.connection,
      position: point,
      leafPosition: along(point, side, -GAP_LENGTH / 2),
      rotationY: Math.atan2(-side.z, side.x),
    });
  });

  for (const line of lines) {
    // The perpendicular of the canonically-oriented line: one of the two
    // normals, chosen the same way for every recipient.
    const facing: WorldPos = { x: -line.dir.z, z: line.dir.x };
    const cuts = line.doors
      .map((d) => d.t)
      .sort((x, y) => x - y)
      .flatMap((t) => [t - GAP_LENGTH / 2, t + GAP_LENGTH / 2]);
    const bounds = [0, ...cuts, line.length];
    for (let i = 0; i + 1 < bounds.length; i += 2) {
      const from = Math.max(0, bounds[i]);
      const to = Math.min(line.length, bounds[i + 1]);
      // A door at a segment's very end leaves no wall on that side.
      if (to - from <= ON_LINE_EPS) continue;
      wallRuns.push({
        key: `seg:${line.index}:${i / 2}`,
        start: along(line.start, line.dir, from),
        end: along(line.start, line.dir, to),
        height: line.height,
        facing,
      });
    }
  }

  return { wallRuns, doorGaps };
}

export type { CubeCoord };
