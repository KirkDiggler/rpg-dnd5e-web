/**
 * holdingBeat — the sentences the loot/hold/drop/leave beats read as, in
 * ONE place (rpg-project#368 §4.1).
 *
 * # A verb is named by what the record will say
 *
 * That is the design's naming rule, and it is why this module exists at
 * all rather than four string templates spread across the two surfaces
 * that narrate a beat (`combatBeat.ts`'s single evolving line and
 * `story.ts`'s log). Both must say the same words about the same event,
 * and the words are the design's, not each surface's.
 *
 * Three of them are past-tense statements — "looted", "dropped", "left" —
 * because that is what the record says happened. The fourth is present
 * tense on purpose: design R10 renamed the pick-up verb from *take* to
 * **hold**, precisely because *take* is the word reserved for a thing
 * landing in a character's inventory, and this one only ever writes a
 * run-scoped `holds:` fact. So the beat reads "Aldric holds the heirloom",
 * a state, and no line this module produces ever says "took".
 *
 * # The wire still says Take
 *
 * `EVENT_KIND_TAKEN` / `Taken{taker, prop}` is what the pinned protos
 * ship (rpg-api-protos#289, generated 46db48cd) — R10 landed after that
 * merge and renames the wire in a wave-0 follow-up. This module reads the
 * `taken` body and writes the *held* sentence, which is the whole point of
 * having one module: when the wire renames, one `case` label moves and
 * every surface keeps saying exactly what it says now.
 *
 * # Nothing here is a rule
 *
 * Every fact comes off a typed event body. Ids are rendered through the
 * caller's own name resolvers, and a prop or exit id is rendered as the
 * author's own word for the thing (`heirloom` -> "the heirloom"), never
 * looked up against anything — a held prop is ABSENT from the atlas, so
 * there is nothing to look it up in (`Exited.holding`'s own doc comment).
 */
import type { Event as SessionEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';

/** How the caller spells a member id in prose. `combatBeat.ts` resolves
 * the local player as "You"/"you"; `story.ts` uses the roster name in
 * both positions. This module never chooses. */
export interface BeatNames {
  /** Sentence-initial form. */
  subject: (id: string) => string;
  /** Mid-sentence form. */
  object: (id: string) => string;
}

/**
 * An authored id as prose: hyphens and underscores become spaces, and the
 * caller adds the article. `heirloom` -> "heirloom", `vault-key` ->
 * "vault key", `front-gate` -> "front gate".
 *
 * The author's own word, unchanged apart from the separators — this is the
 * name they typed into the builder, and a beat that renamed it would be
 * describing something the file does not contain. Empty stays empty so a
 * caller can tell "no id" from "an id that renders to nothing".
 */
export function authoredWords(id: string): string {
  return id.replace(/[-_]+/g, ' ').trim();
}

/** "the heirloom", or "the heirloom and the crown" for a carrier holding
 * two. `Exited.holding` is repeated and reads as a participle — singular
 * in the sentence it makes — but a list of two must still read as English
 * rather than as a join character. */
export function holdingPhrase(ids: readonly string[]): string {
  const words = ids.map(authoredWords).filter((w) => w.length > 0);
  if (words.length === 0) return '';
  if (words.length === 1) return `the ${words[0]}`;
  const last = words[words.length - 1];
  return `${words
    .slice(0, -1)
    .map((w) => `the ${w}`)
    .join(', ')} and the ${last}`;
}

/**
 * The beat's sentence, or `null` for an event this module does not narrate.
 *
 * `exited` is narrated here rather than left to the callers because a
 * departure is now four different statements depending on two typed
 * fields, and having each surface work that out separately is how they
 * come to disagree.
 */
export function formatHoldingBeat(
  event: SessionEvent,
  names: BeatNames
): string | null {
  switch (event.body?.case) {
    case 'looted': {
      const l = event.body.value;
      // NOTHING OF WHAT MOVED (design P3, and `Looted`'s own doc comment):
      // looter and body, and the sentence is identical whether the body
      // held the way into the vault or nothing at all.
      return `${names.subject(l.looter)} looted ${names.object(l.body)}.`;
    }
    case 'taken': {
      const t = event.body.value;
      return `${names.subject(t.taker)} holds ${describe(t.prop)}.`;
    }
    case 'dropped': {
      const d = event.body.value;
      return `${names.subject(d.member)} dropped ${describe(d.prop)}.`;
    }
    case 'exited': {
      const e = event.body.value;
      const who = names.subject(e.member);
      const carried = holdingPhrase(e.holding);
      // `exit` is EMPTY for a departure from anywhere the author did not
      // name as a way out — the lobby's abandon, a disconnect, walking out
      // mid-room. Empty is the truth that no authored exit was used, not
      // "unknown", so the sentence simply does not claim one.
      if (e.exit) {
        const through = `through the ${authoredWords(e.exit)}`;
        return carried
          ? `${who} left ${through} with ${carried}.`
          : `${who} left ${through}.`;
      }
      return carried ? `${who} left with ${carried}.` : `${who} left.`;
    }
    default:
      return null;
  }
}

/** "the heirloom" — or the bare id when the author named none, which the
 * server never sends for these beats (a prop that can be picked up has to
 * be nameable) but which must still read as something rather than as "the
 * ". */
function describe(id: string): string {
  const words = authoredWords(id);
  return words ? `the ${words}` : 'it';
}

/** Who carried what out through which authored exit, or `null` for any
 * other departure.
 *
 * THE ENDING BEAT DOES NOT NAME THE CARRIER. `Ended` carries the ending
 * key and nothing else, so the only honest way to name who walked out with
 * the artifact is to remember the departure that immediately preceded it —
 * a member who left THROUGH AN AUTHORED EXIT while HOLDING something. Both
 * halves are required: a departure from elsewhere drops what it held (R9),
 * and a departure carrying nothing ends nobody's run.
 */
export function exitCarrier(
  event: SessionEvent
): { member: string; exit: string; holding: readonly string[] } | null {
  if (event.body?.case !== 'exited') return null;
  const e = event.body.value;
  if (!e.exit || e.holding.length === 0) return null;
  return { member: e.member, exit: e.exit, holding: [...e.holding] };
}
