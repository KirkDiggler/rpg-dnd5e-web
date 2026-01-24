/**
 * HexEntity - Visual component for a game entity positioned on a hex
 *
 * Renders character models (players/monsters) or simple shapes (obstacles)
 * at the specified hex position.
 */

import type {
  FacialHairStyle,
  HairStyle,
  ShieldType,
  WeaponType,
} from '@/config/attachmentModels';
import type { HeadVariant } from '@/config/characterModels';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { MonsterCombatState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  Race,
  Weapon,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { cubeToWorld, type CubeCoord } from './hexMath';
import { MediumHumanoid, type SkinTone } from './MediumHumanoid';

export interface HexEntityProps {
  entityId: string;
  name: string;
  position: CubeCoord;
  type: 'player' | 'monster' | 'obstacle';
  hexSize: number;
  isSelected?: boolean;
  onClick?: (entityId: string) => void;
  /** Character data for texture/shader customization */
  character?: Character;
  /** Monster data for texture selection (includes monsterType) */
  monster?: MonsterCombatState;
  /** Override hair style (proto doesn't have this field yet) */
  hairStyle?: HairStyle;
  /** Override hair color as hex string (proto doesn't have this field yet) */
  hairColor?: string;
  /** Override facial hair style (proto doesn't have this field yet) */
  facialHairStyle?: FacialHairStyle;
}

// Visual state colors
const COLORS = {
  player: {
    default: '#3182ce', // blue
    selected: '#63b3ed', // brighter blue
  },
  monster: {
    default: '#e53e3e', // red
    selected: '#fc8181', // brighter red
  },
  obstacle: {
    default: '#805ad5', // purple
    selected: '#b794f4', // brighter purple
  },
};

// Entity dimensions relative to hex size (used for obstacles/fallback)
const ENTITY_HEIGHT = 1.5; // Height of the cylinder
const ENTITY_RADIUS_SCALE = 0.3; // Radius as fraction of hex size
const Y_OFFSET = 0.1; // Small Y offset to sit above the hex plane

// Character model Y offset (characters stand on the ground)
const CHARACTER_Y_OFFSET = 0.05;

/** Map Race enum to head variant for 3D model */
const RACE_TO_HEAD_VARIANT: Partial<Record<Race, HeadVariant>> = {
  [Race.HUMAN]: 'human',
  [Race.ELF]: 'elf',
  [Race.HALF_ELF]: 'elf',
  [Race.DWARF]: 'dwarf',
  [Race.HALFLING]: 'halfling',
  [Race.GNOME]: 'halfling',
};

/** Map Weapon proto enum to our WeaponType for 3D models */
const WEAPON_ENUM_TO_TYPE: Partial<Record<Weapon, WeaponType>> = {
  [Weapon.DAGGER]: 'dagger',
  [Weapon.SHORTSWORD]: 'sword_short',
  [Weapon.LONGSWORD]: 'sword_long',
  [Weapon.GREATSWORD]: 'sword_great',
  [Weapon.HANDAXE]: 'axe_hand',
  [Weapon.BATTLEAXE]: 'axe_battle',
  [Weapon.GREATAXE]: 'axe_great',
  [Weapon.CLUB]: 'club',
  [Weapon.GREATCLUB]: 'club',
  [Weapon.GLAIVE]: 'glaive',
};

/** Map equipment name strings to WeaponType (fallback) */
const WEAPON_NAME_TO_TYPE: Record<string, WeaponType> = {
  dagger: 'dagger',
  shortsword: 'sword_short',
  longsword: 'sword_long',
  greatsword: 'sword_great',
  handaxe: 'axe_hand',
  battleaxe: 'axe_battle',
  greataxe: 'axe_great',
  club: 'club',
  greatclub: 'club',
  glaive: 'glaive',
};

/** Map shield name to ShieldType */
const SHIELD_NAME_TO_TYPE: Record<string, ShieldType> = {
  shield: 'shield_round',
  'round shield': 'shield_round',
  'kite shield': 'shield_kite',
  'tower shield': 'shield_tower',
};

/**
 * Creates a capsule-like shape for the entity (used for obstacles)
 * Using CapsuleGeometry for a simple 3D representation
 *
 * @param hexSize - The hex radius (for scaling)
 * @returns A THREE.CapsuleGeometry
 */
function createEntityGeometry(hexSize: number): THREE.CapsuleGeometry {
  const radius = hexSize * ENTITY_RADIUS_SCALE;
  const height = ENTITY_HEIGHT;
  // CapsuleGeometry(radius, length, capSegments, radialSegments)
  return new THREE.CapsuleGeometry(radius, height, 8, 16);
}

/**
 * Simple loading placeholder while OBJ models load
 */
function LoadingPlaceholder({
  color,
  hexSize,
}: {
  color: string;
  hexSize: number;
}) {
  const geometry = useMemo(() => createEntityGeometry(hexSize), [hexSize]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} transparent opacity={0.5} />
    </mesh>
  );
}

