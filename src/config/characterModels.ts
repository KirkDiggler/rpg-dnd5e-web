/**
 * Character model configurations for OBJ-based humanoid models.
 *
 * These configurations contain pre-calculated positions and rotations from Blender
 * for assembling multi-part character models exported from Qubicle.
 */

export interface Vector3Config {
  x: number;
  y: number;
  z: number;
}

export interface CharacterPartConfig {
  file: string;
  position: Vector3Config;
  rotation: Vector3Config;
}

export interface CharacterModelConfig {
  /** Rotation applied to the entire character group (Blender Z-up to Three.js Y-up conversion) */
  characterGroupRotation: Vector3Config;
  /** Individual body parts with their positions and rotations */
  parts: Record<string, CharacterPartConfig>;
}

/**
 * Base path for character model files
 */
export const CHARACTER_MODELS_BASE_PATH = '/models/characters/';

/**
 * Medium humanoid character configuration.
 *
 * CRITICAL: This config requires two coordinate system conversions:
 * 1. Character group rotation: -90deg on X axis (Blender Z-up -> Three.js Y-up)
 * 2. Part rotation order: 'ZYX' (Blender XYZ Euler -> Three.js convention)
 *
 * Character scale: ~137 Qubicle units tall (feet at 0, head top at ~137)
 */
export const MEDIUM_HUMANOID_CONFIG: CharacterModelConfig = {
  // CRITICAL: Rotate character group to convert from Blender (Z-up) to Three.js (Y-up)
  characterGroupRotation: { x: -Math.PI / 2, y: 0, z: 0 },

  parts: {
    torso: {
      file: 'torso_medium.obj',
      position: { x: 0.0, y: 0.0, z: 62.0 },
      rotation: { x: 1.5708, y: 0.0, z: 0.0 },
    },
    head: {
      file: 'head_human.obj',
      position: { x: 0.0, y: 0.0, z: 81.7782 },
      rotation: { x: 1.5708, y: 0.0, z: 0.0 },
    },
    armUpperRight: {
      file: 'arm_upper_medium.obj',
      position: { x: 0.0, y: 19.5383, z: 71.0 },
      rotation: { x: 1.5708, y: 0.0, z: 0.0 },
    },
    armUpperLeft: {
      file: 'arm_upper_medium.obj',
      position: { x: 0.0, y: -18.2636, z: 71.0 },
      rotation: { x: 1.5708, y: 0.0, z: 0.0 },
    },
    forearmRight: {
      file: 'forearm_medium.obj',
      position: { x: 0.0, y: 18.8854, z: 65.0 },
      rotation: { x: 1.5708, y: 0.0, z: 0.0 },
    },
    forearmLeft: {
      file: 'forearm_medium.obj',
      position: { x: 0.0, y: -18.885, z: 65.0 },
      rotation: { x: 1.5708, y: 0.0, z: 1.5708 },
    },
    legRight: {
      file: 'leg_medium.obj',
      position: { x: 0.0, y: 9.4368, z: 0.0 },
      rotation: { x: 1.5708, y: 0.0, z: 0.0 },
    },
    legLeft: {
      file: 'leg_medium.obj',
      position: { x: 0.0, y: -9.2074, z: 0.0 },
      rotation: { x: 1.5708, y: 0.0, z: 0.0 },
    },
    footRight: {
      file: 'foot_medium.obj',
      position: { x: 1.0, y: 9.5, z: 0.0 },
      rotation: { x: 1.5708, y: 0.0, z: 0.0 },
    },
    footLeft: {
      file: 'foot_medium.obj',
      position: { x: 1.0, y: -9.25, z: 0.0 },
      rotation: { x: 1.5708, y: 0.0, z: 0.0 },
    },
    eyeRight: {
      file: 'eye_basic_oval.obj',
      position: { x: -9.0, y: 6.9315, z: 95.0 },
      rotation: { x: 1.5708, y: 0.0, z: 0.0 },
    },
    eyeLeft: {
      file: 'eye_basic_oval.obj',
      position: { x: -9.0, y: -6.0, z: 95.0 },
      rotation: { x: 1.5708, y: 0.0, z: 0.0 },
    },
  },
};

/**
 * Goblin variant - uses goblin head instead of human head
 */
export const GOBLIN_HUMANOID_CONFIG: CharacterModelConfig = {
  ...MEDIUM_HUMANOID_CONFIG,
  parts: {
    ...MEDIUM_HUMANOID_CONFIG.parts,
    head: {
      file: 'head_goblin.obj',
      position: { x: 0.0, y: 0.0, z: 81.7782 },
      rotation: { x: 1.5708, y: 0.0, z: 0.0 },
    },
  },
};
