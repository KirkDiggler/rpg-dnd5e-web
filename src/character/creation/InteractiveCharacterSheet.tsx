import type { Step } from '@/components/ProgressTracker';
import { ProgressTracker } from '@/components/ProgressTracker';
import type {
  ClassInfo,
  RaceInfo,
  SubclassInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type { ChoiceData } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  ChoiceCategory,
  ChoiceSource,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  FightingStyle,
  Language,
  Skill,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ClassModalChoices, RaceModalChoices } from '../../types/choices';
import {
  convertEquipmentChoiceToProto,
  convertExpertiseChoiceToProto,
  convertFeatureChoiceToProto,
  convertLanguageChoiceToProto,
  convertSkillChoiceToProto,
  convertToolChoiceToProto,
  convertTraitChoiceToProto,
} from '../../utils/choiceConverter';
import {
  getArmorProficiencyDisplay,
  getSavingThrowDisplay,
  getSkillDisplay,
  getWeaponProficiencyDisplay,
} from '../../utils/enumDisplay';
import { BackgroundSelectionModal } from './BackgroundSelectionModal';
import { ClassSelectionModal } from './ClassSelectionModal';
import { SpellInfoDisplay } from './components/SpellInfoDisplay';
import { RaceSelectionModal } from './RaceSelectionModal';
import { AbilityScoresSectionV2 } from './sections/AbilityScoresSectionV2';
import { SpellSelectionModal } from './SpellSelectionModal';
import { useCharacterDraft } from './useCharacterDraft';

interface InteractiveCharacterSheetProps {
  onComplete: () => void;
  onCancel: () => void;
}

interface CharacterChoices {
  classChoices?: ClassModalChoices;
  raceChoices?: RaceModalChoices;
  [key: string]: unknown; // Allow other choice types
}

// Helper to convert Language enum to display name
// Constants (removed unused EQUIPMENT_FILTER_ITEMS)

// Helper Functions
function isClassInfo(info: ClassInfo | SubclassInfo | null): info is ClassInfo {
  return info != null && info.$typeName === 'dnd5e.api.v1alpha1.ClassInfo';
}

