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
  /** target dialect, proposed — meaningful only when `mount === 'wall'`, meters
   * above the floor. `null` when unset (including every `mount:
   * 'floor'` placement — a floor prop's vertical position is derived
   * from its own model, not authored). */
  height: number | null;
  /** EXPERIMENT, not even a target-dialect proposal yet (Kirk's
   * 2026-08-02 "3D editing" arc, part 2 follow-up) — a fine rotation
   * ADJUSTMENT in degrees, ADDED on top of the coarse 6-direction
   * `facing`-derived rotation for a `mount: 'wall'` placement, never a
   * replacement for it (`facing` still picks which wall; this nudges the
   * exact angle against that wall). Exists solely to let Kirk compare
   * "6-direction facing alone" against "6-direction facing + a fine
   * nudge" on the SAME object and decide, by feel, whether
   * TARGET-YAML.md's open "is 6-direction hex facing too coarse for a
   * wall-mounted prop" question needs a real field — this is the probe,
   * not the answer. `null` when unset (every placement before this
   * field existed, and every `mount: 'floor'` placement, which this
   * concept's Inspector doesn't even show the control for). Not
   * compiled server-side; stripped by `stripToV1Subset` before any real
   * save, same as every other target-dialect field. */
  rotationDegrees: number | null;
  /** target dialect, proposed — see TARGET-YAML.md's "Monster targeting" section. A
   * REFERENCE to a toolkit AI strategy key, e.g. `"lowest-health"` —
   * never behavior (Boundary Rule). Only meaningful when `isMonster`;
   * `null` when unset. Not compiled server-side. */
  targeting: string | null;
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

export type WallKind = 'solid' | 'door';

/** Edge-native: `from`/`to` are orthogonally-adjacent absolute [col,row]
 * cells, the wall sits on the shared edge between them. target dialect, proposed —
 * see TARGET-YAML.md's annotated example for the full rationale (mirrors
 * the real `EncounterService.Space.walls` wire type). Not compiled
 * server-side; stripped by `stripToV1Subset`. */
export interface WallDoc {
  from: [number, number];
  to: [number, number];
  kind: WallKind;
}

/** target dialect, proposed — dungeon-wide lighting config. See TARGET-YAML.md. */
export interface LightingDoc {
  ambient: number;
}

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
    holes,
    start,
    end,
    lighting,
    place,
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

/** Strip every monster `place:` entry (any `ref` starting
 * `dnd5e:monsters:`) from every room, leaving props and `boss:` untouched
 * — the "Walk it (no monsters)" Save & Play variant (Kirk's 2026-08-02
 * ask). Deliberately does NOT touch `boss:`: dungeonspec requires exactly
 * one boss per boss-archetype room (`moveBoss`'s own doc comment above),
 * so a boss-room YAML with `boss:` removed fails that validation rather
 * than producing a genuinely boss-free dungeon — see
 * `useWalkItVariant.ts`'s doc comment for how the UI stays honest about
 * this rather than silently rewriting the room's archetype to dodge it. */
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
 * the UI must say so rather than implying a true no-encounter walkthrough. */
