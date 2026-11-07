import { create } from '@bufbuild/protobuf';
import {
  GroundPaintSchema,
  RegionGroundSchema,
  type AtlasRegion,
  type Position,
  type RegionGround,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { coordToKey } from '../hex-grid/hexMath';
import { positionToCube } from './positionBridge';

const keyOf = (cell: Position): string => `${cell.x},${cell.y}`;

/** Read explicit paint only inside the region delivered by the provider. */
function assignments(
  region: AtlasRegion
): Map<string, { ref: string; cell: Position }> {
  const owned = new Set(region.cells.map(keyOf));
  const result = new Map<string, { ref: string; cell: Position }>();
  for (const paint of region.ground?.paint ?? []) {
    if (!paint.ref || paint.ref.trim() !== paint.ref)
      throw new Error('Ground paint has an invalid ref');
    for (const cell of paint.cells) {
      const key = keyOf(cell);
      if (!owned.has(key))
        throw new Error('Ground paint is outside its delivered region');
      if (result.has(key))
        throw new Error('Ground paint repeats a cell assignment');
      result.set(key, { ref: paint.ref, cell });
    }
  }
  return result;
}

/** Partial region discovery replaces paint on its cells, retaining older cells' paint. */
export function mergeRegionGround(
  previous: AtlasRegion | undefined,
  incoming: AtlasRegion
): RegionGround | undefined {
  if (!incoming.ground) return undefined;
  const old = previous
    ? assignments(previous)
    : new Map<string, { ref: string; cell: Position }>();
  const next = assignments(incoming);
  for (const cell of incoming.cells) old.delete(keyOf(cell));
  for (const [key, value] of next) old.set(key, value);
  const groups = new Map<string, Position[]>();
  for (const { ref, cell } of old.values()) {
    const cells = groups.get(ref) ?? [];
    cells.push(cell);
    groups.set(ref, cells);
  }
  return create(RegionGroundSchema, {
    baseRef: incoming.ground.baseRef,
    paint: [...groups.keys()].sort().map((ref) =>
      create(GroundPaintSchema, {
        ref,
        cells: groups.get(ref)!.sort((a, b) => a.x - b.x || a.y - b.y),
      })
    ),
  });
}

/** Resolve appearance from supplied floor/region facts, never an authored site fetch. */
export function groundRefsForAtlas(
  regions: readonly AtlasRegion[],
  floor: ReadonlySet<string>
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const region of regions) {
    if (!region.ground) continue;
    const base = region.ground.baseRef;
    if (base.trim() !== base) throw new Error('Ground base has an invalid ref');
    const paint = assignments(region);
    for (const cell of region.cells) {
      const key = coordToKey(positionToCube(cell));
      const ref = paint.get(keyOf(cell))?.ref ?? (base || undefined);
      if (ref === undefined) continue;
      if (!floor.has(key))
        throw new Error(
          'Ground appearance is outside the delivered atlas floor'
        );
      if (result.has(key))
        throw new Error('Ground appearance has multiple region owners');
      result.set(key, ref);
    }
  }
  return result;
}
