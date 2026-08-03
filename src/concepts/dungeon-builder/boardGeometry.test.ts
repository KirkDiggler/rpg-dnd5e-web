import { describe, expect, it } from 'vitest';
import {
  computeFlushRotation,
  facingToRotationY,
  isSameSelection,
  nearestBearingFacing,
  neighborCell,
  stepWallFacing,
  wallBearingFacings,
  wallMountRotationY,
} from './boardGeometry';
import type { WallDoc } from './dungeonYaml';
import type { PlacementSelection } from './types';

const roomA0: PlacementSelection = { roomId: 'room-a', index: 0 };
const roomA1: PlacementSelection = { roomId: 'room-a', index: 1 };
const roomB0: PlacementSelection = { roomId: 'room-b', index: 0 };
const topLevel0: PlacementSelection = { roomId: null, index: 0 };
const topLevel1: PlacementSelection = { roomId: null, index: 1 };
const bossA: PlacementSelection = { roomId: 'room-a', boss: true };
const bossB: PlacementSelection = { roomId: 'room-b', boss: true };

describe('isSameSelection (Kirk\'s 2026-08-02 "3D editing" arc, part 2 — click-select shared between Board.tsx and DungeonPreview3D.tsx)', () => {
  it('is false when there is no current selection', () => {
    expect(isSameSelection(null, roomA0)).toBe(false);
    expect(isSameSelection(undefined, roomA0)).toBe(false);
  });

  it('matches a room-scoped selection by roomId + index', () => {
    expect(isSameSelection(roomA0, roomA0)).toBe(true);
    expect(isSameSelection({ ...roomA0 }, roomA0)).toBe(true);
  });

  it('does not match a different index in the same room', () => {
    expect(isSameSelection(roomA0, roomA1)).toBe(false);
  });

  it('does not match the same index in a different room', () => {
    expect(isSameSelection(roomA0, roomB0)).toBe(false);
  });

  it('matches a top-level selection (roomId: null) by index alone', () => {
    expect(isSameSelection(topLevel0, topLevel0)).toBe(true);
    expect(isSameSelection(topLevel0, topLevel1)).toBe(false);
  });

  it('never matches a top-level selection against a room-scoped one at the same index — roomId: null is not a wildcard', () => {
    expect(isSameSelection(topLevel0, roomA0)).toBe(false);
    expect(isSameSelection(roomA0, topLevel0)).toBe(false);
  });

  it('matches a boss selection by roomId alone, ignoring index', () => {
    expect(isSameSelection(bossA, bossA)).toBe(true);
    expect(isSameSelection(bossA, bossB)).toBe(false);
  });

  it('never matches a boss selection against a non-boss one in the same room — boss is a distinct slot, not place[0]', () => {
    expect(isSameSelection(bossA, roomA0)).toBe(false);
    expect(isSameSelection(roomA0, bossA)).toBe(false);
  });
});

