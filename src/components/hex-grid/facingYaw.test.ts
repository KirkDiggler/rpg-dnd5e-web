/**
 * Two independent discriminators, matching `facingYaw.ts`'s own doc
 * comment split:
 *
 * 1. `facingAngleDeg` (pure hex geometry) against `hexCenter`'s own
 *    neighbor-offset formula, computed at the actual neighbor cell —
 *    never touching `facingYaw.ts`'s internal table. A swapped or
 *    mistyped table entry passes a self-referential round-trip and
 *    fails this (the same "pixel formula, not round-trip" discipline
 *    `hexOffset.test.ts` uses for offset/axial, rpg-toolkit#1150).
 * 2. `facingToYaw` against hand-computed, hardcoded radian values (not
 *    derived by calling anything in `facingYaw.ts`) — pinning the
 *    calibrated `FACING_YAW_OFFSET` as well as the geometry, so an
 *    accidental change to either fails a specific, named case.
 */
import { hexCenter } from '@/concepts/session-tomb/atlas';
import { describe, expect, it } from 'vitest';
import {
  FACING_NAMES,
  FACING_YAW_OFFSET,
  facingAngleDeg,
  facingToYaw,
  isValidFacing,
  type Orientation,
} from './facingYaw';

// Each orientation's six names, paired with the axial neighbor offset
// (q, r) that `hexCenter` places in that named direction — picked by
// hand from the hex layout, not from `facingYaw.ts`.
const NEIGHBOR: Record<Orientation, Record<string, [number, number]>> = {
  pointy: {
    e: [1, 0],
    ne: [1, -1],
    nw: [0, -1],
    w: [-1, 0],
    sw: [-1, 1],
    se: [0, 1],
  },
  flat: {
    se: [1, 0],
    ne: [1, -1],
    n: [0, -1],
    nw: [-1, 0],
    sw: [-1, 1],
    s: [0, 1],
  },
};

describe('facingAngleDeg', () => {
  for (const orientation of ['pointy', 'flat'] as const) {
    for (const name of FACING_NAMES[orientation]) {
      it(`${orientation} ${name} matches hexCenter's own neighbor direction`, () => {
        const [dq, dr] = NEIGHBOR[orientation][name];
        const origin = hexCenter({ x: 0, y: 0 } as never, 1, orientation);
        const neighbor = hexCenter({ x: dq, y: dr } as never, 1, orientation);
        const expectedDeg =
          (Math.atan2(neighbor.y - origin.y, neighbor.x - origin.x) * 180) /
          Math.PI;
        expect(facingAngleDeg(orientation, name)).toBeCloseTo(expectedDeg, 9);
      });
    }
  }

  it('is undefined for a name invalid under the orientation', () => {
    expect(facingAngleDeg('pointy', 'n')).toBeUndefined();
    expect(facingAngleDeg('flat', 'e')).toBeUndefined();
    expect(facingAngleDeg('pointy', '')).toBeUndefined();
  });
});

describe('isValidFacing', () => {
  it("accepts only each orientation's own six names", () => {
    expect(isValidFacing('pointy', 'e')).toBe(true);
    expect(isValidFacing('pointy', 'n')).toBe(false);
    expect(isValidFacing('flat', 'n')).toBe(true);
    expect(isValidFacing('flat', 'e')).toBe(false);
    expect(isValidFacing('pointy', '')).toBe(false);
  });
});

describe('facingToYaw', () => {
  it('is 0 for an absent or unrecognized facing — the asset default', () => {
    expect(facingToYaw('pointy', '')).toBe(0);
    expect(facingToYaw('pointy', 'n')).toBe(0);
    expect(facingToYaw('flat', 'bogus')).toBe(0);
  });

  it('FACING_YAW_OFFSET is the calibrated +90°, per docs/evidence', () => {
    expect(FACING_YAW_OFFSET).toBeCloseTo(Math.PI / 2, 12);
  });

  // Hand-computed exact radians: -deg*(PI/180) + PI/2, deg per the
  // module's own doc-commented FACING_ANGLE_DEG table. Hardcoded here,
  // not derived from anything in facingYaw.ts.
  const EXPECTED_YAW: Record<Orientation, Record<string, number>> = {
    pointy: {
      e: 1.5707963267948966,
      se: 0.5235987755982989,
      sw: -0.5235987755982987,
      w: -1.5707963267948966,
      nw: 3.665191429188092,
      ne: 2.617993877991494,
    },
    flat: {
      se: 1.0471975511965979,
      ne: 2.0943951023931953,
      n: 3.141592653589793,
      nw: 4.188790204786391,
      sw: -1.0471975511965979,
      s: 0,
    },
  };

  for (const orientation of ['pointy', 'flat'] as const) {
    for (const name of FACING_NAMES[orientation]) {
      it(`${orientation} ${name} yaws to the pinned exact radian value`, () => {
        expect(facingToYaw(orientation, name)).toBe(
          EXPECTED_YAW[orientation][name]
        );
      });
    }
  }
});
