/**
 * applyReveal — patching the cached atlas when a perception act adds to what
 * this recipient knows: newly learned cells, or a revealed secret.
 *
 * Every field is a pure addition, de-duplicated by identity, except two.
 *
 * # segments APPEND. sealed REPLACES within the newly owned cells.
 *
 * A reveal's `segments` are a DIFFERENCE: the segments this recipient did not
 * have and now does. Appending is right, and dropping a segment because the
 * reveal did not repeat it would erase a wall drawn for some other reason.
 *
 * A reveal's `sealed` cells are its regions' OWN sealed cells, and appending
 * them is a bug with a visible symptom: a room you can see and cannot walk
 * into. A wall presented to a non-knower has to stand on floor they can see;
 * that floor belongs to the room they cannot see, so it reaches them as
 * ownerless scenery, which is sealed (design C18). The moment the cells are
 * theirs, those same cells are ordinary standable floor:
 *
 *     after.sealed = (before.sealed \ newly owned cells) ∪ reveal.sealed
 *
 * (Ruled on rpg-project#360, 2026-09-03.)
 *
 * The region and door reveal reducers that read the v1 event stream's
 * `RegionRevealed` and `DoorRevealed` left with that stream
 * (rpg-dnd5e-web#1305). The act stream carries cells learned and secrets
 * revealed; `actGeometry.ts` brings them to this module's patch shapes.
 *
 * Doorways need no wall-gap logic here: `segmentsToWallRuns` derives the gap
 * where a doorway meets a segment, from the patched atlas, with no
 * reveal-specific geometry anywhere.
 */
