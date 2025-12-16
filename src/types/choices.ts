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
}

export interface FeatureChoice {
  choiceId: string;
  featureId: string;
  selection: FightingStyle;
}

export interface ExpertiseChoice {
  choiceId: string;
  skills: string[];
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
  proficiencies?: string[]; // Other proficiency choices (weapons, armor)
}

export interface BackgroundModalChoices {
  [choiceId: string]: {
    category: import('@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb').ChoiceCategory;
    selected: unknown;
  };
}
