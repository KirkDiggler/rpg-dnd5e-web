import { useCharacterDraft } from '@/character/creation/useCharacterDraft';
import { TraitBadge } from '@/components/TraitBadge';
import { TraitIcons } from '@/constants/traits';
import { useCharacterBuilder } from '@/hooks/useCharacterBuilder';
import type {
  ClassInfo,
  RaceInfo,
  SubclassInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  ChoiceCategory,
  ChoiceSource,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { Language } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import type {
  ClassModalChoices,
  RaceModalChoices,
} from '../../../types/choices';
import {
  convertEquipmentChoiceToProto,
  convertFeatureChoiceToProto,
  convertLanguageChoiceToProto,
  convertSkillChoiceToProto,
} from '../../../utils/choiceConverter';
import { ClassSelectionModal } from '../ClassSelectionModal';
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
  const [selectedClassData, setSelectedClassData] = useState<
    ClassInfo | SubclassInfo | null
  >(classInfo);
  const [selectedClassChoices, setSelectedClassChoices] = useState<
    ClassModalChoices | undefined
  >();

  // Update selected data when draft loads
  useEffect(() => {
    setSelectedRaceData(raceInfo);
  }, [raceInfo]);

  useEffect(() => {
    setSelectedClassData(classInfo);
  }, [classInfo]);

  // Convert existing choices from ChoiceSubmission to modal format if needed
  const existingRaceChoices: RaceModalChoices | undefined = undefined;

  const handleRaceSelect = async (
    race: RaceInfo,
    choices: RaceModalChoices
  ) => {
    setSelectedRaceData(race);
    setSelectedChoice('race', race.raceId);
    setSelectedChoice('raceData', race);
    setSelectedChoice('raceChoices', choices);

    // Convert structured choices to ChoiceSubmission proto format
    const choiceDataArray = [];

    // Convert language choices
    if (choices.languages) {
      for (const languageChoice of choices.languages) {
        const choiceData = convertLanguageChoiceToProto(
          languageChoice,
          ChoiceSource.RACE
        );
        choiceDataArray.push(choiceData);
      }
    }

    // Convert skill choices
    if (choices.skills) {
      for (const skillChoice of choices.skills) {
        const choiceData = convertSkillChoiceToProto(
          skillChoice,
          ChoiceSource.RACE
        );
        choiceDataArray.push(choiceData);
      }
    }

    // TODO: Convert other proficiency choices when they are structured

    // Update the draft context with race and choices
    await setRace(race, choiceDataArray);

    setShowRaceModal(false);
  };

  const handleClassSelect = useCallback(
    async (
      classData: ClassInfo | (ClassInfo & { selectedSubclass: SubclassInfo }),
      choices: ClassModalChoices
    ) => {
      setSelectedClassData(classData);
      setSelectedClassChoices(choices); // Save for modal re-opening
      setSelectedChoice('class', classData.classId);
      setSelectedChoice('classData', classData);
      setSelectedChoice('classChoices', choices);

      // Convert structured choices to ChoiceSubmission proto format
      const choiceDataArray = [];

      // Convert skill choices
      if (choices.skills) {
        for (const skillChoice of choices.skills) {
          const choiceData = convertSkillChoiceToProto(
            skillChoice,
            ChoiceSource.CLASS
          );
          choiceDataArray.push(choiceData);
        }
      }

      // Convert language choices
      if (choices.languages) {
        for (const languageChoice of choices.languages) {
          const choiceData = convertLanguageChoiceToProto(
            languageChoice,
            ChoiceSource.CLASS
          );
          choiceDataArray.push(choiceData);
        }
      }

      // Convert equipment choices
      if (choices.equipment) {
        for (const equipmentChoice of choices.equipment) {
          const choiceData = convertEquipmentChoiceToProto(
            equipmentChoice,
            ChoiceSource.CLASS
          );
          choiceDataArray.push(choiceData);
        }
      }

      // Convert feature choices (fighting styles, etc.)
      if (choices.features && choices.features.length > 0) {
        for (const featureChoice of choices.features) {
          try {
            const choiceData = convertFeatureChoiceToProto(
              featureChoice,
              ChoiceSource.CLASS
            );
            if (choiceData) {
              choiceDataArray.push(choiceData);
            }
          } catch {
            // Skip feature choices that fail to convert
            // This shouldn't happen but protects against API changes
          }
        }
      }

      // Update the draft context with class and choices
      await setClass(classData, choiceDataArray);

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
                  {/* Display racial traits */}
                  {selectedRaceData.traits.map((trait) => (
                    <TraitBadge
                      key={trait.name}
                      name={trait.name}
                      type="racial"
                      icon={TraitIcons.racial}
                    />
                  ))}

                  {/* Display race's built-in languages */}
                  {selectedRaceData.languages &&
                    selectedRaceData.languages.length > 0 && (
                      <>
                        {selectedRaceData.languages.map((langEnum) => {
                          // Convert enum to display name
                          const langName = Object.entries(Language).find(
                            ([, value]) => value === langEnum
                          )?.[0];
                          if (!langName) return null;
                          return (
                            <TraitBadge
                              key={`lang-${langName}`}
                              name={langName.replace(/_/g, ' ').toLowerCase()}
                              type="racial"
                              icon="🗣️"
                            />
                          );
                        })}
                      </>
                    )}

                  {/* Display race's built-in proficiencies */}
                  {/* Note: RaceInfo no longer has proficiencies field - they come through choices now */}

                  {/* Display race choices */}
                  {raceChoices &&
                    raceChoices.map((choice) => {
                      // Display based on choice type
                      if (
                        choice.category === ChoiceCategory.LANGUAGES &&
                        choice.selection?.case === 'languages'
                      ) {
                        return choice.selection.value.languages?.map((lang) => (
                          <TraitBadge
                            key={`${choice.choiceId}-lang-${lang}`}
                            name={Language[lang] || `Language ${lang}`}
                            type="racial"
                            icon="💬"
                          />
                        ));
                      } else if (
                        choice.category === ChoiceCategory.SKILLS &&
                        choice.selection?.case === 'skills'
                      ) {
                        return choice.selection.value.skills?.map((skill) => (
                          <TraitBadge
                            key={`${choice.choiceId}-skill-${skill}`}
                            name={`Skill ${skill}`}
                            type="racial"
                            icon="⚔️"
                          />
                        ));
                      }
                      return null;
                    })}
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
                  {/* Display selected fighting style */}
                  {classChoices &&
                    classChoices
                      .filter(
                        (choice) =>
                          choice.category === ChoiceCategory.FIGHTING_STYLE
                      )
                      .map((choice) => {
                        // Extract the fighting style name from the selection
                        if (
                          choice.selection?.case === 'name' ||
                          choice.selection?.case === 'fightingStyle'
                        ) {
                          const styleName = choice.selection.value as string;
                          // Convert "feature_fighting_style:_dueling" to "Dueling"
                          const displayName = styleName
                            .replace(/^feature_fighting_style:_/, '')
                            .replace(/_/g, ' ')
                            .split(' ')
                            .map(
                              (word) =>
                                word.charAt(0).toUpperCase() +
                                word.slice(1).toLowerCase()
                            )
                            .join(' ');
                          return (
                            <TraitBadge
                              key={choice.choiceId}
                              name={`Fighting Style: ${displayName}`}
                              type="class"
                              icon="🗡️"
                            />
                          );
                        }
                        return null;
                      })}
                  {/* Display class choices */}
                  {classChoices &&
                    classChoices.map((choice) => {
                      // Display based on choice type
                      if (
                        choice.category === ChoiceCategory.SKILLS &&
                        choice.selection?.case === 'skills'
                      ) {
                        return choice.selection.value.skills?.map((skill) => (
                          <TraitBadge
                            key={`${choice.choiceId}-skill-${skill}`}
                            name={`Skill ${skill}`}
                            type="class"
                            icon="⚔️"
                          />
                        ));
                      } else if (
                        choice.category === ChoiceCategory.EQUIPMENT &&
                        choice.selection?.case === 'equipment'
                      ) {
                        return choice.selection.value.items?.map(
                          (item: unknown) => {
                            // Extract display name from equipment item
                            let displayName = 'Unknown Equipment';
                            if (
                              (item as { equipment?: { case?: string } })
                                .equipment?.case === 'otherEquipmentId'
                            ) {
                              displayName = (
                                item as { equipment: { value: string } }
                              ).equipment.value;
                            } else if (
                              (item as { equipment?: { case?: string } })
                                .equipment?.case
                            ) {
                              // It's an enum value (weapon, armor, etc)
                              displayName = `${(item as { equipment: { case: string; value: string } }).equipment.case}: ${(item as { equipment: { case: string; value: string } }).equipment.value}`;
                            }
                            return (
                              <TraitBadge
                                key={`${choice.choiceId}-equip-${displayName}`}
                                name={displayName}
                                type="class"
                                icon="🛡️"
                              />
                            );
                          }
                        );
                      }
                      return null;
                    })}
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
        currentClass={
          (
            selectedClassData as unknown as {
              classId?: string;
              subclassId?: string;
            }
          )?.classId ||
          (
            selectedClassData as unknown as {
              classId?: string;
              subclassId?: string;
            }
          )?.subclassId ||
          (classInfo as { classId?: string })?.classId
        }
        existingChoices={selectedClassChoices}
        onSelect={handleClassSelect}
        onClose={() => setShowClassModal(false)}
      />
    </div>
  );
}
