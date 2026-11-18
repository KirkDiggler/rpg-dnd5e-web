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
 *     a `not` of a fact, a round or a fall is true from the first frame and
 *     can only stop being true, so the engine refuses it; only a `not` of a stance a
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
  'a not of a fact, a round or a fall is true from the start and can only stop being true, ' +
  "so nothing can fire it: a not is read by an option's requires or a leave ending's if, " +
  'and waited for only on a stance a pair can turn away from';

/** `optionRequiresForms`: what an option may require (rpg-project#922: one
 * or a list, and the interaction form; rpg-project#928: what the one spoken
 * to has noted; rpg-project#1005: the words `carries` and `noted`). */
export const OPTION_REQUIRES_FORMS =
  'an option requires one or a list of { fact: <id> }, { carries: <prop id> }, ' +
  '{ interaction: { id, in: [<state>] } }, { noted: <topic> }, or { not: } one of them';

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

/** The creature spoken to has noted a topic about the speaker
 * (rpg-project#928; the word `noted` since rpg-project#1005). The topic is the author's;
 * whether anything in the file gives it, and whether the line is a
 * creature's, is the compiler's to judge at Save & Play. The studio carries
 * it and says it. */
export interface NotedRead {
  noted: string;
}

/** What one requirement reads: a fact the speaker knows, a prop they carry,
 * the state of the run's interaction, or a topic the one spoken to has noted
 * about the speaker. */
export type OptionRead =
  | { fact: string }
  | { carries: string }
  | InteractionRead
  | NotedRead;

/** Whether a read is one of the forms the studio edits. A read written in
 * any other key — the retired `recognized` and `holds` among them (rpg-project#1005) —
 * is carried as written, said as written, and left to the engine to name. */
export function isKnownRead(read: OptionRead): boolean {
  const r = read as Record<string, unknown>;
  return (
    typeof r.fact === 'string' ||
    typeof r.carries === 'string' ||
    typeof r.noted === 'string' ||
    (r.interaction !== null &&
      typeof r.interaction === 'object' &&
      Array.isArray((r.interaction as { in?: unknown }).in))
  );
}

/** A read the studio does not edit, as written: "recognized: admitted". */
export function writtenRead(read: OptionRead): string {
  return Object.entries(read as Record<string, unknown>)
    .map(
      ([key, value]) =>
        `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`
    )
    .join(', ');
}

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

/** The read inside one requirement, negated or not. */
export function requiresRead(r: OptionRequirement): OptionRead {
  return 'not' in r ? r.not : r;
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
  if (!isKnownRead(read))
    return 'not' in r
      ? `Offered unless ${writtenRead(read)} (as written).`
      : `Requires ${writtenRead(read)} (as written).`;
  if ('interaction' in read)
    return 'not' in r
      ? `Offered unless ${interactionWords(read)}.`
      : `Offered while ${interactionWords(read)}.`;
  if ('noted' in read)
    return 'not' in r
      ? `Offered unless the one spoken to has noted ${read.noted} about the speaker.`
      : `Offered while the one spoken to has noted ${read.noted} about the speaker.`;
  if ('not' in r)
    return 'fact' in read
      ? `Offered unless the speaker knows ${read.fact}.`
      : `Offered unless the speaker is carrying the ${propName(read.carries)}.`;
  return 'fact' in read
    ? `Offered to a speaker who knows ${read.fact}.`
    : `Offered to a speaker carrying the ${propName(read.carries)}.`;
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
  const what = !isKnownRead(read)
    ? writtenRead(read)
    : 'fact' in read
      ? `fact ${read.fact}`
      : 'carries' in read
        ? `carries ${read.carries}`
        : 'noted' in read
          ? `noted ${read.noted}`
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
