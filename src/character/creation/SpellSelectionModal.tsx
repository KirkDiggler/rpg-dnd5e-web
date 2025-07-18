import { useCharacterService } from '@/services/useCharacterService';
import type {
  FeatureInfo,
  Spell,
  SpellcastingInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Class } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Clock,
  Eye,
  Flame,
  Heart,
  Search,
  Shield,
  Sparkles,
  Swords,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface SpellSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  spellcastingInfo: SpellcastingInfo;
  className: string;
  level1Features?: FeatureInfo[];
  currentSpells?: string[];
  onSelect: (spells: string[]) => void;
}

// Spell categories for novice players
const SPELL_CATEGORIES = {
  damage: {
    label: 'Damage',
    icon: Swords,
    color: '#E74C3C',
    description: 'Spells that hurt enemies',
  },
  healing: {
    label: 'Healing',
    icon: Heart,
    color: '#27AE60',
    description: 'Spells that restore health',
  },
  utility: {
    label: 'Utility',
    icon: Eye,
    color: '#3498DB',
    description: 'Spells for exploration and problem-solving',
  },
  defense: {
    label: 'Defense',
    icon: Shield,
    color: '#9B59B6',
    description: 'Spells that protect you and allies',
  },
} as const;

type SpellCategory = keyof typeof SPELL_CATEGORIES;

// Helper to map class name to enum
function getClassEnum(className: string): Class | undefined {
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
  return classMap[className];
}

// Helper to categorize spells for beginners
function categorizeSpell(spell: Spell): SpellCategory {
  const desc = spell.description.toLowerCase();

  // Simple heuristics for categorization
  if (
    desc.includes('damage') ||
    (desc.includes('hit points') && !desc.includes('regain'))
  ) {
    return 'damage';
  }
  if (
    desc.includes('heal') ||
    desc.includes('regain') ||
    desc.includes('restore')
  ) {
    return 'healing';
  }
  if (
    desc.includes('shield') ||
    desc.includes('armor') ||
    desc.includes('protect')
  ) {
    return 'defense';
  }
  return 'utility';
}

