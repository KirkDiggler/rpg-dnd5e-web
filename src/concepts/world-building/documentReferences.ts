/**
 * WHAT NAMES A SITE NOUN, AND RENAMING IT EVERYWHERE (rpg-project#578).
 *
 * The cast's law (rpg-project#575) applied to concealments and exits: a
 * rename rewrites every reference in the draft in the same edit, and a
 * remove is refused while anything still names the noun, naming what does.
 * A dangling name is a file the toolkit refuses (`intel[i].reveals
 * .concealment`, `scenarios.<id>.<field>`), so the studio never writes one.
 *
 * What can name them. A concealment is named by an intel record's
 * `reveals.concealment` only: a scenario binding resolves against
 * monsters, declared props, exits and factions (rpg-toolkit `grammar.go`
 * `scenarios`), never a concealment. An exit is named by a scenario
 * binding, but a binding carries no kind, so a value names the exit only
 * when nothing else in the document has that id: a monster, a declared prop
 * or a faction sharing it is what the binding may mean, and is left alone.
 * A door's Hidden by is the concealment's own `props`, so it travels with
 * the concealment; no predicate form names a concealment or an exit, so
 * endings never do.
 */
import type { RoomDraftDocument } from './roomDraft';
import type { SiteScope } from './siteScope';

/** Each thing in the draft that names this concealment, in words. */
export function concealmentReferrers(scope: SiteScope, id: string): string[] {
  return (scope.intel ?? [])
    .filter(
      (record) =>
        'concealment' in record.reveals && record.reveals.concealment === id
    )
    .map((record) => `intel ${record.id}`);
}

/** Whether a scenario value equal to this exit's id can only mean the exit:
 * no monster, declared prop or faction shares the id. */
function bindingNamesExit(document: RoomDraftDocument, id: string): boolean {
  const room = document.draft.room;
  return (
    !room.monsterDeclarations.some((monster) => monster.id === id) &&
    !Object.hasOwn(room.propDeclarations, id) &&
    !(document.scope.factions ?? []).some((faction) => faction.id === id)
  );
}

/** Each scenario binding that names this exit: "scenario hold-out exit". */
export function exitReferrers(
  document: RoomDraftDocument,
  id: string
): string[] {
  if (!bindingNamesExit(document, id)) return [];
  return Object.entries(document.scope.scenarios ?? {}).flatMap(
    ([scenario, fields]) =>
      Object.entries(fields)
        .filter(([, value]) => value === id)
        .map(([field]) => `scenario ${scenario} ${field}`)
  );
}

/** The refusal for removing a noun something still names. */
export function stillNamedRefusal(
  noun: string,
  referrers: readonly string[]
): string {
  return `${noun} is still named by ${referrers.join(', ')}. Change or remove those first.`;
}

/** Every scenario binding that names exit `from` names `to` instead. A
 * value another kind of noun shares is not the exit's, and is kept. */
export function renameExitReferences(
  document: RoomDraftDocument,
  from: string,
  to: string
): SiteScope {
  const scope = document.scope;
  if (!scope.scenarios || !bindingNamesExit(document, from)) return scope;
  return {
    ...scope,
    scenarios: Object.fromEntries(
      Object.entries(scope.scenarios).map(([scenario, fields]) => [
        scenario,
        Object.fromEntries(
          Object.entries(fields).map(([field, value]) => [
            field,
            value === from ? to : value,
          ])
        ),
      ])
    ),
  };
}

/** Every intel record revealing concealment `from` reveals `to` instead. */
export function renameRevealReferences(
  scope: SiteScope,
  from: string,
  to: string
): SiteScope {
  if (!scope.intel) return scope;
  return {
    ...scope,
    intel: scope.intel.map((record) =>
      'concealment' in record.reveals && record.reveals.concealment === from
        ? { ...record, reveals: { concealment: to } }
        : record
    ),
  };
}
