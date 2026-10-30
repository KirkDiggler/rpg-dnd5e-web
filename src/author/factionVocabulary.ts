/**
 * The faction and disposition vocabulary — the closed sets the engine's
 * authoring dialect seals, in ONE home.
 *
 * EXTRACTED FROM `dungeonYaml.ts` UNCHANGED (rpg-dnd5e-web#1136). The site
 * scope in the single-room v4 document (`singleRoomDungeon.ts`,
 * `siteScope.ts`) needs the stance words and the predicate forms, and
 * `dungeonYaml.ts` is the version-2 document model — importing it into the
 * single-room decoder would make the newer dialect depend on the older
 * builder's whole model for three words. So the words live here, both
 * dialects read them, and `dungeonYaml.ts` re-exports every one of them so its
 * existing consumers are untouched.
 *
 * A SECOND SPELLING OF ANY OF THESE IS THE BUG THIS MODULE PREVENTS: a stance
 * the compiler knows and the parser does not is a file the server reads and
 * the builder refuses, which is the failure #1118 undid.
 */

/** The three stances a disposition may declare (rpg-project#375 §2) — a
 * closed set, in the compiler's own words. `hostile` is the only one an
 * `until` is legal with: a predicate says when the hostility ENDS, and
 * when it holds the stance becomes `neutral` (R2). */
export const STANCES = ['hostile', 'neutral', 'allied'] as const;
export type Stance = (typeof STANCES)[number];

/** The players' side. NEVER DECLARED under `factions:` — it is the one
 * faction every dungeon has without saying so, and a file that declares it
 * is refused by name (§2). It IS nameable in a disposition's `between`. */
export const PARTY = 'party';
/** Where every monster that names no faction belongs (R4). Hostile to the
 * party, exactly as every dungeon written before factions existed behaved.
 * A monster's `faction:` is written only when the author chose one, so
 * membership here is spelled by ABSENCE. The side itself MAY be declared
 * under `factions[]` (ruling 2026-09-05) — `{ id: monsters, mind: chief }`
 * is how the unauthored side is given a mind — and its members are then
 * exactly the monsters with no faction key (`factionMembers`). */
export const MONSTERS = 'monsters';

/**
 * A PREDICATE — the one authorable grammar `until` (and, in step B,
 * `arrives` and `endings[].when`) are written in (rpg-project#375 §2).
 *
 * EXACTLY ONE KEY, and the key says which form it is:
 *
 *   `{ round: N }`     any fight in the run has started round N (N ≥ 1)
 *   `{ down: <id> }`   that placement is Down
 *   `{ fact: <id> }`   the fact is known — by the faction's mind on
 *                      `until`, by anyone on `arrives`
 *   `{ stance: { between: [a, b], is: <stance> } }`
 *                      the pair's stance folds to that value
 *   `{ not: <one predicate> }`
 *                      the inner predicate does not hold, judged where and
 *                      when the inner one is (rpg-project#719); never a not
 *                      of a not — see `predicateNot.ts`
 *
 * Each form compiles to an encounter `Trigger`; the set is sealed the way
 * `Trigger` is and grows one form per use case. Two keys in one map is not
 * a predicate this module can represent, so the parser refuses the shape;
 * whether the thing a form names exists is the refusal logic's question
 * (`factionRules.ts`), rendered inline at the field.
 */
export type PredicateDoc =
  | { round: number }
  | { down: string }
  | { fact: string }
  | { stance: { between: [string, string]; is: Stance } }
  /** `{ left: <exit id> }` (rpg-project#716): the last standing party
   * member has left by that exit. LEGAL ONLY AS AN ENDING'S `when`, bare or
   * under a `not`; refused by name everywhere else ([leftOnlyEndings]). */
  | { left: string }
  | { not: PredicateDoc };

export const PREDICATE_FORMS = ['round', 'down', 'fact', 'stance'] as const;
export type PredicateForm = (typeof PREDICATE_FORMS)[number];

/** A form, `left` (an ending's alone), or `not` around one
 * (rpg-project#719). */
export type PredicateKind = PredicateForm | 'left' | 'not';

/** Which form a predicate is — the one key it carries. */
export function predicateForm(p: PredicateDoc): PredicateKind {
  if ('not' in p) return 'not';
  if ('round' in p) return 'round';
  if ('down' in p) return 'down';
  if ('fact' in p) return 'fact';
  if ('left' in p) return 'left';
  return 'stance';
}

/** `leftOnlyEndings` (`dungeonspec/factions.go`): `left` anywhere but an
 * ending's `when`, bare or under a `not`. */
export function leftOnlyEndings(exit: string): string {
  return (
    '`left` waits for the party to walk out, and only an ending waits for that ' +
    '(`endings: [{ id, when: { left: ' +
    exit +
    ' }, outcome: success|failure }]`)'
  );
}

/** The two outcomes an ending names (`encounter.ResultSuccess`,
 * `ResultFailure`). */
export const ENDING_OUTCOMES = ['success', 'failure'] as const;
export type EndingOutcome = (typeof ENDING_OUTCOMES)[number];

/** THE ENGINE'S ENDING SENTENCES (`dungeonspec/grammar.go` `endings`,
 * `endingIf`, rpg-project#716), word for word. */
export const ENDING_SENTENCES = Object.freeze({
  /** An `outcome` that is neither word. */
  outcome: (word: string): string =>
    `\`outcome: ${word}\`: an ending's outcome is success or failure`,
  /** An ending with no `when`. */
  noWhen: (): string =>
    `the ending does not say when it fires — ${PREDICATE_SHAPE}, or { left: <exit id> }`,
  /** An `if` beside a `when` that is not a leave. */
  ifOnlyBesideLeft: (): string =>
    'only an ending that waits for the party to leave, `when: { left: <exit id> }`, has an `if`',
  /** A leave ending with no `outcome`. */
  leaveNeedsOutcome: (): string =>
    'an ending on leaving says what leaving means: `outcome: success` or `outcome: failure`',
  /** An `if` of a form it cannot be (`round`, `holds`, `left`). */
  ifWrongForm: (form: string): string =>
    "an ending's `if` is { down: <placement id> }, { fact: <id> } or " +
    '{ stance: { between: [a, b], is: hostile|neutral|allied } }, or { not: } one of them, ' +
    `and \`${form}\` is none of them`,
});

/** The predicate grammar, spelled for a refusal a streamer can act on. */
export const PREDICATE_SHAPE =
  'a predicate is exactly one of { round: N }, { down: <placement id> }, ' +
  '{ fact: <id> }, or { stance: { between: [a, b], is: hostile|neutral|allied } }';
