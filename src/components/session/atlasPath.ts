/**
 * atlasPath — edge-aware pathfinding over the session wire's atlas, for
 * building a `MoveRequest.path` from a click.
 *
 * `hexMath.ts`'s `findPath` (used by the OLD route's `HexGrid`/
 * `useHexInteraction`) blocks per-HEX: a single `isBlocked(coord)`
 * callback. The atlas's own movement rule is per-EDGE instead —
 * `MoveRequest`'s doc comment states it outright: "ADJACENCY IS NOT
 * PERMISSION... a pair of cells can be perfectly adjacent and still have
 * nothing to walk through. Two cells are walkable between only if a
 * doorway joins them or they sit in open floor." A per-hex blocked
 * predicate cannot express "this cell is fine to stand in, but you can't
 * step INTO it from that particular neighbor" — which is exactly what an
 * `AtlasBoundary` says (it names the edge, not either cell). So this file
 * is a small, separate A* over the atlas's own graph: floor cells are
 * nodes, and an edge between two hex-adjacent floor cells is passable
 * unless a declared `AtlasBoundary` with `blocksMovement` covers that
 * exact pair — UNLESS an `AtlasDoorway` also covers the same pair, which
 * punches a hole through it regardless (a doorway's whole reason to exist
 * is to be the one place a chamber-separating boundary can be crossed).
 *
 * `hexMath.ts` itself is untouched (frozen pointy-top only, web#763) —
 * this file only reuses its convention-independent pieces (`CubeCoord`,
 * `coordToKey`, `getHexNeighbors`, `hexDistance`) the same way
 * `atlasWallRuns.ts` reuses `wallRuns.ts`'s pure geometry rather than its
 * offset-convention-specific column/row functions.
 */

import {
  coordToKey,
  getHexNeighbors,
  hexDistance,
  type CubeCoord,
} from '@/components/hex-grid/hexMath';
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import type {
  AtlasBoundary,
  AtlasDoorway,
  AtlasProp,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { positionToCube } from './positionBridge';

/** A stable, order-independent key for an unordered pair of hex
 * coordinates — mirrors `atlasWallRuns.ts`'s own `pairKey` (not imported
 * from there: that one is module-private, and duplicating one string-join
 * is cheaper than exporting it across an otherwise unrelated module). */
function pairKey(a: CubeCoord, b: CubeCoord): string {
  const ka = coordToKey(a);
  const kb = coordToKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/** Precomputed, queryable form of the atlas's movement graph — built once
 * per atlas fetch (it's construction truth, same as the atlas itself) and
 * reused across every click. */
export interface AtlasPathIndex {
  floor: ReadonlySet<string>;
  /** Boundary pairs that block movement and are NOT also a doorway pair. */
  blockedEdges: ReadonlySet<string>;
  /** Doorway pairs — always crossable regardless of any boundary. */
  doorwayEdges: ReadonlySet<string>;
  /** Cells a prop occupies with `blocksMovement: true` — nothing may enter
   * one, even from an otherwise-open edge. */
  blockedCells: ReadonlySet<string>;
}

export function buildAtlasPathIndex(
  atlas: Pick<GetAtlasResponse, 'cells' | 'boundaries' | 'doorways' | 'props'>
): AtlasPathIndex {
  const floor = new Set(
    atlas.cells.map((cell) => coordToKey(positionToCube(cell)))
  );

  const doorwayEdges = new Set<string>();
  for (const doorway of atlas.doorways as AtlasDoorway[]) {
    if (!doorway.from || !doorway.to) continue;
    doorwayEdges.add(
      pairKey(positionToCube(doorway.from), positionToCube(doorway.to))
    );
  }

  const blockedEdges = new Set<string>();
  for (const boundary of atlas.boundaries as AtlasBoundary[]) {
    if (!boundary.from || !boundary.to || !boundary.blocksMovement) continue;
    const key = pairKey(
      positionToCube(boundary.from),
      positionToCube(boundary.to)
    );
    // A doorway punches through: the pair stays crossable even though a
    // boundary also names it (this is the ordinary shape — every doorway
    // in the real reference tomb sits on top of a movement-blocking
    // boundary between the same two chambers).
    if (doorwayEdges.has(key)) continue;
    blockedEdges.add(key);
  }

  const blockedCells = new Set<string>();
  for (const prop of atlas.props as AtlasProp[]) {
    if (prop.at && prop.blocksMovement) {
      blockedCells.add(coordToKey(positionToCube(prop.at)));
    }
  }

  return { floor, blockedEdges, doorwayEdges, blockedCells };
}

/** Whether a member may step directly from `a` to `b` — both must be
 * declared floor, the destination must have no movement-blocking prop,
 * and the edge itself must not be a boundary-only separator (a doorway
 * pair always passes; an undeclared pair between two floor cells in the
 * same open chamber always passes too — the atlas has no "this is open
 * floor" flag, absence of a blocking boundary IS that flag). */
export function edgePassable(
  index: AtlasPathIndex,
  a: CubeCoord,
  b: CubeCoord
): boolean {
  const ka = coordToKey(a);
  const kb = coordToKey(b);
  if (!index.floor.has(ka) || !index.floor.has(kb)) return false;
  if (index.blockedCells.has(kb)) return false;
  const key = pairKey(a, b);
  if (index.doorwayEdges.has(key)) return true;
  return !index.blockedEdges.has(key);
}

/**
 * A* over the atlas's own per-edge graph, `hexDistance` as the (admissible,
 * since every step costs exactly 1) heuristic. Returns the full path
 * INCLUDING the start cell, oldest-first — same convention as
 * `hexMath.ts`'s `findPath` — except when `start === goal` or no path
 * exists, both of which return `[]` (nothing to walk, not an error;
 * callers slice off the start cell themselves when building
 * `MoveRequest.path`, so an empty array here already means "no request to
 * send" either way).
 */
export function findAtlasPath(
  index: AtlasPathIndex,
  start: CubeCoord,
  goal: CubeCoord
): CubeCoord[] {
  const startKey = coordToKey(start);
  const goalKey = coordToKey(goal);
  if (!index.floor.has(startKey) || !index.floor.has(goalKey)) return [];
  if (startKey === goalKey) return [];

  const nodes = new Map<string, CubeCoord>([[startKey, start]]);
  const open = new Set<string>([startKey]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([
    [startKey, hexDistance(start, goal)],
  ]);

  while (open.size > 0) {
    let current: string | null = null;
    let lowestF = Infinity;
    for (const key of open) {
      const f = fScore.get(key) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        current = key;
      }
    }
    if (current === null) break;

    if (current === goalKey) {
      const path: CubeCoord[] = [nodes.get(current)!];
      let key = current;
      while (cameFrom.has(key)) {
        key = cameFrom.get(key)!;
        path.unshift(nodes.get(key)!);
      }
      return path;
    }

    open.delete(current);
    const currentCoord = nodes.get(current)!;
    for (const neighbor of getHexNeighbors(currentCoord)) {
      if (!edgePassable(index, currentCoord, neighbor)) continue;
      const neighborKey = coordToKey(neighbor);
      nodes.set(neighborKey, neighbor);
      const tentativeG = (gScore.get(current) ?? Infinity) + 1;
      if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeG);
        fScore.set(neighborKey, tentativeG + hexDistance(neighbor, goal));
        open.add(neighborKey);
      }
    }
  }

  return [];
}
