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
import { ANSWER_SEARCH, answerWord } from '@/author/answerVocabulary';
import {
  isNotCondition,
  selectorCell,
  selectorRoute,
  selectorRouteParam,
  whenConditions,
  type AnswerCellShape,
  type AnswerEntryShape,
  type AnswerSelectorShape,
  type AnswerWaypointShape,
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
  dash: { I: 'dash', it: 'dashes' },
  land: { I: 'I land', it: 'it lands' },
  hold: { I: 'hold', it: 'holds' },
  search: { I: 'search', it: 'searches' },
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

/** One enemy band, the five exclusive answers to "where is the enemy" — and
 * the three move words (rpg-project#671), what this turn's movement buys
 * against it: a walk puts me in reach, only a dash does, or not even a
 * dash. */
export function enemyBandPhrase(band: string): string {
  if (band === 'none') return 'no enemy is seen or remembered';
  if (band === 'reach') return 'an enemy is in reach';
  if (band === 'lost') return 'an enemy is lost where it was last seen';
  if (band === 'walk') return 'an enemy is a walk away';
  if (band === 'dash') return 'an enemy is only a dash away';
  if (band === 'far') return 'an enemy is beyond a dash';
  return `an enemy is ${band}`;
}

/** The negative of one enemy band. */
function notEnemyBandPhrase(band: string): string {
  if (band === 'none') return 'an enemy is seen or remembered';
  if (band === 'reach') return 'no enemy is in reach';
  if (band === 'lost') return 'no enemy is lost';
  if (band === 'walk') return 'no enemy is a walk away';
  if (band === 'dash') return 'no enemy is only a dash away';
  if (band === 'far') return 'no enemy is beyond a dash';
  return `no enemy is ${band}`;
}

/** `threat:` (rpg-project#671 R18) — who ELSE could reach where the row's
 * move lands and swing next turn: nobody, a walking foe, or only a dashing
 * one. Judged at the row's landing cell; the row's own target does not
 * count. */
export function threatPhrase(
  word: string,
  subject: Subject,
  negated = false
): string {
  const where = `where ${verb('land', subject)}`;
  if (word === 'none')
    return negated
      ? `someone else could reach ${where}`
      : `nobody else could reach ${where}`;
  if (word === 'walk')
    return negated
      ? `no walking foe could reach ${where}`
      : `a walking foe could reach ${where}`;
  if (word === 'dash')
    return negated
      ? `it is not so that only a dashing foe could reach ${where}`
      : `only a dashing foe could reach ${where}`;
  return `threat ${word}`;
}

/** The `threat` picker's label for one word. */
export function threatLabel(word: string, subject: Subject = 'I'): string {
  return threatPhrase(word, subject);
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
  if ('threat' in condition)
    return threatPhrase(condition.threat, subject, negated);
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

/** A cell in the room's own spelling, as the engine spells one back to its
 * author (`singleRoomCells.spell`): `{q: 1, r: -1}`. */
export function cellPhrase(cell: AnswerCellShape): string {
  return `{q: ${cell.q}, r: ${cell.r}}`;
}

/** A waypoint in the file's own spelling, its pause included when it
 * states one: `{q: -7, r: 9, wait: 2, facing: se}`. */
export function waypointPhrase(waypoint: AnswerWaypointShape): string {
  const pause = [
    ...(waypoint.wait !== undefined ? [`wait: ${waypoint.wait}`] : []),
    ...(waypoint.facing !== undefined ? [`facing: ${waypoint.facing}`] : []),
  ];
  return pause.length === 0
    ? cellPhrase(waypoint)
    : `{q: ${waypoint.q}, r: ${waypoint.r}, ${pause.join(', ')}}`;
}

/** Where a route stands and which way it faces there (rpg-project#624):
 * "2 rounds facing se at {q: -7, r: 9}". A waypoint with no wait is walked
 * through, so it says nothing. */
function pausesPhrase(route: readonly AnswerWaypointShape[]): string {
  const stands = route
    .filter((waypoint) => (waypoint.wait ?? 0) > 0)
    .map((waypoint) => {
      const rounds =
        waypoint.wait === 1 ? '1 round' : `${waypoint.wait} rounds`;
      const facing = waypoint.facing ? ` facing ${waypoint.facing}` : '';
      return `${rounds}${facing} at ${cellPhrase(waypoint)}`;
    });
  return stands.length === 0 ? '' : `, standing ${joinAnd(stands)}`;
}

/** A route's length in words: "1 cell", "4 cells". */
function cellsPhrase(count: number): string {
  return count === 1 ? '1 cell' : `${count} cells`;
}

/** What a selector names, from the subject's side. A cell or a route is a
 * place rather than a figure, and reads as one. */
export function selectorPhrase(
  selector: AnswerSelectorShape,
  subject: Subject
): string {
  const cell = selectorCell(selector);
  if (cell !== undefined) return cellPhrase(cell);
  const route = selectorRoute(selector);
  if (route !== undefined)
    return `a route through ${cellsPhrase(route.length)}${pausesPhrase(route)}`;
  const routeParam = selectorRouteParam(selector);
  if (routeParam !== undefined) return `the route $${routeParam}`;
  if (selector === 'enemy') return 'the enemy';
  if (selector === 'attacker') return `whoever hit ${verb('object', subject)}`;
  if (selector === 'actor') return 'whoever did it';
  if (selector === 'sound') return 'the sound';
  return String(selector);
}

/** One waypoint as a loop names it: its cell, and its stand when it has one
 * — "{q: -5, r: 8} (waits 1, faces ne)". */
function loopStopPhrase(waypoint: AnswerWaypointShape): string {
  const pause = [
    ...(waypoint.wait !== undefined ? [`waits ${waypoint.wait}`] : []),
    ...(waypoint.facing !== undefined ? [`faces ${waypoint.facing}`] : []),
  ];
  return pause.length === 0
    ? cellPhrase(waypoint)
    : `${cellPhrase(waypoint)} (${pause.join(', ')})`;
}

/** A route as the loop it walks, every waypoint named in order with its
 * stand (rpg-project#720): "its loop by {q: -5, r: 8} (waits 1, faces ne),
 * {q: -5, r: 10} (waits 1, faces se) and {q: -7, r: 10}". */
export function loopPhrase(
  route: readonly AnswerWaypointShape[],
  subject: Subject
): string {
  const whose = subject === 'I' ? 'my' : 'its';
  return `${whose} loop by ${joinAnd(route.map(loopStopPhrase))}`;
}

/** `toward` on a selector: a figure is walked TOWARD, a cell is walked ONTO
 * ("walks to {q: 1, r: 1}"), and a route is walked round, its waypoints named
 * ("walks its loop by {q: -5, r: 8} (waits 1, faces ne) and …"). `dash`
 * reads the same with its own verb: "dashes toward the enemy". */
function towardPhrase(
  selector: AnswerSelectorShape,
  subject: Subject,
  how: 'walk' | 'dash' = 'walk'
): string {
  const walk = verb(how, subject);
  const cell = selectorCell(selector);
  if (cell !== undefined) return `${walk} to ${cellPhrase(cell)}`;
  const route = selectorRoute(selector);
  if (route !== undefined && route.length > 0)
    return `${walk} ${loopPhrase(route, subject)}`;
  if (route !== undefined || selectorRouteParam(selector) !== undefined)
    return `${walk} ${selectorPhrase(selector, subject)}`;
  return `${walk} toward ${selectorPhrase(selector, subject)}`;
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
  if (entry.toward !== undefined) return towardPhrase(entry.toward, subject);
  if (entry.dash !== undefined)
    return towardPhrase(entry.dash, subject, 'dash');
  if (entry.away !== undefined)
    return `${verb('walk', subject)} away from ${selectorPhrase(entry.away, subject)}`;
  if (entry.search !== undefined)
    return `${verb('search', subject)} ${entry.search.distance ?? ANSWER_SEARCH.defaultDistance} cells on, ${headingPhrase(entry.search.heading ?? ANSWER_SEARCH.defaultHeading)}, then give${subject === 'it' ? 's' : ''} up`;
  return undefined;
}

/** Which way a search walks, in prose (rpg-project#679 R10). */
function headingPhrase(heading: string): string {
  switch (heading) {
    case 'faced':
      return 'the way they faced';
    case 'left':
      return 'a quarter left of the way they went';
    case 'right':
      return 'a quarter right of the way they went';
    default:
      return 'the way they went';
  }
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
  if ('threat' in condition) return `threat ${condition.threat}`;
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
  if (shape === 'search') {
    const body = value as { distance?: number; heading?: string } | undefined;
    return [word, body?.distance, body?.heading]
      .filter((part) => part !== undefined)
      .join(' ');
  }
  if (shape === 'selector') {
    const selector = value as AnswerSelectorShape;
    const cell = selectorCell(selector);
    if (cell !== undefined) return `${word} at ${cellPhrase(cell)}`;
    const route = selectorRoute(selector);
    if (route !== undefined)
      return `${word} path ${route.map(waypointPhrase).join(' ')}`;
    const routeParam = selectorRouteParam(selector);
    if (routeParam !== undefined) return `${word} path $${routeParam}`;
  }
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
