import { regionLabelPoint } from '../world-building/regionLabel';
import type { RoomRegion } from '../world-building/roomDraft';
import type { MapLabel, WorldPoint } from '../world-building/types';
import { worldToClient, type LayoutTransform } from './layoutGeometry';

interface MapLabelOverlayProps {
  /** Notes: labels linked to no region, drawn where the author put them. */
  labels: readonly MapLabel[];
  transform: LayoutTransform;
  selectedId: string | null;
  preview: { id: string; location: WorldPoint } | null;
  onSelect(id: string): void;
  /** The authored regions: each is labelled by its name at the centroid of
   * its cells (rpg-project#725 R5). An unpainted region has no label. */
  regions?: readonly RoomRegion[];
  selectedRegionId?: string | null;
  onSelectRegion?(id: string): void;
  /** Derived region colours: a region's label is drawn in its colour. */
  colours?: ReadonlyMap<string, string>;
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
  selectedRegionId,
  onSelectRegion,
  colours,
}: MapLabelOverlayProps): React.JSX.Element {
  return (
    <g className="es-map-labels">
      {(regions ?? []).map((region) => {
        const at = regionLabelPoint(region);
        const point = at && worldToClient(at, transform);
        if (!point || !region.name) return null;
        const selected = selectedRegionId === region.id;
        const colour = colours?.get(region.id);
        return (
          <text
            key={`region:${region.id}`}
            data-region-label={region.id}
            x={point.x - transform.bounds.left}
            y={point.y - transform.bounds.top}
            role="button"
            tabIndex={0}
            aria-label={`Select region ${region.name}`}
            aria-pressed={selected}
            data-label-colour={colour}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={14}
            fontWeight={selected ? 800 : 650}
            fill={colour ?? '#fff4d8'}
            textDecoration={selected ? 'underline' : undefined}
            stroke="#101923"
            strokeWidth={4}
            paintOrder="stroke"
            pointerEvents="bounding-box"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onPointerDown={(event): void => {
              if (!onSelectRegion || event.button !== 0) return;
              event.stopPropagation();
              onSelectRegion(region.id);
            }}
            onKeyDown={(event): void => {
              if (
                onSelectRegion &&
                (event.key === 'Enter' || event.key === ' ')
              ) {
                event.preventDefault();
                event.stopPropagation();
                onSelectRegion(region.id);
              }
            }}
          >
            {region.name}
          </text>
        );
      })}
      {labels.map((label) => {
        const point = worldToClient(
          preview?.id === label.id ? preview.location : label.location,
          transform
        );
        if (!point) return null;
        const selected = selectedId === label.id;
        return (
          <text
            key={label.id}
            data-label-id={label.id}
            x={point.x - transform.bounds.left}
            y={point.y - transform.bounds.top}
            role="button"
            tabIndex={0}
            aria-label={`Select map label ${label.text}`}
            aria-pressed={selected}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={14}
            fontWeight={650}
            fill={selected ? '#a7ffeb' : '#fff4d8'}
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
            {label.text}
          </text>
        );
      })}
    </g>
  );
}