// Component for detailed spell card
function SpellCard({
  spell,
  isSelected,
  onToggle,
  disabled,
}: {
  spell: Spell;
  isSelected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const category = categorizeSpell(spell);
  const CategoryIcon = SPELL_CATEGORIES[category].icon;

  const getSpellSchoolIcon = (school: string) => {
    const schoolIcons: Record<string, typeof Flame> = {
      evocation: Flame,
      abjuration: Shield,
      conjuration: Sparkles,
      divination: Eye,
      enchantment: Heart,
      illusion: Wind,
      necromancy: BookOpen,
      transmutation: Zap,
    };
    return schoolIcons[school.toLowerCase()] || BookOpen;
  };

  const SchoolIcon = getSpellSchoolIcon(spell.school);

  return (
    <motion.div
      layout
      whileHover={{ scale: 1.02 }}
      className={`relative rounded-lg border-2 transition-all cursor-pointer ${
        isSelected
          ? 'border-purple-500 shadow-lg shadow-purple-500/20'
          : 'border-gray-600 hover:border-gray-500'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      style={{
        backgroundColor: isSelected
          ? 'rgba(147, 51, 234, 0.1)'
          : 'var(--bg-secondary)',
      }}
      onClick={() => !disabled && onToggle()}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <CategoryIcon
                className="w-5 h-5"
                style={{ color: SPELL_CATEGORIES[category].color }}
              />
              <h3 className="text-lg font-semibold text-white">{spell.name}</h3>
              {spell.level === 0 && (
                <span className="px-2 py-0.5 bg-purple-800 text-purple-200 text-xs rounded">
                  Cantrip
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <div className="flex items-center gap-1">
                <SchoolIcon className="w-4 h-4" />
                <span className="capitalize">{spell.school}</span>
              </div>
              {spell.ritual && (
                <span className="px-2 py-0.5 bg-indigo-800 text-indigo-200 text-xs rounded">
                  Ritual
                </span>
              )}
              {spell.concentration && (
                <span className="px-2 py-0.5 bg-orange-800 text-orange-200 text-xs rounded">
                  Concentration
                </span>
              )}
            </div>
          </div>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => e.stopPropagation()}
            className="w-5 h-5 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500 mt-1"
            disabled={disabled}
          />
        </div>

        {/* Quick Info */}
        <div className="grid grid-cols-3 gap-2 text-xs text-gray-400 mb-3">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {spell.castingTime}
          </div>
          <div>Range: {spell.range}</div>
          <div>Duration: {spell.duration}</div>
        </div>

        {/* Full Description */}
        <p className="text-sm text-gray-300">{spell.description}</p>

        {/* Damage info if available */}
        {spell.damage && (
          <div className="mt-2 p-2 bg-gray-900 rounded">
            <div className="text-xs text-gray-300">
              <strong className="text-orange-400">Damage:</strong>{' '}
              {spell.damage.damageType}
              {spell.damage.damageAtSlotLevel &&
                spell.damage.damageAtSlotLevel.length > 0 && (
                  <span className="ml-2">
                    (
                    {spell.damage.damageAtSlotLevel.find(
                      (d) => d.slotLevel === spell.level
                    )?.damageDice || 'varies'}
                    )
                  </span>
                )}
            </div>
          </div>
        )}

        {/* Components */}
        {spell.components && (
          <div className="mt-2 text-xs text-gray-500">
            Components: {spell.components}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function SpellSelectionModal({
  isOpen,
  onClose,
  spellcastingInfo,
  className,
  level1Features = [],
  currentSpells = [],
  onSelect,
}: SpellSelectionModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevel, setSelectedLevel] = useState(0); // 0 for cantrips
  const [selectedCategory, setSelectedCategory] = useState<
    SpellCategory | 'all'
  >('all');
  const [selectedSpells, setSelectedSpells] = useState<Set<string>>(
    new Set(currentSpells)
  );
  const [allSpells, setAllSpells] = useState<Map<number, Spell[]>>(new Map()); // Store spells by level
  const [loading, setLoading] = useState(false);
  const [hasLoadedInitialSpells, setHasLoadedInitialSpells] = useState(false);

  const { listSpellsByLevel } = useCharacterService();

  // Extract spell selection requirements from features
  const getSpellSelectionForLevel = (level: number) => {
    for (const feature of level1Features) {
      if (
        feature.spellSelection &&
        feature.spellSelection.spellLevels.includes(level)
      ) {
        return feature.spellSelection;
      }
    }
    return null;
  };

  const loadSpellsForLevel = useCallback(
    async (level: number) => {
      // Don't reload if we already have spells for this level
      if (allSpells.has(level)) return;

      setLoading(true);
      try {
        const classEnum = getClassEnum(className);
        const response = await listSpellsByLevel({
          level,
          class: classEnum,
        });
        setAllSpells((prev) => new Map(prev).set(level, response.spells || []));
      } catch (error) {
        console.error('Failed to load spells:', error);
        setAllSpells((prev) => new Map(prev).set(level, []));
      } finally {
        setLoading(false);
      }
    },
    [listSpellsByLevel, className, allSpells]
  );

  // Load initial spells when modal opens
  useEffect(() => {
    if (isOpen && !hasLoadedInitialSpells) {
      // Load cantrips and level 1 spells on first open
      loadSpellsForLevel(0);
      if (spellcastingInfo.spellSlotsLevel1 > 0) {
        loadSpellsForLevel(1);
      }
      setHasLoadedInitialSpells(true);
    }
  }, [
    isOpen,
    hasLoadedInitialSpells,
    loadSpellsForLevel,
    spellcastingInfo.spellSlotsLevel1,
  ]);

  // Load spells for selected level if not already loaded
  useEffect(() => {
    if (isOpen && !allSpells.has(selectedLevel)) {
      loadSpellsForLevel(selectedLevel);
    }
  }, [isOpen, selectedLevel, allSpells, loadSpellsForLevel]);

  const availableSpells = allSpells.get(selectedLevel) || [];

  const filteredSpells = availableSpells.filter((spell) => {
    const matchesSearch = spell.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === 'all' || categorizeSpell(spell) === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const canSelectMore = () => {
    // Find all selected spells at the current level across all loaded spells
    const currentLevelSpells = Array.from(selectedSpells).filter((id) => {
      // Check all spell levels to find this spell
      for (const [, spells] of allSpells) {
        const spell = spells.find((s) => s.id === id);
        if (spell && spell.level === selectedLevel) {
          return true;
        }
      }
      return false;
    });

    if (selectedLevel === 0) {
      // Check if we have feature-based spell selection for cantrips
      const spellSelection = getSpellSelectionForLevel(0);
      if (spellSelection) {
        return currentLevelSpells.length < spellSelection.spellsToSelect;
      }
      return currentLevelSpells.length < spellcastingInfo.cantripsKnown;
    } else if (selectedLevel === 1) {
      // Use feature-based spell selection if available
      const spellSelection = getSpellSelectionForLevel(1);
      if (spellSelection) {
        return currentLevelSpells.length < spellSelection.spellsToSelect;
      }
      // Fallback to spellsKnown from spellcasting info
      return currentLevelSpells.length < (spellcastingInfo.spellsKnown || 0);
    }
    return false;
  };

  const toggleSpellSelection = (spellId: string) => {
    const spell = availableSpells.find((s) => s.id === spellId);
    if (!spell) return;

    const newSelection = new Set(selectedSpells);
    if (newSelection.has(spellId)) {
      newSelection.delete(spellId);
    } else if (canSelectMore()) {
      newSelection.add(spellId);
    }
    setSelectedSpells(newSelection);
  };

  const handleConfirm = () => {
    onSelect(Array.from(selectedSpells));
    onClose();
  };

  const getSelectedCount = (level: number) => {
    return Array.from(selectedSpells).filter((id) => {
      // Check all spell levels to find this spell
      for (const [, spells] of allSpells) {
        const spell = spells.find((s) => s.id === id);
        if (spell && spell.level === level) {
          return true;
        }
      }
      return false;
    }).length;
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-6xl h-[90vh] overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '3px solid var(--border-primary)',
            borderRadius: '1rem',
            boxShadow: 'var(--shadow-modal)',
          }}
        >
          <Dialog.Title className="sr-only">
            Select {className} Spells
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Choose spells for your {className} character. You can select{' '}
            {spellcastingInfo.cantripsKnown} cantrips
            {spellcastingInfo.spellSlotsLevel1 > 0
              ? ` and ${className === 'Wizard' ? 6 : spellcastingInfo.spellsKnown || 0} level 1 spells`
              : ''}
            . Use the tabs to switch between spell levels and the filter buttons
            to find spells by type.
          </Dialog.Description>
          <div className="flex flex-col h-full">
            {/* Header */}
            <div
              className="p-6 border-b"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <BookOpen
                    className="w-8 h-8"
                    style={{ color: 'var(--accent-primary)' }}
                  />
                  <div>
                    <h2
                      className="text-2xl font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Select {className} Spells
                    </h2>
                    <p
                      className="text-sm"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Choose your starting spells carefully - they define your
                      magical abilities!
                    </p>
                  </div>
                </div>
                <Dialog.Close
                  className="p-2 rounded-lg transition-colors hover:bg-gray-800"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <X className="w-5 h-5" />
                </Dialog.Close>
              </div>

              {/* Level Tabs */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setSelectedLevel(0)}
                  className={`px-4 py-2 rounded-lg transition-all font-medium ${
                    selectedLevel === 0
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  <Sparkles className="w-4 h-4 inline mr-2" />
                  Cantrips ({getSelectedCount(0)}/
                  {getSpellSelectionForLevel(0)?.spellsToSelect ||
                    spellcastingInfo.cantripsKnown}
                  )
                </button>
                {spellcastingInfo.spellSlotsLevel1 > 0 && (
                  <button
                    onClick={() => setSelectedLevel(1)}
                    className={`px-4 py-2 rounded-lg transition-all font-medium ${
                      selectedLevel === 1
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    <Zap className="w-4 h-4 inline mr-2" />
                    Level 1 Spells ({getSelectedCount(1)}/
                    {getSpellSelectionForLevel(1)?.spellsToSelect ||
                      spellcastingInfo.spellsKnown ||
                      0}
                    )
                  </button>
                )}
              </div>

              {/* Category Filter */}
              <div className="flex items-center gap-2">
                <span
                  className="text-sm"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Filter by type:
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-3 py-1 rounded text-sm transition-all ${
                      selectedCategory === 'all'
                        ? 'bg-gray-700 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    All Spells
                  </button>
                  {Object.entries(SPELL_CATEGORIES).map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <button
                        key={key}
                        onClick={() =>
                          setSelectedCategory(key as SpellCategory)
                        }
                        className={`px-3 py-1 rounded text-sm transition-all flex items-center gap-1 ${
                          selectedCategory === key
                            ? 'text-white'
                            : 'text-gray-400 hover:text-gray-300'
                        }`}
                        style={{
                          backgroundColor:
                            selectedCategory === key
                              ? config.color
                              : 'rgb(31, 41, 55)',
                        }}
                      >
                        <Icon className="w-4 h-4" />
                        {config.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Search */}
            <div
              className="p-4 border-b"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              <div className="relative max-w-md">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  type="text"
                  placeholder="Search spells by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-primary)',
                    color: 'var(--text-primary)',
                    borderWidth: '1px',
                  }}
                />
              </div>
            </div>

            {/* Spell Grid */}
            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Sparkles
                      className="w-12 h-12 mx-auto mb-4 animate-pulse"
                      style={{ color: 'var(--accent-primary)' }}
                    />
                    <p style={{ color: 'var(--text-muted)' }}>
                      Loading magical knowledge...
                    </p>
                  </div>
                </div>
              ) : filteredSpells.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredSpells.map((spell) => (
                    <SpellCard
                      key={spell.id}
                      spell={spell}
                      isSelected={selectedSpells.has(spell.id)}
                      onToggle={() => toggleSpellSelection(spell.id)}
                      disabled={
                        !selectedSpells.has(spell.id) && !canSelectMore()
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <BookOpen
                      className="w-12 h-12 mx-auto mb-4 opacity-50"
                      style={{ color: 'var(--text-muted)' }}
                    />
                    <p style={{ color: 'var(--text-muted)' }}>
                      No spells found matching your search.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className="p-6 border-t"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {selectedLevel === 0
                      ? `${getSelectedCount(0)} of ${getSpellSelectionForLevel(0)?.spellsToSelect || spellcastingInfo.cantripsKnown} cantrips selected`
                      : `${getSelectedCount(1)} of ${getSpellSelectionForLevel(1)?.spellsToSelect || spellcastingInfo.spellsKnown || 0} spells selected`}
                  </p>
                  <p
                    className="text-xs mt-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {/* Show feature description if available */}
                    {selectedLevel === 0 &&
                      getSpellSelectionForLevel(0) &&
                      level1Features.find((f) =>
                        f.spellSelection?.spellLevels.includes(0)
                      )?.description}
                    {selectedLevel === 1 &&
                      getSpellSelectionForLevel(1) &&
                      level1Features.find((f) =>
                        f.spellSelection?.spellLevels.includes(1)
                      )?.description}
                    {/* Fallback messages if no feature description */}
                    {!getSpellSelectionForLevel(selectedLevel) &&
                      className === 'Wizard' &&
                      'Choose spells for your spellbook'}
                    {!getSpellSelectionForLevel(selectedLevel) &&
                      className === 'Sorcerer' &&
                      'Choose spells you know innately'}
                    {!getSpellSelectionForLevel(selectedLevel) &&
                      className === 'Cleric' &&
                      'You know all cleric spells but must prepare them daily'}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    className="px-6 py-2 rounded-lg font-medium transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-primary)',
                    }}
                  >
                    Cancel
                  </button>
                  <motion.button
                    onClick={handleConfirm}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-6 py-2 rounded-lg font-semibold transition-all"
                    style={{
                      backgroundColor: 'var(--accent-primary)',
                      color: 'white',
                      boxShadow: '0 4px 14px 0 rgba(147, 51, 234, 0.4)',
                    }}
                  >
                    Confirm Selection
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
