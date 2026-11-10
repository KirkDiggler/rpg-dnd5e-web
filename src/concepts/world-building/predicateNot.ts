/**
 * THE ONE NEGATION (rpg-project#719): `{ not: <one predicate> }`, legal
 * wherever a predicate is and scoped by what it wraps. The engine judges it
 * where and when its inner predicate is judged (rpg-toolkit
 * `rulebooks/dnd5e/encounter/not.go`), so:
 *
 *   - on an option's `requires` it is the speaker's read, negated: a line
 *     withheld from whoever knows the fact or carries the prop, offered to
 *     whoever does not (lane rpg-project#722, D3);
 *   - on an `until`, an `arrives` or an ending's `when` it is WAITED FOR, and
 *     a `not` of a fact, a round or a fall holds from the first frame and can
 *     only stop holding, so the engine refuses it; only a `not` of a stance a
 *     pair can turn away from fires.
 *
 * THE ENGINE'S SENTENCES, word for word (`dungeonspec/factions.go`
 * `notOfNot` and `notHoldsFromTheStart`, `dungeonspec/grammar.go`
 * `optionRequiresForms`), so an author meets one problem, not two.
 */
import type { PredicateDoc } from '@/author/factionVocabulary';

/** `notOfNot`. */
export const NOT_OF_NOT_REFUSAL =
  'a not of a not is the predicate itself: write the inner one';

/** `notHoldsFromTheStart`. */
export const NOT_HOLDS_FROM_THE_START_REFUSAL =
  'a not of a fact, a round or a fall holds from the start and can only stop holding, ' +
  "so nothing can fire it: a not is read by an option's requires or a leave ending's if, " +
  'and waited for only on a stance a pair can turn away from';

/** `optionRequiresForms`: what an option may require (rpg-project#922: one
 * or a list, and the interaction form). */
export const OPTION_REQUIRES_FORMS =
  'an option requires one or a list of { fact: <id> }, { holds: <prop id> }, ' +
  '{ interaction: { id, in: [<state>] } }, or { not: } one of them';

/** `interactionForm`: the interaction predicate's own sentence. */
export const INTERACTION_FORM =
  'an interaction predicate is { interaction: { id: <interaction id>, in: [<state>, ...] } }';

/** The refusal a WAITED-FOR `not` (an until, an arrival, an ending's `when`)
 * earns by its inner form alone, at `<path>.not`, or undefined. Whether a
 * `not` of a stance can fire depends on the stance table, and is the
 * engine's to judge at Save & Play. */
export function waitedNotRefusal(p: PredicateDoc): string | undefined {
  if (!('not' in p)) return undefined;
  if ('not' in p.not) return NOT_OF_NOT_REFUSAL;
  if ('stance' in p.not) return undefined;
  // `{ not: { left } }` on an ending's `when` is a leave ending — the last
  // one out by any other door (rpg-project#719) — and fires; anywhere else
  // `left` is refused in its own sentence (`leftOnlyEndings`).
  if ('left' in p.not) return undefined;
  return NOT_HOLDS_FROM_THE_START_REFUSAL;
}

/** A run's interaction in one of the named states (rpg-project#922): judged
 * PER RUN, not per speaker. The studio carries it and says it; it does not
 * edit it in this slice. */
export interface InteractionRead {
  interaction: { id: string; in: string[] };
}

/** What one requirement reads: a fact the speaker knows, a prop they carry,
 * or the state of the run's interaction. */
export type OptionRead = { fact: string } | { holds: string } | InteractionRead;

/** One requirement: a read, or `not` around one. */
export type OptionRequirement = OptionRead | { not: OptionRead };

/** An option's `requires` as written (`dungeonspec.OptionSpec.Requires`):
 * ONE requirement as a mapping, or a LIST of them that must all hold
 * (rpg-project#922). The spelling is the author's and is kept: a mapping
 * stays a mapping, a list stays a list. */
export type OptionRequires = OptionRequirement | OptionRequirement[];

/** Every requirement, in the author's order, whichever spelling. */
export function requirementsOf(
  r: OptionRequires | undefined
): OptionRequirement[] {
  if (r === undefined) return [];
  return Array.isArray(r) ? r : [r];
}

/** The path the engine names one requirement by (`optionRequirements`):
 * `requires` for a single one, `requires[i]` in a longer list. */
