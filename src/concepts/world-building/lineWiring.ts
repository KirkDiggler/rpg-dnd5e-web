/**
 * A LINE'S WIRING (rpg-project#975 B): its `requires` list and its
 * `advance`, as the engine reads them (`dungeonspec` `OptionSpec.Requires`,
 * `PredicateSpec`, `InteractionPredicateSpec`, `AdvanceSpec`; judged by
 * `grammar.go` `optionRequires`, `interactionRequirement`, `optionAdvance`).
 *
 * `requires` is one requirement written as a mapping, or a list of them,
 * every one of which must be true. The author's spelling is kept: a mapping
 * stays a mapping while it has one, and becomes a list when a second is
 * added; a list stays a list. Each requirement is a fact the speaker knows,
 * a prop they carry (`carries`), a conversation in one of its states, or a
 * holding the one spoken to holds about them (`holds`) — or `not` one of
 * those. A requirement written in any other key (the retired `recognized`)
 * is shown and kept as written; the engine names its word.
 *
 * `advance: { interaction, success?, failure? }` steps a conversation on the
 * beat a win (or a plain line) lands, and on the beat a miss lands. At least
 * one beat is written; a plain line has no miss.
 */
import type { OptionShape } from './answerTableShape';
import {
  isKnownRead,
  requirementsOf,
  requiresRead,
  type OptionRead,
  type OptionRequirement,
  type OptionRequires,
} from './predicateNot';
import type { SiteNames } from './siteNames';

export const REQUIREMENT_KINDS = [
  'fact',
  'carries',
  'interaction',
  'holds',
] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];
export type RequirementChoice = RequirementKind | `not-${RequirementKind}`;

/** What each requirement's select offers, in order: the plain reads, then
 * their negations. A prop's line is offered no `holds`: a prop holds
 * nothing about anybody. */
export const REQUIREMENT_CHOICES: readonly {
  value: RequirementChoice;
  label: string;
}[] = [
  { value: 'fact', label: 'The speaker knows a fact' },
  { value: 'carries', label: 'The speaker carries a prop' },
  { value: 'interaction', label: 'A conversation is in a state' },
  {
    value: 'holds',
    label: 'The one spoken to holds this about the speaker',
  },
  { value: 'not-fact', label: 'Unless the speaker knows a fact' },
  { value: 'not-carries', label: 'Unless the speaker carries a prop' },
  { value: 'not-interaction', label: 'Unless a conversation is in a state' },
  {
    value: 'not-holds',
    label: 'Unless the one spoken to holds this about the speaker',
  },
];

/** The kind a read is; a read in a key the studio does not edit is named
 * by its own key ("recognized"), so the select can show it as written. */
function kindOf(read: OptionRead): string {
  if (!isKnownRead(read)) return Object.keys(read)[0] ?? '';
  if ('fact' in read) return 'fact';
  if ('carries' in read) return 'carries';
  if ('interaction' in read) return 'interaction';
  return 'holds';
}

/** Which choice a requirement is: one of {@link REQUIREMENT_CHOICES}, or —
 * for a read the studio does not edit — its own key, kept as written. */
export function choiceOf(r: OptionRequirement): string {
  const kind = kindOf(requiresRead(r));
  return 'not' in r ? `not-${kind}` : kind;
}

/** The requirement a choice starts as. The same read negated or not keeps
 * what it names; another kind starts from what the site defines: its first
 * holdable prop, its first conversation in that conversation's first state,
 * its first holding. */
export function requirementFor(
  choice: RequirementChoice,
  was: OptionRequirement | undefined,
  holdable: readonly string[],
  names: SiteNames
): OptionRequirement {
  const negated = choice.startsWith('not-');
  const kind = choice.replace('not-', '') as RequirementKind;
  let read: OptionRead;
  if (was !== undefined && kindOf(requiresRead(was)) === kind)
    read = requiresRead(was);
  else
    switch (kind) {
      case 'fact':
        // A fact the file mentions; free text (and the engine's refusal
        // until one is typed) only on a site that mentions none.
        read = { fact: names.facts[0] ?? '' };
        break;
      case 'carries':
        read = { carries: holdable[0] ?? '' };
        break;
      case 'interaction': {
        const first = names.conversations[0];
        read = {
          interaction: {
            id: first?.id ?? '',
            in: first?.states[0] !== undefined ? [first.states[0]] : [],
          },
        };
        break;
      }
      case 'holds':
        read = { holds: names.topics[0] ?? '' };
        break;
    }
  return negated ? { not: read } : read;
}