import { clone } from '@bufbuild/protobuf';
import {
  GetAtlasResponseSchema,
  type GetAtlasResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import type {
  AtlasBoundary,
  AtlasDoorway,
  AtlasExit,
  AtlasPlacedProp,
  AtlasProp,
  AtlasRegion,
  AtlasSegment,
  AtlasStructuralDoor,
  AtlasStructuralWall,
  Position,
  PropPresentation,
  StructuralWallOpeningsReplacement,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { applyPropPresentations } from './propPresentations';
import { assertStructuralLayoutIntegrity } from './structuralLayout';

/**
 * A perception's newly learned cells (the act's `CellsLearned`), in the
 * knowledge atlas's own rows. `actGeometry.cellsPatchOf` builds it.
 */
export interface CellsPatch {
  readonly regions: readonly AtlasRegion[];
  readonly props: readonly AtlasProp[];
  readonly boundaries: readonly AtlasBoundary[];
  readonly segments: readonly AtlasSegment[];
  readonly sealed: readonly Position[];
  readonly doorways: readonly AtlasDoorway[];
  readonly placed: readonly AtlasPlacedProp[];
  readonly exits: readonly AtlasExit[];
  readonly scenery: readonly Position[];
  readonly structuralWalls: readonly AtlasStructuralWall[];
  readonly structuralDoors: readonly AtlasStructuralDoor[];
  readonly structuralWallOpeningsReplacements: readonly StructuralWallOpeningsReplacement[];
  readonly propPresentations: readonly PropPresentation[];
}

/**
 * A revealed secret (the act's `SecretRevealed`), in the knowledge atlas's
 * own rows. `actGeometry.secretPatchOf` builds it; its doors are re-read
 * through GetDoors.
 */
export interface SecretPatch {
  readonly concealment: string;
  readonly cells: readonly Position[];
  readonly props: readonly AtlasProp[];
  readonly doorways: readonly AtlasDoorway[];
  readonly boundaries: readonly AtlasBoundary[];
  readonly segments: readonly AtlasSegment[];
  readonly sealed: readonly Position[];
  readonly regions: readonly AtlasRegion[];
  readonly structuralWalls: readonly AtlasStructuralWall[];
  readonly structuralDoors: readonly AtlasStructuralDoor[];
  readonly structuralWallOpeningsReplacements: readonly StructuralWallOpeningsReplacement[];
  readonly propPresentations: readonly PropPresentation[];
}

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
  event: Pick<
    SecretPatch,
    | 'structuralWalls'
    | 'structuralDoors'
    | 'structuralWallOpeningsReplacements'
    | 'propPresentations'
  >
): GetAtlasResponse {
  const next = applyStructuralRecords(
    atlas,
    event.structuralWalls,
    event.structuralDoors,
    event.structuralWallOpeningsReplacements
  );
  const presentations = applyPropPresentations(
    atlas.propPresentations,
    event.propPresentations,
    next.structuralDoors
  );
  if (!event.propPresentations?.length) return next;
  return clone(GetAtlasResponseSchema, {
    ...next,
    propPresentations: presentations,
  });
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
 * Union partial regions into the held ones BY ID (fog of war, rpg-project#586).
 *
 * A cells patch's region carries only the cells of that region this
 * recipient newly learned, so replacing the held region by id — what a room
 * reveal does — would truncate it to the latest slice. The held cells stay,
 * the new ones are appended once, and the incoming record's other fields
 * (archetype, lighting) are the current answer for the region.
 */
function unionRegions(
  have: readonly AtlasRegion[],
  incoming: readonly AtlasRegion[]
): AtlasRegion[] {
  const out = [...have];
  for (const region of incoming) {
    const at = out.findIndex((r) => r.id === region.id);
    if (at < 0) {
      out.push({ ...region, cells: appendNew([], region.cells, cellKey) });
      continue;
    }
    out[at] = {
      ...region,
      cells: appendNew(out[at]!.cells, region.cells, cellKey),
    };
  }
  return out;
}

/**
 * The atlas this recipient should hold after learning cells (fog of war,
 * rpg-project#586).
 *
 * Every record is upserted by identity, so applying the same beat twice is a
 * no-op and a wall sent twice draws once:
 *
 * - regions by id, cells UNIONED (`unionRegions`), never replaced;
 * - `cells` gains the regions' new cells and the scenery;
 * - props, doorways, placed props, exits, boundaries and segments append,
 *   de-duplicated under the same keys the room reveal uses;
 * - structural walls and doors upsert by id (`applyStructuralRecords`), prop
 *   presentations by id (`applyPropPresentations`);
 * - `sealed` follows the room reveal's relation over the newly owned cells:
 *   `after.sealed = (before.sealed \ newly owned cells) ∪ event.sealed`.
 */
export function applyCellsRevealed(
  atlas: GetAtlasResponse,
  patch: CellsPatch
): GetAtlasResponse {
  // Own the incoming rows: nothing the caller holds can later mutate the
  // returned cache.
  const event = structuredClone(patch);
  const next = clone(GetAtlasResponseSchema, atlas);
  const owned = event.regions.flatMap((r) => r.cells);

  next.cells = appendNew(next.cells, [...owned, ...event.scenery], cellKey);
  next.regions = unionRegions(next.regions, event.regions);
  next.props = appendNew(
    next.props,
    event.props,
    (p) => p.id || `${p.ref}:${p.at ? cellKey(p.at) : ''}`
  );
  next.doorways = appendNew(
    next.doorways,
    event.doorways,
    (d) => `${d.connection}:${pairKey(d.from, d.to)}`
  );
  next.placed = appendNew(next.placed, event.placed, (p) => p.id);
  next.exits = appendNew(next.exits, event.exits, (e) => e.id);
  next.boundaries = appendNew(next.boundaries, event.boundaries, (b) =>
    pairKey(b.from, b.to)
  );
  next.segments = appendNew(next.segments, event.segments, segmentKey);

  const structured = applyStructuralRecords(
    next,
    event.structuralWalls,
    event.structuralDoors,
    event.structuralWallOpeningsReplacements
  );
  next.structuralWalls = structured.structuralWalls;
  next.structuralDoors = structured.structuralDoors;
  next.propPresentations = applyPropPresentations(
    atlas.propPresentations,
    event.propPresentations,
    next.structuralDoors
  );

  const newlyOwned = new Set(owned.map(cellKey));
  next.sealed = appendNew(
    next.sealed.filter((c) => !newlyOwned.has(cellKey(c))),
    event.sealed,
    cellKey
  );
  return next;
}
