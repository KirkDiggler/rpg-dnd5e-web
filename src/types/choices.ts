import type { ChoiceCategory } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  FightingStyle,
  Language,
  Skill,
  Spell,
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

/**
 * Spells picked at creation — cantrips and levelled spells alike.
 *
 * ONE TYPE, NOT TWO. Cantrips and spells arrive as two requirements with two
 * categories and two counts, and they are answered the same way: a list of
 * `Spell` enums against a choice id. The category rides on the choice so the
 * converter can send back the one the server asked with, rather than a client
 * table deciding which requirement was "the cantrip one".
 *
 * THESE ARE KNOWN SPELLS AND NOTHING ELSE. No slot is spent and nothing is
 * cast from them in this slice; they land on the sheet as refs.
 */
export interface SpellChoice {
  choiceId: string;
  /** `CHOICE_CATEGORY_CANTRIPS` or `CHOICE_CATEGORY_SPELLS`, from the server. */
  category: ChoiceCategory;
  spells: Spell[];
}

export interface ExpertiseChoice {
  choiceId: string;
  skills: Skill[];
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
  proficiencies?: string[]; // Other proficiency choices (weapons, armor)
  /** Cantrip and spell requirements, each carrying the category it came from. */
  spells?: SpellChoice[];
}

export interface BackgroundModalChoices {
  equipment?: EquipmentChoice[];
  tools?: ToolChoice[];
}
