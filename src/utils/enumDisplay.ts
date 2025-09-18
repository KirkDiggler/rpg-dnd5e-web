import {
  Background,
  Class,
  Language,
  Race,
  Skill,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

/**
 * Display helpers for proto enums.
 * Single source of truth for converting enums to display strings.
 * We never convert strings back to enums - always keep enums as the source of truth.
 */

export function getLanguageDisplay(lang: Language): string {
  const displays: Record<Language, string> = {
    [Language.UNSPECIFIED]: 'Unknown',
    [Language.COMMON]: 'Common',
    [Language.DWARVISH]: 'Dwarvish',
    [Language.ELVISH]: 'Elvish',
    [Language.GIANT]: 'Giant',
    [Language.GNOMISH]: 'Gnomish',
    [Language.GOBLIN]: 'Goblin',
    [Language.HALFLING]: 'Halfling',
    [Language.ORC]: 'Orc',
    [Language.ABYSSAL]: 'Abyssal',
    [Language.CELESTIAL]: 'Celestial',
    [Language.DRACONIC]: 'Draconic',
    [Language.DEEP_SPEECH]: 'Deep Speech',
    [Language.INFERNAL]: 'Infernal',
    [Language.PRIMORDIAL]: 'Primordial',
    [Language.SYLVAN]: 'Sylvan',
    [Language.UNDERCOMMON]: 'Undercommon',
  };
  return displays[lang] || 'Unknown';
}

export function getSkillDisplay(skill: Skill): string {
  const displays: Record<Skill, string> = {
    [Skill.UNSPECIFIED]: 'Unknown',
    [Skill.ACROBATICS]: 'Acrobatics',
    [Skill.ANIMAL_HANDLING]: 'Animal Handling',
    [Skill.ARCANA]: 'Arcana',
    [Skill.ATHLETICS]: 'Athletics',
    [Skill.DECEPTION]: 'Deception',
    [Skill.HISTORY]: 'History',
    [Skill.INSIGHT]: 'Insight',
    [Skill.INTIMIDATION]: 'Intimidation',
    [Skill.INVESTIGATION]: 'Investigation',
    [Skill.MEDICINE]: 'Medicine',
    [Skill.NATURE]: 'Nature',
    [Skill.PERCEPTION]: 'Perception',
    [Skill.PERFORMANCE]: 'Performance',
    [Skill.PERSUASION]: 'Persuasion',
    [Skill.RELIGION]: 'Religion',
    [Skill.SLEIGHT_OF_HAND]: 'Sleight of Hand',
    [Skill.STEALTH]: 'Stealth',
    [Skill.SURVIVAL]: 'Survival',
  };
  return displays[skill] || 'Unknown';
}

export function getClassDisplay(cls: Class): string {
  const displays: Record<Class, string> = {
    [Class.UNSPECIFIED]: 'Unknown',
    [Class.BARBARIAN]: 'Barbarian',
    [Class.BARD]: 'Bard',
    [Class.CLERIC]: 'Cleric',
    [Class.DRUID]: 'Druid',
    [Class.FIGHTER]: 'Fighter',
    [Class.MONK]: 'Monk',
    [Class.PALADIN]: 'Paladin',
    [Class.RANGER]: 'Ranger',
    [Class.ROGUE]: 'Rogue',
    [Class.SORCERER]: 'Sorcerer',
    [Class.WARLOCK]: 'Warlock',
    [Class.WIZARD]: 'Wizard',
  };
  return displays[cls] || 'Unknown';
}

export function getRaceDisplay(race: Race): string {
  const displays: Record<Race, string> = {
    [Race.UNSPECIFIED]: 'Unknown',
    [Race.HUMAN]: 'Human',
    [Race.ELF]: 'Elf',
    [Race.DWARF]: 'Dwarf',
    [Race.HALFLING]: 'Halfling',
    [Race.DRAGONBORN]: 'Dragonborn',
    [Race.GNOME]: 'Gnome',
    [Race.HALF_ELF]: 'Half-Elf',
    [Race.HALF_ORC]: 'Half-Orc',
    [Race.TIEFLING]: 'Tiefling',
  };
  return displays[race] || 'Unknown';
}

export function getBackgroundDisplay(bg: Background): string {
  const displays: Record<Background, string> = {
    [Background.UNSPECIFIED]: 'Unknown',
    [Background.ACOLYTE]: 'Acolyte',
    [Background.CHARLATAN]: 'Charlatan',
    [Background.CRIMINAL]: 'Criminal',
    [Background.ENTERTAINER]: 'Entertainer',
    [Background.FOLK_HERO]: 'Folk Hero',
    [Background.GUILD_ARTISAN]: 'Guild Artisan',
    [Background.HERMIT]: 'Hermit',
    [Background.NOBLE]: 'Noble',
    [Background.OUTLANDER]: 'Outlander',
    [Background.SAGE]: 'Sage',
    [Background.SAILOR]: 'Sailor',
    [Background.SOLDIER]: 'Soldier',
    [Background.URCHIN]: 'Urchin',
  };
  return displays[bg] || 'Unknown';
}

// Helper to get enum value from string key (for parsing API responses)
export function getLanguageEnum(name: string): Language {
  const normalized = name.toUpperCase().replace(/[- ]/g, '_');
  return Language[normalized as keyof typeof Language] || Language.UNSPECIFIED;
}

export function getSkillEnum(name: string): Skill {
  // Remove 'skill_' or 'skill-' prefix if present
  const cleanName = name.replace(/^skill[_-]/i, '');
  const normalized = cleanName.toUpperCase().replace(/[- ]/g, '_');
  return Skill[normalized as keyof typeof Skill] || Skill.UNSPECIFIED;
}

export function getClassEnum(name: string): Class {
  const normalized = name.toUpperCase().replace(/[- ]/g, '_');
  return Class[normalized as keyof typeof Class] || Class.UNSPECIFIED;
}

export function getRaceEnum(name: string): Race {
  const normalized = name.toUpperCase().replace(/[- ]/g, '_');
  return Race[normalized as keyof typeof Race] || Race.UNSPECIFIED;
}

/**
 * Convert armor proficiency enum values to human-readable strings
 * Examples: LIGHT -> Light, MEDIUM -> Medium, HEAVY -> Heavy, SHIELDS -> Shields
 */
export function getArmorProficiencyDisplay(armor: string | number): string {
  // Convert to string if it's a number
  const armorStr = typeof armor === 'string' ? armor : String(armor);

  // Handle special cases
  const specialCases: Record<string, string> = {
    SHIELDS: 'Shields',
    LIGHT: 'Light Armor',
    MEDIUM: 'Medium Armor',
    HEAVY: 'Heavy Armor',
    ALL: 'All Armor',
  };

  if (specialCases[armorStr]) {
    return specialCases[armorStr];
  }

  // Convert ENUM_STYLE to Title Case
  return armorStr
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Convert weapon proficiency enum values to human-readable strings
 * Examples: SIMPLE -> Simple Weapons, MARTIAL -> Martial Weapons,
 * DAGGER -> Dagger, QUARTERSTAFF -> Quarterstaff
 */
export function getWeaponProficiencyDisplay(weapon: string | number): string {
  // Convert to string if it's a number
  const weaponStr = typeof weapon === 'string' ? weapon : String(weapon);
  // Handle category cases
  const categories: Record<string, string> = {
    SIMPLE: 'Simple Weapons',
    MARTIAL: 'Martial Weapons',
    SIMPLE_MELEE: 'Simple Melee Weapons',
    SIMPLE_RANGED: 'Simple Ranged Weapons',
    MARTIAL_MELEE: 'Martial Melee Weapons',
    MARTIAL_RANGED: 'Martial Ranged Weapons',
  };

  if (categories[weaponStr]) {
    return categories[weaponStr];
  }

  // Handle specific weapon names
  const specificWeapons: Record<string, string> = {
    QUARTERSTAFF: 'Quarterstaff',
    MACE: 'Mace',
    DAGGER: 'Dagger',
    SPEAR: 'Spear',
    LIGHT_CROSSBOW: 'Light Crossbow',
    DART: 'Dart',
    SHORTBOW: 'Shortbow',
    SLING: 'Sling',
    LONGSWORD: 'Longsword',
    SHORTSWORD: 'Shortsword',
    RAPIER: 'Rapier',
    SCIMITAR: 'Scimitar',
    HANDAXE: 'Handaxe',
    BATTLEAXE: 'Battleaxe',
    GREATAXE: 'Greataxe',
    GREATSWORD: 'Greatsword',
    MAUL: 'Maul',
    WARHAMMER: 'Warhammer',
    MORNINGSTAR: 'Morningstar',
    FLAIL: 'Flail',
    GLAIVE: 'Glaive',
    HALBERD: 'Halberd',
    LANCE: 'Lance',
    PIKE: 'Pike',
    TRIDENT: 'Trident',
    WHIP: 'Whip',
    BLOWGUN: 'Blowgun',
    HAND_CROSSBOW: 'Hand Crossbow',
    HEAVY_CROSSBOW: 'Heavy Crossbow',
    LONGBOW: 'Longbow',
    NET: 'Net',
  };

  if (specificWeapons[weaponStr]) {
    return specificWeapons[weaponStr];
  }

  // Default conversion: ENUM_STYLE to Title Case
  return weaponStr
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Convert saving throw enum values to human-readable strings
 * Examples: STRENGTH -> Strength, DEXTERITY -> Dexterity
 */
export function getSavingThrowDisplay(savingThrow: string | number): string {
  // Convert to string if it's a number or already a string
  const throwStr =
    typeof savingThrow === 'string' ? savingThrow : String(savingThrow);

  // Handle numeric enum values - these are the Ability enum values
  const abilityNames: Record<string, string> = {
    '0': 'Unspecified',
    '1': 'Strength',
    '2': 'Dexterity',
    '3': 'Constitution',
    '4': 'Intelligence',
    '5': 'Wisdom',
    '6': 'Charisma',
  };

  // If it's a numeric string, use the mapping
  if (abilityNames[throwStr]) {
    return abilityNames[throwStr];
  }

  // Otherwise treat as enum string name: STRENGTH -> Strength, DEXTERITY -> Dexterity, etc.
  return throwStr
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Convert tool proficiency enum values to human-readable strings
 * Examples: SMITHS_TOOLS -> Smith's Tools, THIEVES_TOOLS -> Thieves' Tools
 */
export function getToolProficiencyDisplay(tool: string | number): string {
  // Convert to string if it's a number
  const toolStr = typeof tool === 'string' ? tool : String(tool);

  // Handle special cases
  const specialCases: Record<string, string> = {
    SMITHS_TOOLS: "Smith's Tools",
    BREWERS_SUPPLIES: "Brewer's Supplies",
    MASONS_TOOLS: "Mason's Tools",
    CARPENTERS_TOOLS: "Carpenter's Tools",
    CARTOGRAPHERS_TOOLS: "Cartographer's Tools",
    COBBLERS_TOOLS: "Cobbler's Tools",
    COOKS_UTENSILS: "Cook's Utensils",
    GLASSBLOWERS_TOOLS: "Glassblower's Tools",
    JEWELERS_TOOLS: "Jeweler's Tools",
    LEATHERWORKERS_TOOLS: "Leatherworker's Tools",
    PAINTERS_SUPPLIES: "Painter's Supplies",
    POTTERS_TOOLS: "Potter's Tools",
    TINKERS_TOOLS: "Tinker's Tools",
    WEAVERS_TOOLS: "Weaver's Tools",
    WOODCARVERS_TOOLS: "Woodcarver's Tools",
    THIEVES_TOOLS: "Thieves' Tools",
    NAVIGATORS_TOOLS: "Navigator's Tools",
    DISGUISE_KIT: 'Disguise Kit',
    FORGERY_KIT: 'Forgery Kit',
    GAMING_SET: 'Gaming Set',
    HERBALISM_KIT: 'Herbalism Kit',
    MUSICAL_INSTRUMENT: 'Musical Instrument',
    POISONERS_KIT: "Poisoner's Kit",
    ALCHEMISTS_SUPPLIES: "Alchemist's Supplies",
    CALLIGRAPHERS_SUPPLIES: "Calligrapher's Supplies",
  };

  if (specialCases[toolStr]) {
    return specialCases[toolStr];
  }

  // Default conversion: ENUM_STYLE to Title Case
  return toolStr
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}
