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
  ChoiceDataSchema,
  ChoiceSource,
  CreateDraftRequestSchema,
  EquipmentListSchema,
  FinalizeDraftRequestSchema,
  LanguageListSchema,
  SkillListSchema,
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
import {
  CharacterDraftContext,
  type CharacterDraftState,
} from './CharacterDraftContextDef';

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
function convertChoiceDataToInternalFormat(
  choiceData: ChoiceData[]
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  choiceData.forEach((choice) => {
    const selections: string[] = [];

    switch (choice.selection.case) {
      case 'skills':
        if (choice.selection.value.skills) {
          selections.push(
            ...choice.selection.value.skills.map(
              (skill) => `skill:${Skill[skill].toLowerCase()}`
            )
          );
        }
        break;
      case 'languages':
        if (choice.selection.value.languages) {
          selections.push(
            ...choice.selection.value.languages.map(
              (lang) => `language:${Language[lang].toLowerCase()}`
            )
          );
        }
        break;
      case 'equipment':
        if (choice.selection.value.items) {
          selections.push(...choice.selection.value.items);
        }
        break;
      case 'fightingStyle':
        selections.push(choice.selection.value);
        break;
      case 'name':
        selections.push(choice.selection.value);
        break;
      // Add other cases as needed
    }

    if (selections.length > 0) {
      result[choice.choiceId] = selections;
    }
  });

  return result;
}

