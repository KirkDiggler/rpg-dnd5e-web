import { useCharacterDraft } from '@/character/creation/useCharacterDraft';
import { TraitBadge } from '@/components/TraitBadge';
import { TraitIcons } from '@/constants/traits';
import { useCharacterBuilder } from '@/hooks/useCharacterBuilder';
import type {
  ClassInfo,
  RaceInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import type { ClassChoices } from '../ClassSelectionModal';
import { ClassSelectionModal } from '../ClassSelectionModal';
import type { RaceChoices } from '../RaceSelectionModal';
import { RaceSelectionModal } from '../RaceSelectionModal';

export function RaceClassSection() {
  const { setSelectedChoice } = useCharacterBuilder();
  const { raceInfo, classInfo, setRace, setClass, raceChoices, classChoices } =
    useCharacterDraft();

  const [showRaceModal, setShowRaceModal] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const [selectedRaceData, setSelectedRaceData] = useState<RaceInfo | null>(
    raceInfo
  );
  const [selectedClassData, setSelectedClassData] = useState<ClassInfo | null>(
    classInfo
  );

  // Update selected data when draft loads
  useEffect(() => {
    if (raceInfo && !selectedRaceData) {
      setSelectedRaceData(raceInfo);
    }
    if (classInfo && !selectedClassData) {
      setSelectedClassData(classInfo);
    }
  }, [raceInfo, classInfo, selectedRaceData, selectedClassData]);

  // Format existing race choices for the modal
  const existingRaceChoices: RaceChoices | undefined =
    raceChoices && Object.keys(raceChoices).length > 0
      ? {
          languages: {},
          proficiencies: {},
        }
      : undefined;

  // Populate existing race choices
  if (existingRaceChoices && raceChoices) {
    Object.entries(raceChoices).forEach(([choiceId, selections]) => {
      // Determine if it's a language or proficiency choice
      // This is a simple heuristic - you might need to adjust based on actual choice IDs
      if (
        choiceId.includes('language') ||
        selections.some((s) => s.startsWith('language:'))
      ) {
        existingRaceChoices.languages[choiceId] = selections;
      } else {
        existingRaceChoices.proficiencies[choiceId] = selections;
      }
    });
  }

  const handleRaceSelect = async (race: RaceInfo, choices: RaceChoices) => {
    setSelectedRaceData(race);
    setSelectedChoice('race', race.id);
    setSelectedChoice('raceData', race);
    setSelectedChoice('raceChoices', choices);

    // Format choices for the context
    const formattedChoices: Record<string, string[]> = {};

    // Handle languages (Record<string, string[]>)
    if (choices.languages && Object.keys(choices.languages).length > 0) {
      Object.entries(choices.languages).forEach(([choiceId, selections]) => {
        if (selections && selections.length > 0) {
          formattedChoices[choiceId] = selections;
        }
      });
    }

    // Handle proficiencies (Record<string, string[]>) - includes tools, skills, weapons, armor
    if (
      choices.proficiencies &&
      Object.keys(choices.proficiencies).length > 0
    ) {
      Object.entries(choices.proficiencies).forEach(
        ([choiceId, selections]) => {
          if (selections && selections.length > 0) {
            formattedChoices[choiceId] = selections;
          }
        }
      );
    }

    // Update the draft context with race and choices
    await setRace(race, formattedChoices);

    setShowRaceModal(false);
  };

  const handleClassSelect = useCallback(
    async (classData: ClassInfo, choices: ClassChoices) => {
      setSelectedClassData(classData);
      setSelectedChoice('class', classData.id);
      setSelectedChoice('classData', classData);
      setSelectedChoice('classChoices', choices);

      // Format choices for the context
      const formattedChoices: Record<string, string[]> = {};

      // Handle proficiencies (Record<string, string[]>)
      if (
        choices.proficiencies &&
        Object.keys(choices.proficiencies).length > 0
      ) {
        Object.entries(choices.proficiencies).forEach(
          ([choiceId, selections]) => {
            if (selections && selections.length > 0) {
              formattedChoices[choiceId] = selections;
            }
          }
        );
      }

      // Handle equipment (Record<string, string>)
      if (choices.equipment && Object.keys(choices.equipment).length > 0) {
        Object.entries(choices.equipment).forEach(
          ([choiceId, selectedItem]) => {
            if (selectedItem) {
              // Equipment choices should be arrays for consistency with other choices
              formattedChoices[choiceId] = [selectedItem];
            }
          }
        );
      }

      // Handle features (Record<string, Record<string, string[]>>)
      if (choices.features && Object.keys(choices.features).length > 0) {
        Object.entries(choices.features).forEach(
          ([featureId, featureChoices]) => {
            Object.entries(featureChoices).forEach(([choiceId, selections]) => {
              if (selections && selections.length > 0) {
                // For features, we might need to use a combined key
                const combinedKey = `${featureId}_${choiceId}`;
                formattedChoices[combinedKey] = selections;
              }
            });
          }
        );
      }

      // Update the draft context with class and choices
      await setClass(classData, formattedChoices);

      // TODO: Handle skills update when supported in the context

      setShowClassModal(false);
    },
    [setClass, setSelectedChoice]
  );

  return (
    <div className="space-y-6">
      <h2
        className="text-2xl font-bold font-serif"
        style={{ color: 'var(--text-primary)' }}
      >
        Character Identity
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Race Selection */}
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="cursor-pointer"
          onClick={() => setShowRaceModal(true)}
        >
          <div
            className="p-6 rounded-lg border-2 border-dashed transition-all duration-300 hover:border-solid"
            style={{
              backgroundColor: selectedRaceData
                ? 'var(--card-bg)'
                : 'var(--bg-secondary)',
              borderColor: selectedRaceData
                ? 'var(--accent-primary)'
                : 'var(--border-primary)',
            }}
          >
            {selectedRaceData ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">🧝</div>
                  <div>
                    <h3
                      className="text-xl font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {selectedRaceData.name}
                    </h3>
                    <p
                      className="text-sm"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {selectedRaceData.description ||
                        'A proud member of this race'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedRaceData.traits.map((trait) => (
                    <TraitBadge
                      key={trait.name}
                      name={trait.name}
                      type="racial"
                      icon={TraitIcons.racial}
                    />
                  ))}
                  {/* Display race choices */}
                  {raceChoices &&
                    Object.entries(raceChoices).map(([choiceId, selections]) =>
                      selections.map((selection) => (
                        <TraitBadge
                          key={`${choiceId}-${selection}`}
                          name={selection.replace(
                            /^(language:|skill:|tool:|proficiency:)/,
                            ''
                          )}
                          type="choice"
                          icon="✓"
                        />
                      ))
                    )}
                </div>
                <p className="text-xs text-muted">Click to change race</p>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <div className="text-4xl opacity-50">🧝</div>
                <div>
                  <h3
                    className="text-xl font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Choose Race
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Select your character's heritage
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Class Selection */}
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="cursor-pointer"
          onClick={() => setShowClassModal(true)}
        >
          <div
            className="p-6 rounded-lg border-2 border-dashed transition-all duration-300 hover:border-solid"
            style={{
              backgroundColor: selectedClassData
                ? 'var(--card-bg)'
                : 'var(--bg-secondary)',
              borderColor: selectedClassData
                ? 'var(--accent-primary)'
                : 'var(--border-primary)',
            }}
          >
            {selectedClassData ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">⚔️</div>
                  <div>
                    <h3
                      className="text-xl font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {selectedClassData.name}
                    </h3>
                    <p
                      className="text-sm"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {selectedClassData.description ||
                        'A master of their craft'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedClassData.level1Features
                    .slice(0, 3)
                    .map((feature) => (
                      <TraitBadge
                        key={feature.name}
                        name={feature.name}
                        type="class"
                        icon={TraitIcons.class}
                      />
                    ))}
                  {/* Display class choices */}
                  {classChoices &&
                    Object.entries(classChoices).map(([choiceId, selections]) =>
                      selections.map((selection) => (
                        <TraitBadge
                          key={`${choiceId}-${selection}`}
                          name={selection.replace(
                            /^(skill:|tool:|proficiency:|equipment:)/,
                            ''
                          )}
                          type="choice"
                          icon="✓"
                        />
                      ))
                    )}
                </div>
                <p className="text-xs text-muted">Click to change class</p>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <div className="text-4xl opacity-50">⚔️</div>
                <div>
                  <h3
                    className="text-xl font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Choose Class
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Select your character's profession
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Race Selection Modal */}
      <RaceSelectionModal
        isOpen={showRaceModal}
        currentRace={selectedRaceData?.name}
        existingChoices={existingRaceChoices}
        onSelect={handleRaceSelect}
        onClose={() => setShowRaceModal(false)}
      />

      {/* Class Selection Modal */}
      <ClassSelectionModal
        isOpen={showClassModal}
        currentClass={selectedClassData?.name || classInfo?.name}
        rawExistingChoices={classChoices}
        onSelect={handleClassSelect}
        onClose={() => setShowClassModal(false)}
      />
    </div>
  );
}
