import { toRows } from './regionRuns';
import type { RoomCellRow, RoomHexCell } from './roomDraft';
import type { SiteScope } from './siteScope';

/**
 * WHAT FOLLOWS AN INTERACTION ENTERING A STATE (rpg-project#928): an
 * interaction's `outcomes:`, keyed by the state it enters, each a list of
 * consequences: a `give`, an `arrest` or a `jail`. A line's success row may
 * carry the same `give` (rpg-project#929), given when the line wins;
 * `giveOf` reads either (the words since rpg-project#1005; the retired
 * `recognize: { topic, holder }` is never read, so an entry still written
 * that way is shown and kept as written and the engine names `give`):
 *
 *   outcomes:
 *     admitted:
 *       - give:
 *           topic: admitted                   # the author's word
 *           to: spoken_to                     # the one word: the creature spoken to
 *           about: party_in_sight             # the one word: the speaker's party it sees
 *           heard_by: carriers_who_witnessed  # optional, the one word
 *
 * The root `interactions:` map rides the scope's `unread` (rpg-project#922)
 * and is never interpreted beyond this: the studio reads the give entries
 * it can say in plain words, edits their topic and whether the
 * witnessing carriers hear it, adds and removes them, and leaves every other
 * key — the recipe, an unknown consequence kind, a word this build does not
 * know — as written. The dungeonspec compiler is the validator.
 */

/** `to`'s one word: the creature the winning line was said to. */
export const TO_SPOKEN_TO = 'spoken_to';
/** `about`'s one word: the speaker's party the creature given it sees. */
export const ABOUT_PARTY_IN_SIGHT = 'party_in_sight';
/** `about`'s other word (rpg-project#929): the speaker alone, as a line's
 * success row grants it to a straggler who made their own case. */
export const ABOUT_SPEAKER = 'speaker';
/** `heard_by`'s one word: the interaction's other carriers who witnessed it. */
export const HEARD_BY_WITNESSES = 'carriers_who_witnessed';

/** A state's consequences, as written. */
export type Outcomes = Record<string, unknown[]>;

/** One give entry the studio can say and edit. */
export interface Giving {
  topic: string;
  to: string;
  about: string;
  heard: boolean;
}

const mapping = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function interactionsOf(scope: Readonly<SiteScope>): Record<string, unknown> {
  const interactions = scope.unread?.interactions;
  return mapping(interactions) ? interactions : {};
}

/** The ids of the site's root interactions (Conversations), in the file's
 * order. */
export function interactionIds(scope: Readonly<SiteScope>): string[] {
  return Object.keys(interactionsOf(scope));
}

/** The beats the interaction's recipe listens for — every transition's
 * `on`, in the file's order, each once (rpg-project#975 B): what a line's
 * `advance` may step it on. */
