/**
 * Board — the dungeon-builder concept's 2D floor-plan renderer. Renders
 * whatever `FloorPlan` it's handed (live `PutDungeon` response or the
 * fixtures-mode fallback — see `usePutDungeonPreview`), never derives
 * layout itself: rooms/connectors/door_row/entrance all come straight off
 * the prop, matching design.md's "grid math is server-authoritative"
 * principle for the one thing a client CAN safely do — render, not
 * compute, the chain.
 */
import type { FloorPlan } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useRef, useState, type ReactElement } from 'react';
import {
  connectorAtColumn,
  isCellOccupied,
  isEntranceBlocked,
  nearestCell,
  roomAtColumn,
  totalColumns,
} from './boardGeometry';
import type { DungeonDoc } from './dungeonYaml';
import {
  BOARD_HEX_SIZE,
  cellCenter,
  cellCorners,
  type LayoutMode,
} from './hexLayout';
import {
  BOSS_COLOR,
  MONSTER_COLOR,
  PALETTE_PROPS,
  ROLE_COLOR,
} from './paletteData';
import type { PaletteSelection, PlacementSelection } from './types';

interface BoardProps {
  floorPlan: FloorPlan;
  doc: DungeonDoc;
  layoutMode: LayoutMode;
  selectedPalette: PaletteSelection | null;
  selectedPlacement: PlacementSelection | null;
  onPlace: (roomId: string, at: [number, number]) => void;
  onSelect: (sel: PlacementSelection | null) => void;
  onMove: (
    sel: PlacementSelection,
    roomId: string,
    at: [number, number]
  ) => void;
  onReject: (message: string) => void;
}

function markerColor(ref: string, isBoss: boolean): string {
  if (isBoss) return BOSS_COLOR;
  if (ref.startsWith('dnd5e:monsters:')) return MONSTER_COLOR;
  const prop = PALETTE_PROPS.find((p) => p.ref === ref);
  return prop ? ROLE_COLOR[prop.role] : '#888';
}

function shortLabel(ref: string, isBoss: boolean): string {
  if (isBoss) return 'BOSS';
  const prop = PALETTE_PROPS.find((p) => p.ref === ref);
  if (prop) return prop.short;
  return ref.startsWith('dnd5e:monsters:') ? 'M' : '?';
}

