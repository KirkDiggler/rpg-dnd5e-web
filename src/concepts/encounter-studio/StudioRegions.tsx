import type { EncounterStudioSession } from './studioSession';

/** Region identities and settings remain scene-owned, linked to map labels. */
export function StudioRegions({
  session,
  onSelect,
  onCreate,
  canCreate,
}: {
  session: EncounterStudioSession;
  onSelect(labelId: string): void;
  onCreate(): void;
  canCreate: boolean;
}): React.JSX.Element {
  const scene = session.document.draft.scene;
  const regions = scene.authoringRegions ?? [];
  return (
    <section className="es-context-panel" aria-label="Encounter regions">
      <h2>Regions & lighting</h2>
      <p className="es-help">
        Define rooms and outdoor areas, repair their boundaries, and set their
        background light.
      </p>
      <button type="button" onClick={onCreate} disabled={!canCreate}>
        New region
      </button>
      {!canCreate && (
        <p className="es-help">
          Switch to Layout to create or paint a region. Existing lighting can be
          edited here.
        </p>
      )}
      {regions.length === 0 ? (
        <p className="es-help">
          No regions yet. Create a named room or outdoor area to get started.
        </p>
      ) : (
        <ul className="es-region-list">
          {regions.map((region) => {
            const label = scene.mapLabels?.find(
              (value) => value.id === region.labelId
            );
            const selected =
              session.mapLabelSelection.selectedId === region.labelId;
            return (
              <li key={region.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-label={`Edit region ${label?.text ?? region.id}`}
                  onClick={() => onSelect(region.labelId)}
                >
                  {label?.text ?? region.id}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
