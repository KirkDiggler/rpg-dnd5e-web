/**
 * The believed-stance ring (rpg-project#458).
 *
 * WHAT THIS PINS IS THE FALLBACK, not the colours. Every sighting is empty at
 * these pins — the session seam carries no believed stance yet — so the branch
 * that actually runs on Kirk's walk is the null one, and the ring keeps the
 * roster faction colour it has always had. A test that only checked the three
 * words would be green against a build that broke the only path in use.
 */
import { describe, expect, it } from 'vitest';
import {
  STANCE_ALLIED,
  STANCE_COLORS,
  STANCE_HOSTILE,
  STANCE_NEUTRAL,
  stanceRingColor,
} from './stanceRing';

describe('stanceRingColor', () => {
  it('answers null for an empty word, so the caller keeps the faction colour', () => {
    // THE PATH IN USE TODAY. The wire says empty means this observer holds no
    // belief, which is a DIFFERENT CLAIM from "neutral": resolving it into one
    // would paint every creature in the game with a stance nobody asserted.
    expect(stanceRingColor('')).toBeNull();
  });

  it('answers null for a word this build does not know', () => {
    // The vocabulary is the AUTHOR'S and a later slice may add to it. A client
    // that guessed would paint a ring in a colour meaning something it
    // invented, which is worse than falling back to a colour that is at least
    // true about the roster.
    expect(stanceRingColor('pretending')).toBeNull();
    expect(stanceRingColor('HOSTILE')).toBeNull();
  });

  it('gives each of the three authored stances its own colour', () => {
    expect(stanceRingColor(STANCE_HOSTILE)).toBe(STANCE_COLORS[STANCE_HOSTILE]);
    expect(stanceRingColor(STANCE_NEUTRAL)).toBe(STANCE_COLORS[STANCE_NEUTRAL]);
    expect(stanceRingColor(STANCE_ALLIED)).toBe(STANCE_COLORS[STANCE_ALLIED]);

    const distinct = new Set([
      stanceRingColor(STANCE_HOSTILE),
      stanceRingColor(STANCE_NEUTRAL),
      stanceRingColor(STANCE_ALLIED),
    ]);
    expect(
      distinct.size,
      'three stances a player must tell apart at a glance'
    ).toBe(3);
  });

  it('keeps the map’s own enemy red and friend blue', () => {
    // A believed stance must not introduce a colour the player has to learn:
    // a creature believed hostile looks like every other enemy on the map, and
    // one believed allied like a friend. Those two hexes are HexEntity's own.
    expect(stanceRingColor(STANCE_HOSTILE)).toBe('#e53e3e');
    expect(stanceRingColor(STANCE_ALLIED)).toBe('#3182ce');
  });
});
