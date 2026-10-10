import { layoutCellCorners } from './layoutGeometry';
import type { RegionResolution } from './studioSession';

/** Only current resolved projections draw an area. No cached/stale polygon. */
export function RegionBoundaryOverlay({
  resolutions,
  selectedId,
  transform,
}: {
  resolutions: readonly RegionResolution[];
  selectedId?: string;
  transform?: string;
}): React.JSX.Element {
  return (
    <g
      className="es-region-boundaries"
      transform={transform}
      pointerEvents="none"
      aria-hidden="true"
    >
      {resolutions.map((resolution) => {
        if (resolution.status !== 'resolved') return null;
        const selected = resolution.id === selectedId;
        const rings =
          resolution.area.kind === 'polygon'
            ? [resolution.area.ring]
            : resolution.area.cells.map(layoutCellCorners);
        return (
          <g key={resolution.id} data-region-id={resolution.id}>
            {rings.map((ring, index) => (
              <polygon
                key={index}
                points={ring.map((point) => `${point.x},${point.z}`).join(' ')}
                fill={selected ? '#67d8c2' : '#91a8fa'}
                fillOpacity={selected ? 0.18 : 0.08}
                stroke={selected ? '#a7ffeb' : '#91a8fa'}
                strokeWidth={selected ? 3 : 2}
                strokeDasharray="7 3"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}
