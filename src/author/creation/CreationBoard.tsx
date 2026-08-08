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
import { useEffect, useRef, useState, type ReactElement } from 'react';
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
import { regionsByPaintOrder } from '../regionTree';
import type { BoardTool, PlacementSelection } from '../types';
import type { BoardEditing } from '../useBoardEditing';
import { canvasPlacementRejectReason } from './canvasFloor';
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
import type { CreationGrid } from './creationTypes';
import { DEFAULT_CANVAS } from './emptyCanvasDoc';
import {
  cornerPoint,
  nearestCorner,
  sameCorner,
  type CornerRef,
} from './hexCorner';
import {
  clipSegmentToShrunkHex,
  isValidDoorCell,
  nearestWallAngleFamily,
  snapStraightEndpoint,
  standableFootprintKeys,
  straightWallCrossedEdges,
  straightWallFootprint,
  straightWallFootprintCoverage,
  straightWallsFootprintCoverage,
  straightWallsFootprintSet,
  wallLineDoorCellAt,
  type WallAxisFamily,
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
  /** Straight Wall tool: commits one new `wallLines:` entry per stroke,
   * corner-anchored (unlike `onToggleWallEdge`'s per-edge, cell-adjacent
   * painting). See `hexCorner.ts`/`straightWallGeometry.ts`. */
  onAddStraightWall: (from: CornerRef, to: CornerRef) => void;
  /** Removes a SELECTED straight wall (see this component's own
   * selection-vs-endpoint-drag interaction model,
   * `selectedWallLineIndex`/`draggingEndpoint` below) — click no longer
   * deletes on its own; it selects. Reachable two ways: the
   * Delete/Backspace key (this component's own keydown effect) and the
   * board's own small delete button rendered near the selected wall's
   * midpoint (`straightWallDeleteButtonHit`/`straightWallDeleteButtonPoint`)
   * — the keyboard path alone was undiscoverable (Kirk: "gonna need a
   * way to delete a wall... had a small section with no way to remove
   * it"), so this is now the primary, VISIBLE affordance. */
  onRemoveStraightWallAt: (index: number) => void;
  /** Endpoint-drag commit: fine-tune one end of an EXISTING straight wall
   * to a new corner, snapped corner-to-corner. */
  onSetStraightWallEndpoint: (
    lineIndex: number,
    which: 'from' | 'to',
    corner: CornerRef
  ) => void;
  /** Door tool, applied to a straight wall — toggles a door AT the
   * clicked footprint cell (add if absent, remove if present), same
   * "click an existing wall to flip its state" gesture the edge Wall/
   * Door pair already gives `doc.walls`, now cell-addressed instead of
   * line-wide. See TARGET-YAML.md's "Straight walls: doors" section. */
  onToggleStraightWallDoorAt: (
    lineIndex: number,
    cell: [number, number]
  ) => void;
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
 * tool's own click-to-SELECT hit test, and (with a tighter radius) the
 * Door tool's "click an existing straight wall" test. Point-to-segment
 * distance against the wall's own world-space line (`cornerPoint(from)`
 * to `cornerPoint(to)`), same primitive `creationGeometry.ts`'s
 * `nearestEdge` uses internally, exported from there for this purpose. */
function straightWallLineIndexNear(
  doc: DungeonDoc,
  point: CellPos,
  maxDist = 8
): number | null {
  let best: number | null = null;
  let bestDistSq = maxDist * maxDist;
  doc.wallLines.forEach((line, i) => {
    const a = cornerPoint(line.from);
    const b = cornerPoint(line.to);
    const d = pointToSegmentDistSq(point, a, b);
    if (d < bestDistSq) {
      bestDistSq = d;
      best = i;
    }
  });
  return best;
}

/** Which endpoint HANDLE (if any) of the SELECTED straight wall `point`
 * landed on — a tighter, dedicated hit test distinct from
 * `straightWallLineIndexNear`'s whole-line distance, since a handle is a
 * small target at a specific corner, not "closest to the line anywhere
 * along its length." Checked before line-select/new-draw resolution on
 * pointer-down so grabbing a handle always wins over redrawing/
 * reselecting when the two targets overlap (a handle sits ON the line by
 * construction). */
function straightWallHandleHit(
  doc: DungeonDoc,
  lineIndex: number,
  point: CellPos,
  maxDist = 10
): 'from' | 'to' | null {
  const line = doc.wallLines[lineIndex];
  if (!line) return null;
  const fromPt = cornerPoint(line.from);
  const toPt = cornerPoint(line.to);
  const dFrom = Math.hypot(point.x - fromPt.x, point.y - fromPt.y);
  const dTo = Math.hypot(point.x - toPt.x, point.y - toPt.y);
  if (dFrom > maxDist && dTo > maxDist) return null;
  return dFrom <= dTo ? 'from' : 'to';
}

/** Where the SELECTED straight wall's own delete button renders — offset
 * perpendicular from the line's midpoint by `OFFSET` board units, so the
 * button sits clear of the drawn stroke/footprint hatch instead of on
 * top of it. Shared between the render pass and `straightWallDeleteButtonHit`
 * below so the two can never drift apart (the render/hit-test split every
 * other overlay in this component already follows). */
