/**
 * Attachment model configurations for hair, facial hair, weapons, and shields.
 *
 * Position/rotation data extracted from Blender coordinate exports (threejs_y_up).
 * These values are used inside the character group which already has -90° X rotation applied.
 * rotation_euler values are used directly (same convention as body parts).
 */

import type { Vector3Config } from './characterModels';

// ─── Types ────────────────────────────────────────────────────────────────────

export type HairStyle = 'afro' | 'buzz' | 'cornrows' | 'mohawk' | 'short';

export type FacialHairStyle = 'chin' | 'goatee' | 'mustache';

export type WeaponType =
  | 'dagger'
  | 'sword_short'
  | 'sword_long'
  | 'sword_great'
  | 'axe_hand'
  | 'axe_battle'
  | 'axe_great'
  | 'club'
  | 'glaive';

export type ShieldType = 'shield_kite' | 'shield_round' | 'shield_tower';

export type HandSlot = 'left' | 'right';

// ─── Attachment Config Interfaces ─────────────────────────────────────────────

export interface AttachmentConfig {
  file: string;
  texture: string;
  position: Vector3Config;
  rotation: Vector3Config;
}

export interface BilateralAttachmentConfig {
  file: string;
  texture: string;
  left: { position: Vector3Config; rotation: Vector3Config };
  right: { position: Vector3Config; rotation: Vector3Config };
}

export interface TwoHandedAttachmentConfig {
  file: string;
  texture: string;
  position: Vector3Config;
  rotation: Vector3Config;
  twoHanded: true;
}

export type WeaponConfig =
  | BilateralAttachmentConfig
  | TwoHandedAttachmentConfig;

// ─── Base Paths ───────────────────────────────────────────────────────────────

export const HAIR_MODELS_PATH = '/models/characters/hair/';
export const FHAIR_MODELS_PATH = '/models/characters/fhair/';
export const WEAPON_MODELS_PATH = '/models/characters/weapons/';
export const EQUIPMENT_MODELS_PATH = '/models/characters/equipment/';

export const HAIR_TEXTURES_PATH = '/models/characters/textures/hair/';
export const FHAIR_TEXTURES_PATH = '/models/characters/textures/fhair/';
export const WEAPON_TEXTURES_PATH = '/models/characters/textures/weapons/';
export const EQUIPMENT_TEXTURES_PATH = '/models/characters/textures/equipment/';

// ─── Hair Configs ─────────────────────────────────────────────────────────────

export const HAIR_CONFIGS: Record<HairStyle, AttachmentConfig> = {
  afro: {
    file: 'hair_afro.obj',
    texture: 'hair_afro.png',
    position: { x: 0.0, y: 0.0, z: 80.0 },
    rotation: { x: 1.5708, y: 0.0, z: 0.0 },
  },
  buzz: {
    file: 'hair_buzz.obj',
    texture: 'hair_buzz.png',
    position: { x: 0.0, y: 0.0, z: 82.0 },
    rotation: { x: 1.5708, y: 0.0, z: 0.0 },
  },
  cornrows: {
    file: 'hair_cornrows.obj',
    texture: 'hair_cornrows.png',
    position: { x: 0.0, y: 0.0, z: 82.0 },
    rotation: { x: 1.5708, y: 0.0, z: 0.0 },
  },
  mohawk: {
    file: 'hair_mohawk.obj',
    texture: 'hair_mohawk.png',
    position: { x: 0.0, y: 0.0, z: 88.0 },
    rotation: { x: 1.5708, y: 0.0, z: 0.0 },
  },
  short: {
    file: 'hair_short.obj',
    texture: 'hair_short.png',
    position: { x: 3.0, y: 1.0, z: 103.0 },
    rotation: { x: 1.5708, y: 0.0, z: 0.0 },
  },
};

// ─── Facial Hair Configs ──────────────────────────────────────────────────────

export const FHAIR_CONFIGS: Record<FacialHairStyle, AttachmentConfig> = {
  chin: {
    file: 'fhair_chin.obj',
    texture: 'fhair_chin.png',
    position: { x: 0.0, y: 0.0, z: 82.0 },
    rotation: { x: 1.5708, y: 0.0, z: 0.0 },
  },
  goatee: {
    file: 'fhair_goatee.obj',
    texture: 'fhair_goatee.png',
    position: { x: 0.0, y: 0.0, z: 82.0 },
    rotation: { x: 1.5708, y: 0.0, z: 0.0 },
  },
  mustache: {
    file: 'fhair_mustache.obj',
    texture: 'fhair_mustache.png',
    position: { x: 0.0, y: 0.0, z: 82.0 },
    rotation: { x: 1.5708, y: 0.0, z: 0.0 },
  },
};

// ─── Weapon Configs ───────────────────────────────────────────────────────────

