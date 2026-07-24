/**
 * dungeonMapGeometry - Pure floor/wall/door geometry helpers shared by the
 * hex-grid renderer (HexGrid, InstancedHexTiles, ShadedHexFloor,
 * useHexInteraction) and the playtest map.
 *
 * Formerly part of useDungeonMap, which also accumulated multi-room state
 * from v1alpha1 Room/DoorInfo events via a stateful hook. That hook (and its
 * mergeRoom/updateEntitiesFromRoom/generateFloorTiles/createEmptyState
 * internals) was LobbyView-only and was deleted in slice 3 (rpg-dnd5e-web
 * #447) along with LobbyView. Multi-room accumulation on the v1alpha2 stream
 * is future work (design.md's slice 4). What's left here is stateless
 * geometry math, now entirely v1alpha2 `Wall`-shaped: the dnd5e encounter
 * domain's doors migrated to v1alpha2 in rpg-dnd5e-web#526 (The Dungeon wave
 * 2 Slice 2) — `doorHexKinds`/`doorHexPositions` replace the old v1alpha1
 * `DoorInfo`-based `openDoorWalkableKeys` (HexGrid's legacy `doors` prop was
 * dead code: no real caller ever populated it for the v2 stream — see
 * rpg-dnd5e-web#526's PR description).
 */

import {
  coordToKey,
  getHexLine,
  getHexNeighbors,
  type CubeCoord,
} from '@/components/hex-grid/hexMath';
import { isDoorWallKind } from '@/components/hex-grid/syntyHexWallHelpers';
import {
  WallKind,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';

/** A floor tile in dungeon-absolute coordinates */
export interface AbsoluteFloorTile {
  x: number;
  y: number;
  z: number;
  roomId: string;
}

/** Create coordinate key for map lookups */
function coordKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/**
 * Build a Map of cube-coord key -> WallKind for every DOOR_CLOSED/DOOR_OPEN
 * wall's own cell (`Wall.from` — the designated door cell itself, design
 * doc §Q2; never `Wall.to`, the passage neighbor, which is real floor in
 * the next chamber).
 *
 * Used by HexGrid's `isBlocked` for v2 door-aware walkability: a CLOSED
 * door blocks movement even when its hex is nominally a revealed floor
 * tile, and an OPEN door is walkable even when it's not one — the door hex
 * sits on the boundary between chambers, outside either room's floor-tile
 * bbox (the same "bridge two floor-tile sets" need the old v1
 * `openDoorWalkableKeys` solved, now sourced from the real wall list
 * instead of a prop nothing ever populated).
 *
 * Exported for unit testing without rendering HexGrid.
 */
export function doorHexKinds(walls: Iterable<Wall>): Map<string, WallKind> {
  const map = new Map<string, WallKind>();
  for (const wall of walls) {
    if (!isDoorWallKind(wall.kind)) {
      continue;
    }
    if (!wall.from) continue;
    map.set(coordKey(wall.from.x, wall.from.y, wall.from.z), wall.kind);
  }
  return map;
}

/**
 * Door hex positions (DOOR_CLOSED/DOOR_OPEN walls' `from` cell) for the
 * fallback ShadedHexFloor renderer's `doorPositions` tile-coloring prop.
 *
 * Exported for unit testing without rendering HexGrid.
 */
export function doorHexPositions(walls: Iterable<Wall>): CubeCoord[] {
  const positions: CubeCoord[] = [];
  for (const wall of walls) {
    if (!isDoorWallKind(wall.kind)) {
      continue;
    }
    if (!wall.from) continue;
    positions.push({ x: wall.from.x, y: wall.from.y, z: wall.from.z });
  }
  return positions;
}

/**
 * Create a canonical key for a wall segment.
 * Normalizes direction so that (A->B) and (B->A) produce the same key,
 * preventing duplicate walls when adjacent rooms both report a shared boundary.
 */
export function wallKey(wall: Wall): string {
  const sx = wall.from?.x ?? 0;
  const sy = wall.from?.y ?? 0;
  const sz = wall.from?.z ?? 0;
  const ex = wall.to?.x ?? 0;
  const ey = wall.to?.y ?? 0;
  const ez = wall.to?.z ?? 0;

  // Sort lexicographically so direction doesn't matter
  const startStr = `${sx},${sy},${sz}`;
  const endStr = `${ex},${ey},${ez}`;
  return startStr < endStr ? `${startStr}-${endStr}` : `${endStr}-${startStr}`;
}

/**
 * Compute "frontier ground hint" hexes: every hex immediately adjacent to a
 * wall segment that is NOT itself a revealed floor tile or another wall
 * position. Grounds solid wall blocks against the unrevealed darkness
 * beyond them (rpg-dnd5e-web#457) — without this, a wall sitting at the
 * reveal frontier reads as a block floating in the void rather than a wall
 * bounding a room that continues beyond it.
 *
 * Kind-agnostic by design: works off wall geometry (from/to line), not
 * WallKind, so it extends automatically to DOOR_CLOSED/DOOR_OPEN/WINDOW
 * walls once wave 2 folds doors into the walls array — a solid-only
 * grounding rule would break the moment a door stopped being a hard block.
 *
 * Exported for unit testing without rendering HexGrid.
 */
export function frontierGroundHintHexes(
  walls: Iterable<Wall>,
  floorTileKeys: ReadonlySet<string>
): CubeCoord[] {
  const wallKeys = new Set<string>();
  const wallLineHexes: CubeCoord[] = [];

  for (const wall of walls) {
    if (!wall.from || !wall.to) continue;
    const start: CubeCoord = {
      x: wall.from.x,
      y: wall.from.y,
      z: wall.from.z,
    };
    const end: CubeCoord = { x: wall.to.x, y: wall.to.y, z: wall.to.z };
    for (const hex of getHexLine(start, end)) {
      const key = coordToKey(hex);
      if (!wallKeys.has(key)) {
        wallKeys.add(key);
        wallLineHexes.push(hex);
      }
    }
  }

  const hints: CubeCoord[] = [];
  const seen = new Set<string>();
  for (const wallHex of wallLineHexes) {
    for (const neighbor of getHexNeighbors(wallHex)) {
      const key = coordToKey(neighbor);
      if (seen.has(key) || wallKeys.has(key) || floorTileKeys.has(key)) {
        continue;
      }
      seen.add(key);
      hints.push(neighbor);
    }
  }

  return hints;
}
