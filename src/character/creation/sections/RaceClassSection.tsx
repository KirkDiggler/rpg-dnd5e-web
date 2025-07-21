import {
  useUpdateDraftClass,
  useUpdateDraftRace,
  useUpdateDraftSkills,
} from '@/api/hooks';
import { useCharacterDraft } from '@/character/creation/useCharacterDraft';
import { TraitBadge } from '@/components/TraitBadge';
import { TraitIcons } from '@/constants/traits';
import { useCharacterBuilder } from '@/hooks/useCharacterBuilder';
import { create } from '@bufbuild/protobuf';
import type {
  ClassInfo,
  RaceInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  UpdateClassRequestSchema,
  UpdateRaceRequestSchema,
  UpdateSkillsRequestSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  Class,
  Race,
  Skill,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { motion } from 'framer-motion';
import { useState } from 'react';
import type { ClassChoices } from '../ClassSelectionModal';
import { ClassSelectionModal } from '../ClassSelectionModal';
import type { RaceChoices } from '../RaceSelectionModal';
import { RaceSelectionModal } from '../RaceSelectionModal';

export function RaceClassSection() {
  const { setSelectedChoice } = useCharacterBuilder();
  const { draft, setRace, setClass, addRaceChoice, addClassChoice } =
    useCharacterDraft();
  const { updateRace } = useUpdateDraftRace();
  const { updateClass } = useUpdateDraftClass();
  const { updateSkills } = useUpdateDraftSkills();

  const [showRaceModal, setShowRaceModal] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const [selectedRaceData, setSelectedRaceData] = useState<RaceInfo | null>(
    null
  );
  const [selectedClassData, setSelectedClassData] = useState<ClassInfo | null>(
    null
  );

  // Helper to convert RaceInfo name to Race enum
  const getRaceEnum = (raceName: string): Race => {
    const raceMap: Record<string, Race> = {
      Human: Race.HUMAN,
      Elf: Race.ELF,
      Dwarf: Race.DWARF,
      Halfling: Race.HALFLING,
      Dragonborn: Race.DRAGONBORN,
      Gnome: Race.GNOME,
      'Half-Elf': Race.HALF_ELF,
      'Half-Orc': Race.HALF_ORC,
      Tiefling: Race.TIEFLING,
    };
    return raceMap[raceName] || Race.UNSPECIFIED;
  };

  // Helper to convert ClassInfo name to Class enum
  const getClassEnum = (className: string): Class => {
    const classMap: Record<string, Class> = {
      Barbarian: Class.BARBARIAN,
      Bard: Class.BARD,
      Cleric: Class.CLERIC,
      Druid: Class.DRUID,
      Fighter: Class.FIGHTER,
      Monk: Class.MONK,
      Paladin: Class.PALADIN,
      Ranger: Class.RANGER,
      Rogue: Class.ROGUE,
      Sorcerer: Class.SORCERER,
      Warlock: Class.WARLOCK,
      Wizard: Class.WIZARD,
    };
    return classMap[className] || Class.UNSPECIFIED;
  };

  // Helper to convert skill string to Skill enum
  const getSkillEnum = (skillName: string): Skill => {
    const skillMap: Record<string, Skill> = {
      Acrobatics: Skill.ACROBATICS,
      'Animal Handling': Skill.ANIMAL_HANDLING,
      Arcana: Skill.ARCANA,
      Athletics: Skill.ATHLETICS,
      Deception: Skill.DECEPTION,
      History: Skill.HISTORY,
      Insight: Skill.INSIGHT,
      Intimidation: Skill.INTIMIDATION,
      Investigation: Skill.INVESTIGATION,
      Medicine: Skill.MEDICINE,
      Nature: Skill.NATURE,
      Perception: Skill.PERCEPTION,
      Performance: Skill.PERFORMANCE,
      Persuasion: Skill.PERSUASION,
      Religion: Skill.RELIGION,
      'Sleight of Hand': Skill.SLEIGHT_OF_HAND,
      Stealth: Skill.STEALTH,
      Survival: Skill.SURVIVAL,
    };
    return skillMap[skillName] || Skill.UNSPECIFIED;
  };

  const handleRaceSelect = async (race: RaceInfo, choices: RaceChoices) => {
    setSelectedRaceData(race);
    setSelectedChoice('race', race.id);
    setSelectedChoice('raceData', race);
    setSelectedChoice('raceChoices', choices);

    // Update the draft context
    setRace(race);

    // Store race choices in context
    // Handle languages (Record<string, string[]>)
    if (choices.languages && Object.keys(choices.languages).length > 0) {
      Object.entries(choices.languages).forEach(([choiceId, selections]) => {
        if (selections && selections.length > 0) {
          addRaceChoice(`language_${choiceId}`, selections);
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
            addRaceChoice(`proficiency_${choiceId}`, selections);
          }
        }
      );
    }

    // Call API to update the draft if we have a draft ID
    if (draft?.id) {
      try {
        const request = create(UpdateRaceRequestSchema, {
          draftId: draft.id,
          race: getRaceEnum(race.name),
          // TODO: Add subrace support when needed
        });
        await updateRace(request);
      } catch (error) {
        console.error('Failed to update race:', error);
        // TODO: Show error to user
      }
    }

    setShowRaceModal(false);
  };

  const handleClassSelect = async (
    classData: ClassInfo,
    choices: ClassChoices
  ) => {
    setSelectedClassData(classData);
    setSelectedChoice('class', classData.id);
    setSelectedChoice('classData', classData);
    setSelectedChoice('classChoices', choices);

    // Update the draft context
    setClass(classData);

    // Store class choices in context
    // Handle proficiencies (Record<string, string[]>)
    if (
      choices.proficiencies &&
      Object.keys(choices.proficiencies).length > 0
    ) {
      Object.entries(choices.proficiencies).forEach(
        ([choiceId, selections]) => {
          if (selections && selections.length > 0) {
            addClassChoice(`proficiency_${choiceId}`, selections);
          }
        }
      );
    }

    // Handle equipment (Record<string, string>)
    if (choices.equipment && Object.keys(choices.equipment).length > 0) {
      Object.entries(choices.equipment).forEach(([choiceId, selectedItem]) => {
        if (selectedItem) {
          addClassChoice(`equipment_${choiceId}`, [selectedItem]);
        }
      });
    }

    // Handle features (Record<string, Record<string, string[]>>)
    if (choices.features && Object.keys(choices.features).length > 0) {
      Object.entries(choices.features).forEach(
        ([featureId, featureChoices]) => {
          Object.entries(featureChoices).forEach(([choiceId, selections]) => {
            if (selections && selections.length > 0) {
              addClassChoice(`feature_${featureId}_${choiceId}`, selections);
            }
          });
        }
      );
    }

    // Call API to update the draft if we have a draft ID
    if (draft?.id) {
      try {
        const request = create(UpdateClassRequestSchema, {
          draftId: draft.id,
          class: getClassEnum(classData.name),
        });
        await updateClass(request);

        // Also update skills if any were chosen
        // Skills are stored in proficiencies with skill choice IDs
        const skillSelections: string[] = [];
        Object.entries(choices.proficiencies).forEach(
          ([choiceId, selections]) => {
            // Check if this is a skill choice by looking at the available skills
            if (classData.choices) {
              const skillChoice = classData.choices.find(
                (c) => c.id === choiceId && c.choiceType === 2 // SKILL type
              );
              if (skillChoice && selections.length > 0) {
                // Convert selection indices to skill names
                selections.forEach((selection) => {
                  const index = parseInt(selection);
                  if (!isNaN(index) && classData.availableSkills[index]) {
                    skillSelections.push(classData.availableSkills[index]);
                  }
                });
              }
            }
          }
        );

        if (skillSelections.length > 0) {
          const skillsRequest = create(UpdateSkillsRequestSchema, {
            draftId: draft.id,
            skills: skillSelections.map((skillName: string) =>
              getSkillEnum(skillName)
            ),
          });
          await updateSkills(skillsRequest);
        }
      } catch (error) {
        console.error('Failed to update class:', error);
        // TODO: Show error to user
      }
    }

    setShowClassModal(false);
  };

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
        onSelect={handleRaceSelect}
        onClose={() => setShowRaceModal(false)}
      />

      {/* Class Selection Modal */}
      <ClassSelectionModal
        isOpen={showClassModal}
        currentClass={selectedClassData?.name}
        onSelect={handleClassSelect}
        onClose={() => setShowClassModal(false)}
      />
    </div>
  );
}