function straightWallDeleteButtonPoint(
  from: CornerRef,
  to: CornerRef
): CellPos {
  const fromPt = cornerPoint(from);
  const toPt = cornerPoint(to);
  const mid = { x: (fromPt.x + toPt.x) / 2, y: (fromPt.y + toPt.y) / 2 };
  const dx = toPt.x - fromPt.x;
  const dy = toPt.y - fromPt.y;
  const len = Math.hypot(dx, dy) || 1;
  const OFFSET = 16;
  return {
    x: mid.x + (-dy / len) * OFFSET,
    y: mid.y + (dx / len) * OFFSET,
  };
}

/** Hit test for the SELECTED straight wall's own delete button (Kirk:
 * "gonna need a way to delete a wall... had a small section with no way
 * to remove it" — Delete/Backspace-on-selection already worked from the
 * round above, this is the missing VISIBLE affordance). Uses the wall's
 * own COMMITTED `from`/`to` — this button is only clickable while NOT
 * mid-endpoint-drag (a handle hit is checked first in `handlePointerDown`
 * and captures the gesture), so it never needs the live drag position
 * `straightWallHandleHit`'s render counterpart accounts for. */
function straightWallDeleteButtonHit(
  doc: DungeonDoc,
  lineIndex: number,
  point: CellPos,
  maxDist = 10
): boolean {
  const line = doc.wallLines[lineIndex];
  if (!line) return false;
  const btn = straightWallDeleteButtonPoint(line.from, line.to);
  return Math.hypot(point.x - btn.x, point.y - btn.y) <= maxDist;
}

const CELL_SIZE = BOARD_HEX_SIZE - 1.5;

/** Floor opacity for a footprint hatch cell at near-zero coverage — the
 * 2D sibling of `DungeonPreview3D.tsx`'s own `FOOTPRINT_DIM_MIN_OPACITY`,
 * same reasoning: even the faintest genuine clip stays visible, never
 * fully invisible, while a heavily-clipped cell still reads at full
 * strength (opacity scales linearly from here up to 1 as coverage
 * approaches `hexCoverageFraction`'s own 0.5 maximum). */
const FOOTPRINT_HATCH_MIN_OPACITY = 0.25;

/**
 * Every visual element for ONE straight wall's own line — footprint
 * hatch, blocked-crossing dashes (movement semantics (a)/(b), see
 * `straightWallGeometry.ts`'s own doc comments), and the line itself,
 * carved into segments around any `doors:` openings (a gap where the
 * solid stroke simply isn't drawn, plus a small hinge marker at each
 * opening's own midpoint — TARGET-YAML.md's "Straight walls: doors"
 * section for the exact traversability semantic this renders). A door
 * whose cell has fallen OUT of the line's own raw footprint (e.g. an
 * endpoint drag shrank it) renders a ⚠ warning instead of a hinge —
 * flagged, never silently dropped, same discipline this file's other
 * footprint-interaction checks already follow.
 *
 * Shared between the committed `wallLines:` render pass and the live
 * "drawing a brand-new wall" stroke preview — a wall being actively
 * drawn always passes an empty `doors` list (it has none of its own
 * yet), and `provisional` swaps the amber/dashed "not committed"
 * treatment this component uses everywhere else for in-progress content.
 *
 * `snapped` (only meaningful while `provisional`) is whether the CURRENT
 * `to`/endpoint-drag position is actually locked to one of
 * `straightWallGeometry.ts`'s 3 hex-edge angle families, vs. a free
 * angle — Kirk's ask, "snapped state should be subtly visible": a locked
 * preview reads solid and bright; a free one keeps the original dashed,
 * dimmer amber this tool always had.
 */
