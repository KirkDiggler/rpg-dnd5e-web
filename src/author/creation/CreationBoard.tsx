/**
 * CreationBoard — the centre column: one SVG hex canvas in AXIAL,
 * drawn under the dungeon's own `orientation` (design §1). Void is
 * everything unpainted; the floor/void envelope is never drawn by the
 * author (the runtime implies it), so the board shows only what the
 * file says: regions, declared walls, door edges, the start, placements
 * — and, in red, whatever the compiler's `FieldError.path`s name.
 *
 * Tools act through the document mutators in `dungeonYaml.ts`; this
 * component never holds a `[col,row]` (see `hexOffset.ts`).
 */
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import type { Point } from '../../concepts/session-tomb/atlas';
import {
  doorEdgeOwners,
  floorOwners,
  isMonsterRef,
  type DungeonDoc,
  type ErrorTarget,
} from '../dungeonYaml';
import { axialKey, edgeKey, type Axial, type Edge } from '../hexOffset';
import {
  BOSS_COLOR,
  DOOR_LOCKED_STROKE,
  DOOR_STROKE,
  ERROR_STROKE,
  HOVER_STROKE,
  MONSTER_COLOR,
  PROP_COLOR,
  START_COLOR,
  VOID_FILL,
  VOID_STROKE,
  WALL_STROKE,
  litColor,
  regionColor,
} from '../markerStyle';
import { thumbForRef } from '../paletteData';
import type { BoardTool, Selection } from '../types';
import {
  cellCenter,
  cellsInBounds,
  cornersPath,
  edgeSegment,
  growBounds,
  nearestEdge,
  neededBounds,
  viewRectFor,
  type GridBounds,
} from './canvasGeometry';

export const BOARD_HEX_SIZE = 24;

/** Screen pixels per SVG user unit — fixed, so the canvas never rescales
 * to fit; it scrolls. */
export const BOARD_SCALE = 1.25;

export interface CreationBoardProps {
  doc: DungeonDoc;
  tool: BoardTool;
  selection: Selection;
  /** The region the brush paints into. */
  activeRegionId: string | null;
  /** Compiler error paths to highlight (already resolved by the caller
   * so the board and the error list agree on what each one names). */
  errorTargets: ErrorTarget[];
  onPaint: (cell: Axial) => void;
  onErase: (cell: Axial) => void;
  onEdgeClick: (edge: Edge) => void;
  onCellClick: (cell: Axial) => void;
  onSelect: (selection: Selection) => void;
}

/** Pointer → SVG user space, via the SVG's own CTM. jsdom has neither
 * `getScreenCTM` nor layout, so the fallback is the origin — the tests
 * only rely on the edge being one of the cell's six. */
