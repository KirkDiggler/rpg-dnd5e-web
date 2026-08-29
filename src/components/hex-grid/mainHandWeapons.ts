import {
  refKey,
  type EquippedMap,
} from '@/components/game/equipment/equipmentTypes';
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
 * rogue over sampled idle/walk frames; provider #78 binds every current weapon
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

/**
 * The complete current 16-item provider roster from rpg-game-assets#78
 * (provider commit cf3bd0bd325d9440a6d28f1d39601845bdfbcdde,
 * weapons/manifest.json sha256
 * 030ddd69117aed1b124f69320bc2def039d45eba0b7840644974108aaf117795). This is
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
