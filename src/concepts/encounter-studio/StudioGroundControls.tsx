import type { GroundCatalogSnapshot } from '@/rendering/groundCatalog';
import type { RoomRegion } from '../world-building/roomDraft';

/** A region base is distinct from its explicit paint; this control never clears it. */
export function StudioGroundControls({
  region,
  catalog,
  onSetBase,
}: {
  region: RoomRegion;
  catalog: GroundCatalogSnapshot;
  onSetBase(ref: string | null): boolean;
}): React.JSX.Element {
  const ref = region.ground?.baseRef;
  const styles = catalog.status === 'ready' ? catalog.catalog.styles : [];
  const known = ref === undefined || styles.some((style) => style.ref === ref);
  const loading = catalog.status === 'idle' || catalog.status === 'loading';
  return (
    <section className="es-context-panel" aria-label="Ground">
      <h3>Ground</h3>
      <label className="es-field">
        Base ground
        <select
          aria-label="Base ground"
          value={ref ?? ''}
          disabled={loading}
          onChange={(event) => onSetBase(event.target.value || null)}
        >
          <option value="">Stone (default)</option>
          {ref !== undefined && !known && (
            <option value={ref}>Unavailable: {ref}</option>
          )}
          {styles.map((style) => (
            <option key={style.ref} value={style.ref}>
              {style.displayName}
            </option>
          ))}
        </select>
      </label>
      <p className="es-help">
        Painted hexes keep their appearances when the base changes. Erasing
        ground paint restores this base.
      </p>
      {catalog.status === 'ready' && catalog.preview && (
        <p role="status">Candidate ground preview — not published.</p>
      )}
      {loading && <p role="status">Ground appearances loading.</p>}
      {catalog.status === 'error' ? (
        <p role="alert">{catalog.message}</p>
      ) : !known && !loading ? (
        <p role="alert">Ground appearance unavailable: {ref}</p>
      ) : null}
    </section>
  );
}
