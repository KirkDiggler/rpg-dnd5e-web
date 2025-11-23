import { create } from '@bufbuild/protobuf';
import type {
  BackgroundInfo,
  CharacterDraft,
  ClassInfo,
  RaceInfo,
  SubclassInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  CreateDraftRequestSchema,
  FinalizeDraftRequestSchema,
  UpdateAbilityScoresRequestSchema,
  UpdateBackgroundRequestSchema,
  UpdateClassRequestSchema,
  UpdateNameRequestSchema,
  UpdateRaceRequestSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import type {
  Choice,
  ChoiceData,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  ChoiceCategory,
  ChoiceSource,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { AbilityScoresSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import {
  ArmorProficiencyCategory,
  Class,
  Language,
  Race,
  Subclass,
  Tool,
  WeaponProficiencyCategory,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { characterClient } from '../../api/client';
import {
  useCreateDraft,
  useFinalizeDraft,
  useListBackgrounds,
  useListClasses,
  useListRaces,
  useUpdateDraftAbilityScores,
  useUpdateDraftBackground,
  useUpdateDraftClass,
  useUpdateDraftName,
  useUpdateDraftRace,
} from '../../api/hooks';
import { getLanguageDisplay, getSkillDisplay } from '../../utils/enumDisplay';
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
  return proficiencies.flatMap((p) => {
    // Ensure p is a string
    const profString = typeof p === 'string' ? p : String(p);
    return [
      `${category}:${profString.toLowerCase()}`,
      profString, // Also add original format
    ];
  });
}

export function CharacterDraftProvider({ children }: { children: ReactNode }) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CharacterDraft | null>(null);
  const [currentRaceInfo, setCurrentRaceInfo] = useState<RaceInfo | null>(null);
  const [currentClassInfo, setCurrentClassInfo] = useState<
    ClassInfo | SubclassInfo | null
  >(null);
  const [currentBackgroundInfo, setCurrentBackgroundInfo] =
    useState<BackgroundInfo | null>(null);
  const [allProficiencies, setAllProficiencies] = useState<Set<string>>(
    new Set()
  );
  const [allLanguages, setAllLanguages] = useState<Set<string>>(new Set());
  const [raceChoices, setRaceChoices] = useState<ChoiceData[]>([]);
  const [classChoices, setClassChoices] = useState<ChoiceData[]>([]);
  const [backgroundChoices, setBackgroundChoices] = useState<ChoiceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Get reference data for race/class/background lookups
  const { data: availableRaces } = useListRaces({ pageSize: 50 });
  const { data: availableClasses } = useListClasses({ pageSize: 50 });
  const { data: availableBackgrounds } = useListBackgrounds({ pageSize: 50 });

  // API hooks
  const { createDraft: createDraftAPI } = useCreateDraft();
  const { updateName: updateNameAPI } = useUpdateDraftName();
  const { updateRace: updateRaceAPI } = useUpdateDraftRace();
  const { updateClass: updateClassAPI } = useUpdateDraftClass();
  const { updateBackground: updateBackgroundAPI } = useUpdateDraftBackground();
  const { updateAbilityScores: updateAbilityScoresAPI } =
    useUpdateDraftAbilityScores();
  const { finalizeDraft: finalizeDraftAPI } = useFinalizeDraft();

  // Helper to collect all proficiencies from a race
  const collectRaceProficiencies = useCallback(
    (race: RaceInfo | null, choicesOverride?: ChoiceData[]): Set<string> => {
      const proficiencies = new Set<string>();
      if (!race) return proficiencies;

      // TODO: RaceInfo no longer has proficiencies field in new proto
      // Proficiencies now come through choices only

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
        // Add tool proficiencies from choices
        if (
          choice.selection?.case === 'tools' &&
          choice.selection.value.tools
        ) {
          choice.selection.value.tools.forEach((toolEnum) => {
            const toolName = Tool[toolEnum];
            if (toolName) {
              // Convert enum name to display name (e.g., SMITH_TOOLS -> Smith's Tools)
              const displayName = toolName
                .split('_')
                .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
                .join(' ')
                .replace('Tools', "'s Tools")
                .replace('Supplies', "'s Supplies")
                .replace('Utensils', ' Utensils');
              proficiencies.add(displayName);
              proficiencies.add(`tool:${displayName.toLowerCase()}`);
            }
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
      classInfo: ClassInfo | SubclassInfo | null,
      choicesOverride?: ChoiceData[]
    ): Set<string> => {
      const proficiencies = new Set<string>();
      if (!classInfo) return proficiencies;

      // Add base proficiencies using helper
      // Convert any non-string values to strings first
      // Only ClassInfo has armor/weapon proficiency categories, not SubclassInfo
      let armorProfs: string[] | undefined;
      let weaponProfs: string[] | undefined;
      if (classInfo.$typeName === 'dnd5e.api.v1alpha1.ClassInfo') {
        const ci = classInfo as ClassInfo;
        armorProfs = ci.armorProficiencyCategories?.map(
          (p: ArmorProficiencyCategory) => String(p)
        );
        weaponProfs = ci.weaponProficiencyCategories?.map(
          (p: WeaponProficiencyCategory) => String(p)
        );
      }
      const toolProfs = classInfo.toolProficiencies?.map((p: Tool) =>
        String(p)
      );

      formatProficiencyList('armor', armorProfs).forEach((p) =>
        proficiencies.add(p)
      );
      formatProficiencyList('weapon', weaponProfs).forEach((p) =>
        proficiencies.add(p)
      );
      formatProficiencyList('tool', toolProfs).forEach((p) =>
        proficiencies.add(p)
      );
      // savingThrowProficiencies only exists on ClassInfo, not SubclassInfo
      if (classInfo.$typeName === 'dnd5e.api.v1alpha1.ClassInfo') {
        const saveProfs = (
          classInfo as ClassInfo
        ).savingThrowProficiencies?.map((p) => String(p));
        formatProficiencyList('saving-throw', saveProfs).forEach((p) =>
          proficiencies.add(p)
        );
      }

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
    if (draft?.race && availableRaces && availableRaces.length > 0) {
      // Try multiple matching strategies
      // First check if raceId matches directly (both as same type)
      let raceInfo = availableRaces.find((r) => r.raceId === draft.race);

      if (!raceInfo) {
        // Try comparing as numbers (draft.race might be number, r.raceId might be enum)
        raceInfo = availableRaces.find(
          (r) => Number(r.raceId) === Number(draft.race)
        );
      }

      if (!raceInfo) {
        // Try matching by id field directly with enum value
        raceInfo = availableRaces.find((r) => r.raceId === draft.race);
      }

      if (!raceInfo) {
        // Try matching by enum name
        const raceName = Race[draft.race];
        if (raceName) {
          if (!raceInfo) {
            // Try exact lowercase match
            raceInfo = availableRaces.find((r) => r.raceId === draft.race);
          }
        }
      }

      if (!raceInfo) {
        // Try matching by name directly
        const raceName = Race[draft.race];
        if (raceName) {
          raceInfo = availableRaces.find(
            (r) => r.name.toUpperCase().replace(/[- ]/g, '_') === raceName
          );
        }
      }

      if (!raceInfo) {
        // Try matching by name with proper case
        const raceName = Race[draft.race];
        if (raceName) {
          // Convert HUMAN to Human, HALF_ELF to Half-Elf, etc.
          const properCaseName = raceName
            .split('_')
            .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
            .join('-');
          raceInfo = availableRaces.find(
            (r) =>
              r.name === properCaseName ||
              r.name === properCaseName.replace('-', ' ')
          );
        }
      }

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
    draft?.race,
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
    if (draft?.class && availableClasses && availableClasses.length > 0) {
      // Try multiple matching strategies
      // First check if classId matches directly (both as same type)
      let classInfo = availableClasses.find((c) => c.classId === draft.class);

      if (!classInfo) {
        // Try comparing as numbers (draft.class might be number, c.classId might be enum)
        classInfo = availableClasses.find(
          (c) => Number(c.classId) === Number(draft.class)
        );
      }

      if (!classInfo) {
        // Try matching by id field directly with enum value
        classInfo = availableClasses.find((c) => c.classId === draft.class);
      }

      if (!classInfo) {
        // Try matching by enum name
        const className = Class[draft.class];
        if (className) {
          classInfo = availableClasses.find((c) => c.classId === draft.class);

          if (!classInfo) {
            // Try exact lowercase match
            classInfo = availableClasses.find((c) => c.classId === draft.class);
          }
        }
      }

      if (!classInfo) {
        // Try matching by name directly
        const className = Class[draft.class];
        if (className) {
          classInfo = availableClasses.find(
            (c) => c.name.toUpperCase().replace(/[- ]/g, '_') === className
          );
        }
      }

      if (!classInfo) {
        // Try matching by name with proper case
        const className = Class[draft.class];
        if (className) {
          // Convert FIGHTER to Fighter, etc.
          const properCaseName = className
            .split('_')
            .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
            .join(' ');
          classInfo = availableClasses.find((c) => c.name === properCaseName);
        }
      }
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
    draft?.class,
    availableClasses,
    classChoices,
    raceChoices,
    currentRaceInfo,
    collectClassProficiencies,
    collectRaceProficiencies,
    collectRaceLanguages,
  ]);

  // When draft has background ID, look it up from available backgrounds
  useEffect(() => {
    if (
      draft?.background &&
      availableBackgrounds &&
      availableBackgrounds.length > 0
    ) {
      // Only update if we don't already have the background info
      if (
        !currentBackgroundInfo ||
        currentBackgroundInfo.backgroundId !== draft.background
      ) {
        // Find the background by ID
        const backgroundInfo = availableBackgrounds.find(
          (b) =>
            b.backgroundId === draft.background ||
            Number(b.backgroundId) === Number(draft.background)
        );

        if (backgroundInfo) {
          setCurrentBackgroundInfo(backgroundInfo);
        }
      }
    }
  }, [draft?.background, availableBackgrounds, currentBackgroundInfo]);

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

        // Load background info directly from draft if available
        if (response.draft.backgroundInfo) {
          setCurrentBackgroundInfo(response.draft.backgroundInfo);
        }

        // The useEffect hooks will handle loading RaceInfo and ClassInfo from the IDs

        // Load choices from draft
        if (response.draft.choices) {
          // Group choices by source directly (no conversion needed)
          const raceChoicesFromDraft: ChoiceData[] = [];
          const classChoicesFromDraft: ChoiceData[] = [];
          const backgroundChoicesFromDraft: ChoiceData[] = [];

          response.draft.choices.forEach((choice: ChoiceData) => {
            // Group by source
            if (
              choice.source === ChoiceSource.RACE ||
              choice.source === ChoiceSource.SUBRACE
            ) {
              raceChoicesFromDraft.push(choice);
            } else if (choice.source === ChoiceSource.CLASS) {
              classChoicesFromDraft.push(choice);
            } else if (choice.source === ChoiceSource.BACKGROUND) {
              backgroundChoicesFromDraft.push(choice);
            }
          });

          // Use the grouped choices we just processed
          setRaceChoices(raceChoicesFromDraft);
          setClassChoices(classChoicesFromDraft);
          setBackgroundChoices(backgroundChoicesFromDraft);

          // The useEffect hooks will recalculate proficiencies and languages once the race/class are loaded
        }
      } else {
        console.warn('⚠️ No draft found in response');
      }
    } catch (err) {
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

      // Update draft with race enum
      setDraft(
        (prev) =>
          ({
            ...prev,
            race: race?.raceId || Race.UNSPECIFIED,
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
    async (
      classInfo: ClassInfo | SubclassInfo | null,
      choices?: ChoiceData[]
    ) => {
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
            class:
              classInfo?.$typeName === 'dnd5e.api.v1alpha1.ClassInfo'
                ? (classInfo as ClassInfo).classId
                : Class.UNSPECIFIED,
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
          // Use provided ChoiceData directly or convert from state
          let classChoiceData: ChoiceData[];
          if (choices && choices.length > 0) {
            classChoiceData = choices;
          } else {
            // Use the stored ChoiceData directly
            classChoiceData = classChoices;
          }

          // Check if this is a combined class+subclass object
          const hasSelectedSubclass = 'selectedSubclass' in classInfo;
          let baseClassName: string;
          let subclassEnum: Subclass | undefined;

          if (hasSelectedSubclass) {
            // This is a ClassInfo with selectedSubclass property
            const combinedData = classInfo as ClassInfo & {
              selectedSubclass: SubclassInfo;
            };
            baseClassName = combinedData.name;
            // Use the enum directly from SubclassInfo
            subclassEnum = combinedData.selectedSubclass.subclassId;
          } else {
            // This is just a base ClassInfo (no subclass selected)
            baseClassName = classInfo.name;
            subclassEnum = undefined;
          }

          const request = create(UpdateClassRequestSchema, {
            draftId,
            class: getClassEnum(baseClassName),
            classChoices: classChoiceData,
            subclass: subclassEnum,
          });

          const response = await updateClassAPI(request);

          // Update local state with the response choices
          // The backend returns the full ChoiceData including resolved equipment items
          // Filter for class choices (source = CLASS)
          if (response?.draft?.choices) {
            const updatedClassChoices = response.draft.choices.filter(
              (c) => c.source === ChoiceSource.CLASS
            );
            setClassChoices(updatedClassChoices);
          }
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

  const setBackground = useCallback(
    async (backgroundInfo: BackgroundInfo | null, choices?: ChoiceData[]) => {
      // Don't proceed if no draft exists yet
      if (!draftId) {
        console.warn('Cannot set background: no draft ID available yet');
        return;
      }

      // Clear background choices when changing background
      if (
        !backgroundInfo ||
        (currentBackgroundInfo &&
          currentBackgroundInfo.name !== backgroundInfo?.name)
      ) {
        setBackgroundChoices([]);
      }

      // If choices are provided, update state
      if (choices && choices.length > 0) {
        setBackgroundChoices(choices);
      }

      // Store the full BackgroundInfo immediately
      setCurrentBackgroundInfo(backgroundInfo);

      setDraft(
        (prev) =>
          ({
            ...prev,
            background: backgroundInfo?.backgroundId || undefined,
            backgroundInfo: backgroundInfo || undefined,
          }) as CharacterDraft
      );

      // Update proficiencies and languages when background changes
      // TODO: Collect background proficiencies and languages once we understand the structure

      // API call to update background
      if (!saving) {
        setSaving(true);
        try {
          const backgroundChoiceData = choices || backgroundChoices;

          const request = create(UpdateBackgroundRequestSchema, {
            draftId,
            background: backgroundInfo?.backgroundId || 0, // UNSPECIFIED
            backgroundChoices: backgroundChoiceData,
          });

          console.log('🚀 UpdateBackgroundRequest:', {
            draftId,
            background: backgroundInfo?.name || 'none',
            backgroundChoicesCount: backgroundChoiceData.length,
          });

          const response = await updateBackgroundAPI(request);

          if (response.draft) {
            setDraft(response.draft);
            // If server doesn't return backgroundInfo but has background ID, don't clear our local state
            if (
              !response.draft.backgroundInfo &&
              response.draft.background &&
              backgroundInfo
            ) {
              // Keep the backgroundInfo we already have
              setCurrentBackgroundInfo(backgroundInfo);
            } else {
              // Update from the returned draft
              setCurrentBackgroundInfo(response.draft.backgroundInfo || null);
            }
            // Update choices from response if available
            // backgroundChoices field no longer exists in CharacterDraft
            // if (response.draft.backgroundChoices) {
            //   setBackgroundChoices(response.draft.backgroundChoices);
            // }
          }
        } catch (error) {
          console.error('Failed to update background:', error);
          setError(
            error instanceof Error
              ? error
              : new Error('Failed to update background')
          );
        } finally {
          setSaving(false);
        }
      }
    },
    [
      draftId,
      updateBackgroundAPI,
      saving,
      currentBackgroundInfo,
      backgroundChoices,
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

  const addBackgroundChoice = useCallback((choice: ChoiceData) => {
    console.group('🎯 Adding background choice');
    console.log('📝 Choice:', choice);

    setBackgroundChoices((prev) => {
      // Replace any existing choice with the same ID
      const filtered = prev.filter((c) => c.choiceId !== choice.choiceId);
      const newChoices = [...filtered, choice];
      console.log('📋 Updated background choices:', newChoices);
      return newChoices;
    });
    console.groupEnd();
  }, []);

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
    setCurrentBackgroundInfo(null);
    setAllProficiencies(new Set());
    setAllLanguages(new Set());
    setRaceChoices([]);
    setClassChoices([]);
    setBackgroundChoices([]);
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
    backgroundInfo: currentBackgroundInfo,
    allProficiencies,
    allLanguages,
    raceChoices,
    classChoices,
    backgroundChoices,
    loading,
    saving,
    error,
    createDraft,
    loadDraft,
    setRace,
    setClass,
    setBackground,
    setName,
    setAbilityScores,
    finalizeDraft,
    addRaceChoice,
    addClassChoice,
    addBackgroundChoice,
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
