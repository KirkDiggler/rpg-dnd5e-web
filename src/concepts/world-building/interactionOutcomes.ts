import type { SiteScope } from './siteScope';

/**
 * WHAT FOLLOWS AN INTERACTION ENTERING A STATE (rpg-project#928): an
 * interaction's `outcomes:`, keyed by the state it enters, each a list of
 * consequences. The one kind today is `recognize`. A line's success row
 * may carry the same `recognize` (rpg-project#929), granted when the line
 * wins; `recognizeOf` reads either:
 *
 *   outcomes:
 *     admitted:
 *       - recognize:
 *           topic: admitted                   # the author's word
 *           holder: spoken_to                 # the one word: the creature spoken to
 *           about: party_in_sight             # the one word: the speaker's party he sees
 *           heard_by: carriers_who_witnessed  # optional, the one word
 *
 * The root `interactions:` map rides the scope's `unread` (rpg-project#922)
 * and is never interpreted beyond this: the studio reads the recognize
 * entries it can say in plain words, edits their topic and whether the
 * witnessing carriers hear it, adds and removes them, and leaves every other
 * key — the recipe, an unknown consequence kind, a word this build does not
 * know — as written. The dungeonspec compiler is the validator.
 */

/** `holder`'s one word: the creature the winning line was said to. */
export const HOLDER_SPOKEN_TO = 'spoken_to';
/** `about`'s one word: the speaker's party the holder sees. */
export const ABOUT_PARTY_IN_SIGHT = 'party_in_sight';
/** `about`'s other word (rpg-project#929): the speaker alone, as a line's
 * success row grants it to a straggler who made their own case. */
export const ABOUT_SPEAKER = 'speaker';
/** `heard_by`'s one word: the interaction's other carriers who witnessed it. */
export const HEARD_BY_WITNESSES = 'carriers_who_witnessed';

const HOLDER_WORDS: Record<string, string> = {
  [HOLDER_SPOKEN_TO]: 'the creature the line was said to',
};
const ABOUT_WORDS: Record<string, string> = {
  [ABOUT_PARTY_IN_SIGHT]: 'the speaker’s party he sees',
  [ABOUT_SPEAKER]: 'the speaker',
};

/** A recognize's holder in plain words; a word this build does not know, as
 * written. */
export function holderWords(holder: string): string {
  return HOLDER_WORDS[holder] ?? holder;
}

/** A recognize's subjects in plain words; a word this build does not know,
 * as written. */
export function aboutWords(about: string): string {
  return ABOUT_WORDS[about] ?? about;
}

/** The suffix a heard recognize adds: the witnesses recognise too. */
export const HEARD_WORDS = ', and every other carrier who saw it said does too';

/** A state's consequences, as written. */
export type Outcomes = Record<string, unknown[]>;

/** One recognize entry the studio can say and edit. */
export interface Recognize {
  topic: string;
  holder: string;
  about: string;
  heard: boolean;
}

const mapping = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function interactionsOf(scope: Readonly<SiteScope>): Record<string, unknown> {
  const interactions = scope.unread?.interactions;
  return mapping(interactions) ? interactions : {};
}

/** The states the interaction's recipe declares, in the file's order. */
export function recipeStates(scope: Readonly<SiteScope>, id: string): string[] {
  const interaction = interactionsOf(scope)[id];
  if (!mapping(interaction) || !mapping(interaction.recipe)) return [];
  const states = interaction.recipe.states;
  return mapping(states) ? Object.keys(states) : [];
}

/** The interaction's outcomes as written; empty when it has none. A state
 * whose value is not a list reads as no entries (the compiler names it). */
export function outcomesOf(scope: Readonly<SiteScope>, id: string): Outcomes {
  const interaction = interactionsOf(scope)[id];
  if (!mapping(interaction) || !mapping(interaction.outcomes)) return {};
  const out: Outcomes = {};
  for (const [state, list] of Object.entries(interaction.outcomes))
    out[state] = Array.isArray(list) ? list : [];
  return out;
}

/** One entry as a recognize the form edits, or undefined for any other
 * shape: another kind, an unknown key, a word that is not text. */
