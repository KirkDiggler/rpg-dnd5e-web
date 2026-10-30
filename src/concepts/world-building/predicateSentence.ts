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
import { MONSTERS, PARTY, type PredicateDoc } from '@/author/factionVocabulary';
import { turnsTo } from './engineLaws';
import { documentPlacementNames } from './placementNames';
import type { RoomDraftDocument, RoomGameplayData } from './roomDraft';
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
  if ('not' in predicate) return notSentence(predicate.not, ctx);
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

/** A `not` (rpg-project#719) as the clause that completes "until …" or
 * "when …": the inner predicate, turned over. */
function notSentence(inner: PredicateDoc, ctx: PredicateContext): string {
  if ('not' in inner) return `it is not so that ${notSentence(inner.not, ctx)}`;
  if ('round' in inner) return `round ${inner.round} has not begun`;
  if ('down' in inner)
    return `${ctx.names.get(inner.down) ?? inner.down} is not down`;
  if ('fact' in inner)
    return ctx.mindName !== undefined
      ? `${ctx.mindName}${ctx.mindName.includes(',') ? ',' : ''} does not know ${inner.fact}`
      : `${inner.fact} is not known`;
  const [a, b] = inner.stance.between;
  return `${sideName(a)} and ${sideName(b)} are no longer ${inner.stance.is}`;
}

/** The minds of a pair, as the noun phrase a fact `until` waits on: each
 * declared faction of the two that names a mind, "captain, the garrison's
 * mind". Undefined when neither side has a mind. */
export function pairMindName(
  document: Readonly<RoomDraftDocument>,
  between: readonly [string, string]
): string | undefined {
  return pairMindNameIn(
    document.scope,
    document.draft.room,
    documentPlacementNames(document),
    between
  );
}

/** [pairMindName] for a caller holding the scope, the room and the shown
 * names. */
export function pairMindNameIn(
  scope: Readonly<SiteScope>,
  room: Readonly<
    Pick<RoomGameplayData, 'monsterDeclarations' | 'monsterBindings'>
  >,
  names: ReadonlyMap<string, string>,
  between: readonly [string, string]
): string | undefined {
  // THE PARTY HAS NO MIND. A declared faction's mind is the one it names,
  // else — for a faction of one — its sole member, which the authoring
  // compiler declares as its mind (`dungeonspec/compile.go`, the singleton
  // default). A side with neither has no mind to know anything.
  const minds = between.flatMap((id) => {
    const faction = (scope.factions ?? []).find((f) => f.id === id);
    if (faction === undefined) return [];
    const members = room.monsterDeclarations.filter(
      (m) => room.monsterBindings?.[m.id]?.faction === id
    );
    const mind =
      faction.mind ?? (members.length === 1 ? members[0]!.id : undefined);
    if (mind === undefined) return [];
    return [`${names.get(mind) ?? mind}, ${possessive(sideName(id))} mind`];
  });
  if (minds.length === 0) return undefined;
  return minds.join(', or ');
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
