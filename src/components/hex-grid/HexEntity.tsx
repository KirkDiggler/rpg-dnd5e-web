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
import { isTwoHandedWeapon, WEAPON_CONFIGS } from '@/config/attachmentModels';
import type { HeadVariant } from '@/config/characterModels';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { MonsterCombatState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { Race } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ErrorBoundary } from '../ui/Feedback/ErrorBoundary';
import { ClassCharacterModel } from './ClassCharacterModel';
import { resolveClassCharacterModelUrl } from './classCharacterModels';
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
  /** Whether the entity is dead (show visual dead state, disable interaction) */
  isDead?: boolean;
  /** Whether the entity is outside LoS (v1alpha2). Render at last-known position with ghost shader (semi-transparent, desaturated). */
  isGhost?: boolean;
  /** v1alpha2 CharacterData.class_ref.id — resolves a class GLB for player
   * entities (rpg-dnd5e-web#501). Unmapped/undefined falls back to
   * MediumHumanoid, unchanged (the #479 boundary lineage). */
  classRefId?: string;
  /** True for a CHARACTER entity carrying the "unconscious" condition —
   * swaps to the class's downed GLB variant (rpg-dnd5e-web#501). */
  isDowned?: boolean;
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

/** Map equipment name to WeaponType for 3D models */
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

  // Match by equipment name (proto WeaponData has no weapon enum field)
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
  isDead = false,
  isGhost = false,
  classRefId,
  isDowned = false,
}: HexEntityProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { invalidate } = useThree();

  // Tracks a class-model GLB url that failed to load (ErrorBoundary caught
  // a terminal load error), so the downed-tilt check below can still fire
  // once we've fallen back to MediumHumanoid — otherwise a downed player
  // whose class GLB happens to be missing/broken would render upright
  // (rpg-dnd5e-web#502 gate note). Compared against the *current*
  // classModelUrl each render rather than a bare boolean so a later class/
  // asset change (new classRefId, or the file becoming available again)
  // isn't permanently masked by a stale failure from a different url.
  const [failedClassModelUrl, setFailedClassModelUrl] = useState<
    string | undefined
  >(undefined);

  // R3F runs the canvas in frameloop="demand" mode (HexGrid.tsx). When only
  // the ghost flag changes (entity stays at last_known position), no other
  // prop change triggers a re-render request — the new shader material won't
  // appear until the next user interaction. Force a frame on isGhost
  // transitions so the visual swap is immediate.
  useEffect(() => {
    invalidate();
  }, [isGhost, invalidate]);

  // Convert cube coords to world position
  const worldPos = useMemo(
    () => cubeToWorld(position, hexSize),
    [position, hexSize]
  );

  // Create the entity geometry (used for obstacles)
  const geometry = useMemo(() => createEntityGeometry(hexSize), [hexSize]);

  // Determine color based on type, selection state, and dead state
  const color = isDead
    ? '#666666'
    : isSelected
      ? COLORS[type].selected
      : COLORS[type].default;

  // Handle click events - dead and ghost entities are not interactive.
  // Ghosts represent last-known position outside LoS — clicking would let a
  // player attempt to attack/select an entity they technically can't see.
  const isInert = isDead || isGhost;
  const handleClick = (event: { stopPropagation: () => void }) => {
    event.stopPropagation(); // Prevent hex click from firing
    if (!isInert && onClick) {
      onClick(entityId);
    }
  };

  // Common interaction props for both character models and obstacles.
  // Inert entities (dead or ghost) get no hover/pointer interaction.
  const interactionProps = isInert
    ? {
        onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
      }
    : {
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

    // Two-handed weapons occupy both hands - no off-hand or shield
    const isTwoHanded =
      mainHandWeapon && isTwoHandedWeapon(WEAPON_CONFIGS[mainHandWeapon]);
    const offHandWeapon = isTwoHanded
      ? undefined
      : resolveWeaponType(character, 'offHand');
    const shield = isTwoHanded ? undefined : resolveShield(character);

    // rpg-dnd5e-web#501: monsters stay on MediumHumanoid this slice (scope
    // decision — goblin/WarChief GLBs exist but monster classRef mapping is
    // a different shape). Unmapped class / missing classRefId also falls
    // through to undefined here, which is exactly the MediumHumanoid
    // fallback signal below (the #479 boundary lineage: a data gap
    // degrades to the known-working placeholder, never a broken model ref).
    const classModelUrl =
      type === 'player'
        ? resolveClassCharacterModelUrl(classRefId, isDowned)
        : undefined;
    // undefined once classModelUrl itself is undefined, or once THIS url
    // has failed to load — never stuck failed against a different url.
    const effectiveClassModelUrl =
      classModelUrl && classModelUrl !== failedClassModelUrl
        ? classModelUrl
        : undefined;

    // Shared fallback element — used both as the "no class model" branch
    // and as the ErrorBoundary fallback when a mapped class model exists
    // but its GLB fails to load (missing/unsynced asset, bad file, etc.).
    // Suspense only covers the pending-load state; a terminal load failure
    // throws past it (same reasoning as HexGrid's Synty floor/wall
    // ErrorBoundary wrapping) and would otherwise unmount this entity's
    // whole Canvas tree instead of degrading to the known-working
    // placeholder (the #479 boundary lineage).
    const mediumHumanoidElement = (
      <MediumHumanoid
        color={color}
        isSelected={!isDead && isSelected}
        variant={type === 'monster' ? 'goblin' : 'human'}
        headVariant={headVariant}
        facingRotation={type === 'player' ? Math.PI : 0}
        race={characterRace}
        characterClass={characterClass}
        monsterType={monsterType}
        skinTone={isDead ? '#555' : skinTone}
        primaryColor={isDead ? '#444' : primaryColor}
        secondaryColor={isDead ? '#333' : secondaryColor}
        hairStyle={hairStyle}
        hairColor={isDead ? '#333' : hairColor}
        facialHairStyle={facialHairStyle}
        mainHandWeapon={mainHandWeapon}
        offHandWeapon={offHandWeapon}
        shield={shield}
        showOutline={!isDead}
        ghostAmount={isGhost ? 1.0 : 0.0}
      />
    );

    return (
      <group
        position={[worldPos.x, CHARACTER_Y_OFFSET, worldPos.z]}
        {...interactionProps}
      >
        {/* Dead/downed entities rendered with tilt when using the
            MediumHumanoid fallback (no separate collapsed pose asset);
            the class model's own downed GLB variant is already posed for
            it, so no extra tilt there. Ghost entities rendered with ghost
            shader/opacity either way. */}
        <group
          rotation={
            isDead || (isDowned && !effectiveClassModelUrl)
              ? [0, 0, Math.PI / 3]
              : [0, 0, 0]
          }
        >
          <Suspense
            fallback={<LoadingPlaceholder color={color} hexSize={hexSize} />}
          >
            {effectiveClassModelUrl ? (
              <ErrorBoundary
                fallback={mediumHumanoidElement}
                onError={() => setFailedClassModelUrl(effectiveClassModelUrl)}
              >
                <ClassCharacterModel
                  url={effectiveClassModelUrl}
                  isSelected={!isDead && isSelected}
                  isGhost={isGhost}
                  facingRotation={Math.PI}
                />
              </ErrorBoundary>
            ) : (
              mediumHumanoidElement
            )}
          </Suspense>
        </group>
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
