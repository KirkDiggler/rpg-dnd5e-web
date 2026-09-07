/**
 * wallGesture — what is left of the wall tool's pointer maths once the
 * wall stopped being a drag (rpg-project#360 slice 2).
 *
 * DELETED WHOLESALE: the drag table, the corner lattice, angle/vertex
 * magnetism, reshape and every `apply*`/`derive*` mutator this file used
 * to pin. A wall is a straight line between two of the seven positions
 * now, and the author PICKS both ends directly — there is no drag to
 * derive a chain from, so there is nothing left to test but hit-testing:
 * which drawn wall (if any) is under the pointer. See this module's own
 * header comment for the full account of what went and why.
 */
import { describe, expect, it } from 'vitest';
import {
  distanceToSegment,
  nearestWallIndex,
  WALL_HIT_RADIUS,
} from './wallGesture';

const SIZE = 24;

describe('distanceToSegment — exact for known points', () => {
  it('is zero for a point on the segment', () => {
    expect(
      distanceToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })
    ).toBe(0);
  });

  it('is the perpendicular distance for a point abeam the middle', () => {
    expect(
      distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })
    ).toBe(3);
  });

  it('is the distance to the nearer endpoint once the point is past it', () => {
    // Past B, off to the side: nearest point on the closed segment is B
    // itself, so this is a 3-4-5 triangle from (10, 0).
    expect(
      distanceToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })
    ).toBe(5);
    // Symmetric on the A side.
    expect(
      distanceToSegment({ x: -3, y: -4 }, { x: 0, y: 0 }, { x: 10, y: 0 })
    ).toBe(5);
  });

  it('is the plain distance to A for a degenerate (zero-length) segment', () => {
    expect(
      distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })
    ).toBe(5);
  });

  it('is exact off-axis too (a 3-4-5 triangle to the segment)', () => {
    // Segment runs straight up the y axis; the point sits 3 units east,
    // level with the middle of the segment — pure perpendicular distance.
    expect(
      distanceToSegment({ x: 3, y: 5 }, { x: 0, y: 0 }, { x: 0, y: 10 })
    ).toBe(3);
  });
});

describe('nearestWallIndex — hit-test the drawn lines', () => {
  const walls = [
    { a: { x: 0, y: 0 }, b: { x: 10 * SIZE, y: 0 } },
    { a: { x: 0, y: 3 * SIZE }, b: { x: 10 * SIZE, y: 3 * SIZE } },
  ];

  it('picks the wall the point sits on', () => {
    expect(nearestWallIndex(walls, { x: 5 * SIZE, y: 0 }, SIZE)).toBe(0);
    expect(nearestWallIndex(walls, { x: 5 * SIZE, y: 3 * SIZE }, SIZE)).toBe(1);
  });

  it('picks the nearer of two walls within radius', () => {
    // 0.1·size from wall 0, 2.9·size from wall 1 — both inside a huge
    // radius if the hit test failed to compare, but only wall 0 is
    // actually near.
    expect(nearestWallIndex(walls, { x: 5 * SIZE, y: 0.1 * SIZE }, SIZE)).toBe(
      0
    );
  });

  it('returns null just outside the hit radius, and hits just inside it', () => {
    const justOutside = WALL_HIT_RADIUS * SIZE + 0.01 * SIZE;
    const justInside = WALL_HIT_RADIUS * SIZE - 0.01 * SIZE;
    expect(
      nearestWallIndex(walls, { x: 5 * SIZE, y: justOutside }, SIZE)
    ).toBeNull();
    expect(nearestWallIndex(walls, { x: 5 * SIZE, y: justInside }, SIZE)).toBe(
      0
    );
  });

  it('returns null for an empty wall list', () => {
    expect(nearestWallIndex([], { x: 0, y: 0 }, SIZE)).toBeNull();
  });
});
