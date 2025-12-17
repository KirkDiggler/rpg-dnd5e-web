/**
 * MediumHumanoid - Assembled OBJ-based humanoid character model
 *
 * Loads and assembles 12 body parts from separate OBJ files using
 * pre-calculated positions and rotations from Blender.
 *
 * CRITICAL coordinate system conversions:
 * 1. Character group rotation: -90deg on X axis (Blender Z-up -> Three.js Y-up)
 * 2. Part rotation order: 'ZYX' (Blender XYZ Euler -> Three.js convention)
 */

import {
  CHARACTER_MODELS_BASE_PATH,
  GOBLIN_HUMANOID_CONFIG,
  MEDIUM_HUMANOID_CONFIG,
  type CharacterPartConfig,
} from '@/config/characterModels';
import { useLoader } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

export interface MediumHumanoidProps {
  /** Scale factor for the character (default: 0.01 to fit hex grid) */
  scale?: number;
  /** Color to apply to body parts */
  color?: string;
  /** Whether the character is selected (adds emissive glow) */
  isSelected?: boolean;
  /** Use goblin head variant */
  variant?: 'human' | 'goblin';
  /** Y-axis rotation in radians (default: 0, use Math.PI to face opposite direction) */
  facingRotation?: number;
}

/** Default scale to convert ~137 Qubicle units to roughly 1.5 Three.js units */
const DEFAULT_SCALE = 0.011;

/**
 * Individual body part component that loads and positions an OBJ mesh
 */
function CharacterPart({
  config,
  basePath,
  color,
  isSelected,
}: {
  config: CharacterPartConfig;
  basePath: string;
  color: string;
  isSelected: boolean;
}) {
  const partRef = useRef<THREE.Group>(null);
  const obj = useLoader(OBJLoader, `${basePath}${config.file}`);

  // Clone the loaded object so each instance is independent
  const clonedObj = useMemo(() => obj.clone(), [obj]);

  useEffect(() => {
    if (partRef.current) {
      // CRITICAL: Set rotation order to ZYX (Blender XYZ -> Three.js ZYX)
      partRef.current.rotation.order = 'ZYX';

      // Apply rotation from config
      partRef.current.rotation.set(
        config.rotation.x,
        config.rotation.y,
        config.rotation.z
      );

      // Apply position from config
      partRef.current.position.set(
        config.position.x,
        config.position.y,
        config.position.z
      );
    }
  }, [config]);

  // Apply materials to all meshes in the loaded object
  useEffect(() => {
    clonedObj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.7,
          metalness: 0.1,
          emissive: isSelected ? color : '#000000',
          emissiveIntensity: isSelected ? 0.2 : 0,
        });
      }
    });
  }, [clonedObj, color, isSelected]);

  return (
    <group ref={partRef}>
      <primitive object={clonedObj} />
    </group>
  );
}

/**
 * MediumHumanoid - Assembled character from OBJ parts
 *
 * Usage:
 * ```tsx
 * <MediumHumanoid color="#3182ce" isSelected={false} />
 * ```
 */
export function MediumHumanoid({
  scale = DEFAULT_SCALE,
  color = '#8B4513',
  isSelected = false,
  variant = 'human',
  facingRotation = 0,
}: MediumHumanoidProps) {
  const groupRef = useRef<THREE.Group>(null);

  const config =
    variant === 'goblin' ? GOBLIN_HUMANOID_CONFIG : MEDIUM_HUMANOID_CONFIG;

  return (
    // Outer group for facing direction (Y-axis rotation in world space)
    <group ref={groupRef} rotation={[0, facingRotation, 0]}>
      {/* Inner group for scale and coordinate system conversion */}
      <group
        scale={[scale, scale, scale]}
        // CRITICAL: Rotate character group to convert from Blender (Z-up) to Three.js (Y-up)
        rotation={[
          config.characterGroupRotation.x,
          config.characterGroupRotation.y,
          config.characterGroupRotation.z,
        ]}
      >
        {Object.entries(config.parts).map(([partName, partConfig]) => (
          <CharacterPart
            key={partName}
            config={partConfig}
            basePath={CHARACTER_MODELS_BASE_PATH}
            color={color}
            isSelected={isSelected}
          />
        ))}
      </group>
    </group>
  );
}
