import {
  refKey,
  type EquippedMap,
} from '@/components/game/equipment/equipmentTypes';
import type { CharacterRigFamily } from './classCharacterModels';
import type {
  MainHandPresentation,
  MainHandSocket,
} from './mainHandPresentation';

export interface MainHandWeaponDefinition {
  ref: string;
  id: string;
  label: string;
  weaponUrl: string;
}

/**
 * Shared by the four current Townfolk class rigs. Provider evidence #67
 * measured exact-equal Hand_R matrices across fighter, barbarian, monk, and
 * rogue over sampled idle/walk frames; provider #100 binds every current weapon
 * output to this accepted profile.
 */
export const TOWNFOLK_MAIN_HAND_SOCKET: MainHandSocket = Object.freeze({
  bone: 'Hand_R',
  boneUnitMeters: 0.01,
  positionMeters: Object.freeze([
    -0.11356871832209599, 0.0437807216160595, -0.0070717729664129085,
  ] as const),
  rotationQuaternion: Object.freeze([
    -0.31717459916354807, -0.45555976264236875, 0.6828311428133312,
    0.47498148472569474,
  ] as const),
  scale: 1,
});

/** Exact reviewed provider socket profile `modular-fantasy-hero-main-hand-v1`
 * from rpg-game-assets PR #81 (reviewed head 8aa058dbfaac0f5d7cd239a1ede63ef1a7a2fbe4),
 * copied by value so this repo stays independent of provider checkout. */
export const MODULAR_FANTASY_HERO_MAIN_HAND_SOCKET: MainHandSocket =
  Object.freeze({
    bone: 'Hand_R',
    boneUnitMeters: 0.01,
    positionMeters: Object.freeze([
      -0.113634511828, 0.043524894863, -0.006868128199,
    ] as const),
    rotationQuaternion: Object.freeze([
      -0.31697111189640637, -0.4555468694563118, 0.6829896921327775,
      0.47490151020194044,
    ] as const),
    scale: 1,
  });

export function mainHandSocketForRigFamily(
  rigFamily: CharacterRigFamily
): MainHandSocket {
  switch (rigFamily) {
    case 'modular-fantasy-hero-v1':
      return MODULAR_FANTASY_HERO_MAIN_HAND_SOCKET;
    case 'townfolk-v1':
      return TOWNFOLK_MAIN_HAND_SOCKET;
  }
}

/**
 * The complete current 30-item provider roster from rpg-game-assets#114
 * (provider commit 00cbd7cdcc338edaa249e3707492341fe1c4a416,
 * weapons/manifest.json sha256
 * eb0c2fd4402c05e8ac68c9b950d9fd9f6d3784e2ec16a9e36fac06bb45eba46a). This is
 * an exact presentation lookup, not weapon rules: no proficiency,
 * handedness, or attack identity is inferred here.
 */
