/**
 * dungeonYaml — the CST-preserving YAML layer for the dungeon-builder
 * concept (rpg-project#170 design gate, board 19 "The Dungeon").
 *
 * This is the "delta" data the concept's fixture-first convention calls
 * for (`docs/how-to/concepts-route.md`): dungeonspec YAML has no proto
 * representation on the wire at all — `PutDungeonRequest.yaml` is just a
 * string — so everything here is this concept's own type, not a generated
 * one. `DungeonDoc`/`RoomDoc`/`PlacementDoc` below are that separated type.
 *
 * Uses the real `yaml` npm package's `Document` CST API per the original
 * concept brief's explicit requirement ("hard requirement: comment-preserving round-trip
 * ... Use a CST-round-trip YAML parser") — this module does NOT hand-roll
 * a parser. `parseDungeonDoc`/`mutateDoc` operate on the live `Document`
 * object (kept in caller state) so edits preserve comments and formatting
 * as `yaml`'s own AST does, rather than this module re-serializing from a
 * plain object.
 *
 * Known residual round-trip gap (see CONTRACT.md for the full writeup):
 * `doc.toString({ lineWidth: 0 })` preserves showcase.yaml's flow-style
 * `{ ref: ..., at: [...] }` entries byte-for-byte on a no-op round trip,
 * but stringifies flow sequences with internal padding (`[ 1, 1 ]`) where
 * the source file has none (`[1, 1]`) — a single-space cosmetic diff, on
 * every flow entry, the moment the file passes through this module. No
 * single top-level `yaml` stringify option reconciles padded-brace/
 * unpadded-bracket styling at once; a production implementation would need
 * a custom per-node stringifier to close this last gap.
 */
import { HEX_FACING_LABELS } from '@/components/hex-grid/authorGridHelpers';
import {
  Document,
  isMap,
  isSeq,
  parseDocument,
  Scalar,
  YAMLMap,
  YAMLSeq,
} from 'yaml';
import type { DialectField, ServerCapabilities } from './capabilityProbe';
import {
  canonicalCorner,
  cornerPoint,
  migrateLegacyCenterEndpoint,
  type CornerRef,
} from './creation/hexCorner';
import {
  cellCenter,
  hexColumn,
  hexRow,
  worldToCube,
  type CellPos,
} from './hexLayout';
import {
  cellsAdjacent,
  cellsAreContiguous,
  cellsEqual,
  pickAttachmentEdge,
  sharedBoundaryEdges,
  type Cell,
} from './regionGeometry';
import { OVERLAP_SAMPLE_CELLS } from './regionTree';

function parseFacing(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const idx = (HEX_FACING_LABELS as readonly string[]).indexOf(raw);
  return idx === -1 ? null : idx;
}

function facingLabel(facing: number): string {
  return HEX_FACING_LABELS[((facing % 6) + 6) % 6];
}

function parseMount(raw: unknown): Mount {
  return raw === 'wall' ? 'wall' : 'floor';
}

/** Resolves a `wallLines[].from`/`.to` raw value (either shape) to a
 * board-space point, purely to give a legacy endpoint's migration a
 * direction to point toward — see `parseWallLineEndpoint` below. */
function resolveWallLineEndpointHintPoint(raw: unknown): CellPos {
  if (Array.isArray(raw)) {
    return cellCenter(raw[0] as number, raw[1] as number);
  }
  const obj = raw as Record<string, unknown>;
  const cell = obj.cell as [number, number];
  const corner = typeof obj.corner === 'number' ? obj.corner : 0;
  return cornerPoint({ cell, corner });
}

/**
 * Parses one `wallLines[].from`/`.to` endpoint. Accepts either shape:
 *
 * - **Current, corner-anchored**: `{ cell: [c, r], corner: 0..5 }` —
 *   canonicalized on parse (`canonicalCorner`) so the same physical
 *   corner always round-trips identically regardless of which of its
 *   (up to 3) equally-valid owner cells the document happens to use.
 * - **Legacy, PRE-corner-anchoring**: a bare `[c, r]` cell — the
 *   original rpg-project#169 "straight walls with visible footprint"
 *   unit's own shape, before Kirk's "it always hangs over a little"
 *   feedback drove the corner-anchoring follow-up. Self-heals at the
 *   `DungeonDoc` level: `migrateLegacyCenterEndpoint` picks whichever of
 *   the cell's own 6 corners sits nearest the OTHER endpoint's resolved
 *   position, so the migrated line keeps pointing the same direction it
 *   always drew rather than snapping to an arbitrary corner — every
 *   consumer of the PARSED doc (footprint/crossing math, rendering)
 *   only ever sees the corner-anchored shape, immediately, regardless of
 *   which shape the source YAML used.
 *
 *   **This heals the in-memory `doc`, not the underlying CST/YAML text
 *   by itself.** Consistent with this file's own CST-preservation
 *   discipline (content nothing has explicitly mutated is never silently
 *   rewritten — see this file's top-of-file doc comment on comment
 *   preservation), a legacy entry's CST node keeps its original bare-
 *   `[c,r]` text until some MUTATOR actually touches that entry
 *   (`setWallLineEndpoint`, `toggleWallLineDoorAt`) — at which point the
 *   CST is rewritten to the corner-anchored shape as a side effect of
 *   that write, same as any other mutator's own node replacement. A
 *   migrated document that's loaded and re-saved with zero edits to its
 *   `wallLines:` keeps its original (still valid, still correctly
 *   interpreted) legacy text; one the author actually drags an endpoint
 *   or adds a door on converges to the new shape. See TARGET-YAML.md's
 *   "Straight walls: corner anchoring" section for the full writeup —
 *   given how little `wallLines:` content existed anywhere at the time
 *   of this change, this migration was judged cheaper and more honest
 *   than carrying two live representations through every downstream
 *   consumer indefinitely.
 */
function parseWallLineEndpoint(raw: unknown, otherRaw: unknown): CornerRef {
  if (Array.isArray(raw)) {
    const cell = [raw[0] as number, raw[1] as number] as [number, number];
    const hint = resolveWallLineEndpointHintPoint(otherRaw);
    return migrateLegacyCenterEndpoint(cell, hint);
  }
  const obj = raw as Record<string, unknown>;
  const cell = obj.cell as [number, number];
  const corner = typeof obj.corner === 'number' ? obj.corner : 0;
  return canonicalCorner({ cell, corner });
}

/**
 * Parses `wallLines[].doors:` — plus its own legacy migration: a
 * PRE-doors-model whole-line `kind: door` (the original unit's shape,
 * where an entire straight wall segment was cosmetically re-colored as
 * "a door" with no real carved opening — Kirk's own diagnosis this unit
 * exists to fix: "the gashes are walls... I cannot set a wall or a
 * door") materializes into a single door at the cell nearest the line's
 * own MIDPOINT — the closest a single-opening model can come to
 * preserving "this line has a door" intent.
 *
 * Deliberately a simpler approximation than the real Door tool's own
 * `straightWallGeometry.ts`-based cell resolution (which finds the exact
 * footprint cell a parametric position falls inside, honoring the true
 * Cyrus-Beck clip): that module transitively imports `boardGeometry.ts`,
 * which imports THIS file (`resolvePlacement`/`DungeonDoc`) — reusing it
 * here would create a `dungeonYaml.ts -> straightWallGeometry.ts ->
 * boardGeometry.ts -> dungeonYaml.ts` import cycle, hit directly while
 * building this (a "Cannot access ... before initialization" crash
 * under Vite's ESM interop), not theorized. "Nearest cell to the line's
 * literal midpoint" is a fine substitute for a one-time, rare legacy
 * migration path — it isn't the live Door tool's own placement math,
 * which stays exact. See TARGET-YAML.md's "Straight walls: doors"
 * section.
 */
function parseWallLineDoors(
  raw: unknown,
  from: CornerRef,
  to: CornerRef,
  legacyKind: unknown
): WallLineDoorDoc[] {
  if (Array.isArray(raw)) {
    const doors: WallLineDoorDoc[] = [];
    for (const d of raw as Record<string, unknown>[]) {
      if (Array.isArray(d.cell)) {
        doors.push({ cell: [d.cell[0] as number, d.cell[1] as number] });
      }
    }
    return doors;
  }
  if (legacyKind === 'door') {
    const a = cornerPoint(from);
    const b = cornerPoint(to);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const cube = worldToCube(mid);
    return [{ cell: [hexColumn(cube), hexRow(cube)] }];
  }
  return [];
}

function parseHeight(raw: unknown): number | null {
  return typeof raw === 'number' ? raw : null;
}

function parseRotationDegrees(raw: unknown): number | null {
  return typeof raw === 'number' ? raw : null;
}

function parseTargeting(raw: unknown): string | null {
  return typeof raw === 'string' ? raw : null;
}

/** Shared by both `place:` sites — room-scoped (`rooms[].place`, real
 * dungeonspec, room-LOCAL `at`) and top-level (`place:`, target dialect,
 * proposed, absolute `at` — see TARGET-YAML.md's "top-level placement"
 * section).
 * Same fields either way; only what `at` is relative to differs, and
 * that's the caller's concern, not the parser's. */
function parsePlacementList(raw: unknown, context: string): PlacementDoc[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map((p, pi) => {
    if (typeof p.ref !== 'string' || !Array.isArray(p.at)) {
      throw new DungeonParseError(`${context}[${pi}] missing ref/at`);
    }
    return {
      ref: p.ref,
      at: [p.at[0] as number, p.at[1] as number] as [number, number],
      blocksMovement: p.blocks_movement === true,
      blocksLos: p.blocks_los === true,
      isMonster: p.ref.startsWith('dnd5e:monsters:'),
      facing: parseFacing(p.facing),
      mount: parseMount(p.mount),
      height: parseHeight(p.height),
      rotationDegrees: parseRotationDegrees(p.rotate_degrees),
      targeting: parseTargeting(p.targeting),
      explicit: {
        blocksMovement: p.blocks_movement !== undefined,
        blocksLos: p.blocks_los !== undefined,
        height: p.height !== undefined,
        facing: p.facing !== undefined,
        targeting: p.targeting !== undefined,
      },
    };
  });
}

/** target dialect, proposed — see TARGET-YAML.md's "z-axis: mount + height" section.
 * `'floor'` (the default — every placement before this field existed)
 * means "unchanged, stands on the floor"; `'wall'` means this placement
 * hangs on the wall at its cell's `facing` edge, `heightMeters` above
 * the floor. Not compiled server-side. */
export type Mount = 'floor' | 'wall';

export interface PlacementDoc {
  ref: string;
  at: [number, number];
  blocksMovement: boolean;
  blocksLos: boolean;
  /** True for `dnd5e:monsters:*` refs — dungeonspec.Validate rejects
   * blocks_movement/blocks_los on monster placements (real, verified:
   * see `fixtures.ts`'s `MONSTER_PLACE_CHECK` evidence), so the board
   * gates those controls by ref type. */
  isMonster: boolean;
  /** target dialect, proposed — see TARGET-YAML.md's "place:/boss: facing" section.
   * `null` = unset. Not compiled server-side; stripped by
   * `stripToV1Subset` before any real PutDungeon call. */
  facing: number | null;
  /** target dialect, proposed — see `Mount`'s doc comment. `'floor'` when the YAML
   * has no `mount:` key (the pre-existing, only-ever-possible state). */
  mount: Mount;
  /** target dialect, proposed — meters above the floor. DECOUPLED from
   * `mount` (Kirk-batch, 2026-08-02 — see `setPlacementHeight`'s own doc
   * comment): meaningful for ANY placement, not gated on `mount ===
   * 'wall'` — a `mount: wall` prop typically carries it (how far up the
   * wall), but so can a floor-standing one, authoring a floating prop
   * (a candle, `blocks_movement: false`) independent of wall-mounting.
   * `null` when unset — the common case, and every placement's vertical
   * position before this field existed at all. */
  height: number | null;
  /** EXPERIMENT, not even a target-dialect proposal yet — a fine rotation
   * ADJUSTMENT in degrees (±30°), ADDED on top of the coarse 6-direction
   * `facing`-derived rotation, never a replacement for `facing` itself.
   * Originally scoped to `mount: 'wall'` placements only (Kirk's
   * 2026-08-02 "3D editing" arc, part 2 follow-up, testing whether
   * 6-direction facing alone is coarse enough for a wall-mounted prop —
   * TARGET-YAML.md's now-resolved open question). GENERALIZED to any
   * non-monster placement, floor-standing included (2026-08-03, Kirk:
   * "we lost the ability to... adjust it the 30 [degrees] so on some
   * hexes it can be flush with the wall") — the pointy-top interleave
   * between neighbor/facing directions and edge orientations
   * (`boardGeometry.ts`'s `computeFlushRotation` doc comment has the full
   * geometry) means the 6-direction `facing` enum can never sit a
   * FLOOR-standing prop edge-parallel against an adjacent wall either,
   * not just a wall-mounted one — this field was never actually a
   * wall-mount-specific concept, just built and gated as one first.
   * Meaningless without a `facing` set (there's no base angle to nudge);
   * the Inspector disables the control in that state rather than letting
   * it silently no-op. `null` when unset (every placement before this
   * field existed). Not compiled server-side; stripped by
   * `stripToV1Subset` before any real save, same as every other
   * target-dialect field. */
  rotationDegrees: number | null;
  /** target dialect, proposed — see TARGET-YAML.md's "Monster targeting" section. A
   * REFERENCE to a toolkit AI strategy key, e.g. `"lowest-health"` —
   * never behavior (Boundary Rule). Only meaningful when `isMonster`;
   * `null` when unset. Not compiled server-side. */
  targeting: string | null;
  /** Which of the fields above were actually present as a literal key on
   * THIS placement, as parsed straight from the raw YAML — as opposed to
   * absent and (as of the `defaults:` map, target dialect, proposed —
   * see `DungeonDoc.defaults`'s own doc comment) potentially INHERITED
   * from the placement's `ref`. `blocksMovement`/`blocksLos`/`height`/
   * `facing`/`targeting` above are always populated with a concrete
   * fallback (`false`/`null`) when absent, same as before `defaults:`
   * existed — this field is what lets `resolvePlacement` (below) tell
   * "explicitly false/absent" apart from "inheriting a default," which
   * the fallback-carrying fields alone cannot. `mount` has no entry here
   * — it is deliberately not defaultable, see `DungeonDoc.defaults`'s own
   * doc comment for why. */
  explicit: {
    blocksMovement: boolean;
    blocksLos: boolean;
    height: boolean;
    facing: boolean;
    targeting: boolean;
  };
}

export interface BossDoc {
  ref: string;
  at: [number, number];
  /** target dialect, proposed — see `PlacementDoc.facing`. */
  facing: number | null;
  /** target dialect, proposed — see `PlacementDoc.targeting`. A boss is always a
   * monster, so this is unconditional (no `isMonster` gate needed). */
  targeting: string | null;
}

