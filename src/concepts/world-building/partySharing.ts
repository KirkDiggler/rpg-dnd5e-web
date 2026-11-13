/**
 * THE PARTY'S SHARING DIAL (rpg-project#935; rpg-project#930 R5): one
 * setting per encounter, the root `party: { sharing: own | view | knowledge }`.
 * Unmarked is shared view, the default. The studio reads and writes this one
 * key and carries every other key under `party` as written; which words the
 * engine takes is the compiler's judgement, never this module's.
 */
import type { SiteScope } from './siteScope';

/** The dial's three stops: the content word, the dial's words, what the stop
 * means for players (R5's table) and the read-back's name for it (the
 * engine's `sharingNames`). */
export const SHARING_STOPS = [
  {
    word: 'own',
    label: 'Each their own',
    name: 'each their own',
    means:
      'Each player is shown only what their own character perceives, and acts only on that.',
  },
  {
    word: 'view',
    label: 'Shared view (default)',
    name: 'shared view',
    means:
      'Each player is shown what any party member perceives, and acts only on what their own character perceives.',
  },
  {
    word: 'knowledge',
    label: 'Shared knowledge (not built yet)',
    name: 'shared knowledge',
    means:
      'Each player is shown what any party member perceives, and acts on what any party member has learned.',
  },
] as const;

export type SharingWord = (typeof SHARING_STOPS)[number]['word'];

/** The stop an encounter that says nothing is at. */
export const DEFAULT_SHARING: SharingWord = 'view';

/** The authored `party.sharing`, as written; undefined when unmarked. */
export function authoredSharing(scope: Readonly<SiteScope>): unknown {
  return scope.party?.sharing;
}

/** The stop the dial shows: the authored word when it is one, the default
 * when unmarked, and undefined for a word this build does not know. */
export function sharingStop(
  scope: Readonly<SiteScope>
): (typeof SHARING_STOPS)[number] | undefined {
  const authored = authoredSharing(scope);
  const word = authored === undefined ? DEFAULT_SHARING : authored;
  return SHARING_STOPS.find((stop) => stop.word === word);
}

/**
 * The scope with the dial at `word`. Only `party.sharing` changes: every
 * other key under `party` and every other root key is kept. Choosing the
 * default on an unmarked site leaves it unmarked, so `view` is never written
 * where the author wrote nothing; on a marked site it writes `view`, the
 * author's choice. `undefined` removes the key, and an emptied `party` goes
 * with it.
 */
export function withSharing(
  scope: Readonly<SiteScope>,
  word: SharingWord | undefined
): SiteScope {
  const marked = authoredSharing(scope) !== undefined;
  if (word === DEFAULT_SHARING && !marked) return { ...scope };
  const party: Record<string, unknown> = { ...scope.party };
  if (word === undefined) delete party.sharing;
  else party.sharing = word;
  const next: SiteScope = { ...scope };
  if (Object.keys(party).length > 0) next.party = party;
  else delete next.party;
  return next;
}

/** The site's sharing in ONE sentence, as the engine's read-back says it
 * (rpg-toolkit `readback.sharingStatement`). */
export function sharingSentence(scope: Readonly<SiteScope>): string {
  const authored = authoredSharing(scope);
  if (authored === undefined)
    return "The party's sharing is not set, so it is shared view, the default.";
  const stop = SHARING_STOPS.find((s) => s.word === authored);
  if (stop === undefined)
    return `The party's sharing is ${JSON.stringify(authored)}, a word this build does not know; it is kept as written, and the engine refuses it.`;
  const set = `The party's sharing is set to ${stop.name}.`;
  return stop.word === 'knowledge'
    ? `${set} Shared knowledge is not built yet (rpg-project#937), so a run of this site is refused at launch.`
    : set;
}
