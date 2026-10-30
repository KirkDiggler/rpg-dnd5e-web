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

/** `optionRequiresForms`: what an option may require. */
export const OPTION_REQUIRES_FORMS =
  'an option requires { fact: <id> }, { holds: <prop id> }, or { not: } one of them';

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

/** What an option's `requires` reads: a fact the speaker knows, or a prop
 * they carry. */
export type OptionRead = { fact: string } | { holds: string };

/** An option's `requires` as written (`dungeonspec.OptionSpec.Requires`): a
 * read, or `not` around one. */
export type OptionRequires = OptionRead | { not: OptionRead };

/** The requires picker's choices, in the order it lists them. */
export const REQUIRES_CHOICES = [
  { value: '', label: 'Always offered' },
  { value: 'fact', label: 'The speaker knows a fact' },
  { value: 'holds', label: 'The speaker carries a prop' },
  { value: 'not-fact', label: 'Unless the speaker knows a fact' },
  { value: 'not-holds', label: 'Unless the speaker carries a prop' },
] as const;
export type RequiresChoice = (typeof REQUIRES_CHOICES)[number]['value'];

/** The read inside a requirement, negated or not. */
export function requiresRead(r: OptionRequires): OptionRead {
  return 'not' in r ? r.not : r;
}

/** Which choice a requirement is. */
export function requiresChoice(r: OptionRequires | undefined): RequiresChoice {
  if (r === undefined) return '';
  const form = 'fact' in requiresRead(r) ? 'fact' : 'holds';
  return 'not' in r ? `not-${form}` : form;
}

/** The id a requirement names, fact or prop. */
export function requiresId(r: OptionRequires | undefined): string {
  if (r === undefined) return '';
  const read = requiresRead(r);
  return 'fact' in read ? read.fact : read.holds;
}

/** A requirement of one choice naming one id; undefined for "always". */
export function requiresOf(
  choice: RequiresChoice,
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

/** A requirement as the Read back says it, the prop's shown name given. */
export function requiresSentence(
  r: OptionRequires,
  propName: (id: string) => string
): string {
  const read = requiresRead(r);
  if ('not' in r)
    return 'fact' in read
      ? `Offered unless the speaker knows ${read.fact}.`
      : `Offered unless the speaker is carrying the ${propName(read.holds)}.`;
  return 'fact' in read
    ? `Offered to a speaker who knows ${read.fact}.`
    : `Offered to a speaker carrying the ${propName(read.holds)}.`;
}

/** A requirement as the read-only line says it: " · requires fact x". */
export function requiresGate(r: OptionRequires | undefined): string {
  if (r === undefined) return '';
  const read = requiresRead(r);
  const what = 'fact' in read ? `fact ${read.fact}` : `holding ${read.holds}`;
  return 'not' in r ? ` · unless ${what}` : ` · requires ${what}`;
}
