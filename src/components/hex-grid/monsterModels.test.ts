// @vitest-environment node
import { MonsterType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { describe, expect, it } from 'vitest';
import {
  monsterHidesWhenDowned,
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

  it("resolves the zombie ref (v1alpha1 MonsterType.ZOMBIE) to the gaunt GLB, superseding rpg-dnd5e-web#559's no-zombie-GLB plan", () => {
    const url = resolveMonsterModelUrl(
      undefined,
      MonsterType.ZOMBIE,
      false,
      'zombie-1'
    );
    expect(url).toBe('/models/synty/npcs/zombie-peasant-female.glb');
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

describe('zombie renders one look (gaunt) for every entity', () => {
  // A representative spread of entity ids -- not hand-picked to land on a
  // particular hash bucket, just plausible real ids (server-issued UUID-ish
  // strings plus a couple of harness-style short ids).
  //
  // rpg-dnd5e-web#673 mapped TWO zombie looks and used this same sample to
  // prove the resolver DISCRIMINATED between them. Kirk narrowed the ref to
  // one look on 2026-09-11, so the sample now proves the opposite property:
  // no entity id, however it hashes, can produce anything but the gaunt GLB.
  // Keeping the spread matters more than before -- a single 'zombie-1' would
  // pass even if a second candidate were reintroduced by accident.
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

  it('resolves the gaunt GLB for every sampled entity id -- one look, not a per-entity pick', () => {
    const urls = new Set(
      SAMPLE_ENTITY_IDS.map((id) =>
        resolveMonsterModelUrl('zombie', undefined, false, id)
      )
    );
    // One url across the whole spread. The hulking look (zombie-mutant.glb)
    // is still a promoted asset in rpg-game-assets but is deliberately not
    // mapped here, so it must never come back out of the resolver.
    expect(urls).toEqual(
      new Set(['/models/synty/npcs/zombie-peasant-female.glb'])
    );
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

  it('gives two zombies in one encounter the same look, resolved in either order', () => {
    // The inverse of what #673 asserted here. Two zombies standing next to
    // each other are now the same creature twice over, and call order still
    // cannot change either answer.
    const [first, second] = SAMPLE_ENTITY_IDS;
    const gaunt = '/models/synty/npcs/zombie-peasant-female.glb';

    expect(resolveMonsterModelUrl('zombie', undefined, false, first)).toBe(
      gaunt
    );
    expect(resolveMonsterModelUrl('zombie', undefined, false, second)).toBe(
      gaunt
    );
    expect(resolveMonsterModelUrl('zombie', undefined, false, first)).toBe(
      gaunt
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

  it('MonsterType.ZOMBIE fallback resolves identically to the v1alpha2 monsterRefId path', () => {
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

  it('every mapped ref now ignores entityId entirely -- skeleton, skeleton-captain and zombie alike', () => {
    for (const id of SAMPLE_ENTITY_IDS) {
      expect(resolveMonsterModelUrl('skeleton', undefined, false, id)).toBe(
        '/models/synty/npcs/skeleton-soldier-01.glb'
      );
      expect(
        resolveMonsterModelUrl('skeleton-captain', undefined, false, id)
      ).toBe('/models/synty/npcs/skeleton-knight.glb');
      expect(resolveMonsterModelUrl('zombie', undefined, false, id)).toBe(
        '/models/synty/npcs/zombie-peasant-female.glb'
      );
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

describe('animated armor — mapped, and standing-only', () => {
  it('resolves the open-helm GLB while standing', () => {
    expect(
      resolveMonsterModelUrl('animated-armor', undefined, false, 'armor-1')
    ).toBe('/models/synty/npcs/animated-armor-open-helm.glb');
  });

  it('resolves NO url once downed -- never derives a -downed.glb that 404s', () => {
    expect(
      resolveMonsterModelUrl('animated-armor', undefined, true, 'armor-1')
    ).toBeUndefined();
    // Specifically not the suffix-derived url every other ref would get.
    expect(
      resolveMonsterModelUrl('animated-armor', undefined, true, 'armor-1')
    ).not.toBe('/models/synty/npcs/animated-armor-open-helm-downed.glb');
  });

  it('reports that it hides when downed, so an undefined url is read as "draw nothing"', () => {
    expect(monsterHidesWhenDowned('animated-armor', undefined)).toBe(true);
  });

  // The distinction the whole mechanism rests on: three refs all resolve to
  // undefined when downed, for three different reasons, and only one of them
  // should render nothing. Without monsterHidesWhenDowned, HexEntity cannot
  // tell them apart and an unmapped monster would silently vanish instead of
  // showing its placeholder.
  it('does not claim hidden for refs that merely lack a mapping', () => {
    expect(monsterHidesWhenDowned('ghost', undefined)).toBe(false);
    expect(monsterHidesWhenDowned(undefined, undefined)).toBe(false);
    expect(monsterHidesWhenDowned('', undefined)).toBe(false);
  });

  it('does not claim hidden for refs that DO ship a downed sibling', () => {
    for (const ref of ['skeleton', 'skeleton-captain', 'zombie']) {
      expect(monsterHidesWhenDowned(ref, undefined)).toBe(false);
      expect(resolveMonsterModelUrl(ref, undefined, true, 'entity-1')).toMatch(
        /-downed\.glb$/
      );
    }
  });

  it('has no v1alpha1 MonsterType enum value -- the ref-id path is the only way in', () => {
    // The sealed enum predates constructs entirely; nothing maps to
    // 'animated-armor', so an enum-only caller resolves nothing. Documents
    // why no enum entry was added rather than leaving it looking forgotten.
    const viaEnumOnly = Object.values(MonsterType)
      .filter((v): v is MonsterType => typeof v === 'number')
      .map((t) => resolveMonsterModelUrl(undefined, t, false, 'armor-1'));
    expect(viaEnumOnly).not.toContain(
      '/models/synty/npcs/animated-armor-open-helm.glb'
    );
  });
});