export function buildWalkItYaml(yamlText: string, walkKey: string): string {
  const { cst } = parseDungeon(yamlText);
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

/** Set a `place:` entry's `mount:`/`height:` — target dialect, proposed, see
 * TARGET-YAML.md's "z-axis" section. `mount: 'floor'` clears BOTH keys
 * (the pre-existing, only-ever-possible state needs neither); `mount:
 * 'wall'` writes both — `height` is only ever meaningful alongside
 * `mount: wall`, so the two are set/cleared together rather than as two
 * independent mutators a caller could desync. */
export function setPlacementMount(
  cst: Document,
  roomId: string | null,
  index: number,
  mount: Mount,
  height: number | null
): void {
  const place = placeSeq(cst, roomId);
  const item = place.items[index];
  if (!isMap(item)) return;
  if (mount === 'floor') {
    item.delete('mount');
    item.delete('height');
    return;
  }
  item.set('mount', 'wall');
  if (height === null) item.delete('height');
  else item.set('height', height);
}

/** Set or clear a `place:` entry's `rotate_degrees:` — EXPERIMENT, see
 * `PlacementDoc.rotationDegrees`'s own doc comment for why this exists
 * and what it does and doesn't mean. Independent of `setPlacementMount`
 * deliberately: clearing `mount` back to `'floor'` does NOT also clear
 * `rotate_degrees` — the fine-adjustment value is worth keeping around
 * if the author toggles wall-mount off and back on while comparing, and
 * the Inspector only ever shows this control when `mount === 'wall'`
 * anyway, so an orphaned value on a floor placement is inert, not
 * confusing. */
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

/** A wall's index in `walls:`, matched by its `from` cell — this concept
 * represents one authored wall as ONE unit anchored at a specific
 * absolute [col,row] cell (its bottom edge, `to: [col, row+1]`) rather
 * than requiring a drag gesture to specify an arbitrary edge; see
 * TARGET-YAML.md's "Structural palette category" section for why a
 * single click-to-toggle affordance was chosen over full free-hand edge
 * drawing for this pass. */
function wallIndexAt(cst: Document, col: number, row: number): number {
  const walls = cst.get('walls');
  if (!isSeq(walls)) return -1;
  return walls.items.findIndex((w) => {
    if (!isMap(w)) return false;
    const from = w.get('from');
    // `.get(0)`/`.get(1)`, not `.items[0]`/`.items[1]` — a sequence built
    // via `cst.createNode(...)` (createWallNode below) wraps its number
    // children in `Scalar` nodes; indexing `.items` directly returns
    // those wrapper objects, which never `===` a raw number. `.get()`
    // auto-resolves to the JS value, same contract `YAMLMap.get` already
    // uses everywhere else in this file (see `findRoomSeqIndex`).
    return isSeq(from) && from.get(0) === col && from.get(1) === row;
  });
}

/** Wall tool: toggle a wall's PRESENCE at a cell (add as `kind: solid` /
 * remove) — target dialect, proposed. Adding always starts solid; use
 * `toggleWallKind` to flip an existing one to a door. */
export function toggleWall(cst: Document, col: number, row: number): void {
  const idx = wallIndexAt(cst, col, row);
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
 * toggle, so the caller can distinguish "toggled" from "nothing there". */
export function toggleWallKind(
  cst: Document,
  col: number,
  row: number
): boolean {
  const idx = wallIndexAt(cst, col, row);
  if (idx === -1) return false;
  const item = (cst.get('walls') as YAMLSeq).items[idx];
  if (!isMap(item)) return false;
  item.set('kind', item.get('kind') === 'door' ? 'solid' : 'door');
  return true;
}

/** A wall's index in `walls:`, matched by an EXACT `from`/`to` pair (both
 * ends, not just `from` — see `wallIndexAt`'s doc comment for why edit
 * mode's own lookup only needs `from`). General edge lookup for the
 * "New Dungeon" creation board's freeform edge-painting, where a wall
 * can be either orientation (a `from`→`to` step of `[0,1]` or `[1,0]`)
 * at any cell, not just the one fixed edit-mode shape. Callers are
 * responsible for passing `from`/`to` in ONE canonical order (creation
 * mode's `hEdgeGeometry`/`vEdgeGeometry` already produce one) — this
 * does not check the reverse pairing, matching how the CST itself never
 * stores a wall's endpoints swapped. */
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

/** Set (add/update) or clear a wall on an arbitrary edge, with an
 * explicit on/off — the creation board's stroke-painting needs to force
 * a whole drag's worth of edges to the SAME state (decided by the first
 * edge touched), which a bare toggle-per-cell can't express. Setting
 * `on: true` for an edge that already has a wall updates its `kind`
 * in place (used by the door tool to flip solid↔door without going
 * through a separate lookup + toggleWallKind-style call). */
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
  if (idx !== -1) {
    const item = (cst.get('walls') as YAMLSeq).items[idx];
    if (isMap(item)) item.set('kind', kind);
    return;
  }
  const walls = topSeq(cst, 'walls');
  walls.items.push(createWallNode(cst, { from, to, kind }));
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

export interface V1SubsetResult {
  /** The stripped, v1-only YAML text — always `version: 1`, never any
   * target-dialect-only field. */
  yaml: string;
  /** Human-readable list of what got dropped ("3 walls", "1 hole",
   * "start/end", "facing (2 placements)", "lighting") — empty when the
   * input was already pure v1. Drives the "Save the compilable subset"
   * diff summary (TARGET-YAML.md). */
  dropped: string[];
  /** False when fewer than 2 rooms remain after stripping — dungeonspec's
   * own `minRooms = 2` (validate.go) makes the result genuinely
   * unsavable, not merely unenriched. A from-scratch target-dialect
   * canvas with 0-1 declared rooms has NO compilable subset yet. */
  compilable: boolean;
}

/** Strip a target-dialect document down to exactly what dungeonspec
 * compiles today (the v1-expressible subset) — TARGET-YAML.md's "The
 * v1-subset strip" table, in code. Parses a FRESH CST from `yamlText`
 * (never mutates a caller's live board CST), so this is safe to call on
 * every live-preview debounce tick and every Save & Play click without
 * disturbing what the author is editing. */
export function stripToV1Subset(yamlText: string): V1SubsetResult {
  const { cst, doc } = parseDungeon(yamlText);
  const dropped: string[] = [];

  cst.set('version', 1);
  cst.delete('canvas');

  if (doc.walls.length > 0) {
    dropped.push(
      `${doc.walls.length} wall${doc.walls.length === 1 ? '' : 's'}`
    );
  }
  cst.delete('walls');

  if (doc.holes.length > 0) {
    dropped.push(
      `${doc.holes.length} hole${doc.holes.length === 1 ? '' : 's'}`
    );
  }
  cst.delete('holes');

  if (doc.start || doc.end) dropped.push('start/end');
  cst.delete('start');
  cst.delete('end');

  if (doc.lighting) dropped.push('lighting');
  cst.delete('lighting');

  // Top-level place: (target dialect, proposed — TARGET-YAML.md's "top-level
  // placement" section) has no v1 analog at all; dungeonspec only knows
  // room-scoped place:. A top-level entry whose absolute column falls
  // inside a declared room's own column range MAPS DOWN into that
  // room's place: list (absolute -> room-local `at`) rather than being
  // lost — v1's room-scoped place: is a real subset of what the entry
  // meant, not a different claim. One outside every room's range has no
  // v1 home and is dropped, counted honestly like every other
  // target-dialect field here. Room bounds use the SAME startColumn accumulation rule
  // floorPlanCompile.ts uses server-side (`next.startColumn =
  // prev.startColumn + prev.width + 1`) — pure client math, only ever
  // used here to decide "does this column fall in this room," never to
  // author a gameplay position.
  let mappedPlacementCount = 0;
  let outOfRoomPlacementCount = 0;
  const topPlace = cst.get('place');
  if (isSeq(topPlace)) {
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
  }
  cst.delete('place');
  // `dropped` drives BOTH the "Uses: ..." compile badge (what
  // target-dialect content is currently present) and the post-save
  // "Dropped: ..." honesty note (YamlPane.tsx) — the same array, doing
  // double duty for every other target-dialect field, because for every
  // other field "in use" and "genuinely lost" are the same set. Top-level
  // placement is the first case where
  // they diverge: a mapped one survives (relocated, not erased), an
  // out-of-room one doesn't. Both still need to show up in "Uses:" (the
  // construct IS present), so both get an entry — worded to stay honest
  // in the "Dropped:" reading too ("mapped into rooms" is not "lost").
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

  let facingCount = 0;
  let mountCount = 0;
  let targetingCount = 0;
  let rotationDegreesCount = 0;
  const stripPlacementFields = (item: YAMLMap) => {
    if (item.has('facing')) {
      item.delete('facing');
      facingCount++;
    }
    // mount/height are one concept (see setPlacementMount's doc comment)
    // — counted together, stripped together.
    if (item.has('mount') || item.has('height')) {
      item.delete('mount');
      item.delete('height');
      mountCount++;
    }
    if (item.has('targeting')) {
      item.delete('targeting');
      targetingCount++;
    }
    // EXPERIMENT, not even a target-dialect proposal (see
    // PlacementDoc.rotationDegrees's own doc comment) — counted and
    // stripped separately from mount/height rather than folded into
    // that count, so the "Uses:"/"Dropped:" summary can name it
    // honestly as the fine-rotation probe it is, not as part of the
    // real wall-mount proposal.
    if (item.has('rotate_degrees')) {
      item.delete('rotate_degrees');
      rotationDegreesCount++;
    }
  };
  const rooms = cst.get('rooms');
  if (isSeq(rooms)) {
    for (const room of rooms.items) {
      if (!isMap(room)) continue;
      const place = room.get('place', true);
      if (isSeq(place)) {
        for (const item of place.items) {
          if (isMap(item)) stripPlacementFields(item);
        }
      }
      const boss = room.get('boss', true);
      if (isMap(boss)) stripPlacementFields(boss);
    }
  }
  if (facingCount > 0) {
    dropped.push(
      `facing (${facingCount} placement${facingCount === 1 ? '' : 's'})`
    );
  }
  if (mountCount > 0) {
    dropped.push(
      `wall-mount (${mountCount} placement${mountCount === 1 ? '' : 's'})`
    );
  }
  if (targetingCount > 0) {
    dropped.push(
      `targeting (${targetingCount} placement${targetingCount === 1 ? '' : 's'})`
    );
  }
  if (rotationDegreesCount > 0) {
    dropped.push(
      `fine-rotation experiment (${rotationDegreesCount} placement${rotationDegreesCount === 1 ? '' : 's'})`
    );
  }

  const strippedDoc = toDungeonDoc(cst);
  return {
    yaml: serializeDungeon(cst),
    dropped,
    compilable: strippedDoc.rooms.length >= 2,
  };
}