export const WEAPON_CONFIGS: Record<WeaponType, WeaponConfig> = {
  dagger: {
    file: 'weapon_dagger.obj',
    texture: 'weapon_dagger.png',
    left: {
      position: { x: 25.0, y: 15.0, z: 13.0 },
      rotation: { x: 1.0128, y: 0.0195, z: 1.602 },
    },
    right: {
      position: { x: 25.0, y: -16.0, z: 13.0 },
      rotation: { x: 1.0128, y: 0.0195, z: 1.602 },
    },
  },
  sword_short: {
    file: 'weapon_sword_short.obj',
    texture: 'weapon_sword_short.png',
    left: {
      position: { x: 32.0, y: 15.0, z: 18.0 },
      rotation: { x: 0.8646, y: 0.0003, z: 1.5711 },
    },
    right: {
      position: { x: 32.0, y: -16.0, z: 18.0 },
      rotation: { x: 0.8646, y: 0.0003, z: 1.5711 },
    },
  },
  sword_long: {
    file: 'weapon_sword_long.obj',
    texture: 'weapon_sword_long.png',
    left: {
      position: { x: 29.0, y: 15.0, z: 17.0 },
      rotation: { x: 0.9172, y: -0.006, z: 1.563 },
    },
    right: {
      position: { x: 29.0, y: -16.0, z: 17.0 },
      rotation: { x: 0.9172, y: -0.006, z: 1.563 },
    },
  },
  sword_great: {
    file: 'weapon_sword_great.obj',
    texture: 'weapon_sword_great.png',
    position: { x: 10.0, y: 17.0, z: 55.0 },
    rotation: { x: 1.0261, y: 0.0, z: 0.0 },
    twoHanded: true,
  },
  axe_hand: {
    file: 'weapon_axe_hand.obj',
    texture: 'weapon_axe_hand.png',
    left: {
      position: { x: -11.0, y: 17.0, z: 66.0 },
      rotation: { x: 3.6766, y: -0.0077, z: 1.5662 },
    },
    right: {
      position: { x: -11.0, y: -15.0, z: 66.0 },
      rotation: { x: 3.6766, y: -0.0077, z: 1.5662 },
    },
  },
  axe_battle: {
    file: 'weapon_axe_battle.obj',
    texture: 'weapon_axe_battle.png',
    left: {
      position: { x: -8.0, y: 16.0, z: 66.0 },
      rotation: { x: -0.6306, y: 0.003, z: -1.5495 },
    },
    right: {
      position: { x: -8.0, y: -17.0, z: 66.0 },
      rotation: { x: -0.6306, y: 0.003, z: -1.5495 },
    },
  },
  axe_great: {
    file: 'weapon_axe_great.obj',
    texture: 'weapon_axe_great.png',
    position: { x: 9.0, y: -15.0, z: 106.0 },
    rotation: { x: -2.0393, y: 0.0, z: 0.0 },
    twoHanded: true,
  },
  club: {
    file: 'weapon_club.obj',
    texture: 'weapon_club.png',
    left: {
      position: { x: -11.0, y: 16.0, z: 66.0 },
      rotation: { x: 1.5708, y: 2.0642, z: 0.0 },
    },
    right: {
      position: { x: -11.0, y: -17.0, z: 66.0 },
      rotation: { x: 1.5708, y: 2.0642, z: 0.0 },
    },
  },
  glaive: {
    file: 'weapon_glaive.obj',
    texture: 'weapon_glaive.png',
    position: { x: 10.0, y: -13.0, z: 105.0 },
    rotation: { x: 4.1762, y: 0.0, z: 0.0 },
    twoHanded: true,
  },
};

// ─── Shield Configs ───────────────────────────────────────────────────────────

/** Shields attach to the left forearm. Positions estimated relative to left forearm. */
export const SHIELD_CONFIGS: Record<ShieldType, AttachmentConfig> = {
  shield_round: {
    file: 'equipment_shield_round.obj',
    texture: 'equipment_shield_round.png',
    position: { x: -5.0, y: 15.0, z: 55.0 },
    rotation: { x: 1.5708, y: 0.0, z: 0.0 },
  },
  shield_kite: {
    file: 'equipment_shield_kite.obj',
    texture: 'equipment_shield_kite.png',
    position: { x: -5.0, y: 15.0, z: 55.0 },
    rotation: { x: 1.5708, y: 0.0, z: 0.0 },
  },
  shield_tower: {
    file: 'equipment_shield_tower.obj',
    texture: 'equipment_shield_tower.png',
    position: { x: -5.0, y: 15.0, z: 55.0 },
    rotation: { x: 1.5708, y: 0.0, z: 0.0 },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isTwoHandedWeapon(
  config: WeaponConfig
): config is TwoHandedAttachmentConfig {
  return 'twoHanded' in config;
}