export interface ObstacleDoc {
  ref: string;
  count: number;
}

export interface RoomDoc {
  id: string;
  archetype: string;
  width: number;
  place: PlacementDoc[];
  boss: BossDoc | null;
  /** Count-based, rolled at a seed — no [col,row] until a seed rolls them,
   * so they never appear on the board itself. Unexercised by showcase.yaml
   * (it has none) — see CONTRACT.md's "rolled content panel is untested
   * against real data" finding. */
  obstacles: ObstacleDoc[];
}

export interface LockedDoc {
  dc: number;
  ability: string;
}

/** A connector's `from`/`to` are NOT independently authorable — verified
 * against the real `dungeonspec.Validate` (rpg-toolkit
 * encounter/dungeonspec/validate.go's `validateChain`): a spec must have
 * exactly `len(rooms)-1` connectors, and connector `i` must join
 * `rooms[i]` to `rooms[i+1]`, always, no exceptions. `locked` (present or
 * absent, and its `dc`/`ability` when present) is the ONLY field a
 * connector's own author-facing surface actually varies — see
 * CONTRACT.md's "Door/connector editing" section for the full
 * verification and why the UI doesn't offer add/remove/repoint
 * affordances for connectors at all. */
export interface ConnectorDoc {
  from: string;
  to: string;
  locked: LockedDoc | null;
}

export interface CanvasDoc {
  width: number;
  height: number;
}

/** Cell-authored semantic room region — target dialect, proposed
 * (rpg-project#180, "cell-authored semantic room regions"). See
 * TARGET-YAML.md's "regions:" section for the full design writeup and the
 * open questions this prototype records rather than decides. Distinct
 * from the declared `rooms:` chain (`RoomDoc`): a region is drawn as an
 * explicit set of absolute [col,row] cells rather than a width against a
 * server-computed `start_column`, so it can be non-rectangular and takes
 * no part in the linear connector chain at all — it exists purely as an
 * additional semantic layer over the same edge-owning dungeon space (the
 * settled model, rpg-project#175: dungeon space owns wall/door edges;
 * rooms/regions are stable semantic regions carrying reveal/placement/
 * spawning/archetype meaning). Same archetype vocabulary `RoomDoc.archetype`
 * already uses (entrance|chamber|corridor|boss) so a future compiler could
 * treat a region exactly like a room for reveal/placement/spawning/
 * scripting purposes once #180 lands server-side. Not compiled
 * server-side today; stripped by `stripToV1Subset`. */
export interface RegionDoc {
  id: string;
  /** Optional display name — `RoomDoc` has no separate name field either
   * (its `id` doubles as the label, confirmed against the real dungeonspec
   * schema — CONTRACT.md's "room display names" finding); `name` is
   * offered here only because a hand-authored region id is more likely to
   * be an opaque slug (`region-3`) than a room chain's own meaningful ids
   * (`entry`, `vault`). Purely cosmetic — no v1 analog either way. */
  name?: string;
  archetype: string;
  /** Absolute [col,row] pairs, the SAME coordinate space every other
   * cell-native field in this file uses (`walls:`, `holes:`, `start`,
   * `end`, top-level `place:`). Order is authoring order, not spatially
   * meaningful — see `regionGeometry.ts`'s `cellsAreContiguous` for how
   * membership's own adjacency is actually determined. */
  cells: [number, number][];
}

export type WallKind = 'solid' | 'door';

/** Edge-native: `from`/`to` are hex-adjacent absolute [col,row]
 * cells, the wall sits on the shared edge between them. target dialect, proposed —
 * see TARGET-YAML.md's annotated example for the full rationale (mirrors
 * the real `EncounterService.Space.walls` wire type). Not compiled
 * server-side; stripped by `stripToV1Subset`. */
export interface WallDoc {
  from: [number, number];
  to: [number, number];
  kind: WallKind;
}

/** A carved opening on a straight wall's own line, addressed by the
 * FOOTPRINT CELL it opens rather than a parametric position — see
 * TARGET-YAML.md's "Straight walls: doors" section for why a cell
 * reference (not `{at: t}`) is the chosen shape: it stays meaningful
 * across an endpoint drag that shifts the line's exact geometry, and a
 * server compiler already has to derive the footprint cell-by-cell to
 * project `wallLines:` onto canonical edges in the first place, so
 * "which cell is a door" is a natural reuse of that same machinery, not
 * new math. `cell` must be one of the OWNING line's own raw (door-blind)
 * footprint cells to mean anything — see `straightWallGeometry.ts`'s
 * `isValidDoorCell`. */
export interface WallLineDoorDoc {
  cell: [number, number];
}

/** A STRAIGHT wall segment — `from`/`to` are hex CORNERS (`CornerRef`,
 * `creation/hexCorner.ts`), and the wall's true geometry is the straight
 * WORLD-SPACE line between those two corner points, unlike `WallDoc`
 * above whose `from`/`to` are always hex-adjacent CELLS (one shared
 * edge). `from`/`to` here are typically several cells apart and the line
 * clips through every hex it passes over — see TARGET-YAML.md's
 * "Straight walls" section for the full rationale (`wallLines:` vs.
 * overloading `walls:`) and `creation/straightWallGeometry.ts` for the
 * footprint/crossing math this implies.
 *
 * **Corner-anchored, not cell-center-anchored** (this unit, following
 * Kirk's live feedback: "it always hangs over a little" — a cell-center
 * anchor overshoots by up to half a hex at each end, by construction).
 * `parseDungeon` self-heals any PRE-corner-anchoring document (`from`/`to`
 * as a bare `[col,row]` cell, the original shape) into this form on
 * parse — see `parseWallLineEndpoint`'s own doc comment.
 *
 * No `kind` field — a straight wall is always solid MATERIAL; a specific
 * point along it becomes passable only via `doors:`, never by
 * reclassifying the WHOLE line (the pre-doors-model shape this unit
 * retires: `kind: door` recolored an entire line without actually
 * carving an opening in it — see TARGET-YAML.md's "Straight walls:
 * doors" section for the full writeup, including this shape's own
 * migration). target dialect, proposed — not compiled server-side;
 * stripped by `stripToV1Subset` like `walls:`. */
export interface WallLineDoc {
  from: CornerRef;
  to: CornerRef;
  doors: WallLineDoorDoc[];
}

/** target dialect, proposed — dungeon-wide lighting config. See TARGET-YAML.md. */
export interface LightingDoc {
  ambient: number;
}

/** The fields a ref-keyed `defaults:` entry may carry — target dialect,
 * proposed, Kirk's ask verbatim: "maybe we can set a default for all
 * skeletons." See TARGET-YAML.md's "defaults:" section for the full
 * design writeup and the rationale for each field's inclusion.
 * Deliberately NOT included: `mount` — see `DungeonDoc.defaults`'s own
 * doc comment. All optional; an entry with only some fields set is the
 * normal case (`{ targeting: lowest-health }`, no blocks_movement,
 * blocks_los, height, or facing at all). */
export type DefaultableField =
  | 'targeting'
  | 'blocksMovement'
  | 'blocksLos'
  | 'height'
  | 'facing';

export interface RefDefaultsDoc {
  targeting?: string;
  blocksMovement?: boolean;
  blocksLos?: boolean;
  height?: number;
  /** Same numeric HEX_FACING_LABELS index every other `facing` field
   * uses — never a bare string on this side of the parse boundary. */
  facing?: number;
}

/** Ref-keyed, e.g. `{ "dnd5e:monsters:skeleton": { targeting:
 * "lowest-health" } }` — target dialect, proposed. See TARGET-YAML.md's
 * "defaults:" section. */
export type DefaultsDoc = Record<string, RefDefaultsDoc>;

export interface DungeonDoc {
  version: number;
  key: string;
  name: string;
  theme?: string;
  height: number;
  rooms: RoomDoc[];
  connectors: ConnectorDoc[];
  // --- target dialect, proposed — see TARGET-YAML.md. All optional/empty in a pure
  // v1 document; none of these reach the real PutDungeon (stripToV1Subset
  // drops every one before any live compile or Save & Play). ---
  canvas: CanvasDoc | null;
  walls: WallDoc[];
  /** STRAIGHT wall segments — a sibling list to `walls:` above, not a
   * variant within it (see `WallLineDoc`'s own doc comment for why they're
   * kept separate). Empty in every document authored before this field
   * existed and in any pure v1 document; not compiled server-side, dropped
   * entirely by `stripToV1Subset`. */
  wallLines: WallLineDoc[];
  /** Cell-native floor openings — absolute [col,row]. Kirk's 2026-08-02
   * Structural-category ask. See TARGET-YAML.md's "Structural palette
   * category" section for render/semantics. */
  holes: [number, number][];
  start: [number, number] | null;
  end: [number, number] | null;
  lighting: LightingDoc | null;
  /** Top-level, absolute-[col,row] placements — same shape as a room's
   * own `place:`, room-scoping made optional rather than required. See
   * TARGET-YAML.md's "top-level placement" section for the full
   * rationale (room-scoped placement is the v1 heritage; rooms become
   * organizational, not existential, in the target dialect) and
   * `stripToV1Subset`'s map-down-or-drop conversion back to v1's
   * room-scoped shape. No top-level `boss:` — a boss stays room-scoped
   * even in the target dialect (dungeonspec's `validateBossCardinality`
   * needs an owning room; see TARGET-YAML.md for how the target dialect
   * eventually frees it). */
  place: PlacementDoc[];
  /** Cell-authored semantic regions — target dialect, proposed
   * (rpg-project#180). See `RegionDoc`'s own doc comment and
   * TARGET-YAML.md's "regions:" section. Empty in every document authored
   * before this field existed and in any pure v1 document; not compiled
   * server-side, dropped entirely by `stripToV1Subset`. */
  regions: RegionDoc[];
  /** Dungeon-wide, ref-keyed default fields — target dialect, proposed
   * (Kirk's ask, verbatim: "maybe we can set a default for all
   * skeletons"). See TARGET-YAML.md's "defaults:" section for the full
   * design. A placement's own explicit field (per-instance, tracked in
   * `PlacementDoc.explicit`) always overrides its ref's entry here — see
   * `resolvePlacement` below, the one accessor that applies this
   * inheritance. This map itself changes NOTHING about how a placement
   * parses (`PlacementDoc.blocksMovement`/`height`/etc. above stay exactly
   * what's literally on that instance) — inheritance is resolved at READ
   * time, not baked into the parse, so the serialized YAML stays sparse
   * (defaults + only the overrides that actually differ, never every
   * inherited value materialized onto every instance).
   *
   * `mount` is deliberately NOT a defaultable field: it's edge-dependent
   * (TARGET-YAML.md's "wall-mount edge-selection rework" — WHICH wall
   * edge a `mount: wall` placement uses is a property of the specific
   * cell it sits in, not of its ref; two skeletons at two different
   * cells could need two different edges even if both are "wall-mounted
   * by default," so a single ref-level default has no one honest value
   * to carry). Not compiled server-side, dropped entirely by
   * `stripToV1Subset` — except that its v1-EXPRESSIBLE effects
   * (`blocks_movement`/`blocks_los` on props) are first MATERIALIZED onto
   * every inheriting placement so the compilable subset preserves
   * authored behavior; see `stripToV1Subset`'s own doc comment. */
  defaults: DefaultsDoc;
}

export interface ParsedDungeon {
  /** The live CST document — mutate this (via `placeProp`/`movePlacement`/
   * etc. below) and re-derive the view model with `toDungeonDoc`, don't
   * rebuild it from scratch. Mutating the same node objects is what keeps
   * `commentBefore` attached correctly for in-place edits. */
  cst: Document;
  doc: DungeonDoc;
}

export class DungeonParseError extends Error {}

/** Parse YAML text into both the CST (for mutation/round-trip) and a plain
 * view model (for rendering). Throws `DungeonParseError` on YAML syntax
 * errors OR on structural shape mismatches (missing `rooms`, a room with
 * no `width`, etc.) — the latter is this concept's OWN shape check, not
 * dungeonspec's real semantic validator (door-row violations, duplicate
 * cells, boss cardinality...). In LIVE mode those come back as real
 * `field_errors` from `PutDungeon`; in FIXTURES mode this function is the
 * only check that ever runs, and it cannot catch anything dungeonspec's
 * own `Validate` catches — see CONTRACT.md's "fixtures mode can't see
 * semantic errors" finding. */
export function parseDungeon(text: string): ParsedDungeon {
  const cst = parseDocument(text);
  if (cst.errors.length > 0) {
    throw new DungeonParseError(cst.errors[0].message);
  }
  const doc = toDungeonDoc(cst);
  return { cst, doc };
}

/** Re-derive the view model from an already-mutated CST — exported so
 * callers applying a `placeItem`/`movePlacement`/etc. mutation can refresh
 * `doc` without a wasteful serialize+reparse round trip. */
