/**
 * holdingBeat — the authored words a holding is told in (rpg-project#368
 * §4.1), and who carried what out through an exit.
 *
 * The v1 beat sentences that lived here ("Aldric looted the skeleton
 * captain") left with the v1 stream (rpg-dnd5e-web#1305); the act stream's
 * describer (`combat-experience/describeAct.ts`) tells loot, hold, drop and
 * leave now, with these words.
 *
 * Nothing here is a rule: a prop or exit id is rendered as the author's own
 * word for the thing (`heirloom` -> "the heirloom"), never looked up — a
 * held prop is ABSENT from the atlas, so there is nothing to look it up in.
 */
import {
  ClockMark,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';

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
export function exitCarrierFromAct(
  act: Act
): { member: string; exit: string; holding: readonly string[] } | null {
  if (act.body.case !== 'clock' || act.body.value.mark !== ClockMark.EXITED) {
    return null;
  }
  const d = act.body.value.departure;
  if (!d?.member?.id || !d.exit || d.holding.length === 0) return null;
  return { member: d.member.id, exit: d.exit, holding: [...d.holding] };
}
