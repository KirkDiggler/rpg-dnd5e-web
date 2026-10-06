/**
 * applyReveal — patching the cached atlas when a concealed region or a
 * concealed door enters this recipient's knowledge.
 *
 * A reveal is the one beat that adds to what a member may see. Before
 * wall geometry it added cells, regions, props, boundaries and doorways,
 * all of them pure additions. Slice 2 adds two more fields, and they do
 * NOT behave the same way, which is the whole reason this module exists
 * rather than a spread operator at the call site.
 *
 * # segments APPEND. sealed REPLACES within the revealed region.
 *
 * `RegionRevealed.segments` is a DIFFERENCE: the segments this recipient
 * did not have and now does — the revealed room's other walls. Appending
 * is right, and dropping a segment because the event did not repeat it
 * would erase a wall drawn for some other reason entirely.
 *
 * `RegionRevealed.sealed` is the revealed region's OWN sealed cells, and
 * appending it is a bug with a visible symptom: a room you can see and
 * cannot walk into.
 *
 * The reason is design C18's footing. A wall presented to a non-knower
 * has to stand on floor they can see; that floor belongs to the room
 * they cannot see; so it reaches them as ownerless scenery, which is
 * sealed. The moment the room is theirs, those same cells are ordinary
 * standable floor. Cells therefore LEAVE the sealed list on a reveal,
 * and the beat carries `region.cells` for exactly that subtraction:
 *
 *     after.sealed = (before.sealed \ region.cells) ∪ event.sealed
 *
 * (Measured by the toolkit builder and pinned in their test; ruled on
 * rpg-project#360, 2026-09-03, correcting an earlier "append both".)
 *
 * # Legacy segment/doorway rendering
 *
 * No doorway rides `RegionRevealed`. A concealed door arrives on
 * `DoorRevealed`, and the segment through it was already presented
 * whole — the masquerade shows a wall with no gap, design C19 — so the
 * gap derives where the new doorway meets a segment this client already
 * holds. `segmentsToWallRuns` does that on its own, from the patched
 * atlas, with no reveal-specific geometry anywhere.
 */