export function requirementPath(r: OptionRequires, index: number): string {
  return Array.isArray(r) && r.length > 1 ? `requires[${index}]` : 'requires';
}

/** Every fact the requirements read, negated or not. */
export function requiresFacts(r: OptionRequires | undefined): string[] {
  return requirementsOf(r).flatMap((one) => {
    const read = requiresRead(one);
    return 'fact' in read ? [read.fact] : [];
  });
}

/** The requires picker's choices, in the order it lists them. `listed` is
 * not offered: it names a `requires` the picker shows but does not edit — a
 * list, or an interaction read. */
export const REQUIRES_CHOICES = [
  { value: '', label: 'Always offered' },
  { value: 'fact', label: 'The speaker knows a fact' },
  { value: 'holds', label: 'The speaker carries a prop' },
  { value: 'not-fact', label: 'Unless the speaker knows a fact' },
  { value: 'not-holds', label: 'Unless the speaker carries a prop' },
] as const;
export type RequiresChoice =
  | (typeof REQUIRES_CHOICES)[number]['value']
  | 'listed';

/** The read inside one requirement, negated or not. */
export function requiresRead(r: OptionRequirement): OptionRead {
  return 'not' in r ? r.not : r;
}

/** Which choice a requirement is; `listed` for a list or an interaction. */
export function requiresChoice(r: OptionRequires | undefined): RequiresChoice {
  if (r === undefined) return '';
  if (Array.isArray(r)) return 'listed';
  const read = requiresRead(r);
  if ('interaction' in read) return 'listed';
  const form = 'fact' in read ? 'fact' : 'holds';
  return 'not' in r ? `not-${form}` : form;
}

/** The id a single fact or holding names; '' for anything the picker does
 * not edit. */
export function requiresId(r: OptionRequires | undefined): string {
  if (r === undefined || Array.isArray(r)) return '';
  const read = requiresRead(r);
  if ('fact' in read) return read.fact;
  if ('holds' in read) return read.holds;
  return '';
}

/** A requirement of one choice naming one id; undefined for "always". */
export function requiresOf(
  choice: Exclude<RequiresChoice, 'listed'>,
  id: string
): OptionRequires | undefined {
  switch (choice) {
    case '':
      return undefined;
    case 'fact':
      return { fact: id };
    case 'holds':
      return { holds: id };
    case 'not-fact':
      return { not: { fact: id } };
    case 'not-holds':
      return { not: { holds: id } };
  }
}

/** The interaction read as words: "front-gate is fresh or warned-troupe". */
function interactionWords(read: InteractionRead): string {
  return `${read.interaction.id} is ${read.interaction.in.join(' or ')}`;
}

/** One requirement as the Read back says it, the prop's shown name given. */
function requirementSentence(
  r: OptionRequirement,
  propName: (id: string) => string
): string {
  const read = requiresRead(r);
  if ('interaction' in read)
    return 'not' in r
      ? `Offered unless ${interactionWords(read)}.`
      : `Offered while ${interactionWords(read)}.`;
  if ('not' in r)
    return 'fact' in read
      ? `Offered unless the speaker knows ${read.fact}.`
      : `Offered unless the speaker is carrying the ${propName(read.holds)}.`;
  return 'fact' in read
    ? `Offered to a speaker who knows ${read.fact}.`
    : `Offered to a speaker carrying the ${propName(read.holds)}.`;
}

/** The requirements as the Read back says them, one sentence each. */
export function requiresSentence(
  r: OptionRequires,
  propName: (id: string) => string
): string {
  return requirementsOf(r)
    .map((one) => requirementSentence(one, propName))
    .join(' ');
}

/** One requirement as the read-only line says it: "requires fact x". */
function requirementGate(r: OptionRequirement): string {
  const read = requiresRead(r);
  const what =
    'fact' in read
      ? `fact ${read.fact}`
      : 'holds' in read
        ? `holding ${read.holds}`
        : `${read.interaction.id} in ${read.interaction.in.join('|')}`;
  return 'not' in r ? `unless ${what}` : `requires ${what}`;
}

/** The requirements as the read-only line says them: " · requires fact x ·
 * requires front-gate in fresh". */
export function requiresGate(r: OptionRequires | undefined): string {
  return requirementsOf(r)
    .map((one) => ` · ${requirementGate(one)}`)
    .join('');
}
