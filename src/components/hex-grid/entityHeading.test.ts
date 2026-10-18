// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { movePathHeadingSink, seedHeading, seenHeading } from './entityHeading';
import { DEFAULT_HEADING_BY_TYPE, headingFromDelta } from './facing';
import { degreesToYaw } from './facingYaw';

// East in the character heading convention: the heading a move toward +X
// reports. Derived from the movement side, not from degreesToYaw, so the
// wire and the move path are checked against each other.
const EAST = headingFromDelta(1, 0)!;

describe('the wire facing is the gate (rpg-project#582)', () => {
  it('with seen.facingDegrees 90 the requested heading is east and the move path is ignored', () => {
    const requestHeading = vi.fn();
    expect(seenHeading(90)).toBeCloseTo(EAST, 12);
    expect(seedHeading(90, 'monster')).toBeCloseTo(EAST, 12);
    expect(movePathHeadingSink(90, requestHeading)).toBeUndefined();
  });

  it('a facing of 0 is north, a real facing, not absence', () => {
    const requestHeading = vi.fn();
    expect(seenHeading(0)).toBeCloseTo(headingFromDelta(0, -1)!, 12);
    expect(movePathHeadingSink(0, requestHeading)).toBeUndefined();
  });

  it('with no facing the move path heading is used and the staging pose seeds', () => {
    const requestHeading = vi.fn();
    expect(seenHeading(undefined)).toBeUndefined();
    expect(movePathHeadingSink(undefined, requestHeading)).toBe(requestHeading);
    expect(seedHeading(undefined, 'player')).toBe(
      DEFAULT_HEADING_BY_TYPE.player
    );
    expect(seedHeading(undefined, 'monster')).toBe(
      DEFAULT_HEADING_BY_TYPE.monster
    );
    expect(seedHeading(undefined, 'obstacle')).toBe(0);
  });

  it('a non-finite facing reads as absent, never a NaN rotation', () => {
    const requestHeading = vi.fn();
    expect(seenHeading(Number.NaN)).toBeUndefined();
    expect(movePathHeadingSink(Number.NaN, requestHeading)).toBe(
      requestHeading
    );
  });
});

// The plan's open item "an unset authored facing is a rules bearing of 180":
// the wire states 180 for an entity nobody turned, so the web's own default
// must be that same heading, or a peer and an undescribed entity disagree
// before anyone moves.
describe('the web default agrees with the wire on an unset facing', () => {
  it('a monster seeds at the rules bearing 180', () => {
    expect(DEFAULT_HEADING_BY_TYPE.monster).toBe(degreesToYaw(180));
  });
});