/** Resolve head variant from race */
function getHeadVariant(race?: Race): HeadVariant | undefined {
  if (race === undefined || race === Race.UNSPECIFIED) return undefined;
  return RACE_TO_HEAD_VARIANT[race];
}

/** Extract weapon type from an equipment slot */
function resolveWeaponType(
  character: Character | undefined,
  slot: 'mainHand' | 'offHand'
): WeaponType | undefined {
  const item = character?.equipmentSlots?.[slot];
  if (!item?.equipment) return undefined;

  const equip = item.equipment;
  if (equip.equipmentData.case !== 'weaponData') return undefined;

  // Try Weapon enum mapping first
  const weaponData = equip.equipmentData.value;
  if ('weapon' in weaponData) {
    const mapped = WEAPON_ENUM_TO_TYPE[weaponData.weapon as unknown as Weapon];
    if (mapped) return mapped;
  }

  // Fall back to name-based matching
  const name = equip.name.toLowerCase().trim();
  return WEAPON_NAME_TO_TYPE[name];
}

/** Check if off-hand has a shield equipped */
function resolveShield(
  character: Character | undefined
): ShieldType | undefined {
  const item = character?.equipmentSlots?.offHand;
  if (!item?.equipment) return undefined;

  const equip = item.equipment;
  if (equip.equipmentData.case === 'armorData') {
    const name = equip.name.toLowerCase().trim();
    return SHIELD_NAME_TO_TYPE[name] ?? 'shield_round';
  }

  return undefined;
}

export function HexEntity({
  entityId,
  position,
  type,
  hexSize,
  isSelected = false,
  onClick,
  character,
  monster,
  hairStyle,
  hairColor,
  facialHairStyle,
}: HexEntityProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Convert cube coords to world position
  const worldPos = useMemo(
    () => cubeToWorld(position, hexSize),
    [position, hexSize]
  );

  // Create the entity geometry (used for obstacles)
  const geometry = useMemo(() => createEntityGeometry(hexSize), [hexSize]);

  // Determine color based on type and selection state
  const color = isSelected ? COLORS[type].selected : COLORS[type].default;

  // Handle click events
  const handleClick = (event: { stopPropagation: () => void }) => {
    event.stopPropagation(); // Prevent hex click from firing
    if (onClick) {
      onClick(entityId);
    }
  };

  // Common interaction props for both character models and obstacles
  const interactionProps = {
    onClick: handleClick,
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => {
      document.body.style.cursor = 'auto';
    },
  };

  // Use character model for players and monsters
  if (type === 'player' || type === 'monster') {
    const characterClass = character?.class;
    const characterRace = character?.race;
    const monsterType = monster?.monsterType;

    // Resolve appearance from proto data
    const appearance = character?.appearance;
    const skinTone: SkinTone | string = appearance?.skinTone || 'medium';
    const primaryColor = appearance?.primaryColor || undefined;
    const secondaryColor = appearance?.secondaryColor || undefined;

    // Resolve head variant from race
    const headVariant = getHeadVariant(characterRace);

    // Resolve equipped weapons and shield from character data
    const mainHandWeapon = resolveWeaponType(character, 'mainHand');
    const offHandWeapon = resolveWeaponType(character, 'offHand');
    const shield = resolveShield(character);

    return (
      <group
        position={[worldPos.x, CHARACTER_Y_OFFSET, worldPos.z]}
        {...interactionProps}
      >
        <Suspense
          fallback={<LoadingPlaceholder color={color} hexSize={hexSize} />}
        >
          <MediumHumanoid
            color={color}
            isSelected={isSelected}
            variant={type === 'monster' ? 'goblin' : 'human'}
            headVariant={headVariant}
            facingRotation={type === 'player' ? Math.PI : 0}
            race={characterRace}
            characterClass={characterClass}
            monsterType={monsterType}
            skinTone={skinTone}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            hairStyle={hairStyle}
            hairColor={hairColor}
            facialHairStyle={facialHairStyle}
            mainHandWeapon={mainHandWeapon}
            offHandWeapon={offHandWeapon}
            shield={shield}
            showOutline={true}
          />
        </Suspense>
      </group>
    );
  }

  // Use capsule geometry for obstacles
  const yPosition = Y_OFFSET + ENTITY_HEIGHT / 2;

  return (
    <mesh
      ref={meshRef}
      position={[worldPos.x, yPosition, worldPos.z]}
      geometry={geometry}
      {...interactionProps}
    >
      <meshStandardMaterial
        color={color}
        emissive={isSelected ? color : '#000000'}
        emissiveIntensity={isSelected ? 0.2 : 0}
      />
    </mesh>
  );
}
