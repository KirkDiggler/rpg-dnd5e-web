import {
  coordToKey,
  getHexNeighbors,
  type CubeCoord,
} from '@/components/hex-grid/hexMath';
import type { FloorPoolLight } from '@/components/hex-grid/syntyHexFloorHelpers';
import {
  createReadonlyMap,
  dungeonLightSourceSpec,
  type DungeonLightSourceSpec,
} from './dungeonLightSources';
import { DUNGEON_SURFACE_Y } from './dungeonSurface';

export type DungeonLightingFallbackReason =
  | 'no-regions'
  | 'unknown-archetype'
  | 'mixed-archetypes'
  | 'invalid-intensity'
  | 'conflicting-region-cells'
  | 'source-outside-region'
  | 'invalid-region-identity'
  | 'duplicate-region-identity'
  | 'invalid-source-identity'
  | 'duplicate-source-identity'
  | 'invalid-source-placement'
  | 'duplicate-source-placement';

export interface DungeonLightingRegionInput {
  readonly id: string;
  readonly archetype: string;
  readonly intensity: number;
  readonly cellKeys: readonly string[];
}

export interface DungeonLightingSourceInput {
  readonly key: string;
  readonly ref: string;
  readonly cellKey: string;
  readonly groundedPosition: readonly [number, number, number];
}

export interface DungeonLightSource {
  readonly key: string;
  readonly ref: string;
  readonly regionId: string;
  readonly cellKey: string;
  readonly position: readonly [number, number, number];
  readonly spec: DungeonLightSourceSpec;
}

export interface DungeonPointLight {
  readonly key: string;
  readonly position: readonly [number, number, number];
  readonly color: string;
  readonly intensity: number;
  readonly distance: number;
}

export interface DungeonFloorPool extends FloorPoolLight {
  readonly floorPoolStrength: number;
}

export interface DungeonLightingFacts {
  readonly mode: 'crypt' | 'legacy';
  readonly fallbackReason: DungeonLightingFallbackReason | null;
  readonly regionByCell: ReadonlyMap<string, string>;
  readonly intensityByCell: ReadonlyMap<string, number>;
  readonly sources: readonly DungeonLightSource[];
}

export interface DungeonLightingPlan {
  readonly mode: 'crypt' | 'legacy';
  readonly ambientIntensity: number;
  readonly directionalIntensity: number;
  readonly directionalPosition: readonly [number, number, number];
  readonly pointLights: readonly DungeonPointLight[];
  readonly floorExposureByCell: ReadonlyMap<string, number>;
  readonly floorPoolsByCell: ReadonlyMap<string, readonly DungeonFloorPool[]>;
  readonly diagnostics: readonly string[];
}

export const DUNGEON_POINT_LIGHT_BUDGET = 12;

const LEGACY_AMBIENT_INTENSITY = 0.6;
const LEGACY_DIRECTIONAL_INTENSITY = 0.8;
const DUNGEON_AMBIENT_INTENSITY = 0.2;
const DUNGEON_DIRECTIONAL_INTENSITY = 0.1;
const DIRECTIONAL_POSITION = Object.freeze([10, 20, 10] as const);

function fallbackFacts(
  fallbackReason: DungeonLightingFallbackReason
): DungeonLightingFacts {
  return Object.freeze({
    mode: 'legacy',
    fallbackReason,
    regionByCell: createReadonlyMap<string, string>([]),
    intensityByCell: createReadonlyMap<string, number>([]),
    sources: Object.freeze([]),
  });
}

/** `coordToKey`'s inverse — the atlas hands this module cell KEYS, and the
 * flood below needs the coordinate back to ask who is adjacent. Returns
 * NaN components for anything that is not a cube key; those simply match
 * no neighbour, so a malformed key floods nowhere rather than throwing. */
function keyToCoord(cellKey: string): CubeCoord {
  const [x, y, z] = cellKey.split(',').map(Number);
  return { x, y, z };
}

/** What an ownerless floor cell inherits from the owned cell nearest it. */
interface InheritedLight {
  readonly regionId: string;
  readonly intensity: number;
}

/** Give every ownerless floor cell the region and intensity of the
 * nearest owned floor cell, mutating the two maps in place.
 *
 * A flood from every owned cell at once, stepping only between adjacent
 * FLOOR cells. A uniform-step flood from many seeds reaches each cell by
 * its nearest seed, and among equally near seeds by whichever was
 * enqueued first — so seeding in the ATLAS'S OWN CELL ORDER is the
 * tie-break the design names, with no second rule to keep in step with
 * it. Owned cells are claimed at seeding, which is also what stops their
 * authored light from ever being overwritten.
 *
 * An ownerless cell with no owned floor reachable is left OUT of both
 * maps, which is how it takes the scene's ambient — the same thing an
 * unlisted cell has always meant here. */
