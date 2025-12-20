/**
 * HexEntity - Visual component for a game entity positioned on a hex
 *
 * Renders character models (players/monsters) or simple shapes (obstacles)
 * at the specified hex position.
 */

import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { MonsterCombatState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
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

/**
 * Map race enum to a default skin tone
 * This is a simple heuristic - players will eventually customize this
 */
function getDefaultSkinTone(): SkinTone {
  // Default to medium for now
  // Future: could vary by race (e.g., elves -> pale, dwarves -> tan)
  return 'medium';
}

export function HexEntity({
  entityId,
  // name prop not destructured - will be used for tooltips/labels in future
  position,
  type,
  hexSize,
  isSelected = false,
  onClick,
  character,
  monster,
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
    // Extract character data for rendering
    const characterClass = character?.class;
    const characterRace = character?.race;
    const skinTone = getDefaultSkinTone();
    // Extract monster type for texture selection
    const monsterType = monster?.monsterType;
    // TODO: Extract equipped armor when armor textures are available
    // const equippedArmor = character?.equipmentSlots?.armor?.equipment?.armor;

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
            facingRotation={type === 'player' ? Math.PI : 0}
            race={characterRace}
            characterClass={characterClass}
            monsterType={monsterType}
            skinTone={skinTone}
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
