import { MonsterType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { describe, expect, it } from 'vitest';
import { resolveMonsterModelUrl } from './monsterModels';

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

  it('returns undefined for an unmapped MonsterType (no zombie GLB is promoted -- rpg-dnd5e-web#559 tracks a green-tinted class-model reuse instead)', () => {
    expect(
      resolveMonsterModelUrl(undefined, MonsterType.ZOMBIE, false)
    ).toBeUndefined();
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
