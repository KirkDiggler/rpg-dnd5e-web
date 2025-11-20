import {
  Ammunition,
  Armor,
  Background,
  Class,
  Language,
  Pack,
  Race,
  Skill,
  Tool,
  Weapon,
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

/**
 * Convert Weapon enum to display name
 * Examples: CLUB -> Club, GREATAXE -> Greataxe, LIGHT_CROSSBOW -> Light Crossbow
 */
export function getWeaponDisplay(weapon: Weapon): string {
  const displays: Record<Weapon, string> = {
    [Weapon.UNSPECIFIED]: 'Unknown',
    [Weapon.CLUB]: 'Club',
    [Weapon.DAGGER]: 'Dagger',
    [Weapon.GREATCLUB]: 'Greatclub',
    [Weapon.HANDAXE]: 'Handaxe',
    [Weapon.JAVELIN]: 'Javelin',
    [Weapon.LIGHT_HAMMER]: 'Light Hammer',
    [Weapon.MACE]: 'Mace',
    [Weapon.QUARTERSTAFF]: 'Quarterstaff',
    [Weapon.SICKLE]: 'Sickle',
    [Weapon.SPEAR]: 'Spear',
    [Weapon.LIGHT_CROSSBOW]: 'Light Crossbow',
    [Weapon.DART]: 'Dart',
    [Weapon.SHORTBOW]: 'Shortbow',
    [Weapon.SLING]: 'Sling',
    [Weapon.BATTLEAXE]: 'Battleaxe',
    [Weapon.FLAIL]: 'Flail',
    [Weapon.GLAIVE]: 'Glaive',
    [Weapon.GREATAXE]: 'Greataxe',
    [Weapon.GREATSWORD]: 'Greatsword',
    [Weapon.HALBERD]: 'Halberd',
    [Weapon.LANCE]: 'Lance',
    [Weapon.LONGSWORD]: 'Longsword',
    [Weapon.MAUL]: 'Maul',
    [Weapon.MORNINGSTAR]: 'Morningstar',
    [Weapon.PIKE]: 'Pike',
    [Weapon.RAPIER]: 'Rapier',
    [Weapon.SCIMITAR]: 'Scimitar',
    [Weapon.SHORTSWORD]: 'Shortsword',
    [Weapon.TRIDENT]: 'Trident',
    [Weapon.WAR_PICK]: 'War Pick',
    [Weapon.WARHAMMER]: 'Warhammer',
    [Weapon.WHIP]: 'Whip',
    [Weapon.BLOWGUN]: 'Blowgun',
    [Weapon.HAND_CROSSBOW]: 'Hand Crossbow',
    [Weapon.HEAVY_CROSSBOW]: 'Heavy Crossbow',
    [Weapon.LONGBOW]: 'Longbow',
    [Weapon.NET]: 'Net',
    [Weapon.ARROWS_20]: 'Arrows (20)',
    [Weapon.BOLTS_20]: 'Bolts (20)',
    [Weapon.ANY_SIMPLE]: 'Any Simple Weapon',
    [Weapon.ANY_MARTIAL]: 'Any Martial Weapon',
    [Weapon.ANY]: 'Any Weapon',
  };
  return displays[weapon] || 'Unknown Weapon';
}

/**
 * Convert Armor enum to display name
 * Examples: LEATHER -> Leather, CHAIN_MAIL -> Chain Mail
 */
export function getArmorDisplay(armor: Armor): string {
  const displays: Record<Armor, string> = {
    [Armor.UNSPECIFIED]: 'Unknown',
    [Armor.PADDED]: 'Padded Armor',
    [Armor.LEATHER]: 'Leather Armor',
    [Armor.STUDDED_LEATHER]: 'Studded Leather Armor',
    [Armor.HIDE]: 'Hide Armor',
    [Armor.CHAIN_SHIRT]: 'Chain Shirt',
    [Armor.SCALE_MAIL]: 'Scale Mail',
    [Armor.BREASTPLATE]: 'Breastplate',
    [Armor.HALF_PLATE]: 'Half Plate',
    [Armor.RING_MAIL]: 'Ring Mail',
    [Armor.CHAIN_MAIL]: 'Chain Mail',
    [Armor.SPLINT]: 'Splint Armor',
    [Armor.PLATE]: 'Plate Armor',
    [Armor.SHIELD]: 'Shield',
  };
  return displays[armor] || 'Unknown Armor';
}

/**
 * Convert Tool enum to display name
 * Examples: SMITH_TOOLS -> Smith's Tools, THIEVES_TOOLS -> Thieves' Tools
 */
export function getToolDisplay(tool: Tool): string {
  const displays: Record<Tool, string> = {
    [Tool.UNSPECIFIED]: 'Unknown',
    [Tool.ALCHEMIST_SUPPLIES]: "Alchemist's Supplies",
    [Tool.BREWER_SUPPLIES]: "Brewer's Supplies",
    [Tool.CALLIGRAPHER_SUPPLIES]: "Calligrapher's Supplies",
    [Tool.CARPENTER_TOOLS]: "Carpenter's Tools",
    [Tool.CARTOGRAPHER_TOOLS]: "Cartographer's Tools",
    [Tool.COBBLER_TOOLS]: "Cobbler's Tools",
    [Tool.COOK_UTENSILS]: "Cook's Utensils",
    [Tool.GLASSBLOWER_TOOLS]: "Glassblower's Tools",
    [Tool.JEWELER_TOOLS]: "Jeweler's Tools",
    [Tool.LEATHERWORKER_TOOLS]: "Leatherworker's Tools",
    [Tool.MASON_TOOLS]: "Mason's Tools",
    [Tool.PAINTER_SUPPLIES]: "Painter's Supplies",
    [Tool.POTTER_TOOLS]: "Potter's Tools",
    [Tool.SMITH_TOOLS]: "Smith's Tools",
    [Tool.TINKER_TOOLS]: "Tinker's Tools",
    [Tool.WEAVER_TOOLS]: "Weaver's Tools",
    [Tool.WOODCARVER_TOOLS]: "Woodcarver's Tools",
    [Tool.DICE_SET]: 'Dice Set',
    [Tool.DRAGONCHESS_SET]: 'Dragonchess Set',
    [Tool.PLAYING_CARD_SET]: 'Playing Card Set',
    [Tool.THREE_DRAGON_ANTE]: 'Three-Dragon Ante Set',
    [Tool.BAGPIPES]: 'Bagpipes',
    [Tool.DRUM]: 'Drum',
    [Tool.DULCIMER]: 'Dulcimer',
    [Tool.FLUTE]: 'Flute',
    [Tool.LUTE]: 'Lute',
    [Tool.LYRE]: 'Lyre',
    [Tool.HORN]: 'Horn',
    [Tool.PAN_FLUTE]: 'Pan Flute',
    [Tool.SHAWM]: 'Shawm',
    [Tool.VIOL]: 'Viol',
    [Tool.DISGUISE_KIT]: 'Disguise Kit',
    [Tool.FORGERY_KIT]: 'Forgery Kit',
    [Tool.HERBALISM_KIT]: 'Herbalism Kit',
    [Tool.NAVIGATOR_TOOLS]: "Navigator's Tools",
    [Tool.POISONER_KIT]: "Poisoner's Kit",
    [Tool.THIEVES_TOOLS]: "Thieves' Tools",
    [Tool.VEHICLES_LAND]: 'Vehicles (Land)',
    [Tool.VEHICLES_WATER]: 'Vehicles (Water)',
  };
  return displays[tool] || 'Unknown Tool';
}

/**
 * Convert Pack enum to display name
 * Examples: EXPLORER -> Explorer's Pack, BURGLAR -> Burglar's Pack
 */
export function getPackDisplay(pack: Pack): string {
  const displays: Record<Pack, string> = {
    [Pack.UNSPECIFIED]: 'Unknown',
    [Pack.BURGLARS]: "Burglar's Pack",
    [Pack.DIPLOMATS]: "Diplomat's Pack",
    [Pack.DUNGEONEERS]: "Dungeoneer's Pack",
    [Pack.ENTERTAINERS]: "Entertainer's Pack",
    [Pack.EXPLORERS]: "Explorer's Pack",
    [Pack.PRIESTS]: "Priest's Pack",
    [Pack.SCHOLARS]: "Scholar's Pack",
  };
  return displays[pack] || 'Unknown Pack';
}

/**
 * Convert Ammunition enum to display name
 */
export function getAmmunitionDisplay(ammo: Ammunition): string {
  const displays: Record<Ammunition, string> = {
    [Ammunition.UNSPECIFIED]: 'Unknown',
    [Ammunition.ARROWS_20]: 'Arrows (20)',
    [Ammunition.BOLTS_20]: 'Bolts (20)',
    [Ammunition.BLOWGUN_NEEDLES_50]: 'Blowgun Needles (50)',
    [Ammunition.SLING_BULLETS_20]: 'Sling Bullets (20)',
  };
  return displays[ammo] || 'Unknown Ammunition';
}
