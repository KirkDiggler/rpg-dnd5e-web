import type { AuthoringRegion, EncounterStudioSession } from './studioSession';
export function StudioRegionFinishes({
  region,
  session,
}: {
  region: AuthoringRegion;
  session: EncounterStudioSession;
}): React.JSX.Element | null {
  const owner = session.regionEditing.finishes;
  if (!owner) return null;
  const status = owner.projection.regions.find((r) => r.id === region.id);
  const materialRef = region.wallFinish?.materialRef ?? '';
  const materials =
    owner.catalog.catalog?.materials.filter((m) => m.family === 'masonry') ??
    [];
  const current =
    status?.corners.findIndex(
      (corner) =>
        JSON.stringify(corner.reference) ===
        JSON.stringify(region.wallFinish?.patternStart)
    ) ?? -1;
  return (
    <fieldset className="es-region-finish">
      <legend>Wall finish</legend>
      <p className="es-help">{owner.catalog.message}</p>
      <label>
        Room masonry
        <select
          aria-label="Room masonry"
          value={materialRef}
          disabled={!status?.corners.length || owner.catalog.status !== 'ready'}
          onChange={(event) =>
            owner.set(
              region.id,
              event.target.value ? { materialRef: event.target.value } : null
            )
          }
        >
          <option value="">Authored appearance</option>
          {materialRef && !materials.some((m) => m.ref === materialRef) && (
            <option value={materialRef}>Unavailable selected finish</option>
          )}
          {materials.map((material) => (
            <option key={material.ref} value={material.ref}>
              {material.displayName}
            </option>
          ))}
        </select>
      </label>
      {region.wallFinish && (
        <>
          <label>
            Pattern start
            <select
              aria-label="Pattern start"
              value={current < 0 ? '' : String(current)}
              disabled={!status?.corners.length}
              onChange={(event) => {
                const corner = status?.corners[Number(event.target.value)];
                if (corner)
                  owner.set(region.id, { patternStart: corner.reference });
              }}
            >
              {current < 0 && (
                <option value="" disabled>
                  Choose a new pattern start
                </option>
              )}
              {status?.corners.map((corner, index) => (
                <option key={JSON.stringify(corner.reference)} value={index}>
                  Corner {index + 1} · X {Number(corner.point.x.toFixed(2))}, Z{' '}
                  {Number(corner.point.z.toFixed(2))}
                </option>
              ))}
            </select>
          </label>
          <p className="es-help">
            ◆ marks the closing seam. Brick size stays fixed around the room.
            Walls repeat rather than stretch.
          </p>
          <button type="button" onClick={() => owner.set(region.id, null)}>
            Restore authored appearance
          </button>
        </>
      )}
      {owner.catalog.status === 'ready' && !status?.corners.length && (
        <p className="es-help">
          Wall finishes need a resolved room enclosed by walls, not a painted
          area.
        </p>
      )}
      {status?.status === 'unresolved' && (
        <p role="alert">Finish unapplied: {status.reason}</p>
      )}
      <p className="es-help">
        Studio only. Caps and door artwork keep their authored appearance.
      </p>
    </fieldset>
  );
}