export function Board({
  floorPlan,
  doc,
  layoutMode,
  selectedPalette,
  selectedPlacement,
  onPlace,
  onSelect,
  onMove,
  onReject,
}: BoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<PlacementSelection | null>(null);

  const cols = totalColumns(floorPlan);
  const cells: ReactElement[] = [];
  const markers: ReactElement[] = [];
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

  for (let col = 0; col < cols; col++) {
    const room = roomAtColumn(floorPlan, col);
    const connector = connectorAtColumn(floorPlan, col);
    for (let row = 0; row < floorPlan.height; row++) {
      const center = cellCenter(layoutMode, col, row);
      const corners = cellCorners(layoutMode, center, BOARD_HEX_SIZE - 1.5);
      corners.forEach(([x, y]) => trackExtent(x, y));
      const points = corners
        .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
        .join(' ');

      if (room) {
        const isDoorRow = row === floorPlan.doorRow;
        const occupied = isCellOccupied(floorPlan, doc, col, row);
        cells.push(
          <polygon
            key={`cell-${col}-${row}`}
            points={points}
            className={
              isDoorRow
                ? 'db-cell-doorrow'
                : `db-cell-empty${occupied ? '' : ' db-placeable'}`
            }
            onClick={() => {
              if (isDoorRow) {
                onReject(
                  'Reserved door row (height/2) — not placeable. FloorPlan.door_row applies uniformly to every room.'
                );
                return;
              }
              if (occupied) return;
              if (!selectedPalette) {
                onReject(
                  'Pick a palette item first, then click an empty cell to place it.'
                );
                return;
              }
              if (!room) return;
              const localCol = col - room.startColumn;
              if (selectedPalette.kind === 'boss') {
                if (room.archetype !== 'boss') {
                  onReject(
                    'The boss pin can only be placed in the boss-archetype room (dungeonspec requires exactly one boss per boss room).'
                  );
                  return;
                }
              }
              onPlace(room.id, [localCol, row]);
            }}
          />
        );
      } else if (connector) {
        const isDoorRow = row === floorPlan.doorRow;
        cells.push(
          <polygon
            key={`cell-${col}-${row}`}
            points={points}
            className={isDoorRow ? 'db-cell-door' : 'db-cell-wall'}
            onClick={() => {
              if (isDoorRow) {
                onReject(
                  `Connector door (${connector.fromRoomId} ↔ ${connector.toRoomId}) — read-only overlay. Connectors/doors have no authorable coordinate in dungeonspec today.`
                );
              }
            }}
          />
        );
      }
    }
  }

  // Placements + boss pins.
  for (const room of doc.rooms) {
    const fpRoom = floorPlan.rooms.find((r) => r.id === room.id);
    if (!fpRoom) continue;
    room.place.forEach((p, index) => {
      const absCol = fpRoom.startColumn + p.at[0];
      const row = p.at[1];
      const center = cellCenter(layoutMode, absCol, row);
      const sel: PlacementSelection = { roomId: room.id, index };
      const isSelected =
        !!selectedPlacement &&
        !selectedPlacement.boss &&
        selectedPlacement.roomId === room.id &&
        selectedPlacement.index === index;
      markers.push(
        <g
          key={`place-${room.id}-${index}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelect(sel);
            setDragging(sel);
          }}
        >
          <circle
            cx={center.x}
            cy={center.y}
            r={BOARD_HEX_SIZE * 0.5}
            fill={markerColor(p.ref, false)}
            stroke={isSelected ? '#ffd76a' : '#000'}
            strokeWidth={isSelected ? 2.5 : 1}
          />
          <text
            x={center.x}
            y={center.y + 3.5}
            textAnchor="middle"
            fill="#fff"
            fontSize={9}
          >
            {shortLabel(p.ref, false)}
          </text>
        </g>
      );
    });
    if (room.boss) {
      const absCol = fpRoom.startColumn + room.boss.at[0];
      const row = room.boss.at[1];
      const center = cellCenter(layoutMode, absCol, row);
      const sel: PlacementSelection = { roomId: room.id, boss: true };
      const isSelected =
        !!selectedPlacement &&
        !!selectedPlacement.boss &&
        selectedPlacement.roomId === room.id;
      markers.push(
        <g
          key={`boss-${room.id}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelect(sel);
            setDragging(sel);
          }}
        >
          <circle
            cx={center.x}
            cy={center.y}
            r={BOARD_HEX_SIZE * 0.62}
            fill={markerColor(room.boss.ref, true)}
            stroke={isSelected ? '#ffd76a' : '#ffd76a'}
            strokeWidth={2}
          />
          <text
            x={center.x}
            y={center.y + 3.5}
            textAnchor="middle"
            fill="#fff"
            fontSize={8}
          >
            BOSS
          </text>
        </g>
      );
    }
  }

  // Room labels + entrance marker.
  const labels: ReactElement[] = floorPlan.rooms.map((r) => {
    const top = cellCenter(layoutMode, r.startColumn, 0);
    return (
      <text
        key={`label-${r.id}`}
        x={top.x - BOARD_HEX_SIZE}
        y={top.y - BOARD_HEX_SIZE * 1.6}
        className="db-room-label"
      >
        <tspan x={top.x - BOARD_HEX_SIZE} className="db-room-label-id">
          {r.id}
        </tspan>
        <tspan x={top.x - BOARD_HEX_SIZE} dy={13}>
          {r.archetype} · w{r.width} · start_column {r.startColumn}
        </tspan>
      </text>
    );
  });

  let entranceMarker: ReactElement | null = null;
  if (floorPlan.entrance) {
    const center = cellCenter(
      layoutMode,
      floorPlan.entrance.column,
      floorPlan.entrance.row
    );
    const blocked = isEntranceBlocked(floorPlan, doc);
    entranceMarker = (
      <g className="db-entrance-marker">
        <circle
          cx={center.x}
          cy={center.y}
          r={BOARD_HEX_SIZE * 0.55}
          fill="none"
          stroke={blocked ? '#ff5a3a' : '#5fd1c9'}
          strokeWidth={2.5}
          strokeDasharray="4 3"
        />
        <text
          x={center.x}
          y={center.y - BOARD_HEX_SIZE - 6}
          textAnchor="middle"
          fill={blocked ? '#ff5a3a' : '#8fe8e0'}
          fontSize={10}
          fontWeight={700}
        >
          {blocked ? '⚠ PARTY SPAWN (BLOCKED!)' : 'PARTY SPAWN'}
        </text>
      </g>
    );
  }

  const pad = BOARD_HEX_SIZE * 1.6;
  const vx = minX - pad;
  const vy = minY - pad - 14;
  const vw = maxX - minX + pad * 2;
  const vh = maxY - minY + pad * 2 + 14;

  const handlePointerMove: React.PointerEventHandler<SVGSVGElement> = () => {
    // Visual-only during drag today; commit happens on pointer up. Kept as
    // a named handler (rather than omitted) so a future hover-preview of
    // the drop target has an obvious place to live.
  };

  const handlePointerUp: React.PointerEventHandler<SVGSVGElement> = (e) => {
    if (!dragging || !svgRef.current) return;
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    const boardPt = ctm ? pt.matrixTransform(ctm.inverse()) : { x: 0, y: 0 };
    const { absCol, row, room } = nearestCell(
      { x: boardPt.x, y: boardPt.y },
      floorPlan,
      layoutMode
    );
    setDragging(null);
    if (!room) {
      onReject('Can only drop inside a room.');
      return;
    }
    if (row === floorPlan.doorRow) {
      onReject('Can’t drop on the reserved door row.');
      return;
    }
    if (dragging.boss && room.id !== dragging.roomId) {
      onReject('Boss pin can only move within its own boss room.');
      return;
    }
    const localCol = absCol - room.startColumn;
    const exclude = dragging.boss
      ? { roomId: dragging.roomId, index: 'boss' as const }
      : { roomId: dragging.roomId, index: dragging.index };
    if (isCellOccupied(floorPlan, doc, absCol, row, exclude)) {
      onReject('Cell already occupied.');
      return;
    }
    onMove(dragging, room.id, [localCol, row]);
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      width={Math.max(vw, 600)}
      height={Math.max(vh, 420)}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={(e) => {
        if (e.target === svgRef.current) onSelect(null);
      }}
    >
      <defs>
        <pattern
          id="db-doorrow-hatch"
          patternUnits="userSpaceOnUse"
          width={8}
          height={8}
          patternTransform="rotate(45)"
        >
          <rect width={8} height={8} fill="#2a1e10" />
          <line x1={0} y1={0} x2={0} y2={8} stroke="#5a4020" strokeWidth={4} />
        </pattern>
      </defs>
      <g>
        {cells}
        {labels}
        {markers}
        {entranceMarker}
      </g>
    </svg>
  );
}
