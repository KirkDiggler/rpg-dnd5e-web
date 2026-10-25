/**
 * entryText — one answer row as a summary line, shared by every readout of a
 * table (SitePolicies, TablesPanel, BundlesPanel). Its own module so the
 * component files export components only.
 */
import { answerWhenLegalOn } from '@/author/answerVocabulary';
import { isUseEntry, type AnswerEntryShape } from './answerTableShape';
import { whenShorthand, wordShorthand } from './answerVocabulary';
import { groupLineText } from './bundles';
import { entryWord } from './sitePolicyEdits';

/** One entry: its condition — WHEN it is on the table at all, said only where
 * a condition is a thing this grammar has — its weight (an omitted weight IS 1
 * to the engine), the `say` that goes with it, and the one word it does.
 *
 * THE CONDITION LEAD IS `time`-ONLY, so the trigger is a parameter rather than
 * something this function can work out for itself. On a `time` row, no `when`
 * honestly means "always eligible" and the line says so. On a SOCIAL row
 * `when` is ILLEGAL — the verdict IS the condition, `answerWhenRefusal`'s own
 * sentence being "a `when` under it asks when a thing that just happened
 * happened" — so labelling one "any time" asserts a timing the row does not
 * have: that same falsehood from the other side. Social rows carry no
 * condition lead at all.
 *
 * FOUND IN REVIEW (independent-gate): the first cut printed "any time" on
 * every row, social included, and a test locked the mislabel in. */
export function entryText(entry: AnswerEntryShape, trigger: string): string {
  // A GROUP READS AS ITS ONE LINE (rpg-project#670): the bundle, its
  // parameters, its share and the word it counts as.
  if (isUseEntry(entry))
    return entry.when === undefined
      ? groupLineText(entry)
      : `${groupLineText(entry)} · when ${whenShorthand(entry.when)}`;
  const parts: string[] = [];
  if (answerWhenLegalOn(trigger)) {
    parts.push(
      entry.when === undefined
        ? 'any time'
        : `when ${whenShorthand(entry.when)}`
    );
  }
  parts.push(`weight ${entry.weight ?? 1}`);
  if (entry.say !== undefined) parts.push(`say “${entry.say}”`);
  const word = entryWord(entry);
  if (word !== undefined) parts.push(wordShorthand(entry, word));
  return parts.join(' · ');
}
