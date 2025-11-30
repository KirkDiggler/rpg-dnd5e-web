import {
  FightingStyle,
  Language,
  Skill,
  Tool,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import type { EnumDisplayInfo } from '../components/choices/EnumChoice';

// Fighting Styles - have descriptions
export const fightingStyleRegistry: Record<FightingStyle, EnumDisplayInfo> = {
  [FightingStyle.UNSPECIFIED]: { name: 'Unknown' },
  [FightingStyle.ARCHERY]: {
    name: 'Archery',
    description: '+2 to attack rolls with ranged weapons',
  },
  [FightingStyle.DEFENSE]: {
    name: 'Defense',
    description: '+1 to AC while wearing armor',
  },
  [FightingStyle.DUELING]: {
    name: 'Dueling',
    description: '+2 damage when wielding a one-handed melee weapon',
  },
  [FightingStyle.GREAT_WEAPON_FIGHTING]: {
    name: 'Great Weapon Fighting',
    description: 'Reroll 1s and 2s on damage dice with two-handed weapons',
  },
  [FightingStyle.PROTECTION]: {
    name: 'Protection',
    description:
      'Use reaction to impose disadvantage on attacks against allies',
  },
  [FightingStyle.TWO_WEAPON_FIGHTING]: {
    name: 'Two-Weapon Fighting',
    description: 'Add ability modifier to off-hand attack damage',
  },
};

// Languages - no descriptions
export const languageRegistry: Record<Language, EnumDisplayInfo> = {
  [Language.UNSPECIFIED]: { name: 'Unknown' },
  [Language.COMMON]: { name: 'Common' },
  [Language.DWARVISH]: { name: 'Dwarvish' },
  [Language.ELVISH]: { name: 'Elvish' },
  [Language.GIANT]: { name: 'Giant' },
  [Language.GNOMISH]: { name: 'Gnomish' },
  [Language.GOBLIN]: { name: 'Goblin' },
  [Language.HALFLING]: { name: 'Halfling' },
  [Language.ORC]: { name: 'Orc' },
  [Language.ABYSSAL]: { name: 'Abyssal' },
  [Language.CELESTIAL]: { name: 'Celestial' },
  [Language.DRACONIC]: { name: 'Draconic' },
  [Language.DEEP_SPEECH]: { name: 'Deep Speech' },
  [Language.INFERNAL]: { name: 'Infernal' },
  [Language.PRIMORDIAL]: { name: 'Primordial' },
  [Language.SYLVAN]: { name: 'Sylvan' },
  [Language.UNDERCOMMON]: { name: 'Undercommon' },
};

// Skills - no descriptions but we need ability grouping
export const skillRegistry: Record<Skill, EnumDisplayInfo> = {
  [Skill.UNSPECIFIED]: { name: 'Unknown' },
  [Skill.ACROBATICS]: { name: 'Acrobatics' },
  [Skill.ANIMAL_HANDLING]: { name: 'Animal Handling' },
  [Skill.ARCANA]: { name: 'Arcana' },
  [Skill.ATHLETICS]: { name: 'Athletics' },
  [Skill.DECEPTION]: { name: 'Deception' },
  [Skill.HISTORY]: { name: 'History' },
  [Skill.INSIGHT]: { name: 'Insight' },
  [Skill.INTIMIDATION]: { name: 'Intimidation' },
  [Skill.INVESTIGATION]: { name: 'Investigation' },
  [Skill.MEDICINE]: { name: 'Medicine' },
  [Skill.NATURE]: { name: 'Nature' },
  [Skill.PERCEPTION]: { name: 'Perception' },
  [Skill.PERFORMANCE]: { name: 'Performance' },
  [Skill.PERSUASION]: { name: 'Persuasion' },
  [Skill.RELIGION]: { name: 'Religion' },
  [Skill.SLEIGHT_OF_HAND]: { name: 'Sleight of Hand' },
  [Skill.STEALTH]: { name: 'Stealth' },
  [Skill.SURVIVAL]: { name: 'Survival' },
};

// Skill to ability mapping for grouping
export const skillAbilityMap: Record<Skill, string> = {
  [Skill.UNSPECIFIED]: 'Unknown',
  [Skill.ACROBATICS]: 'Dexterity',
  [Skill.ANIMAL_HANDLING]: 'Wisdom',
  [Skill.ARCANA]: 'Intelligence',
  [Skill.ATHLETICS]: 'Strength',
  [Skill.DECEPTION]: 'Charisma',
  [Skill.HISTORY]: 'Intelligence',
  [Skill.INSIGHT]: 'Wisdom',
  [Skill.INTIMIDATION]: 'Charisma',
  [Skill.INVESTIGATION]: 'Intelligence',
  [Skill.MEDICINE]: 'Wisdom',
  [Skill.NATURE]: 'Intelligence',
  [Skill.PERCEPTION]: 'Wisdom',
  [Skill.PERFORMANCE]: 'Charisma',
  [Skill.PERSUASION]: 'Charisma',
  [Skill.RELIGION]: 'Intelligence',
  [Skill.SLEIGHT_OF_HAND]: 'Dexterity',
  [Skill.STEALTH]: 'Dexterity',
  [Skill.SURVIVAL]: 'Wisdom',
};

// Tools - no descriptions
export const toolRegistry: Record<Tool, EnumDisplayInfo> = {
  [Tool.UNSPECIFIED]: { name: 'Unknown' },
  [Tool.ALCHEMIST_SUPPLIES]: { name: "Alchemist's Supplies" },
  [Tool.BREWER_SUPPLIES]: { name: "Brewer's Supplies" },
  [Tool.CALLIGRAPHER_SUPPLIES]: { name: "Calligrapher's Supplies" },
  [Tool.CARPENTER_TOOLS]: { name: "Carpenter's Tools" },
  [Tool.CARTOGRAPHER_TOOLS]: { name: "Cartographer's Tools" },
  [Tool.COBBLER_TOOLS]: { name: "Cobbler's Tools" },
  [Tool.COOK_UTENSILS]: { name: "Cook's Utensils" },
  [Tool.GLASSBLOWER_TOOLS]: { name: "Glassblower's Tools" },
  [Tool.JEWELER_TOOLS]: { name: "Jeweler's Tools" },
  [Tool.LEATHERWORKER_TOOLS]: { name: "Leatherworker's Tools" },
  [Tool.MASON_TOOLS]: { name: "Mason's Tools" },
  [Tool.PAINTER_SUPPLIES]: { name: "Painter's Supplies" },
  [Tool.POTTER_TOOLS]: { name: "Potter's Tools" },
  [Tool.SMITH_TOOLS]: { name: "Smith's Tools" },
  [Tool.TINKER_TOOLS]: { name: "Tinker's Tools" },
  [Tool.WEAVER_TOOLS]: { name: "Weaver's Tools" },
  [Tool.WOODCARVER_TOOLS]: { name: "Woodcarver's Tools" },
  [Tool.DICE_SET]: { name: 'Dice Set' },
  [Tool.DRAGONCHESS_SET]: { name: 'Dragonchess Set' },
  [Tool.PLAYING_CARD_SET]: { name: 'Playing Card Set' },
  [Tool.THREE_DRAGON_ANTE]: { name: 'Three-Dragon Ante Set' },
  [Tool.BAGPIPES]: { name: 'Bagpipes' },
  [Tool.DRUM]: { name: 'Drum' },
  [Tool.DULCIMER]: { name: 'Dulcimer' },
  [Tool.FLUTE]: { name: 'Flute' },
  [Tool.LUTE]: { name: 'Lute' },
  [Tool.LYRE]: { name: 'Lyre' },
  [Tool.HORN]: { name: 'Horn' },
  [Tool.PAN_FLUTE]: { name: 'Pan Flute' },
  [Tool.SHAWM]: { name: 'Shawm' },
  [Tool.VIOL]: { name: 'Viol' },
  [Tool.DISGUISE_KIT]: { name: 'Disguise Kit' },
  [Tool.FORGERY_KIT]: { name: 'Forgery Kit' },
  [Tool.HERBALISM_KIT]: { name: 'Herbalism Kit' },
  [Tool.NAVIGATOR_TOOLS]: { name: "Navigator's Tools" },
  [Tool.POISONER_KIT]: { name: "Poisoner's Kit" },
  [Tool.THIEVES_TOOLS]: { name: "Thieves' Tools" },
  [Tool.VEHICLES_LAND]: { name: 'Vehicles (Land)' },
  [Tool.VEHICLES_WATER]: { name: 'Vehicles (Water)' },
};

// Helper functions for easy access
export function getFightingStyleInfo(style: FightingStyle): EnumDisplayInfo {
  return fightingStyleRegistry[style] || { name: 'Unknown' };
}

export function getLanguageInfo(lang: Language): EnumDisplayInfo {
  return languageRegistry[lang] || { name: 'Unknown' };
}

export function getSkillInfo(skill: Skill): EnumDisplayInfo {
  return skillRegistry[skill] || { name: 'Unknown' };
}

export function getSkillAbility(skill: Skill): string {
  return skillAbilityMap[skill] || 'Unknown';
}

export function getToolInfo(tool: Tool): EnumDisplayInfo {
  return toolRegistry[tool] || { name: 'Unknown' };
}
