import type {
  EquippedMap,
  RefLike,
} from '@/components/game/equipment/equipmentTypes';
import type {
  MainHandAttachmentCode,
  MainHandPresentation,
  MainHandSocket,
} from '@/components/hex-grid/mainHandPresentation';
import {
  CURRENT_MAIN_HAND_WEAPONS,
  TOWNFOLK_MAIN_HAND_SOCKET,
  resolveMainHandPresentation,
  type CurrentMainHandWeaponId,
} from '@/components/hex-grid/mainHandWeapons';

export type WeaponClassId = 'fighter' | 'barbarian' | 'monk' | 'rogue';
export type WeaponEquipmentState = 'unarmed' | CurrentMainHandWeaponId;
export type WeaponMotion = 'idle' | 'walk';
export type WeaponView = 'close' | 'orbit' | 'play';
export type WeaponFacing = 0 | 1 | 2 | 3 | 4 | 5;

const itemRef = (id: string): RefLike => ({
  module: 'dnd5e',
  type: 'item',
  id,
});

/** @deprecated Kept for the historical #821 verdict API. */
export const PROVISIONAL_FIGHTER_SOCKET: MainHandSocket =
  TOWNFOLK_MAIN_HAND_SOCKET;

interface Candidate {
  ref: string;
  source: string;
  weaponUrl: string;
  decodedTextureMb: number;
  budgetMb: number;
}

const CANDIDATES: Record<string, Candidate> = Object.fromEntries(
  CURRENT_MAIN_HAND_WEAPONS.map((weapon) => [
    weapon.ref,
    {
      ref: weapon.ref,
      source: 'rpg-game-assets#71 · promoted v1 provider output',
      weaponUrl: weapon.weaponUrl,
      decodedTextureMb: 4,
      budgetMb: 4.5,
    },
  ])
);

type WeaponFixture = { label: string; equipped: EquippedMap };

const MAPPED_WEAPON_FIXTURES: Readonly<Record<string, WeaponFixture>> =
  Object.fromEntries(
    CURRENT_MAIN_HAND_WEAPONS.map((weapon) => [
      weapon.id,
      {
        label: weapon.label,
        equipped: { main_hand: itemRef(weapon.id) },
      },
    ])
  );

export const WEAPON_ATTACHMENT_FIXTURES: Readonly<
  Record<string, WeaponFixture>
> = {
  unarmed: { label: 'Unarmed', equipped: {} },
  ...MAPPED_WEAPON_FIXTURES,
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
  const resolution = resolveMainHandPresentation(equipped);
  if (resolution.code !== 'mapped') return resolution;

  return {
    code: 'mapped',
    ref: resolution.ref,
    candidate: CANDIDATES[resolution.ref]!,
    presentation: resolution.presentation,
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
  ...CURRENT_MAIN_HAND_WEAPONS.map((weapon) => weapon.id),
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
  classModels: Record<WeaponClassId, string>;
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
    classModels: {
      fighter: '/models/synty/characters/fighter.glb',
      barbarian: '/models/synty/characters/barbarian.glb',
      monk: '/models/synty/characters/monk.glb',
      rogue: '/models/synty/characters/rogue.glb',
    },
    socket: TOWNFOLK_MAIN_HAND_SOCKET,
    candidates: Object.values(CANDIDATES),
    coverage: coverageFor(observations),
  };
}
