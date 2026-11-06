import type { GroundCatalogSnapshot } from '@/rendering/groundCatalog';
import { useId, useMemo, useState } from 'react';
import {
  groundTilesFromRegions,
  hasGroundAppearance,
} from '../world-building/regionGroundTiles';
import type { RoomHexCell, RoomRegion } from '../world-building/roomDraft';
import { layoutCellCorners } from './layoutGeometry';

/** World-anchored texture feedback for the same cell assignments the 3D view uses. */
export function LayoutGroundOverlay({
  cells,
  regions,
  catalog,
}: {
  cells: readonly RoomHexCell[];
  regions: readonly RoomRegion[];
  catalog?: GroundCatalogSnapshot;
}): React.JSX.Element {
  const namespace = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [failedImages, setFailedImages] = useState<ReadonlySet<string>>(
    new Set()
  );
  const assignments = useMemo(() => {
    if (!hasGroundAppearance(regions))
      return new Map<string, string | undefined>();
    return new Map(
      groundTilesFromRegions(regions).map((tile) => [
        `${tile.cell.x},${tile.cell.z}`,
        tile.ref,
      ])
    );
  }, [regions]);
  if (assignments.size === 0)
    return <g aria-label="Ground appearances" pointerEvents="none" />;
  const styles = catalog?.status === 'ready' ? catalog.catalog.styles : [];
  const indexed = new Map(
    styles.map((style, index) => [
      style.ref,
      { style, id: `ground-${namespace}-${index}` },
    ])
  );
  return (
    <g aria-label="Ground appearances" pointerEvents="none">
      <defs>
        {styles.map((style, index) => (
          <pattern
            key={style.ref}
            id={`ground-${namespace}-${index}`}
            patternUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={style.worldUnitsPerRepeat}
            height={style.worldUnitsPerRepeat}
          >
            <image
              href={`/models/synty/${style.diffuse}`}
              x={0}
              y={0}
              width={style.worldUnitsPerRepeat}
              height={style.worldUnitsPerRepeat}
              preserveAspectRatio="none"
              onError={() =>
                setFailedImages((old) => new Set([...old, style.sha256]))
              }
            />
          </pattern>
        ))}
      </defs>
      {cells.map((cell) => {
        const key = `${cell.q},${cell.r}`;
        const ref = assignments.get(key);
        if (ref === undefined) return null;
        const resource = indexed.get(ref);
        const available = resource && !failedImages.has(resource.style.sha256);
        return (
          <polygon
            key={key}
            data-ground-cell={key}
            data-ground-ref={ref}
            data-ground-error={!available || undefined}
            points={layoutCellCorners(cell)
              .map((p) => `${p.x},${p.z}`)
              .join(' ')}
            fill={available ? `url(#${resource.id})` : '#d850a0'}
            stroke="#2d414e"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          >
            <title>
              {available
                ? resource.style.displayName
                : `Ground appearance unavailable: ${ref}`}
            </title>
          </polygon>
        );
      })}
    </g>
  );
}
