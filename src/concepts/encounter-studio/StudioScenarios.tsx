import { documentPlacementNames } from '../world-building/placementNames';
import { sideName } from '../world-building/predicateSentence';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { AboutPanel } from './FieldHelp';

/** What a scenario binding's value names, in words: a placement by its
 * shown name, a declared prop by its label, an exit, or a faction. An id
 * this document does not name reads as itself; the engine judges it. */
function boundName(
  document: Readonly<RoomDraftDocument>,
  names: ReadonlyMap<string, string>,
  id: string
): string {
  const placement = names.get(id);
  if (placement !== undefined) return placement;
  const item = document.draft.scene.items.find((entry) => entry.id === id);
  if (item) return item.label?.trim() ? item.label : id;
  if ((document.scope.exits ?? []).some((exit) => exit.id === id))
    return `exit ${id}`;
  if ((document.scope.factions ?? []).some((faction) => faction.id === id))
    return sideName(id);
  return id;
}

/** The Encounter home's Scenarios, read-only (rpg-project#578, H6): each
 * scenario id and its field-to-thing bindings. Editing them is a later
 * slice; nothing here is an input. */
export function StudioScenarios({
  document,
}: {
  document: Readonly<RoomDraftDocument>;
}): React.JSX.Element {
  const scenarios = Object.entries(document.scope.scenarios ?? {});
  const names = documentPlacementNames(document);
  return (
    <section aria-label="Scenarios" className="es-social-panel es-scenarios">
      <h2>Scenarios</h2>
      <AboutPanel>
        <p>
          A scenario binds its fields to things in this encounter. They are
          shown here as written; editing them is not in the studio yet.
        </p>
      </AboutPanel>
      {scenarios.length === 0 ? (
        <p className="es-help">None.</p>
      ) : (
        <ul className="es-inspector-list" aria-label="Authored scenarios">
          {scenarios.map(([id, fields]) => (
            <li key={id} data-scenario={id}>
              <strong>{id}</strong>
              {Object.keys(fields).length === 0 ? (
                <p className="es-help">No bindings.</p>
              ) : (
                <ul aria-label={`Bindings of ${id}`}>
                  {Object.entries(fields).map(([field, value]) => (
                    <li key={field} title={value}>
                      {field} → {boundName(document, names, value)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
