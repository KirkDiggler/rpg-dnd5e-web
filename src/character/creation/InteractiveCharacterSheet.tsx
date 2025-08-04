import type { Step } from '@/components/ProgressTracker';
import { ProgressTracker } from '@/components/ProgressTracker';
import type {
  ClassInfo,
  RaceInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Language } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import type { ClassChoices } from './ClassSelectionModal';
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
  classChoices?: ClassChoices;
  raceChoices?: Record<string, string[]>; // TODO: Import RaceChoices type when available
  [key: string]: unknown; // Allow other choice types
}

// Helper to convert Language enum to display name
// Constants
const EQUIPMENT_FILTER_ITEMS = [
  'chain mail',
  'bundle_0',
  'dungeoneers pack',
  'equipment_warhammer',
];

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

// Helper function to format and group proficiencies
function formatProficiencies(proficiencies: Set<string>): string {
  const proficiencyMap = new Map<string, string>();

  Array.from(proficiencies)
    .filter((p) => {
      // Filter out objects (stringified ChoiceSelection)
      if (typeof p === 'string' && p.includes('"$typeName"')) return false;

      // Filter out language choices
      if (p.includes('language_')) return false;

      // Filter out equipment items
      const lowerP = p.toLowerCase();
      if (EQUIPMENT_FILTER_ITEMS.some((item) => lowerP.includes(item)))
        return false;
      if (lowerP.includes('bundle') || lowerP.includes('pack')) return false;

      // Filter out specific equipment patterns
      if (p.match(/^(Chain Mail|Dungeoneers Pack|Bundle_\d+)/)) return false;

      // Filter out fighting styles and other non-proficiency items
      if (lowerP.includes('fighting style')) return false;

      return true;
    })
    .forEach((p) => {
      // Extract the core proficiency name
      let cleaned = p;
      let category = '';

      // Extract category and clean the name
      if (p.toLowerCase().includes('armor:')) {
        category = 'Armor: ';
        cleaned = p.replace(/armor:/i, '');
      } else if (p.toLowerCase().includes('weapon:')) {
        category = 'Weapons: ';
        cleaned = p.replace(/weapon:/i, '');
      } else if (p.toLowerCase().includes('tool:')) {
        category = 'Tools: ';
        cleaned = p.replace(/tool:/i, '');
      } else if (
        p.toLowerCase().includes('saving-throw:') ||
        p.toLowerCase().includes('saving throw:')
      ) {
        category = 'Saving Throws: ';
        cleaned = p.replace(/saving[- ]throw:/i, '');
      } else if (p.toLowerCase().includes('skill:')) {
        category = 'Skills: ';
        cleaned = p.replace(/skill:/i, '');
      }

      // Clean up the proficiency name
      cleaned = cleaned
        .replace(/^proficiency_\w+:?\s*/i, '')
        .replace(/-/g, ' ')
        .trim();

      // Handle special cases
      if (cleaned.toLowerCase() === 'sleight of hand') {
        cleaned = 'Sleight of Hand';
      } else if (cleaned.toLowerCase() === 'animal handling') {
        cleaned = 'Animal Handling';
      } else if (cleaned.toLowerCase() === 'str') {
        cleaned = 'Strength';
      } else if (cleaned.toLowerCase() === 'con') {
        cleaned = 'Constitution';
      } else {
        // Capitalize each word
        cleaned = cleaned.replace(/\b\w/g, (l) => l.toUpperCase());
      }

      // Use the cleaned name as key to avoid duplicates
      const key = category + cleaned.toLowerCase();
      if (!proficiencyMap.has(key) && cleaned.length > 0) {
        proficiencyMap.set(key, cleaned);
      }
    });

  // Group by category
  const skills: string[] = [];
  const armor: string[] = [];
  const weapons: string[] = [];
  const tools: string[] = [];
  const savingThrows: string[] = [];
  const other: string[] = [];

  proficiencyMap.forEach((value, key) => {
    if (key.startsWith('Skills:')) skills.push(value);
    else if (key.startsWith('Armor:')) armor.push(value);
    else if (key.startsWith('Weapons:')) weapons.push(value);
    else if (key.startsWith('Tools:')) tools.push(value);
    else if (key.startsWith('Saving Throws:')) savingThrows.push(value);
    else other.push(value);
  });

  // Build the display string
  const parts: string[] = [];
  if (skills.length > 0) parts.push(`Skills: ${skills.join(', ')}`);
  if (armor.length > 0) parts.push(`Armor: ${armor.join(', ')}`);
  if (weapons.length > 0) parts.push(`Weapons: ${weapons.join(', ')}`);
  if (tools.length > 0) parts.push(`Tools: ${tools.join(', ')}`);
  if (savingThrows.length > 0)
    parts.push(`Saving Throws: ${savingThrows.join(', ')}`);
  if (other.length > 0) parts.push(other.join(', '));

  return parts.join(' • ');
}

