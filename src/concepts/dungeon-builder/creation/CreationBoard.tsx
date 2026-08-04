/**
 * CreationBoard — the "New Dungeon" freeform canvas: draw walls, place
 * doors, mark start/end/holes, place props/monsters with facing. Renders
 * off the SAME `DungeonDoc`/CST edit mode's `Board.tsx` does (the CST
 * unification — see CONTRACT.md's "unifying New Dungeon onto the shared
 * CST" section) via `doc.canvas`/`doc.walls`/`doc.holes`/`doc.start`/
 * `doc.end`/`doc.place` — all top-level, absolute-`[col,row]` fields,
 * `place:` included (the decided target-dialect shape: room-scoped
 * `place:` is v1's own heritage, not something a from-scratch canvas
 * with zero rooms needs to fake — see TARGET-YAML.md's "top-level
 * placement" section; an earlier round briefly tried a synthetic
 * `archetype: canvas` bridge room instead, rejected, see CONTRACT.md).
 * Still its own specialized renderer, not `Board.tsx` itself — creation
 * mode's own tools (edge-painting walls with a live stroke, the Region
 * paint brush, start/end/hole markers) are genuinely different
 * interactions from the compiled edit board's click-to-place/drag-to-move
 * — but the underlying CELL GEOMETRY is now identical (see
 * "HEX-TRUE" below), not a second coordinate system.
 *
 * **HEX-TRUE (2026-08-03)**: this board used to render a plain rectangular
 * grid (`FLAT_COL_SPACING`/`FLAT_ROW_SPACING`, axis-aligned cells/edges).
 * Kirk, diagnosing it directly: "that new dungeon is squares... our walls
 * as we lay them out cannot follow along the edge... any hex that is not
 * 100% uncovered would not be traversable by the players" — a square grid
 * only exposes 4 of a hex's 6 real adjacencies, so a region that reads as
 * fully enclosed on squares can have two invisible open edges in hex
 * reality (players walk through the diagonals — false enclosure); and
 * "walls look like vertical blinds along the side edges" — disconnected
 * parallel slats where real hex edges share corners and chain into a
 * continuous run. This board now renders every cell/edge/marker through
 * `creationGeometry.ts`'s hex functions, which build on the SAME
 * `hexLayout.ts` math the compiled edit-mode `Board.tsx` renders with —
 * one coordinate space, not two. The canvas dimension semantics (a
 * `{width,height}` grid of `[col,row]` cells) are unchanged.
 *
 * Client-side only in the sense that matters — no server call happens
 * here (design.md defers wall/shape authoring to P4+; there is no real
 * schema for any of this yet). But the DOCUMENT is real: it round-trips
 * through the same `yaml` CST parser/serializer, the same YAML pane, the
 * same Inspector, as edit mode's document.
 *
 * Wall interaction: EDGE-PAINTING, not cell-painting (a finding worth
 * recording: cell-painting — mark a cell solid/floor — was the other
 * obvious option, simpler to hit-test, but doors need to sit ON a
 * specific wall segment, and the real EncounterService.Space.walls wire
 * type is already edge-native (`Wall{from,to,kind,id}`, confirmed against
 * fog-of-war's CONTRACT.md research) — edge-painting is both what Kirk
 * literally described ("draw the walls") and the shape that maps onto
 * the real wire type without translation. Click-drag paints a stroke of
 * same-state edges (first edge touched decides add-vs-erase for the
 * whole stroke), same interaction grammar as any paint tool. See
 * `creationGeometry.ts`'s `nearestEdge` doc comment for why the hex
 * version of this drag no longer needs an orientation lock to stay
 * CONNECTED (unlike the square predecessor's crenellated-comb bug) — the
 * lock (`dragFamily`) survives here only to hold one deliberate "which of
 * the 3 parallel-edge families" choice for the whole stroke.
 */
import {
  facingDirection,
  HEX_FACING_LABELS,
} from '@/components/hex-grid/authorGridHelpers';
import { cubeToWorld } from '@/components/hex-grid/hexMath';
import { useRef, useState, type ReactElement } from 'react';
import type { DungeonDoc, WallDoc, WallKind } from '../dungeonYaml';
import { BOARD_HEX_SIZE, cellCenter, type CellPos } from '../hexLayout';
import {
  END_COLOR,
  regionArchetypeColor,
  resolveMarkerStyle,
  START_COLOR,
} from '../markerStyle';
import { PlacementMarker } from '../PlacementMarker';
import { regionCentroid } from '../regionGeometry';
import type { BoardTool, PlacementSelection } from '../types';
import type { BoardEditing } from '../useBoardEditing';
import {
  creationCellCenter,
  creationCellPolygon,
  dragFamily,
  nearestCreationCell,
  nearestEdge,
  openBoundaryEdges,
  pointToSegmentDistSq,
  wallGeometry,
  type EdgeGeometry,
} from './creationGeometry';
import { DEFAULT_CANVAS } from './emptyCanvasDoc';
import {
  pickStraightAxis,
  snapStraightEndpoint,
  straightWallCrossedEdges,
  straightWallFootprint,
  straightWallsFootprintSet,
  type StraightAxis,
} from './straightWallGeometry';
import type { RegionEditing } from './useRegionEditing';

