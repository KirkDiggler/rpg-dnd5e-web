/**
 * MediumHumanoid - Assembled OBJ-based humanoid character model
 *
 * Loads and assembles 12 body parts from separate OBJ files using
 * pre-calculated positions and rotations from Blender.
 *
 * Supports:
 * - Class-specific textures with color swapping shader
 * - Armor texture overrides
 * - Fallback to solid color when no texture exists
 * - Cel-shaded outlines
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
import {
  getMonsterHeadVariant,
  resolveMonsterTexturePath,
  resolveTexturePath,
  type BodyPart,
} from '@/config/characterTextures';
import {
  ColorPalettes,
  createAdvancedCharacterShader,
  type AdvancedCharacterShaderOptions,
} from '@/shaders/AdvancedCharacterShader';
import { createOutlineMaterial } from '@/shaders/OutlineShader';
import {
  Armor,
  Class,
  MonsterType,
  Race,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { useLoader } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

/** Skin tone options matching ColorPalettes.SkinTones */
export type SkinTone = 'pale' | 'light' | 'medium' | 'tan' | 'dark' | 'deep';

export interface MediumHumanoidProps {
  /** Scale factor for the character (default: 0.01 to fit hex grid) */
  scale?: number;
  /** Fallback color when no texture (default: brown) */
  color?: string;
  /** Whether the character is selected (adds emissive glow) */
  isSelected?: boolean;
  /** Use goblin head variant */
  variant?: 'human' | 'goblin';
  /** Y-axis rotation in radians (default: 0, use Math.PI to face opposite direction) */
  facingRotation?: number;
  /** Character race - for future race-specific model variants */
  race?: Race;
  /** Character class - determines default textures */
  characterClass?: Class;
  /** Monster type - determines monster-specific textures */
  monsterType?: MonsterType;
  /** Equipped armor - overrides class textures for armored parts */
  equippedArmor?: Armor;
  /** Skin tone for color swapping (default: 'medium') */
  skinTone?: SkinTone;
  /** Show cel-shaded outline (default: true) */
  showOutline?: boolean;
}

/** Default scale to convert ~137 Qubicle units to roughly 1.5 Three.js units */
const DEFAULT_SCALE = 0.011;

/** Outline thickness in model units */
const OUTLINE_THICKNESS = 1.5;

/**
 * Extract body part name from OBJ filename
 * e.g., "arm_upper_medium.obj" -> "arm_upper_medium"
 */
function getBodyPartFromFile(filename: string): BodyPart | undefined {
  const name = filename.replace('.obj', '');
  // Only return if it's a valid BodyPart
  const validParts: BodyPart[] = [
    'torso_medium',
    'arm_upper_medium',
    'forearm_medium',
    'leg_medium',
    'foot_medium',
    'head_human',
    'head_goblin',
  ];
  return validParts.includes(name as BodyPart) ? (name as BodyPart) : undefined;
}

/**
 * Get skin color from skin tone name
 */
function getSkinColor(skinTone: SkinTone): number {
  return ColorPalettes.SkinTones[skinTone];
}

interface CharacterPartBaseProps {
  config: CharacterPartConfig;
  basePath: string;
  isSelected: boolean;
}

interface SolidCharacterPartProps extends CharacterPartBaseProps {
  color: string;
}

/**
 * Character part with solid color material (fallback when no texture)
 */
function SolidCharacterPart({
  config,
  basePath,
  color,
  isSelected,
}: SolidCharacterPartProps) {
  const partRef = useRef<THREE.Group>(null);
  const obj = useLoader(OBJLoader, `${basePath}${config.file}`);

  // Clone the loaded object so each instance is independent
  const clonedObj = useMemo(() => obj.clone(), [obj]);

  // Memoize material to avoid recreation on every render
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.7,
        metalness: 0.1,
        emissive: isSelected ? color : '#000000',
        emissiveIntensity: isSelected ? 0.2 : 0,
      }),
    [color, isSelected]
  );

  useEffect(() => {
    if (partRef.current) {
      partRef.current.rotation.order = 'ZYX';
      partRef.current.rotation.set(
        config.rotation.x,
        config.rotation.y,
        config.rotation.z
      );
      partRef.current.position.set(
        config.position.x,
        config.position.y,
        config.position.z
      );
    }
  }, [config]);

  useEffect(() => {
    clonedObj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = material;
      }
    });
  }, [clonedObj, material]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  return (
    <group ref={partRef}>
      <primitive object={clonedObj} />
    </group>
  );
}

