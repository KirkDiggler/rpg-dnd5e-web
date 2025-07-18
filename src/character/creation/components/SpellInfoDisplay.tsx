import type { SpellcastingInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { motion } from 'framer-motion';
import { BookOpen, Focus, Plus, Sparkles, Zap } from 'lucide-react';

interface SpellInfoDisplayProps {
  spellcastingInfo: SpellcastingInfo;
  className?: string;
  onSelectSpells?: () => void;
}

export function SpellInfoDisplay({
  spellcastingInfo,
  className,
  onSelectSpells,
}: SpellInfoDisplayProps) {
  const getAbilityDisplayName = (ability: string) => {
    const abilityMap: Record<string, string> = {
      intelligence: 'Intelligence',
      wisdom: 'Wisdom',
      charisma: 'Charisma',
    };
    return abilityMap[ability] || ability;
  };

  const getSpellcastingFocusIcon = (focus: string) => {
    if (focus.toLowerCase().includes('component'))
      return <Focus className="w-4 h-4" />;
    if (focus.toLowerCase().includes('focus'))
      return <Focus className="w-4 h-4" />;
    return <BookOpen className="w-4 h-4" />;
  };

  return (
    <motion.div
      className={`space-y-3 ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles
            className="w-5 h-5"
            style={{ color: 'var(--accent-primary)' }}
          />
          <h4
            className="text-lg font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            Spellcasting
          </h4>
        </div>
        {onSelectSpells &&
          (spellcastingInfo.cantripsKnown > 0 ||
            spellcastingInfo.spellsKnown > 0) && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onSelectSpells}
              className="flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'white',
              }}
            >
              <Plus className="w-4 h-4" />
              Select Spells
            </motion.button>
          )}
      </div>

      {/* Spell Information Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Spellcasting Ability */}
        <div
          className="p-3 rounded-lg border"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-primary)',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Zap
              className="w-4 h-4"
              style={{ color: 'var(--accent-primary)' }}
            />
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              Spellcasting Ability
            </span>
          </div>
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {getAbilityDisplayName(spellcastingInfo.spellcastingAbility)}
          </div>
        </div>

        {/* Spellcasting Focus */}
        {spellcastingInfo.spellcastingFocus && (
          <div
            className="p-3 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-primary)',
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              {getSpellcastingFocusIcon(spellcastingInfo.spellcastingFocus)}
              <span
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                Focus
              </span>
            </div>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {spellcastingInfo.spellcastingFocus}
            </div>
          </div>
        )}

        {/* Cantrips Known */}
        {spellcastingInfo.cantripsKnown > 0 && (
          <div
            className="p-3 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-primary)',
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Sparkles
                className="w-4 h-4"
                style={{ color: 'var(--accent-primary)' }}
              />
              <span
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                Cantrips Known
              </span>
            </div>
            <div
              className="text-lg font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              {spellcastingInfo.cantripsKnown}
            </div>
          </div>
        )}

        {/* Spells Known */}
        {spellcastingInfo.spellsKnown > 0 && (
          <div
            className="p-3 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-primary)',
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <BookOpen
                className="w-4 h-4"
                style={{ color: 'var(--accent-primary)' }}
              />
              <span
                className="text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                Spells Known
              </span>
            </div>
            <div
              className="text-lg font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              {spellcastingInfo.spellsKnown}
            </div>
          </div>
        )}
      </div>

      {/* Spell Slots */}
      {spellcastingInfo.spellSlotsLevel1 > 0 && (
        <div
          className="p-3 rounded-lg border"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-primary)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-4 rounded bg-blue-500 flex items-center justify-center">
              <span className="text-xs font-bold text-white">1</span>
            </div>
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              1st Level Spell Slots
            </span>
          </div>
          <div className="flex gap-1">
            {Array.from(
              { length: spellcastingInfo.spellSlotsLevel1 },
              (_, i) => (
                <div
                  key={i}
                  className="w-6 h-6 rounded-full border-2 bg-blue-500"
                  style={{
                    borderColor: 'var(--accent-primary)',
                    backgroundColor: 'var(--accent-primary)',
                  }}
                  title={`Spell slot ${i + 1}`}
                />
              )
            )}
          </div>
        </div>
      )}

      {/* Ritual Casting */}
      {spellcastingInfo.ritualCasting && (
        <div
          className="p-3 rounded-lg border"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-primary)',
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center">
              <span className="text-xs font-bold text-white">R</span>
            </div>
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              Ritual Casting
            </span>
          </div>
          <div
            className="text-xs mt-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            Can cast spells as rituals when they have the ritual tag
          </div>
        </div>
      )}
    </motion.div>
  );
}
