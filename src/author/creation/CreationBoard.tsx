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
import { facingAngleDeg } from '@/components/hex-grid/facingYaw';
import {
  useCallback,
  useEffect,
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
import { boardWallScene } from './boardWallRuns';
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
import { cornerPoint, sameCorner, type CornerRef } from './hexCorner';
import {
  applyWallDraw,
  applyWallErase,
  deriveWallAdd,
  deriveWallErase,
  runVertices,
  snapGesturePoint,
  tautPath,
} from './wallGesture';

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
  /** The wall drag's commit (#804): the RAW taut chain of the released
   * drag — the owner applies the same `applyWallDraw` the preview used,
   * so the preview IS the commit. */
  onWallDraw: (chain: Edge[]) => void;
  /** Shift/right-drag erase along the same derived path (ruling 3). */
  onWallErase: (chain: Edge[]) => void;
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

/** One in-flight wall drag (#804). `pressEdge` carries the click
 * fallback: a press that never moves off its snapped corner stays
 * today's single-edge toggle, released on pointer up. */
interface DragGesture {
  kind: 'draw' | 'erase';
  a: CornerRef;
  b: CornerRef;
  moved: boolean;
  pressEdge: Edge;
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
  onWallDraw,
  onWallErase,
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
  // The straightened picture (#800): existing walls and doors drawn as
  // the SAME runs the 3D preview and game will render, via the shared
  // geometry module — null on a flat-top document, where the board
  // keeps its literal edge drawing (3D refuses flat-top by name, #763,
  // so the literal edges ARE the honest picture there). Derived from
  // the document directly, not the debounced server compile, so the
  // wall the author just clicked straightens immediately.
  const wallScene = useMemo(() => boardWallScene(doc, size), [doc, size]);
  const [gesture, setGesture] = useState<DragGesture | null>(null);
  // The magnetism targets and (later) drag handles: the lattice
  // vertices at the ends of the COMMITTED doc's rendered chains —
  // never the mid-gesture candidate's, or the endpoint would chase its
  // own preview.
  const vertices = useMemo(
    () =>
      wallScene
        ? runVertices(
            wallScene.runs.map((r) => r.edges),
            size,
            o
          )
        : [],
    [wallScene, size, o]
  );
  // THE PREVIEW IS THE COMMIT: the candidate document is the same
  // mutator composition the release applies (wallGesture's apply*),
  // and its runs come from the same shared geometry module. On
  // flat-top docs boardWallScene stays null and the literal edge
  // drawing below previews the candidate doc instead — the honest
  // picture there (#763).
  const chain = useMemo(
    () => (gesture ? tautPath(gesture.a, gesture.b, size, o) : []),
    [gesture, size, o]
  );
  const previewDoc = useMemo(() => {
    if (!gesture || !gesture.moved) return null;
    return gesture.kind === 'draw'
      ? applyWallDraw(doc, chain)
      : applyWallErase(doc, chain);
  }, [gesture, doc, chain]);
  const previewScene = useMemo(
    () => (previewDoc ? boardWallScene(previewDoc, size) : null),
    [previewDoc, size]
  );
  // The faint literal trace of the candidate edges (draw), or of the
  // edges about to be removed (erase).
  const traceEdges = useMemo(() => {
    if (!gesture || !gesture.moved) return [];
    return gesture.kind === 'draw'
      ? deriveWallAdd(doc, chain)
      : deriveWallErase(doc, chain);
  }, [gesture, doc, chain]);
  const displayDoc = previewDoc ?? doc;
  const scene = previewDoc ? previewScene : wallScene;
  useEffect(() => {
    if (!gesture) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGesture(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gesture]);
  const doorById = useMemo(
    () => new Map(doc.doors.map((d) => [d.id, d] as const)),
    [doc.doors]
  );

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
      const p = svgPoint(svgRef.current, e);
      const pressEdge = nearestEdge(cell, p, size, o);
      if (tool === 'wall') {
        // Press anchors A (wall-vertex magnetism first, then the
        // corner lattice); release decides click vs drag. Shift or
        // right button erases along the derived path (ruling 3).
        const a = snapGesturePoint(p, size, o, { wallVertices: vertices });
        setGesture({
          kind: e.shiftKey || e.button === 2 ? 'erase' : 'draw',
          a,
          b: a,
          moved: false,
          pressEdge,
        });
        setHoverEdge(null);
        return;
      }
      onEdgeClick(pressEdge);
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
    if (gesture && svgRef.current) {
      // Every move re-snaps B: wall vertices first, then the corner
      // lattice, with angle magnetism toward the seam families unless
      // Alt is held (ruling 1). The preview re-derives from the doc on
      // every change of B — O(chain) + the shared module's O(walls).
      const b = snapGesturePoint(svgPoint(svgRef.current, e), size, o, {
        origin: cornerPoint(gesture.a, size, o),
        alt: e.altKey,
        wallVertices: vertices,
      });
      const moved = gesture.moved || !sameCorner(b, gesture.a, size, o);
      if (moved !== gesture.moved || !sameCorner(b, gesture.b, size, o)) {
        setGesture({ ...gesture, b, moved });
      }
      return;
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

  // Release commits (or falls back to the single-edge click); releasing
  // with B back on A after moving, or Escape, or leaving the canvas,
  // cancels.
  const finishGesture = () => {
    if (!gesture) return;
    setGesture(null);
    if (!gesture.moved) {
      onEdgeClick(gesture.pressEdge);
      return;
    }
    if (sameCorner(gesture.a, gesture.b, size, o)) return;
    if (gesture.kind === 'draw') onWallDraw(chain);
    else onWallErase(chain);
  };

  const selectedRegion = selection?.kind === 'region' ? selection.id : null;
  const selectedDoor = selection?.kind === 'door' ? selection.id : null;
  const selectedPlacement =
    selection?.kind === 'placement' ? selection.index : null;

  // Literal hex-edge lines. With the straightened picture on (pointy),
  // walls and doors render as runs instead, and only ERROR edges stay
  // literal, drawn on top of the runs — an error is edge-scoped truth
  // about what the author clicked, not about the fitted line (#800).
  // On a flat-top document everything stays literal, as before.
  const straightened = scene !== null;
  const edgeLines: {
    key: string;
    edge: Edge;
    stroke: string;
    width: number;
    dash?: string;
  }[] = [];
  for (const w of displayDoc.walls) {
    const isError = errorEdges.has(edgeKey(w));
    if (straightened && !isError) continue;
    edgeLines.push({
      key: `w:${edgeKey(w)}`,
      edge: w,
      stroke: isError ? ERROR_STROKE : WALL_STROKE,
      width: 4,
    });
  }
  for (const d of displayDoc.doors) {
    for (const e of d.edges) {
      const k = edgeKey(e);
      const isError = errorEdges.has(k);
      if (straightened && !isError) continue;
      edgeLines.push({
        key: `d:${k}`,
        edge: e,
        stroke: isError
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
          onPointerUp={() => {
            endPaint();
            finishGesture();
          }}
          onPointerLeave={() => {
            endPaint();
            setGesture(null);
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
              const cell = cellCenter(p.at, size, o);
              // Offset is a fraction of the cell size, visual only — the
              // marker moves within its hex, the cell it's keyed to
              // (selection, errors, deletion) never changes.
              const c = {
                x: cell.x + (p.offset?.[0] ?? 0) * size,
                y: cell.y + (p.offset?.[1] ?? 0) * size,
              };
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
              const facingDeg =
                p.facing !== undefined
                  ? facingAngleDeg(o, p.facing)
                  : undefined;
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
                  {facingDeg !== undefined && (
                    <line
                      data-facing-tick={i}
                      x1={c.x + Math.cos((facingDeg * Math.PI) / 180) * r}
                      y1={c.y + Math.sin((facingDeg * Math.PI) / 180) * r}
                      x2={c.x + Math.cos((facingDeg * Math.PI) / 180) * r * 1.6}
                      y2={c.y + Math.sin((facingDeg * Math.PI) / 180) * r * 1.6}
                      stroke={WALL_STROKE}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                    />
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
            {/* Straight runs first, then the gap-aligned doors, then any
                literal (error) edges on top, then the hover edge. The
                door keeps its stroke identity (locked/closed/selected)
                but sits IN the run's gap, exactly where 3D will put it;
                hit-testing stays edge-based (this layer takes no
                pointer events). */}
            {scene?.runs.map((r) => (
              <line
                key={`run:${r.key}`}
                data-run={r.key}
                x1={r.a.x}
                y1={r.a.y}
                x2={r.b.x}
                y2={r.b.y}
                stroke={WALL_STROKE}
                strokeWidth={4}
              />
            ))}
            {scene?.doors.map((d) => {
              const doorDoc = doorById.get(d.doorId);
              return (
                <line
                  key={`dr:${edgeKey(d.edge)}`}
                  data-door-run={edgeKey(d.edge)}
                  x1={d.a.x}
                  y1={d.a.y}
                  x2={d.b.x}
                  y2={d.b.y}
                  stroke={doorDoc?.locked ? DOOR_LOCKED_STROKE : DOOR_STROKE}
                  strokeWidth={d.doorId === selectedDoor ? 6 : 4}
                  strokeDasharray={
                    doorDoc?.closed || doorDoc?.locked ? undefined : '4 3'
                  }
                />
              );
            })}
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
          {gesture && gesture.moved && (
            <g data-layer="gesture" pointerEvents="none">
              {/* The faint literal trace of the candidate edges — the
                  chain the drag derived (skipped pairs shown absent),
                  or the walls the erase will remove. The straightened
                  result is already live above via the candidate doc. */}
              {traceEdges.map((edge) => {
                const seg = edgeSegment(edge, size, o);
                if (!seg) return null;
                return (
                  <line
                    key={`trace:${edgeKey(edge)}`}
                    data-gesture-trace={edgeKey(edge)}
                    x1={seg.a.x}
                    y1={seg.a.y}
                    x2={seg.b.x}
                    y2={seg.b.y}
                    stroke={
                      gesture.kind === 'erase' ? ERROR_STROKE : HOVER_STROKE
                    }
                    strokeWidth={3}
                    strokeOpacity={0.4}
                    strokeDasharray="3 3"
                  />
                );
              })}
              {(['a', 'b'] as const).map((end) => {
                const p = cornerPoint(gesture[end], size, o);
                return (
                  <circle
                    key={end}
                    data-gesture-end={end}
                    cx={p.x}
                    cy={p.y}
                    r={size * 0.18}
                    fill="none"
                    stroke={HOVER_STROKE}
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          )}
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