interface TexturedCharacterPartProps extends CharacterPartBaseProps {
  texturePath: string;
  shaderOptions: AdvancedCharacterShaderOptions;
}

/**
 * Character part with texture and advanced shader
 */
function TexturedCharacterPart({
  config,
  basePath,
  texturePath,
  shaderOptions,
  isSelected,
}: TexturedCharacterPartProps) {
  const partRef = useRef<THREE.Group>(null);
  const obj = useLoader(OBJLoader, `${basePath}${config.file}`);
  const texture = useLoader(THREE.TextureLoader, texturePath);

  // Clone the loaded object so each instance is independent
  const clonedObj = useMemo(() => obj.clone(), [obj]);

  // Configure texture for pixel art (no smoothing)
  useMemo(() => {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
  }, [texture]);

  // Create shader material with options
  const material = useMemo(() => {
    const opts: AdvancedCharacterShaderOptions = {
      ...shaderOptions,
      // Boost glow when selected
      glowIntensity: isSelected ? 3.0 : (shaderOptions.glowIntensity ?? 2.0),
    };
    return createAdvancedCharacterShader(texture, opts);
  }, [texture, shaderOptions, isSelected]);

  useEffect(() => {
    if (partRef.current) {
      partRef.current.rotation.order = 'ZYX';
      partRef.current.rotation.set(
        config.rotation.x,
        config.rotation.y,
        config.rotation.z
      );
      partRef.current.position.set(
        config.position.x,
        config.position.y,
        config.position.z
      );
    }
  }, [config]);

  useEffect(() => {
    clonedObj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = material;
      }
    });
  }, [clonedObj, material]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  return (
    <group ref={partRef}>
      <primitive object={clonedObj} />
    </group>
  );
}

interface CharacterPartProps extends CharacterPartBaseProps {
  color: string;
  texturePath?: string;
  shaderOptions: AdvancedCharacterShaderOptions;
}

/**
 * Wrapper that chooses between textured and solid character part
 */
function CharacterPart({
  config,
  basePath,
  color,
  texturePath,
  shaderOptions,
  isSelected,
}: CharacterPartProps) {
  if (texturePath) {
    return (
      <TexturedCharacterPart
        config={config}
        basePath={basePath}
        texturePath={texturePath}
        shaderOptions={shaderOptions}
        isSelected={isSelected}
      />
    );
  }

  return (
    <SolidCharacterPart
      config={config}
      basePath={basePath}
      color={color}
      isSelected={isSelected}
    />
  );
}

interface OutlineMeshProps {
  config: CharacterPartConfig;
  basePath: string;
}

/**
 * Outline mesh for a single body part
 */
