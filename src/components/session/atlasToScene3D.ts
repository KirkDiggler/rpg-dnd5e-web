/**
 * atlasToScene3D — turns a `GetAtlasResponse` (dnd5e.api.session.v1alpha1)
 * into what the 3D game route's leaf renderers need, and nothing else.
 *
 * This is the 3D twin of `src/concepts/session-tomb/atlas.ts`, which does
 * the same job for the flat SVG concept page. The two are deliberately
 * separate files rather than one shared module: atlas.ts's `Point`/
 * `hexCenter` live in SVG user space (arbitrary `size`, y-down), while this
 * file targets `hexMath.ts`'s Three.js world space (`HEX_SIZE = 1.0`
 * world units, y-up, z-down-screen) via `cubeToWorld`/`hexEdgeBetween`.
 * Sharing one geometry module across both would mean one of them
 * secretly adopting the other's convention.
 *
 * # The axial -> cube bridge
 *
 * The wire's `Position` is axial (q, r) (session v0.20.0, ADR-0040 — see
 * atlas.ts's own doc comment on `HexLayout` for the full history of why
 * that needed saying twice). `hexMath.ts`'s `CubeCoord` is cube (x, y, z)
 * with x + y + z = 0, and — since rpg-toolkit#1150's axial-basis fix —
 * `cubeToWorld`'s cube.x IS the wire's q and cube.z IS the wire's r: no
 * swap, no rotation, just the derived third coordinate. `positionToCube`
 * below is that bridge, kept in exactly one place so no caller re-derives
 * it (and risks re-deriving it wrong — rpg-toolkit#1150's own postmortem is
 * that a swapped-both-ways conversion passes every round-trip test and is
 * only caught by actually drawing the shape).
 *
 * # Walls: declared interior seams, and an IMPLICIT perimeter
 *
 * `boundaries`/`doorways` are DECLARED on the wire (rpg-toolkit#1130) —
 * unlike the old `EncounterService`, which had no walls at all and forced
 * `wallRuns.ts` to derive room envelopes from hex membership. This file
 * does no such derivation for the INTERIOR seams: one edge-aligned piece
 * per declared boundary, one per declared doorway, matching `atlas.ts`'s
 * `buildScene` for the SVG page.
 *
 * The OUTER perimeter is a different case, and `perimeterWalls` below is
 * not the same kind of derivation `wallRuns.ts` did for the old wire. The
 * atlas declares only the 28 INTERIOR boundaries (the two seams) for the
 * reference tomb — it says nothing about the tomb's outer edge, because it
 * doesn't need to: per rpg-toolkit's one-projection law, the floor CELL
 * MASK (`atlas.cells`) is the single authoritative source of where the
 * world is, and "outside" is simply "not a floor cell." An edge between a
 * floor cell and a non-floor neighbour IS the boundary, as a fact of the
 * atlas rather than a rule a client applies — no room/zone concept, no
 * connector-column heuristics, just cell-membership adjacency. Found live
 * (PR #764 review): the first version of this file drew the two seams
 * correctly and left the tomb with no outer walls at all.
 */

