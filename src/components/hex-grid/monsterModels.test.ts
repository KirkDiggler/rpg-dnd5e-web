import { MonsterType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { describe, expect, it } from 'vitest';
import {
  pickStableCandidateIndex,
  resolveMonsterModelUrl,
} from './monsterModels';

describe('resolveMonsterModelUrl', () => {
  it('resolves the standing model for "skeleton" (v1alpha2 monsterRefId) to deterministic Soldier01', () => {
    expect(resolveMonsterModelUrl('skeleton', undefined, false)).toBe(
      '/models/synty/npcs/skeleton-soldier-01.glb'
    );
  });

  it('resolves the downed model for "skeleton"', () => {
    expect(resolveMonsterModelUrl('skeleton', undefined, true)).toBe(
      '/models/synty/npcs/skeleton-soldier-01-downed.glb'
    );
  });

  it('resolves the boss "skeleton-captain" ref id (rpg-toolkit#816 non-wight boss) to the promoted Skeleton_Knight visual', () => {
    expect(resolveMonsterModelUrl('skeleton-captain', undefined, false)).toBe(
      '/models/synty/npcs/skeleton-knight.glb'
    );
    expect(resolveMonsterModelUrl('skeleton-captain', undefined, true)).toBe(
      '/models/synty/npcs/skeleton-knight-downed.glb'
    );
  });

  it('is case-insensitive and trims whitespace, matching resolveClassCharacterModelUrl', () => {
    expect(resolveMonsterModelUrl(' SKELETON ', undefined, false)).toBe(
      '/models/synty/npcs/skeleton-soldier-01.glb'
    );
  });

  it('falls back to the v1alpha1 MonsterType enum when monsterRefId is absent', () => {
    expect(resolveMonsterModelUrl(undefined, MonsterType.SKELETON, false)).toBe(
      '/models/synty/npcs/skeleton-soldier-01.glb'
    );
    expect(
      resolveMonsterModelUrl(undefined, MonsterType.SKELETON_CAPTAIN, true)
    ).toBe('/models/synty/npcs/skeleton-knight-downed.glb');
  });

  it('falls back to the v1alpha1 MonsterType enum when monsterRefId is an empty string', () => {
    expect(resolveMonsterModelUrl('', MonsterType.SKELETON, false)).toBe(
      '/models/synty/npcs/skeleton-soldier-01.glb'
    );
  });

  it('prefers monsterRefId over monsterType when both are present', () => {
    // Deliberately mismatched inputs -- not a real server response -- to
    // prove precedence, same shape as obstaclePropKeys.test.ts's dual-signal
    // precedence coverage.
    expect(
      resolveMonsterModelUrl('skeleton-captain', MonsterType.SKELETON, false)
    ).toBe('/models/synty/npcs/skeleton-knight.glb');
  });

  it('keeps asset-ready Slave and spirits unselectable in Phase 1', () => {
    expect(
      resolveMonsterModelUrl('skeleton-slave', undefined, false)
    ).toBeUndefined();
    expect(resolveMonsterModelUrl('ghost', undefined, false)).toBeUndefined();
    expect(resolveMonsterModelUrl('specter', undefined, false)).toBeUndefined();
    expect(
      resolveMonsterModelUrl('tormented-soul', undefined, false)
    ).toBeUndefined();
  });

  it('keeps an authoritative unmapped monsterRefId over a mapped enum fallback', () => {
    expect(
      resolveMonsterModelUrl('ghost', MonsterType.SKELETON, false)
    ).toBeUndefined();
  });

  it("resolves the zombie ref (v1alpha1 MonsterType.ZOMBIE) to a mapped GLB, superseding rpg-dnd5e-web#559's no-zombie-GLB plan (rpg-dnd5e-web#673)", () => {
    const url = resolveMonsterModelUrl(
      undefined,
      MonsterType.ZOMBIE,
      false,
      'zombie-1'
    );
    expect(url).toBeDefined();
    expect(url).toMatch(
      /^\/models\/synty\/npcs\/zombie-(mutant|peasant-female)\.glb$/
    );
  });

  it('returns undefined for an unmapped MonsterType with no promoted GLB (ghoul, skeleton-archer)', () => {
    expect(
      resolveMonsterModelUrl(undefined, MonsterType.GHOUL, false)
    ).toBeUndefined();
    expect(
      resolveMonsterModelUrl(undefined, MonsterType.SKELETON_ARCHER, false)
    ).toBeUndefined();
  });

  it('returns undefined when neither signal is present', () => {
    expect(resolveMonsterModelUrl(undefined, undefined, false)).toBeUndefined();
    expect(
      resolveMonsterModelUrl(undefined, MonsterType.UNSPECIFIED, false)
    ).toBeUndefined();
  });

  it('returns undefined for an empty monsterRefId with no MonsterType fallback', () => {
    expect(resolveMonsterModelUrl('', undefined, false)).toBeUndefined();
  });
});

describe('rpg-dnd5e-web#673: stable per-entity zombie style selection', () => {
  // A representative spread of entity ids -- not hand-picked to land on a
  // particular hash bucket, just plausible real ids (server-issued UUID-ish
  // strings plus a couple of harness-style short ids). If a future change to
  // fnv1aHash/pickStableCandidateIndex collapses the zombie ref back down to
  // "always style 0", the coverage tests below (which assert BOTH styles
  // appear across this sample) go red -- proving discrimination rather than
  // asserting it.
  const SAMPLE_ENTITY_IDS = [
    'zombie-1',
    'zombie-2',
    'zombie-3',
    'zombie-4',
    'zombie-5',
    'zombie-6',
    'zombie-7',
    'zombie-8',
    'monster-encounter-1-slot-0',
    'monster-encounter-1-slot-1',
    '3f9a1c2e-88b1-4b2a-9c4e-0a1b2c3d4e5f',
    '9b8e7d6c-5a4b-3c2d-1e0f-a1b2c3d4e5f6',
  ];

  it('resolves both promoted zombie styles across a spread of entity ids -- discrimination, not a single default', () => {
    const urls = new Set(
      SAMPLE_ENTITY_IDS.map((id) =>
        resolveMonsterModelUrl('zombie', undefined, false, id)
      )
    );
    expect(urls).toContain('/models/synty/npcs/zombie-mutant.glb');
    expect(urls).toContain('/models/synty/npcs/zombie-peasant-female.glb');
    // Exactly the two promoted styles -- no undefined, no third url.
    expect(urls.size).toBe(2);
  });

  it('is stable for a single entity id across many repeated calls -- no per-render flicker', () => {
    for (const id of SAMPLE_ENTITY_IDS) {
      const first = resolveMonsterModelUrl('zombie', undefined, false, id);
      for (let i = 0; i < 20; i++) {
        expect(resolveMonsterModelUrl('zombie', undefined, false, id)).toBe(
          first
        );
      }
    }
  });

  it('lets two different zombie entities coexist with different styles in the same call sequence', () => {
    // Simulates rendering a two-zombie encounter: both resolved back-to-back,
    // neither call's result depends on call order or on the other entity.
    const mutantId = SAMPLE_ENTITY_IDS.find(
      (id) =>
        resolveMonsterModelUrl('zombie', undefined, false, id) ===
        '/models/synty/npcs/zombie-mutant.glb'
    )!;
    const peasantId = SAMPLE_ENTITY_IDS.find(
      (id) =>
        resolveMonsterModelUrl('zombie', undefined, false, id) ===
        '/models/synty/npcs/zombie-peasant-female.glb'
    )!;
    expect(mutantId).toBeDefined();
    expect(peasantId).toBeDefined();

    // Interleave calls in both orders -- neither entity's resolved url
    // shifts because the other one was resolved first or in between.
    expect(resolveMonsterModelUrl('zombie', undefined, false, mutantId)).toBe(
      '/models/synty/npcs/zombie-mutant.glb'
    );
    expect(resolveMonsterModelUrl('zombie', undefined, false, peasantId)).toBe(
      '/models/synty/npcs/zombie-peasant-female.glb'
    );
    expect(resolveMonsterModelUrl('zombie', undefined, false, mutantId)).toBe(
      '/models/synty/npcs/zombie-mutant.glb'
    );
    expect(resolveMonsterModelUrl('zombie', undefined, false, peasantId)).toBe(
      '/models/synty/npcs/zombie-peasant-female.glb'
    );
  });

  it('downed variant matches the SAME style as the standing variant, for every sampled entity', () => {
    for (const id of SAMPLE_ENTITY_IDS) {
      const standing = resolveMonsterModelUrl('zombie', undefined, false, id);
      const downed = resolveMonsterModelUrl('zombie', undefined, true, id);
      expect(standing).toBeDefined();
      expect(downed).toBeDefined();
      // The downed url is exactly the standing url's '-downed' sibling --
      // proves the SAME style index drove both resolutions, not two
      // independent picks that happened to agree.
      expect(downed).toBe(standing!.replace(/\.glb$/, '-downed.glb'));
    }
  });

  it('MonsterType.ZOMBIE fallback goes through the same stable per-entity selection as the v1alpha2 monsterRefId path', () => {
    for (const id of SAMPLE_ENTITY_IDS) {
      const viaRefId = resolveMonsterModelUrl('zombie', undefined, false, id);
      const viaType = resolveMonsterModelUrl(
        undefined,
        MonsterType.ZOMBIE,
        false,
        id
      );
      expect(viaType).toBe(viaRefId);
    }
  });

  it('single-candidate refs (skeleton, skeleton-captain) ignore entityId entirely -- unaffected by #673', () => {
    for (const id of SAMPLE_ENTITY_IDS) {
      expect(resolveMonsterModelUrl('skeleton', undefined, false, id)).toBe(
        '/models/synty/npcs/skeleton-soldier-01.glb'
      );
      expect(
        resolveMonsterModelUrl('skeleton-captain', undefined, false, id)
      ).toBe('/models/synty/npcs/skeleton-knight.glb');
    }
  });
});

describe('pickStableCandidateIndex', () => {
  it('always returns 0 for a single-candidate list, regardless of id', () => {
    expect(pickStableCandidateIndex('any-id', 1)).toBe(0);
    expect(pickStableCandidateIndex('another-id', 1)).toBe(0);
    expect(pickStableCandidateIndex(undefined, 1)).toBe(0);
  });

  it('always returns 0 for a zero-length list (defensive)', () => {
    expect(pickStableCandidateIndex('any-id', 0)).toBe(0);
  });

  it('returns 0 for an undefined entityId, regardless of count', () => {
    expect(pickStableCandidateIndex(undefined, 2)).toBe(0);
    expect(pickStableCandidateIndex(undefined, 5)).toBe(0);
  });

  it('returns 0 for an empty-string entityId', () => {
    expect(pickStableCandidateIndex('', 2)).toBe(0);
  });

  it('is stable across repeated calls for the same id and count', () => {
    const id = 'stability-check-entity';
    const first = pickStableCandidateIndex(id, 2);
    for (let i = 0; i < 50; i++) {
      expect(pickStableCandidateIndex(id, 2)).toBe(first);
    }
  });

  it('produces both indices across a sample of ids for count=2 -- real discrimination', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `entity-${i}`);
    const indices = new Set(ids.map((id) => pickStableCandidateIndex(id, 2)));
    expect(indices).toContain(0);
    expect(indices).toContain(1);
  });

  it('always returns an index within [0, count)', () => {
    const ids = ['a', 'bb', 'ccc', 'dddd', 'eeeee', 'zombie-99', ''];
    for (const id of ids) {
      for (const count of [1, 2, 3, 5]) {
        const idx = pickStableCandidateIndex(id, count);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(count);
      }
    }
  });
});