function inheritLightingFromNearestOwned(
  floorCellKeys: readonly string[],
  regionByCell: Map<string, string>,
  intensityByCell: Map<string, number>
): void {
  const floor = new Set(floorCellKeys);
  const claims = new Map<string, InheritedLight>();
  const queue: string[] = [];

  for (const cellKey of floorCellKeys) {
    const regionId = regionByCell.get(cellKey);
    if (regionId === undefined || claims.has(cellKey)) continue;
    claims.set(cellKey, {
      regionId,
      intensity: intensityByCell.get(cellKey)!,
    });
    queue.push(cellKey);
  }

  for (let head = 0; head < queue.length; head += 1) {
    const cellKey = queue[head];
    const here = claims.get(cellKey)!;
    for (const neighbor of getHexNeighbors(keyToCoord(cellKey))) {
      const nk = coordToKey(neighbor);
      // Through FLOOR only — void is not a way for light any more than it
      // is for feet — and only the FIRST claim on a cell counts.
      if (!floor.has(nk) || claims.has(nk)) continue;
      claims.set(nk, here);
      queue.push(nk);
    }
  }

  for (const [cellKey, claim] of claims) {
    if (regionByCell.has(cellKey)) continue;
    regionByCell.set(cellKey, claim.regionId);
    intensityByCell.set(cellKey, claim.intensity);
  }
}

export function buildDungeonLightingFacts(
  floorCellKeys: readonly string[],
  regions: readonly DungeonLightingRegionInput[],
  sources: readonly DungeonLightingSourceInput[]
): DungeonLightingFacts {
  if (regions.length === 0) return fallbackFacts('no-regions');

  const normalizedRegionIds: string[] = [];
  const seenRegionIds = new Set<string>();
  for (const region of regions) {
    const id = typeof region?.id === 'string' ? region.id.trim() : '';
    if (id.length === 0) return fallbackFacts('invalid-region-identity');
    if (seenRegionIds.has(id)) {
      return fallbackFacts('duplicate-region-identity');
    }
    seenRegionIds.add(id);
    normalizedRegionIds.push(id);
  }

  const archetypes = regions.map((region) =>
    typeof region?.archetype === 'string' ? region.archetype.trim() : ''
  );
  const uniqueArchetypes = [...new Set(archetypes)];
  if (archetypes.some((archetype) => archetype.length === 0)) {
    return fallbackFacts('unknown-archetype');
  }
  if (uniqueArchetypes.length > 1) {
    return fallbackFacts('mixed-archetypes');
  }
  if (uniqueArchetypes[0] !== 'crypt') {
    return fallbackFacts('unknown-archetype');
  }

  if (
    regions.some(
      (region) =>
        typeof region?.intensity !== 'number' ||
        !Number.isFinite(region.intensity) ||
        region.intensity < 0 ||
        region.intensity > 1
    )
  ) {
    return fallbackFacts('invalid-intensity');
  }

  const regionByCell = new Map<string, string>();
  const intensityByCell = new Map<string, number>();
  for (const [regionIndex, region] of regions.entries()) {
    if (!Array.isArray(region?.cellKeys)) {
      return fallbackFacts('conflicting-region-cells');
    }
    for (const cellKey of region.cellKeys) {
      if (typeof cellKey !== 'string' || cellKey.length === 0) {
        return fallbackFacts('conflicting-region-cells');
      }
      if (regionByCell.has(cellKey)) {
        return fallbackFacts('conflicting-region-cells');
      }
      regionByCell.set(cellKey, normalizedRegionIds[regionIndex]!);
      intensityByCell.set(cellKey, region.intensity);
    }
  }

  // PLAIN FLOOR IS LIT LIKE THE FLOOR BESIDE IT (rpg-project#360, design
  // §2.1). An ownerless floor cell — scenery, and in slice 2 every sliver
  // a wall cuts and every wall's footing — takes the light of the NEAREST
  // owned floor cell, by a flood from every owned cell through floor.
  //
  // This replaces a bail to legacy lighting for the whole dungeon, a
  // guard written when an ownerless floor cell was impossible. It is not
  // impossible any more, and one scenery cell must not darken every room.
  //
  // It inherits the REGION as well as the intensity, so a scenery cell
  // also takes that region's floor pools and a light source standing on
  // it is attributed somewhere. Inheriting the exposure alone would leave
  // an unpooled fringe around every wall in slice 2 — the tell one layer
  // down, and the thing this design exists to remove.
  inheritLightingFromNearestOwned(floorCellKeys, regionByCell, intensityByCell);

  const normalizedSources: DungeonLightSource[] = [];
  const seenSourceKeys = new Set<string>();
  const seenSourcePlacements = new Set<string>();
  for (const source of sources) {
    const spec = dungeonLightSourceSpec(
      typeof source?.ref === 'string' ? source.ref : ''
    );
    if (!spec) continue;

    const key = typeof source.key === 'string' ? source.key.trim() : '';
    const cellKey =
      typeof source.cellKey === 'string' ? source.cellKey.trim() : '';
    if (key.length === 0 || cellKey.length === 0) {
      return fallbackFacts('invalid-source-identity');
    }
    if (seenSourceKeys.has(key)) {
      return fallbackFacts('duplicate-source-identity');
    }
    if (
      !Array.isArray(source.groundedPosition) ||
      source.groundedPosition.length !== 3 ||
      source.groundedPosition.some(
        (coordinate) =>
          typeof coordinate !== 'number' || !Number.isFinite(coordinate)
      )
    ) {
      return fallbackFacts('invalid-source-placement');
    }
    if (!regionByCell.has(cellKey)) {
      return fallbackFacts('source-outside-region');
    }

    const placementKey = `${source.ref}|${cellKey}`;
    if (seenSourcePlacements.has(placementKey)) {
      return fallbackFacts('duplicate-source-placement');
    }
    seenSourceKeys.add(key);
    seenSourcePlacements.add(placementKey);
    const regionId = regionByCell.get(cellKey)!;
    const position = Object.freeze([
      source.groundedPosition[0],
      source.groundedPosition[1] + DUNGEON_SURFACE_Y + spec.height,
      source.groundedPosition[2],
    ] as [number, number, number]);
    normalizedSources.push(
      Object.freeze({
        key,
        ref: source.ref,
        regionId,
        cellKey,
        position,
        spec: Object.freeze({ ...spec }),
      })
    );
  }

  return Object.freeze({
    mode: 'crypt',
    fallbackReason: null,
    regionByCell: createReadonlyMap(regionByCell),
    intensityByCell: createReadonlyMap(intensityByCell),
    sources: Object.freeze(normalizedSources),
  });
}

