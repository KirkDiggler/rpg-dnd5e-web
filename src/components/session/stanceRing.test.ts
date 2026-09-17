/**
 * The believed-stance ring (rpg-project#458).
 *
 * BOTH BRANCHES RUN NOW. The session seam carries a per-viewer stance, so a
 * creature in a faction answers "hostile", "neutral" or "allied" and gets a
 * stance colour, while a creature the run cannot place — one in NO FACTION at
 * all, which a world NPC is — answers empty and falls back to the roster's
 * faction colour.
 *
 * The empty case is the one worth being careful about: empty is the wire's own
 * "no word for it" and NOT a synonym for neutral. Resolving it into one would
 * draw a confident ring around a creature whose side is simply unknown.
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
    // A CREATURE IN NO FACTION, which a world NPC is. The wire says empty
    // means this observer holds no belief, a DIFFERENT CLAIM from "neutral":
    // resolving it into one would paint a creature whose side is unknown with
    // a stance nobody asserted.
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

/**
 * The front room's own ring, as walk check 4 is now defined (rpg-project#458):
 * the goblin shows NEUTRAL and the bandits HOSTILE for the viewing player, and
 * a creature in no faction shows the roster fallback with an empty stance.
 *
 * THE FLIP IS NOT PART OF IT. No predicate turns a pair allied — the hold-out's
 * own ruling, which `encounter.StanceAllied` states in its doc — so the goblin
 * is authored static-neutral and the fact it teaches changes no stance. The
 * check is that the ring reads the world correctly, not that it changes.
 */
describe('the front room ring', () => {
  it('gives the neutral goblin and the hostile bandits different rings', () => {
    // The whole scene in one assertion: a player looking at the front room
    // must be able to tell, without clicking anything, that the creature in
    // the doorway is not the same kind of problem as the two down the hall.
    const goblin = stanceRingColor(STANCE_NEUTRAL);
    const bandit = stanceRingColor(STANCE_HOSTILE);
    expect(goblin).not.toBeNull();
    expect(bandit).not.toBeNull();
    expect(goblin).not.toBe(bandit);
  });

  it('draws the bandits in the map’s own enemy red', () => {
    // A hostile belief must not introduce a colour a player has to learn: the
    // bandits look like every other enemy on the map.
    expect(stanceRingColor(STANCE_HOSTILE)).toBe('#e53e3e');
  });

  it('falls back for a creature the run cannot place', () => {
    // A world NPC is in no faction, so the seam sends no word and the caller
    // keeps the roster's faction colour. This is the branch that must NOT
    // become "neutral" just because neutral is the friendly-looking default.
    expect(stanceRingColor('')).toBeNull();
    expect(stanceRingColor('')).not.toBe(stanceRingColor(STANCE_NEUTRAL));
  });
});
