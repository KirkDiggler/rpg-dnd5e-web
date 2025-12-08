/**
 * Enum display information for D&D 5e proto enums.
 * Provides icons, titles, and descriptions for weapons, abilities, conditions, features, and spells.
 */

import {
  Ability,
  ConditionId,
  FeatureId,
  Spell,
  Weapon,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

/**
 * Display information for enum values.
 */
export interface EnumDisplay {
  /** Display title */
  title: string;
  /** Icon/emoji representing the item */
  icon: string;
  /** Optional description */
  description?: string;
}

/**
 * Display information for all weapons.
 */
export const WEAPON_DISPLAY: Record<Weapon, EnumDisplay> = {
  [Weapon.UNSPECIFIED]: { title: 'Unknown Weapon', icon: '❓' },
  // Simple Melee Weapons
  [Weapon.CLUB]: {
    title: 'Club',
    icon: '🏏',
    description: '1d4 bludgeoning',
  },
  [Weapon.DAGGER]: {
    title: 'Dagger',
    icon: '🗡️',
    description: '1d4 piercing',
  },
  [Weapon.GREATCLUB]: {
    title: 'Greatclub',
    icon: '🏏',
    description: '1d8 bludgeoning',
  },
  [Weapon.HANDAXE]: {
    title: 'Handaxe',
    icon: '🪓',
    description: '1d6 slashing',
  },
  [Weapon.JAVELIN]: {
    title: 'Javelin',
    icon: '🗡️',
    description: '1d6 piercing',
  },
  [Weapon.LIGHT_HAMMER]: {
    title: 'Light Hammer',
    icon: '🔨',
    description: '1d4 bludgeoning',
  },
  [Weapon.MACE]: { title: 'Mace', icon: '🔨', description: '1d6 bludgeoning' },
  [Weapon.QUARTERSTAFF]: {
    title: 'Quarterstaff',
    icon: '🏏',
    description: '1d6 bludgeoning',
  },
  [Weapon.SICKLE]: {
    title: 'Sickle',
    icon: '⚔️',
    description: '1d4 slashing',
  },
  [Weapon.SPEAR]: {
    title: 'Spear',
    icon: '🗡️',
    description: '1d6 piercing',
  },
  // Simple Ranged Weapons
  [Weapon.LIGHT_CROSSBOW]: {
    title: 'Light Crossbow',
    icon: '🏹',
    description: '1d8 piercing',
  },
  [Weapon.DART]: {
    title: 'Dart',
    icon: '🎯',
    description: '1d4 piercing',
  },
  [Weapon.SHORTBOW]: {
    title: 'Shortbow',
    icon: '🏹',
    description: '1d6 piercing',
  },
  [Weapon.SLING]: {
    title: 'Sling',
    icon: '🎯',
    description: '1d4 bludgeoning',
  },
  // Martial Melee Weapons
  [Weapon.BATTLEAXE]: {
    title: 'Battleaxe',
    icon: '🪓',
    description: '1d8 slashing',
  },
  [Weapon.FLAIL]: {
    title: 'Flail',
    icon: '⚔️',
    description: '1d8 bludgeoning',
  },
  [Weapon.GLAIVE]: {
    title: 'Glaive',
    icon: '⚔️',
    description: '1d10 slashing',
  },
  [Weapon.GREATAXE]: {
    title: 'Greataxe',
    icon: '🪓',
    description: '1d12 slashing',
  },
  [Weapon.GREATSWORD]: {
    title: 'Greatsword',
    icon: '⚔️',
    description: '2d6 slashing',
  },
  [Weapon.HALBERD]: {
    title: 'Halberd',
    icon: '⚔️',
    description: '1d10 slashing',
  },
  [Weapon.LANCE]: {
    title: 'Lance',
    icon: '🗡️',
    description: '1d12 piercing',
  },
  [Weapon.LONGSWORD]: {
    title: 'Longsword',
    icon: '⚔️',
    description: '1d8 slashing',
  },
  [Weapon.MAUL]: {
    title: 'Maul',
    icon: '🔨',
    description: '2d6 bludgeoning',
  },
  [Weapon.MORNINGSTAR]: {
    title: 'Morningstar',
    icon: '⚔️',
    description: '1d8 piercing',
  },
  [Weapon.PIKE]: {
    title: 'Pike',
    icon: '🗡️',
    description: '1d10 piercing',
  },
  [Weapon.RAPIER]: {
    title: 'Rapier',
    icon: '🗡️',
    description: '1d8 piercing',
  },
  [Weapon.SCIMITAR]: {
    title: 'Scimitar',
    icon: '⚔️',
    description: '1d6 slashing',
  },
  [Weapon.SHORTSWORD]: {
    title: 'Shortsword',
    icon: '🗡️',
    description: '1d6 piercing',
  },
  [Weapon.TRIDENT]: {
    title: 'Trident',
    icon: '🔱',
    description: '1d6 piercing',
  },
  [Weapon.WAR_PICK]: {
    title: 'War Pick',
    icon: '⛏️',
    description: '1d8 piercing',
  },
  [Weapon.WARHAMMER]: {
    title: 'Warhammer',
    icon: '🔨',
    description: '1d8 bludgeoning',
  },
  [Weapon.WHIP]: {
    title: 'Whip',
    icon: '🔗',
    description: '1d4 slashing',
  },
  // Martial Ranged Weapons
  [Weapon.BLOWGUN]: {
    title: 'Blowgun',
    icon: '🎯',
    description: '1 piercing',
  },
  [Weapon.HAND_CROSSBOW]: {
    title: 'Hand Crossbow',
    icon: '🏹',
    description: '1d6 piercing',
  },
  [Weapon.HEAVY_CROSSBOW]: {
    title: 'Heavy Crossbow',
    icon: '🏹',
    description: '1d10 piercing',
  },
  [Weapon.LONGBOW]: {
    title: 'Longbow',
    icon: '🏹',
    description: '1d8 piercing',
  },
  [Weapon.NET]: { title: 'Net', icon: '🕸️', description: 'Special' },
  [Weapon.ARROWS_20]: {
    title: 'Arrows (20)',
    icon: '➡️',
    description: 'Ammunition',
  },
  [Weapon.BOLTS_20]: {
    title: 'Bolts (20)',
    icon: '➡️',
    description: 'Ammunition',
  },
  [Weapon.ANY_SIMPLE]: { title: 'Simple Weapon', icon: '⚔️' },
  [Weapon.ANY_MARTIAL]: { title: 'Martial Weapon', icon: '⚔️' },
  [Weapon.ANY]: { title: 'Any Weapon', icon: '⚔️' },
};

/**
 * Display information for all abilities.
 */
export const ABILITY_DISPLAY: Record<Ability, EnumDisplay> = {
  [Ability.UNSPECIFIED]: { title: 'Unknown', icon: '❓' },
  [Ability.STRENGTH]: {
    title: 'Strength',
    icon: '💪',
    description: 'Physical power',
  },
  [Ability.DEXTERITY]: {
    title: 'Dexterity',
    icon: '🏃',
    description: 'Agility and reflexes',
  },
  [Ability.CONSTITUTION]: {
    title: 'Constitution',
    icon: '❤️',
    description: 'Endurance and health',
  },
  [Ability.INTELLIGENCE]: {
    title: 'Intelligence',
    icon: '🧠',
    description: 'Reasoning and memory',
  },
  [Ability.WISDOM]: {
    title: 'Wisdom',
    icon: '🦉',
    description: 'Awareness and insight',
  },
  [Ability.CHARISMA]: {
    title: 'Charisma',
    icon: '✨',
    description: 'Force of personality',
  },
};

/**
 * Display information for all condition IDs.
 */
export const CONDITION_DISPLAY: Record<ConditionId, EnumDisplay> = {
  [ConditionId.UNSPECIFIED]: { title: 'Unknown Condition', icon: '❓' },
  [ConditionId.RAGING]: {
    title: 'Raging',
    icon: '🔥',
    description: 'Barbarian rage - bonus damage and resistance',
  },
  [ConditionId.BRUTAL_CRITICAL]: {
    title: 'Brutal Critical',
    icon: '💥',
    description: 'Extra critical hit dice',
  },
  [ConditionId.FIGHTING_STYLE_DUELING]: {
    title: 'Dueling',
    icon: '🤺',
    description: '+2 damage with one-handed weapon',
  },
  [ConditionId.FIGHTING_STYLE_TWO_WEAPON_FIGHTING]: {
    title: 'Two-Weapon Fighting',
    icon: '⚔️',
    description: 'Add ability modifier to off-hand damage',
  },
  [ConditionId.SNEAK_ATTACK]: {
    title: 'Sneak Attack',
    icon: '🗡️',
    description: 'Rogue sneak attack damage',
  },
  [ConditionId.DIVINE_SMITE]: {
    title: 'Divine Smite',
    icon: '✨',
    description: 'Paladin divine smite damage',
  },
};

/**
 * Display information for all feature IDs.
 */
export const FEATURE_DISPLAY: Record<FeatureId, EnumDisplay> = {
  [FeatureId.UNSPECIFIED]: { title: 'Unknown Feature', icon: '❓' },
  [FeatureId.BREATH_WEAPON]: {
    title: 'Breath Weapon',
    icon: '🔥',
    description: 'Dragonborn breath weapon',
  },
  [FeatureId.HELLISH_REBUKE]: {
    title: 'Hellish Rebuke',
    icon: '🔥',
    description: 'Tiefling racial ability',
  },
  [FeatureId.RADIANCE_OF_DAWN]: {
    title: 'Radiance of Dawn',
    icon: '☀️',
    description: 'Light Cleric channel divinity',
  },
  [FeatureId.WRATH_OF_THE_STORM]: {
    title: 'Wrath of the Storm',
    icon: '⚡',
    description: 'Tempest Cleric reaction',
  },
  [FeatureId.DESTRUCTIVE_WRATH]: {
    title: 'Destructive Wrath',
    icon: '⚡',
    description: 'Tempest Cleric channel divinity - max damage',
  },
  [FeatureId.DEFLECT_MISSILES]: {
    title: 'Deflect Missiles',
    icon: '🛡️',
    description: 'Monk deflect and throw missiles',
  },
  [FeatureId.STARRY_FORM_ARCHER]: {
    title: 'Starry Form - Archer',
    icon: '⭐',
    description: 'Stars Druid constellation damage',
  },
};

/**
 * Display information for common damage spells.
 */
export const SPELL_DISPLAY: Record<Spell, EnumDisplay> = {
  [Spell.UNSPECIFIED]: { title: 'Unknown Spell', icon: '❓' },
  // Damage Cantrips
  [Spell.FIRE_BOLT]: {
    title: 'Fire Bolt',
    icon: '🔥',
    description: '1d10 fire damage',
  },
  [Spell.RAY_OF_FROST]: {
    title: 'Ray of Frost',
    icon: '❄️',
    description: '1d8 cold damage',
  },
  [Spell.SHOCKING_GRASP]: {
    title: 'Shocking Grasp',
    icon: '⚡',
    description: '1d8 lightning damage',
  },
  [Spell.ACID_SPLASH]: {
    title: 'Acid Splash',
    icon: '💧',
    description: '1d6 acid damage',
  },
  [Spell.POISON_SPRAY]: {
    title: 'Poison Spray',
    icon: '☠️',
    description: '1d12 poison damage',
  },
  [Spell.CHILL_TOUCH]: {
    title: 'Chill Touch',
    icon: '💀',
    description: '1d8 necrotic damage',
  },
  [Spell.SACRED_FLAME]: {
    title: 'Sacred Flame',
    icon: '✨',
    description: '1d8 radiant damage',
  },
  [Spell.TOLL_THE_DEAD]: {
    title: 'Toll the Dead',
    icon: '🔔',
    description: '1d8/1d12 necrotic damage',
  },
  [Spell.WORD_OF_RADIANCE]: {
    title: 'Word of Radiance',
    icon: '✨',
    description: '1d6 radiant damage',
  },
  [Spell.ELDRITCH_BLAST]: {
    title: 'Eldritch Blast',
    icon: '💜',
    description: '1d10 force damage',
  },
  [Spell.FROSTBITE]: {
    title: 'Frostbite',
    icon: '❄️',
    description: '1d6 cold damage',
  },
  [Spell.PRIMAL_SAVAGERY]: {
    title: 'Primal Savagery',
    icon: '🐾',
    description: '1d10 acid damage',
  },
  [Spell.THORNWHIP]: {
    title: 'Thorn Whip',
    icon: '🌿',
    description: '1d6 piercing damage',
  },
  // Utility Cantrips
  [Spell.MAGE_HAND]: {
    title: 'Mage Hand',
    icon: '✋',
    description: 'Spectral hand',
  },
  [Spell.MINOR_ILLUSION]: {
    title: 'Minor Illusion',
    icon: '🎭',
    description: 'Sound or image',
  },
  [Spell.PRESTIDIGITATION]: {
    title: 'Prestidigitation',
    icon: '✨',
    description: 'Minor magical tricks',
  },
  [Spell.LIGHT]: { title: 'Light', icon: '💡', description: 'Create light' },
  [Spell.GUIDANCE]: {
    title: 'Guidance',
    icon: '🙏',
    description: '+1d4 to ability check',
  },
  [Spell.RESISTANCE]: {
    title: 'Resistance',
    icon: '🛡️',
    description: '+1d4 to saving throw',
  },
  [Spell.THAUMATURGY]: {
    title: 'Thaumaturgy',
    icon: '✨',
    description: 'Minor divine wonders',
  },
  [Spell.SPARE_THE_DYING]: {
    title: 'Spare the Dying',
    icon: '❤️',
    description: 'Stabilize dying creature',
  },
  // Level 1 Damage Spells
  [Spell.MAGIC_MISSILE]: {
    title: 'Magic Missile',
    icon: '✨',
    description: '1d4+1 force damage per dart',
  },
  [Spell.BURNING_HANDS]: {
    title: 'Burning Hands',
    icon: '🔥',
    description: '3d6 fire damage',
  },
  [Spell.CHROMATIC_ORB]: {
    title: 'Chromatic Orb',
    icon: '🌈',
    description: '3d8 elemental damage',
  },
  [Spell.THUNDERWAVE]: {
    title: 'Thunderwave',
    icon: '⚡',
    description: '2d8 thunder damage',
  },
  [Spell.ICE_KNIFE]: {
    title: 'Ice Knife',
    icon: '❄️',
    description: '1d10 piercing + 2d6 cold',
  },
  [Spell.WITCH_BOLT]: {
    title: 'Witch Bolt',
    icon: '⚡',
    description: '1d12 lightning damage',
  },
  [Spell.GUIDING_BOLT]: {
    title: 'Guiding Bolt',
    icon: '✨',
    description: '4d6 radiant damage',
  },
  [Spell.INFLICT_WOUNDS]: {
    title: 'Inflict Wounds',
    icon: '💀',
    description: '3d10 necrotic damage',
  },
  [Spell.HAIL_OF_THORNS]: {
    title: 'Hail of Thorns',
    icon: '🌿',
    description: '1d10 piercing damage',
  },
  [Spell.ENSNARING_STRIKE]: {
    title: 'Ensnaring Strike',
    icon: '🌿',
    description: '1d6 piercing damage',
  },
  [Spell.HELLISH_REBUKE]: {
    title: 'Hellish Rebuke',
    icon: '🔥',
    description: '2d10 fire damage',
  },
  [Spell.ARMS_OF_HADAR]: {
    title: 'Arms of Hadar',
    icon: '🐙',
    description: '2d6 necrotic damage',
  },
  [Spell.HEX]: {
    title: 'Hex',
    icon: '☠️',
    description: '+1d6 necrotic damage',
  },
  [Spell.SEARING_SMITE]: {
    title: 'Searing Smite',
    icon: '🔥',
    description: '1d6 fire damage',
  },
  [Spell.THUNDEROUS_SMITE]: {
    title: 'Thunderous Smite',
    icon: '⚡',
    description: '+2d6 thunder damage',
  },
  [Spell.WRATHFUL_SMITE]: {
    title: 'Wrathful Smite',
    icon: '😱',
    description: '+1d6 psychic damage',
  },
  // Level 1 Utility Spells
  [Spell.SHIELD]: {
    title: 'Shield',
    icon: '🛡️',
    description: '+5 AC until next turn',
  },
  [Spell.SLEEP]: {
    title: 'Sleep',
    icon: '😴',
    description: 'Put creatures to sleep',
  },
  [Spell.CHARM_PERSON]: {
    title: 'Charm Person',
    icon: '💖',
    description: 'Charm a humanoid',
  },
  [Spell.DETECT_MAGIC]: {
    title: 'Detect Magic',
    icon: '🔮',
    description: 'Sense magic nearby',
  },
  [Spell.IDENTIFY]: {
    title: 'Identify',
    icon: '🔍',
    description: 'Learn properties of item',
  },
  [Spell.CURE_WOUNDS]: {
    title: 'Cure Wounds',
    icon: '❤️',
    description: '1d8+mod healing',
  },
  [Spell.HEALING_WORD]: {
    title: 'Healing Word',
    icon: '💚',
    description: '1d4+mod healing',
  },
  [Spell.BLESS]: {
    title: 'Bless',
    icon: '✨',
    description: '+1d4 to attacks and saves',
  },
  [Spell.BANE]: {
    title: 'Bane',
    icon: '☠️',
    description: '-1d4 to attacks and saves',
  },
  [Spell.SHIELD_OF_FAITH]: {
    title: 'Shield of Faith',
    icon: '🛡️',
    description: '+2 AC',
  },
  // Level 2 Damage Spells
  [Spell.SCORCHING_RAY]: {
    title: 'Scorching Ray',
    icon: '🔥',
    description: '2d6 fire per ray',
  },
  [Spell.SHATTER]: {
    title: 'Shatter',
    icon: '💥',
    description: '3d8 thunder damage',
  },
  [Spell.AGANAZZARS_SCORCHER]: {
    title: "Aganazzar's Scorcher",
    icon: '🔥',
    description: '3d8 fire damage',
  },
  [Spell.CLOUD_OF_DAGGERS]: {
    title: 'Cloud of Daggers',
    icon: '🗡️',
    description: '4d4 slashing damage',
  },
  [Spell.MELFS_ACID_ARROW]: {
    title: "Melf's Acid Arrow",
    icon: '💧',
    description: '4d4 acid damage',
  },
  [Spell.MOONBEAM]: {
    title: 'Moonbeam',
    icon: '🌙',
    description: '2d10 radiant damage',
  },
  [Spell.SPIRITUAL_WEAPON]: {
    title: 'Spiritual Weapon',
    icon: '⚔️',
    description: '1d8+mod force damage',
  },
  [Spell.FLAMING_SPHERE]: {
    title: 'Flaming Sphere',
    icon: '🔥',
    description: '2d6 fire damage',
  },
  // Level 3 Damage Spells
  [Spell.FIREBALL]: {
    title: 'Fireball',
    icon: '🔥',
    description: '8d6 fire damage',
  },
  [Spell.LIGHTNING_BOLT]: {
    title: 'Lightning Bolt',
    icon: '⚡',
    description: '8d6 lightning damage',
  },
  [Spell.CALL_LIGHTNING]: {
    title: 'Call Lightning',
    icon: '⚡',
    description: '3d10 lightning damage',
  },
  [Spell.VAMPIRIC_TOUCH]: {
    title: 'Vampiric Touch',
    icon: '🧛',
    description: '3d6 necrotic damage',
  },
};

/**
 * Get display information for a weapon.
 */
export function getWeaponDisplay(weapon: Weapon): EnumDisplay {
  return (
    WEAPON_DISPLAY[weapon] || {
      title: `Unknown Weapon (${weapon})`,
      icon: '❓',
    }
  );
}

/**
 * Get display information for an ability.
 */
export function getAbilityDisplay(ability: Ability): EnumDisplay {
  return (
    ABILITY_DISPLAY[ability] || {
      title: `Unknown Ability (${ability})`,
      icon: '❓',
    }
  );
}

/**
 * Get display information for a condition.
 */
export function getConditionDisplay(condition: ConditionId): EnumDisplay {
  return (
    CONDITION_DISPLAY[condition] || {
      title: `Unknown Condition (${condition})`,
      icon: '❓',
    }
  );
}

/**
 * Get display information for a feature.
 */
export function getFeatureDisplay(feature: FeatureId): EnumDisplay {
  return (
    FEATURE_DISPLAY[feature] || {
      title: `Unknown Feature (${feature})`,
      icon: '❓',
    }
  );
}

/**
 * Get display information for a spell.
 */
export function getSpellDisplay(spell: Spell): EnumDisplay {
  return (
    SPELL_DISPLAY[spell] || {
      title: `Unknown Spell (${spell})`,
      icon: '❓',
    }
  );
}