export function recipeBeats(scope: Readonly<SiteScope>, id: string): string[] {
  const interaction = interactionsOf(scope)[id];
  if (!mapping(interaction) || !mapping(interaction.recipe)) return [];
  const states = interaction.recipe.states;
  if (!mapping(states)) return [];
  const beats: string[] = [];
  for (const state of Object.values(states)) {
    if (!mapping(state) || !Array.isArray(state.transitions)) continue;
    for (const transition of state.transitions)
      if (
        mapping(transition) &&
        typeof transition.on === 'string' &&
        !beats.includes(transition.on)
      )
        beats.push(transition.on);
  }
  return beats;
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

/** One entry as a give the form edits, or undefined for any other shape:
 * another kind, an unknown key (the retired `holder` among
 * them), a word that is not text. */
export function giveOf(entry: unknown): Giving | undefined {
  if (!mapping(entry) || Object.keys(entry).length !== 1) return undefined;
  const r = entry.give;
  if (!mapping(r)) return undefined;
  for (const key of Object.keys(r))
    if (!['topic', 'to', 'about', 'heard_by'].includes(key)) return undefined;
  const { topic, to, about } = r;
  if (
    typeof topic !== 'string' ||
    typeof to !== 'string' ||
    typeof about !== 'string'
  )
    return undefined;
  if (r.heard_by !== undefined && typeof r.heard_by !== 'string')
    return undefined;
  return { topic, to, about, heard: r.heard_by !== undefined };
}

/** Every topic the site's interactions give, sorted, each once: the
 * topics a pass or a line may ask `noted` of. */
export function grantedTopics(scope: Readonly<SiteScope>): string[] {
  const topics = new Set<string>();
  for (const id of Object.keys(interactionsOf(scope)))
    for (const list of Object.values(outcomesOf(scope, id)))
      for (const entry of list) {
        const r = giveOf(entry);
        if (r && r.topic) topics.add(r.topic);
      }
  return [...topics].sort();
}

/** The entry at one place, edited; every other key of it kept. */
function editEntry(
  outcomes: Outcomes,
  state: string,
  index: number,
  edit: (give: Record<string, unknown>) => Record<string, unknown>
): Outcomes {
  const list = outcomes[state] ?? [];
  const entry = list[index];
  if (!mapping(entry) || !mapping(entry.give)) return outcomes;
  const next = [...list];
  next[index] = { ...entry, give: edit({ ...entry.give }) };
  return { ...outcomes, [state]: next };
}

/** The outcomes with one give's topic set. */
export function withTopic(
  outcomes: Outcomes,
  state: string,
  index: number,
  topic: string
): Outcomes {
  return editEntry(outcomes, state, index, (r) => ({ ...r, topic }));
}

/** The outcomes with one give about the party in sight, or the
 * speaker alone. */
export function withAbout(
  outcomes: Outcomes,
  state: string,
  index: number,
  about: string
): Outcomes {
  return editEntry(outcomes, state, index, (r) => ({ ...r, about }));
}

/** The outcomes with one give heard by the witnessing carriers, or by
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

/** The outcomes with a give added to a state: the creature spoken to comes
 * to note the topic about the party in sight, heard by the witnessing
 * carriers. */
export function withGiveAdded(
  outcomes: Outcomes,
  state: string,
  topic: string
): Outcomes {
  const entry = {
    give: {
      topic,
      to: TO_SPOKEN_TO,
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

// ---------------------------------------------------------------------------
// ONE OUTCOME IS ONE KIND (rpg-project#975 C): a give, an arrest or a
// jail (`dungeonspec` `OutcomeSpec`, `ArrestSpec`, `JailSpec`; judged by
// `interactions.go` `outcomesOf`, `arrestOf` and the engine's
// `validateOutcomes`):
//
//   - give: { topic, to, about, heard_by? }
//   - arrest: { cell: <region>, area: { regions?: [<region>], cells?: [rows] } }
//     — the area names its regions or its cells;
//   - jail: { words, rounds?, escaped?: <fact> } — only in a conversation
//     that arrests: a jail takes the taken of its own arrest.
// ---------------------------------------------------------------------------

export const OUTCOME_KINDS = ['give', 'arrest', 'jail'] as const;
export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

export interface ArrestShape {
  cell: string;
  area: { regions?: string[]; cells?: RoomCellRow[] };
}

export interface JailShape {
  words: string;
  rounds?: number;
  escaped?: string;
}

/** The one kind an entry is, or undefined for any other shape (another
 * kind, two kinds, an entry that is not a mapping). */
export function outcomeKindOf(entry: unknown): OutcomeKind | undefined {
  if (!mapping(entry)) return undefined;
  const keys = Object.keys(entry);
  if (keys.length !== 1) return undefined;
  const kind = keys[0] as OutcomeKind;
  return OUTCOME_KINDS.includes(kind) && mapping(entry[kind])
    ? kind
    : undefined;
}

/** Whether the conversation arrests anybody — some outcome is an arrest —
 * leaving one entry out (the one being changed). */
export function arrests(
  outcomes: Outcomes,
  except?: { state: string; index: number }
): boolean {
  return Object.entries(outcomes).some(([state, list]) =>
    list.some(
      (entry, index) =>
        !(except && except.state === state && except.index === index) &&
        outcomeKindOf(entry) === 'arrest'
    )
  );
}

/** A new outcome of one kind, started from what the site defines: a
 * give of its first topic about the party in sight, witnessed; an
 * arrest held in and seized in its first region; a jail with words to
 * write. */
export function newOutcome(
  kind: OutcomeKind,
  names: { topics: readonly string[]; regions: readonly { id: string }[] }
): Record<string, unknown> {
  switch (kind) {
    case 'give':
      return {
        give: {
          topic: names.topics[0] ?? '',
          to: TO_SPOKEN_TO,
          about: ABOUT_PARTY_IN_SIGHT,
          heard_by: HEARD_BY_WITNESSES,
        },
      };
    case 'arrest': {
      const region = names.regions[0]?.id ?? '';
      return { arrest: { cell: region, area: { regions: [region] } } };
    }
    case 'jail':
      return { jail: { words: '' } };
  }
}

/** The outcomes with one entry replaced. */
export function withEntry(
  outcomes: Outcomes,
  state: string,
  index: number,
  entry: unknown
): Outcomes {
  const list = [...(outcomes[state] ?? [])];
  list[index] = entry;
  return { ...outcomes, [state]: list };
}

/** The outcomes with an entry added on entering a state. A state not yet
 * written takes its place in the recipe's order. */
export function withOutcomeAdded(
  outcomes: Outcomes,
  state: string,
  entry: unknown,
  recipeOrder: readonly string[]
): Outcomes {
  if (outcomes[state] !== undefined)
    return { ...outcomes, [state]: [...outcomes[state]!, entry] };
  const at = recipeOrder.indexOf(state);
  const next: Outcomes = {};
  let placed = false;
  for (const [key, list] of Object.entries(outcomes)) {
    const later = recipeOrder.indexOf(key);
    if (!placed && at >= 0 && later > at) {
      next[state] = [entry];
      placed = true;
    }
    next[key] = list;
  }
  if (!placed) next[state] = [entry];
  return next;
}

/** One entry's arrest, or undefined. */
const only = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/** One entry's arrest, when it is one the form can show and edit — `cell`
 * a word, `area` a mapping of `regions` (words) and `cells` (a list), no
 * other key — else undefined, and the entry is shown as written. No file
 * crashes the section. */
export function arrestOf(entry: unknown): ArrestShape | undefined {
  if (outcomeKindOf(entry) !== 'arrest') return undefined;
  const arrest = (entry as { arrest: Record<string, unknown> }).arrest;
  const area = arrest.area;
  if (
    !only(arrest, ['cell', 'area']) ||
    typeof arrest.cell !== 'string' ||
    !mapping(area) ||
    !only(area, ['regions', 'cells']) ||
    (area.regions !== undefined && !strings(area.regions)) ||
    (area.cells !== undefined && !Array.isArray(area.cells))
  )
    return undefined;
  return arrest as unknown as ArrestShape;
}

/** One entry's jail, when the form can show and edit it — `words`,
 * `rounds` and `escaped` of their kinds, no other key — else undefined. */
export function jailOf(entry: unknown): JailShape | undefined {
  if (outcomeKindOf(entry) !== 'jail') return undefined;
  const jail = (entry as { jail: Record<string, unknown> }).jail;
  if (
    !only(jail, ['words', 'rounds', 'escaped']) ||
    (jail.words !== undefined && typeof jail.words !== 'string') ||
    (jail.rounds !== undefined && typeof jail.rounds !== 'number') ||
    (jail.escaped !== undefined && typeof jail.escaped !== 'string')
  )
    return undefined;
  return jail as unknown as JailShape;
}

/** One entry's give, when the form can show and edit it: the words it
 * offers (to `spoken_to`; about `party_in_sight` or `speaker`; `heard_by`
 * the witnesses or absent). Anything else is shown as written, never as
 * blank fields. */
export function editableGiveOf(entry: unknown): Giving | undefined {
  const r = giveOf(entry);
  if (!r) return undefined;
  const raw = (entry as { give: Record<string, unknown> }).give;
  if (r.to !== TO_SPOKEN_TO) return undefined;
  if (r.about !== ABOUT_PARTY_IN_SIGHT && r.about !== ABOUT_SPEAKER)
    return undefined;
  if (raw.heard_by !== undefined && raw.heard_by !== HEARD_BY_WITNESSES)
    return undefined;
  return r;
}

/** Whether the conversation jails anybody: some outcome is a jail. */
export function jails(outcomes: Outcomes): boolean {
  return Object.values(outcomes).some((list) =>
    list.some((entry) => outcomeKindOf(entry) === 'jail')
  );
}

/** An arrest held in another region. */
export function withArrestCell(arrest: ArrestShape, cell: string): unknown {
  return { arrest: { ...arrest, cell } };
}

/** An arrest seizing in one more region — appended to the authored list —
 * or one fewer, taken out where it stands, so the file changes no more than
 * the one region. The last place it seizes in is never taken away: an area
 * names its regions or its cells. */
export function withArrestRegion(
  arrest: ArrestShape,
  region: string,
  seized: boolean
): unknown {
  const was = arrest.area.regions ?? [];
  let regions = was;
  if (seized && !was.includes(region)) regions = [...was, region];
  if (!seized && (was.length > 1 || (arrest.area.cells?.length ?? 0) > 0))
    regions = was.filter((id) => id !== region);
  const area: ArrestShape['area'] = { ...arrest.area };
  if (regions.length > 0) area.regions = regions;
  else delete area.regions;
  return { arrest: { ...arrest, area } };
}

/** An arrest seizing these cells, as row runs; none removes them — unless
 * the area would then name nothing, when the arrest is kept as it was. */
export function withArrestCells(
  arrest: ArrestShape,
  cells: readonly RoomHexCell[]
): unknown {
  const area: ArrestShape['area'] = { ...arrest.area };
  if (cells.length > 0) area.cells = toRows(cells);
  else if ((area.regions?.length ?? 0) > 0) delete area.cells;
  else return { arrest };
  return { arrest: { ...arrest, area } };
}

/** A jail with one field changed: words; rounds (null for none); the fact
 * taught on an escape ('' for none). Written in the engine's order. */
export function withJail(
  jail: JailShape,
  patch: { words?: string; rounds?: number | null; escaped?: string }
): unknown {
  const next: JailShape = { ...jail };
  if (patch.words !== undefined) next.words = patch.words;
  if (patch.rounds === null) delete next.rounds;
  else if (patch.rounds !== undefined) next.rounds = patch.rounds;
  if (patch.escaped === '') delete next.escaped;
  else if (patch.escaped !== undefined) next.escaped = patch.escaped;
  return { jail: next };
}