export function toDungeonDoc(cst: Document): DungeonDoc {
  const raw = cst.toJS() as Record<string, unknown>;
  // `rooms: []` is a legitimate target-dialect draft (TARGET-YAML.md: a
  // from-scratch canvas with nothing declared yet) — only a MISSING
  // rooms: key at all is a real shape error. The v1-compilability check (>= dungeonspec's
  // own minRooms=2) lives in stripToV1Subset, not here — this function's
  // job is "can this concept's own board render it," not "can the real
  // server compile it."
  if (!Array.isArray(raw.rooms)) {
    throw new DungeonParseError(
      'No rooms: list found (need rooms: [] at minimum)'
    );
  }
  const rooms: RoomDoc[] = raw.rooms.map((r, i) => {
    const room = r as Record<string, unknown>;
    if (typeof room.id !== 'string') {
      throw new DungeonParseError(`rooms[${i}] is missing id`);
    }
    if (typeof room.archetype !== 'string') {
      throw new DungeonParseError(`Room "${room.id}" has no archetype`);
    }
    if (typeof room.width !== 'number') {
      throw new DungeonParseError(`Room "${room.id}" has no width`);
    }
    const place = parsePlacementList(room.place, `Room "${room.id}" place`);
    const boss = room.boss
      ? (() => {
          const b = room.boss as Record<string, unknown>;
          return {
            ref: b.ref as string,
            at: b.at as [number, number],
            facing: parseFacing(b.facing),
            targeting: parseTargeting(b.targeting),
          };
        })()
      : null;
    const obstacles = Array.isArray(room.obstacles)
      ? (room.obstacles as Record<string, unknown>[]).map((o) => ({
          ref: o.ref as string,
          count: o.count as number,
        }))
      : [];
    return {
      id: room.id,
      archetype: room.archetype,
      width: room.width,
      place,
      boss,
      obstacles,
    };
  });

  if (!Array.isArray(raw.connectors)) {
    throw new DungeonParseError('No connectors: list found');
  }
  const connectors: ConnectorDoc[] = raw.connectors.map((c) => {
    const conn = c as Record<string, unknown>;
    const locked = conn.locked as Record<string, unknown> | undefined;
    return {
      from: conn.from as string,
      to: conn.to as string,
      locked: locked
        ? { dc: locked.dc as number, ability: locked.ability as string }
        : null,
    };
  });

  // --- target dialect, proposed — all optional, absent in a pure v1 document.
  // See TARGET-YAML.md; stripToV1Subset drops every one of these below
  // before anything reaches the real PutDungeon. ---
  const canvas = raw.canvas
    ? (() => {
        const c = raw.canvas as Record<string, unknown>;
        return { width: c.width as number, height: c.height as number };
      })()
    : null;

  const walls: WallDoc[] = Array.isArray(raw.walls)
    ? (raw.walls as Record<string, unknown>[]).map((w) => ({
        from: w.from as [number, number],
        to: w.to as [number, number],
        kind: w.kind === 'door' ? 'door' : 'solid',
      }))
    : [];

  const wallLines: WallLineDoc[] = Array.isArray(raw.wallLines)
    ? (raw.wallLines as Record<string, unknown>[]).map((w) => {
        const from = parseWallLineEndpoint(w.from, w.to);
        const to = parseWallLineEndpoint(w.to, w.from);
        return {
          from,
          to,
          doors: parseWallLineDoors(w.doors, from, to, w.kind),
        };
      })
    : [];

  const holes: [number, number][] = Array.isArray(raw.holes)
    ? (raw.holes as [number, number][]).map(
        (h) => [h[0], h[1]] as [number, number]
      )
    : [];

  const start = Array.isArray(raw.start)
    ? (raw.start as [number, number])
    : null;
  const end = Array.isArray(raw.end) ? (raw.end as [number, number]) : null;

  const lighting = raw.lighting
    ? { ambient: (raw.lighting as Record<string, unknown>).ambient as number }
    : null;

  // Top-level, absolute-[col,row] placements — target dialect, proposed. See
  // TARGET-YAML.md's "top-level placement" section and DungeonDoc.place's
  // own doc comment.
  const place = parsePlacementList(raw.place, 'place');

  // Cell-authored semantic regions — target dialect, proposed
  // (rpg-project#180). See RegionDoc's own doc comment. A region with a
  // missing/non-string id or archetype is a shape error, same discipline
  // parseDungeon already applies to rooms/connectors above — this
  // concept's own "can the board render it" check, not dungeonspec's real
  // semantic validator (which doesn't know this field at all yet).
  const regions: RegionDoc[] = Array.isArray(raw.regions)
    ? (raw.regions as Record<string, unknown>[]).map((r, ri) => {
        if (typeof r.id !== 'string') {
          throw new DungeonParseError(`regions[${ri}] is missing id`);
        }
        if (typeof r.archetype !== 'string') {
          throw new DungeonParseError(`region "${r.id}" has no archetype`);
        }
        const cells: [number, number][] = Array.isArray(r.cells)
          ? (r.cells as [number, number][]).map(
              (c) => [c[0], c[1]] as [number, number]
            )
          : [];
        return {
          id: r.id,
          name: typeof r.name === 'string' ? r.name : undefined,
          archetype: r.archetype,
          cells,
        };
      })
    : [];

  // Ref-keyed default fields — target dialect, proposed. See
  // DungeonDoc.defaults's own doc comment. Every field is independently
  // optional on a given ref's entry; an entry present with none of the
  // five recognized keys parses to `{}` rather than being skipped, same
  // "authored but currently inert" honesty every other target-dialect
  // parse in this function follows (e.g. an empty `lighting: {}`).
  const defaults: DefaultsDoc = {};
  if (raw.defaults && typeof raw.defaults === 'object') {
    for (const [ref, v] of Object.entries(
      raw.defaults as Record<string, unknown>
    )) {
      if (!v || typeof v !== 'object') continue;
      const entry = v as Record<string, unknown>;
      const parsed: RefDefaultsDoc = {};
      if (typeof entry.targeting === 'string')
        parsed.targeting = entry.targeting;
      if (typeof entry.blocks_movement === 'boolean')
        parsed.blocksMovement = entry.blocks_movement;
      if (typeof entry.blocks_los === 'boolean')
        parsed.blocksLos = entry.blocks_los;
      if (typeof entry.height === 'number') parsed.height = entry.height;
      const facing = parseFacing(entry.facing);
      if (facing !== null) parsed.facing = facing;
      defaults[ref] = parsed;
    }
  }

  return {
    version: (raw.version as number) ?? 1,
    key: raw.key as string,
    name: raw.name as string,
    theme: raw.theme as string | undefined,
    height: raw.height as number,
    rooms,
    connectors,
    canvas,
    walls,
    wallLines,
    holes,
    start,
    end,
    lighting,
    place,
    regions,
    defaults,
  };
}

export interface ResolvedPlacementFields {
  blocksMovement: boolean;
  blocksLos: boolean;
  height: number | null;
  facing: number | null;
  targeting: string | null;
  /** Which fields above are the placement's OWN default rather than an
   * inherited one — `true` only when the field is absent on the
   * placement itself (`!explicit.X`) AND its ref has a `defaults:` entry
   * carrying that field. `false` whenever the ref has no defaults entry
   * at all (the overwhelmingly common case today), so most callers can
   * ignore this and only the Inspector's inherited/muted rendering needs
   * it. */
  inheritedFrom: {
    blocksMovement: boolean;
    blocksLos: boolean;
    height: boolean;
    facing: boolean;
    targeting: boolean;
  };
}

/** Resolve a placement's EFFECTIVE field values — its own explicit
 * fields where present, else its ref's `defaults:` entry, else the
 * pre-existing plain fallback (`false`/`null`) — target dialect,
 * proposed, see `DungeonDoc.defaults`'s own doc comment.
 *
 * Pure function over already-parsed `DungeonDoc`/`PlacementDoc` state,
 * no CST access — safe to call from render code on every frame, and
 * this is exactly what board/3D rendering should do: `DungeonPreview3D`'s
 * `buildOnePlacement` and `boardGeometry.ts`'s `isEntranceBlocked` both
 * read placement fields through this now rather than a placement's own
 * `PlacementDoc.height`/`blocksMovement` directly, so a `defaults:`-driven
 * value (a defaulted `height` floating a candle, a defaulted
 * `blocks_movement` correctly tripping the entrance-blocked warning) is
 * never silently invisible to a consumer that only ever looked at the
 * instance.
 *
 * Never mutates `placement` or writes an inherited value back into the
 * document — the serialized YAML stays SPARSE (only defaults + the
 * overrides that genuinely differ), which is the entire point of
 * inheritance living here instead of being baked in at parse time. Only
 * `stripToV1Subset` ever materializes a resolved value onto an instance,
 * and only into the STRIPPED copy it returns, never the live document —
 * see that function's own doc comment.
 *
 * Deliberately takes a `PlacementDoc`, not a `BossDoc` — whether
 * `defaults:` should apply to a room's `boss:` entry at all is an open
 * question this prototype records, not decides (TARGET-YAML.md's
 * "defaults:" section); `BossDoc` doesn't even carry
 * blocksMovement/blocksLos/height fields (a boss isn't wall furniture),
 * and extending inheritance to its facing/targeting fields is exactly
 * the kind of scope this file's `PlacementDoc`-only signature is
 * deliberately NOT deciding yet. */
export function resolvePlacement(
  doc: DungeonDoc,
  placement: PlacementDoc
): ResolvedPlacementFields {
  const d = doc.defaults[placement.ref];
  const blocksMovement = placement.explicit.blocksMovement
    ? placement.blocksMovement
    : (d?.blocksMovement ?? false);
  const blocksLos = placement.explicit.blocksLos
    ? placement.blocksLos
    : (d?.blocksLos ?? false);
  const height = placement.explicit.height
    ? placement.height
    : (d?.height ?? null);
  const facing = placement.explicit.facing
    ? placement.facing
    : (d?.facing ?? null);
  const targeting = placement.explicit.targeting
    ? placement.targeting
    : (d?.targeting ?? null);
  return {
    blocksMovement,
    blocksLos,
    height,
    facing,
    targeting,
    inheritedFrom: {
      blocksMovement:
        !placement.explicit.blocksMovement && d?.blocksMovement !== undefined,
      blocksLos: !placement.explicit.blocksLos && d?.blocksLos !== undefined,
      height: !placement.explicit.height && d?.height !== undefined,
      facing: !placement.explicit.facing && d?.facing !== undefined,
      targeting: !placement.explicit.targeting && d?.targeting !== undefined,
    },
  };
}

/** Serialize the live CST back to YAML text. `lineWidth: 0` is what keeps
 * showcase.yaml's flow-style entries from being reflowed onto multiple
 * lines — see this file's own doc comment for the residual bracket-
 * padding diff this doesn't close. */
export function serializeDungeon(cst: Document): string {
  return cst.toString({ lineWidth: 0 }) as string;
}

function findRoomSeqIndex(cst: Document, roomId: string): number {
  const rooms = cst.get('rooms');
  if (!isSeq(rooms)) throw new DungeonParseError('rooms: is not a sequence');
  const idx = rooms.items.findIndex((r) => isMap(r) && r.get('id') === roomId);
  if (idx === -1) throw new DungeonParseError(`Unknown room "${roomId}"`);
  return idx;
}

function roomMap(cst: Document, roomId: string): YAMLMap {
  const idx = findRoomSeqIndex(cst, roomId);
  const room = (cst.get('rooms') as YAMLSeq).items[idx];
  if (!isMap(room))
    throw new DungeonParseError(`room "${roomId}" is not a map`);
  return room;
}

/** Build a flow-style `{ ref: "...", at: [c, r][, blocks_movement: ...,
 * blocks_los: ...] }` node matching showcase.yaml's own style — new
 * entries added via the board look identical to hand-authored ones,
 * confirmed against the real file (see dungeonYaml.test.ts). */
function createPlacementNode(
  cst: Document,
  ref: string,
  at: [number, number],
  flags?: { blocksMovement: boolean; blocksLos: boolean }
): YAMLMap {
  const obj: Record<string, unknown> = { ref, at };
  if (flags) {
    obj.blocks_movement = flags.blocksMovement;
    obj.blocks_los = flags.blocksLos;
  }
  const node = cst.createNode(obj) as YAMLMap;
  node.flow = true;
  const atNode = node.get('at', true);
  if (isSeq(atNode)) atNode.flow = true;
  const refNode = node.get('ref', true);
  if (refNode instanceof Scalar) refNode.type = Scalar.QUOTE_DOUBLE;
  return node;
}

/** The `place:` sequence a placement mutator should read/write —
 * room-scoped (`roomId` a real id) or top-level (`roomId === null`,
 * target dialect, proposed — see TARGET-YAML.md's "top-level placement"
 * section).
 * Creates the sequence if absent, matching every mutator's existing
 * "first placement creates the list" behavior. One shared lookup so
 * every placement mutator below only needs an `if (roomId === null)`
 * branch, not a parallel implementation. */
function placeSeq(cst: Document, roomId: string | null): YAMLSeq {
  if (roomId === null) return topSeq(cst, 'place');
  const room = roomMap(cst, roomId);
  const existing = room.get('place', true);
  if (isSeq(existing)) return existing;
  const seq = new YAMLSeq(cst.schema);
  room.set('place', seq);
  return seq;
}

/** Add a new prop/monster placement to a room's `place:` list, or to the
 * top-level `place:` list when `roomId` is `null` (creating whichever
 * list is targeted if it doesn't exist yet). Monster placements never
 * get blocks_movement/blocks_los keys, matching dungeonspec.Validate's
 * rejection of both on monster refs. */
export function placeItem(
  cst: Document,
  roomId: string | null,
  ref: string,
  at: [number, number]
): void {
  const place = placeSeq(cst, roomId);
  const isMonster = ref.startsWith('dnd5e:monsters:');
  const node = createPlacementNode(
    cst,
    ref,
    at,
    isMonster ? undefined : { blocksMovement: false, blocksLos: false }
  );
  place.items.push(node);
}

/** Move an existing placement within the SAME list it's already in
 * (room-scoped or top-level — cross-list moves are modeled as
 * delete+place by the caller, since a placement's index is scoped to
 * whichever list it lives in). Mutates the SAME node object, which is
 * what keeps a `commentBefore` attached to it correctly. */
export function movePlacement(
  cst: Document,
  roomId: string | null,
  index: number,
  at: [number, number]
): void {
  const place = placeSeq(cst, roomId);
  const item = place.items[index];
  if (!isMap(item)) throw new DungeonParseError(`place[${index}] is not a map`);
  const atNode = new YAMLSeq(cst.schema);
  atNode.flow = true;
  atNode.items = at.map((n) => n);
  item.set('at', atNode);
}

/** Remove a placement. The comment attached to it (`commentBefore`) is
 * removed along with it — this is the exact "deleting the first item
 * under a multi-item heading silently deletes the heading" failure mode
 * CONTRACT.md documents, confirmed against `yaml`'s own CST, not just
 * this concept's earlier hand-rolled parser. */
export function deletePlacement(
  cst: Document,
  roomId: string | null,
  index: number
): void {
  const place = placeSeq(cst, roomId);
  place.items.splice(index, 1);
}

/** Move a placement ACROSS lists — room-scoped to top-level, top-level to
 * room-scoped, or between two different rooms — preserving every field
 * it carries, not just `ref`/`at`. Fixes a real data-loss bug: the
 * delete+`placeItem` shape callers used to hand-roll for this (still
 * true of `movePlacement`'s own doc comment, "cross-list moves are
 * modeled as delete+place by the caller") silently dropped
 * facing/mount/height/rotate_degrees/targeting and reset
 * blocks_movement/blocks_los to their defaults, because `placeItem`
 * alone only ever writes ref+at+flags for a fresh node (2026-08-02
 * graduation audit finding). `item` is the FULL `PlacementDoc` read from
 * the source by the caller BEFORE it deletes anything — passed in
 * rather than re-read here, since a caller that already has `doc` can
 * hand it over without this function needing its own CST traversal to
 * find the same node twice, and because the caller is what knows WHICH
 * list-relative index the item currently has. Returns the item's new
 * index in `toRoomId`'s list — `placeItem` always appends, so this is
 * always correct without the caller having to re-derive it from
 * possibly-stale `doc` state (the other real bug this same audit finding
 * flagged: a bare `.find(...)!.place.length` throws outright when
 * `toRoomId` is `null`, since no room has id `null` to find). */
