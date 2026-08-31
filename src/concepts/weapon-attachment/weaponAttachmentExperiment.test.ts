import type { EquippedMap } from '@/components/game/equipment/equipmentTypes';
import { describe, expect, it } from 'vitest';
import {
  PROVISIONAL_FIGHTER_SOCKET,
  WEAPON_ATTACHMENT_FIXTURES,
  canRecordWeaponVerdict,
  coverageFor,
  resolveProvisionalMainHand,
  weaponConceptVerdict,
  type WeaponRenderObservation,
} from './weaponAttachmentExperiment';

const ref = (type: string, id: string) => ({
  module: 'dnd5e',
  type,
  id,
});
const equipped = (mainHand?: ReturnType<typeof ref>): EquippedMap =>
  mainHand ? { main_hand: mainHand } : {};

describe('weapon attachment experiment', () => {
  it('maps only exact equipped item refs to production provider assets', () => {
    expect(
      resolveProvisionalMainHand(equipped(ref('item', 'longsword')))
    ).toEqual({
      code: 'mapped',
      ref: 'dnd5e:item:longsword',
      candidate: {
        ref: 'dnd5e:item:longsword',
        source: 'rpg-game-assets#100 · 27-item provider manifest',
        weaponUrl: '/models/synty/weapons/longsword.glb',
        decodedTextureMb: 4,
        budgetMb: 4.5,
      },
      presentation: {
        ref: 'dnd5e:item:longsword',
        weaponUrl: '/models/synty/weapons/longsword.glb',
        socket: PROVISIONAL_FIGHTER_SOCKET,
      },
    });
    expect(
      resolveProvisionalMainHand(equipped(ref('item', 'shortbow')))
    ).toEqual({
      code: 'mapped',
      ref: 'dnd5e:item:shortbow',
      candidate: {
        ref: 'dnd5e:item:shortbow',
        source: 'rpg-game-assets#100 · 27-item provider manifest',
        weaponUrl: '/models/synty/weapons/shortbow.glb',
        decodedTextureMb: 4,
        budgetMb: 4.5,
      },
      presentation: {
        ref: 'dnd5e:item:shortbow',
        weaponUrl: '/models/synty/weapons/shortbow.glb',
        socket: PROVISIONAL_FIGHTER_SOCKET,
      },
    });
    expect(
      resolveProvisionalMainHand(equipped(ref('weapons', 'longsword')))
    ).toEqual({
      code: 'unmapped-ref',
      ref: 'dnd5e:weapons:longsword',
    });
  });

  it('treats absent main_hand as intentionally unarmed', () => {
    expect(resolveProvisionalMainHand({})).toEqual({ code: 'unarmed' });
  });

  it('uses one frozen fighter socket object for both candidates', () => {
    const sword = WEAPON_ATTACHMENT_FIXTURES.longsword.equipped.main_hand!;
    const bow = WEAPON_ATTACHMENT_FIXTURES.shortbow.equipped.main_hand!;
    const swordResult = resolveProvisionalMainHand({ main_hand: sword });
    const bowResult = resolveProvisionalMainHand({ main_hand: bow });
    expect(PROVISIONAL_FIGHTER_SOCKET).toEqual({
      bone: 'Hand_R',
      boneUnitMeters: 0.01,
      positionMeters: [
        -0.11356871832209599, 0.0437807216160595, -0.0070717729664129085,
      ],
      rotationQuaternion: [
        -0.31717459916354807, -0.45555976264236875, 0.6828311428133312,
        0.47498148472569474,
      ],
      scale: 1,
    });
    expect(swordResult.presentation?.socket).toBe(PROVISIONAL_FIGHTER_SOCKET);
    expect(bowResult.presentation?.socket).toBe(PROVISIONAL_FIGHTER_SOCKET);
  });

  const observation = (
    changes: Partial<WeaponRenderObservation>
  ): WeaponRenderObservation => ({
    equipmentState: 'unarmed',
    motion: 'idle',
    view: 'close',
    facing: 0,
    attachmentCode: 'unarmed',
    ...changes,
  });

  it('requires each dimension, not the Cartesian product', () => {
    const observations: WeaponRenderObservation[] = [
      observation({ equipmentState: 'unarmed', attachmentCode: 'unarmed' }),
      observation({
        equipmentState: 'longsword',
        motion: 'walk',
        view: 'orbit',
        facing: 1,
        attachmentCode: 'attached',
      }),
      observation({
        equipmentState: 'shortbow',
        view: 'play',
        facing: 2,
        attachmentCode: 'attached',
      }),
      observation({ facing: 3 }),
      observation({ facing: 4 }),
      observation({ facing: 5 }),
      observation({ equipmentState: 'shortsword', attachmentCode: 'attached' }),
      observation({ equipmentState: 'dagger', attachmentCode: 'attached' }),
      observation({ equipmentState: 'greataxe', attachmentCode: 'attached' }),
      observation({
        equipmentState: 'quarterstaff',
        attachmentCode: 'attached',
      }),
      observation({ equipmentState: 'greatsword', attachmentCode: 'attached' }),
      observation({ equipmentState: 'battleaxe', attachmentCode: 'attached' }),
      observation({ equipmentState: 'handaxe', attachmentCode: 'attached' }),
      observation({ equipmentState: 'club', attachmentCode: 'attached' }),
      observation({ equipmentState: 'greatclub', attachmentCode: 'attached' }),
      observation({ equipmentState: 'warhammer', attachmentCode: 'attached' }),
      observation({
        equipmentState: 'light-crossbow',
        attachmentCode: 'attached',
      }),
      observation({ equipmentState: 'longbow', attachmentCode: 'attached' }),
      observation({ equipmentState: 'javelin', attachmentCode: 'attached' }),
      observation({ equipmentState: 'rapier', attachmentCode: 'attached' }),
      observation({
        equipmentState: 'light-hammer',
        attachmentCode: 'attached',
      }),
      observation({ equipmentState: 'mace', attachmentCode: 'attached' }),
      observation({ equipmentState: 'sickle', attachmentCode: 'attached' }),
      observation({ equipmentState: 'spear', attachmentCode: 'attached' }),
      observation({ equipmentState: 'sling', attachmentCode: 'attached' }),
      observation({ equipmentState: 'dart', attachmentCode: 'attached' }),
      observation({ equipmentState: 'halberd', attachmentCode: 'attached' }),
      observation({ equipmentState: 'maul', attachmentCode: 'attached' }),
      observation({
        equipmentState: 'morningstar',
        attachmentCode: 'attached',
      }),
      observation({ equipmentState: 'pike', attachmentCode: 'attached' }),
      observation({ equipmentState: 'war-pick', attachmentCode: 'attached' }),
    ];

    expect(coverageFor(observations)).toEqual({
      equipmentStates: [
        'unarmed',
        'shortbow',
        'longsword',
        'shortsword',
        'dagger',
        'greataxe',
        'quarterstaff',
        'greatsword',
        'battleaxe',
        'handaxe',
        'club',
        'greatclub',
        'warhammer',
        'light-crossbow',
        'longbow',
        'javelin',
        'rapier',
        'light-hammer',
        'mace',
        'sickle',
        'spear',
        'sling',
        'dart',
        'halberd',
        'maul',
        'morningstar',
        'pike',
        'war-pick',
      ],
      motions: ['idle', 'walk'],
      views: ['close', 'orbit', 'play'],
      facings: [0, 1, 2, 3, 4, 5],
    });
    expect(canRecordWeaponVerdict(observations)).toBe(true);
    const verdict = weaponConceptVerdict(observations);
    expect(verdict).toMatchObject({
      classModels: {
        fighter: '/models/synty/characters/fighter.glb',
        barbarian: '/models/synty/characters/barbarian.glb',
        monk: '/models/synty/characters/monk.glb',
        rogue: '/models/synty/characters/rogue.glb',
      },
    });
    expect(verdict).not.toHaveProperty('fighterModel');
  });

  it('does not credit a mapped weapon until its status is attached', () => {
    const observations = [
      observation({ equipmentState: 'unarmed' }),
      observation({
        equipmentState: 'longsword',
        attachmentCode: 'loading',
      }),
      observation({
        equipmentState: 'shortbow',
        attachmentCode: 'asset-load-failed',
      }),
    ];
    expect(coverageFor(observations).equipmentStates).toEqual(['unarmed']);
    expect(canRecordWeaponVerdict(observations)).toBe(false);
  });
});
