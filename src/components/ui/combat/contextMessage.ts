/**
 * contextMessage / pillMessage — the single source for "what is the game
 * waiting for?", in words, driven purely by server-given state (#533).
 *
 * Promoted from the /concepts combat-panel rounds in #525 slice 2 (the same
 * one-seam move organizeVerbs made in slice 1): the LIVE dock and the
 * concept compositions both read from here, so the message logic cannot
 * drift between them. The concept adapts its fixture shape to ContextInput.
 *
 * contextMessage returns a message for EVERY state — it feeds the hidden
 * aria-live announcement stream. pillMessage is the round-6 visual variant
 * (Kirk: "'your turn — pick an action' is vertical space we do not need to
 * take up"): it returns null for the plain your-turn state — enabled verbs
 * + the green initiative highlight already say it — so teaching appears
 * when needed, never as standing furniture.
 */

import { EncounterMode } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';

export type MessageTone = 'action' | 'info' | 'quiet';

export interface ContextInput {
  /** Server mode verbatim. */
  mode: EncounterMode;
  /** encounterStatus === 'ended' — wins over everything (an encounter can
   * end ON your turn: mode stays TURN_BASED, activeEntityId stays you). */
  encounterEnded: boolean;
  /** TURN_BASED && activeEntityId === you. */
  isMyTurn: boolean;
  /** Display name of the active entity when it isn't you (#458). */
  activeEntityName: string | undefined;
  /** Display name of the armed action, if any (#511/#514). */
  armedLabel: string | undefined;
  /** Server's menu offers nothing currently usable — computed ONLY from
   * `available` flags (the #552 gate: the same signal the buttons disable
   * on, so the message can never contradict a clickable verb). */
  noneUsable: boolean;
  /** movementRemaining > 0 — the #545 "you can still move" variant. */
  canStillMove: boolean;
}

export function contextMessage(input: ContextInput): {
  text: string;
  tone: MessageTone;
} {
  const {
    mode,
    encounterEnded,
    isMyTurn,
    activeEntityName,
    armedLabel,
    noneUsable,
    canStillMove,
  } = input;
  // Ended wins over everything — an honest neutral line, not a
  // victory/defeat screen (that's web#471).
  if (encounterEnded) {
    return { text: 'The encounter has ended.', tone: 'quiet' };
  }
  // Armed guidance is turn-gated: on the handover frame armedLabel can
  // still be set for a paint before it clears (#544), so don't flash
  // "click a target" once it's no longer your turn.
  if (armedLabel && mode === EncounterMode.TURN_BASED && isMyTurn) {
    return {
      text: `${armedLabel} armed — click a target on the map. Esc or click again to cancel.`,
      tone: 'action',
    };
  }
  // Exploring copy is FREE_ROAM-specific — mode is UNSPECIFIED during the
  // initial connect/reconnect window, and loading straight into active
  // combat must not briefly read "Exploring."
  if (mode === EncounterMode.FREE_ROAM) {
    return {
      text: 'Exploring — click the map to move. Combat will start when enemies appear.',
      tone: 'quiet',
    };
  }
  if (mode !== EncounterMode.TURN_BASED) {
    // UNSPECIFIED (and any future non-combat mode): neutral, no false claim.
    return { text: 'Connecting…', tone: 'quiet' };
  }
  if (!isMyTurn) {
    return {
      text: activeEntityName
        ? `${activeEntityName}'s turn — watch the map.`
        : 'Waiting for the next turn…',
      tone: 'info',
    };
  }
  // rpg-dnd5e-web#545: when the server's menu offers nothing currently
  // usable (live repro: api#637's all-zero economy disabled every verb
  // while the strip still said "pick an action"), guide the only real
  // moves instead of lying. Affordability is read purely off the wire —
  // never inferred.
  if (noneUsable) {
    return canStillMove
      ? { text: 'You can still move — or End Turn.', tone: 'action' }
      : { text: 'Nothing left to do — End Turn.', tone: 'action' };
  }
  return { text: 'Your turn — pick an action.', tone: 'action' };
}

/**
 * The round-6 visual variant: null for the plain your-turn state (nothing
 * armed, something usable) — the pill only appears when it has something
 * non-obvious to say. Every OTHER contextMessage state passes through,
 * including the #545 nothing-left/can-still-move guidance.
 */
export function pillMessage(input: ContextInput): {
  text: string;
  tone: MessageTone;
} | null {
  if (
    !input.encounterEnded &&
    input.mode === EncounterMode.TURN_BASED &&
    input.isMyTurn &&
    !input.armedLabel &&
    !input.noneUsable
  ) {
    return null;
  }
  return contextMessage(input);
}