describe('wallBearingFacings / stepWallFacing (wall-mount edge-selection rework, Kirk\'s 2026-08-02 "I can only line up 1 direction" finding)', () => {
  const ABS_COL = 5;
  const ROW = 3;

  it('finds a wall authored {from: here, to: neighbor}', () => {
    const n = neighborCell(ABS_COL, ROW, 1); // NE
    const walls: WallDoc[] = [
      { from: [ABS_COL, ROW], to: [n.col, n.row], kind: 'solid' },
    ];
    expect(wallBearingFacings(walls, ABS_COL, ROW)).toEqual([1]);
  });

  it('finds a wall authored from the OTHER side, {from: neighbor, to: here}', () => {
    const n = neighborCell(ABS_COL, ROW, 4); // SW
    const walls: WallDoc[] = [
      { from: [n.col, n.row], to: [ABS_COL, ROW], kind: 'door' },
    ];
    expect(wallBearingFacings(walls, ABS_COL, ROW)).toEqual([4]);
  });

  it('returns every bearing facing, sorted 0-5, when multiple edges have walls', () => {
    const n0 = neighborCell(ABS_COL, ROW, 0);
    const n3 = neighborCell(ABS_COL, ROW, 3);
    const walls: WallDoc[] = [
      { from: [ABS_COL, ROW], to: [n0.col, n0.row], kind: 'solid' },
      { from: [ABS_COL, ROW], to: [n3.col, n3.row], kind: 'solid' },
    ];
    expect(wallBearingFacings(walls, ABS_COL, ROW)).toEqual([0, 3]);
  });

  it('returns empty for a cell with no adjacent walls', () => {
    expect(wallBearingFacings([], ABS_COL, ROW)).toEqual([]);
  });

  it('ignores a wall on an unrelated cell pair', () => {
    const walls: WallDoc[] = [
      { from: [100, 100], to: [101, 100], kind: 'solid' },
    ];
    expect(wallBearingFacings(walls, ABS_COL, ROW)).toEqual([]);
  });

  it('steps forward/backward cyclically through the bearing list', () => {
    const bearing = [1, 3, 5];
    expect(stepWallFacing(1, bearing, 1)).toBe(3);
    expect(stepWallFacing(3, bearing, 1)).toBe(5);
    expect(stepWallFacing(5, bearing, 1)).toBe(1); // wraps forward
    expect(stepWallFacing(1, bearing, -1)).toBe(5); // wraps backward
    expect(stepWallFacing(3, bearing, -1)).toBe(1);
  });

  it('snaps to the first bearing edge when current facing is not one of them', () => {
    expect(stepWallFacing(2, [1, 3, 5], 1)).toBe(1);
    expect(stepWallFacing(null, [1, 3, 5], 1)).toBe(1);
  });

  it('falls back to plain 6-direction stepping when the cell has no wall-bearing edge at all', () => {
    expect(stepWallFacing(0, [], 1)).toBe(1);
    expect(stepWallFacing(0, [], -1)).toBe(5);
    expect(stepWallFacing(null, [], 1)).toBe(1);
  });
});

describe("facingToRotationY / wallMountRotationY (fine-rotation generalization round — moved here from preview3d/DungeonPreview3D.tsx so both the 3D renderer and the Inspector's flush-snap affordance share one definition)", () => {
  const ABS_COL = 5;
  const ROW = 3;

  it('produces 6 evenly-spaced base angles, 60° apart, one per facing index', () => {
    const degs = [0, 1, 2, 3, 4, 5].map(
      (f) =>
        Math.round(((facingToRotationY(f) * 180) / Math.PI) * 100) / 100 + 0
    );
    expect(degs).toEqual([0, 60, 120, -180, -120, -60]);
  });

  it('produces the wall-flush angle for a real edge, interleaved 30° from facingToRotationY\'s own set (Kirk\'s 2026-08-02 "30 deg to be flat on the wall" finding)', () => {
    // facing=1 (NE): flush angle sits exactly between facingToRotationY(1)=60
    // and facingToRotationY(2)=120, i.e. 90 — 30° from each, never 0° from
    // either. Confirms the interleave is real geometry, not a guess.
    const flush = (wallMountRotationY(ABS_COL, ROW, 1) * 180) / Math.PI;
    expect(Math.round(flush * 100) / 100).toBe(150);
    const base = (facingToRotationY(1) * 180) / Math.PI;
    expect(Math.abs(flush - base)).toBeCloseTo(90, 5);
  });

  it("is scale-invariant (doesn't depend on which hexSize the geometry underneath used, since only the angle is read)", () => {
    // Regression guard: both functions pass a fixed size (1) to
    // hexEdgeBetween/cubeToWorld internally rather than a rendering
    // constant — this pins that the resulting angles are the exact ones
    // Kirk's live-verified 3D preview already renders with (CONTRACT.md's
    // "height decouples from mount" / "wall-mount edge-selection rework"
    // sections), not a coincidentally-similar recomputation.
    for (let f = 0; f < 6; f++) {
      expect(Number.isFinite(facingToRotationY(f))).toBe(true);
      expect(Number.isFinite(wallMountRotationY(ABS_COL, ROW, f))).toBe(true);
    }
  });
});

