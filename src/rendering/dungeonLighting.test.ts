import { describe, expect, it } from 'vitest';
import {
  buildDungeonLightingFacts,
  resolveDungeonLighting,
  type DungeonLightingRegionInput,
  type DungeonLightingSourceInput,
} from './dungeonLighting';
import { DUNGEON_SURFACE_Y } from './dungeonSurface';

const region = (
  id: string,
  cellKeys: readonly string[],
  intensity = 0.6,
  archetype = 'crypt'
): DungeonLightingRegionInput => ({
  id,
  archetype,
  intensity,
  cellKeys,
});

const source = (
  key: string,
  ref: string,
  cellKey: string,
  groundedPosition: readonly [number, number, number]
): DungeonLightingSourceInput => ({
  key,
  ref,
  cellKey,
  groundedPosition,
});

describe('buildDungeonLightingFacts', () => {
  it('preserves mixed region intensity and does not apply it to source specs', () => {
    const validFacts = buildDungeonLightingFacts(
      ['0,0,0', '1,-1,0'],
      [region('bright', ['0,0,0'], 0.6), region('dark', ['1,-1,0'], 0.15)],
      [source('zero', 'dnd5e:props:brazier', '0,0,0', [0, 0, 0])]
    );
    const sourceAtZero = validFacts.sources[0];

    expect(validFacts.intensityByCell.get('0,0,0')).toBe(0.6);
    expect(validFacts.intensityByCell.get('1,-1,0')).toBe(0.15);
    expect(sourceAtZero?.spec.intensity).toBe(2.8);
    expect(sourceAtZero?.position).toEqual([0, DUNGEON_SURFACE_Y + 0.9, 0]);
  });

  it('copies the same manifest source spec regardless of its region intensity', () => {
    const facts = buildDungeonLightingFacts(
      ['0,0,0', '1,-1,0'],
      [region('bright', ['0,0,0'], 0.6), region('dark', ['1,-1,0'], 0.15)],
      [
        source('zero', 'dnd5e:props:brazier', '0,0,0', [0, 0, 0]),
        source('one', 'dnd5e:props:brazier', '1,-1,0', [1, 0, 0]),
      ]
    );

    expect(facts.sources[0]?.spec).toEqual(facts.sources[1]?.spec);
    expect(facts.sources[1]?.spec.intensity).toBe(2.8);
  });

  it('resolves one point light from one valid source with crypt defaults', () => {
    const facts = buildDungeonLightingFacts(
      ['0,0,0'],
      [region('crypt-room', ['0,0,0'])],
      [source('zero', 'dnd5e:props:brazier', '0,0,0', [0, 0, 0])]
    );

    expect(
      resolveDungeonLighting(facts, { x: 0, z: 0 }).pointLights
    ).toHaveLength(1);
    expect(resolveDungeonLighting(facts, { x: 0, z: 0 })).toMatchObject({
      mode: 'crypt',
      ambientIntensity: 0.2,
      directionalIntensity: 0.1,
      directionalPosition: [10, 20, 10],
      floorExposureByCell: new Map([['0,0,0', 0.6]]),
    });
  });

  it('falls back atomically when region cells conflict', () => {
    const invalidFacts = buildDungeonLightingFacts(
      ['0,0,0'],
      [region('first', ['0,0,0']), region('second', ['0,0,0'])],
      []
    );

    expect(invalidFacts.fallbackReason).toBe('conflicting-region-cells');
    expect(invalidFacts.regionByCell).toEqual(new Map());
    expect(invalidFacts.intensityByCell).toEqual(new Map());
    expect(invalidFacts.sources).toEqual([]);
    expect(resolveDungeonLighting(invalidFacts, { x: 0, z: 0 })).toMatchObject({
      mode: 'legacy',
      ambientIntensity: 0.6,
      directionalIntensity: 0.8,
      directionalPosition: [10, 20, 10],
      pointLights: [],
      diagnostics: ['Legacy lighting: conflicting-region-cells'],
    });
  });

  it.each([
    ['no regions', [], [], 'no-regions'],
    [
      'unknown archetype',
      [region('room', ['0,0,0'], 0.6, 'crypts')],
      [],
      'unknown-archetype',
    ],
    [
      'mixed archetypes',
      [region('a', ['0,0,0']), region('b', ['1,0,0'], 0.6, 'crypts')],
      [],
      'mixed-archetypes',
    ],
    [
      'invalid intensity',
      [region('room', ['0,0,0'], Number.NaN)],
      [],
      'invalid-intensity',
    ],
    ['unowned floor', [region('room', ['0,0,0'])], [], 'unowned-floor-cells'],
    [
      'source outside region',
      [region('room', ['0,0,0'])],
      [source('outside', 'dnd5e:props:brazier', '1,-1,0', [0, 0, 0])],
      'source-outside-region',
    ],
  ] as const)(
    'rejects %s with the exact fallback reason',
    (_label, regions, sources, reason) => {
      const facts = buildDungeonLightingFacts(
        ['0,0,0', ...(reason === 'unowned-floor-cells' ? ['1,0,0'] : [])],
        regions,
        sources
      );
      expect(facts.fallbackReason).toBe(reason);
      expect(facts.sources).toEqual([]);
    }
  );
});

describe('resolveDungeonLighting source budget and floor pools', () => {
  it('keeps exactly the nearest 12 sources in stable tie order and every pool uses that selection', () => {
    const sources = Array.from({ length: 13 }, (_, index) =>
      source(
        `source-${String(index).padStart(2, '0')}`,
        'dnd5e:props:brazier',
        '0,0,0',
        [1, 0, 0]
      )
    );
    const facts = buildDungeonLightingFacts(
      ['0,0,0'],
      [region('room', ['0,0,0'])],
      sources
    );

    const plan = resolveDungeonLighting(facts, { x: 0, z: 0 });
    const expectedKeys = sources.slice(0, 12).map(({ key }) => key);

    expect(plan.pointLights.map(({ key }) => key)).toEqual(expectedKeys);
    expect(
      [...plan.floorPoolsByCell.values()].flat().map(({ position }) => position)
    ).toHaveLength(12);
    expect(
      [...plan.floorPoolsByCell.values()]
        .flat()
        .every((pool) => pool.position[0] === 1 && pool.position[2] === 0)
    ).toBe(true);
    expect(plan.diagnostics).toEqual([
      '12 of 13 placed light sources active near this view',
    ]);
  });

  it('clips each selected floor pool to the source region', () => {
    const facts = buildDungeonLightingFacts(
      ['0,0,0', '1,-1,0'],
      [region('left', ['0,0,0']), region('right', ['1,-1,0'])],
      [
        source('left-source', 'dnd5e:props:brazier', '0,0,0', [0, 0, 0]),
        source('right-source', 'dnd5e:props:glowing-orb', '1,-1,0', [1, 0, 0]),
      ]
    );

    const pools = resolveDungeonLighting(facts, {
      x: 0,
      z: 0,
    }).floorPoolsByCell;
    expect(pools.get('0,0,0')?.map(({ position }) => position)).toEqual([
      [0, DUNGEON_SURFACE_Y + 0.9, 0],
    ]);
    expect(pools.get('1,-1,0')?.map(({ position }) => position)).toEqual([
      [1, DUNGEON_SURFACE_Y + 1.2, 0],
    ]);
  });
});
