import type { Step } from '@/components/ProgressTracker';
import { ProgressTracker } from '@/components/ProgressTracker';
import type {
  ChoiceData,
  ClassInfo,
  RaceInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  ChoiceCategory,
  ChoiceSource,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  Language,
  Skill,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ClassModalChoices, RaceModalChoices } from '../../types/choices';
import {
  convertEquipmentChoiceToProto,
  convertFeatureChoiceToProto,
  convertLanguageChoiceToProto,
  convertSkillChoiceToProto,
} from '../../utils/choiceConverter';
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
      // Filter out objects (stringified ChoiceData)
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

// Simple context for now - we'll make it more sophisticated later
const CharacterContext = {
  selectedRace: null as RaceInfo | null,
  selectedClass: null as ClassInfo | null,
  abilityScores: {
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
  const [selectedSpells, setSelectedSpells] = useState<string[]>([]);
  const draft = useCharacterDraft();

  // Sync draft state with local character state
  useEffect(() => {
    if (draft.draft) {
      setCharacter((prev) => ({
        ...prev,
        // Update ability scores if they exist in the draft
        abilityScores: draft.draft?.abilityScores || prev.abilityScores,
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
    if (draft.draft?.abilityScores) {
      setCharacter((prev) => ({
        ...prev,
        abilityScores: {
          strength: draft.draft?.abilityScores?.strength || 0,
          dexterity: draft.draft?.abilityScores?.dexterity || 0,
          constitution: draft.draft?.abilityScores?.constitution || 0,
          intelligence: draft.draft?.abilityScores?.intelligence || 0,
          wisdom: draft.draft?.abilityScores?.wisdom || 0,
          charisma: draft.draft?.abilityScores?.charisma || 0,
        },
      }));
    }

    // Load choices from draft context
    if (draft.raceChoices || draft.classChoices) {
      // Convert ChoiceData arrays to structured format for the UI
      const structuredClassChoices: ClassModalChoices = {
        skills: [],
        equipment: [],
        features: [],
        proficiencies: [],
      };

      // Parse draft.classChoices which is now ChoiceData[]
      (draft.classChoices || []).forEach((choice) => {
        if (
          choice.category === ChoiceCategory.EQUIPMENT &&
          choice.selection?.case === 'equipment'
        ) {
          structuredClassChoices.equipment?.push({
            choiceId: choice.choiceId,
            items: choice.selection.value.items || [],
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
    draft.draft?.abilityScores,
    draft.raceChoices,
    draft.classChoices,
  ]);

  // Get classChoices from character state
  const classChoices =
    character.choices?.classChoices || ({} as ClassModalChoices);

  // Validation function to check if character is ready for finalization
  const isCharacterValid = useCallback(() => {
    // Check required fields
    const hasName = Boolean(draft.draft?.name?.trim());
    const hasRace = Boolean(draft.raceInfo);
    const hasClass = Boolean(draft.classInfo);

    // Check if all ability scores are assigned (all greater than 0)
    const hasAbilityScores =
      draft.draft?.abilityScores &&
      draft.draft.abilityScores.strength > 0 &&
      draft.draft.abilityScores.dexterity > 0 &&
      draft.draft.abilityScores.constitution > 0 &&
      draft.draft.abilityScores.intelligence > 0 &&
      draft.draft.abilityScores.wisdom > 0 &&
      draft.draft.abilityScores.charisma > 0;

    return hasName && hasRace && hasClass && hasAbilityScores;
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
    const hasRace = character.selectedRace !== null;
    const hasClass = character.selectedClass !== null;

    // Check if all ability scores are assigned (all non-zero)
    const hasAbilityScores = Object.values(character.abilityScores).every(
      (score) => score > 0
    );

    const hasProficiencies =
      Object.keys(classChoices.proficiencies || {}).length > 0;
    const hasEquipment = Object.keys(character.equipmentChoices).length > 0;
    const hasSpells = selectedSpells.length > 0;

    // Check if class is a spellcaster
    const isSpellcaster = character.selectedClass?.spellcasting !== undefined;

    // Check if class has feature choices (like Fighting Style)
    const hasFeatureChoices =
      character.selectedClass?.choices?.some((choice) => {
        return choice.choiceType === ChoiceCategory.FIGHTING_STYLE;
      }) || false;

    // Check if all feature choices have been made
    const hasFeatureChoicesSelected =
      !hasFeatureChoices ||
      (character.selectedClass?.choices?.every((choice) => {
        if (choice.choiceType !== ChoiceCategory.FIGHTING_STYLE) return true;

        // Check if this feature choice has been made in draft.classChoices
        const choiceData = draft.classChoices.find(
          (c) => c.choiceId === choice.id
        );
        return choiceData && choiceData.selection;
      }) ??
        true);

    // Build steps array
    const allSteps: Step[] = [
      {
        id: 'race',
        label: 'Race',
        status: hasRace ? 'completed' : 'current',
      },
      {
        id: 'class',
        label: 'Class',
        status: hasClass ? 'completed' : hasRace ? 'current' : 'upcoming',
      },
      {
        id: 'ability-scores',
        label: 'Ability Scores',
        status: hasAbilityScores
          ? 'completed'
          : hasClass
            ? 'current'
            : 'upcoming',
      },
    ];

    // Add feature selection if applicable (e.g., Fighting Style for Fighter)
    if (hasFeatureChoices) {
      allSteps.push({
        id: 'features',
        label: 'Features',
        status: hasFeatureChoicesSelected
          ? 'completed'
          : hasAbilityScores && hasClass
            ? 'current'
            : 'upcoming',
        conditional: true,
      });
    }

    // Proficiencies step
    allSteps.push({
      id: 'proficiencies',
      label: 'Proficiencies',
      status: hasProficiencies
        ? 'completed'
        : hasAbilityScores && hasClass
          ? 'current'
          : 'upcoming',
    });

    // Equipment step
    allSteps.push({
      id: 'equipment',
      label: 'Equipment',
      status: hasEquipment
        ? 'completed'
        : hasProficiencies
          ? 'current'
          : 'upcoming',
    });

    // Spells step (conditional on class)
    if (isSpellcaster) {
      allSteps.push({
        id: 'spells',
        label: 'Spells',
        status: hasSpells ? 'completed' : hasEquipment ? 'current' : 'upcoming',
        conditional: true,
      });
    }

    // Update current step logic using functional approach
    const hasCurrentStep = allSteps.some((step) => step.status === 'current');

    if (!hasCurrentStep) {
      // Find first upcoming step and make it current
      const firstUpcomingIndex = allSteps.findIndex(
        (step) => step.status === 'upcoming'
      );
      if (firstUpcomingIndex !== -1) {
        return allSteps.map((step, index) =>
          index === firstUpcomingIndex
            ? { ...step, status: 'current' as const }
            : step
        );
      }
    }

    return allSteps;
  }, [
    character.selectedRace,
    character.selectedClass,
    character.abilityScores,
    character.equipmentChoices,
    classChoices.proficiencies,
    draft.classChoices,
    selectedSpells,
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

    // Handle simple bundle references - skip these
    if (item.match(/^bundle_\d+$/)) {
      return null; // Will filter out later
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
        selections.forEach((selection: string) => {
          // Parse the selection - the format varies:
          // "chain-mail" - direct item selection
          // "bundle_1" - bundle selection
          // "bundle_1:0:longsword" - bundle with nested choice

          if (selection.includes(':')) {
            // This has a nested selection (e.g., "bundle_1:0:longsword")
            const parts = selection.split(':');
            const nestedItem = parts[parts.length - 1];
            // Format the item name
            equipment.push(
              nestedItem
                .replace(/-/g, ' ')
                .replace(/\b\w/g, (l: string) => l.toUpperCase())
            );
          } else if (selection.startsWith('bundle_')) {
            // This is a bundle - we need to look up what's in it
            // For now, show a generic message
            equipment.push('Equipment Bundle');
          } else {
            // Direct item selection - format the name
            equipment.push(
              selection
                .replace(/-/g, ' ')
                .replace(/\b\w/g, (l: string) => l.toUpperCase())
            );
          }
        });
      }
    });

    return equipment;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5 p-4">
      {/* Progress Tracker */}
      <div className="max-w-6xl mx-auto mb-6">
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

      <div className="max-w-4xl mx-auto">
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
            <div className="grid grid-cols-2 gap-4">
              {/* Left Column - Race and Inventory */}
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
                          {character.selectedRace.proficiencies &&
                            character.selectedRace.proficiencies.length > 0 && (
                              <div style={{ color: 'var(--text-primary)' }}>
                                <span
                                  style={{
                                    color: 'var(--text-primary)',
                                    opacity: 0.7,
                                  }}
                                >
                                  Skills:
                                </span>{' '}
                                {character.selectedRace.proficiencies.join(
                                  ', '
                                )}
                              </div>
                            )}
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
                          {/* Display resolved proficiencies from race choices */}
                          {/* Only show race-specific proficiencies here */}
                          {character.selectedRace?.proficiencies &&
                            character.selectedRace.proficiencies.length > 0 && (
                              <div style={{ color: 'var(--text-primary)' }}>
                                <span
                                  style={{
                                    color: 'var(--text-muted)',
                                    fontSize: '11px',
                                    opacity: 0.7,
                                  }}
                                >
                                  Racial Proficiencies:
                                </span>{' '}
                                {character.selectedRace.proficiencies
                                  .map((p) =>
                                    p.replace(
                                      /^(skill:|weapon:|armor:|tool:)/,
                                      ''
                                    )
                                  )
                                  .join(', ')}
                              </div>
                            )}
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

              {/* Right Column - Class and Proficiencies */}
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
                        {character.selectedClass.armorProficiencies &&
                          character.selectedClass.armorProficiencies.length >
                            0 && (
                            <div style={{ color: 'var(--text-primary)' }}>
                              <span
                                style={{
                                  color: 'var(--text-primary)',
                                  opacity: 0.7,
                                }}
                              >
                                Armor:
                              </span>{' '}
                              {character.selectedClass.armorProficiencies.join(
                                ', '
                              )}
                            </div>
                          )}
                        {character.selectedClass.weaponProficiencies &&
                          character.selectedClass.weaponProficiencies.length >
                            0 && (
                            <div style={{ color: 'var(--text-primary)' }}>
                              <span
                                style={{
                                  color: 'var(--text-primary)',
                                  opacity: 0.7,
                                }}
                              >
                                Weapons:
                              </span>{' '}
                              {character.selectedClass.weaponProficiencies
                                .slice(0, 3)
                                .join(', ')}
                              {character.selectedClass.weaponProficiencies
                                .length > 3 && '...'}
                            </div>
                          )}
                        {character.selectedClass.savingThrowProficiencies &&
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
                              {character.selectedClass.savingThrowProficiencies.join(
                                ', '
                              )}
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
                            character.selectedClass?.choices?.filter(
                              (choice) =>
                                choice.choiceType ===
                                ChoiceCategory.FIGHTING_STYLE
                            ) || [];

                          return featureChoices.map((choice) => {
                            const choiceData = draft.classChoices.find(
                              (c) => c.choiceId === choice.id
                            );
                            if (!choiceData || !choiceData.selection)
                              return null;

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
                                {/* TODO: Display the actual selection based on the choice type */}
                                Selected
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
                        const startingEquipment =
                          character.selectedClass.startingEquipment || [];
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
                                .map((item) => formatEquipmentName(item))
                                .filter((name) => name !== null)
                                .map((name, idx) => (
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
                    {character.selectedClass?.spellcasting && (
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
        currentRace={character.selectedRace?.name}
        existingProficiencies={draft.allProficiencies}
        existingLanguages={draft.allLanguages}
        onSelect={(race, choices) => {
          setCharacter((prev) => ({
            ...prev,
            selectedRace: race,
          }));

          // Convert choices to ChoiceData format
          console.log('🎯 Race choices received from modal:', choices);
          const choiceData: ChoiceData[] = [];

          // Convert language choices
          if (choices.languages) {
            console.log('📚 Converting language choices:', choices.languages);
            choices.languages.forEach((langChoice) => {
              choiceData.push(
                convertLanguageChoiceToProto(langChoice, ChoiceSource.RACE)
              );
            });
          }

          // Convert skill choices if any
          if (choices.skills) {
            console.log('⚔️ Converting skill choices:', choices.skills);
            choices.skills.forEach((skillChoice) => {
              choiceData.push(
                convertSkillChoiceToProto(skillChoice, ChoiceSource.RACE)
              );
            });
          }

          console.log('📦 Final choiceData array:', choiceData);
          // Set race with converted choices
          draft.setRace(race, choiceData);
        }}
        onClose={() => setIsRaceModalOpen(false)}
      />

      {/* Class Selection Modal */}
      <ClassSelectionModal
        isOpen={isClassModalOpen}
        currentClass={character.selectedClass?.name}
        existingChoices={character.choices?.classChoices}
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

          // Convert choices to ChoiceData format
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
      {character.selectedClass?.spellcasting && (
        <SpellSelectionModal
          isOpen={isSpellModalOpen}
          onClose={() => setIsSpellModalOpen(false)}
          spellcastingInfo={character.selectedClass.spellcasting}
          className={character.selectedClass.name}
          level1Features={character.selectedClass.level1Features}
          currentSpells={selectedSpells}
          onSelect={(spells) => {
            setSelectedSpells(spells);
            // TODO: Add spell selection to character draft
          }}
        />
      )}
    </div>
  );
}
