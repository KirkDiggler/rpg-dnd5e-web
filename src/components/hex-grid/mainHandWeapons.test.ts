import type { EquippedMap } from '@/components/game/equipment/equipmentTypes';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_MAIN_HAND_WEAPONS,
  TOWNFOLK_MAIN_HAND_SOCKET,
  resolveMainHandPresentation,
} from './mainHandWeapons';

const itemRef = (id: string) => ({ module: 'dnd5e', type: 'item', id });
const equipped = (id?: string): EquippedMap =>
  id ? { main_hand: itemRef(id) } : {};

const EXPECTED_WEAPONS = [
  ['shortbow', 'Shortbow', '/models/synty/weapons/shortbow.glb'],
  ['longsword', 'Longsword', '/models/synty/weapons/longsword.glb'],
  ['shortsword', 'Shortsword', '/models/synty/weapons/shortsword.glb'],
  ['dagger', 'Dagger', '/models/synty/weapons/dagger.glb'],
  ['greataxe', 'Greataxe', '/models/synty/weapons/greataxe.glb'],
  ['quarterstaff', 'Quarterstaff', '/models/synty/weapons/quarterstaff.glb'],
  ['greatsword', 'Greatsword', '/models/synty/weapons/greatsword.glb'],
  ['battleaxe', 'Battleaxe', '/models/synty/weapons/battleaxe.glb'],
  ['handaxe', 'Handaxe', '/models/synty/weapons/handaxe.glb'],
  ['club', 'Club', '/models/synty/weapons/club.glb'],
  ['greatclub', 'Greatclub', '/models/synty/weapons/greatclub.glb'],
  ['warhammer', 'Warhammer', '/models/synty/weapons/warhammer.glb'],
] as const;

describe('production main-hand weapon presentation', () => {
  it.each(EXPECTED_WEAPONS)(
    'maps the exact dnd5e:item:%s ref to its promoted provider path',
    (id, label, weaponUrl) => {
      const result = resolveMainHandPresentation(equipped(id));

      expect(result).toEqual({
        code: 'mapped',
        ref: `dnd5e:item:${id}`,
        weapon: {
          ref: `dnd5e:item:${id}`,
          id,
          label,
          weaponUrl,
        },
        presentation: {
          ref: `dnd5e:item:${id}`,
          weaponUrl,
          socket: TOWNFOLK_MAIN_HAND_SOCKET,
        },
      });
    }
  );

  it('exposes exactly the current 12-item provider roster', () => {
    expect(CURRENT_MAIN_HAND_WEAPONS).toHaveLength(12);
    expect(CURRENT_MAIN_HAND_WEAPONS.map((weapon) => weapon.ref)).toEqual(
      EXPECTED_WEAPONS.map(([id]) => `dnd5e:item:${id}`)
    );
  });

  it('treats absent main_hand as intentionally unarmed', () => {
    expect(resolveMainHandPresentation({})).toEqual({ code: 'unarmed' });
  });

  it('refuses unknown and attack-shaped refs instead of guessing', () => {
    expect(resolveMainHandPresentation(equipped('rapier'))).toEqual({
      code: 'unmapped-ref',
      ref: 'dnd5e:item:rapier',
    });
    expect(
      resolveMainHandPresentation({
        main_hand: { module: 'dnd5e', type: 'weapons', id: 'longsword' },
      })
    ).toEqual({
      code: 'unmapped-ref',
      ref: 'dnd5e:weapons:longsword',
    });
  });

  it('uses the one accepted townfolk socket for every mapped weapon', () => {
    expect(TOWNFOLK_MAIN_HAND_SOCKET).toEqual({
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
    for (const [id] of EXPECTED_WEAPONS) {
      const result = resolveMainHandPresentation(equipped(id));
      expect(result.presentation?.socket).toBe(TOWNFOLK_MAIN_HAND_SOCKET);
    }
  });
});
