/**
 * Character and monster texture configuration and resolution logic.
 *
 * Maps proto enums to texture folder paths and provides texture resolution:
 * - Characters: Armor -> Class -> Base fallback chain
 * - Monsters: MonsterType -> Base monster fallback chain
 */

import {
  Armor,
  Class,
  MonsterType,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

/** Base path for character textures */
export const CHARACTER_TEXTURES_BASE_PATH = '/models/characters/textures';

/** Body parts that can have textures */
export type BodyPart =
  | 'torso_medium'
  | 'arm_upper_medium'
  | 'forearm_medium'
  | 'leg_medium'
  | 'foot_medium'
  | 'head_human'
  | 'head_goblin';

/**
 * Maps Class enum values to texture folder names.
 * Only classes with custom textures are included.
 */
export const CLASS_TEXTURE_FOLDERS: Partial<Record<Class, string>> = {
  [Class.FIGHTER]: 'fighter',
  [Class.MONK]: 'monk',
  // Expand as textures are created for more classes
};

/**
 * Maps Armor enum values to texture folder names.
 * Only armor types with custom textures are included.
 */
export const ARMOR_TEXTURE_FOLDERS: Partial<Record<Armor, string>> = {
  [Armor.LEATHER]: 'leather',
  [Armor.STUDDED_LEATHER]: 'leather', // Uses leather textures
  [Armor.CHAIN_MAIL]: 'chainmail',
  [Armor.CHAIN_SHIRT]: 'chainmail', // Uses chainmail textures
  [Armor.HALF_PLATE]: 'half-plate',
  [Armor.BREASTPLATE]: 'half-plate', // Uses half-plate textures
  // Expand as textures are created for more armor types
};

/**
 * Maps MonsterType enum values to texture folder names.
 * Similar monster types can share textures (e.g., skeleton variants).
 */
export const MONSTER_TEXTURE_FOLDERS: Partial<Record<MonsterType, string>> = {
  // Undead (Crypt theme)
  [MonsterType.SKELETON]: 'skeleton',
  [MonsterType.SKELETON_ARCHER]: 'skeleton', // Uses base skeleton textures
  [MonsterType.SKELETON_CAPTAIN]: 'skeleton', // Uses base skeleton textures
  [MonsterType.ZOMBIE]: 'zombie',
  [MonsterType.GHOUL]: 'ghoul',

  // Beasts (Cave theme)
  [MonsterType.GIANT_RAT]: 'giant-rat',
  [MonsterType.GIANT_SPIDER]: 'giant-spider',
  [MonsterType.GIANT_WOLF_SPIDER]: 'giant-spider', // Uses giant spider textures
  [MonsterType.WOLF]: 'wolf',
  [MonsterType.BROWN_BEAR]: 'brown-bear',

  // Humanoids (Bandit Lair theme)
  [MonsterType.BANDIT]: 'bandit',
  [MonsterType.BANDIT_ARCHER]: 'bandit', // Uses base bandit textures
  [MonsterType.BANDIT_CAPTAIN]: 'bandit', // Uses base bandit textures
  [MonsterType.THUG]: 'thug',

  // Fallback humanoid
  [MonsterType.GOBLIN]: 'goblin',
  // Expand as textures are created for more monster types
};

/**
 * Known textures per category.
 * Used to check if a texture exists before returning its path.
 */
const KNOWN_TEXTURES: Record<string, Set<BodyPart>> = {
  // Base textures (bare skin fallback)
  base: new Set(['arm_upper_medium', 'forearm_medium']),

  // Class textures
  'class/fighter': new Set([
    'torso_medium',
    'arm_upper_medium',
    'forearm_medium',
    'leg_medium',
  ]),
  'class/monk': new Set(['torso_medium', 'leg_medium']),

  // Armor textures (to be added when armor textures are created)
  // 'armor/leather': new Set(['torso_medium', 'leg_medium']),
  // 'armor/chainmail': new Set(['torso_medium', 'arm_upper_medium', 'leg_medium']),
  // 'armor/half-plate': new Set(['torso_medium', 'arm_upper_medium', 'forearm_medium', 'leg_medium']),

  // Monster textures (to be added when monster textures are created)
  // Monsters use the same body part system but with monster-specific textures
  // 'monster/skeleton': new Set(['torso_medium', 'arm_upper_medium', 'forearm_medium', 'leg_medium', 'head_human']),
  // 'monster/zombie': new Set(['torso_medium', 'arm_upper_medium', 'forearm_medium', 'leg_medium', 'head_human']),
  // 'monster/goblin': new Set(['torso_medium', 'arm_upper_medium', 'forearm_medium', 'leg_medium', 'head_goblin']),
  // 'monster/bandit': new Set(['torso_medium', 'arm_upper_medium', 'forearm_medium', 'leg_medium', 'head_human']),
};

/**
 * Check if a texture exists for a given category and body part.
 */
function textureExists(category: string, bodyPart: BodyPart): boolean {
  return KNOWN_TEXTURES[category]?.has(bodyPart) ?? false;
}

/**
 * Get the texture path for armor, if it exists.
 */
function getArmorTexturePath(
  armor: Armor,
  bodyPart: BodyPart
): string | undefined {
  const folder = ARMOR_TEXTURE_FOLDERS[armor];
  if (!folder) return undefined;

  const category = `armor/${folder}`;
  if (!textureExists(category, bodyPart)) return undefined;

  return `${CHARACTER_TEXTURES_BASE_PATH}/${category}/${bodyPart}.png`;
}

/**
 * Get the texture path for a class, if it exists.
 */
function getClassTexturePath(
  characterClass: Class,
  bodyPart: BodyPart
): string | undefined {
  const folder = CLASS_TEXTURE_FOLDERS[characterClass];
  if (!folder) return undefined;

  const category = `class/${folder}`;
  if (!textureExists(category, bodyPart)) return undefined;

  return `${CHARACTER_TEXTURES_BASE_PATH}/${category}/${bodyPart}.png`;
}

/**
 * Get the base texture path, if it exists.
 */
function getBaseTexturePath(bodyPart: BodyPart): string | undefined {
  if (!textureExists('base', bodyPart)) return undefined;

  return `${CHARACTER_TEXTURES_BASE_PATH}/base/${bodyPart}.png`;
}

/**
 * Resolve the texture path for a body part with fallback chain:
 * 1. Equipped armor (highest priority)
 * 2. Class-specific texture
 * 3. Base texture (bare skin)
 * 4. undefined (no texture, use solid color)
 *
 * @param bodyPart - The body part to get texture for
 * @param characterClass - The character's class
 * @param equippedArmor - Optional equipped armor
 * @returns The texture path or undefined if no texture exists
 *
 * @example
 * // Fighter with no armor - uses class texture
 * resolveTexturePath('torso_medium', Class.FIGHTER)
 * // -> '/models/characters/textures/class/fighter/torso_medium.png'
 *
 * // Fighter with chain mail - uses armor texture (when available)
 * resolveTexturePath('torso_medium', Class.FIGHTER, Armor.CHAIN_MAIL)
 * // -> '/models/characters/textures/armor/chainmail/torso_medium.png'
 *
 * // Wizard (no textures yet) - returns undefined
 * resolveTexturePath('torso_medium', Class.WIZARD)
 * // -> undefined
 */
export function resolveTexturePath(
  bodyPart: BodyPart,
  characterClass: Class,
  equippedArmor?: Armor
): string | undefined {
  // 1. Check armor-specific (highest priority for equipped gear)
  if (equippedArmor) {
    const armorPath = getArmorTexturePath(equippedArmor, bodyPart);
    if (armorPath) return armorPath;
  }

  // 2. Check class-specific
  if (characterClass !== Class.UNSPECIFIED) {
    const classPath = getClassTexturePath(characterClass, bodyPart);
    if (classPath) return classPath;
  }

  // 3. Fall back to base
  return getBaseTexturePath(bodyPart);
}

/**
 * Check if a class has any custom textures.
 * Useful for determining if shader-based rendering should be used.
 */
export function classHasTextures(characterClass: Class): boolean {
  return characterClass in CLASS_TEXTURE_FOLDERS;
}

/**
 * Check if an armor type has any custom textures.
 */
export function armorHasTextures(armor: Armor): boolean {
  return armor in ARMOR_TEXTURE_FOLDERS;
}

/**
 * Get all body parts that have textures for a given class.
 */
export function getTexturedBodyParts(characterClass: Class): BodyPart[] {
  const folder = CLASS_TEXTURE_FOLDERS[characterClass];
  if (!folder) return [];

  const category = `class/${folder}`;
  const parts = KNOWN_TEXTURES[category];
  return parts ? Array.from(parts) : [];
}

// =============================================================================
// Monster Texture Resolution
// =============================================================================

/**
 * Get the texture path for a monster type, if it exists.
 */
function getMonsterTexturePath(
  monsterType: MonsterType,
  bodyPart: BodyPart
): string | undefined {
  const folder = MONSTER_TEXTURE_FOLDERS[monsterType];
  if (!folder) return undefined;

  const category = `monster/${folder}`;
  if (!textureExists(category, bodyPart)) return undefined;

  return `${CHARACTER_TEXTURES_BASE_PATH}/${category}/${bodyPart}.png`;
}

/**
 * Resolve the texture path for a monster body part with fallback chain:
 * 1. Monster-type specific texture
 * 2. Base monster texture (goblin as fallback)
 * 3. undefined (no texture, use solid color)
 *
 * @param bodyPart - The body part to get texture for
 * @param monsterType - The monster's type
 * @returns The texture path or undefined if no texture exists
 *
 * @example
 * // Skeleton - uses skeleton texture
 * resolveMonsterTexturePath('torso_medium', MonsterType.SKELETON)
 * // -> '/models/characters/textures/monster/skeleton/torso_medium.png'
 *
 * // Unknown monster type - falls back to goblin if available
 * resolveMonsterTexturePath('torso_medium', MonsterType.UNSPECIFIED)
 * // -> '/models/characters/textures/monster/goblin/torso_medium.png' or undefined
 */
export function resolveMonsterTexturePath(
  bodyPart: BodyPart,
  monsterType: MonsterType
): string | undefined {
  // 1. Check monster-type specific
  if (monsterType !== MonsterType.UNSPECIFIED) {
    const monsterPath = getMonsterTexturePath(monsterType, bodyPart);
    if (monsterPath) return monsterPath;
  }

  // 2. Fall back to goblin (default monster texture)
  const goblinPath = getMonsterTexturePath(MonsterType.GOBLIN, bodyPart);
  if (goblinPath) return goblinPath;

  // 3. No texture available
  return undefined;
}

/**
 * Check if a monster type has any custom textures.
 */
export function monsterTypeHasTextures(monsterType: MonsterType): boolean {
  return monsterType in MONSTER_TEXTURE_FOLDERS;
}

/**
 * Get all body parts that have textures for a given monster type.
 */
export function getMonsterTexturedBodyParts(
  monsterType: MonsterType
): BodyPart[] {
  const folder = MONSTER_TEXTURE_FOLDERS[monsterType];
  if (!folder) return [];

  const category = `monster/${folder}`;
  const parts = KNOWN_TEXTURES[category];
  return parts ? Array.from(parts) : [];
}

/**
 * Determine which head variant a monster should use based on its type.
 * Most monsters use 'human' head, goblinoids use 'goblin' head.
 */
export function getMonsterHeadVariant(
  monsterType: MonsterType
): 'human' | 'goblin' {
  // Goblin uses goblin head
  if (monsterType === MonsterType.GOBLIN) {
    return 'goblin';
  }
  // All other monsters use human head for now
  return 'human';
}
