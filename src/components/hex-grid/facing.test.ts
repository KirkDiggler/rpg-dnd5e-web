import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HEADING_BY_TYPE,
  easeHeading,
  headingFromDelta,
  MEDIUM_HUMANOID_FORWARD_OFFSET,
  shortestTurn,
  SYNTY_GLB_FORWARD_OFFSET,
  TURN_RATE_RAD_PER_SEC,
} from './facing';
import { cubeToWorld, HEX_DIRECTIONS } from './hexMath';

const deg = (r: number) => ((((r * 180) / Math.PI) % 360) + 360) % 360;
const rad = (d: number) => (d * Math.PI) / 180;

describe('headingFromDelta', () => {
  // The six hex neighbours land exactly 60 degrees apart under this
  // cubeToWorld. This is the test that pins the atan2(dx, dz) convention — a
  // Three.js object at rotation.y = t maps its local +Z to (sin t, 0, cos t),
  // so atan2(dx, dz) is that function's exact inverse.
  const EXPECTED_DEG = [90, 150, 210, 270, 330, 30];

  it.each(HEX_DIRECTIONS.map((d, i) => [i, d, EXPECTED_DEG[i]] as const))(
    'hex direction %i has heading %s deg',
    (_i, dir, expected) => {
      const w = cubeToWorld(dir, 1);
      expect(deg(headingFromDelta(w.x, w.z)!)).toBeCloseTo(expected, 6);
    }
  );

  it('returns undefined for a zero-length delta', () => {
    // The rpg-api#656 degenerate same-hex "move" produces exactly this.
    // atan2(0, 0) would return a misleading 0 (due north); undefined lets
    // the caller hold its current heading instead of snapping.
    expect(headingFromDelta(0, 0)).toBeUndefined();
  });
});

describe('shortestTurn', () => {
  it('takes the short way across the wrap boundary', () => {
    expect(deg(shortestTurn(rad(350), rad(10)))).toBeCloseTo(20, 6);
  });

  it('turns negative when the short way is clockwise', () => {
    expect((shortestTurn(rad(10), rad(350)) * 180) / Math.PI).toBeCloseTo(
      -20,
      6
    );
  });

  it('is zero when already facing the target', () => {
    expect(shortestTurn(rad(42), rad(42))).toBe(0);
  });

  it('pins the exact-180 tie-break to +PI regardless of input sign', () => {
    // A full reversal (walk east, then west) is a common real path and sits
    // exactly on the boundary where +PI and -PI are equally short. Either is
    // visually fine, but an unpinned tie-break is a coin flip that makes turn
    // direction non-deterministic across runs.
    expect(shortestTurn(0, Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(shortestTurn(Math.PI, 0)).toBeCloseTo(Math.PI, 12);
  });
});

describe('easeHeading', () => {
  it('steps toward the target at no more than turnRate * delta', () => {
    expect(easeHeading(0, Math.PI, 0.1, 8)).toBeCloseTo(0.8, 6);
  });

  it('lands exactly on the target rather than overshooting', () => {
    // Must be === target, not approximately: useEntityFacing stops its
    // invalidate loop on an exact current === target comparison.
    expect(easeHeading(0, 0.5, 1, 8)).toBe(0.5);
  });

  it('is a no-op when already at the target', () => {
    expect(easeHeading(1.25, 1.25, 0.016, 8)).toBe(1.25);
  });

  it('eases the short way across the wrap boundary', () => {
    const next = easeHeading(rad(350), rad(10), 0.01, 8);
    expect(deg(next)).toBeCloseTo(354.58, 1);
  });

  it('resolves a 180 degree reversal inside one hex step', () => {
    // SECONDS_PER_HEX_STEP is 0.45; PI / 8 = 0.393s.
    expect(Math.PI / TURN_RATE_RAD_PER_SEC).toBeLessThan(0.45);
  });
});

describe('constant split reproduces the pre-#590 hardcoded values', () => {
  // The visual-parity gate, as arithmetic. Before #590 the two call sites in
  // HexEntity were literally:
  //
  //   MediumHumanoid:      facingRotation={type === 'player' ? Math.PI : 0}
  //   ClassCharacterModel: facingRotation={Math.PI}
  //
  // Splitting one fused constant into two composed terms can silently cancel
  // to 2*PI (no rotation) or double. These assertions pin the composition to
  // the old values so a future edit to either term cannot quietly drift the
  // rendered pose.
  const norm = (r: number) =>
    ((r % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  it('player on MediumHumanoid still composes to PI', () => {
    expect(
      norm(DEFAULT_HEADING_BY_TYPE.player + MEDIUM_HUMANOID_FORWARD_OFFSET)
    ).toBeCloseTo(Math.PI, 12);
  });

  it('monster on MediumHumanoid still composes to 0', () => {
    expect(
      norm(DEFAULT_HEADING_BY_TYPE.monster + MEDIUM_HUMANOID_FORWARD_OFFSET)
    ).toBeCloseTo(0, 12);
  });

  it('player on a Synty class GLB still composes to PI', () => {
    expect(
      norm(DEFAULT_HEADING_BY_TYPE.player + SYNTY_GLB_FORWARD_OFFSET)
    ).toBeCloseTo(Math.PI, 12);
  });

  it('measured forward offsets are zero because both rigs are +Z-forward', () => {
    // Recorded as an assertion, not just a comment: this is the MEASURED
    // finding (see the constants' doc comment). If a future model family
    // arrives with a different convention it gets its own constant rather
    // than these changing.
    expect(SYNTY_GLB_FORWARD_OFFSET).toBe(0);
    expect(MEDIUM_HUMANOID_FORWARD_OFFSET).toBe(0);
  });

  it('a heading of 0 points along world +Z, matching the rigs', () => {
    // Ties the convention to the measurement: headingFromDelta(0, 1) is the
    // direction the calibration capture showed both rigs facing at rotation 0.
    expect(headingFromDelta(0, 1)).toBe(0);
  });
});

describe('easeHeading with a modulo-2PI-equivalent target (Copilot review, #592)', () => {
  it('settles ON the target rather than returning a co-terminal current', () => {
    // shortestTurn(2PI, 0) is 0 -- the two headings point the same way. But
    // returning `current` there leaves current !== target forever, and
    // useEntityFacing's settle check is exact equality, so it would invalidate
    // every frame in perpetuity under frameloop="demand".
    expect(easeHeading(2 * Math.PI, 0, 0.016, 8)).toBe(0);
  });

  it('settles for a negative co-terminal pair too', () => {
    expect(easeHeading(-2 * Math.PI, 0, 0.016, 8)).toBe(0);
  });
});