/** The same requirement, its read replaced, negation kept. */
export function withRead(
  r: OptionRequirement,
  read: OptionRead
): OptionRequirement {
  return 'not' in r ? { not: read } : read;
}

/** The requirements with one replaced (or appended at the end, or removed
 * for `undefined`), spelled as the author spelled them. */
export function setRequirement(
  requires: OptionRequires | undefined,
  index: number,
  r: OptionRequirement | undefined
): OptionRequires | undefined {
  const items = [...requirementsOf(requires)];
  if (r === undefined) items.splice(index, 1);
  else items[index] = r;
  if (items.length === 0) return undefined;
  if (Array.isArray(requires)) return items;
  return items.length === 1 ? items[0] : items;
}

/** A conversation requirement moved to another conversation: its states
 * start as that conversation's first, since a state of one is not a state of
 * another. */
export function withConversation(
  r: OptionRequirement,
  id: string,
  names: SiteNames
): OptionRequirement {
  const states =
    names.conversations.find((conversation) => conversation.id === id)
      ?.states ?? [];
  return withRead(r, {
    interaction: { id, in: states[0] !== undefined ? [states[0]] : [] },
  });
}

/** A conversation requirement with one state ticked or unticked, the
 * states kept in the recipe's order. The last state is never taken away. */
export function withState(
  r: OptionRequirement,
  state: string,
  ticked: boolean,
  names: SiteNames
): OptionRequirement {
  const read = requiresRead(r);
  if (!('interaction' in read)) return r;
  const { id, in: was } = read.interaction;
  const order =
    names.conversations.find((conversation) => conversation.id === id)
      ?.states ?? [];
  const set = new Set(was);
  if (ticked) set.add(state);
  else if (set.size > 1) set.delete(state);
  const known = order.filter((s) => set.has(s));
  const unknown = was.filter((s) => !order.includes(s));
  return withRead(r, {
    interaction: { ...read.interaction, id, in: [...known, ...unknown] },
  });
}

export interface AdvanceShape {
  interaction: string;
  success?: string;
  failure?: string;
}

/** The line's advance, read; undefined when it has none. */
export function advanceOf(option: OptionShape): AdvanceShape | undefined {
  const advance = (option as { advance?: unknown }).advance;
  if (advance === null || typeof advance !== 'object') return undefined;
  return advance as AdvanceShape;
}

/** The line advancing this conversation — or none for '' — on its first
 * beat at a win, the rest of the line kept as written. */
export function withAdvanceConversation(
  option: OptionShape,
  id: string,
  names: SiteNames
): OptionShape {
  const next = { ...option } as OptionShape & { advance?: AdvanceShape };
  if (id === '') {
    delete next.advance;
    return next;
  }
  const was = advanceOf(option);
  if (was?.interaction === id) return option;
  const beats =
    names.conversations.find((conversation) => conversation.id === id)?.beats ??
    [];
  next.advance = { interaction: id, success: beats[0] ?? '' };
  return next;
}

/** The line's advance with the beat one verdict steps on; '' for none. The
 * other verdict's beat is kept. */
export function withAdvanceBeat(
  option: OptionShape,
  verdict: 'success' | 'failure',
  beat: string
): OptionShape {
  const was = advanceOf(option);
  if (was === undefined) return option;
  const advance: AdvanceShape = { ...was };
  if (beat === '') delete advance[verdict];
  else advance[verdict] = beat;
  // Written in the engine's order: interaction, success, failure.
  const ordered: AdvanceShape = { interaction: advance.interaction };
  if (advance.success !== undefined) ordered.success = advance.success;
  if (advance.failure !== undefined) ordered.failure = advance.failure;
  return { ...option, advance: ordered } as OptionShape;
}
