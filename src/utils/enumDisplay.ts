import {
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