export const CURRENT_MAIN_HAND_WEAPONS = Object.freeze([
  {
    ref: 'dnd5e:item:shortbow',
    id: 'shortbow',
    label: 'Shortbow',
    weaponUrl: '/models/synty/weapons/shortbow.glb',
  },
  {
    ref: 'dnd5e:item:longsword',
    id: 'longsword',
    label: 'Longsword',
    weaponUrl: '/models/synty/weapons/longsword.glb',
  },
  {
    ref: 'dnd5e:item:shortsword',
    id: 'shortsword',
    label: 'Shortsword',
    weaponUrl: '/models/synty/weapons/shortsword.glb',
  },
  {
    ref: 'dnd5e:item:dagger',
    id: 'dagger',
    label: 'Dagger',
    weaponUrl: '/models/synty/weapons/dagger.glb',
  },
  {
    ref: 'dnd5e:item:greataxe',
    id: 'greataxe',
    label: 'Greataxe',
    weaponUrl: '/models/synty/weapons/greataxe.glb',
  },
  {
    ref: 'dnd5e:item:quarterstaff',
    id: 'quarterstaff',
    label: 'Quarterstaff',
    weaponUrl: '/models/synty/weapons/quarterstaff.glb',
  },
  {
    ref: 'dnd5e:item:greatsword',
    id: 'greatsword',
    label: 'Greatsword',
    weaponUrl: '/models/synty/weapons/greatsword.glb',
  },
  {
    ref: 'dnd5e:item:battleaxe',
    id: 'battleaxe',
    label: 'Battleaxe',
    weaponUrl: '/models/synty/weapons/battleaxe.glb',
  },
  {
    ref: 'dnd5e:item:handaxe',
    id: 'handaxe',
    label: 'Handaxe',
    weaponUrl: '/models/synty/weapons/handaxe.glb',
  },
  {
    ref: 'dnd5e:item:club',
    id: 'club',
    label: 'Club',
    weaponUrl: '/models/synty/weapons/club.glb',
  },
  {
    ref: 'dnd5e:item:greatclub',
    id: 'greatclub',
    label: 'Greatclub',
    weaponUrl: '/models/synty/weapons/greatclub.glb',
  },
  {
    ref: 'dnd5e:item:warhammer',
    id: 'warhammer',
    label: 'Warhammer',
    weaponUrl: '/models/synty/weapons/warhammer.glb',
  },
  {
    ref: 'dnd5e:item:light-crossbow',
    id: 'light-crossbow',
    label: 'Light Crossbow',
    weaponUrl: '/models/synty/weapons/light-crossbow.glb',
  },
  {
    ref: 'dnd5e:item:longbow',
    id: 'longbow',
    label: 'Longbow',
    weaponUrl: '/models/synty/weapons/longbow.glb',
  },
  {
    ref: 'dnd5e:item:javelin',
    id: 'javelin',
    label: 'Javelin',
    weaponUrl: '/models/synty/weapons/javelin.glb',
  },
  {
    ref: 'dnd5e:item:rapier',
    id: 'rapier',
    label: 'Rapier',
    weaponUrl: '/models/synty/weapons/rapier.glb',
  },
  {
    ref: 'dnd5e:item:light-hammer',
    id: 'light-hammer',
    label: 'Light Hammer',
    weaponUrl: '/models/synty/weapons/light-hammer.glb',
  },
  {
    ref: 'dnd5e:item:mace',
    id: 'mace',
    label: 'Mace',
    weaponUrl: '/models/synty/weapons/mace.glb',
  },
  {
    ref: 'dnd5e:item:sickle',
    id: 'sickle',
    label: 'Sickle',
    weaponUrl: '/models/synty/weapons/sickle.glb',
  },
  {
    ref: 'dnd5e:item:spear',
    id: 'spear',
    label: 'Spear',
    weaponUrl: '/models/synty/weapons/spear.glb',
  },
  {
    ref: 'dnd5e:item:sling',
    id: 'sling',
    label: 'Sling',
    weaponUrl: '/models/synty/weapons/sling.glb',
  },
  {
    ref: 'dnd5e:item:dart',
    id: 'dart',
    label: 'Dart',
    weaponUrl: '/models/synty/weapons/dart.glb',
  },
  {
    ref: 'dnd5e:item:halberd',
    id: 'halberd',
    label: 'Halberd',
    weaponUrl: '/models/synty/weapons/halberd.glb',
  },
  {
    ref: 'dnd5e:item:maul',
    id: 'maul',
    label: 'Maul',
    weaponUrl: '/models/synty/weapons/maul.glb',
  },
  {
    ref: 'dnd5e:item:morningstar',
    id: 'morningstar',
    label: 'Morningstar',
    weaponUrl: '/models/synty/weapons/morningstar.glb',
  },
  {
    ref: 'dnd5e:item:pike',
    id: 'pike',
    label: 'Pike',
    weaponUrl: '/models/synty/weapons/pike.glb',
  },
  {
    ref: 'dnd5e:item:war-pick',
    id: 'war-pick',
    label: 'War Pick',
    weaponUrl: '/models/synty/weapons/war-pick.glb',
  },
  {
    ref: 'dnd5e:item:glaive',
    id: 'glaive',
    label: 'Glaive',
    weaponUrl: '/models/synty/weapons/glaive.glb',
  },
  {
    ref: 'dnd5e:item:scimitar',
    id: 'scimitar',
    label: 'Scimitar',
    weaponUrl: '/models/synty/weapons/scimitar.glb',
  },
  {
    ref: 'dnd5e:item:trident',
    id: 'trident',
    label: 'Trident',
    weaponUrl: '/models/synty/weapons/trident.glb',
  },
] as const satisfies readonly MainHandWeaponDefinition[]);

export type CurrentMainHandWeaponId =
  (typeof CURRENT_MAIN_HAND_WEAPONS)[number]['id'];

const WEAPON_BY_REF: ReadonlyMap<string, MainHandWeaponDefinition> = new Map(
  CURRENT_MAIN_HAND_WEAPONS.map((weapon) => [weapon.ref, weapon] as const)
);

export type MainHandPresentationResolution =
  | { code: 'unarmed'; presentation?: undefined }
  | { code: 'unmapped-ref'; ref: string; presentation?: undefined }
  | {
      code: 'mapped';
      ref: string;
      weapon: MainHandWeaponDefinition;
      presentation: MainHandPresentation;
    };

/** Project the server-owned main_hand ref into visual presentation only. */
export function resolveMainHandPresentation(
  equipped: EquippedMap
): MainHandPresentationResolution {
  const ref = equipped.main_hand;
  if (!ref) return { code: 'unarmed' };

  const key = refKey(ref);
  const weapon = WEAPON_BY_REF.get(key);
  if (!weapon) return { code: 'unmapped-ref', ref: key };

  return {
    code: 'mapped',
    ref: key,
    weapon,
    presentation: {
      ref: key,
      weaponUrl: weapon.weaponUrl,
      socket: TOWNFOLK_MAIN_HAND_SOCKET,
    },
  };
}
