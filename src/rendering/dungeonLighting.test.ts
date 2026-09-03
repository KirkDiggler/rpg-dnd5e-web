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
    [
      'source outside region',
      [region('room', ['0,0,0'])],
      [source('outside', 'dnd5e:props:brazier', '1,-1,0', [0, 0, 0])],
      'source-outside-region',
    ],
  ] as const)(
    'rejects %s with the exact fallback reason',
    (_label, regions, sources, reason) => {
      const facts = buildDungeonLightingFacts(['0,0,0'], regions, sources);
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

// ---------------------------------------------------------------------------
// Plain floor is lit like the floor beside it (rpg-project#360, design §2.1).
// An ownerless floor cell takes the light of the NEAREST owned floor cell.
// This replaced a bail that dropped the WHOLE dungeon to legacy lighting the
// moment any floor cell had no region — a guard written when that was
// impossible, and impossible is exactly what scenery stopped being.
// ---------------------------------------------------------------------------

describe('ownerless floor takes the nearest owned cell’s light', () => {
  /** A row of adjacent hexes: step (1,-1,0) from the origin. */
  const row = (n: number) =>
    Array.from({ length: n }, (_, i) => `${i},${-i},0`);
  const FOCUS = { x: 0, z: 0 };

  it('leaves every OWNED cell byte-identical to the pre-scenery answer', () => {
    const cells = row(3);
    const regions = [
      region('bright', [cells[0]], 0.6),
      region('dark', [cells[2]], 0.15),
    ];
    const before = buildDungeonLightingFacts([cells[0], cells[2]], regions, []);
    // The same document with one scenery cell painted between them.
    const after = buildDungeonLightingFacts(cells, regions, []);

    for (const owned of [cells[0], cells[2]]) {
      expect(after.intensityByCell.get(owned)).toBe(
        before.intensityByCell.get(owned)
      );
      expect(after.regionByCell.get(owned)).toBe(
        before.regionByCell.get(owned)
      );
    }
    expect(after.mode).toBe('crypt');
    expect(after.fallbackReason).toBeNull();
  });

  it('gives a scenery cell its neighbour’s intensity, and its floor pools with it', () => {
    const cells = row(2);
    const facts = buildDungeonLightingFacts(
      cells,
      [region('bright', [cells[0]], 0.6)],
      [source('torch', 'dnd5e:props:brazier', cells[0], [0, 0, 0])]
    );
    expect(facts.intensityByCell.get(cells[1])).toBe(0.6);
    // The REGION is inherited too, so the strip is not an unpooled fringe
    // beside pooled floor — the tell this design exists to remove.
    expect(facts.regionByCell.get(cells[1])).toBe('bright');
    const plan = resolveDungeonLighting(facts, FOCUS);
    expect(plan.floorExposureByCell.get(cells[1])).toBe(0.6);
    expect(plan.floorPoolsByCell.get(cells[1])?.length).toBe(1);
  });

  it('splits a strip between two rooms of different light at the flood boundary, deterministically', () => {
    const cells = row(5);
    const bright = region('bright', [cells[0]], 0.6);
    const dark = region('dark', [cells[4]], 0.15);
    const expected = {
      [cells[1]]: 0.6, // one step from bright, three from dark
      [cells[2]]: 0.6, // two from each — the tie goes to the earlier atlas cell
      [cells[3]]: 0.15, // one step from dark
    };

    // Listing the regions the other way round must not change the answer:
    // the tie is broken by ATLAS cell order, not by iteration order.
    for (const regions of [
      [bright, dark],
      [dark, bright],
    ]) {
      const facts = buildDungeonLightingFacts(cells, regions, []);
      for (const [cellKey, intensity] of Object.entries(expected)) {
        expect(facts.intensityByCell.get(cellKey)).toBe(intensity);
      }
    }
  });

  it('breaks a tie by ATLAS cell order, so reversing the atlas flips the split', () => {
    // Same geometry, same regions, the floor list reversed. The contested
    // middle cell is two steps from each room, so the only thing that can
    // decide it is which owned cell the atlas lists first.
    const cells = row(5);
    const regions = [
      region('bright', [cells[0]], 0.6),
      region('dark', [cells[4]], 0.15),
    ];
    expect(
      buildDungeonLightingFacts(cells, regions, []).intensityByCell.get(
        cells[2]
      )
    ).toBe(0.6);
    expect(
      buildDungeonLightingFacts(
        [...cells].reverse(),
        regions,
        []
      ).intensityByCell.get(cells[2])
    ).toBe(0.15);
  });

  it('leaves an isolated scenery cell to the scene’s ambient', () => {
    // An island: floor, but no owned floor reachable through floor.
    const island = '9,-9,0';
    const facts = buildDungeonLightingFacts(
      ['0,0,0', island],
      [region('bright', ['0,0,0'], 0.6)],
      []
    );
    // Unlisted in both maps is what "ambient" has always meant here.
    expect(facts.intensityByCell.has(island)).toBe(false);
    expect(facts.regionByCell.has(island)).toBe(false);
    expect(facts.mode).toBe('crypt');
  });

  it('never shows the legacy banner for ownerless floor', () => {
    const plan = resolveDungeonLighting(
      buildDungeonLightingFacts(row(4), [region('bright', ['0,0,0'], 0.6)], []),
      FOCUS
    );
    expect(plan.mode).toBe('crypt');
    expect(plan.diagnostics).toEqual([]);
  });

  it('accepts a light source standing ON scenery, attributed to the light it inherited', () => {
    // Props may sit on scenery (design §2.4/F2), and a brazier is a prop.
    // Before the flood this was `source-outside-region` and took the whole
    // dungeon to legacy with it.
    const cells = row(2);
    const facts = buildDungeonLightingFacts(
      cells,
      [region('bright', [cells[0]], 0.6)],
      [source('torch', 'dnd5e:props:brazier', cells[1], [1, 0, 0])]
    );
    expect(facts.fallbackReason).toBeNull();
    expect(facts.sources).toHaveLength(1);
    expect(facts.sources[0]?.regionId).toBe('bright');
  });
});
