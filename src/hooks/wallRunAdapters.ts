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

import {
  coordToKey,
  cubeToWorld,
  HEX_SIZE,
  type CubeCoord,
  type WorldPos,
} from '@/components/hex-grid/hexMath';
import { isDoorWallKind } from '@/components/hex-grid/syntyHexWallHelpers';
import { connectorPartitionHeight } from '@/components/hex-grid/wallRunMeshHelpers';
import {
  type Hex,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import {
  cubeAtColRow,
  hexColumn,
  hexRow,
  type ConnectorDoorInput,
  type ConnectorRun,
  type RegionInput,
  type WallRunSegment,
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
 * The dungeon's true combined-space bounds, derived ENTIRELY from
 * `Wall.from` values across the whole (unconditional, whole-dungeon)
 * walls list — gate review "STILL-BLOCKED" finding, rpg-dnd5e-web#603.
 *
 * `Space.width`/`height` do not exist on the wire (verified against
 * rpg-api-protos: the installed v0.1.113 tag and origin/main HEAD both
 * lack any such field on the `Space` message, and no open PR adds one) —
 * despite design.md's own W1 framing listing "combined space dimensions"
 * as an input, no wire field was ever added to carry it, and adding one
 * would cross design.md's explicit "zero toolkit/proto/api changes in
 * v1" line, which is Kirk's call to relax, not this module's to route
 * around unilaterally.
 *
 * This derives the same bound from data ALREADY guaranteed present:
 * every `Wall.from` — for BOTH generator functions that ever emit a
 * boundary-edge entry (`perimeterEdgeWalls`/`connectorBoundaryEdgeWalls`,
 * encounter/dungeon.go) — is always real, in-grid region floor; `to` is
 * the only field that can be ambiguous (a genuine in-grid flank OR a
 * one-step-beyond-the-edge perimeter artifact). Every region spans the
 * dungeon's full shared `Height`, so every region's own row-0 and
 * row-(height-1) floor hexes sit on the space's true top/bottom edge —
 * `perimeterEdgeWalls` fires for at least one of their 6 neighbor
 * directions there BY CONSTRUCTION (the "further out" direction always
 * lands outside the grid at the true edge), guaranteeing a `from` entry
 * at exactly row 0 and exactly row height-1 somewhere in the list.
 * `to`, by contrast, can land at row -1 or row height for those same
 * entries — one step past the edge — which is exactly the spurious
 * candidate class this function exists to exclude.
 *
 * Unlike deriving bounds from currently-revealed REGION rows (explicitly
 * rejected — that reintroduces the original invisible-wall bug under
 * partial reveal, since a region's revealed subset shrinks the bound),
 * the walls list itself is NEVER reveal-gated — every wall for the whole
 * dungeon, including rooms never yet seen, is present from the very
 * first snapshot (verified live: 196 wall entries, spanning all 3
 * reference-tomb rooms, before hall or tomb were ever revealed). So this
 * bound is exact and available immediately, with zero partial-reveal
 * degradation.
 *
 * Returns undefined only if `walls` is empty (no dungeon geometry at
 * all) — the caller's safety net simply keeps nothing in that case
 * rather than guessing.
 */
function wireGridBounds(
  walls: Iterable<Wall>
):
  | { minCol: number; maxCol: number; minRow: number; maxRow: number }
  | undefined {
  let minCol = Infinity;
  let maxCol = -Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;
  let any = false;
  for (const wall of walls) {
    if (!wall.from) continue;
    any = true;
    const fromHex: CubeCoord = {
      x: wall.from.x,
      y: wall.from.y,
      z: wall.from.z,
    };
    const col = hexColumn(fromHex);
    const row = hexRow(fromHex);
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
    if (row < minRow) minRow = row;
    if (row > maxRow) maxRow = row;
  }
  return any ? { minCol, maxCol, minRow, maxRow } : undefined;
}

/**
 * The positive category rule (design.md's W2 slice, restructured in W3 to
 * split its output across two renderers — see below): every non-door,
 * non-interior wall entry falls into exactly one of:
 *   (a) 'door' — unchanged; frame/leaf rendering and click surface are
 *       untouched by this design, only their ORIENTATION changes (see
 *       connectorRunDoorRotations below). Still rendered by the legacy
 *       per-cell renderer (SyntyHexWall) via `legacyRenderWalls`.
 *   (b) 'interior' — a non-door wall whose BLOCKING candidate cell lies
 *       INSIDE some region's hex set — genuine interior pattern walls (the
 *       crypt has these; the reference-tomb doesn't). For a degenerate
 *       (`from === to`) entry the candidate is its own cell; for a
 *       boundary-edge (`from !== to`) entry `from` is always real floor
 *       ALREADY inside its own region (rpg-toolkit's own construction —
 *       see below), so this never actually fires for boundary-edge, but
 *       the check stays generic rather than assuming shape. Still rendered
 *       by the legacy per-cell renderer (SyntyHexWall) via
 *       `legacyRenderWalls` — design.md defers interior-pattern-wall
 *       restyle explicitly ("can follow once the envelope/connector
 *       language is proven").
 *   (c) 'connector-fallback' — STRUCTURAL SAFETY NET (gate review finding
 *       1, rpg-dnd5e-web#603): a non-door wall whose candidate cell is
 *       OUTSIDE any known region, whose candidate's column matches a
 *       KNOWN door's column (a connector-flanking cell, either wire
 *       shape), whose candidate is a real IN-GRID cell (`wireGridBounds`
 *       — excludes the one-step-beyond-the-edge perimeter artifacts a
 *       door-column match alone can't tell apart from a genuine flank,
 *       gate review's STILL-BLOCKED finding), AND is NOT already covered
 *       by an emitted connector run. W3 (team-lead's "fallback restyle"
 *       ask, Kirk's prod-screenshot follow-up): these no longer render
 *       through the legacy hex-vertex per-cell path at all —
 *       `connectorFallbackSegments` turns each candidate into a short,
 *       column-aligned straight segment rendered with the SAME tiled-run
 *       visual language as a real ConnectorRun (WallRunMesh), so a
 *       frontier door's flanking cells match the straight walls right
 *       next to them instead of standing out as the old chunky hex-wall
 *       look. The SELECTION logic (which cells get a wall mesh at all) is
 *       byte-identical to before this split — only which renderer draws
 *       category (c)'s candidates changed.
 *   (d) 'excluded' — the dungeon's TRUE outer perimeter (the `from`
 *       region's own envelope run already covers it once that region is
 *       known) or any other non-matching candidate. Renders nothing,
 *       either renderer.
 *
 * "Candidate cell" is what makes this robust to BOTH wire shapes without
 * branching on which one it is: for a degenerate entry the candidate is
 * the entry's own (single) cell; for a boundary-edge entry the candidate
 * is `to` — the far side, since `from` is real region floor that needs
 * no separate handling here (rpg-toolkit's `perimeterEdgeWalls`/
 * `connectorBoundaryEdgeWalls`, encounter/dungeon.go, both only ever set
 * `Start` to real, in-region floor).
 *
 * The column-match check ALONE is not sufficient to tell (c) apart from
 * the true perimeter, despite ruling out left/right perimeter edges
 * (connector columns are always strictly interior, never the whole
 * space's own x=0/width-1 edge — rpg-toolkit's own generation invariant):
 * a region's OWN top/bottom-row floor hex can have an out-of-grid
 * neighbor (one step above row 0 or below row height-1) that lands on an
 * ADJACENT connector's column purely by coincidence of hex-grid geometry
 * — gate review's STILL-BLOCKED finding, reproduced live (an isolated
 * wall block floating one row above/below the map at every connector
 * column, on the real reference-tomb dungeon at full reveal). Neither
 * "same row as `from`" nor "row differs from `from` by exactly 1"
 * discriminates the two cases either — both were checked by hand against
 * the real cube coordinates from the reported reproduction and both admit
 * false positives (a genuine flank can differ from its source row by 1
 * via the NE/SE neighbor directions, exactly like the spurious perimeter
 * case does). The only reliable discriminator is the candidate's
 * row/column against the dungeon's TRUE combined bounds —
 * `wireGridBounds`.
 *
 * Category (c) exists at all because region hex membership is per-viewer
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
 * AND either wire shape: a flanking cell only ever loses coverage once a
 * run (or, since W3, a fallback segment) actually draws over that exact
 * cell, never merely because a run exists somewhere on its column.
 */
type WallCategory =
  | { type: 'door' }
  | { type: 'interior' }
  | { type: 'connector-fallback'; candidate: CubeCoord }
  | { type: 'excluded' };

function categorizeWall(
  wall: Wall,
  regionHexKeys: Set<string>,
  doorColumns: Set<number>,
  gridBounds:
    | { minCol: number; maxCol: number; minRow: number; maxRow: number }
    | undefined,
  coveredRowRanges: Map<number, { minRow: number; maxRow: number }>
): WallCategory {
  if (isDoorWallKind(wall.kind)) return { type: 'door' };
  if (!wall.from || !wall.to) return { type: 'excluded' };
  const fromHex: CubeCoord = { x: wall.from.x, y: wall.from.y, z: wall.from.z };
  const toHex: CubeCoord = { x: wall.to.x, y: wall.to.y, z: wall.to.z };
  const isDegenerate =
    fromHex.x === toHex.x && fromHex.y === toHex.y && fromHex.z === toHex.z;
  const candidate = isDegenerate ? fromHex : toHex;

  if (regionHexKeys.has(coordToKey(candidate))) {
    return { type: 'interior' };
  }
  if (!doorColumns.has(hexColumn(candidate))) {
    return { type: 'excluded' }; // true outer perimeter
  }
  // A candidate whose column merely coincides with a door's column can
  // still be a genuine outer-perimeter cell (a region's own top/bottom
  // edge landing on an adjacent connector's column) — gate review's
  // STILL-BLOCKED finding. Require the candidate to be a real in-grid
  // cell before treating it as a connector flank at all.
  const candidateCol = hexColumn(candidate);
  const candidateRow = hexRow(candidate);
  if (
    !gridBounds ||
    candidateCol < gridBounds.minCol ||
    candidateCol > gridBounds.maxCol ||
    candidateRow < gridBounds.minRow ||
    candidateRow > gridBounds.maxRow
  ) {
    return { type: 'excluded' };
  }
  // Connector-flanking candidate: a fallback UNLESS a connector run
  // already covers this exact cell.
  if (isCoveredByConnectorRun(candidate, coveredRowRanges)) {
    return { type: 'excluded' };
  }
  return { type: 'connector-fallback', candidate };
}

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
  const gridBounds = wireGridBounds(walls);

  const kept: Wall[] = [];
  for (const wall of walls) {
    const category = categorizeWall(
      wall,
      regionHexKeys,
      doorColumns,
      gridBounds,
      coveredRowRanges
    );
    if (category.type === 'door' || category.type === 'interior') {
      kept.push(wall);
    }
  }
  return kept;
}

/**
 * One connector-flanking candidate cell, turned into a short,
 * column-aligned WallRunSegment spanning exactly one row — centered on the
 * candidate's own world position, oriented along the SAME column axis a
 * real ConnectorRun uses at that column (`cubeAtColRow`/`cubeToWorld` at
 * `row+1`, the exact per-row world-space step at a fixed column — see
 * wallRuns.ts's own doc comments for why this is a genuine straight hex
 * principal direction, unlike the row axis). This is what makes W3's
 * fallback restyle "same visual language as runs" true: WallRunMesh tiles
 * this segment with the identical real Synty piece a real connector run
 * uses, just for a length of one row instead of the run's full span.
 */
function candidateToFallbackSegment(
  candidate: CubeCoord,
  hexSize: number
): WallRunSegment {
  const col = hexColumn(candidate);
  const row = hexRow(candidate);
  const center = cubeToWorld(candidate, hexSize);
  const next = cubeToWorld(cubeAtColRow(col, row + 1), hexSize);
  const dx = next.x - center.x;
  const dz = next.z - center.z;
  return {
    start: { x: center.x - dx / 2, z: center.z - dz / 2 },
    end: { x: center.x + dx / 2, z: center.z + dz / 2 },
  };
}

/**
 * Connector-flanking candidates NOT covered by a real ConnectorRun (W1's
 * structural safety net, category (c) above) — as straight, column-aligned
 * WallRunSegments for WallRunMesh to tile with the same real Synty pieces
 * a run uses, instead of routing them through SyntyHexWall's legacy
 * per-cell hex-vertex renderer (design.md/plan.md's W3 "fallback restyle":
 * these cells cover frontier doors and far-unexplored rooms, so they're
 * seen constantly during normal play, right next to the new straight
 * walls — the old chunky hex-wall look stood out badly there per Kirk's
 * prod screenshot). The SET of covered cells is unchanged from
 * `legacyRenderWalls`' pre-W3 behavior (this function and that one
 * partition the exact same category-rule output) — only the render
 * target moved. Deduplicated by candidate cell key: a pathological input
 * with multiple wall entries resolving to the same candidate produces one
 * segment, not overlapping duplicates.
 */
export function connectorFallbackSegments(
  walls: Iterable<Wall>,
  regions: RegionInput[],
  connectorRuns: ConnectorRun[],
  doors: ConnectorDoorInput[],
  hexSize: number = HEX_SIZE
): WallRunSegment[] {
  const regionHexKeys = new Set<string>();
  for (const region of regions) {
    for (const hex of region.hexes) {
      regionHexKeys.add(coordToKey(hex));
    }
  }
  const coveredRowRanges = coveredRowRangesByColumn(connectorRuns, doors);
  const doorColumns = new Set(doors.map((door) => hexColumn(door.position)));
  const gridBounds = wireGridBounds(walls);

  const segments: WallRunSegment[] = [];
  const seenCandidateKeys = new Set<string>();
  for (const wall of walls) {
    const category = categorizeWall(
      wall,
      regionHexKeys,
      doorColumns,
      gridBounds,
      coveredRowRanges
    );
    if (category.type !== 'connector-fallback') continue;
    const key = coordToKey(category.candidate);
    if (seenCandidateKeys.has(key)) continue;
    seenCandidateKeys.add(key);
    segments.push(candidateToFallbackSegment(category.candidate, hexSize));
  }
  return segments;
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
 *
 * SUPERSEDED as of the connector-single-wall follow-up (rpg-project#132):
 * this only produces an entry once a real `ConnectorRun` resolves (both
 * neighboring regions known), so a door whose far room is still dark fell
 * back to `edge.rotationY` — a genuinely different, wire-hex-vertex-
 * derived angle, not the connector's own plane (Kirk's live-walk regression:
 * "can our door rotate a little to line up with the wall?"). Kept, still
 * correct in its own right and still tested, for any caller that only has
 * `ConnectorRun[]` and no raw door list — but `connectorDoorPlanes` below
 * is what real callers should use: it needs only each door's own cell
 * (always exactly ON the connector column by construction, this file's own
 * header doc), so it produces the SAME plane in both reveal states.
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

/** One door's exact position + orientation on its connector's own straight
 * column plane — see `connectorDoorPlanes`' doc comment. */
export interface DoorPlane {
  position: WorldPos;
  rotationY: number;
}

/**
 * Every door's EXACT position + rotationY on its connector's own straight
 * column line — Kirk's live-walk regression on the connector-single-wall
 * prototype: "can our door rotate a little to line up with the wall?" The
 * legacy per-cell renderer (SyntyHexWall) has always placed/oriented door
 * pieces from `hexEdgeBetween`'s wire-hex-vertex geometry (the midpoint/
 * corner between the door's own cell and `doorPassageNeighbor`'s
 * arbitrarily-picked first region-tagged neighbor) — a genuinely DIFFERENT
 * geometric quantity than the connector's own straight column line
 * wallRuns.ts computes and WallRunMesh actually tiles real wall pieces
 * along. Close enough to look plausible most of the time, never guaranteed
 * to coincide — the exact defect reported.
 *
 * Needs only each door's OWN cell (always exactly ON the connector column
 * by construction — this file's own header doc: "A door's own cell sits ON
 * the connector column") plus `hexSize`. Zero dependency on region data,
 * `ConnectorRun`s, or fallback segments at all — unlike
 * `connectorRunDoorRotations` above (superseded), this produces the exact
 * same plane whether the far room is dark or fully revealed, satisfying
 * "same in both reveal states" by construction rather than by coincidence.
 *
 * `rotationY` matches `hexEdgeBetween`'s own atan2(-dz, dx) convention
 * (hexMath.ts) using a second point one row further down the SAME column
 * (`candidateToFallbackSegment`'s own established "same column axis a real
 * ConnectorRun uses" convention) — the identical direction the tiled wall
 * pieces on that column already orient to, so a door frame/leaf placed
 * here reads as flush with the wall line instead of visibly disagreeing
 * with it.
 */
export function connectorDoorPlanes(
  doors: Iterable<ConnectorDoorInput>,
  hexSize: number = HEX_SIZE
): Map<string, DoorPlane> {
  const planes = new Map<string, DoorPlane>();
  for (const door of doors) {
    if (!door.id) continue;
    const col = hexColumn(door.position);
    const row = hexRow(door.position);
    const position = cubeToWorld(door.position, hexSize);
    const next = cubeToWorld(cubeAtColRow(col, row + 1), hexSize);
    const dx = next.x - position.x;
    const dz = next.z - position.z;
    if (dx === 0 && dz === 0) continue;
    planes.set(door.id, { position, rotationY: Math.atan2(-dz, dx) });
  }
  return planes;
}

/**
 * Cutaway prototype (rpg-project#132, `?wallCutaway=1`): each door's
 * effective height (stub or tall), via `WallRunMesh.connectorPartitionHeight`'s
 * interior-partition rule (tall unless the door sits between the camera
 * and the player's own current position).
 *
 * SUPERSEDED classification (originally dotted the door's own connector
 * run's `facing` against the camera, the SAME rule envelope runs use):
 * Kirk found two live-walk regressions with that approach. (1) `facing`
 * is a deterministic-but-arbitrary convention for a connector (points
 * toward regionB, not a true outward normal — see `ConnectorRun.facing`'s
 * own doc comment in wallRuns.ts), so dotting it against the camera
 * resolved toward-camera essentially at random relative to which side
 * the player actually occupies — EVERY interior partition/door stubbed.
 * (2) Because this only produced an entry once a real `ConnectorRun`
 * resolved, a door rendered via the fallback stand-in (far room still
 * dark) fell back to the caller's global (tall) height, then POPPED to
 * whatever the resolved run's facing-dot classified once the far side
 * revealed — "door height pops on open."
 *
 * Fix: classify from each door's OWN cube position (`doors`, the raw
 * wire list — ALWAYS fully known regardless of reveal state, the exact
 * same "needs no region/ConnectorRun data at all" property
 * `connectorDoorPlanes` above already relies on) plus the player's own
 * current position, via the identical rule `WallRunMesh` applies to the
 * connector wall itself — so the door and the wall it sits in can never
 * disagree, and the classification can never depend on which reveal
 * state resolved this column, so it can never pop on open/close again.
 *
 * A door with no `id` contributes no entry; the caller's door rendering
 * falls back to its own pre-existing global height for that one door,
 * same "caller falls back" contract as `connectorRunDoorRotations` above.
 */
export function connectorDoorHeights(
  doors: Iterable<ConnectorDoorInput>,
  playerPosition: WorldPos | undefined,
  tallHeight: number,
  hexSize: number = HEX_SIZE
): Map<string, number> {
  const heights = new Map<string, number>();
  for (const door of doors) {
    if (!door.id) continue;
    const doorWorld = cubeToWorld(door.position, hexSize);
    heights.set(
      door.id,
      connectorPartitionHeight(doorWorld, playerPosition, true, tallHeight)
    );
  }
  return heights;
}