function straightWallLineElements(
  keyPrefix: string,
  from: CornerRef,
  to: CornerRef,
  doors: readonly { cell: [number, number] }[],
  grid: CreationGrid,
  provisional: boolean,
  snapped: boolean = false
): ReactElement[] {
  const els: ReactElement[] = [];
  const a = cornerPoint(from);
  const b = cornerPoint(to);
  const doorCells = doors.map((d) => d.cell);
  const footprintColor = provisional ? '#ffb347' : '#c94f4f';
  const lineColor = !provisional ? '#e8e2d8' : snapped ? '#fff3c4' : '#ffb347';
  // Coverage-based standability (rpg-project#169's live-design follow-up
  // with Kirk, 2026-08-07): every genuinely-touched cell still renders
  // (an author needs to see the wall's real footprint, standable or not),
  // but a lightly-clipped, standable cell reads visibly lighter than a
  // heavily-clipped, blocked one — the same light-vs-full de-emphasis
  // `DungeonPreview3D.tsx`'s own `FootprintDimCell` now applies, one
  // coordinate space over.
  const footprintCoverage = straightWallFootprintCoverage(
    from,
    to,
    grid,
    doorCells
  );
  const footprint = [...footprintCoverage.keys()].map(
    (key) => key.split(',').map(Number) as [number, number]
  );

  for (const [col, row] of footprint) {
    const coverage = footprintCoverage.get(`${col},${row}`) ?? 0.5;
    const opacity =
      FOOTPRINT_HATCH_MIN_OPACITY +
      (1 - FOOTPRINT_HATCH_MIN_OPACITY) * Math.min(1, coverage / 0.5);
    const corners = creationCellPolygon(col, row, CELL_SIZE * 0.92)
      .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
      .join(' ');
    els.push(
      <polygon
        key={`${keyPrefix}-fp-${col}-${row}`}
        points={corners}
        fill="url(#db-footprint-hatch)"
        stroke={footprintColor}
        strokeWidth={1.5}
        strokeDasharray={provisional ? '3 2' : undefined}
        opacity={opacity}
        pointerEvents="none"
      />
    );
  }

  for (const edge of straightWallCrossedEdges(from, to, grid, footprint)) {
    els.push(
      <line
        key={`${keyPrefix}-cross-${edge.cellA.join(',')}-${edge.cellB.join(',')}`}
        x1={edge.a.x}
        y1={edge.a.y}
        x2={edge.b.x}
        y2={edge.b.y}
        stroke={footprintColor}
        strokeWidth={2.5}
        strokeDasharray="2 2"
        pointerEvents="none"
      />
    );
  }

  const lerp = (t: number) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  // The geometric [t0,t1] interval the line spans through each door's
  // cell — unshrunk (epsilon 0), since this is a visual gap, not the
  // footprint-membership test (`straightWallFootprint` above already
  // handles that with the real epsilon). Carves the solid stroke into
  // the complementary segments around every door.
  const doorIntervals = doorCells
    .map((cell) => clipSegmentToShrunkHex(a, b, cell[0], cell[1], 0))
    .filter((iv): iv is [number, number] => iv !== null)
    .sort((x, y) => x[0] - y[0]);
  let cursor = 0;
  const segments: [number, number][] = [];
  for (const [t0, t1] of doorIntervals) {
    if (t0 > cursor) segments.push([cursor, t0]);
    cursor = Math.max(cursor, t1);
  }
  if (cursor < 1) segments.push([cursor, 1]);
  segments.forEach(([t0, t1], i) => {
    const p0 = lerp(t0);
    const p1 = lerp(t1);
    els.push(
      <line
        key={`${keyPrefix}-seg-${i}`}
        x1={p0.x}
        y1={p0.y}
        x2={p1.x}
        y2={p1.y}
        stroke={lineColor}
        strokeWidth={provisional ? 3 : 4}
        strokeDasharray={provisional && !snapped ? '5 3' : undefined}
        strokeLinecap="round"
        opacity={provisional ? (snapped ? 1 : 0.85) : 1}
      />
    );
  });

  // A hinge marker at each real door's own opening midpoint — same
  // amber-dot visual language the edge Wall/Door pair's own door hinge
  // already uses. A door whose cell no longer clips (stranded by an
  // endpoint drag) gets a ⚠ instead, per this function's own doc
  // comment.
  doorCells.forEach((cell, i) => {
    const valid = isValidDoorCell(from, to, grid, cell);
    const interval = clipSegmentToShrunkHex(a, b, cell[0], cell[1], 0);
    if (!valid || !interval) {
      const c = creationCellCenter(cell[0], cell[1]);
      els.push(
        <text
          key={`${keyPrefix}-door-${i}-stranded`}
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
      return;
    }
    const mid = lerp((interval[0] + interval[1]) / 2);
    els.push(
      <circle
        key={`${keyPrefix}-door-${i}-hinge`}
        cx={mid.x}
        cy={mid.y}
        r={3.5}
        fill="#100d0b"
        stroke="#ffb347"
        strokeWidth={1.5}
        pointerEvents="none"
      />
    );
  });

  return els;
}

export function CreationBoard({
  doc,
  edit,
  tool,
  onSelectPlacement,
  onReject,
  onToggleWallEdge,
  onAddStraightWall,
  onRemoveStraightWallAt,
  onSetStraightWallEndpoint,
  onToggleStraightWallDoorAt,
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
  /** Straight Wall tool's own drag state — genuinely different shape
   * from `stroke` above: an edge-wall stroke paints a whole CHAIN of
   * edges as it goes; a straight-wall stroke has exactly ONE `from`/`to`
   * CORNER pair, committed once on pointer-up. `lockedFamily` mirrors
   * `stroke.family`'s "undecided until the drag clears a threshold, then
   * held for the rest of the stroke" shape — see
   * `straightWallGeometry.ts`'s `nearestWallAngleFamily` for the 3 real
   * hex-edge families it locks to, tolerance-gated (Kirk's fix for "my
   * line was angled ever so slightly"). It persists through a transient
   * Alt-held "free angle" override (`handlePointerMove` reads `e.altKey`
   * live, every move — Shift is already the region tool's own eraser
   * modifier, so this tool uses Alt instead) rather than being discarded
   * by it: releasing Alt mid-drag restores whatever family was already
   * locked in, rather than re-deciding from scratch. `snapped` is a pure
   * render hint — whether the CURRENT `toCorner` actually came from a
   * family snap (accounting for that live Alt override), driving the
   * "brighter when locked" preview treatment. `clickTarget` is resolved
   * on pointer-DOWN (which existing straight wall, if any, was clicked)
   * but only acted on at pointer-UP, and only if the whole gesture turns
   * out to have been a CLICK rather than a real drag (see
   * `handlePointerUp`) — a drag starting on top of an existing line
   * still draws a new one, consistent with every other tool's
   * click-vs-drag split in this component. A click on an existing line
   * now SELECTS it (shows endpoint handles) rather than deleting it —
   * delete moved to the Delete/Backspace key on a selection, see the
   * keydown effect below. */
  const [straightStroke, setStraightStroke] = useState<{
    fromCorner: CornerRef;
    toCorner: CornerRef;
    lockedFamily: WallAxisFamily | null;
    snapped: boolean;
    startPoint: CellPos;
    clickTarget: number | null;
  } | null>(null);
  /** Which `doc.wallLines` entry is selected — shows draggable endpoint
   * handles (fine-tuning by hand, corner-to-corner snapped) and becomes
   * the target of the Delete/Backspace key. Only meaningful while
   * `tool === 'straightWall'`; reset whenever the tool changes (see the
   * effect below) so a stale selection can't linger into an unrelated
   * tool's interactions. */
  const [selectedWallLineIndex, setSelectedWallLineIndex] = useState<
    number | null
  >(null);
  /** An endpoint HANDLE drag in progress — `current` is the live,
   * angle-family-snapped position tracking the pointer (same 3-family/
   * Alt-bypass rule the initial draw uses, recomputed fresh every move
   * since the OTHER end of the line is already fixed — no "undecided,
   * noisy short vector" phase to protect against the way a brand-new
   * stroke has), committed via `onSetStraightWallEndpoint` on pointer-up
   * (unless it would collapse the line onto its own other endpoint,
   * which is rejected instead — see `handlePointerUp`). `snapped` is the
   * same render hint `straightStroke` carries. */
  const [draggingEndpoint, setDraggingEndpoint] = useState<{
    lineIndex: number;
    which: 'from' | 'to';
    current: CornerRef;
    snapped: boolean;
  } | null>(null);

  useEffect(() => {
    setSelectedWallLineIndex(null);
    setDraggingEndpoint(null);
  }, [tool]);

  useEffect(() => {
    if (tool !== 'straightWall' || selectedWallLineIndex === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onRemoveStraightWallAt(selectedWallLineIndex);
        setSelectedWallLineIndex(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tool, selectedWallLineIndex, onRemoveStraightWallAt]);

  /** Esc deselects a region being edited (`RegionPanel.tsx`'s own status
   * hint now advertises this — "Esc to deselect" — Kirk's discoverability
   * ask, "is there a way to add the region after we create it?"). Also
   * clears an in-progress NEW-region paint session when nothing is
   * selected yet, the same "back out of what I'm doing" meaning Esc
   * carries in the rest of this component. Mirrors the Delete/Backspace
   * effect above: same TEXTAREA/INPUT-target guard so Esc while editing a
   * region's name/id field doesn't unexpectedly blow away the selection. */
  useEffect(() => {
    if (tool !== 'region') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (targetTag === 'TEXTAREA' || targetTag === 'INPUT') return;
      if (e.key !== 'Escape') return;
      if (regionEdit.selectedRegionId) {
        regionEdit.selectRegion(null);
      } else if (regionEdit.pendingCells.length > 0) {
        regionEdit.clearPending();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tool, regionEdit]);

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
      // rpg-project#169's creation-3D-editing unit: this click used to
      // reach `edit.handlePlace` unconditionally — no occupied/footprint/
      // hole check at all, a real gap (a click could silently stack a
      // second placement on an existing one, or place inside a straight
      // wall's own footprint or a hole). `canvasPlacementRejectReason` is
      // the SAME predicate the 3D click-to-place layer now consults
      // (`DungeonPreview3D.tsx`), so the two views can never disagree
      // about where a click is legal — see that function's own doc
      // comment (`canvasFloor.ts`) for the exact three gates.
      //
      // PLACEABLE vs. STANDABLE (rpg-project#169's "props on footprint
      // cells" unit, refined by the coverage-based-standability live
      // design round with Kirk, 2026-08-07): a prop only needs real
      // floor, not standable floor — Kirk's exact ask, a bookcase resting
      // against a drawn wall — so `'prop'` skips the footprint gate
      // entirely, coverage or not. `'monster'` still requires standable
      // ground, now COVERAGE-based rather than the original "any touch at
      // all blocks" rule: a lightly-clipped cell below
      // `STANDABLE_COVERAGE_THRESHOLD` is real floor again for a monster
      // too (`'boss'` never reaches here, rejected above).
      const footprint = standableFootprintKeys(
        straightWallsFootprintCoverage(doc.wallLines, grid)
      );
      const reject = canvasPlacementRejectReason(
        doc,
        cell[0],
        cell[1],
        footprint,
        edit.selectedPalette.kind !== 'prop'
      );
      if (reject) {
        onReject(reject);
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
        // toggle feel. `beginStroke` opens this gesture's paint/skip
        // tally BEFORE the first cell's own mutator call so that cell is
        // counted too — `setSelectedRegionCellMembership` now pre-checks
        // overlap per cell and accumulates a rejected one into the tally
        // instead of flooding an immediate toast (region-brush honesty
        // round — see `useRegionEditing.ts`'s own header comment).
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
        regionEdit.beginStroke();
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
      regionEdit.beginStroke();
      regionEdit.setPendingCellMembership(cell, mode === 'add');
      setRegionStroke({ mode, touched: new Set([cellKey]) });
      return;
    }
    if (tool === 'straightWall') {
      // A handle on the CURRENTLY SELECTED wall always wins over
      // redrawing/reselecting — it sits ON the line by construction, so
      // this must be checked first, not as a fallback. The delete button
      // is checked right after — it also sits near the selected line, so
      // it must win over a redraw/reselect too, but never over a handle
      // (the two are rendered offset from each other, so overlap is rare,
      // but a handle grab is still the more specific/intentional gesture).
      if (selectedWallLineIndex !== null) {
        const handle = straightWallHandleHit(doc, selectedWallLineIndex, p);
        if (handle) {
          const line = doc.wallLines[selectedWallLineIndex];
          setDraggingEndpoint({
            lineIndex: selectedWallLineIndex,
            which: handle,
            current: handle === 'from' ? line.from : line.to,
            snapped: false,
          });
          return;
        }
        if (straightWallDeleteButtonHit(doc, selectedWallLineIndex, p)) {
          onRemoveStraightWallAt(selectedWallLineIndex);
          setSelectedWallLineIndex(null);
          return;
        }
      }
      const corner = nearestCorner(p, grid);
      // Resolved now (which existing straight wall, if any, sits under
      // the click) but only ACTED on at pointer-up, and only if this
      // whole gesture turns out to have been a click rather than a real
      // drag — see `straightStroke`'s own doc comment. A click SELECTS
      // (shows endpoint handles); it no longer deletes.
      const hit = straightWallLineIndexNear(doc, p);
      setStraightStroke({
        fromCorner: corner,
        toCorner: corner,
        lockedFamily: null,
        snapped: false,
        startPoint: p,
        clickTarget: hit,
      });
      return;
    }
    const edge = nearestEdge(p, grid);
    if (tool === 'door') {
      // A straight wall's own line rarely coincides with a hex edge (see
      // straightWallGeometry.ts's own header comment), so a click meant
      // to carve/remove a door on a STRAIGHT wall needs its own hit test
      // rather than falling through to the edge-wall lookup below, which
      // would usually just find the nearest (unrelated) edge-wall
      // candidate instead. Tight radius, checked first: a straight wall
      // directly under the click always wins over an edge-wall toggle.
      const lineHit = straightWallLineIndexNear(doc, p, 8);
      if (lineHit !== null) {
        const line = doc.wallLines[lineHit];
        const cell = wallLineDoorCellAt(line.from, line.to, grid, p);
        if (cell) {
          onToggleStraightWallDoorAt(lineHit, cell);
        } else {
          onReject(
            'That spot on the wall doesn’t clip a cell — doors can only open a cell the wall’s own line actually blocks.'
          );
        }
        return;
      }
      if (!edge) return;
      applyEdgeAction(edge);
      return;
    }
    if (!edge) return;
    if (tool === 'wall') {
      const existing = wallAtEdge(doc, edge.cellA, edge.cellB);
      setStroke({ addMode: !existing, startPoint: p, family: null });
      applyEdgeAction(edge, !existing);
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
    if (draggingEndpoint) {
      // The line's OTHER (fixed) endpoint anchors the angle-family check
      // — always well-defined from the very first move, unlike a
      // brand-new stroke's own `startPoint`, so this recomputes live on
      // every move rather than locking once (see `draggingEndpoint`'s
      // own doc comment). `e.altKey` is the free-angle bypass — Shift is
      // already the region tool's own eraser modifier (see this
      // component's region-tool pointer-down branch), so this tool uses
      // Alt instead.
      const line = doc.wallLines[draggingEndpoint.lineIndex];
      const otherEnd =
        draggingEndpoint.which === 'from' ? line?.to : line?.from;
      let axis: WallAxisFamily | null = null;
      if (otherEnd && !e.altKey) {
        const otherPoint = cornerPoint(otherEnd);
        axis = nearestWallAngleFamily(p.x - otherPoint.x, p.y - otherPoint.y);
      }
      const current =
        otherEnd && axis
          ? snapStraightEndpoint(otherEnd, p, axis, grid)
          : nearestCorner(p, grid);
      setDraggingEndpoint({
        ...draggingEndpoint,
        current,
        snapped: axis !== null,
      });
      return;
    }
    if (tool === 'straightWall' && straightStroke) {
      const dx = p.x - straightStroke.startPoint.x;
      const dy = p.y - straightStroke.startPoint.y;
      const pastThreshold = Math.hypot(dx, dy) >= DIRECTION_LOCK_THRESHOLD;
      let lockedFamily = straightStroke.lockedFamily;
      // "Undecided until the drag clears a threshold, then locked for
      // the rest of the stroke" — same shape the edge-wall tool's
      // `family` uses just below, generalized from a forced 2-way pick
      // to a tolerance-gated 3-family one that can also lock to "free"
      // (`nearestWallAngleFamily` returning `null`, e.g. a drag aimed
      // well off every family — see that function's own doc comment).
      // Held-Alt at the moment of the lock decision skips it entirely,
      // leaving `lockedFamily` re-triable on the NEXT move — releasing
      // Alt mid-drag lets a real family lock in from wherever the drag
      // is aimed at that point, rather than committing to "free"
      // permanently just because Alt happened to be down at first.
      if (lockedFamily === null && pastThreshold && !e.altKey) {
        lockedFamily = nearestWallAngleFamily(dx, dy);
      }
      const effectiveAxis = e.altKey ? null : lockedFamily;
      const toCorner = !pastThreshold
        ? straightStroke.fromCorner
        : effectiveAxis
          ? snapStraightEndpoint(
              straightStroke.fromCorner,
              p,
              effectiveAxis,
              grid
            )
          : nearestCorner(p, grid);
      setStraightStroke({
        ...straightStroke,
        lockedFamily,
        toCorner,
        snapped: pastThreshold && effectiveAxis !== null,
      });
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
    // Flushes the region brush's own paint/skip tally (region-brush
    // honesty round) — a no-op when no region-tool stroke was active this
    // gesture (every OTHER tool's pointer-up passes through this same
    // shared handler, and `endStroke` itself guards on that).
    regionEdit.endStroke();
    if (draggingEndpoint) {
      const line = doc.wallLines[draggingEndpoint.lineIndex];
      const otherEnd =
        draggingEndpoint.which === 'from' ? line?.to : line?.from;
      if (line && otherEnd && sameCorner(draggingEndpoint.current, otherEnd)) {
        // Dragging an endpoint onto its own line's other end would
        // collapse it to a single point — rejected, not silently
        // clamped to "closest different corner," so the author sees why
        // nothing moved rather than the handle jumping somewhere
        // unrequested.
        onReject('A straight wall’s two ends can’t land on the same corner.');
      } else {
        onSetStraightWallEndpoint(
          draggingEndpoint.lineIndex,
          draggingEndpoint.which,
          draggingEndpoint.current
        );
      }
      setDraggingEndpoint(null);
      return;
    }
    if (straightStroke) {
      const moved = !sameCorner(
        straightStroke.fromCorner,
        straightStroke.toCorner
      );
      if (moved) {
        onAddStraightWall(straightStroke.fromCorner, straightStroke.toCorner);
        setSelectedWallLineIndex(null);
      } else if (straightStroke.clickTarget !== null) {
        // A CLICK (no real drag) landing on an existing straight wall
        // SELECTS it (shows endpoint handles) — clicking the SAME
        // already-selected wall again deselects it; a drag that merely
        // STARTS on top of one still draws a new segment (the `moved`
        // branch above), consistent with every other tool's
        // click-vs-drag split in this component. Deleting a selected
        // wall is now the Delete/Backspace key, not a click — see the
        // keydown effect above.
        setSelectedWallLineIndex((current) =>
          current === straightStroke.clickTarget
            ? null
            : straightStroke.clickTarget
        );
      } else {
        setSelectedWallLineIndex(null);
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

  // Straight walls — genuinely different rendering job from wallEls
  // above: each entry ALSO needs its FOOTPRINT (every hex its line
  // clips, per Kirk's "any hex that is not 100% uncovered would not be
  // traversable" rule) drawn as a hatched overlay, its blocked EDGE
  // crossings, and now (this unit) its own `doors:` openings carved as
  // real gaps — see `straightWallLineElements`'s own doc comment for the
  // full rendering job, shared with the live "drawing a new wall"
  // preview below.
  //
  // A line whose endpoint is CURRENTLY being drag-adjusted
  // (`draggingEndpoint`) renders its LIVE (not-yet-committed) position —
  // amber/provisional, same as any other in-progress content — instead
  // of its last-committed one, so the drag itself gives real-time
  // footprint feedback.
  const straightWallEls: ReactElement[] = [];
  doc.wallLines.forEach((line, index) => {
    const dragging =
      draggingEndpoint && draggingEndpoint.lineIndex === index
        ? draggingEndpoint
        : null;
    const from = dragging?.which === 'from' ? dragging.current : line.from;
    const to = dragging?.which === 'to' ? dragging.current : line.to;
    straightWallEls.push(
      ...straightWallLineElements(
        `swall-${index}`,
        from,
        to,
        line.doors,
        grid,
        !!dragging,
        dragging?.snapped ?? false
      )
    );
  });

  // Endpoint HANDLES for the SELECTED straight wall — draggable,
  // corner-to-corner-snapped fine-tuning (Kirk: "it always hangs over a
  // little" — this is the fix). Purely visual: the actual hit-test lives
  // in `handlePointerDown`'s own `straightWallHandleHit` call, coordinate
  // math against the same points these circles render at, matching how
  // every other overlay in this component works (`pointerEvents="none"`
  // throughout, hit-testing done once at the SVG root).
  const straightWallHandleEls: ReactElement[] = [];
  if (tool === 'straightWall' && selectedWallLineIndex !== null) {
    const line = doc.wallLines[selectedWallLineIndex];
    if (line) {
      const dragging =
        draggingEndpoint && draggingEndpoint.lineIndex === selectedWallLineIndex
          ? draggingEndpoint
          : null;
      const handlePoints: [string, CornerRef][] = [
        ['from', dragging?.which === 'from' ? dragging.current : line.from],
        ['to', dragging?.which === 'to' ? dragging.current : line.to],
      ];
      for (const [label, corner] of handlePoints) {
        const p = cornerPoint(corner);
        straightWallHandleEls.push(
          <circle
            key={`swall-handle-${label}`}
            cx={p.x}
            cy={p.y}
            r={6}
            fill="#14110f"
            stroke="#5fd1c9"
            strokeWidth={2.5}
            pointerEvents="none"
          />
        );
      }

      // Delete button (Kirk: "gonna need a way to delete a wall... had a
      // small section with no way to remove it" — Delete/Backspace on a
      // selection already worked from the round above; nothing on the
      // board ever told the author that, so this is the missing VISIBLE
      // affordance, not new removal logic). Uses the wall's own
      // COMMITTED `line.from`/`line.to` (matching `straightWallDeleteButtonHit`'s
      // own hit-test exactly) rather than the live drag position — the
      // button isn't clickable mid-endpoint-drag anyway (the pointer is
      // already captured by that gesture), so it simply holds its last
      // position until the drag ends and the wall re-renders. Doors on
      // the wall are removed WITH it (`removeWallLineAt` splices the
      // whole entry; `doors:` lives nested inside), called out in the
      // caption rather than a hover tooltip — every other overlay in
      // this component is `pointerEvents="none"`, so a native `<title>`
      // would never actually fire.
      const deleteBtn = straightWallDeleteButtonPoint(line.from, line.to);
      const doorCount = line.doors.length;
      straightWallHandleEls.push(
        <g key="swall-delete-btn" pointerEvents="none">
          <circle
            cx={deleteBtn.x}
            cy={deleteBtn.y}
            r={9}
            fill="#3a1c18"
            stroke="#ff9a8a"
            strokeWidth={2}
          />
          <text
            x={deleteBtn.x}
            y={deleteBtn.y + 4}
            textAnchor="middle"
            fontSize={12}
            fontWeight={700}
            fill="#ff9a8a"
          >
            ×
          </text>
          <text
            x={deleteBtn.x}
            y={deleteBtn.y + 22}
            textAnchor="middle"
            fontSize={9}
            fill="#ff9a8a"
          >
            {`delete${doorCount > 0 ? ` (+${doorCount} door${doorCount === 1 ? '' : 's'})` : ''}`}
          </text>
        </g>
      );
    }
  }

  // Live drag preview for a brand-NEW wall being drawn (not an endpoint
  // drag on an existing one, handled above) — same rendering job, amber/
  // provisional, no doors of its own yet.
  const strokeHasMoved =
    !!straightStroke &&
    !sameCorner(straightStroke.fromCorner, straightStroke.toCorner);
  const straightPreviewEls: ReactElement[] =
    tool === 'straightWall' && straightStroke && strokeHasMoved
      ? straightWallLineElements(
          'swall-preview',
          straightStroke.fromCorner,
          straightStroke.toCorner,
          [],
          grid,
          true,
          straightStroke.snapped
        )
      : [];
  const previewFootprint: [number, number][] =
    tool === 'straightWall' && straightStroke && strokeHasMoved
      ? straightWallFootprint(
          straightStroke.fromCorner,
          straightStroke.toCorner,
          grid
        )
      : [];

  // Union of every straight wall's footprint — committed (using each
  // line's LIVE position if its endpoint is currently being drag-
  // adjusted, not its last-committed one, so the flag system stays
  // consistent with what the hatch overlay above is already showing)
  // AND the live new-wall-draw preview, if one is in progress — what
  // placements/start/end/region cells below are checked against so a
  // newly-drawn footprint FLAGS anything it now covers instead of
  // silently deleting or moving it. Live preview is included
  // deliberately: an author dragging a wall over an existing monster
  // should see the warning appear before even releasing the pointer, not
  // just after.
  const committedFootprint = straightWallsFootprintSet(
    doc.wallLines.map((line, index) => {
      const dragging =
        draggingEndpoint && draggingEndpoint.lineIndex === index
          ? draggingEndpoint
          : null;
      if (!dragging) return line;
      return {
        from: dragging.which === 'from' ? dragging.current : line.from,
        to: dragging.which === 'to' ? dragging.current : line.to,
        doors: line.doors,
      };
    }),
    grid
  );
  const footprintKeys = new Set(committedFootprint);
  for (const [col, row] of previewFootprint) {
    footprintKeys.add(`${col},${row}`);
  }
  const inFootprint = (col: number, row: number) =>
    footprintKeys.has(`${col},${row}`);

  // Coverage-based standability (rpg-project#169's live-design follow-up
  // with Kirk, 2026-08-07) — a SEPARATE, narrower check from `inFootprint`
  // above: `inFootprint` stays the raw "any touch at all" set (the
  // flagging warnings below — placements/start/end/regions — stay
  // maximally sensitive, informational, never silently dropped). This one
  // answers "is this specific cell blocked for STANDING" and is used only
  // by `renderPlacement`'s own monster-only warning ring, below — a
  // lightly-clipped cell is no longer a real block for anything that
  // doesn't need standable ground.
  const committedFootprintCoverage = straightWallsFootprintCoverage(
    doc.wallLines.map((line, index) => {
      const dragging =
        draggingEndpoint && draggingEndpoint.lineIndex === index
          ? draggingEndpoint
          : null;
      if (!dragging) return line;
      return {
        from: dragging.which === 'from' ? dragging.current : line.from,
        to: dragging.which === 'to' ? dragging.current : line.to,
        doors: line.doors,
      };
    }),
    grid
  );
  const standableFootprint = standableFootprintKeys(committedFootprintCoverage);
  const inStandableFootprint = (col: number, row: number) =>
    standableFootprint.has(`${col},${row}`);

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
  // surface. Painted biggest-first (`regionsByPaintOrder`, shared with
  // `Board.tsx`'s read-only overlay) so a nested region's overlay draws
  // on top of its container's, "innermost visible."
  const regionEls: ReactElement[] = [];
  // A region's claim over a straight wall's FOOTPRINT band, rendered
  // SEPARATELY from `regionEls` and painted much later in this
  // component's own SVG child order (after `straightWallEls`, see the
  // return below) — region-brush honesty round, 2026-08-06. Kirk, live
  // authoring: "the shared hexes look like the unplayable piece the wall
  // goes through" — his first region's brush swept up a wall's footprint
  // cells, and the crimson hatch (drawn LATER than `regionEls` in the old
  // paint order, so it visually sat ON TOP) buried both the region's own
  // tint AND this file's existing "⚠" warning underneath it, making a
  // real membership fact unreadable. The fix is paint order, not new
  // data: same `inFootprint` cells, same region color, just drawn AFTER
  // the hatch instead of before it, at a stronger opacity so the claim is
  // unmistakable rather than a second faint layer under a loud one. Doors
  // NOT footprint cells are unaffected — this list is empty whenever
  // `inFootprint` never fires for a region's own cells.
  const regionFootprintClaimEls: ReactElement[] = [];
  for (const region of regionsByPaintOrder(doc.regions)) {
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
      // Do NOT make footprint cells unpaintable — they're legal region
      // members (semantic vs physical, settled) — this is visibility
      // only, never a membership restriction.
      if (inFootprint(col, row)) {
        const c = creationCellCenter(col, row);
        regionFootprintClaimEls.push(
          <polygon
            key={`region-${region.id}-${col}-${row}-fp-claim`}
            points={corners}
            fill={color}
            fillOpacity={0.55}
            stroke={color}
            strokeWidth={2}
            pointerEvents="none"
          />,
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

  // The board's own evidence for the most recent rejected/partial region
  // paint or create (region-brush honesty round, 2026-08-06) — Kirk: "it
  // says 'one or more cells already belong to another region'... with NO
  // indication which cells." `regionEdit.conflictFlash` names WHICH
  // cells and whose (the toast, flashed by the same caller, names the
  // owning region); this renders those cells with a pulsing white
  // outline — deliberately distinct from every other overlay this file
  // draws (a region's own colored tint, the footprint hatch's crimson
  // diagonal, the open-boundary line's solid red) so "look here, THIS is
  // what collided" can't be confused with an existing steady-state
  // warning. Rendered LAST (see the return below) so it always wins the
  // paint order regardless of what else is under it. SVG-native
  // `<animate>`, not a CSS keyframe — this file has no stylesheet of its
  // own to add one to, and this is the only element that needs to pulse.
  const conflictFlashEls: ReactElement[] = (
    regionEdit.conflictFlash?.cells ?? []
  ).map(([col, row]) => {
    const corners = creationCellPolygon(col, row, CELL_SIZE * 0.98)
      .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
      .join(' ');
    return (
      <polygon
        key={`region-conflict-${col}-${row}`}
        points={corners}
        fill="none"
        stroke="#ffffff"
        strokeWidth={3}
        pointerEvents="none"
      >
        <animate
          attributeName="stroke-opacity"
          values="1;0.15;1"
          dur="0.9s"
          repeatCount="indefinite"
        />
      </polygon>
    );
  });

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
    //
    // PLACEABLE vs. STANDABLE (rpg-project#169's "props on footprint
    // cells" unit, refined by the coverage-based-standability live design
    // round with Kirk, 2026-08-07): a footprint cell is no longer an
    // error condition for a PROP — it's the intended target (Kirk's exact
    // ask, a bookcase against a drawn wall) — so a prop on one renders
    // normally, no warning. A monster still can't stand on a cell whose
    // coverage meets `STANDABLE_COVERAGE_THRESHOLD` — `inStandableFootprint`
    // (not the raw `inFootprint`, which flags ANY touch at all) — so the
    // warning is scoped to genuinely-blocked cells now, not every cell the
    // wall merely grazes. Matches `canvasPlacementRejectReason`'s own
    // `requiresStandable` split at PLACEMENT time — this is the same rule
    // applied retroactively, to a wall drawn AFTER the placement already
    // existed.
    const blocked =
      inStandableFootprint(at[0], at[1]) && ref.startsWith('dnd5e:monsters:');
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
      {straightWallHandleEls}
      {holeEls}
      {/* Drawn AFTER the straight-wall footprint hatch above so a
          region's claim over a footprint/band cell tints OVER the hatch
          instead of sitting invisibly under it — see this array's own
          doc comment. */}
      {regionFootprintClaimEls}

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
      {conflictFlashEls}
    </svg>
  );
}