interface CreationBoardProps {
  doc: DungeonDoc;
  edit: BoardEditing;
  tool: BoardTool | null;
  /** Wraps `edit.setSelectedPlacement` with the caller's own
   * clear-other-selections discipline (a tool/palette selection must
   * drop the moment a placement is picked, same as edit mode) — the
   * board calls this instead of `edit.setSelectedPlacement` directly. */
  onSelectPlacement: (sel: PlacementSelection | null) => void;
  onReject: (message: string) => void;
  onToggleWallEdge: (
    from: [number, number],
    to: [number, number],
    kind: WallKind,
    on: boolean
  ) => void;
  /** Straight Wall tool (this unit) — commits one new `wallLines:` entry
   * per stroke, unlike `onToggleWallEdge`'s per-edge painting. See
   * `straightWallGeometry.ts`. */
  onAddStraightWall: (
    from: [number, number],
    to: [number, number],
    kind: WallKind
  ) => void;
  /** Click (no drag) on an existing straight wall's line deletes it —
   * the straight-wall tool's own "click to add/remove" affordance,
   * mirroring the edge Wall tool's `wallCount`× drawn — click a wall
   * cell to add/remove" language in `Palette.tsx`. */
  onRemoveStraightWallAt: (index: number) => void;
  /** Door tool, applied to a straight wall — flips `solid`/`door` by
   * index, same "click an existing wall to flip solid ↔ door" gesture
   * the edge Wall/Door pair already gives `doc.walls`. */
  onToggleStraightWallKindAt: (index: number) => void;
  onToggleHole: (col: number, row: number) => void;
  onSetPoint: (kind: 'start' | 'end', col: number, row: number) => void;
  /** Cell-authored semantic region editing (rpg-project#180) — only
   * meaningful when `tool === 'region'`; the board reads `regionEdit`'s
   * own `pendingCells`/`selectedRegionId` to decide what a click does.
   * See `useRegionEditing.ts`'s own doc comment. */
  regionEdit: RegionEditing;
}

// Same 6-direction convention authorGridHelpers.ts already defines for
// hex grids (HEX_FACING_LABELS, order E,NE,NW,W,SW,SE) — the facing arrow
// convention was never square-canvas-specific in the first place (it
// already used real hex angles even when the canvas underneath it was
// still flat squares — TARGET-YAML.md's "reused the existing 6-direction
// convention, not a rectangular compass" finding), so it's unchanged by
// the hex-true rendering round.
const FACING_ANGLES_DEG = HEX_FACING_LABELS.map((_, i) => {
  const dir = facingDirection(i);
  const world = cubeToWorld(dir, 1);
  return (Math.atan2(world.z, world.x) * 180) / Math.PI;
});

/** This edge's wall, or `undefined` if none is drawn there — a direct
 * `doc.walls` scan (creation-mode canvases are small enough that this is
 * cheap; edit mode's own equivalent lookups are CST-side, in
 * dungeonYaml.ts, for the same reason: nothing here needs an index). */
function wallAtEdge(
  doc: DungeonDoc,
  from: [number, number],
  to: [number, number]
): WallDoc | undefined {
  return doc.walls.find(
    (w) =>
      w.from[0] === from[0] &&
      w.from[1] === from[1] &&
      w.to[0] === to[0] &&
      w.to[1] === to[1]
  );
}

/** Index of the `doc.wallLines` entry nearest `point`, within `maxDist`
 * board units, or `null` if none is close enough — the straight-wall
 * tool's own click-to-delete hit test, and (with a tighter radius) the
 * Door tool's "click an existing straight wall" test. Point-to-segment
 * distance against the wall's own world-space line (`cellCenter(from)`
 * to `cellCenter(to)`), same primitive `creationGeometry.ts`'s
 * `nearestEdge` uses internally, exported from there for this purpose. */
function straightWallLineIndexNear(
  doc: DungeonDoc,
  point: CellPos,
  maxDist = 8
): number | null {
  let best: number | null = null;
  let bestDistSq = maxDist * maxDist;
  doc.wallLines.forEach((line, i) => {
    const a = cellCenter(line.from[0], line.from[1]);
    const b = cellCenter(line.to[0], line.to[1]);
    const d = pointToSegmentDistSq(point, a, b);
    if (d < bestDistSq) {
      bestDistSq = d;
      best = i;
    }
  });
  return best;
}

const CELL_SIZE = BOARD_HEX_SIZE - 1.5;

