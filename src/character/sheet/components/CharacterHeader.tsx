import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { motion } from 'framer-motion';
import { useState } from 'react';

interface CharacterHeaderProps {
  character: Character;
}

export function CharacterHeader({ character }: CharacterHeaderProps) {
  const [tempHp, setTempHp] = useState(0);
  const [isEditingHp, setIsEditingHp] = useState(false);
  const [currentHp, setCurrentHp] = useState(character.hp || 0);

  const maxHp = character.maxHp || 0;
  const hpPercentage = (currentHp / maxHp) * 100;

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

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="game-card p-6"
      style={{
        background: 'var(--card-bg)',
        border: '3px solid var(--border-primary)',
        borderRadius: '1rem',
        boxShadow: 'var(--shadow-modal)',
      }}
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        {/* Character Info */}
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-2">
            <h1
              className="text-3xl font-bold font-serif"
              style={{ color: 'var(--text-primary)' }}
            >
              {character.name}
            </h1>
            <div className="flex gap-2">
              <span className="text-2xl">
                {getRaceEmoji(character.race || '')}
              </span>
              <span className="text-2xl">
                {getClassEmoji(character.class || '')}
              </span>
            </div>
          </div>
          <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
            Level {character.level} {character.race} {character.class}
            {character.background && ` • ${character.background}`}
          </p>
        </div>

        {/* HP Section */}
        <div className="flex-1 max-w-md">
          <div className="space-y-2">
            {/* HP Bar */}
            <div className="relative">
              <div
                className="h-8 rounded-lg overflow-hidden"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <motion.div
                  className="h-full rounded-lg"
                  initial={{ width: 0 }}
                  animate={{ width: `${hpPercentage}%` }}
                  transition={{ duration: 0.5 }}
                  style={{
                    backgroundColor:
                      hpPercentage > 50
                        ? 'var(--success)'
                        : hpPercentage > 25
                          ? 'var(--warning)'
                          : 'var(--error)',
                  }}
                />
              </div>
              <div
                className="absolute inset-0 flex items-center justify-center text-sm font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                {currentHp} / {maxHp} HP
              </div>
            </div>

            {/* HP Controls */}
            <div className="flex gap-2">
              {isEditingHp ? (
                <div className="flex gap-2 flex-1">
                  <input
                    type="number"
                    value={currentHp}
                    onChange={(e) =>
                      setCurrentHp(
                        Math.max(0, Math.min(maxHp, Number(e.target.value)))
                      )
                    }
                    className="flex-1 px-3 py-1 rounded border text-center"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border-primary)',
                      color: 'var(--text-primary)',
                    }}
                    min="0"
                    max={maxHp}
                  />
                  <button
                    onClick={() => {
                      setIsEditingHp(false);
                      // TODO: Save HP to backend
                    }}
                    className="px-3 py-1 rounded border"
                    style={{
                      backgroundColor: 'var(--accent-primary)',
                      borderColor: 'var(--border-primary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingHp(false);
                      setCurrentHp(character.hp || 0);
                    }}
                    className="px-3 py-1 rounded border"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border-primary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setIsEditingHp(true)}
                    className="flex-1 px-3 py-1 rounded border text-sm"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border-primary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    Edit HP
                  </button>
                  <div className="flex items-center gap-2">
                    <label
                      className="text-sm"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Temp HP:
                    </label>
                    <input
                      type="number"
                      value={tempHp}
                      onChange={(e) =>
                        setTempHp(Math.max(0, Number(e.target.value)))
                      }
                      className="w-16 px-2 py-1 rounded border text-center text-sm"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderColor: 'var(--border-primary)',
                        color: 'var(--text-primary)',
                      }}
                      min="0"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex gap-4">
          <div className="text-center">
            <div
              className="text-xs font-bold uppercase"
              style={{ color: 'var(--text-muted)' }}
            >
              Proficiency
            </div>
            <div
              className="text-2xl font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              +{character.proficiencyBonus || 2}
            </div>
          </div>
          <div className="text-center">
            <div
              className="text-xs font-bold uppercase"
              style={{ color: 'var(--text-muted)' }}
            >
              Experience
            </div>
            <div
              className="text-xl font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              {character.xp || 0}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
