/**
 * The shared predicate as a SENTENCE (rpg-project#576, B12) — a
 * disposition's `until`, a binding's `arrives`, an ending's `when`.
 *
 * One grammar, four forms (`@/author/factionVocabulary` `PredicateDoc`), so
 * one function says them all and no screen shows a predicate as JSON or as
 * "fact x".
 *
 * WHOSE KNOWLEDGE A FACT IS depends on where the predicate stands, and the
 * caller says so: on an `until` the pair's MIND must know it (rpg-toolkit
 * `rulebooks/dnd5e/encounter/field.go` `TriggerFact`, the audience grain),
 * so the caller passes `mindName`; on `arrives` and an ending anyone's
 * knowing counts (the truth grain), and the sentence says the fact "is
 * known".
 */
import {
  MONSTERS,
  PARTY,
  type PredicateDoc,
  type Stance,
} from '@/author/factionVocabulary';
import { documentPlacementNames } from './placementNames';
import type { RoomDraftDocument } from './roomDraft';
import type { SiteDisposition, SiteScope } from './siteScope';

export interface PredicateContext {
  /** Who must know a fact, as a noun phrase: "captain, the garrison's mind".
   * Absent: anyone knowing it counts. */
  mindName?: string;
  /** Placement id to its shown name. */
  names: ReadonlyMap<string, string>;
}

/** A side as prose: "the party", "the garrison". */
export function sideName(id: string): string {
  if (id === PARTY) return 'the party';
  if (id === MONSTERS) return 'the monsters';
  return `the ${id}`;
}

/** "the garrison’s", "the goblins’". */
export function possessive(noun: string): string {
  return noun.endsWith('s') ? `${noun}’` : `${noun}’s`;
}

/** One predicate, as the clause that completes "until …" or "when …". */
export function predicateSentence(
  predicate: PredicateDoc,
  ctx: PredicateContext
): string {
  if ('round' in predicate) return `round ${predicate.round} begins`;
  if ('down' in predicate)
    return `${ctx.names.get(predicate.down) ?? predicate.down} is down`;
  if ('fact' in predicate)
    return ctx.mindName !== undefined
      ? `${ctx.mindName}${ctx.mindName.includes(',') ? ',' : ''} knows ${predicate.fact}`
      : `${predicate.fact} is known`;
  const [a, b] = predicate.stance.between;
  return `${sideName(a)} and ${sideName(b)} are ${predicate.stance.is}`;
}

/** The minds of a pair, as the noun phrase a fact `until` waits on: each
 * declared faction of the two that names a mind, "captain, the garrison's
 * mind", or "the goblins’ mind" for a faction that names none. Undefined
 * when neither side is a declared faction. */
export function pairMindName(
  document: Readonly<RoomDraftDocument>,
  between: readonly [string, string]
): string | undefined {
  return pairMindNameIn(
    document.scope,
    documentPlacementNames(document),
    between
  );
}

/** [pairMindName] for a caller holding the scope and the shown names. */
export function pairMindNameIn(
  scope: Readonly<SiteScope>,
  names: ReadonlyMap<string, string>,
  between: readonly [string, string]
): string | undefined {
  // THE PARTY HAS NO MIND, and a declared faction that names none still has
  // the slot: the authoring compiler declares a faction of one's member as
  // its mind (`world.go` `mindOf`), so the sentence names the role.
  const minds = between.flatMap((id) => {
    const faction = (scope.factions ?? []).find((f) => f.id === id);
    if (faction === undefined) return [];
    const role = `${possessive(sideName(id))} mind`;
    if (faction.mind === undefined) return [role];
    return [`${names.get(faction.mind) ?? faction.mind}, ${role}`];
  });
  if (minds.length === 0) return undefined;
  return minds.join(', or ');
}

/** The stance a declared one turns to when its `until` holds: the other of
 * hostile and neutral (rpg-toolkit `rulebooks/dnd5e/encounter/dungeonspec/
 * factions.go` `turnsTo`). An allied pair carries no `until`; the decoder
 * refuses one. */
export function turnsTo(stance: Stance): Stance {
  if (stance === 'hostile') return 'neutral';
  if (stance === 'neutral') return 'hostile';
  return stance;
}

const capitalized = (word: string) =>
  word.charAt(0).toUpperCase() + word.slice(1);

/** One disposition, said from one side of it: "Neutral to the party until
 * captain, the garrison's mind, knows party-recognized; then hostile." With
 * no `until`: "Neutral to the party, with nothing that turns it." */
export function dispositionSentence(
  disposition: Readonly<SiteDisposition>,
  from: string,
  document: Readonly<RoomDraftDocument>
): string {
  const [a, b] = disposition.between;
  const other = a === from ? b : a;
  const head = `${capitalized(disposition.stance)} to ${sideName(other)}`;
  if (disposition.until === undefined)
    return `${head}, with nothing that turns it.`;
  return `${head} until ${untilClause(disposition, document)}; then ${turnsTo(disposition.stance)}.`;
}

/** The same disposition from neither side, for the authored list: "the
 * garrison and the party are neutral until …; then hostile." */
export function dispositionLine(
  disposition: Readonly<SiteDisposition>,
  document: Readonly<RoomDraftDocument>
): string {
  const [a, b] = disposition.between;
  const head = `${capitalized(sideName(a))} and ${sideName(b)} are ${disposition.stance}`;
  if (disposition.until === undefined)
    return `${head}, with nothing that turns them.`;
  return `${head} until ${untilClause(disposition, document)}; then ${turnsTo(disposition.stance)}.`;
}

function untilClause(
  disposition: Readonly<SiteDisposition>,
  document: Readonly<RoomDraftDocument>
): string {
  return predicateSentence(disposition.until!, {
    names: documentPlacementNames(document),
    mindName:
      'fact' in disposition.until!
        ? pairMindName(document, disposition.between)
        : undefined,
  });
}
