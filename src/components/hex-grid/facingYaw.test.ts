/**
 * Two independent discriminators, matching `facingYaw.ts`'s own doc
 * comment split:
 *
 * 1. `facingAngleDeg` against a hand-written compass table — the pixel
 *    formula (rpg-toolkit#1150's discipline), not a round-trip through
 *    the module's own internals. Since rpg-project#272 the vocabulary
 *    is true compass in WORLD space: eight names, 45° apart, the same
 *    under both hex orientations — so unlike the #261 version of this
 *    file there is no hex-neighbor formula to pin against; the compass
 *    itself is the specification, and the deliberate diagonal
 *    redefinition (pointy `ne` used to mean the 30°/-60° hex edge) gets
 *    its own named pin below so it can never drift back silently.
 * 2. `facingToYaw` against hand-computed, hardcoded radian values (not
 *    derived by calling anything in `facingYaw.ts`) — pinning the
 *    calibrated `FACING_YAW_OFFSET` as well as the geometry, so an
 *    accidental change to either fails a specific, named case.
 */
import { describe, expect, it } from 'vitest';
import {
  FACING_NAMES,
  FACING_YAW_OFFSET,
  facingAngleDeg,
  facingToYaw,
  isValidFacing,
} from './facingYaw';

// The compass, by hand: table-angle degrees in the (x, z) convention
// (0 = +X = east, 90 = +Z = screen-south). Written out independently of
// the module's own table.
const COMPASS_DEG: Record<string, number> = {
  e: 0,
  se: 45,
  s: 90,
  sw: 135,
  w: 180,
  nw: -135,
  n: -90,
  ne: -45,
};

describe('facingAngleDeg', () => {
  it('names all eight compass directions, in rose order', () => {
    expect([...FACING_NAMES]).toEqual([
      'n',
      'ne',
      'e',
      'se',
      's',
      'sw',
      'w',
      'nw',
    ]);
  });

  for (const name of Object.keys(COMPASS_DEG)) {
    it(`${name} is the true-compass ${COMPASS_DEG[name]}°`, () => {
      expect(facingAngleDeg(name)).toBe(COMPASS_DEG[name]);
    });
  }

  it('ne is 45° true compass, NOT the 60° hex edge — the rpg-project#272 redefinition, pinned so it cannot drift back', () => {
    // #261's pointy-top `ne` named the hex EDGE direction (-60°); the
    // compass names the world diagonal. Same word, new meaning, by
    // ruling.
    expect(facingAngleDeg('ne')).toBe(-45);
    expect(facingAngleDeg('se')).toBe(45);
  });

  it('is undefined for a word outside the compass', () => {
    expect(facingAngleDeg('north')).toBeUndefined();
    expect(facingAngleDeg('')).toBeUndefined();
    expect(facingAngleDeg('NE')).toBeUndefined();
  });

  it('is undefined for an inherited Object.prototype key, not that member (Copilot review, PR #795)', () => {
    expect(facingAngleDeg('constructor')).toBeUndefined();
    expect(facingAngleDeg('toString')).toBeUndefined();
    expect(facingAngleDeg('hasOwnProperty')).toBeUndefined();
  });
});

describe('isValidFacing', () => {
  it('accepts exactly the eight compass names', () => {
    for (const name of FACING_NAMES) {
      expect(isValidFacing(name)).toBe(true);
    }
    expect(isValidFacing('')).toBe(false);
    expect(isValidFacing('north')).toBe(false);
  });
});

describe('facingToYaw', () => {
  it('is 0 for an absent or unrecognized facing — the asset default', () => {
    expect(facingToYaw('')).toBe(0);
    expect(facingToYaw('north')).toBe(0);
    expect(facingToYaw('bogus')).toBe(0);
  });

  it('is 0, not NaN, for an inherited Object.prototype key (Copilot review, PR #795)', () => {
    expect(facingToYaw('constructor')).toBe(0);
  });

  it('FACING_YAW_OFFSET is the calibrated +90°, per docs/evidence', () => {
    expect(FACING_YAW_OFFSET).toBeCloseTo(Math.PI / 2, 12);
  });

  // Hand-computed exact radians: -deg*(PI/180) + PI/2, deg per the
  // compass table above. Hardcoded here, not derived from anything in
  // facingYaw.ts. ONE set — there is deliberately no per-orientation
  // variant left to enumerate.
  const EXPECTED_YAW: Record<string, number> = {
    e: 1.5707963267948966,
    se: 0.7853981633974483,
    s: 0,
    sw: -0.7853981633974483,
    w: -1.5707963267948966,
    nw: 3.9269908169872414,
    n: 3.141592653589793,
    ne: 2.356194490192345,
  };

  for (const name of Object.keys(EXPECTED_YAW)) {
    it(`${name} yaws to the pinned exact radian value`, () => {
      expect(facingToYaw(name)).toBe(EXPECTED_YAW[name]);
    });
  }
});
