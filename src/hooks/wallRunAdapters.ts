/**
 * wallRunAdapters — the W2 seam between the real wire shapes
 * (`Hex`/`Wall` v1alpha2 protos) and wallRuns.ts's pure, protocol-agnostic
 * `RegionInput`/`ConnectorDoorInput` inputs, plus the "positive category
 * rule" that decides what the LEGACY per-cell renderer (SyntyHexWall) still
 * draws once envelope/connector runs take over the boundary (rpg-project#133
 * design.md/plan.md's W2 slice).
 *
 * Kept separate from wallRuns.ts itself so that module stays proto-free and
 * unit-testable without @bufbuild/protobuf (see its own doc comment), and
 * separate from the render component (WallRunMesh.tsx) so this file's pure
 * functions stay directly unit-testable per the react-refresh convention
 * this codebase already follows (syntyHexWallHelpers.ts, dungeonMapGeometry.ts).
 */

import { coordToKey, type CubeCoord } from '@/components/hex-grid/hexMath';
import { isDoorWallKind } from '@/components/hex-grid/syntyHexWallHelpers';
import {
  type Hex,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import {
  type ConnectorDoorInput,
  type ConnectorRun,
  type RegionInput,
} from './wallRuns';

/**
 * Group revealed hexes by `zoneId` into wallRuns' `RegionInput[]` shape —
 * exactly `RegionData.Hexes` reconstructed client-side, since the wire
 * never sends a region's width/height/offset directly (rpg-toolkit#848
 * findings; rpg-api's `zoneID, _ := data.Space.RegionAt(h)` is an exact
 * Hexes-set membership lookup, never geometry-derived). Hexes with an
 * empty `zoneId` (no region tag — e.g. a single-InitRoom encounter, or a
 * connector/door cell, which never carries a region tag by construction)
 * are excluded entirely; they contribute to no region's envelope.
 */
export function regionInputsFromHexes(hexes: Iterable<Hex>): RegionInput[] {
  const byZone = new Map<string, CubeCoord[]>();
  for (const hex of hexes) {
    if (!hex.zoneId || !hex.position) continue;
    const list = byZone.get(hex.zoneId);
    const coord: CubeCoord = {
      x: hex.position.x,
      y: hex.position.y,
      z: hex.position.z,
    };
    if (list) {
      list.push(coord);
    } else {
      byZone.set(hex.zoneId, [coord]);
    }
  }
  return Array.from(byZone, ([id, coordHexes]) => ({ id, hexes: coordHexes }));
}

/**
 * Extract every door's own cell (`Wall.from` for a `Kind = DOOR_*` entry)
 * into wallRuns' `ConnectorDoorInput[]` shape. `Wall.id` (the only
 * non-nil `id`s in the wire's walls list, rpg-api-protos#186) carries
 * through so a caller can key a rendered door frame back to the click
 * surface.
 */
export function connectorDoorInputsFromWalls(
  walls: Iterable<Wall>
): ConnectorDoorInput[] {
  const doors: ConnectorDoorInput[] = [];
  for (const wall of walls) {
    if (!isDoorWallKind(wall.kind) || !wall.from) continue;
    doors.push({
      id: wall.id,
      position: { x: wall.from.x, y: wall.from.y, z: wall.from.z },
    });
  }
  return doors;
}

/**
 * The positive category rule (design.md's W2 slice): the legacy per-cell
 * renderer (SyntyHexWall) now draws ONLY
 *   (a) door entries, unchanged — their frame/leaf rendering and click
 *       surface are untouched by this design, only their ORIENTATION
 *       changes (see connectorRunDoorRotations below);
 *   (b) degenerate (`from === to`) non-door walls whose cell lies INSIDE
 *       some region's hex set — genuine interior pattern walls (the
 *       crypt has these; the reference-tomb doesn't).
 *
 * Everything else — every boundary-edge (`from !== to`) non-door wall,
 * and every degenerate non-door wall OUTSIDE any region's hex set (a
 * connector-flanking cell, pre- or post-#849 shape alike) — is EXCLUDED:
 * envelope/connector runs (wallRuns.computeWallRuns, rendered by
 * WallRunMesh) now own that geometry instead. This is what makes the rule
 * robust to both wire shapes without branching (design.md): it never asks
 * "is this the old rubble shape or the new boundary-edge shape," it only
 * asks "is this cell inside a region," which is true for neither shape.
 */
export function legacyRenderWalls(
  walls: Iterable<Wall>,
  regions: RegionInput[]
): Wall[] {
  const regionHexKeys = new Set<string>();
  for (const region of regions) {
    for (const hex of region.hexes) {
      regionHexKeys.add(coordToKey(hex));
    }
  }

  const kept: Wall[] = [];
  for (const wall of walls) {
    if (isDoorWallKind(wall.kind)) {
      kept.push(wall);
      continue;
    }
    if (!wall.from || !wall.to) continue;
    const isDegenerate =
      wall.from.x === wall.to.x &&
      wall.from.y === wall.to.y &&
      wall.from.z === wall.to.z;
    if (!isDegenerate) continue; // boundary-edge -> replaced by envelope runs
    const key = coordToKey({ x: wall.from.x, y: wall.from.y, z: wall.from.z });
    if (regionHexKeys.has(key)) kept.push(wall);
  }
  return kept;
}

/**
 * Per-door rotationY override (radians), derived from each connector run's
 * OWN column axis — design.md's W2 rule: door frames orient "along the
 * connector column axis, not off doorPassageNeighbor's arbitrary
 * first-neighbor pick." A connector run's two segments both run along the
 * exact same axis (the column direction), so either segment's own
 * direction gives the answer; a connector with zero segments (a
 * degenerate 1-row-tall dungeon — never produced by a real
 * height>=4/doorRow-strictly-interior generator, but not this function's
 * job to assume) contributes no override, and the caller's door rendering
 * falls back to its own pre-existing orientation for that one door.
 */
export function connectorRunDoorRotations(
  connectorRuns: ConnectorRun[]
): Map<string, number> {
  const rotations = new Map<string, number>();
  for (const run of connectorRuns) {
    if (!run.doorId) continue;
    const segment = run.segments[0];
    if (!segment) continue;
    const dx = segment.end.x - segment.start.x;
    const dz = segment.end.z - segment.start.z;
    if (dx === 0 && dz === 0) continue;
    // Matches hexEdgeBetween's atan2(-dz, dx) convention (hexMath.ts) so a
    // door piece's local +X (width axis) lines up with the run direction
    // exactly the way every other edge-aligned piece in this codebase does.
    rotations.set(run.doorId, Math.atan2(-dz, dx));
  }
  return rotations;
}
