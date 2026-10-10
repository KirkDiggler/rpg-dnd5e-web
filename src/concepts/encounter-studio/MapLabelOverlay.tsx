import type { MapLabel, WorldPoint } from '../world-building/types';
import { worldToClient, type LayoutTransform } from './layoutGeometry';
import { regionStatus } from './StudioArrangeFields';
import type { AuthoringRegion, RegionResolution } from './studioSession';

interface MapLabelOverlayProps {
  labels: readonly MapLabel[];
  transform: LayoutTransform;
  selectedId: string | null;
  preview: { id: string; location: WorldPoint } | null;
  onSelect(id: string): void;
  regions?: readonly AuthoringRegion[];
  resolutions?: readonly RegionResolution[];
}

/** Root-SVG pixel overlay: text stays screen-sized while its world anchor pans
 * and zooms with the same transform as the floor. React escapes authored text. */
export function MapLabelOverlay({
  labels,
  transform,
  selectedId,
  preview,
  onSelect,
  regions,
  resolutions,
}: MapLabelOverlayProps): React.JSX.Element {
  return (
    <g className="es-map-labels">
      {labels.map((label) => {
        const point = worldToClient(
          preview?.id === label.id ? preview.location : label.location,
          transform
        );
        if (!point) return null;
        const region = regions?.find((region) => region.labelId === label.id);
        const resolution = resolutions?.find(
          (resolution) => resolution.id === region?.id
        );
        return (
          <text
            key={label.id}
            data-label-id={label.id}
            x={point.x - transform.bounds.left}
            y={point.y - transform.bounds.top}
            role="button"
            tabIndex={0}
            aria-label={`Select map label ${label.text}`}
            aria-pressed={selectedId === label.id}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={14}
            fontWeight={650}
            fill={selectedId === label.id ? '#a7ffeb' : '#fff4d8'}
            stroke="#101923"
            strokeWidth={4}
            paintOrder="stroke"
            pointerEvents="bounding-box"
            style={{ cursor: 'grab', userSelect: 'none' }}
            onKeyDown={(event): void => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onSelect(label.id);
              }
            }}
          >
            {region && <title>{regionStatus(region, resolution)}</title>}
            {label.text}
            {region ? (resolution?.status === 'resolved' ? ' ◇' : ' ⚠') : ''}
          </text>
        );
      })}
    </g>
  );
}