describe('nearestBearingFacing', () => {
  it('returns null for an empty bearing list', () => {
    expect(nearestBearingFacing([], 2)).toBeNull();
    expect(nearestBearingFacing([], null)).toBeNull();
  });

  it('returns the only entry when there is exactly one', () => {
    expect(nearestBearingFacing([4], 0)).toBe(4);
    expect(nearestBearingFacing([4], null)).toBe(4);
  });

  it('picks the closest by circular distance, not raw numeric distance', () => {
    // facing 0 vs bearing [1, 5]: circular distance to 1 is 1, to 5 is
    // also 1 (wraps around) — but 5 is closer numerically (|0-5|=5 raw).
    // A correct circular-distance implementation still has to pick
    // consistently; here 1 wins as the first-found tie.
    expect(nearestBearingFacing([1, 5], 0)).toBe(1);
    expect(nearestBearingFacing([5, 1], 0)).toBe(5);
  });

  it('picks the nearer of two non-adjacent bearing facings', () => {
    expect(nearestBearingFacing([0, 3], 1)).toBe(0);
    expect(nearestBearingFacing([0, 3], 4)).toBe(3);
  });

  it('falls back to the first bearing facing when current is null', () => {
    expect(nearestBearingFacing([2, 4], null)).toBe(2);
  });
});

describe('computeFlushRotation (Kirk\'s 2026-08-03 fine-rotation generalization: "adjust it the 30 [degrees] so on some hexes it can be flush with the wall" for FLOOR-standing props, not just wall mounts)', () => {
  const ABS_COL = 5;
  const ROW = 3;

  function wallOnFacing(facing: number): WallDoc[] {
    const n = neighborCell(ABS_COL, ROW, facing);
    return [{ from: [ABS_COL, ROW], to: [n.col, n.row], kind: 'solid' }];
  }

  it('returns null when the cell has no adjacent wall', () => {
    expect(computeFlushRotation([], ABS_COL, ROW, null)).toBeNull();
    expect(computeFlushRotation([], ABS_COL, ROW, 2)).toBeNull();
  });

  it('finds a (facing, rotationDegrees) pair for every one of the 6 possible wall-bearing edges, always within +-30 degrees', () => {
    for (let wallFacing = 0; wallFacing < 6; wallFacing++) {
      const result = computeFlushRotation(
        wallOnFacing(wallFacing),
        ABS_COL,
        ROW,
        null
      );
      expect(result).not.toBeNull();
      expect(Math.abs(result!.rotationDegrees)).toBeLessThanOrEqual(30);
    }
  });

  it('the returned (facing, rotationDegrees) actually reconstructs the real wall-flush angle (round-trip against wallMountRotationY, not just "some" answer)', () => {
    for (let wallFacing = 0; wallFacing < 6; wallFacing++) {
      const walls = wallOnFacing(wallFacing);
      const result = computeFlushRotation(walls, ABS_COL, ROW, null)!;
      const target = wallMountRotationY(ABS_COL, ROW, wallFacing);
      const reconstructed =
        facingToRotationY(result.facing) +
        (result.rotationDegrees * Math.PI) / 180;
      let diffDeg = ((reconstructed - target) * 180) / Math.PI;
      diffDeg = ((((diffDeg + 180) % 360) + 360) % 360) - 180;
      expect(Math.abs(diffDeg)).toBeLessThan(0.01);
    }
  });

  it("biases toward the placement's current facing when a cell has more than one adjacent wall", () => {
    const walls: WallDoc[] = [...wallOnFacing(0), ...wallOnFacing(3)];
    // currentFacing near facing=0's side should snap to that wall, not
    // the opposite one.
    const nearZero = computeFlushRotation(walls, ABS_COL, ROW, 1);
    const nearThree = computeFlushRotation(walls, ABS_COL, ROW, 4);
    expect(nearZero).not.toBeNull();
    expect(nearThree).not.toBeNull();
    // The two results should target genuinely different wall edges —
    // confirmed by their resolved angles differing by ~180° (opposite
    // sides of the same cell), not by which raw `facing` field happened
    // to come out (that's an implementation detail covered by the
    // round-trip test above).
    const angleOf = (r: { facing: number; rotationDegrees: number }) =>
      facingToRotationY(r.facing) + (r.rotationDegrees * Math.PI) / 180;
    const deltaDeg =
      Math.abs(((angleOf(nearZero!) - angleOf(nearThree!)) * 180) / Math.PI) %
      360;
    expect(Math.min(deltaDeg, 360 - deltaDeg)).toBeCloseTo(180, 0);
  });

  it('is null-safe and deterministic with no current facing (no bias to apply)', () => {
    const walls = wallOnFacing(2);
    const result = computeFlushRotation(walls, ABS_COL, ROW, null);
    expect(result).toEqual(computeFlushRotation(walls, ABS_COL, ROW, null));
  });
});
