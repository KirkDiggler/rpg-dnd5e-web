import { create } from '@bufbuild/protobuf';
import type {
  CharacterDraft,
  Choice,
  ChoiceData,
  ClassInfo,
  RaceInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  AbilityScoresSchema,
  ChoiceCategory,
  ChoiceSource,
  CreateDraftRequestSchema,
  FinalizeDraftRequestSchema,
  UpdateAbilityScoresRequestSchema,
  UpdateClassRequestSchema,
  UpdateNameRequestSchema,
  UpdateRaceRequestSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  Class,
  Language,
  Race,
  Skill,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { characterClient } from '../../api/client';
import {
  useCreateDraft,
  useFinalizeDraft,
  useListClasses,
  useListRaces,
  useUpdateDraftAbilityScores,
  useUpdateDraftClass,
  useUpdateDraftName,
  useUpdateDraftRace,
} from '../../api/hooks';
import { getLanguageDisplay, getSkillDisplay } from '../../utils/enumDisplay';
import {
  CharacterDraftContext,
  type CharacterDraftState,
} from './CharacterDraftContextDef';

// Debug: Log all available enums to help with troubleshooting
if (import.meta.env.MODE === 'development') {
  console.group('🧩 Available Proto Enums');
  console.log(
    '🎲 Skills:',
    Object.entries(Skill)
      .filter(([, v]) => typeof v === 'number')
      .map(([k, v]) => `${k}=${v}`)
  );
  console.log(
    '🗣️ Languages:',
    Object.entries(Language)
      .filter(([, v]) => typeof v === 'number')
      .map(([k, v]) => `${k}=${v}`)
  );
  console.log(
    '🏃 Classes:',
    Object.entries(Class)
      .filter(([, v]) => typeof v === 'number')
      .map(([k, v]) => `${k}=${v}`)
  );
  console.log(
    '👥 Races:',
    Object.entries(Race)
      .filter(([, v]) => typeof v === 'number')
      .map(([k, v]) => `${k}=${v}`)
  );
  console.groupEnd();
}

// Helper to convert RaceInfo name to Race enum
function getRaceEnum(raceName: string): Race {
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
}

// Helper to convert ClassInfo name to Class enum
function getClassEnum(className: string): Class {
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
}

// Helper function to format proficiencies with category prefix
function formatProficiencyList(
  category: string,
  proficiencies: string[] | undefined
): string[] {
  if (!proficiencies) return [];
  return proficiencies.flatMap((p) => [
    `${category}:${p.toLowerCase()}`,
    p, // Also add original format
  ]);
}

// Helper to convert ChoiceData array to internal choice format
// Removed convertChoiceDataToInternalFormat - no longer needed
// We now use ChoiceData directly
/*
function convertChoiceDataToInternalFormat(
  choiceData: ChoiceData[]
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  console.group('📥 Converting ChoiceData to internal format');
  console.log(
    '🧩 Input ChoiceData array:',
    choiceData.map((cd) => ({
      choiceId: cd.choiceId,
      category: `${ChoiceCategory[cd.category]}(${cd.category})`,
      source: `${ChoiceSource[cd.source]}(${cd.source})`,
      selection: cd.selection.case,
    }))
  );

  choiceData.forEach((choice) => {
    console.group(`🎯 Processing choice: ${choice.choiceId}`);
    console.log(
      '📋 Category:',
      `${ChoiceCategory[choice.category]}(${choice.category})`
    );
    console.log(
      '📡 Source:',
      `${ChoiceSource[choice.source]}(${choice.source})`
    );
    console.log('🎲 Selection type:', choice.selection.case);

    const selections: string[] = [];

    switch (choice.selection.case) {
      case 'skills':
        console.log('🎯 Processing skills selection');
        if (choice.selection.value.skills) {
          const skillMappings = choice.selection.value.skills.map((skill) => {
            const skillName = `skill:${Skill[skill].toLowerCase()}`;
            console.log(
              `🔄 Skill enum ${skill} -> ${Skill[skill]} -> "${skillName}"`
            );
            return skillName;
          });
          selections.push(...skillMappings);
          console.log('✅ Skills converted:', skillMappings);
        } else {
          console.warn('⚠️ Skills selection has no skills array');
        }
        break;
      case 'languages':
        console.log('🎯 Processing languages selection');
        if (choice.selection.value.languages) {
          const languageMappings = choice.selection.value.languages.map(
            (lang) => {
              const languageName = `language:${Language[lang].toLowerCase()}`;
              console.log(
                `🔄 Language enum ${lang} -> ${Language[lang]} -> "${languageName}"`
              );
              return languageName;
            }
          );
          selections.push(...languageMappings);
          console.log('✅ Languages converted:', languageMappings);
        } else {
          console.warn('⚠️ Languages selection has no languages array');
        }
        break;
      case 'equipment':
        console.log('🎯 Processing equipment selection');
        if (choice.selection.value.items) {
          selections.push(...choice.selection.value.items);
          console.log('✅ Equipment items:', choice.selection.value.items);
        } else {
          console.warn('⚠️ Equipment selection has no items array');
        }
        break;
      case 'fightingStyle':
        console.log('🎯 Processing fighting style selection');
        selections.push(choice.selection.value);
        console.log('✅ Fighting style:', choice.selection.value);
        break;
      case 'name':
        console.log('🎯 Processing name selection');
        selections.push(choice.selection.value);
        console.log('✅ Name:', choice.selection.value);
        break;
      // Add other cases as needed
      default:
        console.warn(`⚠️ Unknown selection type: ${choice.selection.case}`);
    }

    if (selections.length > 0) {
      result[choice.choiceId] = selections;
      console.log('✅ Added to result:', { [choice.choiceId]: selections });
    } else {
      console.warn('⚠️ No selections found, skipping');
    }
    console.groupEnd();
  });

  console.log('🏁 Final result:', result);
  console.groupEnd();
  return result;
}
*/

// Helper to create ChoiceData from our internal choice format
// Removed unused function createChoiceDataFromInternalFormat
// We now use ChoiceData directly without conversion

/*
function createChoiceDataFromInternalFormat(
  choices: Record<string, string[]>,
  source: ChoiceSource
): ChoiceData[] {
  const choiceDataArray: ChoiceData[] = [];

  console.group('🔧 Creating ChoiceData from internal format');
  console.log('📝 Input choices:', JSON.stringify(choices, null, 2));
  console.log('📍 Source:', ChoiceSource[source]);

  Object.entries(choices).forEach(([choiceId, selectedValues]) => {
    console.group(`🎯 Processing choice: ${choiceId}`);
    console.log('📋 Selected values:', selectedValues);

    if (selectedValues.length > 0) {
      // Determine the choice category and create appropriate ChoiceData
      let category: ChoiceCategory;
      let selection: ChoiceData['selection'];

      if (selectedValues.some((v) => v.startsWith('skill:'))) {
        console.log('🎯 Detected SKILLS choice');
        category = ChoiceCategory.SKILLS;

        // Convert string skills to Skill enums
        const skills = selectedValues
          .filter((v) => v.startsWith('skill:')) // Only process skill values
          .map((skill) => {
            const skillName = skill
              .replace('skill:', '')
              .replace(/[- ]/g, '_')
              .toUpperCase();
            const skillEnum =
              Skill[skillName as keyof typeof Skill] || Skill.UNSPECIFIED;
            console.log(
              `🔄 Converting skill: "${skill}" -> "${skillName}" -> ${Skill[skillEnum] || 'INVALID'} (${skillEnum})`
            );
            return skillEnum;
          })
          .filter((skill) => {
            const isValid = skill !== Skill.UNSPECIFIED;
            if (!isValid) {
              console.warn('⚠️ Filtered out UNSPECIFIED skill');
            }
            return isValid;
          });

        console.log(
          '✅ Final skills array:',
          skills.map((s) => `${Skill[s]}(${s})`)
        );

        selection = {
          case: 'skills',
          value: create(SkillListSchema, { skills }),
        };
      } else if (selectedValues.some((v) => v.startsWith('language:'))) {
        console.log('🎯 Detected LANGUAGES choice');
        category = ChoiceCategory.LANGUAGES;

        // Convert string languages to Language enums
        const languages = selectedValues
          .filter((v) => v.startsWith('language:')) // Only process language values
          .map((lang) => {
            const langName = lang
              .replace('language:', '')
              .replace(/[- ]/g, '_')
              .toUpperCase();
            // Check if the enum key exists
            const hasLanguageEnum = langName in Language;
            const langEnum = hasLanguageEnum
              ? Language[langName as keyof typeof Language]
              : Language.UNSPECIFIED;
            console.log(
              `🔄 Converting language: "${lang}" -> "${langName}" -> ${hasLanguageEnum ? 'FOUND' : 'NOT FOUND'} -> ${Language[langEnum] || 'INVALID'} (${langEnum})`
            );
            return langEnum;
          })
          .filter((lang) => {
            const isValid = lang !== Language.UNSPECIFIED;
            if (!isValid) {
              console.warn('⚠️ Filtered out UNSPECIFIED language');
            }
            return isValid;
          });

        console.log(
          '✅ Final languages array:',
          languages.map((l) => `${Language[l]}(${l})`)
        );

        selection = {
          case: 'languages',
          value: create(LanguageListSchema, { languages }),
        };
      } else if (choiceId.includes('cantrip')) {
        console.log('🎯 Detected CANTRIPS choice');
        category = ChoiceCategory.CANTRIPS;
        selection = {
          case: 'cantrips',
          value: create(CantripListSchema, { cantrips: selectedValues }),
        };
      } else if (choiceId.includes('spell')) {
        console.log('🎯 Detected SPELLS choice');
        category = ChoiceCategory.SPELLS;
        selection = {
          case: 'spells',
          value: create(SpellListSchema, { spells: selectedValues }),
        };
      } else if (choiceId.includes('equipment')) {
        console.log('🎯 Detected EQUIPMENT choice');
        category = ChoiceCategory.EQUIPMENT;
        selection = {
          case: 'equipment',
          value: create(EquipmentListSchema, { items: selectedValues }),
        };
      } else if (choiceId.includes('fighting')) {
        console.log('🎯 Detected FIGHTING_STYLE choice');
        category = ChoiceCategory.FIGHTING_STYLE;
        selection = {
          case: 'fightingStyle',
          value: selectedValues[0] || '',
        };
      } else {
        console.log('🎯 Using fallback UNSPECIFIED choice');
        // Default to name for unrecognized choice types
        category = ChoiceCategory.UNSPECIFIED;
        selection = {
          case: 'name',
          value: selectedValues.join(', '),
        };
      }

      const choiceData = create(ChoiceDataSchema, {
        category,
        source,
        choiceId,
        selection,
      });

      console.log('📦 Created ChoiceData:', {
        choiceId,
        category: `${ChoiceCategory[category]}(${category})`,
        source: `${ChoiceSource[source]}(${source})`,
        selection: {
          case: selection.case,
          value:
            selection.case === 'skills'
              ? (selection.value as { skills?: number[] }).skills?.map(
                  (s: number) => `${Skill[s]}(${s})`
                )
              : selection.case === 'languages'
                ? (selection.value as { languages?: number[] }).languages?.map(
                    (l: number) => `${Language[l]}(${l})`
                  )
                : selection.value,
        },
      });

      choiceDataArray.push(choiceData);
    } else {
      console.log('⏭️ Skipping empty choice');
    }
    console.groupEnd();
  });

  console.log(
    '🏁 Final ChoiceData array:',
    choiceDataArray.map((cd) => ({
      choiceId: cd.choiceId,
      category: `${ChoiceCategory[cd.category]}(${cd.category})`,
      source: `${ChoiceSource[cd.source]}(${cd.source})`,
      selection: cd.selection.case,
    }))
  );
  console.groupEnd();
  return choiceDataArray;
}
*/

export function CharacterDraftProvider({ children }: { children: ReactNode }) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CharacterDraft | null>(null);
  const [currentRaceInfo, setCurrentRaceInfo] = useState<RaceInfo | null>(null);
  const [currentClassInfo, setCurrentClassInfo] = useState<ClassInfo | null>(
    null
  );
  const [allProficiencies, setAllProficiencies] = useState<Set<string>>(
    new Set()
  );
  const [allLanguages, setAllLanguages] = useState<Set<string>>(new Set());
  const [raceChoices, setRaceChoices] = useState<ChoiceData[]>([]);
  const [classChoices, setClassChoices] = useState<ChoiceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Get reference data for race/class lookups
  const { data: availableRaces } = useListRaces({ pageSize: 50 });
  const { data: availableClasses } = useListClasses({ pageSize: 50 });

  // API hooks
  const { createDraft: createDraftAPI } = useCreateDraft();
  const { updateName: updateNameAPI } = useUpdateDraftName();
  const { updateRace: updateRaceAPI } = useUpdateDraftRace();
  const { updateClass: updateClassAPI } = useUpdateDraftClass();
  const { updateAbilityScores: updateAbilityScoresAPI } =
    useUpdateDraftAbilityScores();
  const { finalizeDraft: finalizeDraftAPI } = useFinalizeDraft();

  // Helper to collect all proficiencies from a race
  const collectRaceProficiencies = useCallback(
    (race: RaceInfo | null, choicesOverride?: ChoiceData[]): Set<string> => {
      const proficiencies = new Set<string>();
      if (!race) return proficiencies;

      // Add base proficiencies - these come automatically with the race
      if (race.proficiencies && Array.isArray(race.proficiencies)) {
        race.proficiencies.forEach((p) => {
          // Normalize the proficiency index
          // API might return "skill-intimidation" or "Skill: Intimidation"
          const normalized = p
            .toLowerCase()
            .replace(/^skill[:-]\s*/i, 'skill:');
          proficiencies.add(normalized);
          proficiencies.add(p); // Also add original format
        });
      }

      // Add chosen proficiencies from race choices (now ChoiceData[])
      const choicesToUse = choicesOverride || raceChoices;
      choicesToUse.forEach((choice) => {
        if (
          choice.selection?.case === 'skills' &&
          choice.selection.value.skills
        ) {
          choice.selection.value.skills.forEach((skillEnum) => {
            const skillName = getSkillDisplay(skillEnum);
            proficiencies.add(skillName);
            proficiencies.add(`skill:${skillName.toLowerCase()}`);
          });
        }
      });

      return proficiencies;
    },
    [raceChoices]
  );

  // Helper to collect all languages from a race
  const collectRaceLanguages = useCallback(
    (race: RaceInfo | null, choicesOverride?: ChoiceData[]): Set<string> => {
      const languages = new Set<string>();
      if (!race) return languages;

      // Add base languages (these are now Language enums from RaceInfo)
      if (race.languages) {
        race.languages.forEach((l) => {
          // Convert enum value to string representation
          const languageName = Object.entries(Language).find(
            ([, value]) => value === l
          )?.[0];
          if (languageName) {
            languages.add(languageName.replace(/_/g, ' '));
          }
        });
      }

      // Add chosen languages (now from ChoiceData[])
      const choicesToUse = choicesOverride || raceChoices;
      choicesToUse.forEach((choice) => {
        if (
          choice.selection?.case === 'languages' &&
          choice.selection.value.languages
        ) {
          choice.selection.value.languages.forEach((langEnum) => {
            const langName = getLanguageDisplay(langEnum);
            languages.add(langName);
          });
        }
      });

      return languages;
    },
    [raceChoices]
  );

  // Helper to collect all proficiencies from a class
  const collectClassProficiencies = useCallback(
    (
      classInfo: ClassInfo | null,
      choicesOverride?: ChoiceData[]
    ): Set<string> => {
      const proficiencies = new Set<string>();
      if (!classInfo) return proficiencies;

      // Add base proficiencies using helper
      formatProficiencyList('armor', classInfo.armorProficiencies).forEach(
        (p) => proficiencies.add(p)
      );
      formatProficiencyList('weapon', classInfo.weaponProficiencies).forEach(
        (p) => proficiencies.add(p)
      );
      formatProficiencyList('tool', classInfo.toolProficiencies).forEach((p) =>
        proficiencies.add(p)
      );
      formatProficiencyList(
        'saving-throw',
        classInfo.savingThrowProficiencies
      ).forEach((p) => proficiencies.add(p));

      // Add chosen proficiencies from class choices (now ChoiceData[])
      const choicesToUse = choicesOverride || classChoices;
      choicesToUse.forEach((choice) => {
        if (
          choice.selection?.case === 'skills' &&
          choice.selection.value.skills
        ) {
          choice.selection.value.skills.forEach((skillEnum) => {
            const skillName = getSkillDisplay(skillEnum);
            proficiencies.add(skillName);
            proficiencies.add(`skill:${skillName.toLowerCase()}`);
          });
        }
      });

      return proficiencies;
    },
    [classChoices]
  );

  // When draft has raceId, look it up from available races
  useEffect(() => {
    if (draft?.raceId && availableRaces && availableRaces.length > 0) {
      const raceInfo = availableRaces.find(
        (r) => r.id === Race[draft.raceId].toLowerCase()
      );
      if (raceInfo) {
        setCurrentRaceInfo(raceInfo);

        // Recalculate proficiencies and languages with the loaded race
        const raceProficiencies = collectRaceProficiencies(
          raceInfo,
          raceChoices
        );
        const raceLanguages = collectRaceLanguages(raceInfo, raceChoices);

        // If we have a class, include its proficiencies too
        const classProficiencies = currentClassInfo
          ? collectClassProficiencies(currentClassInfo, classChoices)
          : new Set<string>();

        setAllProficiencies(
          new Set([...raceProficiencies, ...classProficiencies])
        );
        setAllLanguages(new Set([...raceLanguages]));
      }
    }
  }, [
    draft?.raceId,
    availableRaces,
    raceChoices,
    classChoices,
    currentClassInfo,
    collectRaceProficiencies,
    collectRaceLanguages,
    collectClassProficiencies,
  ]);

  // When draft has classId, look it up from available classes
  useEffect(() => {
    if (draft?.classId && availableClasses && availableClasses.length > 0) {
      const classInfo = availableClasses.find(
        (c) => c.id === Class[draft.classId].toLowerCase()
      );
      if (classInfo) {
        setCurrentClassInfo(classInfo);

        // Recalculate proficiencies with the loaded class
        const classProficiencies = collectClassProficiencies(
          classInfo,
          classChoices
        );

        // Include race proficiencies if we have a race
        const raceProficiencies = currentRaceInfo
          ? collectRaceProficiencies(currentRaceInfo, raceChoices)
          : new Set<string>();
        const raceLanguages = currentRaceInfo
          ? collectRaceLanguages(currentRaceInfo, raceChoices)
          : new Set<string>();

        setAllProficiencies(
          new Set([...raceProficiencies, ...classProficiencies])
        );
        setAllLanguages(new Set([...raceLanguages]));
      }
    }
  }, [
    draft?.classId,
    availableClasses,
    classChoices,
    raceChoices,
    currentRaceInfo,
    collectClassProficiencies,
    collectRaceProficiencies,
    collectRaceLanguages,
  ]);

  const createDraft = useCallback(
    async (playerId: string, sessionId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await createDraftAPI(
          create(CreateDraftRequestSchema, {
            playerId,
            sessionId: sessionId || '',
          })
        );
        if (response.draft) {
          setDraftId(response.draft.id);
          setDraft(response.draft);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error('Failed to create draft')
        );
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [createDraftAPI]
  );

  const loadDraft = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      console.group('📥 Loading draft from server');
      console.log('🆔 Draft ID:', id);

      setDraftId(id);
      // Load the draft data
      const { getDraft } = characterClient;
      const response = await getDraft({ draftId: id });

      console.log('📦 Raw server response:', response);

      if (response.draft) {
        console.log('✅ Draft found:', {
          id: response.draft.id,
          name: response.draft.name,
          raceId: response.draft.raceId
            ? `${Race[response.draft.raceId]}(${response.draft.raceId})`
            : 'none',
          classId: response.draft.classId
            ? `${Class[response.draft.classId]}(${response.draft.classId})`
            : 'none',
          choicesCount: response.draft.choices?.length || 0,
        });

        setDraft(response.draft);
        setDraftId(response.draft.id);

        // The useEffect hooks will handle loading RaceInfo and ClassInfo from the IDs

        // Load choices from draft
        if (response.draft.choices) {
          console.log('🎯 Processing draft choices:', response.draft.choices);

          // Group choices by source directly (no conversion needed)
          const raceChoicesFromDraft: ChoiceData[] = [];
          const classChoicesFromDraft: ChoiceData[] = [];

          response.draft.choices.forEach((choice: ChoiceData) => {
            console.log(
              `📂 Grouping choice ${choice.choiceId} with source ${ChoiceSource[choice.source]}(${choice.source})`
            );

            // Group by source
            if (
              choice.source === ChoiceSource.RACE ||
              choice.source === ChoiceSource.SUBRACE
            ) {
              raceChoicesFromDraft.push(choice);
              console.log('➡️ Added to race choices');
            } else if (choice.source === ChoiceSource.CLASS) {
              classChoicesFromDraft.push(choice);
              console.log('➡️ Added to class choices');
            } else {
              console.log(
                `⚠️ Unknown source, skipping: ${ChoiceSource[choice.source]}`
              );
            }
            // TODO: Handle BACKGROUND when implemented
          });

          console.log('🏁 Final grouped choices:', {
            raceChoices: raceChoicesFromDraft,
            classChoices: classChoicesFromDraft,
          });

          // Use the grouped choices we just processed
          setRaceChoices(raceChoicesFromDraft);
          setClassChoices(classChoicesFromDraft);

          // The useEffect hooks will recalculate proficiencies and languages once the race/class are loaded
        } else {
          console.log('ℹ️ No choices found in draft');
        }
      } else {
        console.warn('⚠️ No draft found in response');
      }
      console.groupEnd();
    } catch (err) {
      console.error('❌ Failed to load draft:', err);
      console.groupEnd();
      setError(err instanceof Error ? err : new Error('Failed to load draft'));
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const setRace = useCallback(
    async (race: RaceInfo | null, choices?: ChoiceData[]) => {
      // Don't proceed if no draft exists yet or if we're already saving
      if (!draftId) {
        console.warn('Cannot set race: no draft ID available yet');
        return;
      }

      // Clear race choices when changing race
      if (!race || (currentRaceInfo && currentRaceInfo.name !== race?.name)) {
        setRaceChoices([]);
      }

      // If choices are provided, convert them to internal format and update state
      if (choices && choices.length > 0) {
        // Choices are already ChoiceData, no conversion needed
        setRaceChoices(choices);
      }

      // Store the full RaceInfo immediately
      setCurrentRaceInfo(race);

      // Update draft with race info
      setDraft(
        (prev) =>
          ({
            ...prev,
            race: race || undefined,
          }) as CharacterDraft
      );

      // Recalculate all proficiencies and languages
      const raceProficiencies = collectRaceProficiencies(race, choices);
      const raceLanguages = collectRaceLanguages(race, choices);

      setAllProficiencies(new Set([...raceProficiencies]));
      setAllLanguages(new Set([...raceLanguages]));

      // Save to API if draft exists and race is provided
      if (race) {
        // Return early if already saving to prevent multiple concurrent saves
        if (saving) {
          console.warn('⚠️ Already saving race, skipping duplicate save');
          return;
        }

        setSaving(true);
        try {
          console.group('🏁 Saving race to API');
          console.log('🏷️ Race name:', race.name);
          console.log('🏷️ Race enum:', getRaceEnum(race.name));

          // Use provided ChoiceData directly or convert from state
          let raceChoiceData: ChoiceData[];
          if (choices && choices.length > 0) {
            raceChoiceData = choices;
            console.log(
              '📦 Using provided ChoiceData directly:',
              raceChoiceData
            );
          } else {
            // Use the stored ChoiceData directly
            raceChoiceData = raceChoices;
            console.log('📦 Using stored choices:', raceChoiceData);
          }

          const request = create(UpdateRaceRequestSchema, {
            draftId,
            race: getRaceEnum(race.name),
            raceChoices: raceChoiceData,
            // TODO: Add subrace when supported
          });

          console.log('🚀 UpdateRaceRequest:', {
            draftId,
            race: `${Race[getRaceEnum(race.name)]}(${getRaceEnum(race.name)})`,
            raceChoicesCount: raceChoiceData.length,
            raceChoices: raceChoiceData.map((cd) => ({
              choiceId: cd.choiceId,
              category: `${ChoiceCategory[cd.category]}(${cd.category})`,
              selection: cd.selection.case,
            })),
          });

          const response = await updateRaceAPI(request);
          console.log('✅ UpdateRace API response:', response);
          console.groupEnd();
        } catch (err) {
          console.error('❌ Failed to save race:', err);
          console.groupEnd();
          setError(
            err instanceof Error ? err : new Error('Failed to save race')
          );
          throw err;
        } finally {
          setSaving(false);
        }
      }
    },
    [
      collectRaceProficiencies,
      collectRaceLanguages,
      draftId,
      updateRaceAPI,
      saving,
      currentRaceInfo,
      raceChoices,
    ]
  );

  const setClass = useCallback(
    async (classInfo: ClassInfo | null, choices?: ChoiceData[]) => {
      // Don't proceed if no draft exists yet
      if (!draftId) {
        console.warn('Cannot set class: no draft ID available yet');
        return;
      }

      // Clear class choices when changing class
      if (
        !classInfo ||
        (currentClassInfo && currentClassInfo.name !== classInfo?.name)
      ) {
        setClassChoices([]);
      }

      // If choices are provided, convert them to internal format and update state
      if (choices && choices.length > 0) {
        // Choices are already ChoiceData, no conversion needed
        setClassChoices(choices);
      }

      // Store the full ClassInfo immediately
      setCurrentClassInfo(classInfo);

      setDraft(
        (prev) =>
          ({
            ...prev,
            class: classInfo || undefined,
          }) as CharacterDraft
      );

      // Update proficiencies when class changes
      if (classInfo) {
        // For proficiency calculation, always use the current internal format
        const classProficiencies = collectClassProficiencies(
          classInfo,
          classChoices
        );

        // Merge with existing race proficiencies
        setAllProficiencies((prev) => {
          const merged = new Set(prev);
          classProficiencies.forEach((p) => merged.add(p));
          return merged;
        });
      } else {
        // Class was cleared, recalculate with just race proficiencies
        if (currentRaceInfo) {
          const raceProficiencies = collectRaceProficiencies(currentRaceInfo);
          const raceLanguages = collectRaceLanguages(currentRaceInfo);
          setAllProficiencies(new Set([...raceProficiencies]));
          setAllLanguages(new Set([...raceLanguages]));
        }
      }

      // Save to API if draft exists and class is provided
      if (classInfo) {
        // Return early if already saving to prevent multiple concurrent saves
        if (saving) {
          console.warn('⚠️ Already saving class, skipping duplicate save');
          return;
        }

        setSaving(true);
        try {
          console.group('🏁 Saving class to API');
          console.log('🏷️ Class name:', classInfo.name);
          console.log('🏷️ Class enum:', getClassEnum(classInfo.name));
          console.log('📥 Received choices parameter:', choices);
          console.log('📥 Choices length:', choices ? choices.length : 0);

          // Use provided ChoiceData directly or convert from state
          let classChoiceData: ChoiceData[];
          if (choices && choices.length > 0) {
            classChoiceData = choices;
            console.log(
              '📦 Using provided ChoiceData directly:',
              classChoiceData
            );
          } else {
            // Convert from legacy internal format if no ChoiceData provided
            // Use the stored ChoiceData directly
            classChoiceData = classChoices;
            console.log('📦 Using stored choices:', classChoiceData);
          }

          const request = create(UpdateClassRequestSchema, {
            draftId,
            class: getClassEnum(classInfo.name),
            classChoices: classChoiceData,
          });

          console.log('🚀 UpdateClassRequest:', {
            draftId,
            class: `${Class[getClassEnum(classInfo.name)]}(${getClassEnum(classInfo.name)})`,
            classChoicesCount: classChoiceData.length,
            classChoices: classChoiceData.map((cd) => ({
              choiceId: cd.choiceId,
              category: `${ChoiceCategory[cd.category]}(${cd.category})`,
              selection: cd.selection.case,
            })),
          });

          const response = await updateClassAPI(request);
          console.log('✅ UpdateClass API response:', response);
          console.groupEnd();
        } catch (err) {
          console.error('❌ Failed to save class:', err);
          console.groupEnd();
          setError(
            err instanceof Error ? err : new Error('Failed to save class')
          );
          throw err;
        } finally {
          setSaving(false);
        }
      }
    },
    [
      draftId,
      updateClassAPI,
      saving,
      currentClassInfo,
      classChoices,
      collectClassProficiencies,
      currentRaceInfo,
      collectRaceProficiencies,
      collectRaceLanguages,
    ]
  );

  const hasProficiency = useCallback(
    (proficiencyIndex: string): boolean => {
      return allProficiencies.has(proficiencyIndex);
    },
    [allProficiencies]
  );

  const hasLanguage = useCallback(
    (languageIndex: string): boolean => {
      return allLanguages.has(languageIndex);
    },
    [allLanguages]
  );

  const getAvailableChoices = useCallback((choices: Choice[]) => {
    // This will filter out choices that are already selected
    // We'll implement this once we understand the choice structure better
    return choices;
  }, []);

  const addRaceChoice = useCallback(
    (choice: ChoiceData) => {
      console.group('🎯 Adding race choice');
      console.log('📝 Choice:', choice);

      setRaceChoices((prev) => {
        // Replace any existing choice with the same ID
        const filtered = prev.filter((c) => c.choiceId !== choice.choiceId);
        const newChoices = [...filtered, choice];
        console.log('📋 Updated race choices:', newChoices);
        return newChoices;
      });

      // Recalculate proficiencies/languages using stored RaceInfo
      if (currentRaceInfo) {
        const raceProficiencies = collectRaceProficiencies(currentRaceInfo);
        const raceLanguages = collectRaceLanguages(currentRaceInfo);
        const classProficiencies = currentClassInfo
          ? collectClassProficiencies(currentClassInfo)
          : new Set<string>();

        setAllProficiencies(
          new Set([...raceProficiencies, ...classProficiencies])
        );
        setAllLanguages(new Set([...raceLanguages]));
        console.log('🔄 Recalculated proficiencies and languages');
      }
      console.groupEnd();
    },
    [
      currentRaceInfo,
      currentClassInfo,
      collectRaceProficiencies,
      collectRaceLanguages,
      collectClassProficiencies,
    ]
  );

  const addClassChoice = useCallback(
    (choice: ChoiceData) => {
      console.group('🎯 Adding class choice');
      console.log('📝 Choice:', choice);

      setClassChoices((prev) => {
        // Replace any existing choice with the same ID
        const filtered = prev.filter((c) => c.choiceId !== choice.choiceId);
        const newChoices = [...filtered, choice];
        console.log('📋 Updated class choices:', newChoices);

        // Recalculate proficiencies with new choices
        if (currentClassInfo) {
          const classProficiencies = collectClassProficiencies(
            currentClassInfo,
            newChoices
          );
          const raceProficiencies = currentRaceInfo
            ? collectRaceProficiencies(currentRaceInfo)
            : new Set<string>();

          setAllProficiencies(
            new Set([...raceProficiencies, ...classProficiencies])
          );
          console.log('🔄 Recalculated proficiencies');
        }

        return newChoices;
      });
      console.groupEnd();
    },
    [
      currentClassInfo,
      currentRaceInfo,
      collectClassProficiencies,
      collectRaceProficiencies,
    ]
  );

  const setName = useCallback(
    async (name: string) => {
      // Update the draft's name property
      setDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          name,
        };
      });

      // Save to API if draft exists
      if (draftId) {
        setSaving(true);
        try {
          const request = create(UpdateNameRequestSchema, {
            draftId,
            name,
          });
          await updateNameAPI(request);
        } catch (err) {
          setError(
            err instanceof Error ? err : new Error('Failed to save name')
          );
          throw err;
        } finally {
          setSaving(false);
        }
      }
    },
    [draftId, updateNameAPI]
  );

  const setAbilityScores = useCallback(
    async (scores: Record<string, number>) => {
      // Create AbilityScores message from the scores object
      const abilityScores = create(AbilityScoresSchema, {
        strength: scores.strength || 10,
        dexterity: scores.dexterity || 10,
        constitution: scores.constitution || 10,
        intelligence: scores.intelligence || 10,
        wisdom: scores.wisdom || 10,
        charisma: scores.charisma || 10,
      });

      setDraft(
        (prev) =>
          ({
            ...prev,
            abilityScores,
          }) as CharacterDraft
      );

      // Save to API if draft exists
      if (draftId) {
        setSaving(true);
        try {
          const request = create(UpdateAbilityScoresRequestSchema, {
            draftId,
            scoresInput: {
              case: 'abilityScores',
              value: create(AbilityScoresSchema, abilityScores),
            },
          });
          await updateAbilityScoresAPI(request);
        } catch (err) {
          setError(
            err instanceof Error
              ? err
              : new Error('Failed to save ability scores')
          );
          throw err;
        } finally {
          setSaving(false);
        }
      }
    },
    [draftId, updateAbilityScoresAPI]
  );

  const reset = useCallback(() => {
    setDraftId(null);
    setDraft(null);
    setCurrentRaceInfo(null);
    setCurrentClassInfo(null);
    setAllProficiencies(new Set());
    setAllLanguages(new Set());
    setRaceChoices([]);
    setClassChoices([]);
    setLoading(false);
    setSaving(false);
    setError(null);
  }, []);

  const finalizeDraft = useCallback(async () => {
    if (!draftId) {
      throw new Error('No draft to finalize');
    }

    setSaving(true);
    setError(null);
    try {
      const request = create(FinalizeDraftRequestSchema, { draftId });
      const response = await finalizeDraftAPI(request);

      if (!response.character?.id) {
        throw new Error('Failed to finalize draft - no character ID returned');
      }

      // Reset the draft state after successful finalization
      reset();

      return response.character.id;
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to finalize draft');
      setError(error);
      throw error;
    } finally {
      setSaving(false);
    }
  }, [draftId, finalizeDraftAPI, reset]);

  const value: CharacterDraftState = {
    draftId,
    draft,
    raceInfo: currentRaceInfo,
    classInfo: currentClassInfo,
    allProficiencies,
    allLanguages,
    raceChoices,
    classChoices,
    loading,
    saving,
    error,
    createDraft,
    loadDraft,
    setRace,
    setClass,
    setName,
    setAbilityScores,
    finalizeDraft,
    addRaceChoice,
    addClassChoice,
    getAvailableChoices,
    hasProficiency,
    hasLanguage,
    reset,
  };

  return (
    <CharacterDraftContext.Provider value={value}>
      {children}
    </CharacterDraftContext.Provider>
  );
}
