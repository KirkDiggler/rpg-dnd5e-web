import { DiceRoller } from '@/components/DiceRoller';
import { motion } from 'framer-motion';
import { useState } from 'react';

interface InteractiveCharacterSheetProps {
  onComplete: () => void;
  onCancel: () => void;
}

// Simple context for now - we'll make it more sophisticated later
const CharacterContext = {
  characterName: '',
  selectedRace: '',
  selectedClass: '',
  rolledScores: [] as number[], // Array of rolled values to assign
  rollLedger: [] as {
    rolls: number[];
    kept: number[];
    dropped: number;
    total: number;
    timestamp: number;
  }[],
  abilityScores: {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  },
};

export function InteractiveCharacterSheet({
  onComplete,
  onCancel,
}: InteractiveCharacterSheetProps) {
  const [character, setCharacter] = useState(CharacterContext);

  const getModifier = (score: number) => Math.floor((score - 10) / 2);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5 p-4">
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

          {/* Race & Class - Side by Side */}
          <div className="space-y-4">
            <h2
              className="text-2xl font-bold font-serif"
              style={{ color: 'var(--text-primary)' }}
            >
              Character Identity
            </h2>
            <div className="grid grid-cols-2 gap-4">
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
                }}
                onClick={() =>
                  setCharacter((prev) => ({ ...prev, selectedRace: 'Human' }))
                }
              >
                <div className="text-center space-y-2">
                  <div className="text-3xl">🧝</div>
                  <div>
                    <h3
                      className="text-lg font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {character.selectedRace || 'Choose Race'}
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
                }}
                onClick={() =>
                  setCharacter((prev) => ({
                    ...prev,
                    selectedClass: 'Fighter',
                  }))
                }
              >
                <div className="text-center space-y-2">
                  <div className="text-3xl">⚔️</div>
                  <div>
                    <h3
                      className="text-lg font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {character.selectedClass || 'Choose Class'}
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
            </div>
          </div>

          {/* Ability Scores - Dice Tray */}
          <div className="space-y-4">
            <h2
              className="text-2xl font-bold font-serif"
              style={{ color: 'var(--text-primary)' }}
            >
              Ability Scores
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Dice Tray - Reorganized */}
              <div className="space-y-3">
                <h3
                  className="text-sm font-bold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Dice Tray
                </h3>
                <div
                  className="p-4 rounded-lg border-2 min-h-[200px]"
                  style={{
                    backgroundColor: 'var(--card-bg)',
                    borderColor: 'var(--border-primary)',
                  }}
                >
                  <div
                    className="grid grid-cols-3 h-full"
                    style={{ gap: '2rem', padding: '1.5rem' }}
                  >
                    {/* Left: Roll History */}
                    <div
                      className="space-y-2"
                      style={{
                        paddingRight: '1rem',
                        borderRight: '1px solid var(--border-primary)',
                        borderOpacity: '0.3',
                      }}
                    >
                      <div
                        className="text-sm font-bold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Roll History:
                      </div>
                      <div className="space-y-1">
                        {Array.from({ length: 6 }, (_, i) => {
                          const rollRecord = character.rollLedger[i];
                          return (
                            <div
                              key={i}
                              className="p-2 rounded border text-sm min-h-[24px]"
                              style={{
                                backgroundColor: rollRecord
                                  ? 'var(--bg-secondary)'
                                  : 'var(--card-bg)',
                                borderColor: 'var(--border-primary)',
                                opacity: rollRecord ? 1 : 0.3,
                              }}
                            >
                              {rollRecord ? (
                                <div className="flex items-center gap-2">
                                  <span
                                    className="text-xs"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    #{i + 1}:
                                  </span>
                                  {rollRecord.rolls.map((die, j) => (
                                    <span
                                      key={j}
                                      className="px-1 py-0.5 rounded text-xs"
                                      style={{
                                        backgroundColor:
                                          rollRecord.kept.includes(die)
                                            ? 'var(--accent-primary)'
                                            : 'var(--text-muted)',
                                        color: 'white',
                                      }}
                                    >
                                      {die}
                                    </span>
                                  ))}
                                  <span>→</span>
                                  <span
                                    className="font-bold"
                                    style={{ color: 'var(--text-primary)' }}
                                  >
                                    {rollRecord.total}
                                  </span>
                                </div>
                              ) : (
                                <span
                                  className="text-xs"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  Roll #{i + 1}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Center: Roll Button - Horizontal Layout */}
                    <div
                      className="flex items-center justify-center space-x-4"
                      style={{
                        paddingLeft: '1rem',
                        paddingRight: '1rem',
                        borderRight: '1px solid var(--border-primary)',
                        borderOpacity: '0.3',
                      }}
                    >
                      <div className="flex flex-col items-center space-y-2">
                        <div
                          className="text-xs text-center"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          4d6 (drop lowest)
                        </div>
                        <DiceRoller
                          dice="d6"
                          count={4}
                          size="medium"
                          label="Roll ability score"
                          showResult={false}
                          onRoll={(roll) => {
                            // Roll 4d6, drop lowest - show what was rolled
                            const sortedRolls = [...roll.rolls].sort(
                              (a, b) => b - a
                            );
                            const total = sortedRolls
                              .slice(0, 3)
                              .reduce((sum, roll) => sum + roll, 0);
                            const dropped = sortedRolls[3]; // The lowest die that was dropped

                            console.log(
                              `🎲 Rolled: [${roll.rolls.join(', ')}] → Keep: [${sortedRolls.slice(0, 3).join(', ')}] Drop: ${dropped} → Total: ${total}`
                            );

                            const rollRecord = {
                              rolls: roll.rolls,
                              kept: sortedRolls.slice(0, 3),
                              dropped: dropped,
                              total: total,
                              timestamp: Date.now(),
                            };

                            setCharacter((prev) => ({
                              ...prev,
                              rolledScores: [...prev.rolledScores, total],
                              rollLedger: [...prev.rollLedger, rollRecord],
                            }));
                          }}
                        />
                      </div>

                      {/* Our own result display to the right */}
                      <div className="flex-1 min-h-[60px] flex items-center justify-center">
                        {character.rollLedger.length > 0 && (
                          <div className="text-center">
                            <div
                              className="text-sm font-bold"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              Last Roll:
                            </div>
                            <div
                              className="text-2xl font-bold"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {
                                character.rollLedger[
                                  character.rollLedger.length - 1
                                ]?.total
                              }
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Available Scores */}
                    <div className="space-y-2" style={{ paddingLeft: '1rem' }}>
                      <div
                        className="text-sm font-bold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Available Scores:
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {character.rolledScores.map((score, i) => (
                          <motion.div
                            key={i}
                            className="px-4 py-2 rounded-lg border-2 cursor-move text-center min-w-[60px] min-h-[60px] flex items-center justify-center"
                            style={{
                              backgroundColor: 'var(--card-bg)',
                              borderColor: 'var(--border-primary)',
                              color: 'var(--text-primary)',
                              fontSize: '1.5rem',
                              fontWeight: 'bold',
                              boxShadow: 'var(--shadow-card)',
                            }}
                            whileHover={{
                              scale: 1.1,
                              boxShadow: 'var(--shadow-modal)',
                            }}
                            whileTap={{ scale: 0.95 }}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData(
                                'text/plain',
                                score.toString()
                              );
                              e.dataTransfer.setData(
                                'application/json',
                                JSON.stringify({ index: i, value: score })
                              );
                            }}
                          >
                            {score}
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ability Assignment - Bigger Squares */}
              <div className="lg:col-span-2 space-y-3">
                <h3
                  className="text-sm font-bold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Assign to Abilities
                </h3>

                <div className="grid grid-cols-6 gap-3">
                  {Object.entries(character.abilityScores).map(
                    ([ability, score]) => (
                      <div
                        key={ability}
                        className="flex flex-col items-center justify-center p-4 rounded-lg border-3 border-dashed transition-all min-h-[100px]"
                        style={{
                          backgroundColor:
                            score > 0
                              ? 'var(--card-bg)'
                              : 'var(--bg-secondary)',
                          borderColor:
                            score > 0
                              ? 'var(--accent-primary)'
                              : 'var(--border-primary)',
                          borderWidth: '3px',
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.borderColor =
                            'var(--accent-primary)';
                        }}
                        onDragLeave={(e) => {
                          e.currentTarget.style.borderColor =
                            score > 0
                              ? 'var(--accent-primary)'
                              : 'var(--border-primary)';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const draggedValue = parseInt(
                            e.dataTransfer.getData('text/plain')
                          );
                          const dragData = JSON.parse(
                            e.dataTransfer.getData('application/json')
                          );

                          // Assign the score to this ability
                          setCharacter((prev) => ({
                            ...prev,
                            abilityScores: {
                              ...prev.abilityScores,
                              [ability]: draggedValue,
                            },
                            // Remove the used score from rolled scores
                            rolledScores: prev.rolledScores.filter(
                              (_, i) => i !== dragData.index
                            ),
                          }));

                          e.currentTarget.style.borderColor =
                            'var(--accent-primary)';
                        }}
                      >
                        <div className="text-center space-y-2">
                          <div
                            className="text-sm font-bold"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {ability.slice(0, 3).toUpperCase()}
                          </div>
                          <div
                            className="text-xs capitalize"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {ability}
                          </div>
                          <div
                            className="text-2xl font-bold"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {score || '-'}
                          </div>
                          {score > 0 && (
                            <div
                              className="text-sm"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              ({getModifier(score) >= 0 ? '+' : ''}
                              {getModifier(score)})
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>

                <div className="text-center">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Roll dice, then drag values to abilities
                  </p>
                </div>
              </div>
            </div>
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
                {character.selectedRace && `, a ${character.selectedRace}`}
                {character.selectedClass && ` ${character.selectedClass}`}
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
    </div>
  );
}
