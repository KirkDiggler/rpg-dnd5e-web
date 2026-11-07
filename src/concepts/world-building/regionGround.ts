import { fromRows, toRows, type RoomCellRow } from './regionRuns';
import type { RoomDraft, RoomHexCell, RoomRegion } from './roomDraft';
import { carryUnknownKeys, objectShape } from './strictShape';

/** One explicit appearance on existing cells, even when it equals the base. */
export interface GroundPaint {
  ref: string;
  cells: RoomCellRow[];
}

/** A region's appearance intent. Absence means the existing stone default. */
export interface RegionGround {
  baseRef?: string;
  paint?: GroundPaint[];
}

const keyOf = (cell: RoomHexCell): string => `${cell.q},${cell.r}`;
const contains = (rows: readonly RoomCellRow[], cell: RoomHexCell): boolean =>
  rows.some(
    (row) =>
      row.r === cell.r && row.q.some(([a, b]) => cell.q >= a && cell.q <= b)
  );

function reference(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value || value.trim() !== value)
    throw new Error(`${path}: ref must be a non-empty, unpadded string`);
  return value;
}

/** Bound expansion to the region's actual size before asking the shared parser. */
function paintCellsOf(
  value: unknown,
  path: string,
  budget: number
): RoomHexCell[] {
  if (Array.isArray(value)) {
    let count = 0;
    for (const source of value) {
      const row = objectShape(source, path);
      if (!Array.isArray(row.q)) continue;
      for (const span of row.q) {
        if (
          Array.isArray(span) &&
          span.length === 2 &&
          span.every(Number.isInteger) &&
          span[1] >= span[0]
        ) {
          count += span[1] - span[0] + 1;
          if (count > budget)
            throw new Error(
              `${path}: paint lists more cells than its region owns`
            );
        }
      }
    }
  }
  return fromRows(value, path);
}

/** Validate owned appearance fields while retaining unknown native-site fields. */
export function validateRegionGround(
  value: unknown,
  ownedCells: readonly RoomHexCell[],
  path: string
): RegionGround {
  const source = objectShape(value, path);
  const owned = new Set(ownedCells.map(keyOf));
  const assigned = new Set<string>();
  const ground: RegionGround = {};
  if (Object.hasOwn(source, 'baseRef'))
    ground.baseRef = reference(source.baseRef, `${path}.baseRef`);
  if (Object.hasOwn(source, 'paint')) {
    if (!Array.isArray(source.paint))
      throw new Error(`${path}.paint: must be a list`);
    ground.paint = source.paint.map((value, index) => {
      const p = `${path}.paint[${index}]`;
      const row = objectShape(value, p);
      const ref = reference(row.ref, `${p}.ref`);
      const cells = paintCellsOf(
        row.cells,
        `${p}.cells`,
        owned.size - assigned.size
      );
      for (const cell of cells) {
        const key = keyOf(cell);
        if (!owned.has(key))
          throw new Error(`${p}.cells: ${key} is outside its region`);
        if (assigned.has(key))
          throw new Error(`${p}.cells: ${key} already has ground paint`);
        assigned.add(key);
      }
      return carryUnknownKeys(row, ['ref', 'cells'], {
        ref,
        cells: structuredClone(row.cells as RoomCellRow[]),
      });
    });
  }
  return carryUnknownKeys(source, ['baseRef', 'paint'], ground);
}

function target(draft: RoomDraft, regionId: string): RoomRegion {
  const region = draft.room.regions.find((row) => row.id === regionId);
  if (!region) throw new Error('Region target no longer exists.');
  return region;
}

function compact(ground: RegionGround): RegionGround | undefined {
  if (ground.paint?.length === 0) delete ground.paint;
  return Object.keys(ground).length ? ground : undefined;
}

function replaceGround(
  draft: RoomDraft,
  region: RoomRegion,
  ground: RegionGround | undefined
): RoomDraft {
  if (JSON.stringify(region.ground) === JSON.stringify(ground)) return draft;
  const next: RoomRegion = { ...region };
  if (ground === undefined) delete next.ground;
  else next.ground = ground;
  return {
    ...draft,
    room: {
      ...draft.room,
      regions: draft.room.regions.map((row) => (row === region ? next : row)),
    },
  };
}

/** Fill changes only the base; null restores the original default, not paint. */
export function setRegionGroundBase(
  draft: RoomDraft,
  regionId: string,
  ref: string | null
): RoomDraft {
  const region = target(draft, regionId);
  if (ref !== null) reference(ref, 'ground.baseRef');
  if (region.ground?.baseRef === (ref ?? undefined)) return draft;
  const ground = { ...region.ground };
  if (ref === null) delete ground.baseRef;
  else ground.baseRef = ref;
  return replaceGround(draft, region, compact(ground));
}

/** Paint/erase one atomic stroke, never changing floor or region membership. */
export function paintRegionGround(
  draft: RoomDraft,
  regionId: string,
  cells: readonly RoomHexCell[],
  ref: string | null
): RoomDraft {
  const region = target(draft, regionId);
  if (ref !== null) reference(ref, 'ground.paint.ref');
  for (const cell of cells) {
    if (!Number.isSafeInteger(cell.q) || !Number.isSafeInteger(cell.r))
      throw new Error('Ground paint requires whole hex cells.');
    if (!contains(region.cells, cell))
      throw new Error('Ground paint cell is outside the active region.');
  }
  if (!cells.length) return draft;
  const assignments = new Map<string, { cell: RoomHexCell; ref: string }>();
  for (const paint of region.ground?.paint ?? [])
    for (const cell of fromRows(paint.cells, 'ground.paint.cells'))
      assignments.set(keyOf(cell), { cell, ref: paint.ref });
  let changed = false;
  for (const cell of cells) {
    const key = keyOf(cell);
    if (ref === null) changed = assignments.delete(key) || changed;
    else if (assignments.get(key)?.ref !== ref) {
      assignments.set(key, { cell, ref });
      changed = true;
    }
  }
  if (!changed) return draft;
  const groups = new Map<string, RoomHexCell[]>();
  for (const { cell, ref: value } of assignments.values()) {
    const group = groups.get(value) ?? [];
    group.push(cell);
    groups.set(value, group);
  }
  const paint = [...groups.keys()].sort().map((value) => ({
    ...region.ground?.paint?.find((row) => row.ref === value),
    ref: value,
    cells: toRows(groups.get(value)!),
  }));
  return replaceGround(draft, region, compact({ ...region.ground, paint }));
}

/** Resolve appearance only for a cell actually owned by this region. */
export function groundRefAt(
  region: RoomRegion,
  cell: RoomHexCell
): string | undefined {
  if (!contains(region.cells, cell)) return undefined;
  return (
    region.ground?.paint?.find((row) => contains(row.cells, cell))?.ref ??
    region.ground?.baseRef
  );
}

/** Layout edits remove departing paint rather than attach it to another region. */
export function pruneRegionGround(
  ground: RegionGround | undefined,
  cells: readonly RoomHexCell[]
): RegionGround | undefined {
  if (!ground?.paint) return ground;
  const owned = new Set(cells.map(keyOf));
  let changed = false;
  const paint: GroundPaint[] = [];
  for (const row of ground.paint) {
    const before = fromRows(row.cells, 'ground.paint.cells');
    const kept = before.filter((cell) => owned.has(keyOf(cell)));
    if (kept.length === before.length) paint.push(row);
    else {
      changed = true;
      if (kept.length) paint.push({ ...row, cells: toRows(kept) });
    }
  }
  return changed ? compact({ ...ground, paint }) : ground;
}