// Helper to create ChoiceData from our internal choice format
function createChoiceDataFromInternalFormat(
  choices: Record<string, string[]>,
  source: ChoiceSource
): ChoiceData[] {
  const choiceDataArray: ChoiceData[] = [];

  Object.entries(choices).forEach(([choiceId, selectedValues]) => {
    if (selectedValues.length > 0) {
      // Determine the choice category and create appropriate ChoiceData
      let category: ChoiceCategory;
      let selection: ChoiceData['selection'];

      if (selectedValues.some((v) => v.startsWith('skill:'))) {
        category = ChoiceCategory.SKILLS;
        // Convert string skills to Skill enums
        const skills = selectedValues
          .map((skill) => {
            const skillName = skill
              .replace('skill:', '')
              .replace(/[- ]/g, '_')
              .toUpperCase();
            return Skill[skillName as keyof typeof Skill] || Skill.UNSPECIFIED;
          })
          .filter((skill) => skill !== Skill.UNSPECIFIED);

        selection = {
          case: 'skills',
          value: create(SkillListSchema, { skills }),
        };
      } else if (selectedValues.some((v) => v.startsWith('language:'))) {
        category = ChoiceCategory.LANGUAGES;
        // Convert string languages to Language enums
        const languages = selectedValues
          .map((lang) => {
            const langName = lang
              .replace('language:', '')
              .replace(/[- ]/g, '_')
              .toUpperCase();
            return (
              Language[langName as keyof typeof Language] ||
              Language.UNSPECIFIED
            );
          })
          .filter((lang) => lang !== Language.UNSPECIFIED);

        selection = {
          case: 'languages',
          value: create(LanguageListSchema, { languages }),
        };
      } else if (choiceId.includes('equipment')) {
        category = ChoiceCategory.EQUIPMENT;
        selection = {
          case: 'equipment',
          value: create(EquipmentListSchema, { items: selectedValues }),
        };
      } else if (choiceId.includes('fighting')) {
        category = ChoiceCategory.FIGHTING_STYLE;
        selection = {
          case: 'fightingStyle',
          value: selectedValues[0] || '',
        };
      } else {
        // Default to name for unrecognized choice types
        category = ChoiceCategory.UNSPECIFIED;
        selection = {
          case: 'name',
          value: selectedValues.join(', '),
        };
      }

      choiceDataArray.push(
        create(ChoiceDataSchema, {
          category,
          source,
          choiceId,
          selection,
        })
      );
    }
  });

  return choiceDataArray;
}

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
  const [raceChoices, setRaceChoices] = useState<Record<string, string[]>>({});
  const [classChoices, setClassChoices] = useState<Record<string, string[]>>(
    {}
  );
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
    (
      race: RaceInfo | null,
      choicesOverride?: Record<string, string[]>
    ): Set<string> => {
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

      // Add chosen proficiencies from race choices
      const choicesToUse = choicesOverride || raceChoices;
      Object.values(choicesToUse)
        .flat()
        .forEach((p) => {
          proficiencies.add(p);
          // Also add normalized version
          const normalized = p
            .toLowerCase()
            .replace(/^skill[:-]\s*/i, 'skill:');
          proficiencies.add(normalized);
        });

      return proficiencies;
    },
    [raceChoices]
  );

  // Helper to collect all languages from a race
  const collectRaceLanguages = useCallback(
    (
      race: RaceInfo | null,
      choicesOverride?: Record<string, string[]>
    ): Set<string> => {
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

      // Add chosen languages
      const choicesToUse = choicesOverride || raceChoices;
      Object.values(choicesToUse)
        .flat()
        .forEach((l) => {
          if (l.startsWith('language:')) {
            // Remove the 'language:' prefix and clean up the name
            const languageName = l.replace('language:', '').trim();
            languages.add(languageName);
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
      choicesOverride?: Record<string, string[]>
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

      // Add chosen proficiencies from class choices (skills, tools, etc.)
      const choicesToUse = choicesOverride || classChoices;
      Object.entries(choicesToUse).forEach(([, selections]) => {
        selections.forEach((p) => {
          proficiencies.add(p);
          // Also add normalized version for skills
          if (p.toLowerCase().includes('skill')) {
            const normalized = p
              .toLowerCase()
              .replace(/^skill[:-]\s*/i, 'skill:');
            proficiencies.add(normalized);
          }
        });
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
      setDraftId(id);
      // Load the draft data
      const { getDraft } = characterClient;
      const response = await getDraft({ draftId: id });

      if (response.draft) {
        setDraft(response.draft);
        setDraftId(response.draft.id);

        // The useEffect hooks will handle loading RaceInfo and ClassInfo from the IDs

        // Load choices from draft
        if (response.draft.choices) {
          // Convert ChoiceData to our internal format
          const allChoices = convertChoiceDataToInternalFormat(
            response.draft.choices
          );

          // Group choices by source
          const raceChoicesFromDraft: Record<string, string[]> = {};
          const classChoicesFromDraft: Record<string, string[]> = {};

          response.draft.choices.forEach((choice: ChoiceData) => {
            const selections = allChoices[choice.choiceId] || [];

            // Group by source
            if (
              choice.source === ChoiceSource.RACE ||
              choice.source === ChoiceSource.SUBRACE
            ) {
              raceChoicesFromDraft[choice.choiceId] = selections;
            } else if (choice.source === ChoiceSource.CLASS) {
              classChoicesFromDraft[choice.choiceId] = selections;
            }
            // TODO: Handle BACKGROUND when implemented
          });

          setRaceChoices(raceChoicesFromDraft);
          setClassChoices(classChoicesFromDraft);

          // The useEffect hooks will recalculate proficiencies and languages once the race/class are loaded
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load draft'));
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const setRace = useCallback(
    async (race: RaceInfo | null, choices?: Record<string, string[]>) => {
      // Don't proceed if no draft exists yet or if we're already saving
      if (!draftId) {
        console.warn('Cannot set race: no draft ID available yet');
        return;
      }

      // Clear race choices when changing race
      if (!race || (currentRaceInfo && currentRaceInfo.name !== race?.name)) {
        setRaceChoices({});
      }

      // If choices are provided, update them immediately
      if (choices) {
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
          console.warn('Already saving, skipping duplicate save');
          return;
        }

        setSaving(true);
        try {
          // Convert our choices to ChoiceData format
          // Use provided choices or fall back to state
          const choicesToSend = choices || raceChoices;
          const raceChoiceData = createChoiceDataFromInternalFormat(
            choicesToSend,
            ChoiceSource.RACE
          );

          const request = create(UpdateRaceRequestSchema, {
            draftId,
            race: getRaceEnum(race.name),
            raceChoices: raceChoiceData,
            // TODO: Add subrace when supported
          });
          await updateRaceAPI(request);
        } catch (err) {
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
    async (classInfo: ClassInfo | null, choices?: Record<string, string[]>) => {
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
        setClassChoices({});
      }

      // If choices are provided, update them immediately
      if (choices) {
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
        const choicesToUse = choices || classChoices;
        const classProficiencies = collectClassProficiencies(
          classInfo,
          choicesToUse
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
          console.warn('Already saving, skipping duplicate save');
          return;
        }

        setSaving(true);
        try {
          // Convert our choices to ChoiceData format
          // Use provided choices or fall back to state
          const choicesToSend = choices || classChoices;
          const classChoiceData = createChoiceDataFromInternalFormat(
            choicesToSend,
            ChoiceSource.CLASS
          );

          const request = create(UpdateClassRequestSchema, {
            draftId,
            class: getClassEnum(classInfo.name),
            classChoices: classChoiceData,
          });
          await updateClassAPI(request);
        } catch (err) {
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
    (choiceKey: string, selection: string[]) => {
      setRaceChoices((prev) => {
        // If this is a new race selection, clear all previous choices
        const newChoices = { ...prev };
        newChoices[choiceKey] = selection;
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
      }
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
    (choiceKey: string, selection: string[]) => {
      setClassChoices((prev) => {
        const newChoices = {
          ...prev,
          [choiceKey]: selection,
        };

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
        }

        return newChoices;
      });
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
      setDraft(
        (prev) =>
          ({
            ...prev,
            name,
          }) as CharacterDraft
      );

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
    setRaceChoices({});
    setClassChoices({});
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