import {
  coordToKey,
  cubeToWorld,
  getHexNeighbors,
  hexDistance,
  hexEdgeBetween,
  type CubeCoord,
  type HexEdge,
} from '@/components/hex-grid/hexMath';
import type { AbsoluteFloorTile } from '@/hooks/dungeonMapGeometry';
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import type {
  AtlasBoundary,
  AtlasDoorway,
  Position,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

/**
 * positionToCube is THE bridge between the wire's axial (q, r) and
 * hexMath's cube (x, y, z) — see this file's module doc comment. Every
 * caller in this codebase that needs a session `Position` in 3D world
 * space goes through this one function.
 */
export function positionToCube(position: Position): CubeCoord {
  const q = position.x;
  const r = position.y;
  return { x: q, y: -q - r, z: r };
}

/** A wall piece, edge-aligned between the two cells it separates. */
export interface WallEdgePiece {
  /** Stable per the two cells' cube keys — same edge always picks the
   * same wall variant across renders (selectWallVariant's own contract). */
  key: string;
  edge: HexEdge;
  blocksMovement: boolean;
  blocksLineOfSight: boolean;
}

/** A doorway, edge-aligned the same way a wall is. */
export interface DoorEdgePiece {
  key: string;
  edge: HexEdge;
  connection: string;
}

export interface Scene3D {
  floorTiles: Map<string, AbsoluteFloorTile>;
  walls: WallEdgePiece[];
  doors: DoorEdgePiece[];
}

/**
 * perimeterWalls derives one wall piece for every edge between a floor
 * cell and a NON-floor neighbour — the tomb's outer boundary, which the
 * atlas does not declare (see this file's module doc comment for why that
 * is correct wire behaviour, not a gap). Pure function of `cells` alone,
 * unit-tested directly against the real 224-cell reference-tomb fixture
 * (`atlasToScene3D.test.ts`): the perimeter edge count is a deterministic
 * property of that fixed shape.
 *
 * Each qualifying edge is visited exactly once: it is only ever found by
 * iterating a FLOOR cell's neighbours (the non-floor side never iterates
 * its own neighbours, since it is not in `cells`), so there is no
 * companion pass and no de-duplication to do.
 */
export function perimeterWalls(
  cells: readonly Position[],
  hexSize: number
): WallEdgePiece[] {
  const cubes = cells.map(positionToCube);
  const floorKeys = new Set(cubes.map(coordToKey));

  const walls: WallEdgePiece[] = [];
  for (const cube of cubes) {
    for (const neighbor of getHexNeighbors(cube)) {
      const neighborKey = coordToKey(neighbor);
      if (floorKeys.has(neighborKey)) {
        continue; // an interior edge, not the perimeter
      }
      walls.push({
        key: `perimeter:${coordToKey(cube)}->${neighborKey}`,
        edge: hexEdgeBetween(cube, neighbor, hexSize),
        blocksMovement: true,
        blocksLineOfSight: true,
      });
    }
  }
  return walls;
}

/**
 * buildScene3D lays out the whole atlas once, in hexMath's world-space
 * cube coordinates: the floor, the DECLARED interior seams (boundaries and
 * doorways), and the IMPLICIT outer perimeter (`perimeterWalls`).
 *
 * Boundaries/doorways with a missing endpoint, or whose two cells are not
 * actually adjacent, are DROPPED rather than drawn somewhere plausible —
 * same discipline as atlas.ts's `buildScene`/`edgeBetween` (see their doc
 * comments): a wall silently drawn across the entrance, or halfway across
 * a chamber, is a worse failure than a missing one, and `hexEdgeBetween`
 * itself does not check adjacency — it happily returns a geometrically
 * plausible-looking edge for any two cube coordinates, so the check has to
 * happen here.
 */
export function buildScene3D(
  atlas: Pick<GetAtlasResponse, 'cells' | 'boundaries' | 'doorways'>,
  hexSize: number
): Scene3D {
  const floorTiles = new Map<string, AbsoluteFloorTile>();
  for (const cell of atlas.cells) {
    const cube = positionToCube(cell);
    floorTiles.set(coordToKey(cube), { ...cube, roomId: '' });
  }

  const walls: WallEdgePiece[] = [];
  for (const b of atlas.boundaries as AtlasBoundary[]) {
    if (!b.from || !b.to) {
      continue;
    }
    const from = positionToCube(b.from);
    const to = positionToCube(b.to);
    if (hexDistance(from, to) !== 1) {
      continue;
    }
    walls.push({
      key: `${coordToKey(from)}->${coordToKey(to)}`,
      edge: hexEdgeBetween(from, to, hexSize),
      blocksMovement: b.blocksMovement,
      blocksLineOfSight: b.blocksLineOfSight,
    });
  }
  walls.push(...perimeterWalls(atlas.cells, hexSize));

  const doors: DoorEdgePiece[] = [];
  for (const d of atlas.doorways as AtlasDoorway[]) {
    if (!d.from || !d.to) {
      continue;
    }
    const from = positionToCube(d.from);
    const to = positionToCube(d.to);
    if (hexDistance(from, to) !== 1) {
      continue;
    }
    doors.push({
      key: d.connection || `${coordToKey(from)}->${coordToKey(to)}`,
      edge: hexEdgeBetween(from, to, hexSize),
      connection: d.connection,
    });
  }

  return { floorTiles, walls, doors };
}

/** worldPositionOf places a wire `Position` in Three.js world space —
 * the camera-target/entity-placement counterpart of `buildScene3D`'s
 * per-cell floor/wall geometry. */
export function worldPositionOf(position: Position, hexSize: number) {
  return cubeToWorld(positionToCube(position), hexSize);
}
