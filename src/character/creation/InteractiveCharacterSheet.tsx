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
import { FightingStyle } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { motion } from 'framer-motion';
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
import { BackgroundSelectionModal } from './BackgroundSelectionModal';
import { ClassSelectionModal } from './ClassSelectionModal';
import { RaceSelectionModal } from './RaceSelectionModal';
import { AbilityScoresSectionV2 } from './sections/AbilityScoresSectionV2';
import { RaceClassSection } from './sections/RaceClassSection';
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

// Helper function to format and group proficiencies (removed - was unused)

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

  // Compute character creation steps and their status from API progress
  const steps = useMemo<Step[]>(() => {
    const progress = draft.draft?.progress;

    if (!progress) {
      return [];
    }

    // Build steps array based on API progress - always show all steps
    const allSteps: Step[] = [
      {
        id: 'name',
        label: 'Name',
        status: progress.hasName ? 'completed' : 'current',
      },
      {
        id: 'race',
        label: 'Race',
        status: progress.hasRace
          ? 'completed'
          : progress.hasName
            ? 'current'
            : 'upcoming',
      },
      {
        id: 'class',
        label: 'Class',
        status: progress.hasClass
          ? 'completed'
          : progress.hasRace
            ? 'current'
            : 'upcoming',
      },
      {
        id: 'background',
        label: 'Background',
        status: progress.hasBackground
          ? 'completed'
          : progress.hasClass
            ? 'current'
            : 'upcoming',
      },
      {
        id: 'ability-scores',
        label: 'Ability Scores',
        status: progress.hasAbilityScores
          ? 'completed'
          : progress.hasBackground
            ? 'current'
            : 'upcoming',
      },
    ];

    return allSteps;
  }, [draft.draft?.progress]);

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

          {/* Race & Class & Background Selection */}
          <RaceClassSection />

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
