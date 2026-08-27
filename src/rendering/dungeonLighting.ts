import type { FloorPoolLight } from '@/components/hex-grid/syntyHexFloorHelpers';
import {
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
  | 'unowned-floor-cells'
  | 'source-outside-region';

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
  return {
    mode: 'legacy',
    fallbackReason,
    regionByCell: new Map(),
    intensityByCell: new Map(),
    sources: [],
  };
}

export function buildDungeonLightingFacts(
  floorCellKeys: readonly string[],
  regions: readonly DungeonLightingRegionInput[],
  sources: readonly DungeonLightingSourceInput[]
): DungeonLightingFacts {
  if (regions.length === 0) return fallbackFacts('no-regions');

  const archetypes = regions.map((region) =>
    typeof region.archetype === 'string' ? region.archetype.trim() : ''
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
        typeof region.intensity !== 'number' ||
        !Number.isFinite(region.intensity) ||
        region.intensity < 0 ||
        region.intensity > 1
    )
  ) {
    return fallbackFacts('invalid-intensity');
  }

  const regionByCell = new Map<string, string>();
  const intensityByCell = new Map<string, number>();
  for (const region of regions) {
    for (const cellKey of region.cellKeys) {
      if (typeof cellKey !== 'string' || regionByCell.has(cellKey)) {
        return fallbackFacts('conflicting-region-cells');
      }
      regionByCell.set(cellKey, region.id);
      intensityByCell.set(cellKey, region.intensity);
    }
  }

  if (floorCellKeys.some((cellKey) => !regionByCell.has(cellKey))) {
    return fallbackFacts('unowned-floor-cells');
  }

  const normalizedSources: DungeonLightSource[] = [];
  for (const source of sources) {
    const spec = dungeonLightSourceSpec(source.ref);
    if (!spec) continue;
    const regionId = regionByCell.get(source.cellKey);
    if (regionId === undefined) {
      return fallbackFacts('source-outside-region');
    }
    normalizedSources.push({
      key: source.key,
      ref: source.ref,
      regionId,
      cellKey: source.cellKey,
      position: Object.freeze([
        source.groundedPosition[0],
        source.groundedPosition[1] + DUNGEON_SURFACE_Y + spec.height,
        source.groundedPosition[2],
      ] as [number, number, number]),
      spec: Object.freeze({ ...spec }),
    });
  }

  return {
    mode: 'crypt',
    fallbackReason: null,
    regionByCell,
    intensityByCell,
    sources: Object.freeze(normalizedSources),
  };
}

function legacyLightingPlan(
  fallbackReason: DungeonLightingFallbackReason
): DungeonLightingPlan {
  return {
    mode: 'legacy',
    ambientIntensity: LEGACY_AMBIENT_INTENSITY,
    directionalIntensity: LEGACY_DIRECTIONAL_INTENSITY,
    directionalPosition: DIRECTIONAL_POSITION,
    pointLights: [],
    floorExposureByCell: new Map(),
    floorPoolsByCell: new Map(),
    diagnostics: [`Legacy lighting: ${fallbackReason}`],
  };
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
  const pointLights = selectedSources.map((source) => ({
    key: source.key,
    position: source.position,
    color: source.spec.color,
    intensity: source.spec.intensity,
    distance: source.spec.distance,
  }));

  const poolsByCell = new Map<string, DungeonFloorPool[]>();
  for (const cellKey of facts.regionByCell.keys()) {
    poolsByCell.set(cellKey, []);
  }
  for (const source of selectedSources) {
    const pool: DungeonFloorPool = {
      position: source.position,
      color: source.spec.color,
      intensity: source.spec.intensity,
      distance: source.spec.distance,
      floorPoolStrength: source.spec.floorPoolStrength,
    };
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
  return {
    mode: 'crypt',
    ambientIntensity: DUNGEON_AMBIENT_INTENSITY,
    directionalIntensity: DUNGEON_DIRECTIONAL_INTENSITY,
    directionalPosition: DIRECTIONAL_POSITION,
    pointLights,
    floorExposureByCell: new Map(facts.intensityByCell),
    floorPoolsByCell: new Map(
      [...poolsByCell].map(([cellKey, pools]) => [
        cellKey,
        Object.freeze(pools.slice()),
      ])
    ),
    diagnostics,
  };
}