export function movePlacementAcrossLists(
  cst: Document,
  fromRoomId: string | null,
  fromIndex: number,
  toRoomId: string | null,
  at: [number, number],
  item: PlacementDoc
): number {
  deletePlacement(cst, fromRoomId, fromIndex);
  placeItem(cst, toRoomId, item.ref, at);
  const newIndex = placeSeq(cst, toRoomId).items.length - 1;
  if (!item.isMonster) {
    setPlacementFlags(cst, toRoomId, newIndex, {
      blocksMovement: item.blocksMovement,
      blocksLos: item.blocksLos,
    });
  }
  if (item.facing !== null)
    setPlacementFacing(cst, toRoomId, newIndex, item.facing);
  if (item.mount === 'wall') {
    setPlacementMount(cst, toRoomId, newIndex, 'wall');
  }
  if (item.height !== null) {
    setPlacementHeight(cst, toRoomId, newIndex, item.height);
  }
  if (item.rotationDegrees !== null) {
    setPlacementRotationDegrees(cst, toRoomId, newIndex, item.rotationDegrees);
  }
  if (item.targeting !== null) {
    setPlacementTargeting(cst, toRoomId, newIndex, item.targeting);
  }
  return newIndex;
}

/** Set a prop placement's blocks_movement/blocks_los flags (props only —
 * callers must not call this for monster refs). */
export function setPlacementFlags(
  cst: Document,
  roomId: string | null,
  index: number,
  flags: { blocksMovement: boolean; blocksLos: boolean }
): void {
  const place = placeSeq(cst, roomId);
  const item = place.items[index];
  if (!isMap(item)) return;
  item.set('blocks_movement', flags.blocksMovement);
  item.set('blocks_los', flags.blocksLos);
}

/** Clear a `place:` entry's `blocks_movement` or `blocks_los` key
 * entirely — distinct from `setPlacementFlags` (which always writes a
 * literal boolean; correct for the board's own flag checkboxes, which
 * always want an explicit value the moment an author touches them).
 * This exists for the Inspector's "revert to default" affordance
 * (`defaults:`, target dialect, proposed — see `DungeonDoc.defaults`'s
 * own doc comment): reverting must remove the key so the placement goes
 * back to actually INHERITING its ref's default through
 * `resolvePlacement`, not merely get re-set to match the default's
 * CURRENT value — the latter would render identically today but would
 * silently stop tracking the ref's default if it changes later, which
 * defeats the entire point of inheriting rather than copying. */
export function clearPlacementFlag(
  cst: Document,
  roomId: string | null,
  index: number,
  flag: 'blocksMovement' | 'blocksLos'
): void {
  const place = placeSeq(cst, roomId);
  const item = place.items[index];
  if (!isMap(item)) return;
  item.delete(flag === 'blocksMovement' ? 'blocks_movement' : 'blocks_los');
}

/** Strip every monster `place:` entry (any `ref` starting
 * `dnd5e:monsters:`) from every room, leaving props and `boss:` untouched
 * — the "Walk it (no monsters)" Save & Play variant (Kirk's 2026-08-02
 * ask). Deliberately does NOT touch `boss:`: dungeonspec requires exactly
 * one boss per boss-archetype room (`moveBoss`'s own doc comment above),
 * so a boss-room YAML with `boss:` removed fails that validation rather
 * than producing a genuinely boss-free dungeon — see `YamlPane.tsx`'s
 * `honestyNote` ("Boss remains — real free-roam mode needs server
 * support") for how the UI stays honest about this rather than silently
 * rewriting the room's archetype to dodge it. */
export function stripMonsterPlacements(cst: Document): void {
  const rooms = cst.get('rooms');
  if (!isSeq(rooms)) return;
  for (const room of rooms.items) {
    if (!isMap(room)) continue;
    const place = room.get('place', true);
    if (!isSeq(place)) continue;
    place.items = place.items.filter((item) => {
      if (!isMap(item)) return true;
      const ref = item.get('ref');
      return typeof ref !== 'string' || !ref.startsWith('dnd5e:monsters:');
    });
  }
}

/** Build the "Walk it" variant's YAML text: same dungeon, monster
 * `place:` entries stripped, `key:` renamed to `${walkKey}`. Parses a
 * FRESH CST from `yamlText` rather than mutating the caller's live board
 * CST, so building a walk variant never disturbs the board being edited.
 * `boss:` is left untouched (see `stripMonsterPlacements`'s doc comment)
 * — the walk variant is NOT monster-free, only place:-monster-free, and
 * the UI must say so rather than implying a true no-encounter walkthrough.
 *
 * **Capability-probed graduation (this unit, 2026-08-04).** Before this
 * unit, Walk it sent `yamlText` STRAIGHT to `parseDungeon` — unlike Save &
 * Play, it never ran `stripToV1Subset` at all, so a document using any
 * target-dialect construct (walls, start, ...) would fail Walk it's own
 * save outright the moment that construct was present, regardless of
 * whether the server actually accepted it. `capabilities` (optional, same
 * `ServerCapabilities` Save & Play's own strip reads) fixes this: the v1-
 * expressible/capability-accepted subset is computed FIRST, monster
 * stripping happens on THAT, so Walk it and Save & Play now agree on what
 * "compilable" means, and an accepted field (Kirk's `walls:` survives
 * both saves, not just one. `undefined` (fixtures mode, or a
 * pre-capability-probe caller/test) falls back to the prior conservative-
 * static strip, same as `stripToV1Subset` itself. */
export function buildWalkItYaml(
  yamlText: string,
  walkKey: string,
  capabilities?: ServerCapabilities
): string {
  const subsetYaml = stripToV1Subset(yamlText, capabilities).yaml;
  const { cst } = parseDungeon(subsetYaml);
  stripMonsterPlacements(cst);
  cst.set('key', walkKey);
  return serializeDungeon(cst);
}

/** Move the boss pin within its own room (the only room a boss can be
 * in — dungeonspec requires exactly one boss per boss-archetype room, so
 * this never creates or deletes the `boss:` entry, only relocates it). */
export function moveBoss(
  cst: Document,
  roomId: string,
  at: [number, number]
): void {
  const room = roomMap(cst, roomId);
  const boss = room.get('boss', true);
  if (!isMap(boss))
    throw new DungeonParseError(`room "${roomId}" has no boss:`);
  const atNode = new YAMLSeq(cst.schema);
  atNode.flow = true;
  atNode.items = at.map((n) => n);
  boss.set('at', atNode);
}

function connectorMap(cst: Document, index: number): YAMLMap {
  const connectors = cst.get('connectors');
  if (!isSeq(connectors))
    throw new DungeonParseError('connectors: is not a sequence');
  const item = connectors.items[index];
  if (!isMap(item))
    throw new DungeonParseError(`connectors[${index}] is not a map`);
  return item;
}

/** Set or clear a connector's `locked:` block — the ONLY field a
 * connector's own author-facing surface actually varies (see this file's
 * `ConnectorDoc` doc comment: `from`/`to` are fixed by room chain order,
 * never independently authorable). `locked: null` removes the key
 * entirely (an unlocked door), matching showcase.yaml's own two
 * connectors, neither of which carries one. Flow-style `{ dc: ..., ability:
 * ... }`, matching the real `{ dc: 12, ability: dex }` shape confirmed
 * against rpg-toolkit's own dungeonspec fixtures (reference-tomb.yaml). */
export function setConnectorLocked(
  cst: Document,
  index: number,
  locked: LockedDoc | null
): void {
  const conn = connectorMap(cst, index);
  if (locked === null) {
    conn.delete('locked');
    return;
  }
  const lockedNode = cst.createNode({
    dc: locked.dc,
    ability: locked.ability,
  }) as YAMLMap;
  lockedNode.flow = true;
  conn.set('locked', lockedNode);
}

// ============================================================
// target dialect, proposed — see TARGET-YAML.md. Every mutator below writes a field
// `stripToV1Subset` (bottom of this file) removes before anything reaches
// the real PutDungeon — these are the concept's own authoring surface,
// not a claim any of this compiles today.
// ============================================================

/** Set or clear a `place:` entry's `facing:` — target dialect, proposed. */
export function setPlacementFacing(
  cst: Document,
  roomId: string | null,
  index: number,
  facing: number | null
): void {
  const place = placeSeq(cst, roomId);
  const item = place.items[index];
  if (!isMap(item)) return;
  if (facing === null) item.delete('facing');
  else item.set('facing', facingLabel(facing));
}

/** Set or clear a room's `boss:` entry's `facing:` — target dialect, proposed. */
export function setBossFacing(
  cst: Document,
  roomId: string,
  facing: number | null
): void {
  const room = roomMap(cst, roomId);
  const boss = room.get('boss', true);
  if (!isMap(boss)) return;
  if (facing === null) boss.delete('facing');
  else boss.set('facing', facingLabel(facing));
}

/** Set or clear a `place:` entry's `mount:` — target dialect, proposed,
 * see TARGET-YAML.md's "z-axis" section. `mount: 'floor'` clears the key
 * (the pre-existing, only-ever-possible state needs no key at all).
 *
 * DECOUPLED FROM `height` (Kirk-batch, 2026-08-02: "height: decouples
 * from mount... any placement may carry height (floating candles);
 * mount:wall remains the wall-flush case"). Before this, `mount`/
 * `height` were one mutator (`height` was only ever meaningful alongside
 * `mount: wall`) — now they're independent, matching
 * `setPlacementRotationDegrees`'s own already-independent shape. Toggling
 * `mount` off does NOT clear an existing `height` (a floor-standing prop
 * can still float — that's the entire point of the decoupling); toggling
 * it on does NOT set a default height either — the Inspector's own "has
 * height" checkbox owns that default, same separation of concerns
 * `setPlacementHeight` below documents from its own side. */
export function setPlacementMount(
  cst: Document,
  roomId: string | null,
  index: number,
  mount: Mount
): void {
  const place = placeSeq(cst, roomId);
  const item = place.items[index];
  if (!isMap(item)) return;
  if (mount === 'floor') item.delete('mount');
  else item.set('mount', 'wall');
}

/** Set or clear a `place:` entry's `height:` — target dialect, proposed,
 * see TARGET-YAML.md's "z-axis" section. Independent of `mount`
 * (Kirk-batch, 2026-08-02 decoupling — see `setPlacementMount`'s own doc
 * comment for the full rationale): a `mount: wall` placement typically
 * carries height (how far up the wall), but so can a floor-standing one
 * (a floating candle, `blocks_movement: false`) — `mount` no longer
 * gates whether `height` is meaningful, only what it means alongside
 * (wall clearance vs. float height). `null` clears the key. */
export function setPlacementHeight(
  cst: Document,
  roomId: string | null,
  index: number,
  height: number | null
): void {
  const place = placeSeq(cst, roomId);
  const item = place.items[index];
  if (!isMap(item)) return;
  if (height === null) item.delete('height');
  else item.set('height', height);
}

/** Set or clear a `place:` entry's `rotate_degrees:` — EXPERIMENT, see
 * `PlacementDoc.rotationDegrees`'s own doc comment for why this exists
 * and what it does and doesn't mean. Independent of `setPlacementMount`
 * deliberately: clearing `mount` back to `'floor'` does NOT also clear
 * `rotate_degrees` — the fine-adjustment value is worth keeping around
 * if the author toggles wall-mount off and back on while comparing.
 * Generalized (2026-08-03) to any non-monster placement — this mutator
 * itself never checked `mount` in the first place; only the Inspector's
 * render condition used to restrict the control to `mount === 'wall'`,
 * which is what changed. */
export function setPlacementRotationDegrees(
  cst: Document,
  roomId: string | null,
  index: number,
  rotationDegrees: number | null
): void {
  const place = placeSeq(cst, roomId);
  const item = place.items[index];
  if (!isMap(item)) return;
  if (rotationDegrees === null || rotationDegrees === 0) {
    item.delete('rotate_degrees');
  } else {
    item.set('rotate_degrees', rotationDegrees);
  }
}

/** Set or clear a `place:` entry's `targeting:` — target dialect, proposed. Callers
 * should only invoke this for a monster ref (`isMonster`); nothing here
 * enforces that — same trust boundary `setPlacementFlags` already
 * assumes for its own props-only fields. */
export function setPlacementTargeting(
  cst: Document,
  roomId: string | null,
  index: number,
  targeting: string | null
): void {
  const place = placeSeq(cst, roomId);
  const item = place.items[index];
  if (!isMap(item)) return;
  if (targeting === null) item.delete('targeting');
  else item.set('targeting', targeting);
}

/** Set or clear a room's `boss:` entry's `targeting:` — target dialect, proposed. */
export function setBossTargeting(
  cst: Document,
  roomId: string,
  targeting: string | null
): void {
  const room = roomMap(cst, roomId);
  const boss = room.get('boss', true);
  if (!isMap(boss)) return;
  if (targeting === null) boss.delete('targeting');
  else boss.set('targeting', targeting);
}

/** Get-or-create a top-level sequence field (`walls:`/`holes:`), matching
 * `roomMap`'s "get or create, mutate the live node" discipline. */
function topSeq(cst: Document, key: string): YAMLSeq {
  const existing = cst.get(key, true);
  if (isSeq(existing)) return existing;
  const seq = new YAMLSeq(cst.schema);
  cst.set(key, seq);
  return seq;
}

function createWallNode(cst: Document, wall: WallDoc): YAMLMap {
  const node = cst.createNode({
    from: wall.from,
    to: wall.to,
    kind: wall.kind,
  }) as YAMLMap;
  node.flow = true;
  const fromNode = node.get('from', true);
  if (isSeq(fromNode)) fromNode.flow = true;
  const toNode = node.get('to', true);
  if (isSeq(toNode)) toNode.flow = true;
  return node;
}

/** Wall tool: toggle a wall's PRESENCE at a cell (add as `kind: solid` /
 * remove) — target dialect, proposed. Adding always starts solid; use
 * `toggleWallKind` to flip an existing one to a door. Anchored at a
 * specific absolute [col,row] cell's bottom edge (`to: [col, row+1]`)
 * rather than requiring a drag gesture to specify an arbitrary edge; see
 * TARGET-YAML.md's "Structural palette category" section for why a
 * single click-to-toggle affordance was chosen over full free-hand edge
 * drawing for this pass. Looks the wall up by `wallIndexAtEdge`'s EXACT
 * `from`/`to` match, not a from-cell-only match — a from-only match used
 * to let this tool find and delete a wall drawn on a DIFFERENT edge that
 * merely shared this cell as its `from` (e.g. a creation-mode-drawn
 * `[c,r]->[c+1,r]` wall, reachable by clicking cell (c,r) with edit
 * mode's Wall tool, which only ever intends the (c,r)->(c,r+1) edge) —
 * graduation audit item, reconciling this with `wallIndexAtEdge` so
 * there's one lookup convention, not two. */
export function toggleWall(cst: Document, col: number, row: number): void {
  const idx = wallIndexAtEdge(cst, [col, row], [col, row + 1]);
  if (idx !== -1) {
    (cst.get('walls') as YAMLSeq).items.splice(idx, 1);
    return;
  }
  const walls = topSeq(cst, 'walls');
  walls.items.push(
    createWallNode(cst, { from: [col, row], to: [col, row + 1], kind: 'solid' })
  );
}

