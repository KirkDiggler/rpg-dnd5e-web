import type { EquippedMap } from '@/components/game/equipment/equipmentTypes';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_OFF_HAND_ITEMS,
  MODULAR_FANTASY_HERO_OFF_HAND_SOCKET,
  TOWNFOLK_OFF_HAND_SOCKET,
  offHandSocketForRigFamily,
  resolveOffHandPresentation,
} from './offHandEquipment';

const equipped = (type: string, id: string): EquippedMap => ({
  off_hand: { module: 'dnd5e', type, id },
});

describe('off-hand presentation catalog', () => {
  it('uses the exact reviewed five-item order and provider URLs', () => {
    expect(CURRENT_OFF_HAND_ITEMS).toEqual([
      {
        ref: 'dnd5e:item:shield',
        id: 'shield',
        label: 'Shield',
        assetKind: 'shield',
        assetUrl: '/models/synty/off-hand/shield.glb',
      },
      {
        ref: 'dnd5e:item:dagger',
        id: 'dagger',
        label: 'Dagger',
        assetKind: 'weapon',
        assetUrl: '/models/synty/weapons/dagger.glb',
      },
      {
        ref: 'dnd5e:item:shortsword',
        id: 'shortsword',
        label: 'Shortsword',
        assetKind: 'weapon',
        assetUrl: '/models/synty/weapons/shortsword.glb',
      },
      {
        ref: 'dnd5e:item:handaxe',
        id: 'handaxe',
        label: 'Handaxe',
        assetKind: 'weapon',
        assetUrl: '/models/synty/off-hand/handaxe.glb',
      },
      {
        ref: 'dnd5e:item:sickle',
        id: 'sickle',
        label: 'Sickle',
        assetKind: 'weapon',
        assetUrl: '/models/synty/off-hand/sickle.glb',
      },
    ]);
  });

  it('maps only exact reviewed item refs', () => {
    expect(
      resolveOffHandPresentation(equipped('item', 'shield'))
    ).toMatchObject({
      code: 'mapped',
      presentation: {
        ref: 'dnd5e:item:shield',
        assetUrl: '/models/synty/off-hand/shield.glb',
      },
    });
    expect(
      resolveOffHandPresentation(equipped('item', 'dagger'))
    ).toMatchObject({
      code: 'mapped',
      presentation: {
        ref: 'dnd5e:item:dagger',
        assetUrl: '/models/synty/weapons/dagger.glb',
      },
    });
    expect(
      resolveOffHandPresentation(equipped('item', 'handaxe'))
    ).toMatchObject({
      code: 'mapped',
      presentation: {
        ref: 'dnd5e:item:handaxe',
        assetUrl: '/models/synty/off-hand/handaxe.glb',
      },
    });
    expect(resolveOffHandPresentation(equipped('item', 'war-pick'))).toEqual({
      code: 'unmapped-ref',
      ref: 'dnd5e:item:war-pick',
    });
    expect(resolveOffHandPresentation(equipped('weapons', 'dagger'))).toEqual({
      code: 'unmapped-ref',
      ref: 'dnd5e:weapons:dagger',
    });
    expect(resolveOffHandPresentation({})).toEqual({ code: 'empty-off-hand' });
  });

  it('selects one exact socket per rig family', () => {
    expect(offHandSocketForRigFamily('townfolk-v1')).toBe(
      TOWNFOLK_OFF_HAND_SOCKET
    );
    expect(offHandSocketForRigFamily('modular-fantasy-hero-v1')).toBe(
      MODULAR_FANTASY_HERO_OFF_HAND_SOCKET
    );
    expect(TOWNFOLK_OFF_HAND_SOCKET).toEqual({
      bone: 'Hand_L',
      boneUnitMeters: 0.01,
      positionMeters: [
        0.08494041442871093, -0.02545013666152954, -0.06444666385650635,
      ],
      rotationQuaternion: [
        0.6342147588729858, 0.538684606552124, 0.31252291798591614,
        0.45817017555236816,
      ],
      scale: 1,
    });
    expect(MODULAR_FANTASY_HERO_OFF_HAND_SOCKET).toEqual({
      bone: 'Hand_L',
      boneUnitMeters: 0.01,
      positionMeters: [
        0.08494034767150879, -0.02544997215270996, -0.06444608211517334,
      ],
      rotationQuaternion: [
        0.6342122554779053, 0.5386871099472046, 0.31252241134643555,
        0.4581710696220398,
      ],
      scale: 1,
    });
  });
});
