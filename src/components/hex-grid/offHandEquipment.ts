import {
  refKey,
  type EquippedMap,
} from '@/components/game/equipment/equipmentTypes';
import type {
  BoneAttachmentCode,
  BoneAttachmentStatus,
  BonePresentation,
  HandSocket,
} from './boneAttachment';
import type { CharacterRigFamily } from './classCharacterModels';

export type OffHandAssetKind = 'shield' | 'weapon';

export interface OffHandItemDefinition {
  ref: string;
  id: string;
  label: string;
  assetKind: OffHandAssetKind;
  assetUrl: string;
}

export interface OffHandPresentation extends BonePresentation {
  assetKind: OffHandAssetKind;
}

export type OffHandAttachmentCode =
  | Exclude<BoneAttachmentCode, 'empty'>
  | 'empty-off-hand';

export interface OffHandAttachmentStatus {
  code: OffHandAttachmentCode;
  ref?: string;
  assetUrl?: string;
  bone?: string;
  message?: string;
}

/** Exact provider profiles from rpg-game-assets@71dff14, manifest sha256
 * bdfbf2484ab15fd0d054222f16f127922e8a6ea0aea2e5ce430bb97aaeb8c790. */
export const TOWNFOLK_OFF_HAND_SOCKET: HandSocket = Object.freeze({
  bone: 'Hand_L',
  boneUnitMeters: 0.01,
  positionMeters: Object.freeze([
    0.08494041442871093, -0.02545013666152954, -0.06444666385650635,
  ] as const),
  rotationQuaternion: Object.freeze([
    0.6342147588729858, 0.538684606552124, 0.31252291798591614,
    0.45817017555236816,
  ] as const),
  scale: 1,
});

export const MODULAR_FANTASY_HERO_OFF_HAND_SOCKET: HandSocket = Object.freeze({
  bone: 'Hand_L',
  boneUnitMeters: 0.01,
  positionMeters: Object.freeze([
    0.08494034767150879, -0.02544997215270996, -0.06444608211517334,
  ] as const),
  rotationQuaternion: Object.freeze([
    0.6342122554779053, 0.5386871099472046, 0.31252241134643555,
    0.4581710696220398,
  ] as const),
  scale: 1,
});

export function offHandSocketForRigFamily(
  rigFamily: CharacterRigFamily
): HandSocket {
  switch (rigFamily) {
    case 'townfolk-v1':
      return TOWNFOLK_OFF_HAND_SOCKET;
    case 'modular-fantasy-hero-v1':
      return MODULAR_FANTASY_HERO_OFF_HAND_SOCKET;
  }
}

export const CURRENT_OFF_HAND_ITEMS = Object.freeze([
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
] as const satisfies readonly OffHandItemDefinition[]);

const ITEM_BY_REF: ReadonlyMap<string, OffHandItemDefinition> = new Map(
  CURRENT_OFF_HAND_ITEMS.map((item) => [item.ref, item] as const)
);

export type OffHandPresentationResolution =
  | { code: 'empty-off-hand'; presentation?: undefined }
  | { code: 'unmapped-ref'; ref: string; presentation?: undefined }
  | {
      code: 'mapped';
      ref: string;
      item: OffHandItemDefinition;
      presentation: OffHandPresentation;
    };

export function resolveOffHandPresentation(
  equipped: EquippedMap
): OffHandPresentationResolution {
  const ref = equipped.off_hand;
  if (!ref) return { code: 'empty-off-hand' };
  const key = refKey(ref);
  const item = ITEM_BY_REF.get(key);
  if (!item) return { code: 'unmapped-ref', ref: key };
  return {
    code: 'mapped',
    ref: key,
    item,
    presentation: {
      ref: key,
      assetUrl: item.assetUrl,
      assetKind: item.assetKind,
      socket: TOWNFOLK_OFF_HAND_SOCKET,
    },
  };
}

export function offHandStatusFromBone(
  status: BoneAttachmentStatus
): OffHandAttachmentStatus {
  const result: OffHandAttachmentStatus = {
    code: status.code === 'empty' ? 'empty-off-hand' : status.code,
  };
  if (status.ref !== undefined) result.ref = status.ref;
  if (status.assetUrl !== undefined) result.assetUrl = status.assetUrl;
  if (status.bone !== undefined) result.bone = status.bone;
  if (status.message !== undefined) result.message = status.message;
  return result;
}
