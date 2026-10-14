/**
 * The answer table's WORDS ON SCREEN — one phrase per term, for the row
 * editor and the read-back alike (rpg-project#576, B5).
 *
 * `@/author/answerVocabulary` is what the ENGINE accepts: the keys, the
 * bands, the deeds, the selectors and the refusals. This module is what the
 * STUDIO SAYS about them. The editor's pickers and summaries and the
 * inspector's read-back prose read the phrases below, so a phrase changes in
 * one place and the two can never describe the same row in different words.
 *
 * ONE PHRASE, A SUBJECT SLOT (S2-Q1). The editor speaks as the creature —
 * "I was attacked" — and the read-back about it — "it was attacked". The
 * slot is the only difference; the verb agrees with it here and nowhere
 * else.
 *
 * IT DECIDES NOTHING. A phrase describes what the file says; whether a row is
 * eligible, which one fires and what a selector resolves to stay the
 * engine's.
 */
import { answerWord } from '@/author/answerVocabulary';
import {
  isNotCondition,
  whenConditions,
  type AnswerEntryShape,
  type AnswerWhenCondition,
  type AnswerWhenDeed,
  type AnswerWhenShape,
} from './answerTableShape';

/** Who a phrase is about: the creature speaking (`I`, the editor) or the
 * creature described (`it`, the read-back). */
export type Subject = 'I' | 'it';

/** The words that change with the subject. */
const VERBS = {
  know: { I: 'know', it: 'knows' },
  doNot: { I: 'do not', it: 'does not' },
  attack: { I: 'attack', it: 'attacks' },
  walk: { I: 'walk', it: 'walks' },
  hold: { I: 'hold', it: 'holds' },
  flee: { I: 'flee', it: 'flees' },
  raise: { I: 'raise', it: 'raises' },
  object: { I: 'me', it: 'it' },
} as const;

function verb(word: keyof typeof VERBS, subject: Subject): string {
  return VERBS[word][subject];
}

/** "1 round", "3 rounds". */
export function roundsPhrase(n: number): string {
  return n === 1 ? '1 round' : `${n} rounds`;
}

/** One enemy band, the four exclusive answers to "where is the enemy". */
export function enemyBandPhrase(band: string): string {
  if (band === 'none') return 'no enemy is seen or remembered';
  if (band === 'reach') return 'an enemy is in reach';
  return `an enemy is ${band}`;
}

/** The negative of one enemy band. */
function notEnemyBandPhrase(band: string): string {
  if (band === 'none') return 'an enemy is seen or remembered';
  if (band === 'reach') return 'no enemy is in reach';
  return `no enemy is ${band}`;
}

type DeedScope = Pick<AnswerWhenDeed, 'on' | 'as'>;

/** Whose deed, and whether it is told in the passive: "an ally was
 * attacked", "I attacked", "I was attacked". `fled` has no passive. */
function deedClause(
  deed: string,
  scope: DeedScope,
  subject: Subject,
  negated: boolean
): string {
  const who = scope.on !== undefined ? 'an ally' : subject;
  const passive = deed !== 'fled' && scope.as === undefined;
  if (negated) {
    if (passive) return `${who} was not ${deed}`;
    const base = deed === 'fled' ? 'flee' : deed.replace(/ed$/, '');
    return `${who} did not ${base}`;
  }
  return passive ? `${who} was ${deed}` : `${who} ${deed}`;
}

/** The deed picker's label: the clause without its span. Its scope is the
 * one the row already carries, so the list reads in the row's own terms. */
export function deedLabel(
  deed: string,
  scope: DeedScope,
  subject: Subject = 'I'
): string {
  return deedClause(deed, scope, subject, false);
}

/** The `heard` picker's label. */
export function heardLabel(subject: Subject = 'I'): string {
  return `${subject} heard a sound`;
}

/** The `fact` picker's label. */
export function factLabel(subject: Subject = 'I'): string {
  return `${subject} ${verb('know', subject)} a fact`;
}

/** "a clang", "an …": the sealed sound kinds are all consonant-led. */
function soundPhrase(kind: string): string {
  return /^[aeiou]/.test(kind) ? `an ${kind}` : `a ${kind}`;
}

function deedOf(
  condition: AnswerWhenCondition
): [string, AnswerWhenDeed] | undefined {
  const [key, body] = Object.entries(condition)[0] ?? [];
  if (key === undefined || typeof body !== 'object' || body === null)
    return undefined;
  if (!('within' in body)) return undefined;
  return [key, body as AnswerWhenDeed];
}

/** One condition as a clause about the subject. `not` reads as the clause's
 * own negative where English has one, and as "it is not so that …" around a
 * `not` inside a `not`, which the editor carries but does not author. */
export function conditionPhrase(
  condition: AnswerWhenCondition,
  subject: Subject
): string {
  return clause(condition, subject, false);
}

