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