// Helper function to get extra languages
function getExtraLanguages(
  allLanguages: Set<string>,
  baseLanguages: Language[]
): string[] {
  return Array.from(allLanguages)
    .filter((lang) => {
      // Filter out objects (stringified ChoiceSelection)
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
  characterName: '',
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
    if (draft.draft?.name) {
      setCharacter((prev) => ({
        ...prev,
        characterName: draft.draft?.name || '',
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
      // Parse the flat classChoices into structured format
      const structuredClassChoices: ClassChoices = {
        proficiencies: {},
        features: {},
        equipment: {},
        className: draft.classInfo?.name,
      };

      // Parse draft.classChoices which is Record<string, string[]>
      Object.entries(draft.classChoices || {}).forEach(([key, values]) => {
        if (key.includes('equipment')) {
          // Equipment choices - single selection
          structuredClassChoices.equipment[key] = values[0] || '';
        } else if (key.startsWith('feature_')) {
          // Feature choices - format: feature_featureId_choiceId
          const parts = key.split('_');
          if (parts.length >= 3) {
            const featureId = parts[1];
            const choiceId = parts.slice(2).join('_');
            if (!structuredClassChoices.features[featureId]) {
              structuredClassChoices.features[featureId] = {};
            }
            structuredClassChoices.features[featureId][choiceId] = values;
          }
        } else {
          // Default to proficiencies (includes skills, tools, etc.)
          structuredClassChoices.proficiencies[key] = values;
        }
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
    draft.draft?.name,
    draft.draft?.abilityScores,
    draft.raceChoices,
    draft.classChoices,
  ]);

  // Get classChoices from character state
  const classChoices = character.choices?.classChoices || ({} as ClassChoices);

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

    // Check if any level1Features have choices that need selection
    const hasFeatureChoices =
      character.selectedClass?.level1Features?.some((feature) => {
        return (
          feature.hasChoices && feature.choices && feature.choices.length > 0
        );
      }) || false;

    // Check if all feature choices have been made
    const hasFeatureChoicesSelected =
      !hasFeatureChoices ||
      (character.selectedClass?.level1Features?.every((feature) => {
        if (
          !feature.hasChoices ||
          !feature.choices ||
          feature.choices.length === 0
        ) {
          return true; // No choice needed
        }
        // Check if this feature has a selection in the features object
        const featureSelections = classChoices.features || {};
        return featureSelections[feature.id] !== undefined;
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
    classChoices.features,
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

    // First check the local state equipment choices
    if (character.selectedClass?.choices && character.equipmentChoices) {
      const equipmentChoices = character.selectedClass.choices.filter(
        (choice) => choice.choiceType === 1 // EQUIPMENT type
      );

      equipmentChoices.forEach((choice) => {
        const selection = (
          character.equipmentChoices as Record<string, string>
        )[choice.id];
        if (selection) {
          // Parse the selection format - could be:
          // "0" - simple selection index
          // "0:Longsword" - selection with nested choice
          const parts = selection.split(':');
          const optionIndex = parseInt(parts[0]);
          const nestedSelection = parts[1];

          // Get the actual option from the choice
          if (
            choice.optionSet.case === 'explicitOptions' &&
            choice.optionSet.value.options[optionIndex]
          ) {
            const option = choice.optionSet.value.options[optionIndex];

            if (option.optionType.case === 'countedItem') {
              const item = option.optionType.value;
              equipment.push(item.name);
            } else if (option.optionType.case === 'bundle') {
              const bundle = option.optionType.value;
              // For bundles, show the items or the nested selection
              if (nestedSelection) {
                equipment.push(nestedSelection);
              } else {
                // Show the first few items from the bundle
                bundle.items.forEach((bundleItem) => {
                  if (bundleItem.itemType?.case === 'concreteItem') {
                    equipment.push(bundleItem.itemType.value.name);
                  }
                });
              }
            } else if (
              option.optionType.case === 'nestedChoice' &&
              nestedSelection
            ) {
              equipment.push(nestedSelection);
            } else {
              // Fallback to the selection value if we can't parse it
              equipment.push(selection);
            }
          }
        }
      });
    }

    // Also check the draft context for equipment choices
    if (draft.classChoices && character.selectedClass?.choices) {
      // Get equipment choices from the class definition
      const equipmentChoices = character.selectedClass.choices.filter(
        (choice) => choice.choiceType === 1 // EQUIPMENT type
      );

      // Check each equipment choice ID in the draft choices
      equipmentChoices.forEach((choice) => {
        const values = draft.classChoices[choice.id];
        if (Array.isArray(values) && values.length > 0) {
          values.forEach((item) => {
            if (item && !equipment.includes(item)) {
              // Skip generic bundle references if we have more specific items
              if (
                item === 'bundle_0' &&
                values.some((v) => v.includes('bundle_0:'))
              ) {
                return;
              }

              equipment.push(item);
            }
          });
        }
      });
    }

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
                value={character.characterName}
                onChange={(e) =>
                  setCharacter((prev) => ({
                    ...prev,
                    characterName: e.target.value,
                  }))
                }
                placeholder="Enter your character's name..."
                className="w-full p-4 text-xl font-serif rounded-lg border-2 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: character.characterName
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
                      {(() => {
                        console.log('InteractiveCharacterSheet race display:');
                        console.log('- selectedRace:', character.selectedRace);
                        console.log(
                          '- allProficiencies:',
                          draft.allProficiencies
                        );
                        console.log('- allLanguages:', draft.allLanguages);
                        console.log('- raceChoices:', draft.raceChoices);
                        return null;
                      })()}
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
                          {draft.allProficiencies.size > 0 && (
                            <div style={{ color: 'var(--text-primary)' }}>
                              <span
                                style={{
                                  color: 'var(--text-muted)',
                                  fontSize: '11px',
                                  opacity: 0.7,
                                }}
                              >
                                Proficiencies:
                              </span>{' '}
                              {formatProficiencies(draft.allProficiencies)}
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
                        {classChoices.proficiencies &&
                          Object.values(classChoices.proficiencies).flat()
                            .length > 0 && (
                            <div style={{ color: 'var(--text-primary)' }}>
                              <span
                                style={{
                                  color: 'var(--text-primary)',
                                  opacity: 0.7,
                                }}
                              >
                                Chosen Skills:
                              </span>{' '}
                              {Object.values(classChoices.proficiencies)
                                .flat()
                                .map((skill) => {
                                  // Convert skill index back to display name
                                  if (
                                    typeof skill === 'string' &&
                                    skill.match(/^\d+$/)
                                  ) {
                                    const index = parseInt(skill);
                                    const skillOptions =
                                      character.selectedClass
                                        ?.availableSkills || [];
                                    const rawSkill =
                                      skillOptions[index] || skill;
                                    // Format the skill name properly
                                    return rawSkill
                                      .replace(/-/g, ' ')
                                      .replace(/\b\w/g, (l) => l.toUpperCase());
                                  }
                                  // Format non-index skills too
                                  return skill
                                    .replace(/-/g, ' ')
                                    .replace(/\b\w/g, (l) => l.toUpperCase());
                                })
                                .join(', ')}
                            </div>
                          )}
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
          {character.characterName && (
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
                  {character.characterName}
                </span>
                {character.selectedRace && `, a ${character.selectedRace.name}`}
                {character.selectedClass && ` ${character.selectedClass.name}`}
                {character.characterName && ', ready for adventure!'}
              </p>
            </motion.div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between items-center pt-4">
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Build your character by clicking sections above
            </div>

            <motion.button
              onClick={() => onComplete()}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-8 py-3 text-lg font-bold rounded-lg transition-all"
              style={{
                backgroundColor: 'var(--accent-primary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            >
              ⚔️ Begin Adventure!
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

          // Format choices for the draft context
          const formattedChoices: Record<string, string[]> = {};

          if (choices.languages) {
            Object.entries(choices.languages).forEach(([key, values]) => {
              formattedChoices[key] = values;
            });
          }
          if (choices.proficiencies) {
            Object.entries(choices.proficiencies).forEach(([key, values]) => {
              formattedChoices[key] = values;
            });
          }

          // Set race with choices
          draft.setRace(race, formattedChoices);
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

          // Format choices for the draft context
          const formattedChoices: Record<string, string[]> = {};

          // Add proficiency choices
          if (choices.proficiencies && choices.className === classData.name) {
            Object.entries(choices.proficiencies).forEach(([key, values]) => {
              formattedChoices[key] = values;
            });
          }

          // Add feature choices
          if (choices.features) {
            Object.entries(choices.features).forEach(
              ([featureId, featureChoices]) => {
                Object.entries(featureChoices).forEach(
                  ([choiceKey, values]) => {
                    formattedChoices[`${featureId}_${choiceKey}`] = values;
                  }
                );
              }
            );
          }

          // Add equipment choices
          if (choices.equipment) {
            Object.entries(choices.equipment).forEach(([key, value]) => {
              // Equipment choices are single selections, so wrap in array
              formattedChoices[key] = [value];
            });
          }

          // Save class to API with choices
          try {
            await draft.setClass(classData, formattedChoices);
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