function clause(
  condition: AnswerWhenCondition,
  subject: Subject,
  negated: boolean
): string {
  if (isNotCondition(condition)) {
    if (negated) return clause(condition.not, subject, false);
    if (isNotCondition(condition.not))
      return `it is not so that ${clause(condition.not, subject, false)}`;
    return clause(condition.not, subject, true);
  }
  if ('enemy' in condition)
    return negated
      ? notEnemyBandPhrase(condition.enemy)
      : enemyBandPhrase(condition.enemy);
  if ('heard' in condition) {
    const span = `within ${roundsPhrase(condition.heard.within)}`;
    const sound = soundPhrase(condition.heard.kind);
    return negated
      ? `${subject} did not hear ${sound} ${span}`
      : `${subject} heard ${sound} ${span}`;
  }
  if ('fact' in condition)
    return negated
      ? `${subject} ${verb('doNot', subject)} know ${condition.fact}`
      : `${subject} ${verb('know', subject)} ${condition.fact}`;
  const deed = deedOf(condition);
  if (deed === undefined) return 'a condition this build cannot read';
  const [word, body] = deed;
  return `${deedClause(word, body, subject, negated)} within ${roundsPhrase(body.within)}`;
}

/** Every condition of a `when`, joined by "and" (each must hold). */
export function whenPhrase(
  when: AnswerWhenShape | undefined,
  subject: Subject
): string | undefined {
  const conditions = whenConditions(when);
  if (conditions.length === 0) return undefined;
  return joinAnd(conditions.map((c) => conditionPhrase(c, subject)));
}

/** "a", "a and b", "a, b and c". */
export function joinAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** What a selector names, from the subject's side. */
export function selectorPhrase(selector: string, subject: Subject): string {
  if (selector === 'enemy') return 'the enemy';
  if (selector === 'attacker') return `whoever hit ${verb('object', subject)}`;
  if (selector === 'actor') return 'whoever did it';
  if (selector === 'sound') return 'the sound';
  return selector;
}

/** The row's one word, as a verb phrase agreeing with the subject (the
 * subject itself is the caller's). `trigger` tells a `fact` on `time` — a
 * fact raised aloud — from a fact answered on a verdict, which the speaker
 * learns. Undefined for a row that only speaks. */
export function wordPhrase(
  entry: AnswerEntryShape,
  subject: Subject,
  trigger = 'time'
): string | undefined {
  if (entry.fact !== undefined)
    return trigger === 'time'
      ? `${verb('raise', subject)} ${entry.fact}`
      : `teaches the speaker ${entry.fact}`;
  if (entry.flee !== undefined) return verb('flee', subject);
  if (entry.hold !== undefined) return verb('hold', subject);
  if (entry.attack !== undefined)
    return `${verb('attack', subject)} ${selectorPhrase(entry.attack, subject)}`;
  if (entry.toward !== undefined)
    return `${verb('walk', subject)} toward ${selectorPhrase(entry.toward, subject)}`;
  if (entry.away !== undefined)
    return `${verb('walk', subject)} away from ${selectorPhrase(entry.away, subject)}`;
  return undefined;
}

/** A trigger's heading in prose. */
export function triggerPhrase(trigger: string): string {
  if (trigger === 'time') return 'On its time';
  return `On ${trigger}`;
}

// ---------------------------------------------------------------------------
// The file's own words — the compact readout a collapsed row shows
// ---------------------------------------------------------------------------

/** One condition in the file's own keys: "enemy reach", "heard clang within
 * 2", "fact x", "not …", "an ally attacked within 3". The compact readout
 * beside the sentence, so an author can match a row to the file. */
export function conditionShorthand(condition: AnswerWhenCondition): string {
  if ('enemy' in condition) return `enemy ${condition.enemy}`;
  if ('heard' in condition)
    return `heard ${condition.heard.kind} within ${condition.heard.within}`;
  if ('fact' in condition) return `fact ${condition.fact}`;
  if (isNotCondition(condition))
    return `not ${conditionShorthand(condition.not)}`;
  const deed = deedOf(condition);
  if (deed === undefined) return '';
  const [word, span] = deed;
  // The scope and the span both come off the body, so the readout says whose
  // deed the row reads and not merely which deed.
  const whose =
    span.on !== undefined ? 'an ally' : span.as !== undefined ? 'I' : undefined;
  return whose === undefined
    ? `${word} within ${span.within}`
    : `${whose} ${word} within ${span.within}`;
}

/** A `when` in the file's keys, its conditions joined by "and". */
export function whenShorthand(when: AnswerWhenShape): string {
  return whenConditions(when).map(conditionShorthand).join(' and ');
}

/** The word and what it acts on, in the file's keys: "attack enemy",
 * "fact alarm-raised", "hold". The value is read by the SHAPE the engine's
 * declaration gives the word, so a new word needs no change here. */
export function wordShorthand(entry: AnswerEntryShape, word: string): string {
  const value = (entry as Record<string, unknown>)[word];
  const shape = answerWord(word)?.value;
  if (shape === 'string') return `${word} ${String(value)}`;
  if (shape === 'selector' && typeof value === 'string')
    return `${word} ${value}`;
  return word;
}

/** An ability or skill a check rolls, as a word: "STR", "Persuasion",
 * "Sleight of hand". One home for the lock rows, the concealment checks and
 * the read-back (rpg-project#578). */
export function abilityPhrase(ability: string): string {
  if (ability.length <= 3) return ability.toUpperCase();
  const words = ability.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** One check route: "Investigation DC 14", "DEX DC 15 with thieves-tools". */
export function checkPhrase(check: {
  ability: string;
  dc: number;
  tool?: string;
}): string {
  const head = `${abilityPhrase(check.ability)} DC ${check.dc}`;
  return check.tool ? `${head} with ${check.tool}` : head;
}
