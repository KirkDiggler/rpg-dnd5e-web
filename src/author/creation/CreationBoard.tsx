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
  compiledWalls,
  doorEdgeOwners,
  floorOwners,
  isMonsterRef,
  rectCells,
  removeWalls,
  type DungeonDoc,
  type ErrorTarget,
} from '../dungeonYaml';
import {
  axialKey,
  axialNeighbors,
  edgeKey,
  type Axial,
  type Edge,
} from '../hexOffset';
import {
  BOSS_COLOR,
  CONCEALED_STROKE,
  DOOR_LOCKED_STROKE,
  DOOR_STROKE,
  ENVELOPE_STROKE,
  ERROR_STROKE,
  HOVER_STROKE,
  litColor,
  MONSTER_COLOR,
  PROP_COLOR,
  regionColor,
  START_COLOR,
  VOID_FILL,
  VOID_STROKE,
  WALL_STROKE,
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
  applyDoorDraw,
  applyReshape,
  applyWallDraw,
  applyWallErase,
  chainEndpoints,
  deriveDoorAdd,
  deriveWallAdd,
  deriveWallErase,
  GESTURE_TUNING,
  nearestRunIndex,
  runVertices,
  snapGesturePoint,
  tautPath,
  type RunVertex,
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
  /** Region ids `deriveConcealment` currently derives as hidden
   * (rpg-dnd5e-web#893) — highlighted so linking concealment to the
   * door does not become an invisible side effect of ticking its
   * checkbox. */
  concealedRegionIds: ReadonlySet<string>;
  onPaint: (cell: Axial) => void;
  /** The room tool's commit (rpg-dnd5e-web#902): the two corners of a
   * dragged rectangle. The owner paints the whole block into the active
   * region, so the floor is square by construction rather than by a steady
   * hand. */
  onPaintRect: (a: Axial, b: Axial) => void;
  onErase: (cell: Axial) => void;
  onEdgeClick: (edge: Edge) => void;
  /** The wall drag's commit (#804): the RAW taut chain of the released
   * drag — the owner applies the same `applyWallDraw` the preview used,
   * so the preview IS the commit. */
  onWallDraw: (chain: Edge[]) => void;
  /** Shift/right-drag erase along the same derived path (ruling 3). */
  onWallErase: (chain: Edge[]) => void;
  /** Rulings 2 + 4: an endpoint or shared-corner drag replaces each
   * incident run's old edges with its chain re-derived from that run's
   * own fixed far endpoint. Raw chains; the owner applies the same
   * `applyReshape` the preview used. */
  onWallReshape: (oldChains: Edge[][], newChains: Edge[][]) => void;
  /** A door drag's chain becomes ONE door's edges[] (design §Doors
   * compose); a door click stays today's per-edge toggle. */
  onDoorDraw: (chain: Edge[]) => void;
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
interface DrawGesture {
  kind: 'draw' | 'erase';
  /** The door tool inherits the same drag (design §Doors compose): one
   * drag's chain becomes ONE door's edges[]. Erase stays wall-only. */
  tool: 'wall' | 'door';
  a: CornerRef;
  b: CornerRef;
  moved: boolean;
  pressEdge: Edge;
}

/** An endpoint or shared-corner grab (rulings 2 + 4): every incident
 * chain re-derives from its own fixed far endpoint to wherever B goes.
 * The endpoint grab is the one-incident-chain case. */
interface ReshapeGesture {
  kind: 'reshape';
  chains: { far: CornerRef; old: Edge[] }[];
  origin: CornerRef;
  b: CornerRef;
  moved: boolean;
  /** Indices of the grabbed runs — their own vertices are excluded
   * from the magnetism targets so the drag doesn't stick to itself. */
  draggedRuns: number[];
}

type DragOrReshape = DrawGesture | ReshapeGesture;

export function CreationBoard({
  doc,
  tool,
  selection,
  activeRegionId,
  errorTargets,
  concealedRegionIds,
  onPaint,
  onPaintRect,
  onErase,
  onEdgeClick,
  onWallDraw,
  onWallErase,
  onWallReshape,
  onDoorDraw,
  onCellClick,
  onSelect,
}: CreationBoardProps) {
  const o = doc.orientation;
  const size = BOARD_HEX_SIZE;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverEdge, setHoverEdge] = useState<Edge | null>(null);
  const [hoverCell, setHoverCell] = useState<Axial | null>(null);
  /** The rectangle drag's first corner, held while the pointer is down. */
  const [rectFrom, setRoomFrom] = useState<Axial | null>(null);

  /** The cells a released rectangle drag would paint — the preview IS the commit,
   * so this is the same `rectCells` the owner's `paintRect` uses. */
  const rectPreview = useMemo(() => {
    if ((tool !== 'room' && tool !== 'region-rect') || !rectFrom || !hoverCell)
      return null;
    return new Set(rectCells(o, rectFrom, hoverCell).map(axialKey));
  }, [tool, rectFrom, hoverCell, o]);
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
  const [gesture, setGesture] = useState<DragOrReshape | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  // The magnetism targets and (later) drag handles: the lattice
  // vertices at the ends of the COMMITTED doc's rendered chains —
  // never the mid-gesture candidate's, or the endpoint would chase its
  // own preview.
  const vertices = useMemo(
    () => (wallScene ? runVertices(wallScene.runs, size, o) : []),
    [wallScene, size, o]
  );
  // THE PREVIEW IS THE COMMIT: the candidate document is the same
  // mutator composition the release applies (wallGesture's apply*),
  // and its runs come from the same shared geometry module. On
  // flat-top docs boardWallScene stays null and the literal edge
  // drawing below previews the candidate doc instead — the honest
  // picture there (#763).
  const chains = useMemo(() => {
    if (!gesture) return [];
    if (gesture.kind === 'reshape') {
      return gesture.chains.map((c) => tautPath(c.far, gesture.b, size, o));
    }
    return [tautPath(gesture.a, gesture.b, size, o)];
  }, [gesture, size, o]);
  const previewDoc = useMemo(() => {
    if (!gesture || !gesture.moved) return null;
    if (gesture.kind === 'reshape') {
      return applyReshape(
        doc,
        gesture.chains.map((c) => c.old),
        chains
      );
    }
    if (gesture.kind === 'erase') return applyWallErase(doc, chains[0]);
    return gesture.tool === 'door'
      ? applyDoorDraw(doc, chains[0])
      : applyWallDraw(doc, chains[0]);
  }, [gesture, doc, chains]);
  const previewScene = useMemo(
    () => (previewDoc ? boardWallScene(previewDoc, size) : null),
    [previewDoc, size]
  );
  // The faint literal trace of the candidate edges (draw), or of the
  // edges about to be removed (erase).
  const traceEdges = useMemo(() => {
    if (!gesture || !gesture.moved) return [];
    if (gesture.kind === 'reshape') {
      const base = removeWalls(
        doc,
        gesture.chains.flatMap((c) => c.old)
      );
      // Two re-derived chains can share an edge near the dragged
      // vertex; dedup so the trace draws (and keys) each edge once.
      const seen = new Set<string>();
      return chains
        .flatMap((c) => deriveWallAdd(base, c))
        .filter((edge) => {
          const key = edgeKey(edge);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }
    if (gesture.kind === 'erase') return deriveWallErase(doc, chains[0]);
    return gesture.tool === 'door'
      ? deriveDoorAdd(doc, chains[0])
      : deriveWallAdd(doc, chains[0]);
  }, [gesture, doc, chains]);
  const displayDoc = previewDoc ?? doc;
  const scene = previewDoc ? previewScene : wallScene;
  // Manipulation rides SELECTION (Kirk's walk ruling, 2026-08-25 —
  // Strava-route-builder grammar): selecting a wall shows its handles
  // immediately and they drag right there with the Select tool; the
  // wall tool stays pure draw/erase, so pressing near a chain end
  // CONTINUES the wall instead of grabbing it (the old hover-grab made
  // continuation impossible within the pickup radius).
  const selectedRunIndices = useMemo(() => {
    if (!wallScene || selection?.kind !== 'wall') return new Set<number>();
    const keys = new Set(selection.edges.map(edgeKey));
    const indices = new Set<number>();
    wallScene.runs.forEach((r, i) => {
      if (r.edges.some((edge) => keys.has(edgeKey(edge)))) indices.add(i);
    });
    return indices;
  }, [wallScene, selection]);
  const handleVertices = useMemo(
    () =>
      selectedRunIndices.size === 0
        ? []
        : vertices.filter((v) => v.runs.some((i) => selectedRunIndices.has(i))),
    [vertices, selectedRunIndices]
  );
  // The selected wall's handle nearest `p`, within the pickup radius —
  // used for the hover affordance AND hit-tested directly on pointer
  // down (Copilot review, PR #808: gating the press on hover state
  // misses direct-touch input, which presses without a hover pass).
  const handleAt = useCallback(
    (p: Point): RunVertex | null => {
      let best: RunVertex | null = null;
      let bestDist = GESTURE_TUNING.cornerSnapRadius * size;
      for (const v of handleVertices) {
        const d = Math.hypot(v.point.x - p.x, v.point.y - p.y);
        if (d <= bestDist) {
          best = v;
          bestDist = d;
        }
      }
      return best;
    },
    [handleVertices, size]
  );
  const hoverVertex = useMemo(
    () =>
      tool !== 'select' || gesture || !hoverPoint ? null : handleAt(hoverPoint),
    [tool, gesture, hoverPoint, handleAt]
  );
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
    if (tool === 'room' || tool === 'region-rect') {
      setRoomFrom(cell);
      return;
    }
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
        const erase = e.shiftKey || e.button === 2;
        // Press anchors A (wall-vertex magnetism first, then the
        // corner lattice); release decides click vs drag. Shift or
        // right button erases along the derived path (ruling 3).
        // Pressing at an existing chain's rendered end magnetizes A
        // onto its vertex — that is how a wall is CONTINUED.
        const a = snapGesturePoint(p, size, o, { wallVertices: vertices });
        setGesture({
          kind: erase ? 'erase' : 'draw',
          tool: 'wall',
          a,
          b: a,
          moved: false,
          pressEdge,
        });
        setHoverEdge(null);
        return;
      }
      if (e.shiftKey || e.button === 2) {
        onEdgeClick(pressEdge);
        return;
      }
      const a = snapGesturePoint(p, size, o, { wallVertices: vertices });
      setGesture({
        kind: 'draw',
        tool: 'door',
        a,
        b: a,
        moved: false,
        pressEdge,
      });
      setHoverEdge(null);
      return;
    }
    if (tool === 'select') {
      // A handle on the selected wall grabs its incident chains
      // (rulings 2 + 4, riding selection): each re-derives from its own
      // far endpoint — the chain's OTHER odd-degree lattice vertex.
      // Hit-tested against the press point itself, not hover state.
      const grabbed =
        wallScene && svgRef.current
          ? handleAt(svgPoint(svgRef.current, e))
          : null;
      if (grabbed && wallScene) {
        const chainsToDrag = grabbed.runs.flatMap((runIndex) => {
          const edges = wallScene.runs[runIndex]?.edges ?? [];
          const far = chainEndpoints(edges, size, o).find(
            (r) => !sameCorner(r, grabbed.ref, size, o)
          );
          return far ? [{ far, old: [...edges] }] : [];
        });
        if (chainsToDrag.length > 0) {
          setGesture({
            kind: 'reshape',
            chains: chainsToDrag,
            origin: grabbed.ref,
            b: grabbed.ref,
            moved: false,
            draggedRuns: grabbed.runs,
          });
          setHoverEdge(null);
          return;
        }
      }
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
      // A rendered run selects the doc edges behind it, resolved at
      // click time from the derived scene — no wall id exists and none
      // is added (#804). Flat-top docs draw literal edges, not runs, so
      // there is nothing to hit here by construction.
      if (wallScene && svgRef.current) {
        const hit = nearestRunIndex(
          wallScene.runs,
          svgPoint(svgRef.current, e),
          size
        );
        if (hit !== null) {
          onSelect({ kind: 'wall', edges: wallScene.runs[hit].edges });
          return;
        }
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
      // A reshape drag skips angle magnetism (several chains would each
      // want their own origin) and never magnetizes to the vertices of
      // the runs being dragged — B would stick to its own old position.
      const p = svgPoint(svgRef.current, e);
      const anchor = gesture.kind === 'reshape' ? gesture.origin : gesture.a;
      const b = snapGesturePoint(p, size, o, {
        origin:
          gesture.kind === 'reshape'
            ? undefined
            : cornerPoint(gesture.a, size, o),
        alt: e.altKey,
        wallVertices:
          gesture.kind === 'reshape'
            ? vertices.filter(
                (v) => !v.runs.some((i) => gesture.draggedRuns.includes(i))
              )
            : vertices,
      });
      const moved = gesture.moved || !sameCorner(b, anchor, size, o);
      if (moved !== gesture.moved || !sameCorner(b, gesture.b, size, o)) {
        setGesture({ ...gesture, b, moved });
      }
      return;
    }
    if (tool === 'select' && svgRef.current) {
      setHoverPoint(svgPoint(svgRef.current, e));
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

  /** Commit the dragged rectangle. A press with no travel is a one-cell
   * rectangle, which is the honest reading of the gesture rather than a no-op. */
  const endRect = () => {
    if (!rectFrom) return;
    onPaintRect(rectFrom, hoverCell ?? rectFrom);
    setRoomFrom(null);
  };

  // Release commits (or falls back to the single-edge click); releasing
  // with B back on A after moving, or Escape, or leaving the canvas,
  // cancels.
  const finishGesture = () => {
    if (!gesture) return;
    setGesture(null);
    if (gesture.kind === 'reshape') {
      // Released in place = no-op; released elsewhere replaces every
      // grabbed chain with its re-derived one.
      if (!gesture.moved || sameCorner(gesture.origin, gesture.b, size, o)) {
        return;
      }
      onWallReshape(
        gesture.chains.map((c) => c.old),
        chains
      );
      return;
    }
    if (!gesture.moved) {
      onEdgeClick(gesture.pressEdge);
      return;
    }
    if (sameCorner(gesture.a, gesture.b, size, o)) return;
    if (gesture.kind === 'erase') onWallErase(chains[0]);
    else if (gesture.tool === 'door') onDoorDraw(chains[0]);
    else onWallDraw(chains[0]);
  };

  const selectedRegion = selection?.kind === 'region' ? selection.id : null;
  const selectedDoor = selection?.kind === 'door' ? selection.id : null;
  // A selected wall is a set of doc edges; a run reads as selected when
  // any of its source edges is in the set (the runs re-derive on every
  // doc change, so membership is resolved at render time).
  const selectedWallKeys = useMemo(
    () =>
      selection?.kind === 'wall' ? new Set(selection.edges.map(edgeKey)) : null,
    [selection]
  );
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
  // The implied envelope FIRST, so authored walls and doors draw over it.
  // Every crossing from floor into void is impassable by the runtime's own
  // rule; showing it is what makes a freshly dragged room look like a room
  // instead of a patch of floor.
  for (const cell of floor) {
    for (const n of axialNeighbors(cell)) {
      if (owners.has(axialKey(n))) continue;
      const edge: Edge = [cell, n];
      edgeLines.push({
        key: `env:${edgeKey(edge)}`,
        edge,
        stroke: ENVELOPE_STROKE,
        width: 2.5,
      });
    }
  }
  for (const { edge } of compiledWalls(displayDoc)) {
    const isError = errorEdges.has(edgeKey(edge));
    if (straightened && !isError) continue;
    edgeLines.push({
      key: `w:${edgeKey(edge)}`,
      edge,
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
            cursor:
              gesture?.kind === 'reshape'
                ? 'grabbing'
                : hoverVertex
                  ? 'grab'
                  : cursorFor(tool),
          }}
          onPointerUp={() => {
            endPaint();
            endRect();
            finishGesture();
          }}
          onPointerCancel={() => {
            // A browser-canceled pointer (touch interruption, capture
            // loss) must drop the in-flight gesture WITHOUT committing
            // it — otherwise a later unrelated pointer-up would commit
            // the stale chain (Copilot review, PR #808).
            endPaint();
            // A canceled pointer drops the rectangle without painting it, for the
            // reason the wall gesture drops its chain: a later unrelated
            // pointer-up must not commit a stale drag.
            setRoomFrom(null);
            setGesture(null);
            setHoverEdge(null);
            setHoverCell(null);
            setHoverPoint(null);
          }}
          onPointerLeave={() => {
            endPaint();
            setGesture(null);
            setHoverEdge(null);
            setHoverCell(null);
            setHoverPoint(null);
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
              const isConcealed = !!ownerId && concealedRegionIds.has(ownerId);
              const isHover = hoverCell && axialKey(hoverCell) === key;
              const inRect = rectPreview?.has(key) ?? false;
              return (
                <polygon
                  key={key}
                  data-cell={key}
                  data-region={ownerId ?? ''}
                  data-concealed={isConcealed || undefined}
                  points={cornersPath(cell, size, o)}
                  fill={fill}
                  stroke={
                    isError
                      ? ERROR_STROKE
                      : isSelectedRegion
                        ? HOVER_STROKE
                        : isConcealed
                          ? CONCEALED_STROKE
                          : region
                            ? regionColor(index)
                            : VOID_STROKE
                  }
                  strokeWidth={
                    isError
                      ? 2.5
                      : inRect
                        ? 2
                        : isSelectedRegion
                          ? 1.5
                          : isConcealed
                            ? 2
                            : 1
                  }
                  strokeDasharray={
                    isConcealed && !isError && !isSelectedRegion
                      ? '3 2'
                      : undefined
                  }
                  strokeOpacity={region ? (isActive ? 1 : 0.6) : 1}
                  opacity={
                    inRect
                      ? 0.85
                      : isHover && (tool === 'region' || tool === 'erase')
                        ? 0.8
                        : 1
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
                p.facing !== undefined ? facingAngleDeg(p.facing) : undefined;
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
            {scene?.runs.map((r) => {
              const isSelected =
                !!selectedWallKeys &&
                r.edges.some((edge) => selectedWallKeys.has(edgeKey(edge)));
              return (
                <g key={`run:${r.key}`}>
                  <line
                    data-run={r.key}
                    data-selected={isSelected || undefined}
                    stroke={isSelected ? HOVER_STROKE : WALL_STROKE}
                    strokeWidth={isSelected ? 6 : 4}
                    x1={r.a.x}
                    y1={r.a.y}
                    x2={r.b.x}
                    y2={r.b.y}
                  />
                  {r.height > 0 && (
                    <text
                      data-run-height={r.key}
                      x={(r.a.x + r.b.x) / 2}
                      y={(r.a.y + r.b.y) / 2 - 6}
                      textAnchor="middle"
                      fontSize={11}
                      fill={WALL_STROKE}
                      stroke="none"
                    >
                      ×{r.height}
                    </text>
                  )}
                </g>
              );
            })}
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
          {tool === 'select' && !gesture && (
            <g data-layer="handles" pointerEvents="none">
              {/* The selected wall's endpoints and shared corners are
                  drag handles, visible the moment it is selected
                  (Kirk's walk ruling: manipulation rides selection,
                  the Strava-route-builder grammar). Drawn at the
                  RENDERED endpoints — the points the author sees. */}
              {handleVertices.map((v) => {
                const hot =
                  hoverVertex !== null &&
                  sameCorner(v.ref, hoverVertex.ref, size, o);
                return (
                  <circle
                    key={`vx:${v.point.x.toFixed(2)},${v.point.y.toFixed(2)}`}
                    data-run-vertex={v.runs.length}
                    cx={v.point.x}
                    cy={v.point.y}
                    r={size * (hot ? 0.22 : 0.12)}
                    fill={hot ? HOVER_STROKE : WALL_STROKE}
                    fillOpacity={hot ? 0.9 : 0.5}
                    stroke={hot ? HOVER_STROKE : 'none'}
                  />
                );
              })}
            </g>
          )}
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
              {(gesture.kind === 'reshape'
                ? [gesture.b, ...gesture.chains.map((c) => c.far)]
                : [gesture.a, gesture.b]
              ).map((end, i) => {
                const p = cornerPoint(end, size, o);
                return (
                  <circle
                    key={`end:${i}`}
                    data-gesture-end={i}
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
    case 'room':
    case 'region-rect':
      return 'crosshair';
    case 'wall':
    case 'door':
      return 'cell';
    default:
      return 'pointer';
  }
}
