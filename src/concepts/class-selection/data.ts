export interface AbilityGuidance {
  ability: string;
  priority: 'primary' | 'secondary' | 'tertiary';
  explanation: string;
}

export interface EquipmentOption {
  itemName: string;
  damage: string;
  damageType: string;
  properties: string[];
  tip: string;
}

export interface ProficiencyDetails {
  weapons: string[];
  weaponNotes: string;
  armor: string[];
  armorNotes: string;
  tools: string[];
  toolNotes: string;
}

export interface EnrichedClassInfo {
  name: string;
  emoji: string;
  hitDie: number;
  primaryAbility: string;
  savingThrows: string[];
  description: string;
  abilityGuidance: AbilityGuidance[];
  savingThrowContext: string;
  proficiencyDetails: ProficiencyDetails;
  equipmentGuidance: EquipmentOption[];
  skillChoices: {
    count: number;
    options: string[];
    tips: string;
  };
}

export const MONK_DATA: EnrichedClassInfo = {
  name: 'Monk',
  emoji: '👊',
  hitDie: 8,
  primaryAbility: 'Dexterity',
  savingThrows: ['Strength', 'Dexterity'],
  description:
    'Masters of martial arts who channel ki — an innate magical energy — through disciplined combat. Monks are fast, mobile strikers who dart in and out of melee using unarmed strikes and monk weapons. Unlike Fighters who rely on heavy armor and martial weapons, Monks use Dexterity and Wisdom to power both their offense and defense.',
  abilityGuidance: [
    {
      ability: 'Dexterity',
      priority: 'primary',
      explanation:
        'Your attack and damage modifier for monk weapons and unarmed strikes. Also determines your AC through Unarmored Defense (10 + DEX + WIS) and is one of your saving throw proficiencies.',
    },
    {
      ability: 'Wisdom',
      priority: 'secondary',
      explanation:
        'Boosts your AC via Unarmored Defense, sets the save DC for ki abilities like Stunning Strike, and improves Perception — the most-rolled skill in the game.',
    },
    {
      ability: 'Constitution',
      priority: 'tertiary',
      explanation:
        'Hit points matter for a melee class with only a d8 hit die. You will be in the thick of combat without heavy armor.',
    },
  ],
  savingThrowContext:
    'Strength & Dexterity — DEX saves are one of the most common in the game, protecting against fireballs, dragon breath, and area effects. STR saves protect against being knocked prone, grappled, or pushed. At level 14, Diamond Soul gives you proficiency in ALL saving throws.',
  proficiencyDetails: {
    weapons: ['Simple weapons', 'Shortswords'],
    weaponNotes:
      "Any simple melee weapon without the Heavy or Special property counts as a monk weapon. You can use DEX instead of STR for attack and damage rolls with monk weapons. Your Martial Arts damage die starts at d4 and replaces the weapon's die when it's higher — eventually reaching d10 at level 17.",
    armor: [],
    armorNotes:
      'Monks use Unarmored Defense: AC = 10 + DEX modifier + WIS modifier. Wearing any armor disables Unarmored Defense, Martial Arts, and Unarmored Movement. With 16 DEX and 16 WIS, your AC is 16 — equivalent to chain mail without the stealth penalty.',
    tools: [],
    toolNotes:
      'No tool proficiencies. Choose an artisan tool or musical instrument from your background.',
  },
  equipmentGuidance: [
    {
      itemName: 'Shortsword',
      damage: '1d6',
      damageType: 'slashing',
      properties: ['Finesse', 'Light'],
      tip: 'Best monk starting weapon — uses DEX for attacks, counts as a monk weapon, and the Light property lets you dual-wield (though your Martial Arts bonus attack is usually better).',
    },
    {
      itemName: 'Handaxe',
      damage: '1d6',
      damageType: 'slashing',
      properties: ['Light', 'Thrown (20/60)'],
      tip: "Equal damage to shortsword with a ranged option. Good backup for when you can't close the distance. Counts as a monk weapon.",
    },
    {
      itemName: 'Quarterstaff',
      damage: '1d6 (1d8 versatile)',
      damageType: 'bludgeoning',
      properties: ['Versatile'],
      tip: 'Can be wielded two-handed for 1d8 damage before your Martial Arts die surpasses it. Counts as a monk weapon.',
    },
    {
      itemName: 'Spear',
      damage: '1d6 (1d8 versatile)',
      damageType: 'piercing',
      properties: ['Thrown (20/60)', 'Versatile'],
      tip: 'Versatile like the quarterstaff but can also be thrown. Solid all-around pick.',
    },
  ],
  skillChoices: {
    count: 2,
    options: [
      'Acrobatics',
      'Athletics',
      'History',
      'Insight',
      'Religion',
      'Stealth',
    ],
    tips: 'Acrobatics and Stealth complement your mobile combat style. Acrobatics lets you escape grapples using DEX (your best stat), and Stealth pairs with your lack of armor penalties. Insight (WIS-based) is also strong since WIS is your secondary ability.',
  },
};
