/**
 * The faction and disposition vocabulary — OFFERS, NOT RULES.
 *
 * WHAT THIS IS (rpg-project#481 R3). The stance words a select lists, the
 * predicate forms [PredicateEditor] can edit, and the two reserved side names
 * the panels reason about. They exist so a panel can offer real choices.
 *
 * WHAT IT IS NOT. It is not a gate. NO DECODER IN THE WEB REFUSES A FILE
 * AGAINST THESE SETS: `DispositionSpec` seals the stances and
 * `dungeonspec/validate.go` grades a predicate, and
 * `PutDungeon{validate_only}` is where an author meets that verdict. A stance
 * word this list has not learned is a word no select offers and a file that
 * still opens; a predicate form it has not learned is shown read-only in the
 * file's own words and travels to the compiler untouched.
 *
 * EXTRACTED FROM `dungeonYaml.ts` (rpg-dnd5e-web#1136) so the single-room
 * dialect could read the same words without importing the version-2 document
 * model; `dungeonYaml.ts` re-exports every one of them, so its existing
 * consumers are untouched.
 */

/** The three stances the selects OFFER (rpg-project#375 §2). `hostile` is the
 * only one an `until` is legal with — a predicate says when the hostility
 * ENDS, and when it holds the stance becomes `neutral` (R2) — and that rule,
 * like the set itself, is graded by the compiler. */
export const STANCES = ['hostile', 'neutral', 'allied'] as const;
export type Stance = (typeof STANCES)[number];

/** The players' side. NEVER DECLARED under `factions:` — it is the one
 * faction every dungeon has without saying so, and a file that declares it is
 * refused BY THE COMPILER, by name (§2). It IS nameable in a disposition's
 * `between`, which is what the panels use this for. */
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
 *
 * Each form compiles to an encounter `Trigger`; the set is sealed the way
 * `Trigger` is and grows one form per use case. A map this union cannot
 * represent — two keys, a form the editors have not learned — is HELD WHOLE
 * by the codec (`dungeonYaml.ts`'s `PredicateHolder`) and graded by the
 * compiler, never refused at the door. Whether the thing a form names exists
 * is `factionRules.ts`'s inline question.
 */
export type PredicateDoc =
  | { round: number }
  | { down: string }
  | { fact: string }
  | { stance: { between: [string, string]; is: Stance } };

export const PREDICATE_FORMS = ['round', 'down', 'fact', 'stance'] as const;
export type PredicateForm = (typeof PREDICATE_FORMS)[number];

/** Which form a predicate is — the one key it carries. */
export function predicateForm(p: PredicateDoc): PredicateForm {
  if ('round' in p) return 'round';
  if ('down' in p) return 'down';
  if ('fact' in p) return 'fact';
  return 'stance';
}

/** The predicate grammar, spelled for the hint a panel shows beside a field.
 * NOT a refusal sentence: the compiler owns those. */
export const PREDICATE_SHAPE =
  'a predicate is exactly one of { round: N }, { down: <placement id> }, ' +
  '{ fact: <id> }, or { stance: { between: [a, b], is: hostile|neutral|allied } }';
