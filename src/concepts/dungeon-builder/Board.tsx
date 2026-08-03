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
  isSameSelection,
  nearestCell,
  roomAtColumn,
  totalColumns,
} from './boardGeometry';
import type { DungeonDoc } from './dungeonYaml';
import { BOARD_HEX_SIZE, cellCenter, cellCorners } from './hexLayout';
import { resolveMarkerStyle } from './markerStyle';
import type { BoardTool, PaletteSelection, PlacementSelection } from './types';

interface BoardProps {
  floorPlan: FloorPlan;
  doc: DungeonDoc;
  selectedPalette: PaletteSelection | null;
  selectedPlacement: PlacementSelection | null;
  selectedConnectorIndex: number | null;
  onPlace: (roomId: string, at: [number, number]) => void;
  onSelect: (sel: PlacementSelection | null) => void;
  /** `roomId: null` on the destination commits a TOP-LEVEL placement move
   * — see `types.ts`'s `PlacementSelection` doc comment. Board.tsx itself
   * only ever calls this with `null` when the DRAGGED selection was
   * already top-level (`dragging.roomId === null`): a top-level
   * placement stays top-level wherever it's dropped, even visually
   * inside a room's area — rooms are organizational, not existential
   * (TARGET-YAML.md's "top-level placement" section), so landing near a
   * room doesn't silently reparent it into that room's own `place:`
   * list. Room-scoped placements are unaffected — dropping one still
   * always resolves a real room id, same as before. */
  onMove: (
    sel: PlacementSelection,
    roomId: string | null,
    at: [number, number]
  ) => void;
  onReject: (message: string) => void;
  /** Door cell clicked — Kirk's 2026-08-02 ask. Index into
   * `floorPlan.connectors`/`doc.connectors` (same order, both derived
   * from the same YAML `connectors:` list). Always wins over any active
   * `selectedTool` — the REAL connector door outranks a target-dialect
   * tool mode. */
  onSelectConnector: (index: number) => void;
  /** A non-door wall-band cell clicked with NO Structural tool active —
   * the honest "this is a wall, select a tool to author it" explainer.
   * With a tool active, the tool-specific handlers below fire instead. */
  onWallGashClick: () => void;
  /** Target-dialect authoring — Kirk's 2026-08-02 reframe. See
   * TARGET-YAML.md's "Structural palette category" section. `null` means
   * no tool armed (normal placement/selection click behavior applies). */
  selectedTool: BoardTool | null;
  onToggleWall: (col: number, row: number) => void;
  onToggleWallKind: (col: number, row: number) => void;
  onToggleHole: (col: number, row: number) => void;
  onSetPoint: (kind: 'start' | 'end', col: number, row: number) => void;
}

