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
 * Still its own specialized renderer, not `Board.tsx` itself — a
 * rectangular free canvas and a compiled hex room-chain are genuinely
 * different geometries, and one component branching between both would
 * likely be worse than two focused renderers sharing one data model.
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
 * whole stroke), same interaction grammar as any paint tool.
 */
import {
  facingDirection,
  HEX_FACING_LABELS,
} from '@/components/hex-grid/authorGridHelpers';
import { cubeToWorld } from '@/components/hex-grid/hexMath';
import { useRef, useState, type ReactElement } from 'react';
import type { BoardEditing } from '../DungeonBuilderConcept';
import type { DungeonDoc, WallDoc, WallKind } from '../dungeonYaml';
import { FLAT_COL_SPACING, FLAT_ROW_SPACING } from '../hexLayout';
import { MONSTER_COLOR, PALETTE_PROPS, ROLE_COLOR } from '../paletteData';
import type { BoardTool, PlacementSelection } from '../types';
import {
  creationCellCenter,
  hEdgeGeometry,
  nearestCreationCell,
  nearestEdge,
  vEdgeGeometry,
  type EdgeGeometry,
} from './creationGeometry';
import { DEFAULT_CANVAS } from './emptyCanvasDoc';

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
  onToggleHole: (col: number, row: number) => void;
  onSetPoint: (kind: 'start' | 'end', col: number, row: number) => void;
}

// Same 6-direction convention authorGridHelpers.ts already defines for
// hex grids (HEX_FACING_LABELS, order E,NE,NW,W,SW,SE) — reused directly
// rather than inventing a rectangular-grid compass (a finding in its own
// right: creation mode's rectangular canvas doesn't map 1:1 onto 6 hex
// directions, but reusing the one real convention in the codebase beats
// inventing a second, incompatible one — see CONTRACT.md). The screen
// angle for each direction is computed through the SAME cubeToWorld math
// hex-true mode uses (a unit step in that direction, projected to 2D
// screen space), not a hand-typed table, so it stays provably consistent
// even though this canvas has no cube coordinates of its own.
const FACING_ANGLES_DEG = HEX_FACING_LABELS.map((_, i) => {
  const dir = facingDirection(i);
  const world = cubeToWorld(dir, 1);
  return (Math.atan2(world.z, world.x) * 180) / Math.PI;
});

function markerColor(kind: 'prop' | 'monster', ref: string): string {
  if (kind === 'monster') return MONSTER_COLOR;
  const prop = PALETTE_PROPS.find((p) => p.ref === ref);
  return prop ? ROLE_COLOR[prop.role] : '#888';
}
function markerShort(ref: string): string {
  const prop = PALETTE_PROPS.find((p) => p.ref === ref);
  if (prop) return prop.short;
  return ref.startsWith('dnd5e:monsters:') ? 'M' : '?';
}

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

/** A wall's line geometry from its stored `from`/`to` — detects
 * horizontal vs. vertical from the coordinate delta rather than trusting
 * a separately-stored orientation, since `WallDoc` (the real, shared
 * shape) doesn't carry one; `hEdgeGeometry`/`vEdgeGeometry` both key off
 * the SAME (col, row) `from` anchor `setWallEdge` was called with. */
function wallGeometry(wall: WallDoc): EdgeGeometry {
  const [fc, fr] = wall.from;
  const [tc] = wall.to;
  return tc === fc ? hEdgeGeometry(fc, fr) : vEdgeGeometry(fc, fr);
}

