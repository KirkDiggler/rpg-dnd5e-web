import { describe, expect, it } from 'vitest';
import { shouldTiltDeadOrDowned } from './HexEntity';

describe('shouldTiltDeadOrDowned', () => {
  // The six combinations a reviewer verified by hand on PR #594
  // (rpg-dnd5e-web#559) -- pinned here so a future change can't quietly
  // break one without a red test, the same "arithmetic, not a screenshot"
  // reasoning as facing.test.ts's constant-split parity assertions.

  it('dead + no resolved model (MediumHumanoid fallback) -> tilts', () => {
    expect(shouldTiltDeadOrDowned(true, false, false)).toBe(true);
  });

  it('dead + a resolved model (its own posed downed GLB) -> does NOT tilt', () => {
    expect(shouldTiltDeadOrDowned(true, false, true)).toBe(false);
  });

  it('downed + no resolved model (MediumHumanoid fallback) -> tilts', () => {
    expect(shouldTiltDeadOrDowned(false, true, false)).toBe(true);
  });

  it('downed + a resolved model (its own posed downed GLB) -> does NOT tilt', () => {
    expect(shouldTiltDeadOrDowned(false, true, true)).toBe(false);
  });

  it('alive (neither dead nor downed) + no resolved model -> does NOT tilt', () => {
    expect(shouldTiltDeadOrDowned(false, false, false)).toBe(false);
  });

  it('alive (neither dead nor downed) + a resolved model -> does NOT tilt', () => {
    expect(shouldTiltDeadOrDowned(false, false, true)).toBe(false);
  });

  it('both dead and downed set (should never happen on the real route, but the OR shape must not double-negate) -> tilts without a resolved model', () => {
    expect(shouldTiltDeadOrDowned(true, true, false)).toBe(true);
  });
});