/** Door tool: flip an EXISTING wall's `kind` between `solid`/`door` — a
 * no-op if there's no wall at this cell yet (caller should reject/toast
 * "place a wall here first", matching the Structural category's own
 * two-tool split in TARGET-YAML.md). Returns whether a wall existed to
 * toggle, so the caller can distinguish "toggled" from "nothing there".
 * Same exact-edge lookup as `toggleWall` above, for the same reason. */
export function toggleWallKind(
  cst: Document,
  col: number,
  row: number
): boolean {
  const idx = wallIndexAtEdge(cst, [col, row], [col, row + 1]);
  if (idx === -1) return false;
  const item = (cst.get('walls') as YAMLSeq).items[idx];
  if (!isMap(item)) return false;
  item.set('kind', item.get('kind') === 'door' ? 'solid' : 'door');
  return true;
}

/** A wall's index in `walls:`, matched by an EXACT `from`/`to` pair (both
 * ends, not just `from`) — the one wall-lookup convention this concept
 * uses now (`toggleWall`/`toggleWallKind` above route through this too,
 * not a separate from-cell-only lookup). General edge lookup for the
 * "New Dungeon" creation board's freeform edge-painting, where a wall
 * can be either orientation (a `from`→`to` step of `[0,1]` or `[1,0]`)
 * at any cell, not just edit mode's own fixed (col,row)->(col,row+1)
 * shape. Callers are responsible for passing `from`/`to` in ONE
 * canonical order (creation mode's `hEdgeGeometry`/`vEdgeGeometry`
 * already produce one, edit mode's `toggleWall`/`toggleWallKind` always
 * pass `to: [col, row+1]`) — this does not check the reverse pairing,
 * matching how the CST itself never stores a wall's endpoints swapped. */
function wallIndexAtEdge(
  cst: Document,
  from: [number, number],
  to: [number, number]
): number {
  const walls = cst.get('walls');
  if (!isSeq(walls)) return -1;
  return walls.items.findIndex((w) => {
    if (!isMap(w)) return false;
    const f = w.get('from');
    const t = w.get('to');
    return (
      isSeq(f) &&
      isSeq(t) &&
      f.get(0) === from[0] &&
      f.get(1) === from[1] &&
      t.get(0) === to[0] &&
      t.get(1) === to[1]
    );
  });
}

/** This edge's wall kind, or `null` if no wall is drawn there — the
 * creation board's own `state.walls.get(key)` read, now backed by the
 * shared CST instead of a parallel `Map<EdgeKey, WallKind>`. */
export function wallKindAtEdge(
  cst: Document,
  from: [number, number],
  to: [number, number]
): WallKind | null {
  const idx = wallIndexAtEdge(cst, from, to);
  if (idx === -1) return null;
  const item = (cst.get('walls') as YAMLSeq).items[idx];
  return isMap(item) ? ((item.get('kind') as WallKind) ?? 'solid') : null;
}

/** Raised when a caller tries to create or update a `walls:` entry that
 * does not identify one real shared hex edge. This is a model-side guard
 * for generated edits. It is NOT today backed by any server-side check:
 * `walls:` is target-dialect-only and `stripToV1Subset` drops it before
 * every real preview/Save & Play call, and the released PutDungeon API
 * neither accepts nor validates it. Parsing itself stays lossless — a
 * malformed hand-authored edge round-trips through the CST unchanged —
 * so this guard is the only check a caller gets until rpg-toolkit#881
 * and rpg-api#768 land and direct, strict server-side validation of
 * authored edges becomes authoritative. */
export class WallEdgeValidationError extends Error {}

/** Set (add/update) or clear a wall on one real shared hex edge, with an
 * explicit on/off — the creation board's stroke-painting needs to force
 * a whole drag's worth of edges to the SAME state (decided by the first
 * edge touched), which a bare toggle-per-cell can't express. Setting
 * `on: true` for an edge that already has a wall updates its `kind`
 * in place (used by the door tool to flip solid↔door without going
 * through a separate lookup + toggleWallKind-style call).
 *
 * The adjacency guard applies only to `on: true`: an existing malformed
 * hand-authored entry must still be removable with `on: false` — parsing
 * preserves it losslessly rather than rejecting it on load, and today
 * nothing downstream of this model checks it either (see
 * `WallEdgeValidationError`'s own doc comment for why). `wallLines:`
 * deliberately does not route through this mutator — its endpoints name
 * a span, not a single edge, and are intentionally allowed to be
 * non-adjacent. */
export function setWallEdge(
  cst: Document,
  from: [number, number],
  to: [number, number],
  kind: WallKind,
  on: boolean
): void {
  const idx = wallIndexAtEdge(cst, from, to);
  if (!on) {
    if (idx !== -1) (cst.get('walls') as YAMLSeq).items.splice(idx, 1);
    return;
  }
  if (!cellsAdjacent(from, to)) {
    throw new WallEdgeValidationError(
      `Wall edge endpoints must be adjacent hex cells: [${from.join(',')}] -> [${to.join(',')}]`
    );
  }
  if (idx !== -1) {
    const item = (cst.get('walls') as YAMLSeq).items[idx];
    if (isMap(item)) item.set('kind', kind);
    return;
  }
  const walls = topSeq(cst, 'walls');
  walls.items.push(createWallNode(cst, { from, to, kind }));
}

/** Builds a flow-style `{ cell: [c, r], corner: n }` node for one
 * `wallLines[].from`/`.to` endpoint or `doors[].cell` reference. */
function createCornerRefNode(cst: Document, ref: CornerRef): YAMLMap {
  const node = cst.createNode({
    cell: ref.cell,
    corner: ref.corner,
  }) as YAMLMap;
  node.flow = true;
  const cellNode = node.get('cell', true);
  if (isSeq(cellNode)) cellNode.flow = true;
  return node;
}

function createWallLineNode(cst: Document, line: WallLineDoc): YAMLMap {
  const node = cst.createNode({}) as YAMLMap;
  node.flow = true;
  node.set('from', createCornerRefNode(cst, line.from));
  node.set('to', createCornerRefNode(cst, line.to));
  if (line.doors.length > 0) {
    const doorsSeq = new YAMLSeq(cst.schema);
    doorsSeq.flow = true;
    for (const door of line.doors) {
      const doorNode = cst.createNode({ cell: door.cell }) as YAMLMap;
      doorNode.flow = true;
      const cellNode = doorNode.get('cell', true);
      if (isSeq(cellNode)) cellNode.flow = true;
      doorsSeq.items.push(doorNode);
    }
    node.set('doors', doorsSeq);
  }
  return node;
}

/** Straight-wall tool: append a new `wallLines:` entry, corner-anchored,
 * with no doors yet — use `toggleWallLineDoorAt` to carve one in after
 * the fact. `from`/`to` are canonicalized before writing (defensively —
 * a real drag-resolve path already returns canonical corners, but this
 * keeps every `wallLines:` entry canonical regardless of caller), same
 * discipline `setWallLineEndpoint` follows. No add-vs-remove toggle at a
 * single cell the way `toggleWall` has (a straight wall's identity is
 * its whole from→to span, not one edge), so the creation board's own
 * click-vs-drag distinction decides add (`addWallLine`) vs. remove
 * (`removeWallLineAt`) instead of this function doing both. */
export function addWallLine(
  cst: Document,
  from: CornerRef,
  to: CornerRef
): void {
  const lines = topSeq(cst, 'wallLines');
  lines.items.push(
    createWallLineNode(cst, {
      from: canonicalCorner(from),
      to: canonicalCorner(to),
      doors: [],
    })
  );
}

/**
 * Ensures a `wallLines:` CST entry's `from`/`to` are BOTH in the current
 * corner-anchored shape (migrating either that's still the PRE-corner-
 * anchoring legacy `[c,r]` form, same as `parseWallLineEndpoint`'s own
 * migration) and drops any stale `kind:` key — the pre-doors-model field
 * this unit retires. Called at the top of every mutator that touches an
 * EXISTING wallLine entry (`setWallLineEndpoint`, `toggleWallLineDoorAt`)
 * so a partial edit — e.g. dragging only ONE endpoint of a legacy entry
 * — can never leave it half-migrated (one corner-anchored endpoint, one
 * still-legacy endpoint, plus a now-meaningless dangling `kind:` key).
 * The entry converges to the current shape as a whole, atomically with
 * whatever edit touched it — a no-op (besides re-canonicalizing) on an
 * entry that's already fully current.
 */
function normalizeWallLineItem(cst: Document, item: YAMLMap): void {
  const raw = item.toJSON() as Record<string, unknown>;
  const from = parseWallLineEndpoint(raw.from, raw.to);
  const to = parseWallLineEndpoint(raw.to, raw.from);
  item.set('from', createCornerRefNode(cst, from));
  item.set('to', createCornerRefNode(cst, to));
  item.delete('kind');
}

/** Remove a `wallLines:` entry by index — the creation board's Delete-key
 * affordance on a SELECTED straight wall (see `CreationBoard.tsx`'s own
 * selection-vs-endpoint-drag interaction model). No-ops on an
 * out-of-range index rather than throwing, since a stale index (the line
 * having already been removed by a concurrent interaction) is a UI race,
 * not a program error worth crashing over. */
export function removeWallLineAt(cst: Document, index: number): void {
  const lines = cst.get('wallLines');
  if (!isSeq(lines)) return;
  if (index < 0 || index >= lines.items.length) return;
  lines.items.splice(index, 1);
}

/** Endpoint-drag commit: overwrite ONE end (`which`) of an EXISTING
 * `wallLines:` entry with a new corner — the "draggable endpoint handle,
 * snapped corner-to-corner" fine-tuning affordance TARGET-YAML.md's
 * "Straight walls: corner anchoring" section describes. `corner` is
 * canonicalized here defensively (every real drag-resolve path —
 * `hexCorner.ts`'s `nearestCorner`, `straightWallGeometry.ts`'s
 * `snapStraightEndpoint` — already returns canonical form, but this
 * mutator doesn't trust that from an arbitrary caller). No-ops on an
 * out-of-range index, same "stale index is a UI race" discipline every
 * other index-addressed mutator here follows. Normalizes the WHOLE entry
 * first (`normalizeWallLineItem`) — dragging one endpoint of a still-
 * legacy line migrates both, not just the one being dragged. */
export function setWallLineEndpoint(
  cst: Document,
  index: number,
  which: 'from' | 'to',
  corner: CornerRef
): void {
  const lines = cst.get('wallLines');
  if (!isSeq(lines)) return;
  const item = lines.items[index];
  if (!isMap(item)) return;
  normalizeWallLineItem(cst, item);
  item.set(which, createCornerRefNode(cst, canonicalCorner(corner)));
}

/** The straight-wall Door tool applied to an EXISTING `wallLines:` entry:
 * toggles a door AT `cell` — adds one if absent, removes it if present —
 * the "click a point on the line to place/remove a door" symmetric
 * affordance TARGET-YAML.md's "Straight walls: doors" section describes.
 * `cell` is expected to already be validated against the line's own raw
 * (door-blind) footprint by the caller (`straightWallGeometry.ts`'s
 * `isValidDoorCell`) — this mutator itself is a plain toggle-by-value,
 * no geometry. An emptied `doors:` list is deleted entirely rather than
 * left as `doors: []`, matching this file's existing sparse-serialization
 * discipline elsewhere (e.g. `defaults:`). Normalizes the WHOLE entry
 * first (`normalizeWallLineItem`) — carving a door into a still-legacy
 * line migrates its endpoints too, same as `setWallLineEndpoint`. */
export function toggleWallLineDoorAt(
  cst: Document,
  lineIndex: number,
  cell: [number, number]
): void {
  const lines = cst.get('wallLines');
  if (!isSeq(lines)) return;
  const item = lines.items[lineIndex];
  if (!isMap(item)) return;
  normalizeWallLineItem(cst, item);
  const doorsNode = item.get('doors', true);
  if (isSeq(doorsNode)) {
    // `.get('cell')` returns a live `YAMLSeq`, not a plain array — see
    // `wallIndexAtEdge`/`holeIndexAt`'s own `.get(0)`/`.get(1)` pattern
    // above for why `Array.isArray` would silently never match here.
    const idx = doorsNode.items.findIndex((d) => {
      if (!isMap(d)) return false;
      const c = d.get('cell');
      return isSeq(c) && c.get(0) === cell[0] && c.get(1) === cell[1];
    });
    if (idx !== -1) {
      doorsNode.items.splice(idx, 1);
      if (doorsNode.items.length === 0) item.delete('doors');
      return;
    }
    const doorNode = cst.createNode({ cell }) as YAMLMap;
    doorNode.flow = true;
    const cellNode = doorNode.get('cell', true);
    if (isSeq(cellNode)) cellNode.flow = true;
    doorsNode.items.push(doorNode);
    return;
  }
  const doorsSeq = new YAMLSeq(cst.schema);
  doorsSeq.flow = true;
  const doorNode = cst.createNode({ cell }) as YAMLMap;
  doorNode.flow = true;
  const cellNode = doorNode.get('cell', true);
  if (isSeq(cellNode)) cellNode.flow = true;
  doorsSeq.items.push(doorNode);
  item.set('doors', doorsSeq);
}

/** A hole's index in `holes:`, matched by its [col,row] pair. */
function holeIndexAt(cst: Document, col: number, row: number): number {
  const holes = cst.get('holes');
  if (!isSeq(holes)) return -1;
  // `.get(0)`/`.get(1)` — see `wallIndexAt`'s doc comment for why
  // `.items[n]` would compare against an unresolved Scalar wrapper here.
  // (Not applicable to a hole created by `toggleHole` itself, which
  // assigns `.items` directly with raw numbers, same as `movePlacement`
  // — but IS applicable to any hole this concept round-trips through a
  // fresh `parseDocument`/`createNode` path, so `.get()` is the only
  // choice that's correct for both origins.)
  return holes.items.findIndex(
    (h) => isSeq(h) && h.get(0) === col && h.get(1) === row
  );
}

/** Hole tool: toggle a cell-native floor opening — target dialect, proposed. See
 * TARGET-YAML.md's "Structural palette category" for render/semantics
 * (impassable void; fall-damage is a future toolkit game-rule question,
 * not something this concept decides). */
export function toggleHole(cst: Document, col: number, row: number): void {
  const idx = holeIndexAt(cst, col, row);
  if (idx !== -1) {
    (cst.get('holes') as YAMLSeq).items.splice(idx, 1);
    return;
  }
  const holes = topSeq(cst, 'holes');
  const node = new YAMLSeq(cst.schema);
  node.flow = true;
  node.items = [col, row];
  holes.items.push(node);
}

function setPointField(
  cst: Document,
  key: 'start' | 'end',
  at: [number, number] | null
): void {
  if (at === null) {
    cst.delete(key);
    return;
  }
  const node = new YAMLSeq(cst.schema);
  node.flow = true;
  node.items = [...at];
  cst.set(key, node);
}

