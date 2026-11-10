import type { MaterialOverride } from '@/rendering/worldMaterialTypes';
import type { WorldMaterialCatalogState } from '../world-building/useWorldMaterialCatalog';

/** Form-only values: the existing Arrange Apply/Cancel transaction owns saving.
 * This is an authored-UV pack selector, not masonry projection or A/B authoring. */
export function StudioTexturePackControls({
  assetRef,
  glbSha256,
  catalog,
  values,
  onChange,
}: {
  assetRef: string;
  glbSha256?: string;
  catalog: WorldMaterialCatalogState;
  values: readonly MaterialOverride[];
  onChange(values: MaterialOverride[]): void;
}): React.JSX.Element | null {
  const atlas = catalog.catalog?.atlas;
  const binding = atlas?.bindings.find((row) => row.assetRef === assetRef);
  if (!binding && !values.length) return null;
  const reset =
    values.length > 0 ? (
      <button type="button" onClick={() => onChange([])}>
        Use original texture
      </button>
    ) : null;
  const issue =
    catalog.status !== 'ready'
      ? catalog.message
      : !binding
        ? 'No declared atlas binding for this appearance.'
        : binding.glbSha256 !== glbSha256
          ? 'Atlas binding geometry differs from this wall or prop.'
          : undefined;
  if (issue)
    return (
      <fieldset>
        <legend>Texture pack</legend>
        <p role="alert">{issue}</p>
        {reset}
      </fieldset>
    );
  const unknown = values.filter(
    (value) =>
      !binding!.surfaces.some((surface) => surface.id === value.surfaceId)
  );
  return (
    <fieldset className="es-texture-pack">
      <legend>Texture pack</legend>
      <p className="es-help">
        Uses the model’s authored UVs. Apply saves this placement only.
      </p>
      {binding!.surfaces.map((surface) => {
        const current =
          values.find((value) => value.surfaceId === surface.id)?.materialRef ??
          '';
        const missing =
          current &&
          !atlas!.materials.some((material) => material.ref === current);
        return (
          <label key={surface.id}>
            {binding!.surfaces.length === 1
              ? 'Texture pack'
              : `Texture pack · ${surface.id}`}
            <select
              aria-label={
                binding!.surfaces.length === 1
                  ? 'Texture pack'
                  : `Texture pack ${surface.id}`
              }
              value={current}
              onChange={(event) => {
                const next = values
                  .filter((value) => value.surfaceId !== surface.id)
                  .map((value) => ({ ...value }));
                if (event.target.value)
                  next.push({
                    surfaceId: surface.id,
                    materialRef: event.target.value,
                  });
                onChange(next);
              }}
            >
              <option value="">Original</option>
              {missing && (
                <option value={current} disabled>
                  Unavailable: {current}
                </option>
              )}
              {atlas!.materials.map((material) => (
                <option key={material.ref} value={material.ref}>
                  {material.displayName}
                </option>
              ))}
            </select>
            {missing && (
              <span role="alert">
                Selected texture pack is unavailable; choose a supported pack or
                Original.
              </span>
            )}
          </label>
        );
      })}
      {unknown.length > 0 && (
        <p role="alert">
          Selected material scope is unavailable:{' '}
          {unknown.map((value) => value.surfaceId).join(', ')}.
        </p>
      )}
      {reset}
    </fieldset>
  );
}