import { clone } from '@bufbuild/protobuf';
import type {
  ConcealmentRevealed,
  DoorRevealed,
  RegionRevealed,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  GetAtlasResponseSchema,
  type GetAtlasResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import type {
  AtlasSegment,
  AtlasStructuralDoor,
  AtlasStructuralWall,
  Position,
  StructuralWallOpeningsReplacement,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { assertStructuralLayoutIntegrity } from './structuralLayout';

/** An otherwise meaningful patch cannot be applied without its known wall.
 * The knowledge hook recovers via a snapshot; no partial event is installed. */
export class MissingStructuralWallError extends Error {
  constructor(wallId: string) {
    super(`structural layout: missing baseline wall ${wallId}`);
    this.name = 'MissingStructuralWallError';
  }
}

/**
 * Upsert COMPLETE structural records by id and restore canonical identity
 * order. A reveal carries newly permitted OR CHANGED records (a formerly
 * concealed cut becoming known), so an already-known wall id is REPLACED
 * whole — never appended beside its stale twin and never merged only into its
 * opening list. The sort matches the toolkit's own identity order, so a
 * patched atlas equals a fresh snapshot. Empty inputs are a NO-OP that returns
 * the caller's array unchanged, preserving legacy payload bytes.
 */
function upsertStructuralById<T extends { id: string }>(
  have: readonly T[],
  changed: readonly T[]
): readonly T[] {
  if (changed.length === 0) return have;
  const byId = new Map(have.map((row) => [row.id, row]));
  for (const row of changed) byId.set(row.id, row);
  return [...byId.values()].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  );
}

/**
 * Apply the structural wall/door delta a room or concealment reveal carries.
 * Doors are one flat collection keyed by canonical gameplay DoorID and are
 * never nested under a parent wall; walls are upserted by raw id so a wall
 * that gained a newly permitted cut is updated in place.
 */
export function applyStructuralRecords(
  atlas: GetAtlasResponse,
  walls: readonly AtlasStructuralWall[] | undefined,
  doors: readonly AtlasStructuralDoor[] | undefined,
  replacements: readonly StructuralWallOpeningsReplacement[] = []
): GetAtlasResponse {
  if (!walls?.length && !doors?.length && replacements.length === 0)
    return atlas;
  assertStructuralLayoutIntegrity({
    walls: atlas.structuralWalls,
    doors: atlas.structuralDoors,
  });

  const changedWalls = new Set<string>();
  for (const wall of walls ?? []) {
    if (!wall.id || changedWalls.has(wall.id))
      throw new Error('structural layout: empty or duplicate full wall id');
    changedWalls.add(wall.id);
  }
  const baseline = new Set(atlas.structuralWalls.map((wall) => wall.id));
  for (const patch of replacements) {
    if (!patch.wallId || changedWalls.has(patch.wallId))
      throw new Error(
        'structural layout: empty wall id or full-row/patch collision or duplicate patch'
      );
    changedWalls.add(patch.wallId);
    if (!baseline.has(patch.wallId))
      throw new MissingStructuralWallError(patch.wallId);
  }
  const changedDoors = new Set<string>();
  for (const door of doors ?? []) {
    if (!door.id || changedDoors.has(door.id))
      throw new Error('structural layout: empty or duplicate door id');
    changedDoors.add(door.id);
  }

  const byWall = new Map(
    upsertStructuralById(atlas.structuralWalls, walls ?? []).map((wall) => [
      wall.id,
      wall,
    ])
  );
  for (const patch of replacements) {
    const wall = byWall.get(patch.wallId)!; // baseline was checked before any update
    byWall.set(patch.wallId, { ...wall, openings: [...patch.openings] });
  }
  const nextWalls = [...byWall.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
  const nextDoors = upsertStructuralById(atlas.structuralDoors, doors ?? []);
  assertStructuralLayoutIntegrity({ walls: nextWalls, doors: nextDoors });
  // Clone at the commit boundary, including newly supplied event rows. Neither
  // the baseline nor the event can subsequently mutate the returned cache.
  return clone(GetAtlasResponseSchema, {
    ...atlas,
    structuralWalls: nextWalls,
    structuralDoors: [...nextDoors],
  });
}

/**
 * The atlas after a concealment reveal. Applying the SAME fixed structural
 * records the room-revealed path carries keeps the two reveal routes
 * equivalent; every other concealment field continues to arrive through the
 * existing authoritative GetAtlas/GetDoors refresh, so no second ordering or
 * merge system is introduced here.
 */
export function applyConcealmentRevealed(
  atlas: GetAtlasResponse,
  event: ConcealmentRevealed
): GetAtlasResponse {
  return applyStructuralRecords(
    atlas,
    event.structuralWalls,
    event.structuralDoors,
    event.structuralWallOpeningsReplacements
  );
}
function revealAdditions(event: RegionRevealed): {
  segments: AtlasSegment[];
  sealed: Position[];
} {
  return { segments: event.segments, sealed: event.sealed };
}
const cellKey = (p: Position): string => `${p.x},${p.y}`;
/** Concatenate, dropping anything already present under `key`. */
function appendNew<T>(
  have: readonly T[],
  add: readonly T[],
  key: (t: T) => string
): T[] {
  const seen = new Set(have.map(key));
  const out = [...have];
  for (const item of add) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

const segmentKey = (s: AtlasSegment): string =>
  `${s.from?.q ?? 0},${s.from?.r ?? 0}|${s.to?.q ?? 0},${s.to?.r ?? 0}|${s.height}`;

const pairKey = (a?: Position, b?: Position): string => {
  const x = a ? cellKey(a) : '';
  const y = b ? cellKey(b) : '';
  return x <= y ? `${x}|${y}` : `${y}|${x}`;
};

/**
 * The atlas this recipient should hold after a region reveal.
 *
 * Everything additive is appended and de-duplicated, so a wall already
 * drawn for another reason is drawn once and stays drawn. `sealed` alone
 * is replaced within the revealed region's cells, per the relation in
 * this module's header.
 */
export function applyRegionRevealed(
  atlas: GetAtlasResponse,
  event: RegionRevealed
): GetAtlasResponse {
  const region = event.region;
  if (!region) return atlas;
  const { segments, sealed } = revealAdditions(event);
  const next = clone(GetAtlasResponseSchema, atlas);

  // The region's own cells are the patch for `cells`, and the region
  // entry is what makes those cells OWNED rather than scenery.
  next.cells = appendNew(
    next.cells,
    [...region.cells, ...(event.scenery ?? [])],
    cellKey
  );
  next.regions = next.regions.some((r) => r.id === region.id)
    ? next.regions.map((r) => (r.id === region.id ? region : r))
    : [...next.regions, region];
  next.props = appendNew(
    next.props,
    event.props,
    (p) => p.id || `${p.ref}:${p.at ? cellKey(p.at) : ''}`
  );
  next.doorways = appendNew(
    next.doorways,
    event.doorways ?? [],
    (d) => `${d.connection}:${pairKey(d.from, d.to)}`
  );
  next.placed = appendNew(next.placed, event.placed ?? [], (p) => p.id);
  next.exits = appendNew(next.exits, event.exits ?? [], (e) => e.id);
  next.boundaries = appendNew(next.boundaries, event.boundaries, (b) =>
    pairKey(b.from, b.to)
  );
  next.segments = appendNew(next.segments, segments, segmentKey);

  // THE FIXED STRUCTURAL RECORDS UPSERT BY ID, not append. A known wall can
  // gain a newly revealed cut, so its whole record is replaced.
  const structured = applyStructuralRecords(
    next,
    event.structuralWalls,
    event.structuralDoors,
    event.structuralWallOpeningsReplacements
  );
  next.structuralWalls = structured.structuralWalls;
  next.structuralDoors = structured.structuralDoors;

  // THE ONE FIELD THAT IS NOT AN APPEND. Every cell of the revealed
  // region drops out of `sealed` first — it was footing under a wall
  // this member could see, and it is that room's own floor now — and
  // the event's own list goes back in.
  const revealed = new Set(region.cells.map(cellKey));
  next.sealed = appendNew(
    next.sealed.filter((c) => !revealed.has(cellKey(c))),
    sealed,
    cellKey
  );
  return next;
}

/**
 * The atlas after a door reveal: its doorways appear, and the boundaries
 * it carries REPLACE whatever stood on the door's own edges — that is
 * the synthetic wall the masquerade put there, and an empty list means
 * it simply comes off.
 *
 * Nothing here touches segments. The wall the door stands in was
 * presented whole, so the gap appears the moment the doorway does, out
 * of `segmentsToWallRuns` and the geometry it already has.
 */
export function applyDoorRevealed(
  atlas: GetAtlasResponse,
  event: DoorRevealed
): GetAtlasResponse {
  const next = clone(GetAtlasResponseSchema, atlas);
  next.doorways = appendNew(next.doorways, event.doorways, (d) =>
    pairKey(d.from, d.to)
  );
  const atDoor = new Set(event.doorways.map((d) => pairKey(d.from, d.to)));
  next.boundaries = [
    ...next.boundaries.filter((b) => !atDoor.has(pairKey(b.from, b.to))),
    ...event.boundaries,
  ];
  return next;
}