/** Author-placed party spawn — target dialect, proposed. See TARGET-YAML.md's "start"
 * section for the real, unresolved tension with the generator-chosen
 * `FloorPlan.entrance`. */
export function setStart(cst: Document, at: [number, number] | null): void {
  setPointField(cst, 'start', at);
}

/** The goal — target dialect, proposed, with no analog anywhere in the compiled
 * `FloorPlan` today. See TARGET-YAML.md's "end" section. */
export function setEnd(cst: Document, at: [number, number] | null): void {
  setPointField(cst, 'end', at);
}

/** Dungeon-wide lighting config — target dialect, proposed. `ambient: null` removes
 * the whole `lighting:` block. See TARGET-YAML.md's "lighting" section. */
export function setLightingAmbient(
  cst: Document,
  ambient: number | null
): void {
  if (ambient === null) {
    cst.delete('lighting');
    return;
  }
  const existing = cst.get('lighting', true);
  if (isMap(existing)) {
    existing.set('ambient', ambient);
    return;
  }
  const node = cst.createNode({ ambient }) as YAMLMap;
  cst.set('lighting', node);
}

// ============================================================
// regions: — cell-authored semantic room regions, target dialect,
// proposed (rpg-project#180). See RegionDoc's own doc comment and
// TARGET-YAML.md's "regions:" section for the full design writeup.
// ============================================================

export class RegionValidationError extends Error {}

/** The evidence a plain "already belongs to another region" rejection
 * lacked — Kirk, live authoring (region-brush honesty round, 2026-08-06):
 * "it says 'one or more cells already belong to another region'... with
 * NO indication which cells or whose." Finds the FIRST existing region
 * (other than `excludeRegionId`) that owns any of `cells`, and returns
 * exactly which of `cells` collide with it — capped to
 * `OVERLAP_SAMPLE_CELLS`, the same "representative handful, not a full
 * accounting" convention `regionTree.ts`'s own `RegionOverlapWarning`
 * uses for the sibling case (two EXISTING regions overlapping in a
 * hand-pasted document, rather than a CANDIDATE cell set colliding with
 * one). Only the first colliding region is reported: every caller today
 * (the region-brush's own per-cell paint check, and `createRegion`'s
 * whole-pending-set check at Create time) either passes a single cell or
 * a pending set that, by construction, never straddles two owners in a
 * way worth reporting simultaneously — see this function's own callers
 * for why. `null` when `cells` doesn't collide with anything.
 *
 * **Single-cell fast path** (Copilot review, PR #714): the region brush's
 * own per-cell paint check — the hot path, called once per cell touched
 * during a drag, many times a second — always passes exactly one cell.
 * Building a `Set` of an entire region's cells just to test ONE
 * membership is allocation churn for no benefit at that shape, so
 * `cells.length === 1` scans `region.cells` directly with `.some()`
 * instead — no Set, no array allocation, short-circuits on the first
 * hit. Deliberately NOT a precomputed whole-doc ownership index: this
 * concept's regions top out at a handful-to-dozens of cells each
 * (CONTRACT.md), so a per-call linear scan is already cheap; an index
 * would trade a real allocation cost for a bookkeeping cost (keeping it
 * in sync with every region mutation) to solve a problem that doesn't
 * exist yet at this scale. The multi-cell path (`createRegion`'s
 * whole-pending-set check at Create time) keeps the `Set`-based approach
 * below — there, the candidate set can be large enough that a Set
 * actually pays for itself. */
export function findRegionCellOverlap(
  doc: DungeonDoc,
  cells: readonly Cell[],
  excludeRegionId?: string
): {
  ownerId: string;
  ownerName?: string;
  cells: Cell[];
  cellCount: number;
} | null {
  if (cells.length === 1) {
    const [only] = cells;
    for (const region of doc.regions) {
      if (region.id === excludeRegionId) continue;
      if (region.cells.some((c) => c[0] === only[0] && c[1] === only[1])) {
        return {
          ownerId: region.id,
          ownerName: region.name,
          cells: [only],
          cellCount: 1,
        };
      }
    }
    return null;
  }
  for (const region of doc.regions) {
    if (region.id === excludeRegionId) continue;
    const owned = new Set(region.cells.map((c) => `${c[0]},${c[1]}`));
    const hits = cells.filter((c) => owned.has(`${c[0]},${c[1]}`));
    if (hits.length > 0) {
      return {
        ownerId: region.id,
        ownerName: region.name,
        cells: hits.slice(0, OVERLAP_SAMPLE_CELLS),
        cellCount: hits.length,
      };
    }
  }
  return null;
}

/** Whether `cells` shares any member with an EXISTING region OTHER than
 * `excludeRegionId` (the region currently being edited, if any) —
 * rpg-project#180's own "Overlapping... cell sets fail" acceptance
 * criterion. A thin boolean wrapper over `findRegionCellOverlap` — kept
 * as its own export since most callers (`validateRegionCells` below)
 * only ever needed the yes/no answer before this unit gave the overlap
 * itself a shape worth returning. */
export function cellsOverlapAnotherRegion(
  doc: DungeonDoc,
  cells: readonly Cell[],
  excludeRegionId?: string
): boolean {
  return findRegionCellOverlap(doc, cells, excludeRegionId) !== null;
}

/** Validate a candidate cell set for `createRegion`/membership edits —
 * rpg-project#180's own acceptance criteria ("Overlapping, disconnected,
 * empty, and invalid cell sets fail with author-facing validation
 * errors"), enforced client-side here so this concept's authoring surface
 * can never produce a document the eventual real #180 validator is
 * already known to reject. Returns a human-readable rejection reason, or
 * `null` when the cell set is valid. `excludeRegionId` lets a membership
 * edit on region X check its own PROPOSED new cell set against every
 * OTHER region without X's own existing cells counting as a
 * self-overlap. */
export function validateRegionCells(
  doc: DungeonDoc,
  cells: readonly Cell[],
  excludeRegionId?: string
): string | null {
  if (cells.length === 0) return 'a region needs at least one cell';
  const seen = new Set<string>();
  for (const c of cells) {
    const key = `${c[0]},${c[1]}`;
    if (seen.has(key)) return `cell [${c[0]},${c[1]}] is selected twice`;
    seen.add(key);
  }
  if (!cellsAreContiguous(cells)) {
    return 'cells must be hex-contiguous (rpg-project#180)';
  }
  const overlap = findRegionCellOverlap(doc, cells, excludeRegionId);
  if (overlap) {
    const label = overlap.ownerName ?? overlap.ownerId;
    // Named region + exact count — the evidence the old generic message
    // lacked (this function's own doc comment on `findRegionCellOverlap`
    // above has the full "why"). `cellCount` (the TRUE count) drives the
    // number, not `overlap.cells.length` (the capped sample) — a stroke
    // that collides on 9 cells should say "9", not silently cap the
    // reported count to 6 just because the cell LIST itself is capped.
    return `${pluralCount(overlap.cellCount, 'cell')} already belong${overlap.cellCount === 1 ? 's' : ''} to '${label}'`;
  }
  return null;
}

function regionsSeqReadonly(cst: Document): YAMLSeq | undefined {
  const existing = cst.get('regions', true);
  return isSeq(existing) ? existing : undefined;
}

function findRegionIndex(cst: Document, regionId: string): number {
  const regions = regionsSeqReadonly(cst);
  if (!regions) return -1;
  return regions.items.findIndex((r) => isMap(r) && r.get('id') === regionId);
}

function regionMap(cst: Document, regionId: string): YAMLMap {
  const idx = findRegionIndex(cst, regionId);
  if (idx === -1) throw new DungeonParseError(`Unknown region "${regionId}"`);
  const region = (cst.get('regions') as YAMLSeq).items[idx];
  if (!isMap(region))
    throw new DungeonParseError(`region "${regionId}" is not a map`);
  return region;
}

/** Build a block-style `{ id, name?, archetype, cells: [[c,r],...] }` node
 * — block (not flow) at the region's own top level so a region with many
 * cells doesn't produce one unreadably long line, but the `cells:`
 * sequence itself and each `[c,r]` pair inside it ARE flow-style, matching
 * every other cell-native list in this file (`walls:`, `holes:`, `at:`). */
function createRegionNode(
  cst: Document,
  region: { id: string; name?: string; archetype: string; cells: Cell[] }
): YAMLMap {
  const obj: Record<string, unknown> = { id: region.id };
  if (region.name) obj.name = region.name;
  obj.archetype = region.archetype;
  obj.cells = region.cells;
  const node = cst.createNode(obj) as YAMLMap;
  const cellsNode = node.get('cells', true);
  if (isSeq(cellsNode)) {
    cellsNode.flow = true;
    for (const item of cellsNode.items) {
      if (isSeq(item)) item.flow = true;
    }
  }
  return node;
}

/** Create a new cell-authored semantic region — target dialect, proposed
 * (rpg-project#180). Throws `RegionValidationError` (a duplicate id, or a
 * cell set `validateRegionCells` rejects) rather than silently no-op-ing
 * or producing an invalid document — the region-authoring panel should
 * catch this and surface the message, not let it propagate as an
 * unhandled error. */
export function createRegion(
  cst: Document,
  doc: DungeonDoc,
  id: string,
  archetype: string,
  cells: Cell[],
  name?: string
): void {
  if (findRegionIndex(cst, id) !== -1) {
    throw new RegionValidationError(`region "${id}" already exists`);
  }
  const reason = validateRegionCells(doc, cells);
  if (reason) throw new RegionValidationError(reason);
  const regions = topSeq(cst, 'regions');
  regions.items.push(createRegionNode(cst, { id, name, archetype, cells }));
}

/** Remove a region entirely — target dialect, proposed. A no-op if the id
 * doesn't exist, matching this file's general "clearing something absent
 * is fine" discipline. Never touches `walls:` — an attachment door edge a
 * `connectRegions` call placed on this region's former boundary is
 * independent authored content (see `connectRegions`'s own doc comment)
 * and survives the region's own deletion, same as a hand-drawn wall
 * survives whatever rooms it happened to sit near. */
export function deleteRegion(cst: Document, regionId: string): void {
  const idx = findRegionIndex(cst, regionId);
  if (idx === -1) return;
  (cst.get('regions') as YAMLSeq).items.splice(idx, 1);
}

/** Set or clear a region's optional `name:` — target dialect, proposed.
 * `null` or an empty/whitespace-only string clears the key entirely
 * (falls back to `id` as the label, same as a room). */
export function renameRegion(
  cst: Document,
  regionId: string,
  name: string | null
): void {
  const region = regionMap(cst, regionId);
  if (name === null || name.trim() === '') region.delete('name');
  else region.set('name', name);
}

/** Set a region's `archetype:` — target dialect, proposed. Same
 * vocabulary `RoomDoc.archetype` uses (entrance|chamber|corridor|boss);
 * not enforced as an enum here (rooms aren't validated against one
 * client-side either — dungeonspec's own real validator would own that
 * the day #180 lands). */
export function setRegionArchetype(
  cst: Document,
  regionId: string,
  archetype: string
): void {
  const region = regionMap(cst, regionId);
  region.set('archetype', archetype);
}

function regionCellsSeq(cst: Document, regionId: string): YAMLSeq {
  const region = regionMap(cst, regionId);
  const existing = region.get('cells', true);
  if (isSeq(existing)) return existing;
  const seq = new YAMLSeq(cst.schema);
  seq.flow = true;
  region.set('cells', seq);
  return seq;
}

/** Add one cell to an existing region's membership — validated against
 * rpg-project#180's own contiguity/overlap rules (`validateRegionCells`),
 * same as `createRegion`, so an interactive "click to add a cell" board
 * affordance can never grow a region into an invalid shape. A no-op (not
 * an error) when `cell` is already a member — matching this file's
 * general toggle-shaped mutators. Throws `RegionValidationError` when
 * adding would make the region non-contiguous (a cell not touching any
 * existing member) or would claim a cell another region already owns. */
export function addCellToRegion(
  cst: Document,
  doc: DungeonDoc,
  regionId: string,
  cell: Cell
): void {
  const region = doc.regions.find((r) => r.id === regionId);
  if (!region) throw new DungeonParseError(`Unknown region "${regionId}"`);
  if (region.cells.some((c) => cellsEqual(c, cell))) return;
  const nextCells = [...region.cells, cell];
  const reason = validateRegionCells(doc, nextCells, regionId);
  if (reason) throw new RegionValidationError(reason);
  const cellsSeq = regionCellsSeq(cst, regionId);
  const cellNode = new YAMLSeq(cst.schema);
  cellNode.flow = true;
  cellNode.items = [...cell];
  cellsSeq.items.push(cellNode);
}

/** Remove one cell from an existing region's membership — target
 * dialect, proposed. A no-op when `cell` isn't currently a member.
 * Refuses (throws `RegionValidationError`) a removal that would leave the
 * region either EMPTY (delete the region instead — `deleteRegion`) or
 * DISCONNECTED into two pieces — rpg-project#180's acceptance criteria
 * apply to every post-edit state, not just creation, so this mutator
 * enforces them on the way out the same way `addCellToRegion` enforces
 * them on the way in. */
export function removeCellFromRegion(
  cst: Document,
  doc: DungeonDoc,
  regionId: string,
  cell: Cell
): void {
  const region = doc.regions.find((r) => r.id === regionId);
  if (!region) throw new DungeonParseError(`Unknown region "${regionId}"`);
  const nextCells = region.cells.filter((c) => !cellsEqual(c, cell));
  if (nextCells.length === region.cells.length) return;
  if (nextCells.length === 0) {
    throw new RegionValidationError(
      'cannot remove the last cell — delete the region instead'
    );
  }
  if (!cellsAreContiguous(nextCells)) {
    throw new RegionValidationError(
      'removing this cell would split the region into two disconnected pieces'
    );
  }
  const cellsSeq = regionCellsSeq(cst, regionId);
  const idx = cellsSeq.items.findIndex(
    (c) => isSeq(c) && c.get(0) === cell[0] && c.get(1) === cell[1]
  );
  if (idx !== -1) cellsSeq.items.splice(idx, 1);
}

export interface ConnectRegionsResult {
  /** The edge a door was placed on, or `null` when the two regions share
   * no orthogonal boundary at all (nothing was written). */
  edge: { from: Cell; to: Cell } | null;
}