export function CreationBoard({
  doc,
  edit,
  tool,
  onSelectPlacement,
  onReject,
  onToggleWallEdge,
  onToggleHole,
  onSetPoint,
}: CreationBoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverEdge, setHoverEdge] = useState<EdgeGeometry | null>(null);
  const [stroke, setStroke] = useState<{
    addMode: boolean;
    startPoint: { x: number; y: number };
    /** null until the drag has moved far enough to tell direction —
     * see handlePointerMove's own comment for why this can't just be the
     * first touched edge's orientation. */
    orientation: 'h' | 'v' | null;
  } | null>(null);
  const [dragPlacement, setDragPlacement] = useState<PlacementSelection | null>(
    null
  );

  const grid = doc.canvas ?? DEFAULT_CANVAS;
  const width = grid.width * FLAT_COL_SPACING;
  const height = grid.height * FLAT_ROW_SPACING;
  const pad = FLAT_COL_SPACING;

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
    const edge = nearestEdge(p, grid);
    if (!edge) return;
    if (tool === 'wall') {
      const existing = wallAtEdge(doc, edge.cellA, edge.cellB);
      setStroke({ addMode: !existing, startPoint: p, orientation: null });
      applyEdgeAction(edge, !existing);
    } else if (tool === 'door') {
      applyEdgeAction(edge);
    }
  };

  // A quarter cell of movement before committing to a direction — small
  // enough to feel immediate, large enough not to fire on hand-tremor.
  const DIRECTION_LOCK_THRESHOLD =
    Math.min(FLAT_COL_SPACING, FLAT_ROW_SPACING) * 0.25;

  const handlePointerMove: React.PointerEventHandler<SVGSVGElement> = (e) => {
    const p = toBoardPoint(e.clientX, e.clientY);
    if (dragPlacement) {
      const cell = nearestCreationCell(p, grid);
      edit.handleMove(dragPlacement, null, cell);
      return;
    }
    if (tool === 'wall' || tool === 'door') {
      if (stroke && tool === 'wall') {
        let orientation = stroke.orientation;
        if (orientation === null) {
          // A horizontal drag draws a horizontal wall (consecutive 'h'
          // edges share endpoints and connect end-to-end into one
          // straight line); a vertical drag draws a vertical one — this
          // is the OPPOSITE of "whichever edge the pointer happens to be
          // closest to right now" (that's a function of exactly where
          // inside a cell the cursor sits, not of which way the user is
          // dragging, and using it produced a crenellated comb instead
          // of a straight wall — see CONTRACT.md's wall-interaction
          // finding for the concrete before/after).
          const dx = p.x - stroke.startPoint.x;
          const dy = p.y - stroke.startPoint.y;
          if (Math.hypot(dx, dy) >= DIRECTION_LOCK_THRESHOLD) {
            orientation = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
            setStroke({ ...stroke, orientation });
          }
        }
        const edge = nearestEdge(p, grid, orientation ?? undefined);
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
  };

  const handlePointerUp: React.PointerEventHandler<SVGSVGElement> = () => {
    setStroke(null);
    setDragPlacement(null);
  };

  const wallEls: ReactElement[] = [];
  for (const wall of doc.walls) {
    const edge = wallGeometry(wall);
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

  // Same dark/dashed treatment Board.tsx (edit mode) uses for a target-
  // dialect hole — one visual language for "no floor here" across both
  // boards.
  const holeEls: ReactElement[] = doc.holes.map(([col, row]) => {
    const center = creationCellCenter(col, row);
    const half = { x: FLAT_COL_SPACING * 0.42, y: FLAT_ROW_SPACING * 0.42 };
    return (
      <rect
        key={`hole-${col}-${row}`}
        x={center.x - half.x}
        y={center.y - half.y}
        width={half.x * 2}
        height={half.y * 2}
        fill="#050403"
        stroke="#2a1a33"
        strokeWidth={1.5}
        strokeDasharray="3 2"
        pointerEvents="none"
      />
    );
  });

  const renderPlacement = (
    ref: string,
    at: [number, number],
    facing: number | null,
    sel: PlacementSelection
  ) => {
    const center = {
      x: at[0] * FLAT_COL_SPACING,
      y: at[1] * FLAT_ROW_SPACING,
    };
    const isMonster = ref.startsWith('dnd5e:monsters:');
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
        <circle
          cx={center.x}
          cy={center.y}
          r={12}
          fill={markerColor(isMonster ? 'monster' : 'prop', ref)}
          stroke={selected ? '#ffd76a' : '#000'}
          strokeWidth={selected ? 2.5 : 1}
        />
        <text
          x={center.x}
          y={center.y + 3.5}
          textAnchor="middle"
          fill="#fff"
          fontSize={9}
        >
          {markerShort(ref)}
        </text>
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
      </g>
    );
  };

  const placementEls = doc.place.map((p, index) =>
    renderPlacement(p.ref, p.at, p.facing, { roomId: null, index })
  );

  return (
    <svg
      ref={svgRef}
      viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`}
      width={Math.max(width + pad * 2, 600)}
      height={Math.max(height + pad * 2, 420)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{
        cursor: tool === 'wall' || tool === 'door' ? 'crosshair' : 'default',
      }}
    >
      <defs>
        <pattern
          id="creation-grid"
          width={FLAT_COL_SPACING}
          height={FLAT_ROW_SPACING}
          patternUnits="userSpaceOnUse"
        >
          <rect
            width={FLAT_COL_SPACING}
            height={FLAT_ROW_SPACING}
            fill="#1a1512"
          />
          <path
            d={`M ${FLAT_COL_SPACING} 0 L 0 0 0 ${FLAT_ROW_SPACING}`}
            fill="none"
            stroke="#2a2521"
            strokeWidth={1}
          />
        </pattern>
      </defs>

      <rect
        x={-FLAT_COL_SPACING / 2}
        y={-FLAT_ROW_SPACING / 2}
        width={width}
        height={height}
        fill="url(#creation-grid)"
      />
      <rect
        x={-FLAT_COL_SPACING / 2}
        y={-FLAT_ROW_SPACING / 2}
        width={width}
        height={height}
        fill="none"
        stroke="#c9a227"
        strokeWidth={3}
      />

      {wallEls}
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

      {doc.start && (
        <g pointerEvents="none">
          <circle
            cx={doc.start[0] * FLAT_COL_SPACING}
            cy={doc.start[1] * FLAT_ROW_SPACING}
            r={13}
            fill="none"
            stroke="#5fd1c9"
            strokeWidth={2.5}
            strokeDasharray="4 3"
          />
          <text
            x={doc.start[0] * FLAT_COL_SPACING}
            y={doc.start[1] * FLAT_ROW_SPACING - 18}
            textAnchor="middle"
            fill="#8fe8e0"
            fontSize={10}
            fontWeight={700}
          >
            START
          </text>
        </g>
      )}
      {doc.end && (
        <g pointerEvents="none">
          <circle
            cx={doc.end[0] * FLAT_COL_SPACING}
            cy={doc.end[1] * FLAT_ROW_SPACING}
            r={13}
            fill="none"
            stroke="#c9a227"
            strokeWidth={2.5}
            strokeDasharray="4 3"
          />
          <text
            x={doc.end[0] * FLAT_COL_SPACING}
            y={doc.end[1] * FLAT_ROW_SPACING - 18}
            textAnchor="middle"
            fill="#ffd76a"
            fontSize={10}
            fontWeight={700}
          >
            END
          </text>
        </g>
      )}

      {placementEls}
    </svg>
  );
}
