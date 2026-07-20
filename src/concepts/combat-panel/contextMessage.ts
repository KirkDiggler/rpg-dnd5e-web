/**
 * contextMessage — the teaching-strip message source shared by every
 * combat-panel composition (#533 direction): "what is the game waiting
 * for?", in words, driven purely by the same server-given state the bar
 * renders. Extracted in round 4 so compositions B/C/D/E share one source.
 */

import type { CombatPanelFixture } from './fixtures';

export type StripTone = 'action' | 'info' | 'quiet';

export function contextMessage(
  fixture: CombatPanelFixture,
  armedKey: string | undefined,
  armedLabel: string | undefined
): { text: string; tone: StripTone } {
  if (armedKey) {
    return {
      text: `${armedLabel ?? 'Action'} armed — click a target on the map. Esc or click again to cancel.`,
      tone: 'action',
    };
  }
  if (fixture.mode === 'FREE_ROAM') {
    return {
      text: 'Exploring — click the map to move. Combat will start when enemies appear.',
      tone: 'quiet',
    };
  }
  if (!fixture.isMyTurn) {
    return {
      text: `${fixture.activeName}'s turn — watch the map.`,
      tone: 'info',
    };
  }
  return { text: 'Your turn — pick an action.', tone: 'action' };
}

/**
 * Round 6 (Kirk: "'your turn — pick an action' is vertical space we do not
 * need to take up"): the pill variant returns NULL for the plain your-turn
 * state — enabled verbs + the green initiative highlight already say it.
 * Teaching appears when needed (armed / spectator / free-roam / ended /
 * nothing-left / connecting), never as standing furniture (#533).
 */
export function pillMessage(
  fixture: CombatPanelFixture,
  armedKey: string | undefined,
  armedLabel: string | undefined
): { text: string; tone: StripTone } | null {
  const msg = contextMessage(fixture, armedKey, armedLabel);
  if (
    fixture.isMyTurn &&
    fixture.mode === 'TURN_BASED' &&
    armedKey === undefined
  ) {
    return null;
  }
  return msg;
}