/** "Attach to next region" (Kirk's ask) — places a DOOR edge on the
 * shared boundary between two regions, chosen via `regionGeometry.ts`'s
 * `pickAttachmentEdge` (the midpoint of the shared boundary run; see that
 * function's own doc comment for why an automatic midpoint, not an
 * author-clicked edge, was this round's choice).
 *
 * Mechanically this is nothing more than an ordinary `setWallEdge(cst,
 * edge.from, edge.to, 'door', true)` call — a region-attachment door is
 * DISTINCT from a chain `connectors:` entry (TARGET-YAML.md's "region
 * attachment vs. chain connectors" section has the full writeup): a
 * connector's `from`/`to` are fixed by declared-room order and validated
 * server-side (`validateChain`, `rpg-toolkit/encounter/dungeonspec/
 * validate.go`) — an authored door edge does NOT replace, satisfy, or
 * count as one (confirmed against the real Go source, rpg-project#175's
 * spot-check finding). A region-attachment door is just another `walls:`
 * entry: freely authorable, no chain participation, no cardinality
 * constraint. Two regions can be "attached" by any number of doors, or by
 * none at all — this function is a convenience for placing one, not a
 * requirement the document enforces.
 *
 * Returns `{ edge: null }` (writes nothing) when the two regions share no
 * orthogonal boundary — the caller should surface this as a rejection
 * ("these regions aren't adjacent"), not treat it as silent success. */
export function connectRegions(
  cst: Document,
  doc: DungeonDoc,
  regionAId: string,
  regionBId: string
): ConnectRegionsResult {
  const a = doc.regions.find((r) => r.id === regionAId);
  const b = doc.regions.find((r) => r.id === regionBId);
  if (!a || !b) {
    throw new DungeonParseError('connectRegions: unknown region');
  }
  const edges = sharedBoundaryEdges(a.cells, b.cells);
  const edge = pickAttachmentEdge(edges);
  if (!edge) return { edge: null };
  setWallEdge(cst, edge.from, edge.to, 'door', true);
  return { edge };
}

/** `DefaultableField`'s camelCase name -> the wire's snake_case key —
 * one lookup table so `setRefDefault`/`clearRefDefault` share a single
 * mapping instead of hand-rolling it twice. */
const DEFAULT_FIELD_KEYS: Record<DefaultableField, string> = {
  targeting: 'targeting',
  blocksMovement: 'blocks_movement',
  blocksLos: 'blocks_los',
  height: 'height',
  facing: 'facing',
};

/** Get-or-create the top-level `defaults:` map — same "get or create,
 * mutate the live node" discipline as `topSeq`, for a `YAMLMap` instead
 * of a `YAMLSeq`. */
function defaultsMap(cst: Document): YAMLMap {
  const existing = cst.get('defaults', true);
  if (isMap(existing)) return existing;
  const node = new YAMLMap(cst.schema);
  cst.set('defaults', node);
  return node;
}

/** A ref's own entry inside `defaults:` — created flow-style
 * (`{ targeting: ... }`, matching every other small inline map this file
 * creates) when `create` is true and absent; `undefined` when `create` is
 * false and either `defaults:` or the ref's own entry doesn't exist yet
 * (the read-only path `clearRefDefault` uses — clearing a field that was
 * never set is a no-op, not an error). */
function refDefaultEntry(
  cst: Document,
  ref: string,
  create: boolean
): YAMLMap | undefined {
  if (!create) {
    const existing = cst.get('defaults', true);
    if (!isMap(existing)) return undefined;
    const entry = existing.get(ref, true);
    return isMap(entry) ? entry : undefined;
  }
  const defaults = defaultsMap(cst);
  const existing = defaults.get(ref, true);
  if (isMap(existing)) return existing;
  const node = new YAMLMap(cst.schema);
  node.flow = true;
  // The key must be an explicit `Scalar` (not a plain JS string handed to
  // `.set()`, which `yaml` stores as a bare string and only wraps at
  // stringify time, too late to mark it quoted) to force double-quoting —
  // matching `createPlacementNode`'s own `ref` field and TARGET-YAML.md's
  // annotated example (`"dnd5e:monsters:skeleton": { ... }`). A
  // colon-bearing key parses fine unquoted in block style too, but
  // quoting keeps every ref-shaped key in this file rendered identically,
  // never ambiguous.
  const keyNode = new Scalar(ref);
  keyNode.type = Scalar.QUOTE_DOUBLE;
  defaults.set(keyNode, node);
  return node;
}

/** Set (or update) one field of a ref's dungeon-wide `defaults:` entry —
 * target dialect, proposed, Kirk's ask verbatim: "maybe we can set a
 * default for all skeletons." See `DungeonDoc.defaults`'s own doc
 * comment for the full design. Creates `defaults:` and the ref's own
 * flow-style entry if either is absent yet. `facing` is written as the
 * same `HEX_FACING_LABELS` string every other facing field uses
 * (`facingLabel`), matching `setPlacementFacing`'s own convention —
 * never a bare numeric index on the wire.
 *
 * Deliberately does NOT reach into any existing placement of this ref
 * and stamp the value on — the whole point of a ref-level default is
 * that placements stay sparse and inherit through `resolvePlacement` at
 * read time, not that authoring one rewrites every instance that already
 * exists. */
export function setRefDefault(
  cst: Document,
  ref: string,
  field: DefaultableField,
  value: string | number | boolean
): void {
  const entry = refDefaultEntry(cst, ref, true)!;
  const key = DEFAULT_FIELD_KEYS[field];
  entry.set(key, field === 'facing' ? facingLabel(value as number) : value);
}

/** Clear one field from a ref's `defaults:` entry — target dialect,
 * proposed. Removes the ref's own entry entirely once its last field is
 * cleared, and removes `defaults:` itself once its last ref is cleared —
 * an empty `{}` / stray `defaults: {}` left behind after every field is
 * reverted would be a no-op construct on the wire, the same
 * "don't materialize nothing" discipline `setLightingAmbient`/
 * `setConnectorLocked` already follow via `cst.delete(...)`. A no-op
 * (not an error) when the field, the ref's entry, or `defaults:` itself
 * doesn't exist yet — matching every other `clear`-shaped mutator in
 * this file (e.g. `setPlacementFacing(cst, ..., null)` on a placement
 * with no `facing:` key). */
export function clearRefDefault(
  cst: Document,
  ref: string,
  field: DefaultableField
): void {
  const entry = refDefaultEntry(cst, ref, false);
  if (!entry) return;
  entry.delete(DEFAULT_FIELD_KEYS[field]);
  if (entry.items.length === 0) {
    const defaults = cst.get('defaults', true);
    if (isMap(defaults)) {
      defaults.delete(ref);
      if (defaults.items.length === 0) cst.delete('defaults');
    }
  }
}

/** Bake every INHERITED `blocks_movement`/`blocks_los` value onto the CST
 * placement that inherits it — the materialize-on-strip half of
 * `defaults:` (target dialect, proposed, see `DungeonDoc.defaults`'s own
 * doc comment). Called by `stripToV1Subset` BEFORE `defaults:` itself is
 * dropped and before any other stripping runs, so it can still see the
 * original `defaults:` map and the original (pre-mapping) top-level
 * `place:` list.
 *
 * Only `blocks_movement`/`blocks_los` are handled here — they're the
 * only two defaultable fields with a real v1 wire representation on a
 * prop placement at all. `targeting`/`height`/`facing` have NO v1
 * representation regardless of whether they're inherited or explicit;
 * they're simply dropped (and counted) by the existing
 * `stripPlacementFields` pass further down, same as always — inheriting
 * one doesn't make it any more compilable. Monster placements are
 * skipped entirely: `dungeonspec.Validate` rejects `blocks_movement`/
 * `blocks_los` on a monster ref (confirmed real, see `PlacementDoc.isMonster`'s
 * own doc comment), so materializing either onto one would turn a
 * currently-valid v1 subset into one the real server rejects — a
 * monster ref's `defaults:` entry is only ever meaningful for
 * `targeting`, which this function doesn't touch anyway.
 *
 * Walks the CST in lockstep with `doc` (`doc` was derived from this same
 * `cst` via `toDungeonDoc`, so `doc.rooms[i].place[j]` and the `j`-th
 * item of `cst`'s `rooms[i].place:` sequence are guaranteed to be the
 * same node in the same order) rather than re-resolving placements by
 * ref/at, which would be ambiguous the moment two placements share a
 * ref and a defaults entry differs from what either one already has
 * explicit. */
function materializeRefDefaults(
  cst: Document,
  doc: DungeonDoc
): { usedRefs: Set<string>; placementsMaterialized: number } {
  const usedRefs = new Set<string>();
  let placementsMaterialized = 0;

  const materializeOne = (item: YAMLMap, placement: PlacementDoc) => {
    if (placement.isMonster) return;
    const resolved = resolvePlacement(doc, placement);
    let touched = false;
    if (resolved.inheritedFrom.blocksMovement) {
      item.set('blocks_movement', resolved.blocksMovement);
      touched = true;
    }
    if (resolved.inheritedFrom.blocksLos) {
      item.set('blocks_los', resolved.blocksLos);
      touched = true;
    }
    if (touched) {
      usedRefs.add(placement.ref);
      placementsMaterialized++;
    }
  };

  const roomsSeq = cst.get('rooms');
  if (isSeq(roomsSeq)) {
    roomsSeq.items.forEach((room, ri) => {
      if (!isMap(room)) return;
      const place = room.get('place', true);
      const docPlacements = doc.rooms[ri]?.place;
      if (!isSeq(place) || !docPlacements) return;
      place.items.forEach((item, pi) => {
        if (isMap(item) && docPlacements[pi]) {
          materializeOne(item, docPlacements[pi]);
        }
      });
    });
  }

  const topPlace = cst.get('place');
  if (isSeq(topPlace)) {
    topPlace.items.forEach((item, pi) => {
      if (isMap(item) && doc.place[pi]) {
        materializeOne(item, doc.place[pi]);
      }
    });
  }

  return { usedRefs, placementsMaterialized };
}

export interface V1SubsetResult {
  /** The stripped, v1-only YAML text — always `version: 1`, never any
   * target-dialect-only field the server doesn't currently accept (an
   * ACCEPTED field, per `capabilities`, survives verbatim — see this
   * function's own doc comment). */
  yaml: string;
  /** Human-readable list of what got dropped ("3 walls", "1 hole",
   * "start", "facing (2 placements)", "lighting") — empty when the input
   * uses no target-dialect construct the server currently rejects. Drives
   * the "Save the compilable subset" diff summary (TARGET-YAML.md) and
   * the amber half of the compile-badge strip. */
  dropped: string[];
  /** The mirror of `dropped`: target-dialect constructs present in the
   * input that `capabilities` says THIS server currently accepts, and
   * that therefore survived into `yaml` unstripped — "2 walls", "start".
   * Always empty when `capabilities` is omitted (the conservative static
   * fallback strips everything target-dialect, same as before this
   * field existed) — never a guess. Drives the confirming half of the
   * compile-badge strip, so a badge flips from "Dropped" to "Uses
   * (compiles)" automatically the moment a server capability changes,
   * with no static list to hand-edit. */
  compiling: string[];
  /** False when the stripped result is genuinely unsavable — dungeonspec's
   * own real server-side minimums, not a target-dialect concern:
   * `minRooms = 2` (validate.go), and (verified live, this unit,
   * 2026-08-04 — not previously documented anywhere in this concept) the
   * chain must contain EXACTLY ONE boss-archetype room with a declared
   * `boss:` ("dungeon must have exactly one boss room, found 0" is a
   * real, current rejection, not a guess). See `compilableBlockers` for
   * which of these is the actual reason, when false. */
  compilable: boolean;
  /** Human-readable reasons `compilable` is false ("needs at least 2
   * rooms (has 1)", "needs exactly one boss-archetype room with a
   * declared boss") — empty when `compilable` is true. Lets the Save &
   * Play tooltip name the SPECIFIC blocking constraint instead of one
   * hardcoded message that may not be the actual reason (a from-scratch
   * canvas with 2 plain rooms and no boss room fails the real server for
   * a different reason than "fewer than 2 rooms," and deserves a
   * different tooltip). */
  compilableBlockers: string[];
}

/** Exported so `useRegionEditing.ts`'s brush-stroke skip summary (region-
 * brush honesty round, 2026-08-06 — "painted 12, skipped 4 owned by
 * 'entrance'") uses the SAME pluralization this file's own compile-badge
 * strip does, instead of a second hand-rolled copy. */
