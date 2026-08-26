import type { EquippedMap } from '@/components/game/equipment/equipmentTypes';
import { describe, expect, it } from 'vitest';
import {
  PROVISIONAL_FIGHTER_SOCKET,
  WEAPON_ATTACHMENT_FIXTURES,
  canRecordWeaponVerdict,
  coverageFor,
  resolveProvisionalMainHand,
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
  it('maps only exact equipped item refs to provisional assets', () => {
    expect(
      resolveProvisionalMainHand(equipped(ref('item', 'longsword')))
    ).toEqual({
      code: 'mapped',
      ref: 'dnd5e:item:longsword',
      candidate: {
        ref: 'dnd5e:item:longsword',
        source: 'SM_Wep_Slayer_01 · rejected oversized longsword candidate',
        weaponUrl: '/models/synty/characters/weapons/fighter-weapon.glb',
        decodedTextureMb: 16,
        budgetMb: 4.5,
      },
      presentation: {
        ref: 'dnd5e:item:longsword',
        weaponUrl: '/models/synty/characters/weapons/fighter-weapon.glb',
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
        source: 'SM_Prop_Bow_01 · accepted provisional shortbow candidate',
        weaponUrl: '/models/synty/characters/weapons/bow-01.glb',
        decodedTextureMb: 64,
        budgetMb: 4.5,
      },
      presentation: {
        ref: 'dnd5e:item:shortbow',
        weaponUrl: '/models/synty/characters/weapons/bow-01.glb',
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

  it('requires each dimension, not the 108-case Cartesian product', () => {
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
    ];

    expect(coverageFor(observations)).toEqual({
      equipmentStates: ['unarmed', 'longsword', 'shortbow'],
      motions: ['idle', 'walk'],
      views: ['close', 'orbit', 'play'],
      facings: [0, 1, 2, 3, 4, 5],
    });
    expect(canRecordWeaponVerdict(observations)).toBe(true);
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