function svgPoint(svg: SVGSVGElement, e: PointerEvent): Point {
  const ctm =
    typeof svg.getScreenCTM === 'function' ? svg.getScreenCTM() : null;
  if (!ctm || typeof DOMPoint === 'undefined') return { x: 0, y: 0 };
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

export function CreationBoard({
  doc,
  tool,
  selection,
  activeRegionId,
  errorTargets,
  onPaint,
  onErase,
  onEdgeClick,
  onCellClick,
  onSelect,
}: CreationBoardProps) {
  const o = doc.orientation;
  const size = BOARD_HEX_SIZE;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverEdge, setHoverEdge] = useState<Edge | null>(null);
  const [hoverCell, setHoverCell] = useState<Axial | null>(null);
  const painting = useRef<'paint' | 'erase' | null>(null);

  const owners = useMemo(() => floorOwners(doc), [doc]);
  const floor = useMemo(
    () => doc.regions.flatMap((r) => r.cells),
    [doc.regions]
  );
  // The paintable extent only grows (see `growBounds`); it resets when the
  // document's orientation changes, which only `New`/`Open` can do.
  const boundsRef = useRef<{ o: string; bounds: GridBounds | null }>({
    o,
    bounds: null,
  });
  if (boundsRef.current.o !== o) boundsRef.current = { o, bounds: null };
  const bounds = growBounds(boundsRef.current.bounds, neededBounds(floor, o));
  boundsRef.current.bounds = bounds;
  const grid = useMemo(() => cellsInBounds(bounds, o), [bounds, o]);
  const view = useMemo(() => viewRectFor(grid, size, o), [grid, size, o]);
  const viewBox = `${view.x} ${view.y} ${view.width} ${view.height}`;

  // Scroll compensation: when the extent grows to the LEFT or UP the SVG's
  // origin moves, which would shift everything under the pointer by the
  // same amount. Move the scroll position by exactly that delta in the
  // same layout pass so nothing on screen moves. Growth to the right or
  // down needs nothing — it only lengthens the scrollable area.
  const scrollRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const prev = originRef.current;
    originRef.current = { x: view.x, y: view.y };
    if (!el) return;
    if (prev === null) {
      // First layout: centre on the authored floor (or the origin).
      const target =
        floor.length > 0
          ? floor.reduce(
              (acc, c) => {
                const p = cellCenter(c, size, o);
                return {
                  x: acc.x + p.x / floor.length,
                  y: acc.y + p.y / floor.length,
                };
              },
              { x: 0, y: 0 }
            )
          : cellCenter({ q: 0, r: 0 }, size, o);
      const pad = padRef.current ? getComputedStyle(padRef.current) : null;
      const padX = pad ? parseFloat(pad.paddingLeft) || 0 : 0;
      const padY = pad ? parseFloat(pad.paddingTop) || 0 : 0;
      el.scrollLeft =
        padX + (target.x - view.x) * BOARD_SCALE - el.clientWidth / 2;
      el.scrollTop =
        padY + (target.y - view.y) * BOARD_SCALE - el.clientHeight / 2;
      return;
    }
    const dx = (prev.x - view.x) * BOARD_SCALE;
    const dy = (prev.y - view.y) * BOARD_SCALE;
    if (dx !== 0) el.scrollLeft += dx;
    if (dy !== 0) el.scrollTop += dy;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- centre once, then only compensate origin moves
  }, [view.x, view.y]);
  const regionIndex = useMemo(
    () => new Map(doc.regions.map((r, i) => [r.id, i] as const)),
    [doc.regions]
  );
  const regionById = useMemo(
    () => new Map(doc.regions.map((r) => [r.id, r] as const)),
    [doc.regions]
  );
  const doorOwners = useMemo(() => doorEdgeOwners(doc), [doc]);

  const errorCells = useMemo(() => {
    const s = new Set<string>();
    for (const t of errorTargets) {
      if (t.kind === 'cell' || t.kind === 'placement') s.add(axialKey(t.cell));
      if (t.kind === 'start' && doc.start) s.add(axialKey(doc.start));
      if (t.kind === 'region') {
        for (const c of regionById.get(t.regionId)?.cells ?? []) {
          s.add(axialKey(c));
        }
      }
    }
    return s;
  }, [errorTargets, doc.start, regionById]);
  const errorEdges = useMemo(() => {
    const s = new Set<string>();
    for (const t of errorTargets) {
      if (t.kind === 'edge') s.add(edgeKey(t.edge));
      if (t.kind === 'door') {
        for (const e of doc.doors.find((d) => d.id === t.doorId)?.edges ?? []) {
          s.add(edgeKey(e));
        }
      }
    }
    return s;
  }, [errorTargets, doc.doors]);

  const edgeTool = tool === 'wall' || tool === 'door';

  const applyBrush = useCallback(
    (cell: Axial, mode: 'paint' | 'erase') => {
      if (mode === 'paint') onPaint(cell);
      else onErase(cell);
    },
    [onPaint, onErase]
  );

  const handleCellDown = (cell: Axial, e: PointerEvent<SVGPolygonElement>) => {
    e.preventDefault();
    if (tool === 'region' || tool === 'erase') {
      const mode =
        tool === 'erase' || e.shiftKey || e.button === 2 ? 'erase' : 'paint';
      painting.current = mode;
      applyBrush(cell, mode);
      return;
    }
    if (edgeTool) {
      if (!svgRef.current || !owners.has(axialKey(cell))) return;
      onEdgeClick(nearestEdge(cell, svgPoint(svgRef.current, e), size, o));
      return;
    }
    if (tool === 'select') {
      const key = axialKey(cell);
      const placementIndex = doc.place.findIndex((p) => axialKey(p.at) === key);
      if (placementIndex !== -1) {
        onSelect({ kind: 'placement', index: placementIndex });
        return;
      }
      if (hoverEdge && doorOwners.has(edgeKey(hoverEdge))) {
        onSelect({ kind: 'door', id: doorOwners.get(edgeKey(hoverEdge))! });
        return;
      }
      const owner = owners.get(key);
      if (owner) onSelect({ kind: 'region', id: owner });
      else onSelect({ kind: 'dungeon' });
      return;
    }
    onCellClick(cell);
  };

  const handleCellMove = (cell: Axial, e: PointerEvent<SVGPolygonElement>) => {
    setHoverCell(cell);
    if (painting.current && (tool === 'region' || tool === 'erase')) {
      applyBrush(cell, painting.current);
    }
    if ((edgeTool || tool === 'select') && svgRef.current) {
      if (!owners.has(axialKey(cell))) {
        setHoverEdge(null);
        return;
      }
      const edge = nearestEdge(cell, svgPoint(svgRef.current, e), size, o);
      setHoverEdge(
        owners.has(axialKey(edge[1])) &&
          (edgeTool || doorOwners.has(edgeKey(edge)))
          ? edge
          : null
      );
    } else {
      setHoverEdge(null);
    }
  };

  const endPaint = () => {
    painting.current = null;
  };

  const selectedRegion = selection?.kind === 'region' ? selection.id : null;
  const selectedDoor = selection?.kind === 'door' ? selection.id : null;
  const selectedPlacement =
    selection?.kind === 'placement' ? selection.index : null;

  // Edges to draw: walls, door edges, the hover edge.
  const edgeLines: {
    key: string;
    edge: Edge;
    stroke: string;
    width: number;
    dash?: string;
  }[] = [];
  for (const w of doc.walls) {
    edgeLines.push({
      key: `w:${edgeKey(w)}`,
      edge: w,
      stroke: errorEdges.has(edgeKey(w)) ? ERROR_STROKE : WALL_STROKE,
      width: 4,
    });
  }
  for (const d of doc.doors) {
    for (const e of d.edges) {
      const k = edgeKey(e);
      edgeLines.push({
        key: `d:${k}`,
        edge: e,
        stroke: errorEdges.has(k)
          ? ERROR_STROKE
          : d.locked
            ? DOOR_LOCKED_STROKE
            : DOOR_STROKE,
        width: d.id === selectedDoor ? 6 : 4,
        dash: d.closed || d.locked ? undefined : '4 3',
      });
    }
  }

  return (
    <div
      ref={scrollRef}
      data-testid="creation-viewport"
      className="dg-viewport"
      style={{ background: VOID_FILL }}
    >
      <div ref={padRef} className="dg-viewport-pad">
        <svg
          ref={svgRef}
          data-testid="creation-board"
          viewBox={viewBox}
          width={view.width * BOARD_SCALE}
          height={view.height * BOARD_SCALE}
          className="select-none block"
          style={{
            background: VOID_FILL,
            touchAction: 'none',
            cursor: cursorFor(tool),
          }}
          onPointerUp={endPaint}
          onPointerLeave={() => {
            endPaint();
            setHoverEdge(null);
            setHoverCell(null);
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <g data-layer="cells">
            {grid.map((cell) => {
              const key = axialKey(cell);
              const ownerId = owners.get(key);
              const region = ownerId ? regionById.get(ownerId) : undefined;
              const index = ownerId ? (regionIndex.get(ownerId) ?? 0) : 0;
              const fill = region
                ? litColor(regionColor(index), region.lighting.intensity)
                : VOID_FILL;
              const isSelectedRegion = !!ownerId && ownerId === selectedRegion;
              const isActive = !!ownerId && ownerId === activeRegionId;
              const isError = errorCells.has(key);
              const isHover = hoverCell && axialKey(hoverCell) === key;
              return (
                <polygon
                  key={key}
                  data-cell={key}
                  data-region={ownerId ?? ''}
                  points={cornersPath(cell, size, o)}
                  fill={fill}
                  stroke={
                    isError
                      ? ERROR_STROKE
                      : isSelectedRegion
                        ? HOVER_STROKE
                        : region
                          ? regionColor(index)
                          : VOID_STROKE
                  }
                  strokeWidth={isError ? 2.5 : isSelectedRegion ? 1.5 : 1}
                  strokeOpacity={region ? (isActive ? 1 : 0.6) : 1}
                  opacity={
                    isHover && (tool === 'region' || tool === 'erase') ? 0.8 : 1
                  }
                  onPointerDown={(e) => handleCellDown(cell, e)}
                  onPointerMove={(e) => handleCellMove(cell, e)}
                  onPointerEnter={(e) => handleCellMove(cell, e)}
                />
              );
            })}
          </g>
          <g data-layer="start" pointerEvents="none">
            {doc.start && (
              <Start
                cell={doc.start}
                size={size}
                o={o}
                error={errorTargets.some((t) => t.kind === 'start')}
              />
            )}
          </g>
          <g data-layer="placements" pointerEvents="none">
            {doc.place.map((p, i) => {
              const c = cellCenter(p.at, size, o);
              const thumb = thumbForRef(p.ref);
              const monster = isMonsterRef(p.ref);
              const color = monster
                ? p.boss
                  ? BOSS_COLOR
                  : MONSTER_COLOR
                : PROP_COLOR;
              const r = size * 0.62;
              const selected = i === selectedPlacement;
              const error = errorTargets.some(
                (t) => t.kind === 'placement' && t.index === i
              );
              return (
                <g key={`${p.ref}:${axialKey(p.at)}`} data-placement={i}>
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={r}
                    fill={color}
                    stroke={
                      error
                        ? ERROR_STROKE
                        : selected
                          ? HOVER_STROKE
                          : '#00000088'
                    }
                    strokeWidth={error || selected ? 3 : 1}
                  />
                  {thumb ? (
                    <image
                      href={thumb}
                      x={c.x - r * 0.85}
                      y={c.y - r * 0.85}
                      width={r * 1.7}
                      height={r * 1.7}
                      clipPath="circle(50%)"
                    />
                  ) : (
                    <text
                      x={c.x}
                      y={c.y + 4}
                      textAnchor="middle"
                      fontSize={size * 0.5}
                      fill="#fff"
                    >
                      {p.ref.split(':').pop()?.slice(0, 2).toUpperCase()}
                    </text>
                  )}
                  {p.boss && (
                    <text
                      x={c.x}
                      y={c.y - r - 2}
                      textAnchor="middle"
                      fontSize={size * 0.45}
                      fill="#ffd166"
                    >
                      ★
                    </text>
                  )}
                </g>
              );
            })}
          </g>
          <g data-layer="edges" pointerEvents="none" strokeLinecap="round">
            {edgeLines.map((l) => {
              const seg = edgeSegment(l.edge, size, o);
              if (!seg) return null;
              return (
                <line
                  key={l.key}
                  data-edge={l.key}
                  x1={seg.a.x}
                  y1={seg.a.y}
                  x2={seg.b.x}
                  y2={seg.b.y}
                  stroke={l.stroke}
                  strokeWidth={l.width}
                  strokeDasharray={l.dash}
                />
              );
            })}
            {hoverEdge &&
              (() => {
                const seg = edgeSegment(hoverEdge, size, o);
                if (!seg) return null;
                return (
                  <line
                    data-edge="hover"
                    x1={seg.a.x}
                    y1={seg.a.y}
                    x2={seg.b.x}
                    y2={seg.b.y}
                    stroke={HOVER_STROKE}
                    strokeWidth={6}
                    strokeOpacity={0.55}
                  />
                );
              })()}
          </g>
        </svg>
      </div>
    </div>
  );
}

function Start({
  cell,
  size,
  o,
  error,
}: {
  cell: Axial;
  size: number;
  o: DungeonDoc['orientation'];
  error: boolean;
}) {
  const c = cellCenter(cell, size, o);
  return (
    <g data-start={axialKey(cell)}>
      <circle
        cx={c.x}
        cy={c.y}
        r={size * 0.5}
        fill="none"
        stroke={error ? ERROR_STROKE : START_COLOR}
        strokeWidth={3}
      />
      <text
        x={c.x}
        y={c.y + size * 0.2}
        textAnchor="middle"
        fontSize={size * 0.55}
        fontWeight={700}
        fill={error ? ERROR_STROKE : START_COLOR}
      >
        S
      </text>
    </g>
  );
}

function cursorFor(tool: BoardTool): string {
  switch (tool) {
    case 'region':
    case 'erase':
      return 'crosshair';
    case 'wall':
    case 'door':
      return 'cell';
    default:
      return 'pointer';
  }
}
