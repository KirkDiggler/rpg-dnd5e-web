/**
 * relocateLine — the words for a member set down somewhere without walking,
 * and for an arrest (rpg-project#925).
 *
 * THE MESSAGE DECIDES, THE CLIENT ONLY WORDS IT. A `RelocateAct` carries only
 * the end this viewer perceived:
 *
 * - the viewer's own character (mover == viewer, never keyed on `words`):
 *   the authored `words` verbatim, "You are taken to the cells.";
 * - someone else's: the `cause` worded by a small table, with a generic
 *   fallback. LEFT never names, or hints at, a destination: no `to` is ever
 *   read for it, even if a server sent one.
 *
 * An `ArrestAct` names who was taken as this viewer perceived them taken,
 * and never who is wanted (the wire has no field for that).
 */
import {
  RelocateEnd,
  type ArrestAct,
  type Party,
  type RelocateAct,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';

/** Sentences by cause ref, per end; `{name}` is the mover. */
const CAUSE_SENTENCES: Readonly<
  Record<string, Readonly<Record<'left' | 'arrived' | 'both', string>>>
> = {
  'dnd5e:consequences:arrest': {
    left: '{name} is led away under arrest.',
    arrived: '{name} is brought in under arrest.',
    both: '{name} is led away under arrest.',
  },
  // A line's own way through (rpg-project#958, encounter passage.go
  // `relocateCause`): the tunnel names no place, and neither does this.
  'dnd5e:consequences:relocate': {
    left: '{name} slips away.',
    arrived: '{name} appears.',
    both: '{name} slips away.',
  },
};

/** The generic wording for a cause the table does not know. */
const FALLBACK = {
  left: '{name} is led away.',
  arrived: '{name} is brought in.',
  both: '{name} is led away.',
} as const;

/** The log row's tag: an arrest's relocation is "Taken"; any other way of
 * being set down (a passage, rpg-project#958) is "Moved". */
export function relocateEyebrow(relocate: RelocateAct): string {
  return relocate.cause === 'dnd5e:consequences:arrest' ? 'Taken' : 'Moved';
}

/** Which end this viewer saw, as the table's key. */
function endKey(end: RelocateEnd): 'left' | 'arrived' | 'both' {
  switch (end) {
    case RelocateEnd.LEFT:
      return 'left';
    case RelocateEnd.ARRIVED:
      return 'arrived';
    default:
      return 'both';
  }
}

/** Whether a relocation is the viewer's own character's (the cut plays). */
export function isOwnRelocation(
  relocate: RelocateAct,
  viewer: string
): boolean {
  return Boolean(viewer) && relocate.mover?.id === viewer;
}

/**
 * The one line a viewer reads for a relocation. `name` is the reader's name
 * for a party (the describer's `partyName`).
 */
export function relocateSentence(
  relocate: RelocateAct,
  viewer: string,
  name: (party: Party | undefined) => string
): string {
  if (isOwnRelocation(relocate, viewer))
    return relocate.words || 'You are led away.';
  const table = CAUSE_SENTENCES[relocate.cause] ?? FALLBACK;
  const who = name(relocate.mover) || 'Someone';
  return table[endKey(relocate.end)].replace('{name}', who);
}

/** The one line a viewer reads for an arrest: "You are under arrest." */
export function arrestSentence(
  arrest: ArrestAct,
  viewer: string,
  name: (party: Party | undefined) => string
): string {
  const you = arrest.taken.some((party) => party.id === viewer);
  const others = arrest.taken.filter((party) => party.id !== viewer);
  const named = others.map((party) => name(party) || 'Someone');
  const list =
    named.length <= 1
      ? (named[0] ?? '')
      : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
  if (you && others.length === 0) return 'You are under arrest.';
  if (you) return `You and ${list} are under arrest.`;
  return `${list} ${others.length > 1 ? 'are' : 'is'} arrested.`;
}
