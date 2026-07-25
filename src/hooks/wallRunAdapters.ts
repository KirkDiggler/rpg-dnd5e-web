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
  hexColumn,
  hexRow,
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
 * Column -> the row range a connector run's segments actually cover,
 * joining `connectorRuns` back to each door's own cube position (for its
 * column) via `doors` — `ConnectorRun` itself only carries `doorId`, not
 * the door's position. A run with no `doorId`, or whose `doorId` has no
 * matching entry in `doors`, contributes nothing (defensive; every real
 * connector run traces back to a real `DOOR_*` wall entry, so this never
 * fires against real data).
 */
function coveredRowRangesByColumn(
  connectorRuns: ConnectorRun[],
  doors: ConnectorDoorInput[]
): Map<number, { minRow: number; maxRow: number }> {
  const doorColumnById = new Map<string, number>();
  for (const door of doors) {
    if (door.id) doorColumnById.set(door.id, hexColumn(door.position));
  }
  const ranges = new Map<number, { minRow: number; maxRow: number }>();
  for (const run of connectorRuns) {
    if (!run.doorId) continue;
    const column = doorColumnById.get(run.doorId);
    if (column === undefined) continue;
    ranges.set(column, run.coveredRows);
  }
  return ranges;
}

/** True when `hex` falls within some connector run's actually-covered
 * row range at its own column — never "a run exists for this column" in
 * isolation, since `coveredRows` can be a strict subset of the
 * connector's true extent under partial reveal (ConnectorRun.coveredRows'
 * own doc). */
function isCoveredByConnectorRun(
  hex: CubeCoord,
  coveredRowRanges: Map<number, { minRow: number; maxRow: number }>
): boolean {
  const range = coveredRowRanges.get(hexColumn(hex));
  if (!range) return false;
  const row = hexRow(hex);
  return row >= range.minRow && row <= range.maxRow;
}

/**
 * The positive category rule (design.md's W2 slice): the legacy per-cell
 * renderer (SyntyHexWall) draws
 *   (a) door entries, unchanged — their frame/leaf rendering and click
 *       surface are untouched by this design, only their ORIENTATION
 *       changes (see connectorRunDoorRotations below);
 *   (b) a non-door wall whose BLOCKING candidate cell lies INSIDE some
 *       region's hex set — genuine interior pattern walls (the crypt has
 *       these; the reference-tomb doesn't). For a degenerate
 *       (`from === to`) entry the candidate is its own cell; for a
 *       boundary-edge (`from !== to`) entry `from` is always real floor
 *       ALREADY inside its own region (rpg-toolkit's own construction —
 *       see below), so this never actually fires for boundary-edge, but
 *       the check stays generic rather than assuming shape;
 *   (c) STRUCTURAL SAFETY NET (gate review finding 1, rpg-dnd5e-web#603):
 *       a non-door wall whose candidate cell is OUTSIDE any known region
 *       AND whose candidate's column matches a KNOWN door's column (a
 *       connector-flanking cell, either wire shape) AND is NOT already
 *       covered by an emitted connector run.
 *
 * "Candidate cell" is what makes this robust to BOTH wire shapes without
 * branching on which one it is: for a degenerate entry the candidate is
 * the entry's own (single) cell; for a boundary-edge entry the candidate
 * is `to` — the far side, since `from` is real region floor that needs
 * no separate handling here (rpg-toolkit's `perimeterEdgeWalls`/
 * `connectorBoundaryEdgeWalls`, encounter/dungeon.go, both only ever set
 * `Start` to real, in-region floor). A candidate NOT inside any known
 * region is either the dungeon's TRUE outer perimeter (excluded — the
 * `from` region's own envelope run already covers its outward-facing
 * sides once that region is known) or a connector-flanking cell — those
 * two cases are told apart by whether the candidate's own column matches
 * a KNOWN door's column: connector columns are always strictly interior
 * (never the whole space's own x=0/width-1 edge — rpg-toolkit's own
 * generation invariant, encounter/dungeon.go's `perimeterEdgeWalls` doc),
 * so a true outer-perimeter candidate never coincides with a door column.
 *
 * Category (c) exists because region hex membership is per-viewer
 * REVEAL-GATED (rpg-api's `Space.hexes` is sight-range-gated
 * `RevealedHexes`, not the whole room), while the `Walls` list is
 * whole-room and unconditional from wave 1 — so a connector's flanking
 * wall entries can be on the wire well before `computeWallRuns` has
 * enough region data to pair the door with both its neighbors (or, even
 * once paired, before either side's row range has caught up to a given
 * flanking cell's own row — see `ConnectorRun.coveredRows`' doc).
 * Without (c), those entries were unconditionally excluded on the
 * PROMISE a run would cover them, which produced a genuine invisible
 * wall — a door frame flanked by nothing — for the entire span of
 * exploration where that promise didn't yet hold; live-verified against
 * the real running reference-tomb dungeon, this was NOT a theoretical
 * gap — the production wire emits connector flanks in boundary-edge
 * shape today, and an earlier, narrower version of this fix (checking
 * only degenerate entries) caught none of them. (c) makes the
 * invisible-wall guarantee hold BY CONSTRUCTION for every reveal state
 * AND either wire shape: a flanking cell only ever loses its legacy
 * rendering once a run actually draws over that exact cell, never merely
 * because a run exists somewhere on its column.
 */
export function legacyRenderWalls(
  walls: Iterable<Wall>,
  regions: RegionInput[],
  connectorRuns: ConnectorRun[],
  doors: ConnectorDoorInput[]
): Wall[] {
  const regionHexKeys = new Set<string>();
  for (const region of regions) {
    for (const hex of region.hexes) {
      regionHexKeys.add(coordToKey(hex));
    }
  }
  const coveredRowRanges = coveredRowRangesByColumn(connectorRuns, doors);
  const doorColumns = new Set(doors.map((door) => hexColumn(door.position)));

  const kept: Wall[] = [];
  for (const wall of walls) {
    if (isDoorWallKind(wall.kind)) {
      kept.push(wall);
      continue;
    }
    if (!wall.from || !wall.to) continue;
    const fromHex: CubeCoord = {
      x: wall.from.x,
      y: wall.from.y,
      z: wall.from.z,
    };
    const toHex: CubeCoord = { x: wall.to.x, y: wall.to.y, z: wall.to.z };
    const isDegenerate =
      fromHex.x === toHex.x && fromHex.y === toHex.y && fromHex.z === toHex.z;
    const candidate = isDegenerate ? fromHex : toHex;

    if (regionHexKeys.has(coordToKey(candidate))) {
      kept.push(wall); // interior pattern wall
      continue;
    }
    if (!doorColumns.has(hexColumn(candidate))) continue; // true outer perimeter
    // Connector-flanking candidate: keep it via the legacy fallback
    // UNLESS a connector run already covers this exact cell.
    if (!isCoveredByConnectorRun(candidate, coveredRowRanges)) {
      kept.push(wall);
    }
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