export function recognizeOf(entry: unknown): Recognize | undefined {
  if (!mapping(entry) || Object.keys(entry).length !== 1) return undefined;
  const r = entry.recognize;
  if (!mapping(r)) return undefined;
  for (const key of Object.keys(r))
    if (!['topic', 'holder', 'about', 'heard_by'].includes(key))
      return undefined;
  const { topic, holder, about } = r;
  if (
    typeof topic !== 'string' ||
    typeof holder !== 'string' ||
    typeof about !== 'string'
  )
    return undefined;
  if (r.heard_by !== undefined && typeof r.heard_by !== 'string')
    return undefined;
  return { topic, holder, about, heard: r.heard_by !== undefined };
}

/** Every topic the site's interactions grant, sorted, each once: the topics
 * a pass or a line may recognise on. */
export function grantedTopics(scope: Readonly<SiteScope>): string[] {
  const topics = new Set<string>();
  for (const id of Object.keys(interactionsOf(scope)))
    for (const list of Object.values(outcomesOf(scope, id)))
      for (const entry of list) {
        const r = recognizeOf(entry);
        if (r && r.topic) topics.add(r.topic);
      }
  return [...topics].sort();
}

/** The entry at one place, edited; every other key of it kept. */
function editEntry(
  outcomes: Outcomes,
  state: string,
  index: number,
  edit: (recognize: Record<string, unknown>) => Record<string, unknown>
): Outcomes {
  const list = outcomes[state] ?? [];
  const entry = list[index];
  if (!mapping(entry) || !mapping(entry.recognize)) return outcomes;
  const next = [...list];
  next[index] = { ...entry, recognize: edit({ ...entry.recognize }) };
  return { ...outcomes, [state]: next };
}

/** The outcomes with one recognize's topic set. */
export function withTopic(
  outcomes: Outcomes,
  state: string,
  index: number,
  topic: string
): Outcomes {
  return editEntry(outcomes, state, index, (r) => ({ ...r, topic }));
}

/** The outcomes with one recognize heard by the witnessing carriers, or by
 * nobody else. */
export function withHeard(
  outcomes: Outcomes,
  state: string,
  index: number,
  heard: boolean
): Outcomes {
  return editEntry(outcomes, state, index, (r) => {
    if (heard) return { ...r, heard_by: HEARD_BY_WITNESSES };
    const next = { ...r };
    delete next.heard_by;
    return next;
  });
}

/** The outcomes with a recognize added to a state: the spoken-to holder
 * recognises the party in sight on the topic, heard by the witnessing
 * carriers. */
export function withRecognizeAdded(
  outcomes: Outcomes,
  state: string,
  topic: string
): Outcomes {
  const entry = {
    recognize: {
      topic,
      holder: HOLDER_SPOKEN_TO,
      about: ABOUT_PARTY_IN_SIGHT,
      heard_by: HEARD_BY_WITNESSES,
    },
  };
  return { ...outcomes, [state]: [...(outcomes[state] ?? []), entry] };
}

/** The outcomes with one entry removed; a state left with none is dropped. */
export function withEntryRemoved(
  outcomes: Outcomes,
  state: string,
  index: number
): Outcomes {
  const list = (outcomes[state] ?? []).filter((_, i) => i !== index);
  const next = { ...outcomes };
  if (list.length === 0) delete next[state];
  else next[state] = list;
  return next;
}

/**
 * The scope with one interaction's outcomes set, or the key removed when
 * none are left. Throws for an id the file does not author. Every other key
 * of the interaction is kept as written.
 */
export function setInteractionOutcomes(
  scope: Readonly<SiteScope>,
  id: string,
  outcomes: Outcomes
): SiteScope {
  const interactions = interactionsOf(scope);
  const interaction = interactions[id];
  if (!mapping(interaction))
    throw new Error(
      `interactions.${id}: this site authors no such interaction`
    );
  const next: Record<string, unknown> = { ...interaction };
  if (Object.keys(outcomes).length === 0) delete next.outcomes;
  else next.outcomes = outcomes;
  return {
    ...scope,
    unread: {
      ...scope.unread,
      interactions: { ...interactions, [id]: next },
    },
  };
}
