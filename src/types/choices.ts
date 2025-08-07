import {
  Language,
  Skill,
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

export interface EquipmentChoice {
  choiceId: string;
  items: string[]; // Equipment IDs stay as strings
}

export interface FeatureChoice {
  choiceId: string;
  featureId: string;
  selection: string;
}

// Combined choices for a character
export interface CharacterChoices {
  skills: SkillChoice[];
  languages: LanguageChoice[];
  equipment: EquipmentChoice[];
  features: FeatureChoice[];
}

// For race/class modals that return partial choices
export interface RaceModalChoices {
  languages?: LanguageChoice[];
  skills?: SkillChoice[];
  proficiencies?: string[]; // Other proficiencies like tools
}

export interface ClassModalChoices {
  skills?: SkillChoice[];
  equipment?: EquipmentChoice[];
  features?: FeatureChoice[];
  proficiencies?: string[]; // Tool and other proficiency choices
}