export function Board({
  floorPlan,
  doc,
  selectedPalette,
  selectedPlacement,
  selectedConnectorIndex,
  onPlace,
  onSelect,
  onMove,
  onReject,
  onSelectConnector,
  onWallGashClick,
  selectedTool,
  onToggleWall,
  onToggleWallKind,
  onToggleHole,
  onSetPoint,
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
      const center = cellCenter(col, row);
      const corners = cellCorners(center, BOARD_HEX_SIZE - 1.5);
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
              // Target-dialect tools work on any room cell, door-row
              // included — none of them are gated by the v1 legality rule
              // that reserves that row (they're independent, not-yet-
              // compiled concepts). See TARGET-YAML.md.
              if (selectedTool === 'hole') {
                onToggleHole(col, row);
                return;
              }
              if (selectedTool === 'start' || selectedTool === 'end') {
                onSetPoint(selectedTool, col, row);
                return;
              }
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
        const connectorIndex = floorPlan.connectors.indexOf(connector);
        const isSelectedDoor =
          isDoorRow && selectedConnectorIndex === connectorIndex;
        cells.push(
          <polygon
            key={`cell-${col}-${row}`}
            points={points}
            className={
              isDoorRow
                ? `db-cell-door${isSelectedDoor ? ' db-cell-door-selected' : ''}`
                : 'db-cell-wall'
            }
            onClick={() => {
              // The REAL connector door always wins over any active tool
              // — it's the one thing on this cell that's genuinely v1.
              if (isDoorRow) {
                onSelectConnector(connectorIndex);
                return;
              }
              if (selectedTool === 'wall') {
                onToggleWall(col, row);
                return;
              }
              if (selectedTool === 'door') {
                onToggleWallKind(col, row);
                return;
              }
              if (selectedTool === 'hole') {
                onToggleHole(col, row);
                return;
              }
              onWallGashClick();
            }}
          />
        );
      }
    }
  }

  // --- target-dialect overlay: authored walls/holes/start/end, on top of
  // the base cell grid above. See TARGET-YAML.md's "Structural palette
  // category". Rendered as a SEPARATE pass (not folded into the loop
  // above) since a wall/hole/start/end can, in principle, sit on a cell
  // the compiled FloorPlan doesn't even have a room/connector for yet (a
  // from-scratch target-dialect draft) — this pass computes its own
  // geometry independent of what the base loop already drew there.
  // Deliberately muted/dashed, never the confident solid style compiled
  // geometry gets — these are PROPOSED, not compiled
  // (CONTRACT.md/TARGET-YAML.md).
  //
  // Each target-dialect cell also feeds `trackExtent` (same corners-based
  // call the base grid loop makes) so the viewBox GROWS to include anything
  // authored beyond the compiled FloorPlan's own bounding box, rather
  // than silently clipping it. Grow, not clamp, was the deliberate call:
  // this whole round's theme is the dialect running ahead of what's
  // compiled — clamping would silently hide legitimately authored
  // content, which is exactly the thing the compile-badge/dropped-fields
  // honesty mechanism elsewhere in this concept exists to avoid. See
  // CONTRACT.md.
  const trackCellExtent = (col: number, row: number) => {
    const center = cellCenter(col, row);
    cellCorners(center, BOARD_HEX_SIZE - 1.5).forEach(([x, y]) =>
      trackExtent(x, y)
    );
  };
  const structuralOverlay: ReactElement[] = [];
  for (const wall of doc.walls) {
    trackCellExtent(wall.from[0], wall.from[1]);
    trackCellExtent(wall.to[0], wall.to[1]);
    const center = cellCenter(wall.from[0], wall.from[1]);
    const isDoor = wall.kind === 'door';
    // Same orange/cream distinction the creation board's own wall
    // rendering and the 3D preview's wall boxes already use for solid
    // vs. door — the previous purple-on-purple, dash-spacing-only
    // difference here was hard to read at a glance (Kirk's own "make
    // sure drawn doors read as doors" ask), one visual language for
    // this construct across every view now, not three independently
    // tuned ones. A door also gets a filled tint (a solid wall stays
    // outline-only) and a small "D" label, matching this file's own
    // start/end marker convention just below.
    structuralOverlay.push(
      <rect
        key={`wall-${wall.from[0]}-${wall.from[1]}`}
        x={center.x - BOARD_HEX_SIZE * 0.55}
        y={center.y - BOARD_HEX_SIZE * 0.55}
        width={BOARD_HEX_SIZE * 1.1}
        height={BOARD_HEX_SIZE * 1.1}
        fill={isDoor ? '#ffb347' : 'none'}
        fillOpacity={isDoor ? 0.2 : 1}
        stroke={isDoor ? '#ffb347' : '#e8e2d8'}
        strokeWidth={2}
        strokeDasharray={isDoor ? '2 2' : '5 3'}
        rx={3}
        pointerEvents="none"
      />
    );
    if (isDoor) {
      structuralOverlay.push(
        <text
          key={`wall-${wall.from[0]}-${wall.from[1]}-label`}
          x={center.x}
          y={center.y + 3}
          textAnchor="middle"
          fill="#ffb347"
          fontSize={8}
          fontWeight={700}
          pointerEvents="none"
        >
          D
        </text>
      );
    }
  }
  for (const [holeCol, holeRow] of doc.holes) {
    trackCellExtent(holeCol, holeRow);
    const center = cellCenter(holeCol, holeRow);
    const corners = cellCorners(center, BOARD_HEX_SIZE - 1.5).map(
      ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`
    );
    structuralOverlay.push(
      <polygon
        key={`hole-${holeCol}-${holeRow}`}
        points={corners.join(' ')}
        fill="#050403"
        stroke="#2a1a33"
        strokeWidth={1.5}
        strokeDasharray="3 2"
        pointerEvents="none"
      />
    );
  }
  if (doc.start) {
    trackCellExtent(doc.start[0], doc.start[1]);
    const center = cellCenter(doc.start[0], doc.start[1]);
    structuralOverlay.push(
      <g key="dialect-start" pointerEvents="none">
        <circle
          cx={center.x}
          cy={center.y}
          r={BOARD_HEX_SIZE * 0.4}
          fill="#5fd1c9"
          fillOpacity={0.25}
          stroke="#5fd1c9"
          strokeWidth={2}
          strokeDasharray="3 2"
        />
        <text
          x={center.x}
          y={center.y + 3}
          textAnchor="middle"
          fill="#5fd1c9"
          fontSize={8}
          fontWeight={700}
        >
          ST
        </text>
      </g>
    );
  }
  if (doc.end) {
    trackCellExtent(doc.end[0], doc.end[1]);
    const center = cellCenter(doc.end[0], doc.end[1]);
    structuralOverlay.push(
      <g key="dialect-end" pointerEvents="none">
        <circle
          cx={center.x}
          cy={center.y}
          r={BOARD_HEX_SIZE * 0.4}
          fill="#c9a227"
          fillOpacity={0.25}
          stroke="#c9a227"
          strokeWidth={2}
          strokeDasharray="3 2"
        />
        <text
          x={center.x}
          y={center.y + 3}
          textAnchor="middle"
          fill="#c9a227"
          fontSize={8}
          fontWeight={700}
        >
          EN
        </text>
      </g>
    );
  }

  // Placements + boss pins.
  for (const room of doc.rooms) {
    const fpRoom = floorPlan.rooms.find((r) => r.id === room.id);
    if (!fpRoom) continue;
    room.place.forEach((p, index) => {
      const absCol = fpRoom.startColumn + p.at[0];
      const row = p.at[1];
      const center = cellCenter(absCol, row);
      const sel: PlacementSelection = { roomId: room.id, index };
      const isSelected = isSameSelection(selectedPlacement, sel);
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
            fill={resolveMarkerStyle(p.ref).color}
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
            {resolveMarkerStyle(p.ref).short}
          </text>
        </g>
      );
    });
    if (room.boss) {
      const absCol = fpRoom.startColumn + room.boss.at[0];
      const row = room.boss.at[1];
      const center = cellCenter(absCol, row);
      const sel: PlacementSelection = { roomId: room.id, boss: true };
      const isSelected = isSameSelection(selectedPlacement, sel);
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
            fill={resolveMarkerStyle(room.boss.ref, { isBoss: true }).color}
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

  // Top-level placements (`doc.place`, `roomId: null`) — TARGET-YAML.md's
  // "top-level placement" section: rooms are organizational, not
  // existential, so a placement doesn't have to belong to one. Same
  // marker rendering as the room-scoped loop just above, with two
  // differences: `at` is already absolute (no room `startColumn` to
  // add), and it also feeds `trackCellExtent` (matching every other
  // target-dialect construct below) so the viewBox grows to include one
  // authored beyond the compiled FloorPlan's own bounds instead of
  // silently clipping it — a top-level placement is explicitly allowed
  // to sit anywhere, not just inside a declared room.
  doc.place.forEach((p, index) => {
    trackCellExtent(p.at[0], p.at[1]);
    const center = cellCenter(p.at[0], p.at[1]);
    const sel: PlacementSelection = { roomId: null, index };
    const isSelected = isSameSelection(selectedPlacement, sel);
    markers.push(
      <g
        key={`place-top-${index}`}
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
          fill={resolveMarkerStyle(p.ref).color}
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
          {resolveMarkerStyle(p.ref).short}
        </text>
      </g>
    );
  });

  // Room labels + entrance marker.
  const labels: ReactElement[] = floorPlan.rooms.map((r) => {
    const top = cellCenter(r.startColumn, 0);
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
      floorPlan
    );
    setDragging(null);
    if (!dragging.boss && dragging.roomId === null) {
      // A top-level placement stays top-level wherever it's dropped —
      // even visually inside a room's area — rather than being
      // reparented into whatever room's `place:` list the drop point
      // happens to land in. See `BoardProps.onMove`'s own doc comment.
      if (row === floorPlan.doorRow) {
        onReject('Can’t drop on the reserved door row.');
        return;
      }
      const exclude = { roomId: null, index: dragging.index };
      if (isCellOccupied(floorPlan, doc, absCol, row, exclude)) {
        onReject('Cell already occupied.');
        return;
      }
      onMove(dragging, null, [absCol, row]);
      return;
    }
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
        {structuralOverlay}
        {labels}
        {markers}
        {entranceMarker}
      </g>
    </svg>
  );
}
