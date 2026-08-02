/**
 * dungeonYaml — the CST-preserving YAML layer for the dungeon-builder
 * concept (rpg-project#170/#169 S4a/S4b, board 19 "The Dungeon").
 *
 * This is the "delta" data plan.md's own fixture-first convention calls
 * for (`docs/how-to/concepts-route.md`): dungeonspec YAML has no proto
 * representation on the wire at all — `PutDungeonRequest.yaml` is just a
 * string — so everything here is this concept's own type, not a generated
 * one. `DungeonDoc`/`RoomDoc`/`PlacementDoc` below are that separated type.
 *
 * Uses the real `yaml` npm package's `Document` CST API per plan.md S4a's
 * explicit requirement ("hard requirement: comment-preserving round-trip
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
import {
  Document,
  isMap,
  isSeq,
  parseDocument,
  Scalar,
  YAMLMap,
  YAMLSeq,
} from 'yaml';

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
}

export interface BossDoc {
  ref: string;
  at: [number, number];
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

export interface ConnectorDoc {
  from: string;
  to: string;
}

export interface DungeonDoc {
  version: number;
  key: string;
  name: string;
  theme?: string;
  height: number;
  rooms: RoomDoc[];
  connectors: ConnectorDoc[];
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
  if (!Array.isArray(raw.rooms) || raw.rooms.length === 0) {
    throw new DungeonParseError(
      'No rooms parsed — need at least one entry under rooms:'
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
    const place = Array.isArray(room.place)
      ? (room.place as Record<string, unknown>[]).map((p, pi) => {
          if (typeof p.ref !== 'string' || !Array.isArray(p.at)) {
            throw new DungeonParseError(
              `Room "${room.id}" place[${pi}] missing ref/at`
            );
          }
          return {
            ref: p.ref,
            at: [p.at[0] as number, p.at[1] as number] as [number, number],
            blocksMovement: p.blocks_movement === true,
            blocksLos: p.blocks_los === true,
            isMonster: p.ref.startsWith('dnd5e:monsters:'),
          };
        })
      : [];
    const boss = room.boss
      ? (() => {
          const b = room.boss as Record<string, unknown>;
          return { ref: b.ref as string, at: b.at as [number, number] };
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
    return { from: conn.from as string, to: conn.to as string };
  });

  return {
    version: (raw.version as number) ?? 1,
    key: raw.key as string,
    name: raw.name as string,
    theme: raw.theme as string | undefined,
    height: raw.height as number,
    rooms,
    connectors,
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

/** Add a new prop/monster placement to a room's `place:` list (creating
 * the list if the room has none yet). Monster placements never get
 * blocks_movement/blocks_los keys, matching dungeonspec.Validate's
 * rejection of both on monster refs. */
export function placeItem(
  cst: Document,
  roomId: string,
  ref: string,
  at: [number, number]
): void {
  const room = roomMap(cst, roomId);
  const isMonster = ref.startsWith('dnd5e:monsters:');
  const existing = room.get('place', true);
  const place: YAMLSeq = isSeq(existing) ? existing : new YAMLSeq(cst.schema);
  if (!isSeq(existing)) room.set('place', place);
  const node = createPlacementNode(
    cst,
    ref,
    at,
    isMonster ? undefined : { blocksMovement: false, blocksLos: false }
  );
  place.items.push(node);
}

/** Move an existing placement (same room only — cross-room moves are
 * modeled as delete+place by the caller, since a placement's index is
 * room-scoped). Mutates the SAME node object, which is what keeps a
 * `commentBefore` attached to it correctly. */
export function movePlacement(
  cst: Document,
  roomId: string,
  index: number,
  at: [number, number]
): void {
  const room = roomMap(cst, roomId);
  const place = room.get('place', true);
  if (!isSeq(place))
    throw new DungeonParseError(`room "${roomId}" has no place: list`);
  const item = (place as YAMLSeq).items[index];
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
  roomId: string,
  index: number
): void {
  const room = roomMap(cst, roomId);
  const place = room.get('place', true);
  if (!isSeq(place)) return;
  (place as YAMLSeq).items.splice(index, 1);
}

/** Set a prop placement's blocks_movement/blocks_los flags (props only —
 * callers must not call this for monster refs). */
export function setPlacementFlags(
  cst: Document,
  roomId: string,
  index: number,
  flags: { blocksMovement: boolean; blocksLos: boolean }
): void {
  const room = roomMap(cst, roomId);
  const place = room.get('place', true);
  if (!isSeq(place)) return;
  const item = (place as YAMLSeq).items[index];
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
