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
  CantripListSchema,
  ChoiceCategory,
  ChoiceDataSchema,
  ChoiceSource,
  CreateDraftRequestSchema,
  EquipmentListSchema,
  LanguageListSchema,
  SkillListSchema,
  SpellListSchema,
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
import { useCallback, useState } from 'react';
import { characterClient } from '../../api/client';
import {
  useCreateDraft,
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

// Helper to convert our choice format to ChoiceData
function createChoiceSelections(
  choices: Record<string, string[]>,
  source: ChoiceSource
): ChoiceData[] {
  const selections: ChoiceData[] = [];

  Object.entries(choices).forEach(([choiceId, selectedKeys]) => {
    if (selectedKeys.length > 0) {
      // Determine the selection type and category based on the choiceId
      let selection: ChoiceData['selection'];
      let category = ChoiceCategory.UNSPECIFIED;

      if (choiceId.includes('skill')) {
        category = ChoiceCategory.SKILLS;
        selection = {
          case: 'skills',
          value: create(SkillListSchema, { skills: selectedKeys }),
        };
      } else if (choiceId.includes('language')) {
        category = ChoiceCategory.LANGUAGES;
        selection = {
          case: 'languages',
          value: create(LanguageListSchema, { languages: selectedKeys }),
        };
      } else if (choiceId.includes('cantrip')) {
        category = ChoiceCategory.CANTRIPS;
        selection = {
          case: 'cantrips',
          value: create(CantripListSchema, { cantrips: selectedKeys }),
        };
      } else if (choiceId.includes('spell')) {
        category = ChoiceCategory.SPELLS;
        selection = {
          case: 'spells',
          value: create(SpellListSchema, { spells: selectedKeys }),
        };
      } else if (choiceId.includes('equipment')) {
        category = ChoiceCategory.EQUIPMENT;
        selection = {
          case: 'equipment',
          value: create(EquipmentListSchema, {
            items: selectedKeys,
          }),
        };
      } else {
        // Default to name for other choices
        selection = {
          case: 'name',
          value: selectedKeys[0] || '',
        };
      }

      selections.push(
        create(ChoiceDataSchema, {
          choiceId,
          source,
          category,
          selection,
        })
      );
    }
  });

  return selections;
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

  // API hooks
  const { createDraft: createDraftAPI } = useCreateDraft();
  const { updateName: updateNameAPI } = useUpdateDraftName();
  const { updateRace: updateRaceAPI } = useUpdateDraftRace();
  const { updateClass: updateClassAPI } = useUpdateDraftClass();
  const { updateAbilityScores: updateAbilityScoresAPI } =
    useUpdateDraftAbilityScores();

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

  const loadDraft = useCallback(
    async (id: string) => {
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

          // Load race info if race is set - it's already a RaceInfo object!
          if (response.draft.race) {
            setCurrentRaceInfo(response.draft.race);
          }
          // Note: In v0.1.24+ we also have draft.raceId as Race enum

          // Load class info if class is set - it's already a ClassInfo object!
          if (response.draft.class) {
            setCurrentClassInfo(response.draft.class);
          }
          // Note: In v0.1.24+ we also have draft.classId as Class enum

          // Load choices from draft
          if (response.draft.choices) {
            // Group choices by source
            const raceChoicesFromDraft: Record<string, string[]> = {};
            const classChoicesFromDraft: Record<string, string[]> = {};

            response.draft.choices.forEach((choice: ChoiceData) => {
              // Extract selections from the new ChoiceData structure
              const selections: string[] = [];

              // Handle the oneof selection pattern
              if (choice.selection) {
                switch (choice.selection.case) {
                  case 'name':
                    selections.push(choice.selection.value);
                    break;
                  case 'skills':
                    // Convert skill enums to strings
                    if (choice.selection.value.skills) {
                      choice.selection.value.skills.forEach((skill: Skill) => {
                        selections.push(skill.toString());
                      });
                    }
                    break;
                  case 'languages':
                    // Convert language enums to strings
                    if (choice.selection.value.languages) {
                      choice.selection.value.languages.forEach(
                        (lang: Language) => {
                          selections.push(lang.toString());
                        }
                      );
                    }
                    break;
                  case 'equipment':
                    // Equipment is stored as EquipmentList
                    if (choice.selection.value.items) {
                      choice.selection.value.items.forEach(
                        (item: { name?: string; toString: () => string }) => {
                          selections.push(item.name || item.toString());
                        }
                      );
                    }
                    break;
                  case 'fightingStyle':
                    selections.push(choice.selection.value);
                    break;
                  case 'spells':
                    // Handle spell selections
                    if (choice.selection.value.spells) {
                      choice.selection.value.spells.forEach((spell: string) => {
                        selections.push(spell.toString());
                      });
                    }
                    break;
                  case 'cantrips':
                    // Handle cantrip selections
                    if (choice.selection.value.cantrips) {
                      choice.selection.value.cantrips.forEach(
                        (cantrip: string) => {
                          selections.push(cantrip.toString());
                        }
                      );
                    }
                    break;
                  // Other cases like race, class, background are not choices but actual selections
                }
              }

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

            // Now recalculate proficiencies and languages with the loaded choices
            const allProfs = new Set<string>();
            const allLangs = new Set<string>();

            if (response.draft.race) {
              const raceProficiencies = collectRaceProficiencies(
                response.draft.race,
                raceChoicesFromDraft
              );
              const raceLanguages = collectRaceLanguages(
                response.draft.race,
                raceChoicesFromDraft
              );
              raceProficiencies.forEach((p) => allProfs.add(p));
              raceLanguages.forEach((l) => allLangs.add(l));
            }

            if (response.draft.class) {
              const classProficiencies = collectClassProficiencies(
                response.draft.class,
                classChoicesFromDraft
              );
              classProficiencies.forEach((p) => allProfs.add(p));
            }

            setAllProficiencies(allProfs);
            setAllLanguages(allLangs);
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error('Failed to load draft')
        );
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [collectRaceProficiencies, collectRaceLanguages, collectClassProficiencies]
  );

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
          // Convert our choices to ChoiceSelection format
          // Use provided choices or fall back to state
          const choicesToSend = choices || raceChoices;
          const raceChoiceSelections = createChoiceSelections(
            choicesToSend,
            ChoiceSource.RACE
          );

          const request = create(UpdateRaceRequestSchema, {
            draftId,
            race: getRaceEnum(race.name),
            raceChoices: raceChoiceSelections,
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
          // Convert our choices to ChoiceSelection format
          // Use provided choices or fall back to state
          const choicesToSend = choices || classChoices;
          const classChoiceSelections = createChoiceSelections(
            choicesToSend,
            ChoiceSource.CLASS
          );

          const request = create(UpdateClassRequestSchema, {
            draftId,
            class: getClassEnum(classInfo.name),
            classChoices: classChoiceSelections,
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