function legacyLightingPlan(
  fallbackReason: DungeonLightingFallbackReason
): DungeonLightingPlan {
  return Object.freeze({
    mode: 'legacy',
    ambientIntensity: LEGACY_AMBIENT_INTENSITY,
    directionalIntensity: LEGACY_DIRECTIONAL_INTENSITY,
    directionalPosition: DIRECTIONAL_POSITION,
    pointLights: Object.freeze([]),
    floorExposureByCell: createReadonlyMap<string, number>([]),
    floorPoolsByCell: createReadonlyMap<string, readonly DungeonFloorPool[]>(
      []
    ),
    diagnostics: Object.freeze([`Legacy lighting: ${fallbackReason}`]),
  });
}

export function resolveDungeonLighting(
  facts: DungeonLightingFacts,
  focus: Readonly<{ x: number; z: number }>
): DungeonLightingPlan {
  if (facts.mode === 'legacy' || facts.fallbackReason !== null) {
    return legacyLightingPlan(facts.fallbackReason ?? 'no-regions');
  }

  const sortedSources = [...facts.sources].sort((left, right) => {
    const leftDx = left.position[0] - focus.x;
    const leftDz = left.position[2] - focus.z;
    const rightDx = right.position[0] - focus.x;
    const rightDz = right.position[2] - focus.z;
    const distanceDifference =
      leftDx * leftDx +
      leftDz * leftDz -
      (rightDx * rightDx + rightDz * rightDz);
    if (distanceDifference !== 0) return distanceDifference;
    const leftKey = `${left.cellKey}|${left.ref}|${left.key}`;
    const rightKey = `${right.cellKey}|${right.ref}|${right.key}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  const selectedSources = sortedSources.slice(0, DUNGEON_POINT_LIGHT_BUDGET);
  const pointLights = selectedSources.map((source) =>
    Object.freeze({
      key: source.key,
      position: source.position,
      color: source.spec.color,
      intensity: source.spec.intensity,
      distance: source.spec.distance,
    })
  );

  const poolsByCell = new Map<string, DungeonFloorPool[]>();
  for (const cellKey of facts.regionByCell.keys()) {
    poolsByCell.set(cellKey, []);
  }
  for (const source of selectedSources) {
    const pool: DungeonFloorPool = Object.freeze({
      position: source.position,
      color: source.spec.color,
      intensity: source.spec.intensity,
      distance: source.spec.distance,
      floorPoolStrength: source.spec.floorPoolStrength,
    });
    for (const [cellKey, regionId] of facts.regionByCell) {
      if (regionId !== source.regionId) continue;
      poolsByCell.get(cellKey)?.push(pool);
    }
  }

  const diagnostics =
    facts.sources.length > DUNGEON_POINT_LIGHT_BUDGET
      ? [
          `${DUNGEON_POINT_LIGHT_BUDGET} of ${facts.sources.length} placed light sources active near this view`,
        ]
      : [];
  return Object.freeze({
    mode: 'crypt',
    ambientIntensity: DUNGEON_AMBIENT_INTENSITY,
    directionalIntensity: DUNGEON_DIRECTIONAL_INTENSITY,
    directionalPosition: DIRECTIONAL_POSITION,
    pointLights: Object.freeze(pointLights),
    floorExposureByCell: createReadonlyMap(facts.intensityByCell),
    floorPoolsByCell: createReadonlyMap(
      [...poolsByCell].map(([cellKey, pools]) => [
        cellKey,
        Object.freeze(pools.slice()) as readonly DungeonFloorPool[],
      ])
    ),
    diagnostics: Object.freeze(diagnostics),
  });
}