function OutlineMesh({ config, basePath }: OutlineMeshProps) {
  const partRef = useRef<THREE.Group>(null);
  const obj = useLoader(OBJLoader, `${basePath}${config.file}`);

  const clonedObj = useMemo(() => obj.clone(), [obj]);

  const outlineMaterial = useMemo(
    () => createOutlineMaterial({ outlineThickness: OUTLINE_THICKNESS }),
    []
  );

  useEffect(() => {
    if (partRef.current) {
      partRef.current.rotation.order = 'ZYX';
      partRef.current.rotation.set(
        config.rotation.x,
        config.rotation.y,
        config.rotation.z
      );
      partRef.current.position.set(
        config.position.x,
        config.position.y,
        config.position.z
      );
    }
  }, [config]);

  useEffect(() => {
    clonedObj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = outlineMaterial;
      }
    });
  }, [clonedObj, outlineMaterial]);

  useEffect(() => {
    return () => {
      outlineMaterial.dispose();
    };
  }, [outlineMaterial]);

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
 * // Simple usage with solid color
 * <MediumHumanoid color="#3182ce" isSelected={false} />
 *
 * // With class textures and shader
 * <MediumHumanoid
 *   characterClass={Class.FIGHTER}
 *   skinTone="medium"
 *   isSelected={true}
 * />
 *
 * // With armor override
 * <MediumHumanoid
 *   characterClass={Class.FIGHTER}
 *   equippedArmor={Armor.CHAIN_MAIL}
 *   skinTone="tan"
 * />
 * ```
 */
export function MediumHumanoid({
  scale = DEFAULT_SCALE,
  color = '#8B4513',
  isSelected = false,
  variant = 'human',
  facingRotation = 0,
  characterClass,
  monsterType,
  equippedArmor,
  skinTone = 'medium',
  showOutline = true,
}: MediumHumanoidProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Determine effective variant: use monster's head type if monster, else use provided variant
  const effectiveVariant = useMemo(() => {
    if (monsterType !== undefined && monsterType !== MonsterType.UNSPECIFIED) {
      return getMonsterHeadVariant(monsterType);
    }
    return variant;
  }, [monsterType, variant]);

  const modelConfig =
    effectiveVariant === 'goblin'
      ? GOBLIN_HUMANOID_CONFIG
      : MEDIUM_HUMANOID_CONFIG;

  // Compute shader options based on props
  const shaderOptions = useMemo<AdvancedCharacterShaderOptions>(
    () => ({
      skinColor: getSkinColor(skinTone),
      trimColor: ColorPalettes.TrimColors.brown,
      metalColor: ColorPalettes.MetalColors.silver,
      glowIntensity: 2.0,
    }),
    [skinTone]
  );

  // Compute texture paths for each body part
  // Uses monster textures if monsterType is set, otherwise character textures
  const texturePaths = useMemo(() => {
    // Monster texture resolution
    if (monsterType !== undefined && monsterType !== MonsterType.UNSPECIFIED) {
      const paths: Record<string, string | undefined> = {};
      for (const [partName, partConfig] of Object.entries(modelConfig.parts)) {
        const bodyPart = getBodyPartFromFile(partConfig.file);
        if (bodyPart) {
          paths[partName] = resolveMonsterTexturePath(bodyPart, monsterType);
        }
      }
      return paths;
    }

    // Character texture resolution
    if (!characterClass) {
      return {};
    }

    const paths: Record<string, string | undefined> = {};
    for (const [partName, partConfig] of Object.entries(modelConfig.parts)) {
      const bodyPart = getBodyPartFromFile(partConfig.file);
      if (bodyPart) {
        paths[partName] = resolveTexturePath(
          bodyPart,
          characterClass,
          equippedArmor
        );
      }
    }
    return paths;
  }, [characterClass, equippedArmor, monsterType, modelConfig.parts]);

  return (
    // Outer group for facing direction (Y-axis rotation in world space)
    <group ref={groupRef} rotation={[0, facingRotation, 0]}>
      {/* Inner group for scale and coordinate system conversion */}
      <group
        scale={[scale, scale, scale]}
        // CRITICAL: Rotate character group to convert from Blender (Z-up) to Three.js (Y-up)
        rotation={[
          modelConfig.characterGroupRotation.x,
          modelConfig.characterGroupRotation.y,
          modelConfig.characterGroupRotation.z,
        ]}
      >
        {/* Outline meshes (render first, behind character) */}
        {showOutline &&
          Object.entries(modelConfig.parts).map(([partName, partConfig]) => (
            <OutlineMesh
              key={`outline-${partName}`}
              config={partConfig}
              basePath={CHARACTER_MODELS_BASE_PATH}
            />
          ))}

        {/* Character parts */}
        {Object.entries(modelConfig.parts).map(([partName, partConfig]) => (
          <CharacterPart
            key={partName}
            config={partConfig}
            basePath={CHARACTER_MODELS_BASE_PATH}
            color={color}
            texturePath={texturePaths[partName]}
            shaderOptions={shaderOptions}
            isSelected={isSelected}
          />
        ))}
      </group>
    </group>
  );
}
