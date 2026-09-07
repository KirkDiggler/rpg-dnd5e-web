import type {
  EquippedMap,
  RefLike,
} from '@/components/game/equipment/equipmentTypes';
import { resolveMainHandPresentation } from '@/components/hex-grid/mainHandWeapons';
import { resolveOffHandPresentation } from '@/components/hex-grid/offHandEquipment';

export type OffHandStateId =
  | 'empty'
  | 'shield-only'
  | 'longsword-shield'
  | 'shortsword-dagger'
  | 'glaive-main'
  | 'trident-main'
  | 'scimitar-main'
  | 'dual-scimitars';
export type OffHandClassId = 'fighter' | 'barbarian' | 'monk' | 'rogue';
export type OffHandRaceId =
  | 'human'
  | 'dwarf'
  | 'elf'
  | 'half-elf'
  | 'tiefling'
  | 'halfling'
  | 'gnome'
  | 'half-orc';
export type OffHandMotion = 'idle' | 'walk';
export type OffHandView = 'close' | 'orbit' | 'play';
export type OffHandFacing = 0 | 1 | 2 | 3 | 4 | 5;

const itemRef = (id: string): RefLike => ({
  module: 'dnd5e',
  type: 'item',
  id,
});

export interface OffHandFixture {
  id: OffHandStateId;
  label: string;
  equipped: EquippedMap;
}

const fixture = (
  id: OffHandStateId,
  label: string,
  equipped: EquippedMap
): OffHandFixture => ({ id, label, equipped });

export const OFF_HAND_FIXTURES: readonly OffHandFixture[] = Object.freeze([
  fixture('empty', 'Empty', {}),
  fixture('shield-only', 'Shield only', { off_hand: itemRef('shield') }),
  fixture('longsword-shield', 'Longsword + Shield', {
    main_hand: itemRef('longsword'),
    off_hand: itemRef('shield'),
  }),
  fixture('shortsword-dagger', 'Shortsword + Dagger', {
    main_hand: itemRef('shortsword'),
    off_hand: itemRef('dagger'),
  }),
  fixture('glaive-main', 'Glaive main', {
    main_hand: itemRef('glaive'),
  }),
  fixture('trident-main', 'Trident main', {
    main_hand: itemRef('trident'),
  }),
  fixture('scimitar-main', 'Scimitar main', {
    main_hand: itemRef('scimitar'),
  }),
  fixture('dual-scimitars', 'Dual Scimitars', {
    main_hand: itemRef('scimitar'),
    off_hand: itemRef('scimitar'),
  }),
]);

const FIXTURE_BY_ID = new Map(
  OFF_HAND_FIXTURES.map((fixture) => [fixture.id, fixture] as const)
);

export function resolveOffHandFixture(id: OffHandStateId) {
  const fixture = FIXTURE_BY_ID.get(id);
  if (!fixture) throw new Error(`unknown off-hand fixture: ${id}`);
  return {
    fixture,
    mainHand: resolveMainHandPresentation(fixture.equipped),
    offHand: resolveOffHandPresentation(fixture.equipped),
  };
}
