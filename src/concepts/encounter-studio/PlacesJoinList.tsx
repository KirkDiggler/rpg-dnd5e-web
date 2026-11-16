import { PlacesWayCount } from './PlacesWayCount';
import type { PlacesView } from './usePlacesView';

/** The joins as a list under the rooms: each focuses and selects its mark's
 * join, so every join is reachable by keyboard. */
export function PlacesJoinList({
  view,
  selectedRegionId = null,
}: {
  view: PlacesView;
  /** The place whose ways in are listed (rpg-project#974). */
  selectedRegionId?: string | null;
}): React.JSX.Element | null {
  if (!view.on) return null;
  const joins = view.places?.joins ?? [];
  return (
    <section className="es-places-list" aria-label="Joins">
      <h2>Joins</h2>
      {view.notice && (
        <p role="status" className="es-help es-readback-notice">
          {view.notice}
        </p>
      )}
      {joins.length > 0 && (
        <ul aria-label="Join list">
          {joins.map((join) => (
            <li key={join.id}>
              <button
                type="button"
                data-join-row={join.id}
                aria-pressed={view.selectedJoin?.id === join.id}
                aria-label={view.nameOf(join)}
                data-uses-method={view.methodJoinIds.has(join.id) || undefined}
                aria-describedby={
                  view.methodJoinIds.has(join.id)
                    ? 'es-method-marked'
                    : undefined
                }
                onClick={() => view.selectJoin(join.id)}
              >
                {view.nameOf(join).replace(/^Join: /, '')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <PlacesWayCount view={view} selectedRegionId={selectedRegionId} />
      {(view.places?.unjoined.length ?? 0) > 0 && (
        <ul aria-label="Unreached rooms">
          {view.places!.unjoined.map(({ regionId, statement }) => (
            <li key={regionId}>{statement.sentence}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
