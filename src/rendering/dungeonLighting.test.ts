import { describe, expect, it } from 'vitest';
import {
  buildDungeonLightingFacts,
  resolveDungeonLighting,
  type DungeonFloorPool,
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
      floorExposureByCell: expect.objectContaining({ size: 1 }),
    });
  });

  it('falls back atomically when region cells conflict', () => {
    const invalidFacts = buildDungeonLightingFacts(
      ['0,0,0'],
      [region('first', ['0,0,0']), region('second', ['0,0,0'])],
      []
    );

    expect(invalidFacts.fallbackReason).toBe('conflicting-region-cells');
    expect([...invalidFacts.regionByCell]).toEqual([]);
    expect([...invalidFacts.intensityByCell]).toEqual([]);
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
  it('rejects invalid recognized source placement atomically', () => {
    const facts = buildDungeonLightingFacts(
      ['0,0,0'],
      [region('room', ['0,0,0'])],
      [source('bad', 'dnd5e:props:brazier', '0,0,0', [Number.NaN, 0, 0])]
    );

    expect(facts.fallbackReason).toBe('invalid-source-placement');
    expect(facts.regionByCell.size).toBe(0);
    expect(facts.intensityByCell.size).toBe(0);
    expect(facts.sources).toEqual([]);

    const plan = resolveDungeonLighting(facts, { x: 0, z: 0 });
    expect(plan).toMatchObject({
      mode: 'legacy',
      ambientIntensity: 0.6,
      directionalIntensity: 0.8,
      pointLights: [],
      floorExposureByCell: expect.objectContaining({ size: 0 }),
      floorPoolsByCell: expect.objectContaining({ size: 0 }),
      diagnostics: ['Legacy lighting: invalid-source-placement'],
    });
    expect(
      plan.pointLights.some((light) =>
        light.position.some((coordinate) => !Number.isFinite(coordinate))
      )
    ).toBe(false);
  });

  it('rejects invalid and duplicate recognized source identities atomically', () => {
    const cases = [
      {
        sources: [source('', 'dnd5e:props:brazier', '0,0,0', [0, 0, 0])],
        reason: 'invalid-source-identity',
      },
      {
        sources: [
          source('same', 'dnd5e:props:brazier', '0,0,0', [0, 0, 0]),
          source('same', 'dnd5e:props:lantern', '0,0,0', [0, 0, 0]),
        ],
        reason: 'duplicate-source-identity',
      },
      {
        sources: [
          source('first', 'dnd5e:props:brazier', '0,0,0', [0, 0, 0]),
          source('second', 'dnd5e:props:brazier', '0,0,0', [0, 0, 0]),
        ],
        reason: 'duplicate-source-placement',
      },
    ] as const;

    for (const { sources, reason } of cases) {
      const facts = buildDungeonLightingFacts(
        ['0,0,0'],
        [region('room', ['0,0,0'])],
        sources
      );
      expect(facts.fallbackReason).toBe(reason);
      expect(facts.mode).toBe('legacy');
      expect(facts.sources).toEqual([]);
      expect(facts.regionByCell.size).toBe(0);
    }
  });

  it('trims region IDs and rejects empty or duplicate identities atomically', () => {
    const trimmed = buildDungeonLightingFacts(
      ['0,0,0'],
      [region(' room ', ['0,0,0'])],
      [source('torch', 'dnd5e:props:brazier', '0,0,0', [0, 0, 0])]
    );
    expect(trimmed.regionByCell.get('0,0,0')).toBe('room');
    expect(trimmed.sources[0]?.regionId).toBe('room');

    expect(
      buildDungeonLightingFacts(['0,0,0'], [region('   ', ['0,0,0'])], [])
        .fallbackReason
    ).toBe('invalid-region-identity');
    expect(
      buildDungeonLightingFacts(
        ['0,0,0', '1,0,0'],
        [region(' room ', ['0,0,0']), region('room', ['1,0,0'])],
        []
      ).fallbackReason
    ).toBe('duplicate-region-identity');
  });

  it('freezes facts and every returned plan collection deeply', () => {
    const facts = buildDungeonLightingFacts(
      ['0,0,0'],
      [region('room', ['0,0,0'])],
      [source('torch', 'dnd5e:props:brazier', '0,0,0', [0, 0, 0])]
    );
    const plan = resolveDungeonLighting(facts, { x: 0, z: 0 });
    const sourceFact = facts.sources[0]!;
    const pointLight = plan.pointLights[0]!;
    const pool = plan.floorPoolsByCell.get('0,0,0')![0]!;

    expect(Object.isFrozen(facts)).toBe(true);
    expect(Object.isFrozen(facts.regionByCell)).toBe(true);
    expect(Object.isFrozen(facts.intensityByCell)).toBe(true);
    expect(Object.isFrozen(facts.sources)).toBe(true);
    expect(Object.isFrozen(sourceFact)).toBe(true);
    expect(Object.isFrozen(sourceFact.position)).toBe(true);
    expect(Object.isFrozen(sourceFact.spec)).toBe(true);
    expect(() =>
      (facts.regionByCell as unknown as Map<string, string>).set(
        'other',
        'room'
      )
    ).toThrow();

    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.directionalPosition)).toBe(true);
    expect(Object.isFrozen(plan.pointLights)).toBe(true);
    expect(Object.isFrozen(pointLight)).toBe(true);
    expect(Object.isFrozen(pointLight.position)).toBe(true);
    expect(Object.isFrozen(plan.floorExposureByCell)).toBe(true);
    expect(Object.isFrozen(plan.floorPoolsByCell)).toBe(true);
    expect(Object.isFrozen(plan.floorPoolsByCell.get('0,0,0'))).toBe(true);
    expect(Object.isFrozen(pool)).toBe(true);
    expect(Object.isFrozen(pool.position)).toBe(true);
    expect(Object.isFrozen(plan.diagnostics)).toBe(true);
    expect(() =>
      (
        plan.floorPoolsByCell as unknown as Map<
          string,
          readonly DungeonFloorPool[]
        >
      ).clear()
    ).toThrow();
  });
});

describe('resolveDungeonLighting source budget and floor pools', () => {
  it('keeps exactly the nearest 12 sources in stable tie order and every pool uses that selection', () => {
    const cellKeys = Array.from(
      { length: 13 },
      (_, index) => `cell-${String(index).padStart(2, '0')}`
    );
    const sources = cellKeys.map((cellKey, index) =>
      source(
        `source-${String(index).padStart(2, '0')}`,
        'dnd5e:props:brazier',
        cellKey,
        [1, 0, 0]
      )
    );
    const facts = buildDungeonLightingFacts(
      cellKeys,
      [region('room', cellKeys)],
      sources
    );

    const plan = resolveDungeonLighting(facts, { x: 0, z: 0 });
    const expectedKeys = sources.slice(0, 12).map(({ key }) => key);

    expect(plan.pointLights.map(({ key }) => key)).toEqual(expectedKeys);
    expect(
      [...plan.floorPoolsByCell.values()].every((pools) => pools.length === 12)
    ).toBe(true);
    expect(
      [...plan.floorPoolsByCell.values()].flat().map(({ position }) => position)
    ).toHaveLength(12 * cellKeys.length);
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
