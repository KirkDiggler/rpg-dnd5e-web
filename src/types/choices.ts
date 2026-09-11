import {
  FightingStyle,
  Language,
  Skill,
  Tool,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

/**
 * Structured choice types that use enums directly.
 * No string conversions needed.
 */

export interface SkillChoice {
  choiceId: string;
  skills: Skill[];
}

export interface LanguageChoice {
  choiceId: string;
  languages: Language[];
}

export interface ToolChoice {
  choiceId: string;
  tools: Tool[];
}

export interface EquipmentChoice {
  choiceId: string;
  bundleId: string; // Which bundle was selected
  categorySelections: Array<{
    categoryIndex: number;
    equipmentIds: string[]; // IDs of equipment selected from this category
  }>;
  /**
   * True when reconstructing this choice from persisted wire data found
   * items left over after the selected bundle's fixed items and every
   * declared category consumed their slice. That only happens when the
   * persisted shape doesn't match the declared choice (stale bundle,
   * schema drift, corruption) — never a legitimately-complete choice.
   * Absent/false for choices built directly from UI interaction.
   */
  hasUnconsumedItems?: boolean;
}

export interface FeatureChoice {
  choiceId: string;
  featureId: string;
  selection: FightingStyle;
}

export interface ExpertiseChoice {
  choiceId: string;
  skills: Skill[];
}

/**
 * The cantrips a class chose at creation, as `dnd5e:spells:<id>` refs.
 *
 * REFS, NOT `Spell` ENUM VALUES. The enum is deprecated on both choice fields
 * and cannot name a spell the catalog learned after it was generated (design
 * rpg-project#405, R8), so the client neither reads nor writes it. The toolkit
 * refuses an unknown ref at compile, which is where that check belongs.
 */
export interface CantripChoice {
  choiceId: string;
  spellRefs: string[];
}

/** A provider-declared levelled spell choice, using the same ref shape. */
export interface SpellChoice {
  choiceId: string;
  spellRefs: string[];
}

export interface TraitChoice {
  choiceId: string;
  traits: string[];
}

// Combined choices for a character
export interface CharacterChoices {
  skills: SkillChoice[];
  languages: LanguageChoice[];
  tools: ToolChoice[];
  equipment: EquipmentChoice[];
  features: FeatureChoice[];
  expertise: ExpertiseChoice[];
  traits: TraitChoice[];
  cantrips: CantripChoice[];
  spells: SpellChoice[];
}

// For race/class modals that return partial choices
export interface RaceModalChoices {
  languages?: LanguageChoice[];
  skills?: SkillChoice[];
  tools?: ToolChoice[];
  expertise?: ExpertiseChoice[];
  traits?: TraitChoice[];
  proficiencies?: string[]; // Other proficiencies
}

export interface ClassModalChoices {
  skills?: SkillChoice[];
  languages?: LanguageChoice[]; // Language choices for subclasses like Knowledge Domain
  tools?: ToolChoice[]; // Tool proficiency choices (Monk, Bard, etc.)
  equipment?: EquipmentChoice[];
  features?: FeatureChoice[];
  expertise?: ExpertiseChoice[];
  traits?: TraitChoice[];
  cantrips?: CantripChoice[]; // Cantrip choices (Bard, and every caster after)
  spells?: SpellChoice[]; // Provider-declared levelled spell choices
  proficiencies?: string[]; // Other proficiency choices (weapons, armor)
}

export interface BackgroundModalChoices {
  equipment?: EquipmentChoice[];
  tools?: ToolChoice[];
}
