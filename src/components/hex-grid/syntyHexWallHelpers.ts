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
 *
 * DOOR_CLOSED/DOOR_OPEN walls are the one exception to "single-cell,
 * from === to" (The Dungeon wave 2 Slice 2, rpg-project#96): a door's
 * `from`/`to` is a DESIGNATED PASSAGE EDGE — `from` is the door's own cell,
 * `to` names which single edge to draw the frame on (design doc §Q2). This
 * also carries the door's `Wall.id` (rpg-api-protos#186) for the click
 * surface. See collectWallHexes and buildDungeonWallSegments's own doc
 * comments for how this is kept from colliding with the generic
 * neighbor-membership algorithm above.
 */

import {
  WallKind,
  type Wall,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import * as THREE from 'three';
import {
  coordToKey,
  cubeToWorld,
  getHexLine,
  HEX_DIRECTIONS,
  hexCorners,
  hexDistance,
  hexEdgeBetween,
  type CubeCoord,
  type HexEdge,
  type WorldPos,
} from './hexMath';

export type EdgePieceKind = 'wall' | 'door';

export function isDoorWallKind(kind: WallKind): boolean {
  return (
    kind === WallKind.DOOR_CLOSED ||
    kind === WallKind.DOOR_OPEN ||
    kind === WallKind.DOOR_LOCKED
  );
}

export type DoorVisualState = 'closed' | 'open' | 'locked';

export function doorVisualState(kind: WallKind): DoorVisualState | undefined {
  switch (kind) {
    case WallKind.DOOR_CLOSED:
      return 'closed';
    case WallKind.DOOR_OPEN:
      return 'open';
    case WallKind.DOOR_LOCKED:
      return 'locked';
    default:
      return undefined;
  }
}

/** Mirrors ShadedHexWall's getKindColor switch — no WINDOW-specific piece
 * exists in the synced asset set yet, so it falls back to the wall piece
 * (matches the investigation's honest MVP scoping, not silently wrong). */
export function edgePieceKind(kind: WallKind): EdgePieceKind {
  return isDoorWallKind(kind) ? 'door' : 'wall';
}

export interface WallEdgeSegment {
  key: string;
  edge: HexEdge;
  kind: WallKind;
  /** Wall.id (rpg-api-protos#186) — present on door segments, the
   * click->Interact bridge. Absent on plain solid/window segments. */
  id?: string;
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
  /**
   * The piece's own local-space bounding-box MIN x (measured directly off
   * the GLB, same convention as rawWidth/rawHeight) — round-2 W3/W4
   * finding (Kirk's live walk: "gaps between tiled segments"). `plain`'s
   * local origin sits near its LEFT bbox edge (min.x=-0.1174, width
   * 2.672 — the origin is only 0.1174 in from the left edge, but 2.555
   * from the right), NOT at its geometric center as
   * `wallRunMeshHelpers.tileWallSegment` used to assume when it placed
   * every tile's origin at its slot's center (`pieceWidth * (i + 0.5)`).
   * That assumption is silently wrong for a piece whose authored pivot
   * isn't centered: it doesn't create gaps BETWEEN adjacent tiles (the
   * math cancels out identically there — every tile shares the same
   * scale, so consecutive spans still abut exactly), but it shifts the
   * ENTIRE tiled run along its own axis by `(rawMinX + rawWidth/2) *
   * (pieceWidth/rawWidth)` relative to where the run's own
   * `segment.start`/`segment.end` say it should sit — measured at ~0.456
   * world units for `plain` at the default 1.0 nominal piece width,
   * nearly half a hex radius. That's large enough to open a real,
   * visible gap between a run's own end and whatever it's supposed to
   * butt against (a corner fitting, a connector, the room's true
   * boundary) — the actual shape of Kirk's "gaps between tiled segments"
   * report, not a seam between individual repeated tiles. `broken` has
   * the same defect, smaller in magnitude (min.x=-0.0832). `alcove` is
   * measured centered (min.x=-1.2444, essentially exactly -rawWidth/2) —
   * not every piece in this pack has an off-center pivot, so this can't
   * be assumed pack-wide and has to be measured per piece. Only `plain`
   * (`WALL_VARIANTS[0]`, `RUN_WALL_VARIANT` in WallRunMesh.tsx) is
   * actually tiled by `tileWallSegment` today — `broken`/`alcove` are
   * legacy SyntyHexWall.tsx's per-cell variety pool, a different
   * (already Kirk-verified, not touched here) placement path with its
   * own single-piece-per-edge positioning, out of this fix's scope.
   */
  rawMinX: number;
}

export const WALL_VARIANTS: WallVariant[] = [
  {
    name: 'plain',
    weight: 3,
    file: 'SM_Env_Wall_Half_01.glb',
    rawWidth: 2.672,
    rawHeight: 5.1022,
    rawMinX: -0.1174,
  },
  {
    name: 'broken',
    weight: 1,
    file: 'SM_Env_Wall_Broken_Edge_01.glb',
    rawWidth: 2.1996,
    rawHeight: 5.082,
    rawMinX: -0.0832,
  },
  {
    name: 'alcove',
    weight: 1,
    file: 'SM_Env_Wall_Alcove_01.glb',
    rawWidth: 2.4888,
    rawHeight: 3.5618,
    rawMinX: -1.2444,
  },
];

/**
 * Per-room wall "mood" (rpg-dnd5e-web#558 crypt spike). `selectWallVariant`
 * used to draw from one global pool (WALL_VARIANTS, the "rubble" look —
 * plain:broken:alcove = 3:1:1). Injected demo rooms (the crypt layout,
 * playtestMapHelpers.ts's `buildCryptLayout`) want a different feel without
 * disturbing every existing caller: same 3 GLB variants (no new assets),
 * different weights per theme. `'default'` is byte-identical to the
 * pre-theme weights (same array reference) so every caller that doesn't
 * pass a theme — every real dungeon wall today — selects exactly as before.
 */
export type WallTheme = 'default' | 'crypt';

/**
 * `'crypt'` reuses the same 3 GLBs at plain-heavy weights: a crypt reads as
 * intact worked masonry, not a ruin, so `broken` stays at the same absolute
 * weight as default (rare, not eliminated — total collapse still happens)
 * while `plain`'s weight goes up around it; `alcove` gets a mild bump over
 * broken for an occasional deliberate-looking recess instead of damage.
 */
const CRYPT_WALL_VARIANTS: WallVariant[] = WALL_VARIANTS.map((variant) => {
  if (variant.name === 'plain') return { ...variant, weight: 10 };
  if (variant.name === 'alcove') return { ...variant, weight: 2 };
  return variant; // broken: unchanged weight (1)
});

export const WALL_VARIANTS_BY_THEME: Record<WallTheme, WallVariant[]> = {
  default: WALL_VARIANTS,
  crypt: CRYPT_WALL_VARIANTS,
};

/**
 * Per-theme material tint (rpg-dnd5e-web#558 — Kirk's POLYGON Dark
 * Fortress reference: dark cool-gray stone, not tan brick on a bright
 * atlas). No darker Synty atlas exists for this pack (verified against the
 * source textures — colorways are accent-only), so this is a multiplicative
 * color tint applied in-engine, matching the character-tint pattern already
 * used elsewhere in this codebase (rpg-dnd5e-web#515). `'default'` gets no
 * entry here, so a lookup returns `undefined` for it and GlbInstance skips
 * the clone-and-tint path entirely — every non-crypt caller is untouched.
 * Moved here (out of SyntyHexWall.tsx) in the dungeon-walls redesign's W3
 * slice so WallRunMesh.tsx's real Synty pieces share the exact same
 * per-theme tint instead of a second, easy-to-drift copy.
 */
export const WALL_TINT_BY_THEME: Partial<Record<WallTheme, THREE.Color>> = {
  crypt: new THREE.Color(0.32, 0.36, 0.46), // dark, cool blue-gray stone
};

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
 * weighted by `theme`'s variant weights (WALL_VARIANTS_BY_THEME). Defaults
 * to `'default'` so every pre-existing caller (real dungeon walls) keeps
 * selecting from the original 3:1:1 pool unchanged. Pure and independent of
 * GLB loading so it's unit-testable directly.
 */
export function selectWallVariant(
  edgeKey: string,
  theme: WallTheme = 'default'
): WallVariant {
  const variants = WALL_VARIANTS_BY_THEME[theme];
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  // Copilot review #500: makes the "unreachable" comment below actually
  // true. Without this, a future manifest re-sync that zeroed every
  // weight would compute hash % 0 (NaN), and `target < variant.weight`
  // would be false for every variant — silently falling through to the
  // WALL_VARIANTS[0] fallback instead of the deterministic pick the rest
  // of this function promises. Fail loud instead: a manifest that can't
  // select anything is a data bug to fix, not something to paper over.
  if (variants.length === 0 || totalWeight <= 0) {
    throw new Error(
      `selectWallVariant: WALL_VARIANTS_BY_THEME.${theme} must be non-empty with a positive total weight`
    );
  }
  const hash = hashEdgeKey(edgeKey);
  let target = hash % totalWeight;
  for (const variant of variants) {
    if (target < variant.weight) return variant;
    target -= variant.weight;
  }
  // Unreachable given totalWeight > 0 (guarded above) and target <
  // totalWeight by construction (hash % totalWeight), but keeps the
  // return type total.
  return variants[0]!;
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
 * Build the map of hex-coordinate-key -> WallKind for every hex belonging to
 * ANY wall, decomposing multi-hex `Wall.from`/`Wall.to` spans via
 * getHexLine first. Shared by buildDungeonWallSegments (which needs each
 * hex's WallKind to tag its segments) and classifyWallVertices/
 * wallEndEdgeKeys (which only need wall-hex MEMBERSHIP, via `.has()`, to
 * classify the vertices/edges where a wall boundary meets open space) --
 * one source of truth for "what counts as a wall hex" so the segment
 * builder and the new corner/end classifiers can never disagree about it.
 */
export function collectWallHexes(walls: Wall[]): Map<string, WallKind> {
  const wallKindByHex = new Map<string, WallKind>();
  for (const wall of walls) {
    if (!wall.from || !wall.to) continue;
    const start: CubeCoord = { x: wall.from.x, y: wall.from.y, z: wall.from.z };
    const end: CubeCoord = { x: wall.to.x, y: wall.to.y, z: wall.to.z };
    const isDegenerate =
      start.x === end.x && start.y === end.y && start.z === end.z;
    const isDoor = isDoorWallKind(wall.kind);
    // Door walls (design doc §Q2): from/to is a DESIGNATED PASSAGE EDGE —
    // `to` names which single edge of the door cell to draw the frame on,
    // not a second blocked cell. Decomposing via getHexLine (like solid
    // walls below) would wrongly mark the passage neighbor — real floor in
    // the chamber on the other side of the door — as a wall hex too. Only
    // `from` (the door's own cell) blocks/renders. Degenerate from===to
    // door data (not real server shape, but tolerated) falls through to
    // the line-decompose path below unchanged.
    if (isDoor && !isDegenerate) {
      wallKindByHex.set(coordToKey(start), wall.kind);
      continue;
    }
    // Boundary-edge wall (Kirk's PR review, rpg-dnd5e-web#558 crypt spike):
    // a non-door Wall whose from/to are exactly one hex step apart is ONE
    // full-width slab on that specific edge, generalizing the door
    // real-edge case above to solid walls — `from` is real floor, NOT a
    // blocked cell, and is deliberately excluded from wall-hex membership
    // entirely (buildDungeonWallSegments' own boundary-edge branch is the
    // only source of its segment, and it never participates in corner/
    // end-cap fitting below — matches SyntyRoomDemo.tsx's reference
    // approach, which places one piece per room-boundary edge with no
    // separate corner pieces at all). A MULTI-step span (hexDistance > 1)
    // still means "decompose into a line of blocked cells" — the
    // pre-existing hypothetical-multi-hex-wall behavior (never observed in
    // real data, kept for API-contract generality, see this file's
    // top-of-file doc comment) is unchanged.
    if (!isDoor && !isDegenerate && hexDistance(start, end) === 1) continue;
    for (const hex of getHexLine(start, end)) {
      wallKindByHex.set(coordToKey(hex), wall.kind);
    }
  }
  return wallKindByHex;
}

/** Parse a "x,y,z" hex key (coordToKey's format) back into a CubeCoord. */
function parseHexKey(key: string): CubeCoord {
  const [x, y, z] = key.split(',').map(Number) as [number, number, number];
  return { x, y, z };
}

/** HEX_DIRECTIONS indices (0-5) of `hex`'s neighbors that are themselves
 * wall hexes -- shared by isStraightThroughHex and wallEndEdgeKeys, which
 * both need a wall hex's own wall-neighbor "degree" and directions. */
function wallNeighborDirIndices(
  hex: CubeCoord,
  wallKindByHex: Map<string, WallKind>
): number[] {
  const indices: number[] = [];
  for (let i = 0; i < HEX_DIRECTIONS.length; i++) {
    const dir = HEX_DIRECTIONS[i]!;
    const neighborKey = coordToKey({
      x: hex.x + dir.x,
      y: hex.y + dir.y,
      z: hex.z + dir.z,
    });
    if (wallKindByHex.has(neighborKey)) indices.push(i);
  }
  return indices;
}

/**
 * True when `hex` is a "straight-through" wall hex: exactly 2 wall
 * neighbors, in OPPOSITE directions (index difference of 3, i.e. the wall
 * run passes straight through with no direction change at this hex).
 *
 * QA finding (rpg-dnd5e-web#536 phase-2 review): the naive per-VERTEX 1-of-3/
 * 2-of-3 rule technically fires at every vertex along even a dead-straight
 * run, because hex-grid geometry means consecutive rendered edges are never
 * literally collinear at hex-edge granularity (see classifyWallVertices's
 * doc comment) -- every hex is its own small hexagonal drum, so a "straight"
 * corridor is a zigzag at the single-hex scale regardless. That's
 * geometrically true but reads as visual clutter to a human glancing at it
 * (corner fittings stacking up along entire straight boundaries, not just
 * at actual direction changes) -- the acceptance bar is aesthetic, not
 * hex-math purity. This hex-level (not vertex-level) gate distinguishes a
 * hex where the wall run genuinely changes direction (isolated, a true end,
 * a non-opposite-neighbor bend, or a 3+-way junction -- all still get
 * fittings) from one where it doesn't (opposite neighbors -- gets none).
 */
function isStraightThroughHex(
  hex: CubeCoord,
  wallKindByHex: Map<string, WallKind>
): boolean {
  const dirs = wallNeighborDirIndices(hex, wallKindByHex);
  // dirs is built by ascending index (0..5), so for exactly 2 entries
  // dirs[0] < dirs[1] always -- an opposite pair (index difference of 3,
  // the only possible offset since 0 <= dirs[0] <= 2 whenever a +3 partner
  // exists in range) is always exactly dirs[1] === dirs[0] + 3.
  return dirs.length === 2 && dirs[1] === dirs[0]! + 3;
}

/**
 * Build one edge-aligned segment per (wall hex, non-wall neighbor) pair
 * across the ENTIRE wall list — not per-Wall-object, since a hex's
 * neighbor might belong to a *different* Wall entry than the hex itself
 * (23 independent single-cell Wall objects collectively forming one room's
 * perimeter, in the real data this was verified against). Each wall hex
 * keeps the WallKind of whichever Wall object it came from.
 *
 * DOOR_CLOSED/DOOR_OPEN walls with a real (from!==to) passage edge are
 * handled FIRST and separately, one segment per door on its wire-designated
 * edge (carrying Wall.id) — not derived from neighbor-set membership, so a
 * door hex's own designated edge is used exactly as the wire says, and the
 * door hex is excluded from the generic loop below (its other edges are
 * legitimately open floor boundaries — home-chamber side and, once open,
 * the passage side — neither needs a wall piece). Degenerate from===to
 * door data isn't pre-claimed here, so it falls through to the generic loop
 * unchanged (matches this function's pre-Slice-2 behavior).
 *
 * Pure and independent of GLB loading so it's unit-testable directly.
 */
export function buildDungeonWallSegments(
  walls: Wall[],
  hexSize: number
): WallEdgeSegment[] {
  const wallKindByHex = collectWallHexes(walls);

  const segments: WallEdgeSegment[] = [];
  const seenEdgeKeys = new Set<string>();

  // Door walls with a real (from!==to) passage edge: render EXACTLY that
  // designated edge, carrying the door's id (Wall.id, rpg-api-protos#186)
  // for the click surface — not derived from neighbor-set membership like
  // solid walls below. This is also what fixes the web-confirmed "isolated
  // DOOR cell renders 6 door pairs" multiplicity bug (design doc §Q2):
  // exactly one segment per real door, on the wire-designated edge.
  // Degenerate from===to door data falls through untouched to the generic
  // per-neighbor-edge loop below (collectWallHexes already folded it into
  // wallKindByHex as a single-cell wall hex in that case).
  const directlyHandledHexKeys = new Set<string>();
  for (const wall of walls) {
    if (!wall.from || !wall.to) continue;
    if (!isDoorWallKind(wall.kind)) {
      continue;
    }
    const hex: CubeCoord = { x: wall.from.x, y: wall.from.y, z: wall.from.z };
    const neighbor: CubeCoord = { x: wall.to.x, y: wall.to.y, z: wall.to.z };
    const hexKey = coordToKey(hex);
    const neighborKey = coordToKey(neighbor);
    if (hexKey === neighborKey) continue; // degenerate: no designated edge

    directlyHandledHexKeys.add(hexKey);
    const edgeKey = `${hexKey}->${neighborKey}`;
    if (seenEdgeKeys.has(edgeKey)) continue;
    seenEdgeKeys.add(edgeKey);
    segments.push({
      key: edgeKey,
      edge: hexEdgeBetween(hex, neighbor, hexSize),
      kind: wall.kind,
      id: wall.id,
    });
  }

  // Boundary-edge walls (Kirk's PR review, rpg-dnd5e-web#558 crypt spike):
  // a non-door Wall whose from/to are exactly one hex step apart renders
  // ONE segment directly on that edge — collectWallHexes deliberately
  // excludes these from wall-hex membership (see its own doc comment), so
  // this loop is their only source; nothing else will emit them. A
  // multi-step span (hexDistance > 1) or a degenerate from===to wall falls
  // through untouched to the generic per-wall-hex loop below.
  for (const wall of walls) {
    if (!wall.from || !wall.to) continue;
    if (isDoorWallKind(wall.kind)) {
      continue; // handled above
    }
    const hex: CubeCoord = { x: wall.from.x, y: wall.from.y, z: wall.from.z };
    const neighbor: CubeCoord = { x: wall.to.x, y: wall.to.y, z: wall.to.z };
    const hexKey = coordToKey(hex);
    const neighborKey = coordToKey(neighbor);
    if (hexKey === neighborKey) continue; // degenerate: single-cell block, generic loop below
    if (hexDistance(hex, neighbor) !== 1) continue; // multi-hex line, generic loop below

    const edgeKey = `${hexKey}->${neighborKey}`;
    if (seenEdgeKeys.has(edgeKey)) continue;
    seenEdgeKeys.add(edgeKey);
    segments.push({
      key: edgeKey,
      edge: hexEdgeBetween(hex, neighbor, hexSize),
      kind: wall.kind,
    });
  }

  for (const [hexKey, kind] of wallKindByHex) {
    if (directlyHandledHexKeys.has(hexKey)) continue;
    const hex = parseHexKey(hexKey);
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

/**
 * Corner/vertex fittings (rpg-dnd5e-web#536 phase 2), sourced from
 * rpg-game-assets#2's `roles.fittings.variants` (manifest.json). Unlike
 * WALL_VARIANTS (`fit: "edge"`, long-and-thin, squeezed to span exactly one
 * hex edge), these are tagged `fit: "context"` -- chunky, roughly-cubic
 * pieces meant to sit at a single POINT (a shared hex vertex, or an edge
 * midpoint for `wall-end`) rather than stretch across a span.
 *
 * `rawWidth`/`rawDepth` (measured directly off each GLB's own bounding box,
 * matching WALL_VARIANTS' convention) are needed IN ADDITION to `rawHeight`
 * -- see fittingScale's QA-correction comment for why a flat SYNTY_SCALE on
 * X/Z (this phase's original approach) was wrong.
 */
export type FittingKind =
  | 'wall-corner-outer'
  | 'wall-corner-inner'
  | 'wall-end';

export interface FittingVariant {
  kind: FittingKind;
  file: string;
  rawWidth: number;
  rawDepth: number;
  rawHeight: number;
}

/**
 * Round-2 W3/W4 course correction: the original 3 files this map pointed
 * to (`SM_Env_Wall_End_Coner_Outer_01`/`_Coner_Inner_01`/`_End_01`) were
 * first suspected as a conversion defect (isolated-GLB render showed a
 * "stacked wafer" look), then confirmed by a deeper asset-side
 * investigation to be structurally clean, correctly-shaped tall narrow
 * corner POSTS with faceted brick relief — the wafer look is the wall
 * role's own fit squash (~6x Y-compression to reach WALL_HEIGHT from a
 * ~5m raw post), which panel-shaped pieces tolerate but post-shaped
 * relief does not survive visually. Verdict recorded in rpg-game-assets'
 * env-role-map fittings notes (PR #33, merged): don't map post-shaped
 * pieces to wall roles. No re-conversion is coming for this family —
 * dropped from every role here, permanently (not an interim fix).
 * `SM_Env_Wall_Quarter_01` (a WALL_VARIANTS-family
 * panel, already verified clean — see rpg-dnd5e-web#607/#608's isolation
 * evidence) is the replacement for all 3 kinds: same "context fit"
 * placement (single point, footprint centered) as before, just a
 * different source file and its own measured raw dimensions —
 * `FITTING_FOOTPRINT_SCALE` below is retuned to match, since Quarter's
 * rawWidth/rawDepth are a different order of magnitude than the dropped
 * family's.
 */
const FITTING_SUBSTITUTE_FILE = 'SM_Env_Wall_Quarter_01.glb';
const FITTING_SUBSTITUTE_RAW_WIDTH = 2.7245;
const FITTING_SUBSTITUTE_RAW_DEPTH = 0.4221;
const FITTING_SUBSTITUTE_RAW_HEIGHT = 2.7068;

export const FITTINGS: Record<FittingKind, FittingVariant> = {
  'wall-corner-outer': {
    kind: 'wall-corner-outer',
    file: FITTING_SUBSTITUTE_FILE,
    rawWidth: FITTING_SUBSTITUTE_RAW_WIDTH,
    rawDepth: FITTING_SUBSTITUTE_RAW_DEPTH,
    rawHeight: FITTING_SUBSTITUTE_RAW_HEIGHT,
  },
  'wall-corner-inner': {
    kind: 'wall-corner-inner',
    file: FITTING_SUBSTITUTE_FILE,
    rawWidth: FITTING_SUBSTITUTE_RAW_WIDTH,
    rawDepth: FITTING_SUBSTITUTE_RAW_DEPTH,
    rawHeight: FITTING_SUBSTITUTE_RAW_HEIGHT,
  },
  'wall-end': {
    kind: 'wall-end',
    file: FITTING_SUBSTITUTE_FILE,
    rawWidth: FITTING_SUBSTITUTE_RAW_WIDTH,
    rawDepth: FITTING_SUBSTITUTE_RAW_DEPTH,
    rawHeight: FITTING_SUBSTITUTE_RAW_HEIGHT,
  },
};

/**
 * QA correction (rpg-dnd5e-web#536 phase-2 review): the original
 * `fittingScale` used a flat `SYNTY_SCALE` (0.75) on X/Z, reasoning that
 * "context fit" just meant "don't edge-squeeze like WALL_VARIANTS." That
 * left the footprint far too big relative to the actual wall thickness it
 * sits against -- measured directly off the GLBs (`bbox_glb.py` against
 * `rpg-game-assets/harness/models/synty/env/`): `SM_Env_Wall_Half_01`'s raw
 * depth is 0.4357, which at the wall's own SYNTY_SCALE renders to ~0.327
 * world units of actual wall thickness -- the "slim post/cap" target every
 * fitting's own footprint aims to match, not dwarf.
 *
 * Round-2 W3/W4 update: all 3 `FITTINGS` entries now share ONE substitute
 * file (`FITTING_SUBSTITUTE_FILE`, see FITTINGS' own doc comment for why)
 * with rawWidth ~2.72 -- a different order of magnitude than the original
 * broken family's ~0.83-1.1 raw footprint this constant was originally
 * tuned against. Retuned so `rawWidth * FITTING_FOOTPRINT_SCALE` still
 * lands at that same ~0.33 target (2.7245 * 0.121 ~= 0.33).
 */
const FITTING_FOOTPRINT_SCALE = 0.121;

/**
 * "Context" fit scale for a fitting: X/Z use each variant's own raw
 * width/depth at `FITTING_FOOTPRINT_SCALE` (see above -- NOT the shared
 * `SYNTY_SCALE` used for characters/doors/wall-variant thickness, which
 * rendered these fittings far too chunky), footprint centered on the
 * vertex/edge-midpoint it's placed at; height is clamped to the game's
 * wall height, same as every other wall piece.
 */
export function fittingScale(
  variant: FittingVariant,
  wallHeight: number
): [number, number, number] {
  return [
    variant.rawWidth * FITTING_FOOTPRINT_SCALE,
    wallHeight / variant.rawHeight,
    variant.rawDepth * FITTING_FOOTPRINT_SCALE,
  ];
}

export interface VertexFitting {
  /** Order-independent identity for the vertex (the 3 touching hex keys,
   * sorted and joined) -- stable across which of the (up to 3) wall hexes
   * touching it the classifier happened to visit first, and stable across
   * renders/reconnects like WallEdgeSegment.key. */
  key: string;
  kind: Extract<FittingKind, 'wall-corner-outer' | 'wall-corner-inner'>;
  position: WorldPos;
  rotationY: number;
}

/**
 * Classify every hex-grid vertex touched by at least one wall hex (rpg-
 * dnd5e-web#536 phase 2 -- diagnosis's "RECOMMENDED FIX DESIGN").
 *
 * Every interior hex-grid vertex is shared by exactly 3 hexes. For a given
 * wall hex H and corner index i (hexCorners' angle = 30+60*i), the corner-
 * angle-bisects-between-neighbor-directions geometry means corner i is the
 * vertex shared by exactly {H, H+HEX_DIRECTIONS[i], H+HEX_DIRECTIONS[i+1]}
 * -- so iterating every wall hex's 6 corners visits every vertex that
 * touches at least one wall hex (a vertex touching ZERO wall hexes is by
 * definition not on any wall boundary and never needs classifying, so it's
 * fine that this traversal can't reach it).
 *
 * Classification counts how many of those 3 hexes are wall hexes:
 * - 1 of 3 -> convex/"outer" corner: the wall hex's own two edges meeting
 *   here both face open space and turn by the hex's 120-degree interior
 *   angle. `wall-corner-outer`, rotated away from the wall hex's own
 *   center through the vertex (reusing hexEdgeBetween's atan2(-dz, dx)
 *   convention).
 * - 2 of 3 -> concave/"inner" corner (open floor notching between two wall
 *   hexes). `wall-corner-inner`, rotated toward the single open hex.
 * - 3 of 3 -> fully buried inside a solid mass; no boundary passes through
 *   this vertex, skip. (0 of 3 is structurally unreachable here: this
 *   traversal only ever visits a corner of a hex already known to be a
 *   wall hex, so that hex itself always counts toward the 3 -- kept as an
 *   explicit disjunction with 3 below for clarity against the diagnosis's
 *   "0 or 3, skip" wording, not because 0 can actually occur.)
 *
 * A vertex only gets a fitting if at least one of its 1-2 wall hexes is
 * NOT a "straight-through" hex (`isStraightThroughHex`) -- i.e. is
 * isolated, a true end, a genuine (non-opposite-neighbor) bend, or a 3+-way
 * junction. This is a QA correction (rpg-dnd5e-web#536 phase-2 review) to
 * the diagnosis's original per-vertex-only rule: literally every vertex
 * along even a dead-straight run technically has a "1 of 3" or "2 of 3"
 * touching-hex count (hex-grid corners are never collinear at single-hex
 * granularity -- see below), so the unqualified rule placed a fitting at
 * EVERY vertex of EVERY wall hex, including hexes with no direction change
 * at all. That's geometrically defensible but reads as cluttered
 * "stacked slabs" along entire straight boundaries to a human glancing at
 * it, not just at actual turns -- this gate is what makes "only at
 * direction changes" true at the scale a player actually perceives, not
 * just at hex-edge granularity. A run's straight interior hexes (both
 * their own tip vertices AND the vertices they share with another
 * straight-through neighbor) now contribute nothing; only the transition
 * into/out of a genuine end/bend/junction still does, via that qualifying
 * hex.
 *
 * A "straight continuation" (two collinear wall edges meeting at ~180
 * degrees) needs no special exemption at the PER-EDGE-ANGLE level, per the
 * diagnosis -- and indeed this never arises structurally: the two
 * directions meeting at any given corner (i and i+1) are always exactly 60
 * degrees apart by construction of the hex-corner geometry, never 180.
 * Every vertex a wall boundary passes through is technically a genuine
 * small turn at that granularity -- which is exactly why the hex-level
 * straight-through gate above (a different, coarser notion of "collinear")
 * is needed to match human-perceived straightness.
 *
 * Pure and independent of GLB loading so it's unit-testable directly.
 */
export function classifyWallVertices(
  walls: Wall[],
  hexSize: number
): VertexFitting[] {
  const wallKindByHex = collectWallHexes(walls);
  const straightThroughHexes = new Set(
    Array.from(wallKindByHex.keys()).filter((key) =>
      isStraightThroughHex(parseHexKey(key), wallKindByHex)
    )
  );
  const fittings: VertexFitting[] = [];
  const seenVertexKeys = new Set<string>();

  for (const hexKey of wallKindByHex.keys()) {
    // Round-2 W3/W4 finding (Kirk's live walk: the door-hex "6 mitered
    // corners" decoration this loop places around every ISOLATED wall
    // hex is exactly what turned every door into a stack of wafer-thin
    // cards once the corner-fitting family got remapped to a panel
    // piece — still clutter, just a different visual defect). A door's
    // own cell is a wall hex purely so segment-building/corner
    // classification know it blocks a boundary edge (collectWallHexes'
    // own doc comment); it is NOT meant to read as a decorated corner
    // post — the door frame mesh (rendered separately, see
    // isDoorWallKind's other call site in this file) and the connector
    // wall runs either side of it already own that visual space.
    // Decision: an isolated door hex gets NO corner fittings at all —
    // deleted, not restyled. A non-door wall hex's own vertices are
    // unaffected (this only skips a hex whose OWN kind is a door).
    if (isDoorWallKind(wallKindByHex.get(hexKey)!)) continue;

    const hex = parseHexKey(hexKey);
    const hexCenter = cubeToWorld(hex, hexSize);
    const corners = hexCorners(hexCenter, hexSize);

    for (let i = 0; i < HEX_DIRECTIONS.length; i++) {
      const dirA = HEX_DIRECTIONS[i]!;
      const dirB = HEX_DIRECTIONS[(i + 1) % HEX_DIRECTIONS.length]!;
      const neighborAKey = coordToKey({
        x: hex.x + dirA.x,
        y: hex.y + dirA.y,
        z: hex.z + dirA.z,
      });
      const neighborBKey = coordToKey({
        x: hex.x + dirB.x,
        y: hex.y + dirB.y,
        z: hex.z + dirB.z,
      });

      const touchingKeys = [hexKey, neighborAKey, neighborBKey];
      const vertexKey = [...touchingKeys].sort().join('|');
      if (seenVertexKeys.has(vertexKey)) continue;
      seenVertexKeys.add(vertexKey);

      const wallTouchingKeys = touchingKeys.filter((k) => wallKindByHex.has(k));
      if (wallTouchingKeys.length >= 3) continue; // fully enclosed, no boundary here

      // Skip if EVERY wall hex touching this vertex is straight-through --
      // no genuine direction change passes through this vertex.
      if (wallTouchingKeys.every((k) => straightThroughHexes.has(k))) {
        continue;
      }

      const position = corners[i]!;

      if (wallTouchingKeys.length === 1) {
        const rotationY = Math.atan2(
          -(position.z - hexCenter.z),
          position.x - hexCenter.x
        );
        fittings.push({
          key: vertexKey,
          kind: 'wall-corner-outer',
          position,
          rotationY,
        });
      } else {
        // Exactly 2 of 3 -- find the single OPEN hex among the three to
        // rotate toward.
        const openKey = touchingKeys.find((k) => !wallKindByHex.has(k));
        if (!openKey) continue; // unreachable (length === 2 guarantees one open key)
        const openCenter = cubeToWorld(parseHexKey(openKey), hexSize);
        const rotationY = Math.atan2(
          -(position.z - openCenter.z),
          position.x - openCenter.x
        );
        fittings.push({
          key: vertexKey,
          kind: 'wall-corner-inner',
          position,
          rotationY,
        });
      }
    }
  }

  return fittings;
}

/**
 * Identify which wall edge segments (WallEdgeSegment.key, same format
 * produced by buildDungeonWallSegments) terminate a wall run and should
 * render `wall-end` instead of a normal plain/broken/alcove variant.
 *
 * A wall hex is a true run terminus only when it has EXACTLY ONE wall
 * neighbor -- a degree-0 (isolated) hex is fully handled by
 * classifyWallVertices alone (all 6 of its corners are "1 of 3" outer
 * corners, per the diagnosis: "capping every vertex of an isolated hex...
 * turns a lone wall hex into a small hex kiosk with 6 mitered corners",
 * which is defect #2's fix); a degree-2+ hex is a through-hex or junction,
 * already handled by corner classification at its vertices. Only degree-1
 * has a genuine open "far side" that needs an explicit end cap: the edge
 * facing directly away from its one wall neighbor (opposite direction,
 * `(dir + 3) % 6`) -- e.g. a 2-hex stub gets a wall-end on each hex's own
 * far side, capping both open ends.
 *
 * Returns edge keys (not positions) so SyntyHexWall can swap the piece for
 * an already-built WallEdgeSegment (same hex/neighbor pair, same
 * hexEdgeBetween result) rather than recomputing geometry.
 *
 * Pure and independent of GLB loading so it's unit-testable directly.
 */
export function wallEndEdgeKeys(walls: Wall[]): Set<string> {
  const wallKindByHex = collectWallHexes(walls);
  const endKeys = new Set<string>();

  for (const hexKey of wallKindByHex.keys()) {
    const hex = parseHexKey(hexKey);
    const dirs = wallNeighborDirIndices(hex, wallKindByHex);
    if (dirs.length !== 1) continue; // not a true terminus

    const farDir = HEX_DIRECTIONS[(dirs[0]! + 3) % HEX_DIRECTIONS.length]!;
    const farNeighborKey = coordToKey({
      x: hex.x + farDir.x,
      y: hex.y + farDir.y,
      z: hex.z + farDir.z,
    });
    endKeys.add(`${hexKey}->${farNeighborKey}`);
  }

  return endKeys;
}

/**
 * Facing rotationY for a wall-mounted DECOR prop (rpg-game-assets#36
 * wave-1, issue #623 increment 5 — wall-banner) placed at `hex`, an open
 * floor cell adjacent to a wall, not a wall hex itself.
 *
 * Reuses `hexEdgeBetween`'s existing "line a piece's local +X (width
 * axis) up with a hex edge" rotation exactly as SyntyHexWall's own wall/
 * door pieces already do (see that function's/buildDungeonWallSegments'
 * own doc comments) — a wall-mounted banner hangs flush against the SAME
 * edge a real wall piece there would occupy, wide face parallel to the
 * wall, so it needs the identical alignment, not a new formula.
 *
 * TWO distinct wall shapes to check, matching buildDungeonWallSegments'
 * own two branches (bug found live, issue #623 fast-follow — Kirk's
 * gallery walk showed no banner on the room's outer wall at all):
 *
 * 1. Boundary-edge walls (a non-door Wall whose `from`/`to` are exactly
 *    one hex step apart — the shape a ROOM'S OUTER PERIMETER wall
 *    actually has on the wire). `collectWallHexes` deliberately EXCLUDES
 *    these from its wall-hex set (`from` is real floor there, not a
 *    blocked cell — see that function's own doc comment), so the
 *    degenerate-wall-hex check below can never find a room's own
 *    boundary wall — exactly the bug: a banner placed against the
 *    room's actual outer wall got rotationY=0 every time, because
 *    nothing was ever found. Checked FIRST since a boundary-edge wall is
 *    the common case for "decor mounted on the room's own wall." Uses
 *    the identical `hexEdgeBetween(wall.from, wall.to, hexSize)` call
 *    buildDungeonWallSegments' boundary-edge branch renders that exact
 *    segment with — same edge, same rotation, by construction.
 * 2. Degenerate/multi-cell wall hexes (an actual BLOCKED cell, e.g. an
 *    interior pillar-shaped obstacle) — `hex`'s HEX_DIRECTIONS neighbors
 *    checked against `collectWallHexes`' wall-hex set, same as before.
 *    When `hex` has more than one such wall neighbor (a corner nook),
 *    the first found (HEX_DIRECTIONS order) wins — arbitrary but stable,
 *    same convention resolvePropVariant's own "first variant" doc
 *    comment uses for a comparable "no smarter selection yet" case.
 *
 * Returns `undefined` when neither shape matches (a wall-banner authored
 * away from any wall entirely — unusual content, not a crash) so callers
 * fall back to the existing rotationY=0 default, never a broken/
 * undefined-driven rotation. ALSO returns `undefined` up front if `hex`
 * itself is already a wall hex (Copilot review, PR #625) — the doc
 * comment above says a decor prop sits on open floor, but the
 * implementation didn't enforce that; a prop somehow authored ON a
 * blocked cell now cleanly opts out instead of computing a rotation
 * toward one of ITS OWN neighboring wall hexes, which would have been a
 * confusing orientation for content that's already invalid (a decor prop
 * can't really occupy a blocked cell).
 *
 * `wallKindByHex` (Copilot review, PR #625): optional precomputed
 * `collectWallHexes(walls)` result. Every real caller today
 * (`HexGrid.tsx`'s `wallAdjacentRotations`) calls this once per
 * WALL_ADJACENT_PROP_KEYS entity, and rebuilding the wall-hex map fresh
 * inside each call made that O(entities * walls) instead of O(walls +
 * entities) — pass the map built once by the caller to keep it linear.
 * Defaults to a fresh `collectWallHexes(walls)` so every existing/test
 * caller that doesn't have one handy still works unchanged.
 */
export function computeWallAdjacentRotationY(
  hex: CubeCoord,
  walls: Wall[],
  hexSize: number,
  wallKindByHex: ReadonlyMap<string, WallKind> = collectWallHexes(walls)
): number | undefined {
  if (wallKindByHex.has(coordToKey(hex))) return undefined;

  for (const wall of walls) {
    if (!wall.from || !wall.to) continue;
    if (isDoorWallKind(wall.kind)) continue;
    const from: CubeCoord = { x: wall.from.x, y: wall.from.y, z: wall.from.z };
    if (from.x !== hex.x || from.y !== hex.y || from.z !== hex.z) continue;
    const to: CubeCoord = { x: wall.to.x, y: wall.to.y, z: wall.to.z };
    if (from.x === to.x && from.y === to.y && from.z === to.z) continue; // degenerate, not this branch
    if (hexDistance(from, to) !== 1) continue; // multi-hex span, not this branch
    return hexEdgeBetween(from, to, hexSize).rotationY;
  }

  for (const dir of HEX_DIRECTIONS) {
    const neighbor: CubeCoord = {
      x: hex.x + dir.x,
      y: hex.y + dir.y,
      z: hex.z + dir.z,
    };
    if (!wallKindByHex.has(coordToKey(neighbor))) continue;
    return hexEdgeBetween(neighbor, hex, hexSize).rotationY;
  }
  return undefined;
}