export function CreationBoard({
  doc,
  edit,
  tool,
  onSelectPlacement,
  onReject,
  onToggleWallEdge,
  onAddStraightWall,
  onRemoveStraightWallAt,
  onToggleStraightWallKindAt,
  onToggleHole,
  onSetPoint,
  regionEdit,
}: CreationBoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverEdge, setHoverEdge] = useState<EdgeGeometry | null>(null);
  const [stroke, setStroke] = useState<{
    addMode: boolean;
    startPoint: { x: number; y: number };
    /** `null` until the drag has moved far enough to tell direction — see
     * `handlePointerMove`'s own comment. One of the 3 parallel-edge
     * families (`creationGeometry.ts`'s `dragFamily`), not an 'h'/'v'
     * pair — a hex cell has 3 edge orientations, not 2. */
    family: 0 | 1 | 2 | null;
  } | null>(null);
  const [dragPlacement, setDragPlacement] = useState<PlacementSelection | null>(
    null
  );
  /** Region-brush drag state (Kirk's ask: "building a region should have
   * us draw the shape. right now we have to click every square") — `mode`
   * is decided ONCE, from the FIRST cell's own membership (or a Shift
   * override, the "modifier... removes" eraser), then held for the whole
   * stroke, mirroring the wall stroke's own `addMode`. `touched` is a
   * per-stroke, once-per-cell dedup set — without it, a slow drag firing
   * many pointer-move events over the SAME cell would call the mutator
   * repeatedly for no reason (each call is already idempotent against
   * `mode`, so this is a perf/no-op guard, not a correctness one). */
  const [regionStroke, setRegionStroke] = useState<{
    mode: 'add' | 'erase';
    touched: Set<string>;
  } | null>(null);
  /** Straight Wall tool's own drag state (this unit) — genuinely
   * different shape from `stroke` above: an edge-wall stroke paints a
   * whole CHAIN of edges as it goes; a straight-wall stroke has exactly
   * ONE `from`/`to` pair, committed once on pointer-up. `axis` mirrors
   * `stroke.family`'s "undecided until the drag clears a threshold"
   * shape, but with 2 screen-space choices (vertical/horizontal) instead
   * of 3 hex edge families — see `straightWallGeometry.ts`'s
   * `pickStraightAxis`. `deleteCandidate` is resolved on pointer-DOWN
   * (which existing straight wall, if any, was clicked) but only acted
   * on at pointer-UP, and only if the whole gesture turns out to have
   * been a CLICK rather than a real drag (see `handlePointerUp`) — a
   * drag starting on top of an existing line still draws a new one,
   * consistent with every other tool's click-vs-drag split in this
   * component. */
  const [straightStroke, setStraightStroke] = useState<{
    fromCell: [number, number];
    toCell: [number, number];
    axis: StraightAxis | null;
    startPoint: CellPos;
    deleteCandidate: number | null;
  } | null>(null);

  const grid = doc.canvas ?? DEFAULT_CANVAS;

  const toBoardPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    const p = ctm ? pt.matrixTransform(ctm.inverse()) : { x: 0, y: 0 };
    return { x: p.x, y: p.y };
  };

  const applyEdgeAction = (edge: EdgeGeometry, addModeOverride?: boolean) => {
    if (tool === 'wall') {
      const existing = wallAtEdge(doc, edge.cellA, edge.cellB);
      const shouldAdd = addModeOverride ?? !existing;
      onToggleWallEdge(edge.cellA, edge.cellB, 'solid', shouldAdd);
    } else if (tool === 'door') {
      const existing = wallAtEdge(doc, edge.cellA, edge.cellB);
      if (!existing) {
        onReject('Doors sit on a drawn wall — draw a wall here first.');
        return;
      }
      onToggleWallEdge(
        edge.cellA,
        edge.cellB,
        existing.kind === 'door' ? 'solid' : 'door',
        true
      );
    }
  };

  const handlePointerDown: React.PointerEventHandler<SVGSVGElement> = (e) => {
    const p = toBoardPoint(e.clientX, e.clientY);

    // A palette selection always means "place this on click", regardless
    // of which tool button is still highlighted — it must be checked
    // before the tool branches below, not after, or it's unreachable
    // whenever the caller also passes a tool alongside it (which
    // CreationConcept does, so the toolbar visually falls back to
    // select/move once something's been placed).
    if (edit.selectedPalette) {
      const cell = nearestCreationCell(p, grid);
      // Boss stays room-scoped even in the target dialect (dungeonspec's
      // validateBossCardinality needs an owning archetype:boss room —
      // see TARGET-YAML.md's "top-level placement" section) — a
      // from-scratch canvas has zero rooms, so there is nowhere honest
      // for a boss pin to go yet. Same guard Board.tsx's own click
      // handler makes for edit mode (moveBoss throws if the target room
      // has no existing boss: entry); rejecting here avoids an uncaught
      // DungeonParseError instead of just avoiding a bad UX.
      if (edit.selectedPalette.kind === 'boss') {
        onReject(
          'Boss stays room-scoped — this canvas has no rooms yet to hold one (see TARGET-YAML.md).'
        );
        return;
      }
      edit.handlePlace(null, cell);
      return;
    }
    if (tool === null) {
      // Placement drag is started from the marker itself (onPointerDown
      // there); clicking empty board space here just deselects.
      onSelectPlacement(null);
      return;
    }
    if (tool === 'start' || tool === 'end') {
      const cell = nearestCreationCell(p, grid);
      onSetPoint(tool, cell[0], cell[1]);
      return;
    }
    if (tool === 'hole') {
      const cell = nearestCreationCell(p, grid);
      onToggleHole(cell[0], cell[1]);
      return;
    }
    if (tool === 'region') {
      const cell = nearestCreationCell(p, grid);
      const cellKey = `${cell[0]},${cell[1]}`;
      if (regionEdit.selectedRegionId) {
        // Editing an existing region's membership. Mode for the WHOLE
        // drag is decided here, from this first cell — Shift forces
        // erase (the "modifier... removes" affordance) regardless of
        // this cell's own state; otherwise erase iff this cell is
        // already a member, matching the pre-drag-brush single-click
        // toggle feel. `addCellToRegion`'s own overlap validation still
        // catches a cell that belongs to another region (surfaces a
        // toast), same as before.
        const region = doc.regions.find(
          (r) => r.id === regionEdit.selectedRegionId
        );
        const isMember =
          region?.cells.some((c) => c[0] === cell[0] && c[1] === cell[1]) ??
          false;
        const mode: 'add' | 'erase' = e.shiftKey
          ? 'erase'
          : isMember
            ? 'erase'
            : 'add';
        regionEdit.setSelectedRegionCellMembership(cell, mode === 'add');
        setRegionStroke({ mode, touched: new Set([cellKey]) });
        return;
      }
      // No region selected yet: a click on an EXISTING region's cell
      // selects it for editing (only when there's no in-progress new-
      // region paint session — a mid-paint click always means "toggle
      // this cell into the region I'm painting," even if it happens to
      // land on another region's territory, since createRegion's own
      // overlap check is what should catch that, not a silent
      // reinterpretation of the click). A SELECT click never starts a
      // paint stroke — it's a discrete action, not a drag gesture; the
      // author drags to paint on a SEPARATE gesture after selecting.
      // Otherwise, this is the first cell of a pending-region paint
      // stroke — same add-vs-erase mode decision as the selected-region
      // branch above.
      const hit =
        regionEdit.pendingCells.length === 0
          ? doc.regions.find((r) =>
              r.cells.some((c) => c[0] === cell[0] && c[1] === cell[1])
            )
          : undefined;
      if (hit) {
        regionEdit.selectRegion(hit.id);
        return;
      }
      const isPending = regionEdit.pendingCells.some(
        (c) => c[0] === cell[0] && c[1] === cell[1]
      );
      const mode: 'add' | 'erase' = e.shiftKey
        ? 'erase'
        : isPending
          ? 'erase'
          : 'add';
      regionEdit.setPendingCellMembership(cell, mode === 'add');
      setRegionStroke({ mode, touched: new Set([cellKey]) });
      return;
    }
    if (tool === 'straightWall') {
      const cell = nearestCreationCell(p, grid);
      // Resolved now (which existing straight wall, if any, sits under
      // the click) but only ACTED on at pointer-up, and only if this
      // whole gesture turns out to have been a click rather than a real
      // drag — see `straightStroke`'s own doc comment.
      const hit = straightWallLineIndexNear(doc, p);
      setStraightStroke({
        fromCell: cell,
        toCell: cell,
        axis: null,
        startPoint: p,
        deleteCandidate: hit,
      });
      return;
    }
    const edge = nearestEdge(p, grid);
    if (!edge) return;
    if (tool === 'wall') {
      const existing = wallAtEdge(doc, edge.cellA, edge.cellB);
      setStroke({ addMode: !existing, startPoint: p, family: null });
      applyEdgeAction(edge, !existing);
    } else if (tool === 'door') {
      // A straight wall's own line rarely coincides with a hex edge (see
      // straightWallGeometry.ts's own header comment), so a click meant
      // to flip a STRAIGHT wall's kind needs its own hit test rather than
      // falling through to the edge-wall lookup below, which would
      // usually just find the nearest (unrelated) edge-wall candidate
      // instead. Tight radius, checked first: a straight wall directly
      // under the click always wins over an edge-wall toggle.
      const lineHit = straightWallLineIndexNear(doc, p, 8);
      if (lineHit !== null) {
        onToggleStraightWallKindAt(lineHit);
        return;
      }
      applyEdgeAction(edge);
    }
  };

  // A quarter cell of movement before committing to a direction — small
  // enough to feel immediate, large enough not to fire on hand-tremor.
  // Board-space, not tied to any one axis (hex has 3 edge families, not
  // 2), so this compares against the hex radius directly rather than a
  // per-axis spacing constant the square predecessor had.
  const DIRECTION_LOCK_THRESHOLD = BOARD_HEX_SIZE * 0.5;

  const handlePointerMove: React.PointerEventHandler<SVGSVGElement> = (e) => {
    const p = toBoardPoint(e.clientX, e.clientY);
    if (dragPlacement) {
      const cell = nearestCreationCell(p, grid);
      edit.handleMove(dragPlacement, null, cell);
      return;
    }
    if (tool === 'straightWall' && straightStroke) {
      const dx = p.x - straightStroke.startPoint.x;
      const dy = p.y - straightStroke.startPoint.y;
      let axis = straightStroke.axis;
      // Same "undecided until the drag clears a threshold, then locked
      // for the rest of the stroke" shape the edge-wall tool's `family`
      // uses just below — see `pickStraightAxis`'s own doc comment for
      // why this is 2-way (vertical/horizontal), not 3-way.
      if (axis === null && Math.hypot(dx, dy) >= DIRECTION_LOCK_THRESHOLD) {
        axis = pickStraightAxis(dx, dy);
      }
      const toCell = axis
        ? snapStraightEndpoint(straightStroke.fromCell, p, axis, grid)
        : straightStroke.fromCell;
      setStraightStroke({ ...straightStroke, axis, toCell });
      return;
    }
    if (tool === 'wall' || tool === 'door') {
      if (stroke && tool === 'wall') {
        let family = stroke.family;
        if (family === null) {
          // A drag along one of the 3 hex edge families draws a wall in
          // that family (dragFamily picks whichever family's own edge
          // LINE is most nearly parallel to the drag vector — tracing a
          // wall means dragging roughly along it). Locked once per
          // stroke so a long drag can't wander onto an unrelated third
          // family mid-way — see creationGeometry.ts's `nearestEdge` doc
          // comment for why this is a stabilizer, not (like the square
          // predecessor's h/v lock) a correctness fix: a hex cell's 6
          // nearest-edge regions already tile with no gap, so a plain
          // unlocked pick can't produce the old crenellated-comb bug.
          const dx = p.x - stroke.startPoint.x;
          const dy = p.y - stroke.startPoint.y;
          if (Math.hypot(dx, dy) >= DIRECTION_LOCK_THRESHOLD) {
            family = dragFamily(dx, dy);
            setStroke({ ...stroke, family });
          }
        }
        const edge = nearestEdge(p, grid, family ?? undefined);
        setHoverEdge(edge);
        if (edge)
          onToggleWallEdge(edge.cellA, edge.cellB, 'solid', stroke.addMode);
        return;
      }
      const edge = nearestEdge(p, grid);
      setHoverEdge(edge);
    } else {
      setHoverEdge(null);
    }
    if (tool === 'region' && regionStroke) {
      const cell = nearestCreationCell(p, grid);
      const key = `${cell[0]},${cell[1]}`;
      if (!regionStroke.touched.has(key)) {
        regionStroke.touched.add(key);
        if (regionEdit.selectedRegionId) {
          regionEdit.setSelectedRegionCellMembership(
            cell,
            regionStroke.mode === 'add'
          );
        } else {
          regionEdit.setPendingCellMembership(
            cell,
            regionStroke.mode === 'add'
          );
        }
      }
    }
  };

  const handlePointerUp: React.PointerEventHandler<SVGSVGElement> = () => {
    setStroke(null);
    setDragPlacement(null);
    setRegionStroke(null);
    if (straightStroke) {
      const moved =
        straightStroke.toCell[0] !== straightStroke.fromCell[0] ||
        straightStroke.toCell[1] !== straightStroke.fromCell[1];
      if (moved) {
        onAddStraightWall(
          straightStroke.fromCell,
          straightStroke.toCell,
          'solid'
        );
      } else if (straightStroke.deleteCandidate !== null) {
        // A CLICK (no real drag) landing on an existing straight wall
        // deletes it — a drag that merely STARTS on top of one still
        // draws a new segment (the `moved` branch above), consistent
        // with every other tool's click-vs-drag split in this component.
        onRemoveStraightWallAt(straightStroke.deleteCandidate);
      }
      setStraightStroke(null);
    }
  };

  // --- base grid: one hex polygon per cell, replacing the square
  // predecessor's tiled-rect pattern background. Also the extent-tracking
  // pass the viewBox below is computed from — a hex canvas' true bounding
  // box isn't a clean `width*height` rectangle the way a square grid's
  // was (see hexLayout.ts's own "the floor plan shears diagonally"
  // finding, CONTRACT.md), so it's derived from real corner positions
  // like Board.tsx's compiled-board viewBox already does, not recomputed
  // by a second, parallel formula.
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  const trackExtent = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  const trackCellExtent = (col: number, row: number) => {
    creationCellPolygon(col, row).forEach(([x, y]) => trackExtent(x, y));
  };

  const cellEls: ReactElement[] = [];
  for (let col = 0; col < grid.width; col++) {
    for (let row = 0; row < grid.height; row++) {
      const corners = creationCellPolygon(col, row);
      corners.forEach(([x, y]) => trackExtent(x, y));
      const points = corners
        .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
        .join(' ');
      cellEls.push(
        <polygon
          key={`cell-${col}-${row}`}
          points={points}
          fill="#1a1512"
          stroke="#2a2521"
          strokeWidth={1}
          pointerEvents="none"
        />
      );
    }
  }

  const wallEls: ReactElement[] = [];
  for (const wall of doc.walls) {
    const edge = wallGeometry(wall.from, wall.to);
    wallEls.push(
      <line
        key={`${wall.from.join(',')}-${wall.to.join(',')}`}
        x1={edge.a.x}
        y1={edge.a.y}
        x2={edge.b.x}
        y2={edge.b.y}
        stroke={wall.kind === 'door' ? '#ffb347' : '#e8e2d8'}
        strokeWidth={wall.kind === 'door' ? 3 : 4}
        strokeLinecap="round"
      />
    );
    if (wall.kind === 'door') {
      wallEls.push(
        <circle
          key={`${wall.from.join(',')}-${wall.to.join(',')}-hinge`}
          cx={edge.mid.x}
          cy={edge.mid.y}
          r={3.5}
          fill="#100d0b"
          stroke="#ffb347"
          strokeWidth={1.5}
        />
      );
    }
  }

  // Straight walls (this unit) — genuinely different rendering job from
  // wallEls above: each entry ALSO needs its FOOTPRINT (every hex its
  // line clips, per Kirk's "any hex that is not 100% uncovered would not
  // be traversable" rule) drawn as a hatched overlay — deliberately
  // distinct from both the plain wall line itself and the region
  // open-boundary red LINE (`creationGeometry.ts`'s `openBoundaryEdges`
  // below), and its blocked EDGE crossings (movement semantics (b) —
  // straightWallGeometry.ts's `straightWallCrossedEdges`) as a dashed
  // highlight across the specific grazed edge. Rendered BEFORE the wall's
  // own line so the line draws on top of its footprint, matching how
  // `wallEls` layers its door hinge on top of its own line above.
  const committedFootprint = straightWallsFootprintSet(doc.wallLines, grid);
  const straightWallEls: ReactElement[] = [];
  doc.wallLines.forEach((line, index) => {
    const a = creationCellCenter(line.from[0], line.from[1]);
    const b = creationCellCenter(line.to[0], line.to[1]);
    const footprint = straightWallFootprint(line.from, line.to, grid);
    for (const [col, row] of footprint) {
      const corners = creationCellPolygon(col, row, CELL_SIZE * 0.92)
        .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
        .join(' ');
      straightWallEls.push(
        <polygon
          key={`swall-${index}-fp-${col}-${row}`}
          points={corners}
          fill="url(#db-footprint-hatch)"
          stroke="#c94f4f"
          strokeWidth={1.5}
          pointerEvents="none"
        />
      );
    }
    for (const edge of straightWallCrossedEdges(
      line.from,
      line.to,
      grid,
      footprint
    )) {
      straightWallEls.push(
        <line
          key={`swall-${index}-cross-${edge.cellA.join(',')}-${edge.cellB.join(',')}`}
          x1={edge.a.x}
          y1={edge.a.y}
          x2={edge.b.x}
          y2={edge.b.y}
          stroke="#c94f4f"
          strokeWidth={2.5}
          strokeDasharray="2 2"
          pointerEvents="none"
        />
      );
    }
    straightWallEls.push(
      <line
        key={`swall-${index}`}
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={line.kind === 'door' ? '#ffb347' : '#e8e2d8'}
        strokeWidth={line.kind === 'door' ? 3 : 4}
        strokeLinecap="round"
      />
    );
    if (line.kind === 'door') {
      straightWallEls.push(
        <circle
          key={`swall-${index}-hinge`}
          cx={(a.x + b.x) / 2}
          cy={(a.y + b.y) / 2}
          r={3.5}
          fill="#100d0b"
          stroke="#ffb347"
          strokeWidth={1.5}
        />
      );
    }
  });

  // Live drag preview — same footprint/crossing treatment, amber and
  // dashed to read as "not committed yet" (this component's existing
  // provisional-content convention — see `pendingRegionEls` below).
  const straightPreviewEls: ReactElement[] = [];
  let previewFootprint: [number, number][] = [];
  const strokeHasMoved =
    !!straightStroke &&
    (straightStroke.toCell[0] !== straightStroke.fromCell[0] ||
      straightStroke.toCell[1] !== straightStroke.fromCell[1]);
  if (tool === 'straightWall' && straightStroke && strokeHasMoved) {
    previewFootprint = straightWallFootprint(
      straightStroke.fromCell,
      straightStroke.toCell,
      grid
    );
    for (const [col, row] of previewFootprint) {
      const corners = creationCellPolygon(col, row, CELL_SIZE * 0.92)
        .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
        .join(' ');
      straightPreviewEls.push(
        <polygon
          key={`swall-preview-fp-${col}-${row}`}
          points={corners}
          fill="url(#db-footprint-hatch)"
          stroke="#ffb347"
          strokeWidth={1.5}
          strokeDasharray="3 2"
          pointerEvents="none"
        />
      );
    }
    for (const edge of straightWallCrossedEdges(
      straightStroke.fromCell,
      straightStroke.toCell,
      grid,
      previewFootprint
    )) {
      straightPreviewEls.push(
        <line
          key={`swall-preview-cross-${edge.cellA.join(',')}-${edge.cellB.join(',')}`}
          x1={edge.a.x}
          y1={edge.a.y}
          x2={edge.b.x}
          y2={edge.b.y}
          stroke="#ffb347"
          strokeWidth={2.5}
          strokeDasharray="2 2"
          pointerEvents="none"
        />
      );
    }
    const pa = creationCellCenter(
      straightStroke.fromCell[0],
      straightStroke.fromCell[1]
    );
    const pb = creationCellCenter(
      straightStroke.toCell[0],
      straightStroke.toCell[1]
    );
    straightPreviewEls.push(
      <line
        key="swall-preview-line"
        x1={pa.x}
        y1={pa.y}
        x2={pb.x}
        y2={pb.y}
        stroke="#ffb347"
        strokeWidth={3}
        strokeDasharray="5 3"
        strokeLinecap="round"
        opacity={0.85}
        pointerEvents="none"
      />
    );
  }

  // Union of every straight wall's footprint — committed AND the live
  // preview, if one is in progress — what placements/start/end/region
  // cells below are checked against so a newly-drawn footprint FLAGS
  // anything it now covers instead of silently deleting or moving it.
  // Live preview is included deliberately: an author dragging a wall
  // over an existing monster should see the warning appear before even
  // releasing the pointer, not just after.
  const footprintKeys = new Set(committedFootprint);
  for (const [col, row] of previewFootprint) {
    footprintKeys.add(`${col},${row}`);
  }
  const inFootprint = (col: number, row: number) =>
    footprintKeys.has(`${col},${row}`);

  // Same dark/dashed treatment Board.tsx (edit mode) uses for a target-
  // dialect hole — one visual language for "no floor here" across both
  // boards. Hex polygon now, not an axis-aligned rect.
  const holeEls: ReactElement[] = doc.holes.map(([col, row]) => {
    const corners = creationCellPolygon(col, row, CELL_SIZE * 0.75)
      .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
      .join(' ');
    return (
      <polygon
        key={`hole-${col}-${row}`}
        points={corners}
        fill="#050403"
        stroke="#2a1a33"
        strokeWidth={1.5}
        strokeDasharray="3 2"
        pointerEvents="none"
      />
    );
  });

  // Cell-authored semantic regions (rpg-project#180) — a tinted hex
  // polygon per member cell (archetype-colored via `regionArchetypeColor`,
  // the SAME color the edit-mode hex board's read-only overlay uses) plus
  // one label at the region's centroid. `pointerEvents="none"` throughout:
  // the board's own `handlePointerDown` already resolves "was an existing
  // region clicked" via `nearestCreationCell` + a `doc.regions` scan, so
  // these elements are purely visual, not a second independent hit-test
  // surface.
  const regionEls: ReactElement[] = [];
  for (const region of doc.regions) {
    const color = regionArchetypeColor(region.archetype);
    const selected = regionEdit.selectedRegionId === region.id;
    for (const [col, row] of region.cells) {
      const corners = creationCellPolygon(col, row, CELL_SIZE * 0.92)
        .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
        .join(' ');
      regionEls.push(
        <polygon
          key={`region-${region.id}-${col}-${row}`}
          points={corners}
          fill={color}
          fillOpacity={selected ? 0.32 : 0.18}
          stroke={color}
          strokeWidth={selected ? 2 : 1}
          strokeDasharray={selected ? undefined : '3 2'}
          pointerEvents="none"
        />
      );
      // A straight wall's footprint landing inside a region's own cells
      // is FLAGGED, never auto-removed from the region — Kirk's rule
      // makes the cell impassable, but membership is an authoring fact
      // this tool has no business silently rewriting (same "flag, don't
      // delete" discipline the placement/start/end checks below follow).
      if (inFootprint(col, row)) {
        const c = creationCellCenter(col, row);
        regionEls.push(
          <text
            key={`region-${region.id}-${col}-${row}-fp-warn`}
            x={c.x}
            y={c.y + 3}
            textAnchor="middle"
            fill="#ff6a6a"
            fontSize={11}
            fontWeight={700}
            pointerEvents="none"
            style={{ paintOrder: 'stroke', stroke: '#100d0b', strokeWidth: 3 }}
          >
            ⚠
          </text>
        );
      }
    }
    const centroid = regionCentroid(region.cells);
    const labelPos = creationCellCenter(centroid.col, centroid.row);
    regionEls.push(
      <text
        key={`region-${region.id}-label`}
        x={labelPos.x}
        y={labelPos.y + 3}
        textAnchor="middle"
        fill={color}
        fontSize={10}
        fontWeight={700}
        pointerEvents="none"
        style={{ paintOrder: 'stroke', stroke: '#100d0b', strokeWidth: 3 }}
      >
        {region.name ?? region.id}
      </text>
    );

    // OPEN boundary edges — Kirk's false-enclosure worry made visible
    // (creationGeometry.ts's `openBoundaryEdges` doc comment has the full
    // rationale). Drawn for EVERY region, not just the selected one — an
    // author scanning the whole board should be able to see at a glance
    // which regions are actually sealed, not have to select each one in
    // turn to find out. A hot, unmissable red/orange, deliberately louder
    // than the region's own archetype-colored fill (this file's "loud
    // beats subtle" precedent, CONTRACT.md) — a gap in a boundary is a
    // correctness fact, not a decoration.
    for (const edge of openBoundaryEdges(region.cells, doc.walls)) {
      regionEls.push(
        <line
          key={`region-${region.id}-open-${edge.cellA.join(',')}-${edge.cellB.join(',')}`}
          x1={edge.a.x}
          y1={edge.a.y}
          x2={edge.b.x}
          y2={edge.b.y}
          stroke="#ff5a3a"
          strokeWidth={3}
          strokeLinecap="round"
          pointerEvents="none"
        />
      );
    }
  }

  // The in-progress, not-yet-created region's own pending cells — same
  // hex-polygon treatment, dashed amber to read as "not committed yet"
  // (matching this file's own hover-edge/wall-drawing amber-for-
  // provisional convention elsewhere in this component).
  const pendingRegionEls: ReactElement[] = regionEdit.pendingCells.map(
    ([col, row]) => {
      const corners = creationCellPolygon(col, row, CELL_SIZE * 0.92)
        .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
        .join(' ');
      return (
        <polygon
          key={`region-pending-${col}-${row}`}
          points={corners}
          fill="#ffb347"
          fillOpacity={0.28}
          stroke="#ffb347"
          strokeWidth={2}
          strokeDasharray="3 2"
          pointerEvents="none"
        />
      );
    }
  );

  const renderPlacement = (
    ref: string,
    at: [number, number],
    facing: number | null,
    sel: PlacementSelection
  ) => {
    const center = creationCellCenter(at[0], at[1]);
    const style = resolveMarkerStyle(ref);
    // roomId comparison matters here even though every creation-mode
    // placement shares roomId: null today — matches Board.tsx's own
    // isSelected check (roomId + index, not index alone), the correct
    // general form now that PlacementSelection.roomId is a real,
    // meaningful discriminator rather than an implicit assumption.
    const selected =
      !!edit.selectedPlacement &&
      !edit.selectedPlacement.boss &&
      !sel.boss &&
      edit.selectedPlacement.roomId === sel.roomId &&
      edit.selectedPlacement.index === sel.index;
    const angle = facing !== null ? FACING_ANGLES_DEG[facing] : null;
    // A straight wall's footprint landing on an EXISTING placement is
    // FLAGGED, never silently deleted or moved — reusing the same "⚠,
    // hot color, unmissable" visual language `Board.tsx`'s
    // "⚠ PARTY SPAWN (BLOCKED!)" warning uses for edit mode's compiled
    // entrance-blocked check, adapted here since a generic placement
    // marker (unlike the START/END circle below) has no text label of
    // its own to prefix.
    const blocked = inFootprint(at[0], at[1]);
    return (
      <g
        key={sel.boss ? 'boss' : `place-${sel.index}`}
        onPointerDown={(e) => {
          if (tool !== null) return;
          e.stopPropagation();
          onSelectPlacement(sel);
          setDragPlacement(sel);
        }}
        style={{ cursor: tool === null ? 'grab' : 'default' }}
      >
        <PlacementMarker
          center={center}
          color={style.color}
          short={style.short}
          selected={selected}
        />
        {angle !== null && (
          <g transform={`translate(${center.x},${center.y}) rotate(${angle})`}>
            <polygon
              points="14,0 22,-4 22,4"
              fill="#ffd76a"
              stroke="#000"
              strokeWidth={0.5}
            />
          </g>
        )}
        {blocked && (
          <g pointerEvents="none">
            <circle
              cx={center.x}
              cy={center.y}
              r={16}
              fill="none"
              stroke="#ff3b3b"
              strokeWidth={2}
              strokeDasharray="3 2"
            />
            <text
              x={center.x}
              y={center.y - 20}
              textAnchor="middle"
              fill="#ff6a6a"
              fontSize={10}
              fontWeight={700}
              style={{
                paintOrder: 'stroke',
                stroke: '#100d0b',
                strokeWidth: 3,
              }}
            >
              ⚠ IN WALL FOOTPRINT
            </text>
          </g>
        )}
      </g>
    );
  };

  const placementEls = doc.place.map((p, index) =>
    renderPlacement(p.ref, p.at, p.facing, { roomId: null, index })
  );

  if (doc.start) trackCellExtent(doc.start[0], doc.start[1]);
  if (doc.end) trackCellExtent(doc.end[0], doc.end[1]);

  const pad = BOARD_HEX_SIZE * 1.6;
  const vx = minX - pad;
  const vy = minY - pad;
  const vw = maxX - minX + pad * 2;
  const vh = maxY - minY + pad * 2;

  return (
    <svg
      ref={svgRef}
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      width={Math.max(vw, 600)}
      height={Math.max(vh, 420)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{
        cursor:
          tool === 'wall' ||
          tool === 'straightWall' ||
          tool === 'door' ||
          tool === 'region'
            ? 'crosshair'
            : 'default',
      }}
    >
      <defs>
        {/* Straight-wall footprint hatch — deliberately distinct from
            the region open-boundary overlay's plain solid red LINE
            (`openBoundaryEdges` above): a crimson diagonal HATCH fill
            reads as "this ground is gone," not just "this line is a
            problem," matching the task's own ask for a visually
            distinct treatment from the region worry overlay. */}
        <pattern
          id="db-footprint-hatch"
          patternUnits="userSpaceOnUse"
          width={7}
          height={7}
          patternTransform="rotate(45)"
        >
          <rect width={7} height={7} fill="#2a0e0e" fillOpacity={0.55} />
          <line x1={0} y1={0} x2={0} y2={7} stroke="#c94f4f" strokeWidth={3} />
        </pattern>
      </defs>

      {cellEls}

      {regionEls}
      {pendingRegionEls}
      {wallEls}
      {straightWallEls}
      {straightPreviewEls}
      {holeEls}

      {hoverEdge && (tool === 'wall' || tool === 'door') && (
        <line
          x1={hoverEdge.a.x}
          y1={hoverEdge.a.y}
          x2={hoverEdge.b.x}
          y2={hoverEdge.b.y}
          stroke={tool === 'door' ? '#ffb347' : '#5fd1c9'}
          strokeWidth={4}
          strokeLinecap="round"
          opacity={0.55}
          pointerEvents="none"
        />
      )}

      {doc.start &&
        (() => {
          const c = cellCenter(doc.start[0], doc.start[1]);
          // Reuses Board.tsx's exact "⚠ ... (BLOCKED!)" visual language
          // (edit mode's isEntranceBlocked check) — a straight wall's
          // footprint landing on the start cell is the creation-mode
          // analog of that same fact, so it gets the same treatment
          // rather than a new one invented for this tool.
          const blocked = inFootprint(doc.start[0], doc.start[1]);
          return (
            <g pointerEvents="none">
              <circle
                cx={c.x}
                cy={c.y}
                r={13}
                fill="none"
                stroke={blocked ? '#ff3b3b' : START_COLOR}
                strokeWidth={2.5}
                strokeDasharray="4 3"
              />
              <text
                x={c.x}
                y={c.y - 18}
                textAnchor="middle"
                fill={blocked ? '#ff6a6a' : '#8fe8e0'}
                fontSize={10}
                fontWeight={700}
              >
                {blocked ? '⚠ START (BLOCKED!)' : 'START'}
              </text>
            </g>
          );
        })()}
      {doc.end &&
        (() => {
          const c = cellCenter(doc.end[0], doc.end[1]);
          const blocked = inFootprint(doc.end[0], doc.end[1]);
          return (
            <g pointerEvents="none">
              <circle
                cx={c.x}
                cy={c.y}
                r={13}
                fill="none"
                stroke={blocked ? '#ff3b3b' : END_COLOR}
                strokeWidth={2.5}
                strokeDasharray="4 3"
              />
              <text
                x={c.x}
                y={c.y - 18}
                textAnchor="middle"
                fill={blocked ? '#ff6a6a' : '#ffd76a'}
                fontSize={10}
                fontWeight={700}
              >
                {blocked ? '⚠ END (BLOCKED!)' : 'END'}
              </text>
            </g>
          );
        })()}

      {placementEls}
    </svg>
  );
}
