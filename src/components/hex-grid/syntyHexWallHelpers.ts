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
 * Wall piece variety (rpg-dnd5e-web#494-wave "wall variety" slice), sourced
 * from rpg-game-assets#2's piece->role manifest (`roles.wall.variants` in
 * harness/models/synty/env/manifest.json, synced to
 * public/models/synty/env/manifest.json). Hardcoded here rather than
 * fetched at runtime, matching this file's existing convention for
 * manifest-derived constants (WALL_HALF_RAW_WIDTH etc. in
 * SyntyHexWall.tsx were copied from the same manifest/inspection data,
 * not read from JSON at runtime) — the manifest says "never hand-edit,
 * re-run the build script" for ITS OWN regeneration, not a mandate that
 * consumers must parse it live; a new asset pack conversion needs a code
 * change here regardless, since a variant's GLB has to be known to
 * `SyntyHexWall`'s file list either way.
 *
 * `rawWidth`/`rawHeight` are each variant's own local-space bounding box
 * (not the single hardcoded WALL_HALF_* pair) — required because
 * broken/alcove aren't the same size as plain, and the "edge" fit formula
 * (scale = [1/rawWidth, WALL_HEIGHT/rawHeight, SYNTY_SCALE]) needs each
 * variant's own dimensions to land flush on a 1-hex edge.
 *
 * `alcove` ships at its manifest-recommended weight — visually verified
 * live (not just per the manifest's own "untested in-engine" caveat) that
 * squeezing its ~2.0 raw depth to fit a 1-hex edge does NOT clip into the
 * neighboring hex; see this slice's PR evidence. If a future re-sync
 * changes alcove's geometry, re-verify before keeping its weight nonzero.
 */
export interface WallVariant {
  name: string;
  weight: number;
  file: string;
  rawWidth: number;
  rawHeight: number;
}

export const WALL_VARIANTS: WallVariant[] = [
  {
    name: 'plain',
    weight: 3,
    file: 'SM_Env_Wall_Half_01.glb',
    rawWidth: 2.672,
    rawHeight: 5.1022,
  },
  {
    name: 'broken',
    weight: 1,
    file: 'SM_Env_Wall_Broken_Edge_01.glb',
    rawWidth: 2.1996,
    rawHeight: 5.082,
  },
  {
    name: 'alcove',
    weight: 1,
    file: 'SM_Env_Wall_Alcove_01.glb',
    rawWidth: 2.4888,
    rawHeight: 3.5618,
  },
];

/**
 * Deterministic string hash (FNV-1a) — same edge key always produces the
 * same hash, so the same wall edge always picks the same variant across
 * renders, reconnects, and remounts. A per-render Math.random() pick would
 * reshuffle every wall's appearance on every reconnect, which reads as a
 * bug ("why did the dungeon change?"), not a feature.
 */
function hashEdgeKey(key: string): number {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  return hash >>> 0; // unsigned 32-bit
}

/**
 * Pick a wall variant for a given edge segment key (WallEdgeSegment.key,
 * itself a stable function of the two hex coordinates the edge sits
 * between — see buildDungeonWallSegments) — deterministic per edge,
 * weighted by the manifest's variant weights. Pure and independent of GLB
 * loading so it's unit-testable directly.
 */
export function selectWallVariant(edgeKey: string): WallVariant {
  const totalWeight = WALL_VARIANTS.reduce((sum, v) => sum + v.weight, 0);
  const hash = hashEdgeKey(edgeKey);
  let target = hash % totalWeight;
  for (const variant of WALL_VARIANTS) {
    if (target < variant.weight) return variant;
    target -= variant.weight;
  }
  // Unreachable given totalWeight > 0 and target < totalWeight by
  // construction (hash % totalWeight), but keeps the return type total.
  return WALL_VARIANTS[0]!;
}

/**
 * Non-uniform "edge" fit scale for a wall variant: squeeze width to
 * exactly one hex edge, scale height to the game's wall height, thickness
 * at the standard Synty scale — generalizes SyntyHexWall.tsx's old
 * single-variant WALL_SCALE constant to any variant's own raw dimensions.
 */
export function wallVariantScale(
  variant: WallVariant,
  wallHeight: number,
  syntyScale: number
): [number, number, number] {
  return [1.0 / variant.rawWidth, wallHeight / variant.rawHeight, syntyScale];
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
