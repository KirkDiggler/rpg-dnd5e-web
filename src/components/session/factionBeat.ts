/**
 * factionBeat — the sentences the stance and arrival beats read as, and
 * the fight-ended sentence by cause, in ONE place (rpg-project#375 §5,
 * §7) — `holdingBeat.ts`'s rule applied to the hold-out's two beats: both
 * surfaces that narrate (the beat line and the Story log) say the same
 * words about the same event, and the words are the design's.
 *
 * # Nothing here is a rule, and nothing here is a name
 *
 * A stance change names two FACTIONS and a word, never a member — which
 * member carried what to whom is knowledge, per-member by law, and never
 * rides this beat (`StanceChanged`'s own doc comment). An arrival names a
 * PLACEMENT the roster does not list yet (the re-pull follows the beat),
 * so the only honest spelling is the author's own id, rendered the way
 * `holdingBeat.ts` renders a prop: hyphens to spaces, an article in front.
 * Faction ids are content the same way — `goblins` is what the author
 * typed, and `party` and `monsters` are the two the rulebook reserves.
 */
import type { Event as SessionEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  DissolveKind,
  PlacementKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { authoredWords } from './holdingBeat';

/** "the goblins", "the party" — a side as prose. Empty stays empty. */
export function sidePhrase(id: string): string {
  const words = authoredWords(id);
  return words ? `the ${words}` : '';
}

/** "the goblins and the party" — the pair, in the order the beat carries
 * it (it is unordered in meaning; this module does not sort it either). A
 * beat with one name reads as that name; with none, as "the two sides". */
export function pairPhrase(between: readonly string[]): string {
  const sides = between.map(sidePhrase).filter((s) => s.length > 0);
  if (sides.length === 0) return 'the two sides';
  if (sides.length === 1) return sides[0];
  return `${sides.slice(0, -1).join(', ')} and ${sides[sides.length - 1]}`;
}

const capitalize = (s: string): string =>
  s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);

/**
 * The beat's sentence, or `null` for an event this module does not narrate.
 *
 * The stance word is the FILE'S (design §2's closed vocabulary), carried as
 * the author wrote it rather than an enum; the three the file allows get
 * their own sentence and any other word is read back verbatim, so a
 * rulebook that grows a fourth stance narrates rather than falls silent.
 */
export function formatFactionBeat(event: SessionEvent): string | null {
  switch (event.body?.case) {
    case 'stanceChanged': {
      const s = event.body.value;
      const pair = capitalize(pairPhrase(s.between));
      switch (s.stance) {
        case 'neutral':
          // R2: the flip lands on "not hostile", and that is what it says.
          return `${pair} are no longer hostile.`;
        case 'allied':
          return `${pair} are now allies.`;
        case 'hostile':
          return `${pair} are now hostile.`;
        default:
          return `${pair} now stand ${s.stance}.`;
      }
    }
    case 'arrived': {
      const a = event.body.value;
      const words = authoredWords(a.id);
      const thing = capitalize(words ? `the ${words}` : 'something');
      const where = a.cell ? ` at ${a.cell.x},${a.cell.y}` : '';
      // A monster ARRIVES — it walked in — and a prop APPEARS: the letter
      // that turns up at round 6 was not carried by anyone the run knows.
      return a.kind === PlacementKind.PROP
        ? `${thing} appears${where}.`
        : `${thing} arrives${where}.`;
    }
    default:
      return null;
  }
}

/** The fight-ended sentence, by cause. BY_STANCE is the hold-out's own
 * (R1): the sides stopped being hostile, so there was nothing left to
 * fight about — a different ending from a side running out of members,
 * and said differently. Every other cause keeps the sentence it had. */
export function dissolveSentence(cause: DissolveKind): string {
  return cause === DissolveKind.BY_STANCE
    ? 'The fight dissolves — the sides are no longer hostile.'
    : 'The fight is over.';
}
