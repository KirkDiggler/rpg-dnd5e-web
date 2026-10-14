import { memo, useMemo } from 'react';
import { layoutCellCorners } from './layoutGeometry';
import type {
  RegionResolution,
  RoomHexCell,
  WorldPoint,
} from './studioSession';

/** The fill's fixed opacity: overlapping regions both show, in authored
 * order (S3-Q5). */
export const REGION_FILL_OPACITY = 0.28;
const UNCOLOURED = '#91a8fa';

const point = (p: WorldPoint): string => `${p.x},${p.z}`;
const ringPath = (ring: readonly WorldPoint[]): string =>
  `M${ring.map(point).join('L')}Z`;

/** One path of every cell's hexagon, and one of the union's outer edges:
 * an edge two counted cells share is interior and is not stroked. */
function unionPaths(cells: readonly RoomHexCell[]): {
  fill: string;
  outline: string;
} {
  const edges = new Map<string, { a: WorldPoint; b: WorldPoint; n: number }>();
  const fill: string[] = [];
  for (const cell of cells) {
    const corners = layoutCellCorners(cell);
    fill.push(ringPath(corners));
    corners.forEach((a, i) => {
      const b = corners[(i + 1) % corners.length];
      const id = `${((a.x + b.x) / 2).toFixed(3)},${((a.z + b.z) / 2).toFixed(3)}`;
      const edge = edges.get(id);
      if (edge) edge.n++;
      else edges.set(id, { a, b, n: 1 });
    });
  }
  const outline: string[] = [];
  for (const edge of edges.values())
    if (edge.n === 1) outline.push(`M${point(edge.a)}L${point(edge.b)}`);
  return { fill: fill.join(''), outline: outline.join('') };
}

const RegionShapes = memo(function RegionShapes({
  resolutions,
  colours,
  selectedId,
}: {
  resolutions: readonly RegionResolution[];
  colours?: ReadonlyMap<string, string>;
  selectedId?: string;
}): React.JSX.Element {
  const shapes = useMemo(
    () =>
      resolutions.flatMap((resolution) => {
        if (resolution.status !== 'resolved') return [];
        const area = resolution.area;
        const paths =
          area.kind === 'polygon'
            ? { fill: ringPath(area.ring), outline: ringPath(area.ring) }
            : unionPaths(area.cells);
        return [{ id: resolution.id, ...paths }];
      }),
    [resolutions]
  );
  return (
    <>
      {shapes.map((shape) => {
        const selected = shape.id === selectedId;
        const colour = colours?.get(shape.id) ?? UNCOLOURED;
        return (
          <g
            key={shape.id}
            data-region-id={shape.id}
            data-region-colour={colour}
            data-selected={selected || undefined}
          >
            <path
              data-region-fill={shape.id}
              d={shape.fill}
              fill={colour}
              fillOpacity={REGION_FILL_OPACITY}
              stroke="none"
            />
            <path
              data-region-outline={shape.id}
              d={shape.outline}
              fill="none"
              stroke={colour}
              strokeOpacity={selected ? 1 : 0.85}
              strokeWidth={selected ? 4 : 1.5}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </>
  );
});

/** Only current resolved projections draw an area. No cached/stale polygon.
 * Each region fills in its derived colour, never a stored one. A fill is an
 * annotation: it never means a creature inside it is in the region. */
export function RegionBoundaryOverlay({
  resolutions,
  colours,
  selectedId,
  transform,
}: {
  resolutions: readonly RegionResolution[];
  colours?: ReadonlyMap<string, string>;
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
      <RegionShapes
        resolutions={resolutions}
        colours={colours}
        selectedId={selectedId}
      />
    </g>
  );
}
