/**
 * A CONVERSATION'S LINES, AS A CARRIER'S FORM SHOWS THEM (rpg-project#1027).
 * A carrier's `options` may hold `- use: <conversation>`: the lines written
 * once under the root `conversations:`. Where a carrier's lines are listed,
 * that entry is shown as "Lines of <conversation> (N)" with a way to the
 * Conversations page, where the lines themselves are edited.
 *
 * Provided by the studio from the engine's read-back: how many lines a
 * conversation holds is what the engine says of it, never counted here. A
 * form outside the studio gets the default, which knows no count and offers
 * no way there.
 */
import { createContext } from 'react';

export interface SharedLinesInForm {
  /** How many lines the engine says the conversation holds; undefined when
   * the read-back says nothing of it. */
  lineCount(conversation: string): number | undefined;
  /** Open the conversation on the Conversations page; absent where there is
   * no such page. */
  open?: (conversation: string) => void;
  /** The conversations the engine says this carrier carries, in the
   * engine's order, each with how many lines it holds. Absent where the
   * read-back is not at hand. */
  carriedBy?: (
    kind: 'creature' | 'prop' | 'faction',
    id: string
  ) => readonly { id: string; lines: number }[];
}

export const NO_SHARED_LINES: SharedLinesInForm = Object.freeze({
  lineCount: () => undefined,
});

export const SharedLinesContext =
  createContext<SharedLinesInForm>(NO_SHARED_LINES);
