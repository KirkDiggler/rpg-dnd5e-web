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
  floorOwners,
  isMonsterRef,
  nameFromFloor,
  rectCells,
  sceneryKeys,
  type DungeonDoc,
  type ErrorTarget,
  type ExitDoc,
} from '../dungeonYaml';
import {
  cellPositions,
  latticeKey,
  latticeOf,
  positionCrossing,
  positionKey,
  positionPoint,
  samePosition,
  type PositionRef,
} from '../hexGeometry';
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
  ENVELOPE_DASH,
  ENVELOPE_STROKE,
  ERROR_STROKE,
  EXIT_COLOR,
  HOVER_STROKE,
  litColor,
  MONSTER_COLOR,
  PROP_COLOR,
  regionColor,
  SCENERY_FILL,
  SCENERY_HATCH,
  SCENERY_HATCH_ID,
  SCENERY_STROKE,
  SEALED_HATCH,
  SEALED_HATCH_ID,
  SEALED_PREVIEW_FILL,
  START_COLOR,
  THICK_RAY_STROKE,
  THIN_RAY_STROKE,
  VOID_FILL,
  VOID_STROKE,
  WALL_STROKE,
} from '../markerStyle';
import { thumbForRef } from '../paletteData';
import type { BoardTool, Selection } from '../types';
import {
  boundaryWalls,
  doorTargetsOf,
  wallRaysFrom,
  type BoundaryWall,
  type DoorTarget,
  type PickerEnd,
  type PickerRay,
} from '../wallPicker';
import { boardWallScene, type BoardDoor } from './boardWallRuns';
import {
  cellCenter,
  cellsInBounds,
  cornersPath,
  edgeSegment,
  growBounds,
  neededBounds,
  viewRectFor,
  type GridBounds,
} from './canvasGeometry';
import {
  distanceToSegment,
  nearestWallIndex,
  WALL_HIT_RADIUS,
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
  /** The picker's commit (design §2.6): the two positions the author
   * picked. Nothing derived travels — the owner writes the line. */
  onWallCommit: (start: PositionRef, end: PositionRef) => void;
  /** Shift-click on a wall removes it. */
  onWallDelete: (index: number) => void;
  /** The door tool's click (design §2.8): a position a wall passes
   * through. Toggling, so clicking a door's own position removes it. */
  onDoorToggle: (at: PositionRef) => void;
  onCellClick: (cell: Axial) => void;
  onSelect: (selection: Selection) => void;
  /** The cells the SERVER's compile says nobody can stand on — hatched.
   * Empty until the first compile answers; the picker's own preview is
   * what tells the author the cost before they commit. */
  sealedCells?: ReadonlySet<string>;
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

/** The wall picker's state (design §2.6). Three steps, no drag:
 * click a hex to see its seven positions, click one to become the
 * START, then click one of the offered ENDS. Escape or a click on
 * nothing goes back a step. */
interface WallPick {
  /** The hex whose seven positions are showing, before a start is
   * picked. */
  cell: Axial | null;
  /** The picked start. While set, the twelve rays are drawn from it. */
  start: PositionRef | null;
}

const NO_PICK: WallPick = { cell: null, start: null };

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
  onWallCommit,
  onWallDelete,
  onDoorToggle,
  onCellClick,
  onSelect,
  sealedCells,
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
  /** The cells with no owner but a scenery mark — floor all the same
   * (rpg-project#360 §1.1), so they extend the paintable grid, wear the
   * envelope, and offer their edges to the wall and door tools. */
  const scenery = useMemo(() => sceneryKeys(doc), [doc]);
  const floor = useMemo(
    () => [...doc.regions.flatMap((r) => r.cells), ...doc.scenery],
    [doc.regions, doc.scenery]
  );
  /** `isFloor` as a membership test, built once per document rather than
   * per edge — the same reason `edgeOfferableWith` takes a prebuilt set. */
  const floorSet = useMemo(() => new Set(floor.map(axialKey)), [floor]);
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
  // The document's walls and doors as lines — no fitting, no tolerance:
  // a wall IS the line between its two authored positions, and the board
  // places those positions with the same `hexGeometry` the picker offers
  // them from and the compiler embeds them in.
  const wallScene = useMemo(() => boardWallScene(doc, size), [doc, size]);

  const [pick, setPick] = useState<WallPick>(NO_PICK);
  const [hoverEnd, setHoverEnd] = useState<PickerEnd | null>(null);

  /** The twelve rays from the picked start, each trimmed to the ends
   * that make a legal wall (design §2.6). Recomputed only when the start
   * or the floor changes — a hover costs nothing. */
  const rays: PickerRay[] = useMemo(
    () => (pick.start ? wallRaysFrom(doc, pick.start) : []),
    [doc, pick.start]
  );
  /** The two walls "wall this boundary" offers, when the picked start is
   * a room's own boundary midpoint (design §2.9). */
  const boundaryOffer = useMemo((): {
    thin: BoundaryWall;
    thick: BoundaryWall;
  } | null => {
    if (!pick.start) return null;
    const crossing = crossingOf(doc, pick.start);
    if (!crossing) return null;
    for (const cell of crossing) {
      const regionId = owners.get(axialKey(cell));
      if (!regionId) continue;
      const offer = boundaryWalls(doc, crossing, regionId);
      if (offer) return offer;
    }
    return null;
  }, [doc, pick.start, owners]);

  /** The cells the hovered end would seal — grey, before the author
   * commits (Kirk: "maybe in the design we can visualize where we can
   * go"). */
  const previewSealed = useMemo(
    () => new Set((hoverEnd?.sealed ?? []).map(axialKey)),
    [hoverEnd]
  );

  useEffect(() => {
    if (!pick.cell && !pick.start) return;
    const onKey = (e: KeyboardEvent) => {
      // Escape steps BACK, not out: from the rays to the seven
      // positions, then to nothing. A streamer who mis-picks a start
      // should not lose the hex as well.
      if (e.key !== 'Escape') return;
      setHoverEnd(null);
      setPick((p) => (p.start ? { cell: p.start.cell, start: null } : NO_PICK));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pick]);

  // The wall tool stops picking the moment the tool changes, so a
  // half-made wall never survives into another tool's clicks.
  useEffect(() => {
    setPick(NO_PICK);
    setHoverEnd(null);
  }, [tool]);

  const commitWall = useCallback(
    (start: PositionRef, end: PositionRef) => {
      onWallCommit(start, end);
      setPick(NO_PICK);
      setHoverEnd(null);
    },
    [onWallCommit]
  );

  /** The positions a door may stand on: every position each wall passes
   * through that is the midpoint of a side (a centre opens no crossing).
   * Shown as the door tool's targets. */
  const doorTargets = useMemo(
    () => (tool === 'door' ? doorTargetsOf(doc) : []),
    [tool, doc]
  );

  const doorById = useMemo(
    () => new Map(doc.doors.map((d) => [d.id, d] as const)),
    [doc.doors]
  );

  const errorCells = useMemo(() => {
    const s = new Set<string>();
    for (const t of errorTargets) {
      if (t.kind === 'cell' || t.kind === 'placement') s.add(axialKey(t.cell));
      if (t.kind === 'start' && doc.start) s.add(axialKey(doc.start.at));
      if (t.kind === 'region') {
        for (const c of regionById.get(t.regionId)?.cells ?? []) {
          s.add(axialKey(c));
        }
      }
    }
    return s;
  }, [errorTargets, doc.start, regionById]);
  /** Wall indices and door ids the compiler faulted — a wall is one
   * line, so an error names the whole wall rather than a crossing. */
  const errorWalls = useMemo(() => {
    const walls = new Set<number>();
    const doors = new Set<string>();
    for (const t of errorTargets) {
      if (t.kind === 'wall') walls.add(t.index);
      if (t.kind === 'door') doors.add(t.doorId);
    }
    return { walls, doors };
  }, [errorTargets]);

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
    if (tool === 'region' || tool === 'scenery' || tool === 'erase') {
      const mode =
        tool === 'erase' || e.shiftKey || e.button === 2 ? 'erase' : 'paint';
      painting.current = mode;
      applyBrush(cell, mode);
      return;
    }
    if (tool === 'wall') {
      if (!svgRef.current) return;
      const p = svgPoint(svgRef.current, e);
      // Shift or right button removes the wall under the pointer — the
      // eraser, now that there is one thing to erase rather than a
      // stretch of crossings.
      if (e.shiftKey || e.button === 2) {
        const hit = nearestWallIndex(wallScene.walls, p, size);
        if (hit !== null) onWallDelete(wallScene.walls[hit].index);
        return;
      }
      // Step 1 → step 2: a click on a hex shows its seven positions;
      // clicking the hex again puts them away.
      if (!pick.start) {
        setPick((prev) =>
          prev.cell && axialKey(prev.cell) === axialKey(cell)
            ? NO_PICK
            : { cell, start: null }
        );
        return;
      }
      // With a start picked, a click that misses every offered end goes
      // back to the seven positions of the hex under it — never a
      // silent no-op.
      setPick({ cell, start: null });
      setHoverEnd(null);
      return;
    }
    if (tool === 'door') {
      if (!svgRef.current) return;
      const p = svgPoint(svgRef.current, e);
      const target = nearestDoorTarget(doorTargets, p, doc, size);
      if (target) onDoorToggle(target.position);
      return;
    }
    if (tool === 'select') {
      const key = axialKey(cell);
      const placementIndex = doc.place.findIndex((p) => axialKey(p.at) === key);
      if (placementIndex !== -1) {
        onSelect({ kind: 'placement', index: placementIndex });
        return;
      }
      if (svgRef.current) {
        const p = svgPoint(svgRef.current, e);
        const door = nearestDoorAt(wallScene.doors, p, size);
        if (door) {
          onSelect({ kind: 'door', id: door.doorId });
          return;
        }
        // A wall selects BY INDEX now. The file has a wall in it, so
        // there is a thing to name — the old selection carried the set
        // of doc edges behind a fitted run because no such thing
        // existed (rpg-dnd5e-web#804).
        const hit = nearestWallIndex(wallScene.walls, p, size);
        if (hit !== null) {
          onSelect({ kind: 'wall', index: wallScene.walls[hit].index });
          return;
        }
      }
      // The start and a way out are selected from their own cells — after
      // the placements, doors and walls, because those are things standing
      // ON floor and these two ARE floor cells.
      //
      // THEY SHARE A CELL IN THE REFERENCE TOMB, so one click cannot mean
      // both. The start goes first, because the party's entry is what an
      // author reaches for there — and a SECOND click on a cell already
      // selected cycles to the next thing on it, so the exit under the
      // start is reachable at all. Without the cycle the tomb's `entrance`
      // exit could not be renamed or removed from the board: nothing else
      // in the builder emits an exit selection.
      const onStart = !!doc.start && axialKey(doc.start.at) === key;
      const exitIndex = doc.exits.findIndex((x) => axialKey(x.at) === key);
      if (onStart || exitIndex !== -1) {
        const here: Selection[] = [];
        if (onStart) here.push({ kind: 'start' });
        if (exitIndex !== -1) here.push({ kind: 'exit', index: exitIndex });
        const current = here.findIndex(
          (candidate) =>
            candidate.kind === selection.kind &&
            (candidate.kind !== 'exit' ||
              (selection.kind === 'exit' &&
                candidate.index === selection.index))
        );
        onSelect(here[(current + 1) % here.length]);
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
    if (
      painting.current &&
      (tool === 'region' || tool === 'scenery' || tool === 'erase')
    ) {
      applyBrush(cell, painting.current);
    }
    if (tool === 'door' && svgRef.current) {
      const target = nearestDoorTarget(
        doorTargets,
        svgPoint(svgRef.current, e),
        doc,
        size
      );
      setHoverEdge(target ? crossingOf(doc, target.position) : null);
      return;
    }
    setHoverEdge(null);
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

  const selectedRegion = selection?.kind === 'region' ? selection.id : null;
  const selectedDoor = selection?.kind === 'door' ? selection.id : null;
  const selectedWall = selection?.kind === 'wall' ? selection.index : null;
  const selectedPlacement =
    selection?.kind === 'placement' ? selection.index : null;

  // Literal hex-edge lines are the FLOOR'S OUTER EDGE and nothing else.
  // Walls and doors are drawn as the lines they are, below; the dashed
  // envelope is not a wall — a wall is something the author put there on
  // purpose, and an unwalled boundary is its own authored choice. This
  // line only says "the floor stops here".
  const edgeLines: {
    key: string;
    edge: Edge;
    stroke: string;
    width: number;
    dash?: string;
  }[] = [];
  for (const cell of floor) {
    for (const n of axialNeighbors(cell)) {
      if (floorSet.has(axialKey(n))) continue;
      const edge: Edge = [cell, n];
      edgeLines.push({
        key: `env:${edgeKey(edge)}`,
        edge,
        stroke: ENVELOPE_STROKE,
        width: 2.5,
        dash: ENVELOPE_DASH,
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
            endRect();
          }}
          onPointerCancel={() => {
            // A canceled pointer drops the rectangle without painting
            // it: a later unrelated pointer-up must not commit a stale
            // drag. The wall PICK survives — it is a decision the author
            // made with a click, not a drag in flight, and losing it to
            // a stray touch would be the worse surprise.
            endPaint();
            setRoomFrom(null);
            setHoverEdge(null);
            setHoverCell(null);
          }}
          onPointerLeave={() => {
            endPaint();
            setHoverEdge(null);
            setHoverCell(null);
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <defs>
            {/* The scenery hatch, defined once. The pattern paints its own
                floor colour under the strokes, so one `fill` on the cell
                says both "this is floor" and "nobody stands here". */}
            <pattern
              id={SCENERY_HATCH_ID}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill={SCENERY_FILL} />
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="6"
                stroke={SCENERY_HATCH}
                strokeWidth="2"
              />
            </pattern>
            {/* A SEALED cell keeps its room — it is that room's floor
                that nobody stands on (design §4.3) — so its hatch draws
                OVER the region colour rather than replacing it, which is
                what tells the two apart from scenery at a glance. */}
            <pattern
              id={SEALED_HATCH_ID}
              width="7"
              height="7"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-45)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="7"
                stroke={SEALED_HATCH}
                strokeWidth="2.5"
              />
            </pattern>
          </defs>
          <g data-layer="cells">
            {grid.map((cell) => {
              const key = axialKey(cell);
              const ownerId = owners.get(key);
              const region = ownerId ? regionById.get(ownerId) : undefined;
              const index = ownerId ? (regionIndex.get(ownerId) ?? 0) : 0;
              // A cell is owned, scenery, or void — never two of them
              // (§2.2), which the brush guarantees in the document.
              const isSceneryCell = !ownerId && scenery.has(key);
              const fill = region
                ? litColor(regionColor(index), region.lighting.intensity)
                : isSceneryCell
                  ? `url(#${SCENERY_HATCH_ID})`
                  : VOID_FILL;
              const isSelectedRegion = !!ownerId && ownerId === selectedRegion;
              const isActive = !!ownerId && ownerId === activeRegionId;
              const isError = errorCells.has(key);
              const isConcealed = !!ownerId && concealedRegionIds.has(ownerId);
              const isHover = hoverCell && axialKey(hoverCell) === key;
              const inRect = rectPreview?.has(key) ?? false;
              // Sealed = the compile's answer, hatched. Previewed =
              // what the hovered end WOULD seal, greyed before the
              // author commits (design §2.6).
              const isSealed = sealedCells?.has(key) ?? false;
              const isPreviewSealed = previewSealed.has(key);
              return (
                <g key={key}>
                  <polygon
                    data-cell={key}
                    data-region={ownerId ?? ''}
                    data-scenery={isSceneryCell || undefined}
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
                              : isSceneryCell
                                ? SCENERY_STROKE
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
                        : isHover &&
                            (tool === 'region' ||
                              tool === 'scenery' ||
                              tool === 'erase')
                          ? 0.8
                          : 1
                    }
                    onPointerDown={(e) => handleCellDown(cell, e)}
                    onPointerMove={(e) => handleCellMove(cell, e)}
                    onPointerEnter={(e) => handleCellMove(cell, e)}
                  />
                  {(isSealed || isPreviewSealed) && (
                    <polygon
                      data-sealed={isSealed || undefined}
                      data-sealed-preview={isPreviewSealed || undefined}
                      points={cornersPath(cell, size, o)}
                      fill={
                        isSealed
                          ? `url(#${SEALED_HATCH_ID})`
                          : SEALED_PREVIEW_FILL
                      }
                      fillOpacity={isSealed ? 1 : 0.62}
                      stroke="none"
                      pointerEvents="none"
                    />
                  )}
                </g>
              );
            })}
          </g>
          <g data-layer="start" pointerEvents="none">
            {doc.start && (
              <Start
                cell={doc.start.at}
                facing={doc.start.facing}
                size={size}
                o={o}
                error={errorTargets.some((t) => t.kind === 'start')}
              />
            )}
          </g>
          <g data-layer="exits" pointerEvents="none">
            {doc.exits.map((exit, index) => (
              <Exit
                key={`${exit.id}:${axialKey(exit.at)}`}
                exit={exit}
                size={size}
                o={o}
                selected={
                  selection.kind === 'exit' && selection.index === index
                }
                error={errorTargets.some(
                  (t) => t.kind === 'exit' && t.index === index
                )}
              />
            ))}
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
                <g
                  key={`${p.ref}:${axialKey(p.at)}`}
                  data-placement={i}
                  // A RESERVED PLACEMENT (rpg-project#375 §3.7): authored,
                  // and absent at first light. Drawn faded with a dashed
                  // ring and its word, so the author sees what the party
                  // will NOT see when the run opens.
                  data-arrives={p.arrives !== undefined ? '' : undefined}
                  opacity={p.arrives !== undefined ? 0.55 : undefined}
                >
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
                  {p.arrives !== undefined && (
                    <circle
                      data-arrives-ring={i}
                      cx={c.x}
                      cy={c.y}
                      r={r * 1.3}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />
                  )}
                  {p.arrives !== undefined && (
                    <text
                      data-arrives-label={i}
                      x={c.x}
                      y={c.y + r * 1.3 + size * 0.42}
                      textAnchor="middle"
                      fontSize={size * 0.36}
                      fill="#ffffff"
                    >
                      arrives
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
            {wallScene.walls.map((w) => {
              const isSelected = w.index === selectedWall;
              const isError = errorWalls.walls.has(w.index);
              return (
                <g key={`wall:${w.index}`}>
                  <line
                    data-wall={w.index}
                    data-selected={isSelected || undefined}
                    stroke={
                      isError
                        ? ERROR_STROKE
                        : isSelected
                          ? HOVER_STROKE
                          : WALL_STROKE
                    }
                    strokeWidth={isSelected || isError ? 6 : 4}
                    x1={w.a.x}
                    y1={w.a.y}
                    x2={w.b.x}
                    y2={w.b.y}
                  />
                  {w.height !== undefined && w.height > 1 && (
                    <text
                      data-wall-height={w.index}
                      x={(w.a.x + w.b.x) / 2}
                      y={(w.a.y + w.b.y) / 2 - 6}
                      textAnchor="middle"
                      fontSize={11}
                      fill={WALL_STROKE}
                      stroke="none"
                    >
                      ×{w.height}
                    </text>
                  )}
                </g>
              );
            })}
            {wallScene.doors.map((d) => {
              const doorDoc = doorById.get(d.doorId);
              return (
                <line
                  key={`dr:${d.doorId}`}
                  data-door-run={d.doorId}
                  x1={d.a.x}
                  y1={d.a.y}
                  x2={d.b.x}
                  y2={d.b.y}
                  stroke={
                    errorWalls.doors.has(d.doorId)
                      ? ERROR_STROKE
                      : doorDoc?.locked
                        ? DOOR_LOCKED_STROKE
                        : DOOR_STROKE
                  }
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
          {tool === 'door' && (
            <g data-layer="door-targets" pointerEvents="none">
              {/* Every position a door may stand on: the side midpoints
                  the walls pass through (design §2.8). A centre is
                  offered nowhere — it is the midpoint of no side. */}
              {doorTargets.map((t) => {
                const p = positionPoint(o, t.position, size);
                return (
                  <circle
                    key={`dt:${latticeKey(t.lattice)}`}
                    data-door-target={latticeKey(t.lattice)}
                    data-taken={t.taken || undefined}
                    cx={p.x}
                    cy={p.y}
                    r={size * (t.taken ? 0.16 : 0.11)}
                    fill={t.taken ? DOOR_STROKE : 'none'}
                    stroke={DOOR_STROKE}
                    strokeWidth={2}
                    fillOpacity={0.8}
                    strokeOpacity={t.taken ? 1 : 0.55}
                  />
                );
              })}
            </g>
          )}
          {tool === 'wall' && (
            <g data-layer="picker" pointerEvents="none">
              {/* STEP 1 — the seven positions of the clicked hex. A wall
                  starts on one of them and nowhere else (design §1.6):
                  no freehand, no angle snap, nothing to miss. */}
              {!pick.start &&
                pick.cell &&
                cellPositions(o, pick.cell).map((raw) => {
                  // Named from a floor cell where the point has one, so
                  // the file never carries a cell nobody painted.
                  const position = nameFromFloor(doc, latticeOf(o, raw)) ?? raw;
                  const p = positionPoint(o, position, size);
                  return (
                    <circle
                      key={`seat:${positionKey(o, position)}`}
                      data-position={positionKey(o, position)}
                      cx={p.x}
                      cy={p.y}
                      r={size * 0.16}
                      fill={WALL_STROKE}
                      fillOpacity={0.35}
                      stroke={HOVER_STROKE}
                      strokeWidth={2}
                      pointerEvents="all"
                      style={{ cursor: 'pointer' }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setPick({ cell: null, start: position });
                      }}
                    />
                  );
                })}
              {/* STEP 2 — the twelve rays, each trimmed to the ends that
                  make a legal wall, each coloured by what it costs.
                  THIN seals nothing; THICK seals the cells it runs
                  through the centre of, and those cells grey out under
                  the hovered end before anything is committed. */}
              {pick.start &&
                rays.map((ray) => {
                  const from = positionPoint(o, pick.start!, size);
                  const last = ray.ends[ray.ends.length - 1];
                  const to = positionPoint(o, last.position, size);
                  return (
                    <line
                      key={`ray:${ray.degrees}`}
                      data-ray={ray.degrees}
                      data-thick={ray.thick || undefined}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke={ray.thick ? THICK_RAY_STROKE : THIN_RAY_STROKE}
                      strokeWidth={ray.thick ? 3 : 2}
                      strokeOpacity={0.5}
                      strokeDasharray={ray.thick ? undefined : '5 4'}
                    />
                  );
                })}
              {pick.start &&
                rays.flatMap((ray) =>
                  ray.ends.map((end) => {
                    const p = positionPoint(o, end.position, size);
                    const hot =
                      hoverEnd !== null &&
                      samePosition(o, hoverEnd.position, end.position);
                    return (
                      <circle
                        key={`end:${latticeKey(end.lattice)}`}
                        data-ray-end={latticeKey(end.lattice)}
                        data-thick={ray.thick || undefined}
                        data-joins={end.joins || undefined}
                        cx={p.x}
                        cy={p.y}
                        r={size * (hot ? 0.2 : end.joins ? 0.15 : 0.1)}
                        fill={
                          end.joins
                            ? HOVER_STROKE
                            : ray.thick
                              ? THICK_RAY_STROKE
                              : THIN_RAY_STROKE
                        }
                        fillOpacity={hot ? 1 : 0.75}
                        stroke={hot ? HOVER_STROKE : 'none'}
                        strokeWidth={2}
                        pointerEvents="all"
                        style={{ cursor: 'pointer' }}
                        onPointerEnter={() => setHoverEnd(end)}
                        onPointerLeave={() =>
                          setHoverEnd((cur) => (cur === end ? null : cur))
                        }
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          commitWall(pick.start!, end.position);
                        }}
                      />
                    );
                  })
                )}
              {/* The wall the hovered end would make, drawn solid, and
                  the cost in words beside it. */}
              {pick.start &&
                hoverEnd &&
                (() => {
                  const from = positionPoint(o, pick.start, size);
                  const to = positionPoint(o, hoverEnd.position, size);
                  const cost =
                    hoverEnd.sealed.length === 0
                      ? 'thin — seals nothing'
                      : `thick — seals ${hoverEnd.sealed.length} cell${
                          hoverEnd.sealed.length === 1 ? '' : 's'
                        }`;
                  return (
                    <g data-picker-preview={cost}>
                      <line
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke={HOVER_STROKE}
                        strokeWidth={5}
                        strokeOpacity={0.85}
                      />
                      <text
                        x={(from.x + to.x) / 2}
                        y={(from.y + to.y) / 2 - 8}
                        textAnchor="middle"
                        fontSize={11}
                        fill={HOVER_STROKE}
                      >
                        {hoverEnd.joins ? `${cost} · closes a corner` : cost}
                      </text>
                    </g>
                  );
                })()}
              {/* §2.9 — one gesture for the common case: a straight wall
                  along a room's boundary, thin by default with the thick
                  line one click away. */}
              {pick.start &&
                boundaryOffer &&
                (['thin', 'thick'] as const).map((kind, i) => {
                  const offer = boundaryOffer[kind];
                  const anchor = positionPoint(o, pick.start!, size);
                  return (
                    <g key={`boundary:${kind}`}>
                      <rect
                        data-boundary-offer={kind}
                        x={anchor.x + size * 0.6}
                        y={anchor.y - size * 0.9 + i * size * 0.7}
                        width={size * 5.4}
                        height={size * 0.6}
                        rx={size * 0.15}
                        fill={
                          kind === 'thick' ? THICK_RAY_STROKE : THIN_RAY_STROKE
                        }
                        fillOpacity={0.85}
                        pointerEvents="all"
                        style={{ cursor: 'pointer' }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          commitWall(offer.start, offer.end);
                        }}
                      />
                      <text
                        x={anchor.x + size * 0.8}
                        y={anchor.y - size * 0.45 + i * size * 0.7}
                        fontSize={11}
                        fill="#101418"
                        pointerEvents="none"
                      >
                        {kind === 'thin'
                          ? 'wall this boundary · seals nothing'
                          : `wall this boundary · thick · seals ${offer.sealed.length}`}
                      </text>
                    </g>
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
  facing,
  size,
  o,
  error,
}: {
  cell: Axial;
  /** The authored starting facing, if the author stated one — drawn as
   * the same tick a placement's facing gets, from the same table, so one
   * arrow means one thing everywhere on this board. */
  facing?: string;
  size: number;
  o: DungeonDoc['orientation'];
  error: boolean;
}) {
  const c = cellCenter(cell, size, o);
  const deg = facing !== undefined ? facingAngleDeg(facing) : undefined;
  return (
    <g data-start={axialKey(cell)} data-start-facing={facing || undefined}>
      {deg !== undefined && (
        <line
          data-start-facing-tick=""
          x1={c.x + Math.cos((deg * Math.PI) / 180) * size * 0.5}
          y1={c.y + Math.sin((deg * Math.PI) / 180) * size * 0.5}
          x2={c.x + Math.cos((deg * Math.PI) / 180) * size * 0.95}
          y2={c.y + Math.sin((deg * Math.PI) / 180) * size * 0.95}
          stroke={error ? ERROR_STROKE : START_COLOR}
          strokeWidth={3}
        />
      )}
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

/** A way out, drawn where the party may leave (rpg-project#368 §3.1).
 *
 * A SQUARE, not the start's circle, and its own blue — the entrance and
 * the exit are the same cell in the tomb this slice ships, so two marks
 * have to sit on one hex and still read as two. The id is written beside
 * it because an exit is a NAMED thing a scenario binds to, and a mark you
 * cannot name is a mark you cannot pick in the form. */
function Exit({
  exit,
  size,
  o,
  selected,
  error,
}: {
  exit: ExitDoc;
  size: number;
  o: DungeonDoc['orientation'];
  selected: boolean;
  error: boolean;
}) {
  const c = cellCenter(exit.at, size, o);
  const half = size * 0.42;
  const stroke = error ? ERROR_STROKE : selected ? HOVER_STROKE : EXIT_COLOR;
  return (
    <g data-exit={exit.id}>
      <rect
        x={c.x - half}
        y={c.y - half}
        width={half * 2}
        height={half * 2}
        fill="none"
        stroke={stroke}
        strokeWidth={selected || error ? 4 : 3}
      />
      <text
        x={c.x}
        y={c.y + size * 0.18}
        textAnchor="middle"
        fontSize={size * 0.45}
        fontWeight={700}
        fill={stroke}
      >
        {exit.id}
      </text>
    </g>
  );
}

/** The crossing a position stands across, or null for a centre. */
function crossingOf(doc: DungeonDoc, at: PositionRef): Edge | null {
  return positionCrossing(doc.orientation, latticeOf(doc.orientation, at));
}

/** The door target nearest the pointer, within a hex's own inradius so
 * a click near the wall finds the midpoint the author meant. */
function nearestDoorTarget(
  targets: readonly DoorTarget[],
  point: Point,
  doc: DungeonDoc,
  size: number
): DoorTarget | null {
  let best: DoorTarget | null = null;
  let bestDist = size * 0.5;
  for (const t of targets) {
    const p = positionPoint(doc.orientation, t.position, size);
    const d = Math.hypot(p.x - point.x, p.y - point.y);
    if (d <= bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return best;
}

/** The drawn door gap nearest the pointer, for the select tool. */
function nearestDoorAt(
  doors: readonly BoardDoor[],
  point: Point,
  size: number
): BoardDoor | null {
  let best: BoardDoor | null = null;
  let bestDist = WALL_HIT_RADIUS * size;
  for (const d of doors) {
    const dist = distanceToSegment(point, d.a, d.b);
    if (dist <= bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  return best;
}

function cursorFor(tool: BoardTool): string {
  switch (tool) {
    case 'region':
    case 'scenery':
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
