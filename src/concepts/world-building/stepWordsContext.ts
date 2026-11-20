/**
 * WHAT A CONVERSATION'S STEP DOES, AS A LINE'S FORM OFFERS IT
 * (rpg-project#1033). A line advances a conversation by a beat; the form's
 * step choice says, beside each beat, the states it moves the conversation
 * from and to.
 *
 * Provided by the studio from the engine's read-back (each
 * `conversation.transition` statement, at its engine-named path). A form
 * outside the studio gets the default, which knows no steps and offers the
 * beats by name alone.
 */
import { createContext } from 'react';

/** One beat's moves: from each state it is heard in, to the state it
 * moves the conversation to. */
export interface ConversationStep {
  beat: string;
  moves: readonly { from: string; to: string }[];
  /** The engine's sentences for the beat's moves. */
  sentences: readonly string[];
}

export interface StepWords {
  /** The steps the engine says the conversation takes, by beat; undefined
   * when the read-back says nothing of it. */
  stepsOf(conversation: string): readonly ConversationStep[] | undefined;
}

export const NO_STEP_WORDS: StepWords = Object.freeze({
  stepsOf: () => undefined,
});

export const StepWordsContext = createContext<StepWords>(NO_STEP_WORDS);

/** A beat's moves in words: "fresh → warned-troupe; warned-guest →
 * arrested", the states that move to one state joined. */
export function movesInWords(step: ConversationStep): string {
  const to = new Map<string, string[]>();
  for (const move of step.moves)
    to.set(move.to, [...(to.get(move.to) ?? []), move.from]);
  return [...to.entries()]
    .map(([target, from]) => `${from.join(' or ')} → ${target}`)
    .join('; ');
}
