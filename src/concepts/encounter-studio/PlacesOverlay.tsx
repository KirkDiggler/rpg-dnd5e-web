/**
 * THE PLACES MODE'S MARKS (rpg-project#972): every join the engine says,
 * drawn where the draft puts it — a door join at its door, an open join on
 * the shared boundary, a passage as a one-way dashed arrow — and shaped by
 * the bars its ways lift. A region the engine says is in no join is marked
 * unreached. Each mark is a button with the join's name; hover shows it.
 */
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import type { RoomDraft } from '../world-building/roomDraft';
import type { WorldPoint } from '../world-building/types';
import { worldToClient, type LayoutTransform } from './layoutGeometry';
import { joinAnchor, regionCentre } from './placesGeometry';
import type { PlaceJoin, Places } from './placesView';

export interface LayoutPlaces {
  places: Places;
  selectedJoinId: string | null;
  /** Joins whose ways use the pressed method row (rpg-project#974). */
  methodJoinIds?: ReadonlySet<string>;
  onSelectJoin(id: string): void;
  /** The join's accessible name (`joinName`). */
  nameOf(join: PlaceJoin): string;
  regionName(id: string): string;
}

const MARK = 9;

export function PlacesOverlay({
  draft,
  transform,
  places,
}: {
  draft: Pick<RoomDraft, 'room' | 'scene'>;
  transform: LayoutTransform;
  places: LayoutPlaces;
}): React.JSX.Element {
  const project = (point: WorldPoint): { x: number; y: number } | null => {
    const client = worldToClient(point, transform);
    return client
      ? {
          x: client.x - transform.bounds.left,
          y: client.y - transform.bounds.top,
        }
      : null;
  };
  const choose = (id: string) => ({
    onPointerDown: (event: ReactPointerEvent<SVGElement>): void => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      places.onSelectJoin(id);
    },
    onKeyDown: (event: ReactKeyboardEvent<SVGElement>): void => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      places.onSelectJoin(id);
    },
  });
  return (
    <g className="es-places" data-places-overlay="">
      <defs>
        <marker
          id="es-places-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="es-places-arrowhead" />
        </marker>
      </defs>
      {places.places.unjoined.map(({ regionId }) => {
        const at = regionCentre(draft, regionId);
        const p = at ? project(at) : null;
        if (!p) return null;
        return (
          <text
            key={`unjoined:${regionId}`}
            className="es-places-unjoined"
            data-unjoined-region={regionId}
            x={p.x}
            y={p.y + 18}
            textAnchor="middle"
          >
            {`${places.regionName(regionId)}: unreached`}
          </text>
        );
      })}
      {places.places.joins.map((join) => {
        const anchor = joinAnchor(join, draft);
        if (!anchor) return null;
        const name = places.nameOf(join);
        const selected = places.selectedJoinId === join.id;
        const common = {
          'data-join-id': join.id,
          'data-join-kind': join.kind,
          'data-join-bars': join.bars.join(' '),
          'data-selected': selected || undefined,
          'data-uses-method': places.methodJoinIds?.has(join.id) || undefined,
          className: 'es-places-join',
          role: 'button',
          tabIndex: 0,
          'aria-label': name,
          ...choose(join.id),
        };
        if (anchor.kind === 'arrow') {
          const to = project(anchor.to);
          const from = anchor.from
            .map(project)
            .filter((p): p is { x: number; y: number } => p !== null);
          if (!to || from.length === 0) return null;
          return (
            <g key={join.id} {...common}>
              <title>{name}</title>
              {from.map((f, index) => (
                <g key={index}>
                  <line
                    className="es-places-passage-hit"
                    x1={f.x}
                    y1={f.y}
                    x2={to.x}
                    y2={to.y}
                  />
                  <line
                    className="es-places-passage"
                    x1={f.x}
                    y1={f.y}
                    x2={to.x}
                    y2={to.y}
                    markerEnd="url(#es-places-arrow)"
                  />
                </g>
              ))}
              <BarGlyphs
                bars={join.bars}
                x={(from[0]!.x + to.x) / 2}
                y={(from[0]!.y + to.y) / 2}
              />
            </g>
          );
        }
        const p = project(anchor.at);
        if (!p) return null;
        return (
          <g key={join.id} {...common}>
            <title>{name}</title>
            <BarGlyphs bars={join.bars} x={p.x} y={p.y} />
          </g>
        );
      })}
    </g>
  );
}

/** One shape per bar, side by side; a plain ring for no bar. Shape, not
 * colour, tells the bars apart: a square for a lock, a diamond for
 * holders, a dashed ring for hiding, a triangle for a bar the studio does
 * not know. */
function BarGlyphs({
  bars,
  x,
  y,
}: {
  bars: readonly string[];
  x: number;
  y: number;
}): React.JSX.Element {
  if (bars.length === 0)
    return (
      <circle
        className="es-places-mark"
        data-bar="none"
        cx={x}
        cy={y}
        r={MARK * 0.7}
      />
    );
  const step = MARK * 2.2;
  const start = x - ((bars.length - 1) * step) / 2;
  return (
    <>
      {bars.map((bar, index) => {
        const cx = start + index * step;
        const r = MARK;
        switch (bar) {
          case 'lock':
            return (
              <rect
                key={bar}
                className="es-places-mark"
                data-bar={bar}
                x={cx - r * 0.8}
                y={y - r * 0.8}
                width={r * 1.6}
                height={r * 1.6}
              />
            );
          case 'hold':
            return (
              <polygon
                key={bar}
                className="es-places-mark"
                data-bar={bar}
                points={`${cx},${y - r} ${cx + r},${y} ${cx},${y + r} ${cx - r},${y}`}
              />
            );
          case 'hidden':
            return (
              <circle
                key={bar}
                className="es-places-mark es-places-mark-hidden"
                data-bar={bar}
                cx={cx}
                cy={y}
                r={r * 0.85}
              />
            );
          default:
            return (
              <polygon
                key={bar}
                className="es-places-mark"
                data-bar={bar}
                points={`${cx},${y - r} ${cx + r},${y + r * 0.8} ${cx - r},${y + r * 0.8}`}
              />
            );
        }
      })}
    </>
  );
}