export function pluralCount(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Which `DialectField` governs a placement's own `facing:` — the real
 * server distinguishes by entry type (verified live, this unit,
 * 2026-08-04: a room-scoped, non-monster, non-`mount:wall` floor prop's
 * facing compiles; every other shape decodes but is explicitly rejected,
 * `"unsupported capability: facing only supported on room-scoped floor
 * props"`), so a single blanket `facing` capability can't answer "is
 * THIS placement's facing accepted" correctly for anything but the one
 * shape that currently works. `BossDoc` entries never call this — they
 * always use `facingBoss` directly (see `stripToV1Subset` below), since
 * `BossDoc` carries no `isMonster`/`mount` to dispatch on. */
function facingCapabilityFor(placement: {
  isMonster: boolean;
  mount: Mount;
}): DialectField {
  if (placement.isMonster) return 'facingMonster';
  if (placement.mount === 'wall') return 'facingWallMount';
  return 'facingFloorProp';
}

/** Strip a target-dialect document down to exactly what dungeonspec
 * compiles TODAY, ON THIS SERVER — TARGET-YAML.md's "The v1-subset
 * strip" table, generalized from a static snapshot to a live one.
 * Parses a FRESH CST from `yamlText` (never mutates a caller's live board
 * CST), so this is safe to call on every live-preview debounce tick and
 * every Save & Play click without disturbing what the author is editing.
 *
 * `capabilities` (optional, `capabilityProbe.ts`'s `ServerCapabilities`)
 * is the truth this function now checks before stripping ANY
 * target-dialect field: present AND accepted → kept verbatim, counted in
 * `compiling`; present and not accepted (or `capabilities` omitted
 * entirely — fixtures mode, or a probe that hasn't completed yet) →
 * stripped exactly as before this unit, counted in `dropped`. This is
 * the ONLY behavior change from the prior static version: every stripping
 * DECISION below now asks `accepted(field)` first; the actual strip
 * mechanics (CST deletes, `dropped`/`compiling` bookkeeping) are
 * unchanged.
 *
 * `defaults:` is the one construct that isn't a plain keep-or-strip
 * toggle even when NOT accepted: `materializeRefDefaults` bakes every
 * inherited `blocks_movement`/`blocks_los` onto its placement FIRST, so
 * the returned subset preserves the authored behavior a default was
 * standing in for. `targeting`/`height`/`facing` defaults have no v1
 * representation regardless of inheritance and are lost the same way an
 * explicit one would be — only counted via the `defaults (...)` entry,
 * never double-counted in the per-field facing/height/targeting tallies
 * further down (those only ever count a literal key actually present on
 * the instance). If `defaults` IS accepted, none of this runs — the whole
 * `defaults:` block is kept exactly as authored, materialization
 * skipped entirely (nothing to bake onto anything; the server now
 * resolves the inheritance itself). */
export function stripToV1Subset(
  yamlText: string,
  capabilities?: ServerCapabilities
): V1SubsetResult {
  const { cst, doc } = parseDungeon(yamlText);
  const dropped: string[] = [];
  const compiling: string[] = [];
  const accepted = (field: DialectField): boolean =>
    capabilities?.[field]?.accepted === true;

  cst.set('version', 1);

  if (doc.canvas) {
    if (accepted('canvas')) {
      compiling.push('canvas');
    } else {
      dropped.push('canvas');
      cst.delete('canvas');
    }
  }

  if (Object.keys(doc.defaults).length > 0 && accepted('defaults')) {
    compiling.push(
      pluralCount(Object.keys(doc.defaults).length, 'default ref')
    );
  } else {
    // Materialize-on-strip (see `materializeRefDefaults`'s own doc
    // comment): bake every INHERITED blocks_movement/blocks_los onto its
    // placement BEFORE defaults: is dropped below, so the compilable
    // subset preserves the authored behavior a ref-level default was
    // standing in for — a `blocks_movement: true` default silently
    // vanishing on strip would be exactly the kind of gap CONTRACT.md's
    // "entrance-blocked" UX learning exists to catch, just moved from the
    // live board to the saved subset.
    const { usedRefs: defaultRefsUsed, placementsMaterialized } =
      materializeRefDefaults(cst, doc);
    const defaultRefCount = Object.keys(doc.defaults).length;
    if (defaultRefCount > 0) {
      dropped.push(
        placementsMaterialized > 0
          ? `defaults (${defaultRefCount} ref${defaultRefCount === 1 ? '' : 's'}; blocks_movement/blocks_los materialized onto ${placementsMaterialized} placement${placementsMaterialized === 1 ? '' : 's'} from ${defaultRefsUsed.size} of them)`
          : `defaults (${defaultRefCount} ref${defaultRefCount === 1 ? '' : 's'})`
      );
    }
    cst.delete('defaults');
  }

  if (doc.walls.length > 0) {
    if (accepted('walls')) {
      compiling.push(pluralCount(doc.walls.length, 'wall'));
    } else {
      dropped.push(pluralCount(doc.walls.length, 'wall'));
      cst.delete('walls');
    }
  }

  // Straight walls — a sibling target-dialect-only construct to `walls:`
  // above, NOT probed (see capabilityProbe.ts's own doc comment: it's
  // this concept's own client-side sugar, never sent to the real server
  // in any form) — always dropped, counted separately from the edge-wall
  // tally since the two are genuinely different authoring constructs
  // (see `WallLineDoc`'s own doc comment).
  if (doc.wallLines.length > 0) {
    dropped.push(pluralCount(doc.wallLines.length, 'straight wall'));
  }
  cst.delete('wallLines');

  if (doc.holes.length > 0) {
    if (accepted('holes')) {
      compiling.push(pluralCount(doc.holes.length, 'hole'));
    } else {
      dropped.push(pluralCount(doc.holes.length, 'hole'));
      cst.delete('holes');
    }
  }

  // Cell-authored semantic regions (rpg-project#180). A door edge a
  // `connectRegions` call placed on a region's boundary is a SEPARATE
  // `walls:` entry (see `connectRegions`'s own doc comment) and is
  // handled independently by the `walls:` block above — this block never
  // touches it either way.
  if (doc.regions.length > 0) {
    if (accepted('regions')) {
      compiling.push(pluralCount(doc.regions.length, 'region'));
    } else {
      dropped.push(pluralCount(doc.regions.length, 'region'));
      cst.delete('regions');
    }
  }

  // start/end are INDEPENDENT capabilities, not one combined toggle —
  // verified live, this unit, 2026-08-04: a bare `start: [c,r]` compiles
  // today, `end:` does not (no schema representation of any kind, per
  // this file's own `DungeonDoc.end` doc comment) — collapsing them into
  // one "start/end" check (the prior behavior) would either wrongly keep
  // `end:` or wrongly strip a compiling `start:`.
  if (doc.start) {
    if (accepted('start')) {
      compiling.push('start');
    } else {
      dropped.push('start');
      cst.delete('start');
    }
  }
  if (doc.end) {
    if (accepted('end')) {
      compiling.push('end');
    } else {
      dropped.push('end');
      cst.delete('end');
    }
  }

  if (doc.lighting) {
    if (accepted('lighting')) {
      compiling.push('lighting');
    } else {
      dropped.push('lighting');
      cst.delete('lighting');
    }
  }

  // Top-level place: (TARGET-YAML.md's "top-level placement" section) has
  // no v1 analog at all when NOT accepted; dungeonspec only knows
  // room-scoped place:. Not accepted (today's server): a top-level entry
  // whose absolute column falls inside a declared room's own column range
  // MAPS DOWN into that room's place: list (absolute -> room-local `at`)
  // rather than being lost; one outside every room's range has no v1 home
  // and is dropped. Room bounds use the SAME startColumn accumulation
  // rule floorPlanCompile.ts uses server-side. Accepted: the whole
  // top-level `place:` list is kept exactly as authored — no mapping, no
  // room-scoping — and each of ITS items still gets the same per-field
  // (facing/mount/height/targeting/rotate_degrees) stripping every
  // room-scoped placement gets, via the pass below.
  let mappedPlacementCount = 0;
  let outOfRoomPlacementCount = 0;
  const topLevelPlaceAccepted = accepted('topLevelPlace');
  const topPlace = cst.get('place');
  if (isSeq(topPlace) && topPlace.items.length > 0) {
    if (topLevelPlaceAccepted) {
      compiling.push(pluralCount(topPlace.items.length, 'top-level placement'));
    } else {
      const roomBounds = doc.rooms.reduce<
        { id: string; startColumn: number; width: number }[]
      >((acc, r) => {
        const prev = acc[acc.length - 1];
        const startColumn = prev ? prev.startColumn + prev.width + 1 : 0;
        acc.push({ id: r.id, startColumn, width: r.width });
        return acc;
      }, []);
      for (const item of [...topPlace.items]) {
        if (!isMap(item)) continue;
        const atNode = item.get('at');
        if (!isSeq(atNode)) continue;
        const col = atNode.get(0) as number;
        const row = atNode.get(1) as number;
        const room = roomBounds.find(
          (r) => col >= r.startColumn && col < r.startColumn + r.width
        );
        if (!room) {
          outOfRoomPlacementCount++;
          continue;
        }
        const localAtNode = new YAMLSeq(cst.schema);
        localAtNode.flow = true;
        localAtNode.items = [col - room.startColumn, row];
        item.set('at', localAtNode);
        placeSeq(cst, room.id).items.push(item);
        mappedPlacementCount++;
      }
      cst.delete('place');
      if (mappedPlacementCount > 0) {
        dropped.push(
          `${mappedPlacementCount} top-level placement${mappedPlacementCount === 1 ? '' : 's'} (mapped into rooms)`
        );
      }
      if (outOfRoomPlacementCount > 0) {
        dropped.push(
          `${outOfRoomPlacementCount} top-level placement${outOfRoomPlacementCount === 1 ? '' : 's'} outside any room`
        );
      }
    }
  }

  let facingDroppedCount = 0;
  let facingCompilingCount = 0;
  let mountDroppedCount = 0;
  let mountCompilingCount = 0;
  let heightDroppedCount = 0;
  let heightCompilingCount = 0;
  let targetingDroppedCount = 0;
  let targetingCompilingCount = 0;
  let rotationDroppedCount = 0;
  let rotationCompilingCount = 0;

  // Shared by every room-scoped place:/boss: entry AND (when
  // topLevelPlaceAccepted) every kept top-level place: entry — one place
  // this per-field stripping logic lives, rather than duplicated per
  // caller. `facingCap` is resolved by the CALLER (facingCapabilityFor
  // for a PlacementDoc, or the literal 'facingBoss' for a BossDoc) since
  // only the caller knows which doc/index it's looking at.
  const stripPlacementFields = (item: YAMLMap, facingCap: DialectField) => {
    if (item.has('facing')) {
      if (accepted(facingCap)) {
        facingCompilingCount++;
      } else {
        item.delete('facing');
        facingDroppedCount++;
      }
    }
    // mount/height are DECOUPLED (Kirk-batch, 2026-08-02): a placement
    // can carry either, both, or neither, so each is counted and
    // stripped independently, matching rotate_degrees's own already-
    // independent shape below.
    if (item.has('mount')) {
      if (accepted('mount')) {
        mountCompilingCount++;
      } else {
        item.delete('mount');
        mountDroppedCount++;
      }
    }
    if (item.has('height')) {
      if (accepted('height')) {
        heightCompilingCount++;
      } else {
        item.delete('height');
        heightDroppedCount++;
      }
    }
    if (item.has('targeting')) {
      if (accepted('targeting')) {
        targetingCompilingCount++;
      } else {
        item.delete('targeting');
        targetingDroppedCount++;
      }
    }
    // EXPERIMENT, not even a target-dialect proposal — never probed,
    // never accepted; kept as its own always-strip counter so a future
    // probe result can slot in the same `accepted('rotationDegrees')`
    // shape as every other field without a second code path.
    if (item.has('rotate_degrees')) {
      if (accepted('rotationDegrees')) {
        rotationCompilingCount++;
      } else {
        item.delete('rotate_degrees');
        rotationDroppedCount++;
      }
    }
  };

  const rooms = cst.get('rooms');
  if (isSeq(rooms)) {
    rooms.items.forEach((room, ri) => {
      if (!isMap(room)) return;
      const place = room.get('place', true);
      const docPlacements = doc.rooms[ri]?.place;
      if (isSeq(place) && docPlacements) {
        place.items.forEach((item, pi) => {
          if (!isMap(item)) return;
          const placement = docPlacements[pi];
          const facingCap = placement
            ? facingCapabilityFor(placement)
            : 'facingFloorProp';
          stripPlacementFields(item, facingCap);
        });
      }
      const boss = room.get('boss', true);
      if (isMap(boss)) stripPlacementFields(boss, 'facingBoss');
    });
  }
  // Kept top-level placements (topLevelPlaceAccepted) never went through
  // the rooms loop above — their own facing/mount/height/etc. still need
  // stripping per-field, same as any room-scoped placement.
  if (topLevelPlaceAccepted) {
    const keptTopPlace = cst.get('place');
    if (isSeq(keptTopPlace)) {
      keptTopPlace.items.forEach((item, pi) => {
        if (!isMap(item)) return;
        const placement = doc.place[pi];
        const facingCap = placement
          ? facingCapabilityFor(placement)
          : 'facingFloorProp';
        stripPlacementFields(item, facingCap);
      });
    }
  }

  if (facingDroppedCount > 0) {
    dropped.push(
      `facing (${facingDroppedCount} placement${facingDroppedCount === 1 ? '' : 's'})`
    );
  }
  if (facingCompilingCount > 0) {
    compiling.push(
      `facing (${facingCompilingCount} placement${facingCompilingCount === 1 ? '' : 's'})`
    );
  }
  if (mountDroppedCount > 0) {
    dropped.push(
      `wall-mount (${mountDroppedCount} placement${mountDroppedCount === 1 ? '' : 's'})`
    );
  }
  if (mountCompilingCount > 0) {
    compiling.push(
      `wall-mount (${mountCompilingCount} placement${mountCompilingCount === 1 ? '' : 's'})`
    );
  }
  if (heightDroppedCount > 0) {
    dropped.push(
      `height (${heightDroppedCount} placement${heightDroppedCount === 1 ? '' : 's'})`
    );
  }
  if (heightCompilingCount > 0) {
    compiling.push(
      `height (${heightCompilingCount} placement${heightCompilingCount === 1 ? '' : 's'})`
    );
  }
  if (targetingDroppedCount > 0) {
    dropped.push(
      `targeting (${targetingDroppedCount} placement${targetingDroppedCount === 1 ? '' : 's'})`
    );
  }
  if (targetingCompilingCount > 0) {
    compiling.push(
      `targeting (${targetingCompilingCount} placement${targetingCompilingCount === 1 ? '' : 's'})`
    );
  }
  if (rotationDroppedCount > 0) {
    dropped.push(
      `fine-rotation experiment (${rotationDroppedCount} placement${rotationDroppedCount === 1 ? '' : 's'})`
    );
  }
  if (rotationCompilingCount > 0) {
    compiling.push(
      `fine-rotation experiment (${rotationCompilingCount} placement${rotationCompilingCount === 1 ? '' : 's'})`
    );
  }

  const strippedDoc = toDungeonDoc(cst);
  const compilableBlockers: string[] = [];
  // `doc` (the ORIGINAL parse, before this function's own `cst.delete`
  // calls above) — not `strippedDoc` — is what says whether this is a
  // from-scratch canvas document: when `canvas` isn't accepted, the block
  // above already deleted `canvas:` from `cst`, so `strippedDoc.canvas`
  // would read `null` here regardless, losing exactly the signal this
  // branch needs. A canvas document has no `rooms:`/`boss:` chain AT ALL
  // (TARGET-YAML.md's "top-level placement" section — `emptyCanvasDoc.ts`:
  // "a from-scratch canvas has nothing... no fictional room standing in
  // for one"), so the room-count/boss-archetype checks below are
  // chain-mode's own real server minimums (validate.go) reinterpreted
  // against a document shape they were never written for. Kirk hit this
  // live (region-brush honesty round, 2026-08-06): added a whole boss
  // region trying to satisfy "needs exactly one boss-archetype room" on a
  // canvas doc — which can never unblock it, since the server rejects
  // `canvas:` itself before validation ever reaches boss cardinality. The
  // only HONEST blocker for a canvas doc today is that fact, driven by
  // the live probe (`accepted('canvas')`), not a hardcoded guess: the
  // moment `canvas` graduates to accepted, this blocker disappears and
  // nothing invented takes its place — whatever the server's real canvas
  // validation turns out to require will surface through the actual save
  // attempt's own error path once it exists, not a client-side prediction
  // of rules nobody has written yet.
  if (doc.canvas) {
    if (!accepted('canvas')) {
      compilableBlockers.push(
        "from-scratch canvas documents aren't accepted by this server yet (platform Wave 0 — rpg-project#192)"
      );
    }
  } else {
    if (strippedDoc.rooms.length < 2) {
      compilableBlockers.push(
        `needs at least 2 rooms (has ${strippedDoc.rooms.length})`
      );
    }
    const bossRooms = strippedDoc.rooms.filter((r) => r.archetype === 'boss');
    if (bossRooms.length !== 1 || !bossRooms[0]?.boss) {
      compilableBlockers.push(
        bossRooms.length === 0
          ? 'needs exactly one boss-archetype room with a declared boss (has none)'
          : bossRooms.length > 1
            ? `needs exactly one boss-archetype room (has ${bossRooms.length})`
            : 'the boss-archetype room needs a declared boss'
      );
    }
  }

  return {
    yaml: serializeDungeon(cst),
    dropped,
    compiling,
    compilable: compilableBlockers.length === 0,
    compilableBlockers,
  };
}