function getLanguageDisplayName(languageEnum: Language): string {
  const languageNames: Record<Language, string> = {
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
  return languageNames[languageEnum] || 'Unknown';
}

// Helper function to format and group proficiencies (removed - was unused)

// Helper function to get extra languages
function getExtraLanguages(
  allLanguages: Set<string>,
  baseLanguages: Language[]
): string[] {
  return Array.from(allLanguages)
    .filter((lang) => {
      // Filter out objects (stringified ChoiceSubmission)
      if (typeof lang === 'string' && lang.includes('"$typeName"'))
        return false;

      // Filter out UNSPECIFIED
      if (lang.toLowerCase() === 'unspecified') return false;

      // Filter out base languages that come with race
      return !baseLanguages
        .map((l) => getLanguageDisplayName(l).toLowerCase())
        .includes(lang.toLowerCase());
    })
    .map((lang) => {
      // Clean up language names
      return lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase();
    });
}

// Helper function to get tool proficiencies
function getToolProficiencies(allProficiencies: Set<string>): string[] {
  return Array.from(allProficiencies)
    .filter((prof) => {
      // Look for tool proficiencies (either prefixed or containing tool-related keywords)
      if (prof.toLowerCase().startsWith('tool:')) return true;
      if (prof.includes("'s Tools")) return true;
      if (prof.includes("'s Supplies")) return true;
      if (prof.includes(' Utensils')) return true;
      return false;
    })
    .map((prof) => {
      // Clean up the display name
      if (prof.toLowerCase().startsWith('tool:')) {
        // Convert back from lowercase format to proper display
        const name = prof.substring(5);
        return name
          .split(' ')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
      return prof;
    })
    .filter(Boolean);
}

// Simple context for now - we'll make it more sophisticated later
const CharacterContext = {
  selectedRace: null as RaceInfo | null,
  selectedClass: null as ClassInfo | SubclassInfo | null,
  baseAbilityScores: {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  },
  choices: {} as CharacterChoices, // Track all choices made
  equipmentChoices: {} as Record<number, string>, // Track equipment selections
};

export function InteractiveCharacterSheet({
  onComplete,
  onCancel,
}: InteractiveCharacterSheetProps) {
  const [character, setCharacter] = useState(CharacterContext);
  const [isRaceModalOpen, setIsRaceModalOpen] = useState(false);
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [isSpellModalOpen, setIsSpellModalOpen] = useState(false);
  const [isBackgroundModalOpen, setIsBackgroundModalOpen] = useState(false);
  const [showingBackgroundDetails, setShowingBackgroundDetails] =
    useState(false);
  const [selectedSpells, setSelectedSpells] = useState<string[]>([]);
  const draft = useCharacterDraft();
  const { setBackground } = draft;

  // Convert draft choices to modal format
  const structuredClassChoices = useMemo(() => {
    const choices: ClassModalChoices = {
      skills: [],
      languages: [],
      equipment: [],
      features: [],
      expertise: [],
      traits: [],
      proficiencies: [],
    };

    // Parse draft.classChoices which is now ChoiceSubmission[]
    (draft.classChoices || []).forEach((choice) => {
      if (
        choice.category === ChoiceCategory.EQUIPMENT &&
        choice.selection?.case === 'equipment'
      ) {
        // TODO: Convert equipment selection to new EquipmentChoice structure
        // For now, create a minimal valid EquipmentChoice
        choices.equipment?.push({
          choiceId: choice.choiceId,
          bundleId: '',
          categorySelections: [],
        });
      } else if (
        choice.category === ChoiceCategory.SKILLS &&
        choice.selection?.case === 'skills'
      ) {
        choices.skills?.push({
          choiceId: choice.choiceId,
          skills: choice.selection.value.skills || [],
        });
      } else if (
        choice.category === ChoiceCategory.LANGUAGES &&
        choice.selection?.case === 'languages'
      ) {
        choices.languages?.push({
          choiceId: choice.choiceId,
          languages: choice.selection.value.languages || [],
        });
      } else if (
        choice.category === ChoiceCategory.FIGHTING_STYLE &&
        choice.selection?.case === 'fightingStyle'
      ) {
        // Fighting styles are handled as features
        choices.features?.push({
          choiceId: choice.choiceId,
          featureId: String(choice.selection.value.style || ''),
          selection: FightingStyle[choice.selection.value.style] || '',
        });
      }
      // TODO: Handle other choice types as needed
    });

    return choices;
  }, [draft.classChoices]);

  // Sync draft state with local character state
  useEffect(() => {
    if (draft.draft) {
      setCharacter((prev) => ({
        ...prev,
        // Update ability scores if they exist in the draft
        baseAbilityScores:
          draft.draft?.baseAbilityScores || prev.baseAbilityScores,
      }));
    }
  }, [draft.draft]);

  // Sync equipment choices from draft
  useEffect(() => {
    if (draft.draft?.choices) {
      // Find equipment choices in the draft choices array
      const equipmentChoices: Record<number, string> = {};
      let equipmentIndex = 0;

      draft.draft.choices.forEach((choice) => {
        // Check if this is an equipment choice (category === 1)
        if (
          choice.category === ChoiceCategory.EQUIPMENT &&
          choice.selection.case === 'equipment'
        ) {
          // Store the equipment selection using an index
          equipmentChoices[equipmentIndex++] =
            choice.selection.value.items.join(',');
        }
      });

      if (Object.keys(equipmentChoices).length > 0) {
        setCharacter((prev) => ({
          ...prev,
          equipmentChoices,
        }));
      }
    }
  }, [draft.draft]);

  // Sync draft data with local character state
  useEffect(() => {
    if (draft.raceInfo) {
      setCharacter((prev) => ({
        ...prev,
        selectedRace: draft.raceInfo,
      }));
    }
    if (draft.classInfo) {
      setCharacter((prev) => ({
        ...prev,
        selectedClass: draft.classInfo,
      }));
    }
    // Load ability scores from draft
    if (draft.draft?.baseAbilityScores) {
      setCharacter((prev) => ({
        ...prev,
        baseAbilityScores: {
          strength: draft.draft?.baseAbilityScores?.strength || 0,
          dexterity: draft.draft?.baseAbilityScores?.dexterity || 0,
          constitution: draft.draft?.baseAbilityScores?.constitution || 0,
          intelligence: draft.draft?.baseAbilityScores?.intelligence || 0,
          wisdom: draft.draft?.baseAbilityScores?.wisdom || 0,
          charisma: draft.draft?.baseAbilityScores?.charisma || 0,
        },
      }));
    }

    // Load choices from draft context
    if (draft.raceChoices || draft.classChoices) {
      // Convert ChoiceSubmission arrays to structured format for the UI
      const structuredClassChoices: ClassModalChoices = {
        skills: [],
        equipment: [],
        features: [],
        proficiencies: [],
      };

      // Parse draft.classChoices which is now ChoiceSubmission[]
      (draft.classChoices || []).forEach((choice) => {
        if (
          choice.category === ChoiceCategory.EQUIPMENT &&
          choice.selection?.case === 'equipment'
        ) {
          structuredClassChoices.equipment?.push({
            choiceId: choice.choiceId,
            bundleId: '',
            categorySelections: [],
          });
        } else if (
          choice.category === ChoiceCategory.SKILLS &&
          choice.selection?.case === 'skills'
        ) {
          structuredClassChoices.skills?.push({
            choiceId: choice.choiceId,
            skills: choice.selection.value.skills || [],
          });
        }
        // TODO: Handle other choice types as needed
      });

      setCharacter((prev) => ({
        ...prev,
        choices: {
          ...prev.choices,
          classChoices: structuredClassChoices,
        },
      }));
    }
  }, [
    draft.raceInfo,
    draft.classInfo,
    draft.classInfo?.name,
    draft.draft?.baseAbilityScores,
    draft.raceChoices,
    draft.classChoices,
  ]);

  // Validation function to check if character is ready for finalization
  const isCharacterValid = useCallback(() => {
    // Check required fields
    const hasName = Boolean(draft.draft?.name?.trim());
    const hasRace = Boolean(draft.raceInfo);
    const hasClass = Boolean(draft.classInfo);
    const hasBackground = Boolean(draft.backgroundInfo);

    // Check if all ability scores are assigned (all greater than 0)
    // Check baseAbilityScores (new field name in proto)
    const scores = draft.draft?.baseAbilityScores;
    const hasAbilityScores =
      scores &&
      scores.strength > 0 &&
      scores.dexterity > 0 &&
      scores.constitution > 0 &&
      scores.intelligence > 0 &&
      scores.wisdom > 0 &&
      scores.charisma > 0;

    return hasName && hasRace && hasClass && hasBackground && hasAbilityScores;
  }, [draft]);

  // Handle finalize button click
  const handleFinalize = useCallback(async () => {
    if (!isCharacterValid()) return;

    try {
      await draft.finalizeDraft();
      // For now, just call onComplete
      // In the future, this could navigate to the character sheet with the returned ID
      onComplete();
    } catch (error) {
      console.error('Failed to finalize character:', error);
      // Error is already handled by the context, just log it here
    }
  }, [isCharacterValid, draft, onComplete]);

  // Compute character creation steps and their status
  const steps = useMemo<Step[]>(() => {
    const hasName = Boolean(draft.draft?.name?.trim());
    const hasRace = Boolean(draft.raceInfo);
    const hasClass = Boolean(draft.classInfo);
    const hasBackground = Boolean(draft.backgroundInfo);

    // Check if all ability scores are assigned (all non-zero)
    const scores = draft.draft?.baseAbilityScores;
    const hasAbilityScores =
      scores &&
      scores.strength > 0 &&
      scores.dexterity > 0 &&
      scores.constitution > 0 &&
      scores.intelligence > 0 &&
      scores.wisdom > 0 &&
      scores.charisma > 0;

    // Build steps array - only the actual decisions
    const allSteps: Step[] = [];

    // Only show name step if it's not filled
    if (!hasName) {
      allSteps.push({
        id: 'name',
        label: 'Name',
        status: 'current',
      });
    }

    allSteps.push(
      {
        id: 'race',
        label: 'Race',
        status: hasRace ? 'completed' : !hasName ? 'upcoming' : 'current',
      },
      {
        id: 'class',
        label: 'Class',
        status: hasClass ? 'completed' : hasRace ? 'current' : 'upcoming',
      },
      {
        id: 'background',
        label: 'Background',
        status: hasBackground ? 'completed' : hasClass ? 'current' : 'upcoming',
      },
      {
        id: 'ability-scores',
        label: 'Abilities',
        status: hasAbilityScores
          ? 'completed'
          : hasBackground
            ? 'current'
            : 'upcoming',
      }
    );

    return allSteps;
  }, [
    draft.draft?.name,
    draft.raceInfo,
    draft.classInfo,
    draft.backgroundInfo,
    draft.draft?.baseAbilityScores,
  ]);

  // Helper function to get race emoji
  const getRaceEmoji = (raceName: string) => {
    const raceEmojiMap: Record<string, string> = {
      Human: '👨',
      Elf: '🧝',
      Dwarf: '🧔',
      Halfling: '🧙',
      Dragonborn: '🐉',
      Gnome: '🧞',
      'Half-Elf': '🧝‍♂️',
      'Half-Orc': '🗡️',
      Tiefling: '😈',
    };
    return raceEmojiMap[raceName] || '🧝';
  };

  // Helper function to get class emoji
  const getClassEmoji = (className: string) => {
    const classEmojiMap: Record<string, string> = {
      Barbarian: '🪓',
      Bard: '🎵',
      Cleric: '⛪',
      Druid: '🌿',
      Fighter: '⚔️',
      Monk: '👊',
      Paladin: '🛡️',
      Ranger: '🏹',
      Rogue: '🗡️',
      Sorcerer: '✨',
      Warlock: '👹',
      Wizard: '🧙‍♂️',
    };
    return classEmojiMap[className] || '⚔️';
  };

  // Helper function to get background emoji
  const getBackgroundEmoji = (backgroundName: string) => {
    const backgroundEmojiMap: Record<string, string> = {
      Acolyte: '🙏',
      Criminal: '🗡️',
      'Folk Hero': '🛡️',
      Noble: '👑',
      Sage: '📚',
      Soldier: '⚔️',
      Hermit: '🧙',
      Entertainer: '🎭',
      'Guild Artisan': '🔨',
      Outlander: '🏕️',
      Sailor: '⚓',
      Urchin: '🥷',
    };
    return backgroundEmojiMap[backgroundName] || '📜';
  };

  // Helper function to format equipment names
  const formatEquipmentName = (item: string): string | null => {
    // Handle bundle format: "bundle_0:0:EQUIPMENT_WARHAMMER"
    if (item.includes('bundle_') && item.includes(':')) {
      const parts = item.split(':');
      const lastPart = parts[parts.length - 1];
      if (lastPart.startsWith('EQUIPMENT_')) {
        return lastPart
          .replace('EQUIPMENT_', '')
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, (l) => l.toUpperCase());
      }
      // For nested selections like "0:Longsword"
      if (parts.length >= 2 && !parts[1].match(/^\d+$/)) {
        return parts[1];
      }
    }

    // Handle simple bundle references - this should not happen with the new implementation
    // but handle it gracefully for backward compatibility
    if (item.match(/^bundle_\d+$/)) {
      console.warn(
        'Found unexpanded bundle reference:',
        item,
        '- this should not happen with the new implementation'
      );
      return `Equipment Bundle ${item.replace('bundle_', '#')} (not expanded)`;
    }

    // Handle kebab-case items
    if (item.includes('-')) {
      return item
        .split('-')
        .map((word) => {
          // Special cases
          if (word === 's') return "'s";
          if (word === 'pack') return 'Pack';
          return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
    }

    // Handle CONSTANT_CASE
    if (item === item.toUpperCase()) {
      return item
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (l) => l.toUpperCase());
    }

    return item;
  };

  // Helper function to parse equipment choices into readable format
  const getSelectedEquipment = () => {
    const equipment: string[] = [];

    // Get equipment choices from draft.classChoices
    const equipmentChoices = draft.classChoices.filter(
      (choice) =>
        choice.category === ChoiceCategory.EQUIPMENT &&
        choice.selection?.case === 'equipment'
    );

    equipmentChoices.forEach((choice) => {
      if (choice.selection?.case !== 'equipment') return;
      const selections = choice.selection.value.items || [];
      if (selections && selections.length > 0) {
        // Add the selected equipment items
        selections.forEach((selection) => {
          // selections is always EquipmentSelectionItem[] from the proto
          if (selection.equipment) {
            // Extract the equipment identifier from the oneof
            if (selection.equipment.case === 'otherEquipmentId') {
              // String ID for custom equipment
              equipment.push(selection.equipment.value);
            } else if (selection.equipment.case) {
              // It's a specific equipment type (weapon, armor, etc.)
              // Convert enum value to string - the value is an enum number
              const enumName = selection.equipment.case.toUpperCase();
              const enumValue = selection.equipment.value;
              // For now, use the case name as identifier
              // TODO: Convert enum value to actual equipment name
              equipment.push(`${enumName}_${enumValue}`);
            }
          }
        });
      }
    });

    return equipment;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5 p-4">
      {/* Progress Tracker */}
      <div className="max-w-7xl mx-auto mb-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="game-card p-4"
          style={{
            background: 'var(--card-bg)',
            border: '2px solid var(--border-primary)',
            borderRadius: '0.75rem',
          }}
        >
          <div className="overflow-x-auto">
            <ProgressTracker steps={steps} orientation="horizontal" />
          </div>
          {draft.draft?.progress?.completionPercentage !== undefined && (
            <div className="mt-3 text-center">
              <span
                className="text-sm font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                {draft.draft.progress.completionPercentage}% Complete
              </span>
            </div>
          )}
        </motion.div>
      </div>

      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="game-card p-8 space-y-12"
          style={{
            background: 'var(--card-bg)',
            border: '3px solid var(--border-primary)',
            borderRadius: '1rem',
            boxShadow: 'var(--shadow-modal)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1
                className="text-3xl font-bold font-serif"
                style={{ color: 'var(--text-primary)' }}
              >
                Interactive Character Sheet
              </h1>
              <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
                Click on sections to make choices
              </p>
            </div>
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border transition-colors"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            >
              Cancel
            </button>
          </div>

          {/* Character Name */}
          <div className="space-y-4">
            <h2
              className="text-2xl font-bold font-serif"
              style={{ color: 'var(--text-primary)' }}
            >
              Character Name
            </h2>
            <div className="relative">
              <input
                type="text"
                value={draft.draft?.name || ''}
                onChange={(e) => draft.setName(e.target.value)}
                placeholder="Enter your character's name..."
                className="w-full p-4 text-xl font-serif rounded-lg border-2 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: draft.draft?.name
                    ? 'var(--accent-primary)'
                    : 'var(--border-primary)',
                  color: 'var(--text-primary)',
                  fontFamily: 'Cinzel, serif',
                  textAlign: 'center',
                  letterSpacing: '0.05em',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                }}
              />
              <div
                className="absolute inset-0 pointer-events-none rounded-lg"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(0,0,0,0.05) 100%)',
                }}
              />
            </div>
          </div>

          {/* Race & Class - Side by Side with details below */}
          <div className="space-y-4">
            <h2
              className="text-2xl font-bold font-serif"
              style={{ color: 'var(--text-primary)' }}
            >
              Character Identity
            </h2>
            <div className="grid grid-cols-3 gap-4">
              {/* Race Selection */}
              <div className="space-y-4">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="cursor-pointer p-4 rounded-lg border-2 border-dashed transition-all hover:border-solid"
                  style={{
                    backgroundColor: character.selectedRace
                      ? 'var(--card-bg)'
                      : 'var(--bg-secondary)',
                    borderColor: character.selectedRace
                      ? 'var(--accent-primary)'
                      : 'var(--border-primary)',
                    cursor:
                      !draft.draftId || draft.loading || draft.saving
                        ? 'not-allowed'
                        : 'pointer',
                    opacity:
                      !draft.draftId || draft.loading || draft.saving ? 0.6 : 1,
                  }}
                  onClick={() =>
                    !draft.loading &&
                    !draft.saving &&
                    draft.draftId &&
                    setIsRaceModalOpen(true)
                  }
                >
                  <div className="text-center space-y-2">
                    <div className="text-3xl">
                      {getRaceEmoji(character.selectedRace?.name || '')}
                    </div>
                    <div>
                      <h3
                        className="text-lg font-bold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {character.selectedRace?.name || 'Choose Race'}
                      </h3>
                      <p
                        className="text-xs"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {character.selectedRace
                          ? 'Click to change'
                          : 'Select heritage'}
                      </p>
                    </div>
                  </div>
                </motion.div>

                {/* Compact info sections below race */}
                {character.selectedRace && (
                  <div className="space-y-2">
                    {/* Race Proficiencies - clickable section */}
                    <motion.div
                      className="cursor-pointer transition-all"
                      style={{
                        padding: '12px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '6px',
                        border: '1px solid var(--border-primary)',
                        cursor:
                          !draft.draftId || draft.loading || draft.saving
                            ? 'not-allowed'
                            : 'pointer',
                        opacity:
                          !draft.draftId || draft.loading || draft.saving
                            ? 0.6
                            : 1,
                      }}
                      whileHover={{ scale: 1.01 }}
                      onClick={() =>
                        !draft.loading &&
                        !draft.saving &&
                        draft.draftId &&
                        setIsRaceModalOpen(true)
                      }
                    >
                      <div className="flex items-center justify-between">
                        <h4
                          className="text-xs font-semibold"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          Race Traits
                        </h4>
                        <span
                          className="text-xs"
                          style={{ color: 'var(--accent-primary)' }}
                        >
                          Click to modify →
                        </span>
                      </div>
                      {draft.allProficiencies.size > 0 ||
                      draft.allLanguages.size > 0 ? (
                        <div className="mt-2 text-xs space-y-1">
                          {/* RaceInfo no longer has proficiencies field - they come through choices now */}
                          {character.selectedRace.languages &&
                            character.selectedRace.languages.length > 0 && (
                              <div style={{ color: 'var(--text-primary)' }}>
                                <span
                                  style={{
                                    color: 'var(--text-primary)',
                                    opacity: 0.7,
                                  }}
                                >
                                  Languages:
                                </span>{' '}
                                {character.selectedRace.languages
                                  .filter(
                                    (lang) => lang !== Language.UNSPECIFIED
                                  )
                                  .map((lang) => getLanguageDisplayName(lang))
                                  .join(', ')}
                              </div>
                            )}
                          {/* RaceInfo no longer has proficiencies field - they come through choices now */}
                          {/* Display resolved languages from race choices */}
                          {(() => {
                            const extraLanguages = getExtraLanguages(
                              draft.allLanguages,
                              character.selectedRace?.languages || []
                            );

                            // Only show if there are actual extra languages
                            if (extraLanguages.length > 0) {
                              return (
                                <div style={{ color: 'var(--text-primary)' }}>
                                  <span
                                    style={{
                                      color: 'var(--text-muted)',
                                      fontSize: '11px',
                                      opacity: 0.7,
                                    }}
                                  >
                                    Extra Languages:
                                  </span>{' '}
                                  {extraLanguages.join(', ')}
                                </div>
                              );
                            }
                            return null;
                          })()}
                          {/* Display chosen tool proficiencies */}
                          {(() => {
                            const toolProficiencies = getToolProficiencies(
                              draft.allProficiencies
                            );

                            // Only show if there are tool proficiencies
                            if (toolProficiencies.length > 0) {
                              return (
                                <div style={{ color: 'var(--text-primary)' }}>
                                  <span
                                    style={{
                                      color: 'var(--text-muted)',
                                      fontSize: '11px',
                                      opacity: 0.7,
                                    }}
                                  >
                                    Tool Proficiencies:
                                  </span>{' '}
                                  {toolProficiencies.join(', ')}
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      ) : (
                        <p
                          className="mt-2 text-xs"
                          style={{
                            color: 'var(--text-secondary)',
                            opacity: 0.6,
                          }}
                        >
                          No special traits
                        </p>
                      )}
                    </motion.div>
                  </div>
                )}
              </div>

              {/* Class Selection */}
              <div className="space-y-4">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="cursor-pointer p-4 rounded-lg border-2 border-dashed transition-all hover:border-solid"
                  style={{
                    backgroundColor: character.selectedClass
                      ? 'var(--card-bg)'
                      : 'var(--bg-secondary)',
                    borderColor: character.selectedClass
                      ? 'var(--accent-primary)'
                      : 'var(--border-primary)',
                    cursor:
                      !draft.draftId || draft.loading || draft.saving
                        ? 'not-allowed'
                        : 'pointer',
                    opacity:
                      !draft.draftId || draft.loading || draft.saving ? 0.6 : 1,
                  }}
                  onClick={() =>
                    !draft.loading &&
                    !draft.saving &&
                    draft.draftId &&
                    setIsClassModalOpen(true)
                  }
                >
                  <div className="text-center space-y-2">
                    <div className="text-3xl">
                      {getClassEmoji(character.selectedClass?.name || '')}
                    </div>
                    <div>
                      <h3
                        className="text-lg font-bold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {character.selectedClass?.name || 'Choose Class'}
                      </h3>
                      <p
                        className="text-xs"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {character.selectedClass
                          ? 'Click to change'
                          : 'Select profession'}
                      </p>
                    </div>
                  </div>
                </motion.div>

                {/* Compact info sections below class */}
                {character.selectedClass && (
                  <div className="space-y-2">
                    {/* Class Proficiencies - clickable section */}
                    <motion.div
                      className="cursor-pointer transition-all"
                      style={{
                        padding: '12px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '6px',
                        border: '1px solid var(--border-primary)',
                        cursor:
                          !draft.draftId || draft.loading || draft.saving
                            ? 'not-allowed'
                            : 'pointer',
                        opacity:
                          !draft.draftId || draft.loading || draft.saving
                            ? 0.6
                            : 1,
                      }}
                      whileHover={{ scale: 1.01 }}
                      onClick={() =>
                        !draft.loading &&
                        !draft.saving &&
                        draft.draftId &&
                        setIsClassModalOpen(true)
                      }
                    >
                      <div className="flex items-center justify-between">
                        <h4
                          className="text-xs font-semibold"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          Class Features
                        </h4>
                        <span
                          className="text-xs"
                          style={{ color: 'var(--accent-primary)' }}
                        >
                          Click to modify →
                        </span>
                      </div>
                      <div className="mt-2 text-xs space-y-1">
                        {isClassInfo(character.selectedClass) &&
                          character.selectedClass.armorProficiencyCategories &&
                          character.selectedClass.armorProficiencyCategories
                            .length > 0 && (
                            <div style={{ color: 'var(--text-primary)' }}>
                              <span
                                style={{
                                  color: 'var(--text-primary)',
                                  opacity: 0.7,
                                }}
                              >
                                Armor:
                              </span>{' '}
                              {character.selectedClass.armorProficiencyCategories
                                .map((p) =>
                                  getArmorProficiencyDisplay(String(p))
                                )
                                .join(', ')}
                            </div>
                          )}
                        {isClassInfo(character.selectedClass) &&
                          character.selectedClass.weaponProficiencyCategories &&
                          character.selectedClass.weaponProficiencyCategories
                            .length > 0 && (
                            <div style={{ color: 'var(--text-primary)' }}>
                              <span
                                style={{
                                  color: 'var(--text-primary)',
                                  opacity: 0.7,
                                }}
                              >
                                Weapons:
                              </span>{' '}
                              {character.selectedClass.weaponProficiencyCategories
                                .slice(0, 3)
                                .map((p) =>
                                  getWeaponProficiencyDisplay(String(p))
                                )
                                .join(', ')}
                              {character.selectedClass
                                .weaponProficiencyCategories.length > 3 &&
                                '...'}
                            </div>
                          )}
                        {isClassInfo(character.selectedClass) &&
                          character.selectedClass.savingThrowProficiencies &&
                          character.selectedClass.savingThrowProficiencies
                            .length > 0 && (
                            <div style={{ color: 'var(--text-primary)' }}>
                              <span
                                style={{
                                  color: 'var(--text-primary)',
                                  opacity: 0.7,
                                }}
                              >
                                Saves:
                              </span>{' '}
                              {character.selectedClass.savingThrowProficiencies
                                .map((save) => getSavingThrowDisplay(save))
                                .join(', ')}
                            </div>
                          )}
                        {/* Display chosen skills from draft.classChoices */}
                        {(() => {
                          // Find skill choices for the current class
                          const skillChoices = draft.classChoices.filter(
                            (choice) =>
                              choice.category === ChoiceCategory.SKILLS &&
                              choice.selection?.case === 'skills'
                          );

                          const allSkillSelections = skillChoices.flatMap(
                            (choice) => {
                              if (choice.selection?.case === 'skills') {
                                return choice.selection.value.skills || [];
                              }
                              return [];
                            }
                          );

                          if (allSkillSelections.length > 0) {
                            return (
                              <div style={{ color: 'var(--text-primary)' }}>
                                <span
                                  style={{
                                    color: 'var(--text-primary)',
                                    opacity: 0.7,
                                  }}
                                >
                                  Chosen Skills:
                                </span>{' '}
                                {allSkillSelections
                                  .map((skillEnum) => {
                                    // Convert enum to display name
                                    return (
                                      Skill[skillEnum] || `Skill ${skillEnum}`
                                    );
                                  })
                                  .join(', ')}
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {/* Display Class Features (like Fighting Style) */}
                        {(() => {
                          const featureChoices =
                            (isClassInfo(character.selectedClass)
                              ? character.selectedClass.choices?.filter(
                                  (choice) =>
                                    choice.choiceType ===
                                    ChoiceCategory.FIGHTING_STYLE
                                )
                              : []) || [];

                          return featureChoices.map((choice) => {
                            const choiceData = draft.classChoices.find(
                              (c) => c.choiceId === choice.id
                            );
                            if (!choiceData || !choiceData.selection)
                              return null;

                            // Extract the display name from the selection
                            let displayValue = 'Selected';
                            if (choiceData.selection) {
                              // Check if it's a fighting style selection
                              if (
                                choiceData.selection.case === 'fightingStyle'
                              ) {
                                // It's a FightingStyle enum value
                                const styleValue =
                                  choiceData.selection.value.style;
                                displayValue =
                                  FightingStyle[styleValue] ||
                                  `Style ${styleValue}`;
                                // Format the name properly (DUELING -> Dueling)
                                displayValue = displayValue
                                  .split('_')
                                  .map(
                                    (word: string) =>
                                      word.charAt(0).toUpperCase() +
                                      word.slice(1).toLowerCase()
                                  )
                                  .join(' ');
                              }
                            }

                            return (
                              <div
                                key={choice.id}
                                style={{ color: 'var(--text-primary)' }}
                              >
                                <span
                                  style={{
                                    color: 'var(--text-primary)',
                                    opacity: 0.7,
                                  }}
                                >
                                  {choice.description}:
                                </span>{' '}
                                {displayValue}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </motion.div>

                    {/* Inventory - compact version */}
                    <motion.div
                      style={{
                        padding: '12px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '6px',
                        border: '1px solid var(--border-primary)',
                      }}
                    >
                      <h4
                        className="text-xs font-semibold mb-2"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Starting Equipment
                      </h4>
                      {(() => {
                        const selectedEquipment = getSelectedEquipment();
                        const startingEquipment: string[] = []; // startingEquipment field no longer exists in ClassInfo
                        const allEquipment = [
                          ...startingEquipment,
                          ...selectedEquipment,
                        ];

                        if (allEquipment.length > 0) {
                          return (
                            <div className="text-xs space-y-1">
                              {/* Show starting equipment first */}
                              {startingEquipment
                                .slice(0, 2)
                                .map((item, idx) => (
                                  <div
                                    key={`starting-${idx}`}
                                    style={{ color: 'var(--text-primary)' }}
                                  >
                                    • {item}
                                  </div>
                                ))}

                              {/* Show selected equipment */}
                              {selectedEquipment
                                .map((item: string) =>
                                  formatEquipmentName(item)
                                )
                                .filter((name) => name !== null)
                                .map((name: string | null, idx: number) => (
                                  <div
                                    key={`selected-${idx}`}
                                    style={{ color: 'var(--text-primary)' }}
                                  >
                                    • {name}
                                    <span
                                      style={{
                                        color: 'var(--accent-primary)',
                                        fontSize: '10px',
                                        marginLeft: '4px',
                                      }}
                                    >
                                      (chosen)
                                    </span>
                                  </div>
                                ))}

                              {/* Show remaining count if there are more items */}
                              {allEquipment.length >
                                2 + selectedEquipment.length && (
                                <div style={{ color: 'var(--text-muted)' }}>
                                  +
                                  {allEquipment.length -
                                    2 -
                                    selectedEquipment.length}{' '}
                                  more items...
                                </div>
                              )}
                            </div>
                          );
                        } else {
                          return (
                            <p
                              className="text-xs"
                              style={{
                                color: 'var(--text-secondary)',
                                opacity: 0.6,
                              }}
                            >
                              No equipment data
                            </p>
                          );
                        }
                      })()}
                    </motion.div>

                    {/* Spell Information - display if class has spellcasting */}
                    {isClassInfo(character.selectedClass) &&
                      character.selectedClass.spellcasting && (
                        <motion.div
                          style={{
                            padding: '12px',
                            backgroundColor: 'var(--bg-secondary)',
                            borderRadius: '6px',
                            border: '1px solid var(--border-primary)',
                          }}
                        >
                          <SpellInfoDisplay
                            spellcastingInfo={
                              character.selectedClass.spellcasting
                            }
                            onSelectSpells={() => setIsSpellModalOpen(true)}
                          />
                        </motion.div>
                      )}
                  </div>
                )}
              </div>

              {/* Background Selection */}
              <div className="space-y-4">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="cursor-pointer p-4 rounded-lg border-2 border-dashed transition-all hover:border-solid"
                  style={{
                    backgroundColor: draft.backgroundInfo
                      ? 'var(--card-bg)'
                      : 'var(--bg-secondary)',
                    borderColor: draft.backgroundInfo
                      ? 'var(--accent-primary)'
                      : 'var(--border-primary)',
                    cursor:
                      !draft.draftId || draft.loading || draft.saving
                        ? 'not-allowed'
                        : 'pointer',
                    opacity:
                      !draft.draftId || draft.loading || draft.saving ? 0.6 : 1,
                  }}
                  onClick={() => {
                    if (!draft.loading && !draft.saving && draft.draftId) {
                      setIsBackgroundModalOpen(true);
                    }
                  }}
                >
                  <div className="text-center space-y-2">
                    <div className="text-3xl">
                      {getBackgroundEmoji(draft.backgroundInfo?.name || '')}
                    </div>
                    <div>
                      <h3
                        className="text-lg font-bold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {draft.backgroundInfo?.name || 'Choose Background'}
                      </h3>
                      <p
                        className="text-xs"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {draft.backgroundInfo
                          ? 'Click to change'
                          : 'Select background'}
                      </p>
                    </div>
                  </div>
                </motion.div>

                {/* Show background proficiencies if selected */}
                {draft.backgroundInfo && (
                  <div
                    className="rounded-lg p-3 border"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border-primary)',
                    }}
                  >
                    {/* Background Proficiencies - clickable section */}
                    <div
                      className="space-y-2 cursor-pointer"
                      onClick={() =>
                        setShowingBackgroundDetails(!showingBackgroundDetails)
                      }
                    >
                      <div className="flex items-center justify-between">
                        <h4
                          className="text-sm font-medium"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          Background Proficiencies
                        </h4>
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${
                            showingBackgroundDetails ? 'rotate-180' : ''
                          }`}
                          style={{ color: 'var(--text-muted)' }}
                        />
                      </div>
                    </div>

                    {/* Expandable Background Details */}
                    {showingBackgroundDetails && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-2 space-y-2"
                      >
                        {/* Display background proficiencies here */}
                        {draft.backgroundInfo.skillProficiencies?.length >
                          0 && (
                          <div className="flex flex-wrap gap-1">
                            <span
                              className="text-xs"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              Skills:
                            </span>
                            {draft.backgroundInfo.skillProficiencies.map(
                              (skill, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 text-xs rounded-full"
                                  style={{
                                    backgroundColor: 'var(--bg-primary)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--border-primary)',
                                  }}
                                >
                                  {getSkillDisplay(skill)}
                                </span>
                              )
                            )}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Ability Scores - Server Side Rolling */}
          <div className="space-y-4">
            <AbilityScoresSectionV2 />
          </div>

          {/* Character Summary */}
          {draft.draft?.name && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 rounded-lg border-2"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--accent-primary)',
              }}
            >
              <h3
                className="text-xl font-bold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Character Summary
              </h3>
              <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
                <span
                  className="font-bold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {draft.draft.name}
                </span>
                {character.selectedRace && `, a ${character.selectedRace.name}`}
                {character.selectedClass && ` ${character.selectedClass.name}`}
                {draft.draft.name && ', ready for adventure!'}
              </p>
            </motion.div>
          )}

          {/* Error Display */}
          {draft.error && (
            <div
              className="mb-4 p-3 rounded-lg border"
              style={{
                backgroundColor: 'var(--bg-danger)',
                borderColor: 'var(--border-danger)',
                color: 'var(--text-danger)',
              }}
            >
              <p className="text-sm font-medium">
                Failed to finalize character:
              </p>
              <p className="text-sm">{draft.error.message}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between items-center pt-4">
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {isCharacterValid()
                ? 'Your character is ready for adventure!'
                : 'Build your character by clicking sections above'}
            </div>

            <motion.button
              onClick={handleFinalize}
              disabled={!isCharacterValid() || draft.saving}
              whileHover={
                isCharacterValid() && !draft.saving ? { scale: 1.05 } : {}
              }
              whileTap={
                isCharacterValid() && !draft.saving ? { scale: 0.95 } : {}
              }
              className="px-8 py-3 text-lg font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor:
                  isCharacterValid() && !draft.saving
                    ? 'var(--accent-primary)'
                    : 'var(--bg-muted)',
                borderColor: 'var(--border-primary)',
                color:
                  isCharacterValid() && !draft.saving
                    ? 'var(--text-primary)'
                    : 'var(--text-muted)',
              }}
            >
              {draft.saving ? '⏳ Finalizing...' : '⚔️ Begin Adventure!'}
            </motion.button>
          </div>
        </motion.div>
      </div>

      {/* Race Selection Modal */}
      <RaceSelectionModal
        isOpen={isRaceModalOpen}
        currentRace={character.selectedRace?.name || draft.raceInfo?.name}
        existingProficiencies={draft.allProficiencies}
        existingLanguages={draft.allLanguages}
        onSelect={(race, choices) => {
          setCharacter((prev) => ({
            ...prev,
            selectedRace: race,
          }));

          // Convert choices to ChoiceData format for the API
          const choiceData: ChoiceData[] = [];

          // Convert language choices
          if (choices.languages) {
            choices.languages.forEach((langChoice) => {
              choiceData.push(
                convertLanguageChoiceToProto(langChoice, ChoiceSource.RACE)
              );
            });
          }

          // Convert skill choices if any
          if (choices.skills) {
            choices.skills.forEach((skillChoice) => {
              choiceData.push(
                convertSkillChoiceToProto(skillChoice, ChoiceSource.RACE)
              );
            });
          }

          // Convert tool choices if any
          if (choices.tools) {
            choices.tools.forEach((toolChoice) => {
              choiceData.push(
                convertToolChoiceToProto(toolChoice, ChoiceSource.RACE)
              );
            });
          }

          // Convert expertise choices if any
          if (choices.expertise) {
            choices.expertise.forEach((expertiseChoice) => {
              choiceData.push(
                convertExpertiseChoiceToProto(
                  expertiseChoice.choiceId,
                  expertiseChoice.skills,
                  ChoiceSource.RACE
                )
              );
            });
          }

          // Convert trait choices if any
          if (choices.traits) {
            choices.traits.forEach((traitChoice) => {
              choiceData.push(
                convertTraitChoiceToProto(
                  traitChoice.choiceId,
                  traitChoice.traits,
                  ChoiceSource.RACE
                )
              );
            });
          }

          // Set race with converted choices
          draft.setRace(race, choiceData);
        }}
        onClose={() => setIsRaceModalOpen(false)}
      />

      {/* Class Selection Modal */}
      <ClassSelectionModal
        isOpen={isClassModalOpen}
        currentClass={character.selectedClass?.name || draft.classInfo?.name}
        existingChoices={structuredClassChoices}
        onSelect={async (classData, choices) => {
          setCharacter((prev) => ({
            ...prev,
            selectedClass: classData,
            equipmentChoices: choices.equipment || {},
            choices: {
              ...prev.choices,
              classChoices: choices, // Store the full choices object including features
            },
          }));

          // Convert choices to ChoiceData format for the API
          const choiceData: ChoiceData[] = [];

          // Convert skill choices
          if (choices.skills) {
            choices.skills.forEach((skillChoice) => {
              choiceData.push(
                convertSkillChoiceToProto(skillChoice, ChoiceSource.CLASS)
              );
            });
          }

          // Convert equipment choices
          if (choices.equipment) {
            choices.equipment.forEach((equipChoice) => {
              choiceData.push(
                convertEquipmentChoiceToProto(equipChoice, ChoiceSource.CLASS)
              );
            });
          }

          // Convert feature choices (fighting styles, etc.)
          if (choices.features) {
            choices.features.forEach((featureChoice) => {
              choiceData.push(
                convertFeatureChoiceToProto(featureChoice, ChoiceSource.CLASS)
              );
            });
          }

          // Convert expertise choices if any
          if (choices.expertise) {
            choices.expertise.forEach((expertiseChoice) => {
              choiceData.push(
                convertExpertiseChoiceToProto(
                  expertiseChoice.choiceId,
                  expertiseChoice.skills,
                  ChoiceSource.CLASS
                )
              );
            });
          }

          // Convert trait choices if any
          if (choices.traits) {
            choices.traits.forEach((traitChoice) => {
              choiceData.push(
                convertTraitChoiceToProto(
                  traitChoice.choiceId,
                  traitChoice.traits,
                  ChoiceSource.CLASS
                )
              );
            });
          }

          // Save class to API with converted choices
          try {
            await draft.setClass(classData, choiceData);
          } catch (error) {
            console.error('Failed to save class:', error);
            // TODO: Show error toast to user
          }
        }}
        onClose={() => setIsClassModalOpen(false)}
      />

      {/* Spell Selection Modal */}
      {isClassInfo(character.selectedClass) &&
        character.selectedClass.spellcasting && (
          <SpellSelectionModal
            isOpen={isSpellModalOpen}
            onClose={() => setIsSpellModalOpen(false)}
            spellcastingInfo={character.selectedClass.spellcasting}
            className={character.selectedClass.name}
            level1Features={
              isClassInfo(character.selectedClass)
                ? character.selectedClass.level1Features
                : []
            }
            currentSpells={selectedSpells}
            onSelect={(spells) => {
              setSelectedSpells(spells);
              // TODO: Add spell selection to character draft
            }}
          />
        )}

      {/* Background Selection Modal */}
      <BackgroundSelectionModal
        isOpen={isBackgroundModalOpen}
        currentBackground={draft.backgroundInfo?.name}
        onSelect={async (background) => {
          await setBackground(background, []);
          setIsBackgroundModalOpen(false);
        }}
        onClose={() => setIsBackgroundModalOpen(false)}
      />
    </div>
  );
}
