/**
 * Pure helpers for SyntyHexWall.tsx — split out per the react-refresh
 * ESLint rule (component files may only export components; matches
 * playtest/playtestMapHelpers.ts's identical split).
 *
 * Load-bearing correction (rpg-dnd5e-web#432 harness-parity, verified
 * against a real server encounter, not assumed): every `Wall` the real
 * server actually emits today is single-cell (`from === to`) — a wall is a
 * BLOCKED CELL, not a from/to boundary line between two open cells. That
 * inverts the original plan (decompose a multi-hex wall via getHexLine,
 * treat each consecutive adjacent pair as one edge — see git history for
 * the earlier `buildWallEdgeSegments` this replaces): with single-cell
 * walls, there's no "neighbor hex in the same wall" to pair against.
 *
 * The correct generalization of SyntyRoomDemo.tsx's `computeBorderEdges`
 * turns out to be simpler: instead of iterating a fixed ROOM_HEXES set and
 * emitting a piece on every edge facing OUTSIDE the room, iterate every
 * hex belonging to ANY wall (still built via getHexLine per wall, so a
 * hypothetical future multi-hex wall still decomposes correctly) and emit
 * a piece on every edge facing a neighbor that is NOT itself a wall hex —
 * the wall-hex set plays exactly the role ROOM_SET played in the demo.
 */

import {
  WallKind,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import {
  coordToKey,
  getHexLine,
  HEX_DIRECTIONS,
  hexEdgeBetween,
  type CubeCoord,
  type HexEdge,
} from './hexMath';

export type EdgePieceKind = 'wall' | 'door';

/** Mirrors ShadedHexWall's getKindColor switch — no WINDOW-specific piece
 * exists in the synced asset set yet, so it falls back to the wall piece
 * (matches the investigation's honest MVP scoping, not silently wrong). */
export function edgePieceKind(kind: WallKind): EdgePieceKind {
  switch (kind) {
    case WallKind.DOOR_CLOSED:
    case WallKind.DOOR_OPEN:
      return 'door';
    case WallKind.WINDOW:
    case WallKind.SOLID:
    case WallKind.UNSPECIFIED:
    default:
      return 'wall';
  }
}

export interface WallEdgeSegment {
  key: string;
  edge: HexEdge;
  kind: WallKind;
}

/**
 * Build one edge-aligned segment per (wall hex, non-wall neighbor) pair
 * across the ENTIRE wall list — not per-Wall-object, since a hex's
 * neighbor might belong to a *different* Wall entry than the hex itself
 * (23 independent single-cell Wall objects collectively forming one room's
 * perimeter, in the real data this was verified against). Each wall hex
 * keeps the WallKind of whichever Wall object it came from.
 *
 * Pure and independent of GLB loading so it's unit-testable directly.
 */
export function buildDungeonWallSegments(
  walls: Wall[],
  hexSize: number
): WallEdgeSegment[] {
  const wallKindByHex = new Map<string, WallKind>();
  for (const wall of walls) {
    if (!wall.from || !wall.to) continue;
    const start: CubeCoord = { x: wall.from.x, y: wall.from.y, z: wall.from.z };
    const end: CubeCoord = { x: wall.to.x, y: wall.to.y, z: wall.to.z };
    for (const hex of getHexLine(start, end)) {
      wallKindByHex.set(coordToKey(hex), wall.kind);
    }
  }

  const segments: WallEdgeSegment[] = [];
  const seenEdgeKeys = new Set<string>();
  for (const [hexKey, kind] of wallKindByHex) {
    const [hx, hy, hz] = hexKey.split(',').map(Number) as [
      number,
      number,
      number,
    ];
    const hex: CubeCoord = { x: hx, y: hy, z: hz };
    for (const dir of HEX_DIRECTIONS) {
      const neighbor: CubeCoord = {
        x: hex.x + dir.x,
        y: hex.y + dir.y,
        z: hex.z + dir.z,
      };
      const neighborKey = coordToKey(neighbor);
      if (wallKindByHex.has(neighborKey)) continue; // interior edge, between two wall cells

      const edgeKey = `${hexKey}->${neighborKey}`;
      if (seenEdgeKeys.has(edgeKey)) continue;
      seenEdgeKeys.add(edgeKey);

      segments.push({
        key: edgeKey,
        edge: hexEdgeBetween(hex, neighbor, hexSize),
        kind,
      });
    }
  }
  return segments;
}
