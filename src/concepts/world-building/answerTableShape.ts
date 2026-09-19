/**
 * The answer table's FILE SHAPE — carried, not graded.
 *
 * WHAT THIS IS NOW (rpg-project#481 R3). Two documents carry an `on:` block:
 * a creature's orders (`room.monsterBindings[id].on`) and a faction's shared
 * table (`factions[].on`). Both are the engine's `map[string][]AnswerSpec`.
 * This module holds one as the author wrote it, so the bytes that round-trip
 * are the bytes the compiler grades — and the compiler is what says whether
 * the file plays.
 *
 * WHAT IT WAS, AND WHY THAT CHANGED. It used to refuse an `on:` block against
 * a transcription of the engine's vocabulary: unknown trigger, word under the
 * wrong trigger, unknown band, deed with no span, selector outside the sealed
 * three, weight below one, entry with two words. Every one of those sentences
 * was the engine's, authored a second time here — a mirror, and a mirror
 * drifts. rpg-dnd5e-web#1119 was the builder refusing the only authored `on:`
 * block in the project; #1145 was a `temper` the engine takes. The failure
 * direction is always the same: the web declining a file the engine plays.
 *
 * So the verdicts are gone and `PutDungeon{validate_only}` is the verdict.
 * `answerVocabulary.ts` still declares the words — a palette offers them as
 * completions — but an offer is not a rule, and nothing here reads one.
 *
 * THE `at:` CELL IS CARRIED AS WRITTEN — `[col, row]`, the file's spelling.
 * The engine resolves an offset pair under the document's `orientation`,
 * which the single-room dialect does not carry; converting here would invent
 * a frame the file does not state.
 */

/** An `on:` block as the file wrote it: trigger key to whatever was written
 * under it. Deliberately open — the shapes inside are the engine's types
 * (`AnswerSpec`, `WhenSpec`, `SelectorSpec`), and this codec neither reads
 * nor narrows them. */
export type AnswerTableShape = Record<string, unknown>;

/**
 * One `on:` block, held as written.
 *
 * The ONE thing still checked is that the block is a mapping, because that is
 * what this document type stores it as — a value that is not one has nowhere
 * to live in the decoded document, and "can't hold it" is the only refusal
 * this module has left. `path` is kept in the signature so the refusal points
 * at the block, exactly as every other decoder's does.
 */
export function validateAnswerTable(
  value: unknown,
  path: string
): AnswerTableShape {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${path}: expected a map of trigger to entries`);
  return value as AnswerTableShape;
}
