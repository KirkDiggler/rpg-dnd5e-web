/**
 * How a finished run is worded — a pure table, so what the player is told can
 * be tested without mounting a scene.
 *
 * Kirk walked into the old shape and ruled it out (rpg-dnd5e-web#999): "a
 * toast we won or we lost is sufficient". This is the "won or we lost" half.
 */

import { EndingResult } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { authoredWords } from './holdingBeat';

/** How long the ending toast stands before it fades out of the way. */
export const RUN_ENDED_TOAST_MS = 12000;

/**
 * WON, LOST, OR NEITHER — read off the ending the server named and never
 * guessed. `boss-down` and `party_defeated` are the two endings that decide a
 * run. Withdrawing and abandoning decide nothing, and an ending this client
 * has never heard of decides less: those keep a plain sentence rather than
 * being called a loss because they were not a win.
 */
export function runOutcome(
  ending: string,
  result: EndingResult = EndingResult.UNSPECIFIED
): 'won' | 'lost' | undefined {
  // The result the ending itself declares (rpg-project#733) is the answer
  // whenever the server sends one; the name table below is only for the
  // endings that predate declared results.
  if (result === EndingResult.SUCCESS) return 'won';
  if (result === EndingResult.FAILURE) return 'lost';
  if (ending === 'boss-down') return 'won';
  if (ending === 'party_defeated') return 'lost';
  return undefined;
}

export function runEndedHeadline(
  ending: string,
  result: EndingResult = EndingResult.UNSPECIFIED
): string {
  const outcome = runOutcome(ending, result);
  if (outcome === 'won') return 'You won';
  if (outcome === 'lost') return 'You lost';
  return 'The run has ended';
}

/**
 * The sentence under the headline, in the provider's own ending vocabulary.
 *
 * `party_defeated` HAD NO ROW HERE AT ALL until #999, so the one ending a
 * player most wants named — the party going down — read "The run has ended."
 */
export function endingDetail(ending: string): string {
  switch (ending) {
    case 'boss-down':
      return 'The tomb is cleared.';
    case 'party_defeated':
      return 'The party fell.';
    case 'withdrawn':
      return 'The party withdrew.';
    case 'abandoned':
      return 'The run was abandoned.';
    default:
      return 'The encounter is over — the outcome is recorded.';
  }
}

/** The declared result's own word, or nothing when the ending states none. */
export function endingResultWord(
  result: EndingResult
): 'success' | 'failure' | undefined {
  if (result === EndingResult.SUCCESS) return 'success';
  if (result === EndingResult.FAILURE) return 'failure';
  return undefined;
}

/**
 * "captain slain — success": which ending fired and what it meant, both read
 * off the ended entry (rpg-project#733). NOTHING when the ending declares no
 * result: a run recorded before results existed shows no result rather than
 * a guessed one.
 */
export function endingResultLine(
  ending: string,
  result: EndingResult
): string | undefined {
  const word = endingResultWord(result);
  if (!word || !ending) return undefined;
  return `${authoredWords(ending)} — ${word}`;
}
