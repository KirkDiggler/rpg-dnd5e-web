import type { EquippedMap } from '@/components/game/equipment/equipmentTypes';
import { describe, expect, it } from 'vitest';
import type { MainHandSocket } from './mainHandPresentation';
import * as mainHandWeapons from './mainHandWeapons';

const {
  CURRENT_MAIN_HAND_WEAPONS,
  TOWNFOLK_MAIN_HAND_SOCKET,
  resolveMainHandPresentation,
} = mainHandWeapons;

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
  [
    'light-crossbow',
    'Light Crossbow',
    '/models/synty/weapons/light-crossbow.glb',
  ],
  ['longbow', 'Longbow', '/models/synty/weapons/longbow.glb'],
  ['javelin', 'Javelin', '/models/synty/weapons/javelin.glb'],
  ['rapier', 'Rapier', '/models/synty/weapons/rapier.glb'],
  ['light-hammer', 'Light Hammer', '/models/synty/weapons/light-hammer.glb'],
  ['mace', 'Mace', '/models/synty/weapons/mace.glb'],
  ['sickle', 'Sickle', '/models/synty/weapons/sickle.glb'],
  ['spear', 'Spear', '/models/synty/weapons/spear.glb'],
  ['sling', 'Sling', '/models/synty/weapons/sling.glb'],
  ['dart', 'Dart', '/models/synty/weapons/dart.glb'],
] as const;

const EXPECTED_MODULAR_FANTASY_HERO_MAIN_HAND_SOCKET = {
  bone: 'Hand_R',
  boneUnitMeters: 0.01,
  positionMeters: [-0.113634511828, 0.043524894863, -0.006868128199],
  rotationQuaternion: [
    -0.31697111189640637, -0.4555468694563118, 0.6829896921327775,
    0.47490151020194044,
  ],
  scale: 1,
} satisfies MainHandSocket;

type Task8MainHandWeaponsModule = typeof mainHandWeapons & {
  MODULAR_FANTASY_HERO_MAIN_HAND_SOCKET?: MainHandSocket;
  mainHandSocketForRigFamily?: (
    rigFamily: 'townfolk-v1' | 'modular-fantasy-hero-v1'
  ) => MainHandSocket;
};

const task8MainHandWeapons = mainHandWeapons as Task8MainHandWeaponsModule;

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

  it('exposes the exact 22-item provider roster in order with no duplicates', () => {
    expect(CURRENT_MAIN_HAND_WEAPONS).toEqual(
      EXPECTED_WEAPONS.map(([id, label, weaponUrl]) => ({
        ref: `dnd5e:item:${id}`,
        id,
        label,
        weaponUrl,
      }))
    );

    expect(
      new Set(CURRENT_MAIN_HAND_WEAPONS.map((weapon) => weapon.ref)).size
    ).toBe(22);
    expect(
      new Set(CURRENT_MAIN_HAND_WEAPONS.map((weapon) => weapon.weaponUrl)).size
    ).toBe(22);
  });

  it('treats absent main_hand as intentionally unarmed', () => {
    expect(resolveMainHandPresentation({})).toEqual({ code: 'unarmed' });
  });

  it('refuses unknown exact item refs and attack-shaped refs instead of guessing', () => {
    expect(resolveMainHandPresentation(equipped('morningstar'))).toEqual({
      code: 'unmapped-ref',
      ref: 'dnd5e:item:morningstar',
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

  it('pins the reviewed modular-fantasy-hero socket and returns stable rig-family identities', () => {
    expect(task8MainHandWeapons.MODULAR_FANTASY_HERO_MAIN_HAND_SOCKET).toEqual(
      EXPECTED_MODULAR_FANTASY_HERO_MAIN_HAND_SOCKET
    );
    expect(task8MainHandWeapons.mainHandSocketForRigFamily).toBeTypeOf(
      'function'
    );
    if (
      !task8MainHandWeapons.MODULAR_FANTASY_HERO_MAIN_HAND_SOCKET ||
      !task8MainHandWeapons.mainHandSocketForRigFamily
    ) {
      return;
    }

    expect(task8MainHandWeapons.mainHandSocketForRigFamily('townfolk-v1')).toBe(
      TOWNFOLK_MAIN_HAND_SOCKET
    );
    expect(
      task8MainHandWeapons.mainHandSocketForRigFamily('modular-fantasy-hero-v1')
    ).toBe(task8MainHandWeapons.MODULAR_FANTASY_HERO_MAIN_HAND_SOCKET);
  });
});
