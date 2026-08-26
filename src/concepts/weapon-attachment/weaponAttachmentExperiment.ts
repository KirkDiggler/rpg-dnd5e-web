import {
  refKey,
  type EquippedMap,
  type RefLike,
} from '@/components/game/equipment/equipmentTypes';
import type {
  MainHandAttachmentCode,
  MainHandPresentation,
  MainHandSocket,
} from '@/components/hex-grid/mainHandPresentation';

export type WeaponEquipmentState = 'unarmed' | 'longsword' | 'shortbow';
export type WeaponMotion = 'idle' | 'walk';
export type WeaponView = 'close' | 'orbit' | 'play';
export type WeaponFacing = 0 | 1 | 2 | 3 | 4 | 5;

const itemRef = (id: string): RefLike => ({
  module: 'dnd5e',
  type: 'item',
  id,
});

export const PROVISIONAL_FIGHTER_SOCKET: MainHandSocket = Object.freeze({
  bone: 'Hand_R',
  boneUnitMeters: 0.01,
  positionMeters: [
    -0.11356719583272934, 0.04377313703298569, -0.0070696864277124405,
  ] as const,
  rotationQuaternion: [
    -0.5601389408111572, -0.8049638271331787, 0.16070428490638733,
    0.11158794164657593,
  ] as const,
  scale: 1,
});

interface Candidate {
  ref: string;
  source: string;
  weaponUrl: string;
  decodedTextureMb: number;
  budgetMb: number;
}

const CANDIDATES: Record<string, Candidate> = {
  'dnd5e:item:longsword': {
    ref: 'dnd5e:item:longsword',
    source: 'SM_Wep_Slayer_01 · rejected oversized longsword candidate',
    weaponUrl: '/models/synty/characters/weapons/fighter-weapon.glb',
    decodedTextureMb: 16,
    budgetMb: 4.5,
  },
  'dnd5e:item:shortbow': {
    ref: 'dnd5e:item:shortbow',
    source: 'SM_Prop_Bow_01 · accepted provisional shortbow candidate',
    weaponUrl: '/models/synty/characters/weapons/bow-01.glb',
    decodedTextureMb: 64,
    budgetMb: 4.5,
  },
};

export const WEAPON_ATTACHMENT_FIXTURES: Record<
  WeaponEquipmentState,
  { label: string; equipped: EquippedMap }
> = {
  unarmed: { label: 'Unarmed', equipped: {} },
  longsword: {
    label: 'Longsword',
    equipped: { main_hand: itemRef('longsword') },
  },
  shortbow: {
    label: 'Shortbow',
    equipped: { main_hand: itemRef('shortbow') },
  },
};

export type MainHandResolution =
  | { code: 'unarmed'; presentation?: undefined }
  | { code: 'unmapped-ref'; ref: string; presentation?: undefined }
  | {
      code: 'mapped';
      ref: string;
      candidate: Candidate;
      presentation: MainHandPresentation;
    };

export function resolveProvisionalMainHand(
  equipped: EquippedMap
): MainHandResolution {
  const ref = equipped.main_hand;
  if (!ref) return { code: 'unarmed' };
  const key = refKey(ref);
  const candidate = CANDIDATES[key];
  if (!candidate) return { code: 'unmapped-ref', ref: key };
  return {
    code: 'mapped',
    ref: key,
    candidate,
    presentation: {
      ref: key,
      weaponUrl: candidate.weaponUrl,
      socket: PROVISIONAL_FIGHTER_SOCKET,
    },
  };
}

export interface WeaponRenderObservation {
  equipmentState: WeaponEquipmentState;
  motion: WeaponMotion;
  view: WeaponView;
  facing: WeaponFacing;
  attachmentCode: MainHandAttachmentCode;
}

export interface WeaponConceptCoverage {
  equipmentStates: WeaponEquipmentState[];
  motions: WeaponMotion[];
  views: WeaponView[];
  facings: WeaponFacing[];
}

const EQUIPMENT_ORDER: WeaponEquipmentState[] = [
  'unarmed',
  'longsword',
  'shortbow',
];
const MOTION_ORDER: WeaponMotion[] = ['idle', 'walk'];
const VIEW_ORDER: WeaponView[] = ['close', 'orbit', 'play'];
const FACING_ORDER: WeaponFacing[] = [0, 1, 2, 3, 4, 5];

const validEquipmentObservation = (row: WeaponRenderObservation): boolean =>
  row.equipmentState === 'unarmed'
    ? row.attachmentCode === 'unarmed'
    : row.attachmentCode === 'attached';

export function coverageFor(
  observations: readonly WeaponRenderObservation[]
): WeaponConceptCoverage {
  const valid = observations.filter(validEquipmentObservation);
  return {
    equipmentStates: EQUIPMENT_ORDER.filter((value) =>
      valid.some((row) => row.equipmentState === value)
    ),
    motions: MOTION_ORDER.filter((value) =>
      valid.some((row) => row.motion === value)
    ),
    views: VIEW_ORDER.filter((value) =>
      valid.some((row) => row.view === value)
    ),
    facings: FACING_ORDER.filter((value) =>
      valid.some((row) => row.facing === value)
    ),
  };
}

export function canRecordWeaponVerdict(
  observations: readonly WeaponRenderObservation[]
): boolean {
  const coverage = coverageFor(observations);
  return (
    coverage.equipmentStates.length === EQUIPMENT_ORDER.length &&
    coverage.motions.length === MOTION_ORDER.length &&
    coverage.views.length === VIEW_ORDER.length &&
    coverage.facings.length === FACING_ORDER.length
  );
}

export interface WeaponConceptVerdict {
  warning: 'NON-PRODUCTION CONCEPT EVIDENCE';
  fighterModel: '/models/synty/characters/fighter.glb';
  socket: MainHandSocket;
  candidates: Candidate[];
  coverage: WeaponConceptCoverage;
}

export function weaponConceptVerdict(
  observations: readonly WeaponRenderObservation[]
): WeaponConceptVerdict {
  if (!canRecordWeaponVerdict(observations)) {
    throw new Error('weapon concept coverage is incomplete');
  }
  return {
    warning: 'NON-PRODUCTION CONCEPT EVIDENCE',
    fighterModel: '/models/synty/characters/fighter.glb',
    socket: PROVISIONAL_FIGHTER_SOCKET,
    candidates: Object.values(CANDIDATES),
    coverage: coverageFor(observations),
  };
}
