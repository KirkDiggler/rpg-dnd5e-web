/**
 * CreationBoard — the "New Dungeon" freeform canvas: draw walls, place
 * doors, mark start/end, place props/monsters with facing. Client-side
 * only (design.md defers wall/shape authoring to P4+ — there is no real
 * schema or server call for any of this yet; see CONTRACT.md).
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
import { FLAT_COL_SPACING, FLAT_ROW_SPACING } from '../hexLayout';
import { MONSTER_COLOR, PALETTE_PROPS, ROLE_COLOR } from '../paletteData';
import type { PaletteSelection } from '../types';
import {
  hEdgeGeometry,
  nearestCreationCell,
  nearestEdge,
  vEdgeGeometry,
  type EdgeGeometry,
} from './creationGeometry';
import type { CreationState, Placement, Tool } from './creationTypes';
import type { CreationActions } from './useCreationState';

interface CreationBoardProps {
  state: CreationState;
  actions: CreationActions;
  tool: Tool;
  paletteSelection: PaletteSelection | null;
  onReject: (message: string) => void;
}

// Same 6-direction convention authorGridHelpers.ts already defines for
// hex grids (HEX_FACING_LABELS, order E,NE,NW,W,SW,SE) — reused directly
// rather than inventing a rectangular-grid compass (a finding in its own
// right: creation mode's rectangular canvas doesn't map 1:1 onto 6 hex
// directions, but reusing the one real convention already in the
// codebase beats inventing a second, incompatible one — see
// CONTRACT.md). The screen angle for each direction is computed through
// the SAME cubeToWorld math hex-true mode uses (a unit step in that
// direction, projected to 2D screen space), not a hand-typed table, so
// it stays provably consistent even though this canvas has no cube
// coordinates of its own.
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

export function CreationBoard({
  state,
  actions,
  tool,
  paletteSelection,
  onReject,
}: CreationBoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverEdge, setHoverEdge] = useState<EdgeGeometry | null>(null);
  const [stroke, setStroke] = useState<{ addMode: boolean } | null>(null);
  const [dragPlacement, setDragPlacement] = useState<string | null>(null);

  const { grid } = state;
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
      const isOn = state.walls.has(edge.key);
      const shouldAdd = addModeOverride ?? !isOn;
      actions.toggleWall(edge.key, 'solid', shouldAdd);
    } else if (tool === 'door') {
      const current = state.walls.get(edge.key);
      if (!current) {
        onReject('Doors sit on a drawn wall — draw a wall here first.');
        return;
      }
      actions.toggleWall(edge.key, current === 'door' ? 'solid' : 'door', true);
    }
  };

  const handlePointerDown: React.PointerEventHandler<SVGSVGElement> = (e) => {
    const p = toBoardPoint(e.clientX, e.clientY);

    // A palette selection always means "place this on click", regardless
    // of which tool button is still highlighted — it must be checked
    // before the tool branches below, not after, or it's unreachable
    // whenever the caller also passes tool='select' alongside it (which
    // CreationConcept does, so the toolbar visually falls back to
    // select/move once something's been placed).
    if (paletteSelection) {
      const cell = nearestCreationCell(p, grid);
      actions.addPlacement(
        paletteSelection.kind === 'monster' ? 'monster' : 'prop',
        paletteSelection.ref,
        cell
      );
      return;
    }
    if (tool === 'select') {
      // Placement drag is started from the marker itself (onPointerDown
      // there); clicking empty board space here just deselects.
      actions.selectPlacement(null);
      return;
    }
    if (tool === 'start' || tool === 'end') {
      const cell = nearestCreationCell(p, grid);
      if (tool === 'start') actions.setStart(cell);
      else actions.setEnd(cell);
      return;
    }
    const edge = nearestEdge(p, grid);
    if (!edge) return;
    if (tool === 'wall') {
      const isOn = state.walls.has(edge.key);
      setStroke({ addMode: !isOn });
      applyEdgeAction(edge, !isOn);
    } else if (tool === 'door') {
      applyEdgeAction(edge);
    }
  };

  const handlePointerMove: React.PointerEventHandler<SVGSVGElement> = (e) => {
    const p = toBoardPoint(e.clientX, e.clientY);
    if (dragPlacement) {
      const cell = nearestCreationCell(p, grid);
      actions.movePlacement(dragPlacement, cell);
      return;
    }
    if (tool === 'wall' || tool === 'door') {
      const edge = nearestEdge(p, grid);
      setHoverEdge(edge);
      if (stroke && edge && tool === 'wall') {
        actions.toggleWall(edge.key, 'solid', stroke.addMode);
      }
    } else {
      setHoverEdge(null);
    }
  };

  const handlePointerUp: React.PointerEventHandler<SVGSVGElement> = () => {
    setStroke(null);
    setDragPlacement(null);
  };

  const wallEls: ReactElement[] = [];
  state.walls.forEach((kind, key) => {
    const [c, r] = key.slice(2).split(',').map(Number);
    const edge = key.startsWith('h:')
      ? hEdgeGeometry(c, r)
      : vEdgeGeometry(c, r);
    wallEls.push(
      <line
        key={key}
        x1={edge.a.x}
        y1={edge.a.y}
        x2={edge.b.x}
        y2={edge.b.y}
        stroke={kind === 'door' ? '#ffb347' : '#e8e2d8'}
        strokeWidth={kind === 'door' ? 3 : 4}
        strokeLinecap="round"
      />
    );
    if (kind === 'door') {
      wallEls.push(
        <circle
          key={`${key}-hinge`}
          cx={edge.mid.x}
          cy={edge.mid.y}
          r={3.5}
          fill="#100d0b"
          stroke="#ffb347"
          strokeWidth={1.5}
        />
      );
    }
  });

  const renderPlacement = (p: Placement) => {
    const center = {
      x: p.at[0] * FLAT_COL_SPACING,
      y: p.at[1] * FLAT_ROW_SPACING,
    };
    const selected = state.selectedPlacementId === p.id;
    const angle = p.facing !== null ? FACING_ANGLES_DEG[p.facing] : null;
    return (
      <g
        key={p.id}
        onPointerDown={(e) => {
          if (tool !== 'select') return;
          e.stopPropagation();
          actions.selectPlacement(p.id);
          setDragPlacement(p.id);
        }}
        style={{ cursor: tool === 'select' ? 'grab' : 'default' }}
      >
        <circle
          cx={center.x}
          cy={center.y}
          r={12}
          fill={markerColor(p.kind, p.ref)}
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
          {markerShort(p.ref)}
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

      {state.start && (
        <g pointerEvents="none">
          <circle
            cx={state.start[0] * FLAT_COL_SPACING}
            cy={state.start[1] * FLAT_ROW_SPACING}
            r={13}
            fill="none"
            stroke="#5fd1c9"
            strokeWidth={2.5}
            strokeDasharray="4 3"
          />
          <text
            x={state.start[0] * FLAT_COL_SPACING}
            y={state.start[1] * FLAT_ROW_SPACING - 18}
            textAnchor="middle"
            fill="#8fe8e0"
            fontSize={10}
            fontWeight={700}
          >
            START
          </text>
        </g>
      )}
      {state.end && (
        <g pointerEvents="none">
          <circle
            cx={state.end[0] * FLAT_COL_SPACING}
            cy={state.end[1] * FLAT_ROW_SPACING}
            r={13}
            fill="none"
            stroke="#c9a227"
            strokeWidth={2.5}
            strokeDasharray="4 3"
          />
          <text
            x={state.end[0] * FLAT_COL_SPACING}
            y={state.end[1] * FLAT_ROW_SPACING - 18}
            textAnchor="middle"
            fill="#ffd76a"
            fontSize={10}
            fontWeight={700}
          >
            END
          </text>
        </g>
      )}

      {state.placements.map(renderPlacement)}
    </svg>
  );
}
