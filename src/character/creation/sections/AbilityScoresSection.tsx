import { AnimatedStat } from '@/components/AnimatedStat';
import { DiceRoller } from '@/components/DiceRoller';
import { Button } from '@/components/ui/Button';
import { useCharacterBuilder } from '@/hooks/useCharacterBuilder';
import { motion } from 'framer-motion';
import { useState } from 'react';

const ABILITY_NAMES = [
  { key: 'strength', label: 'Strength', abbr: 'STR' },
  { key: 'dexterity', label: 'Dexterity', abbr: 'DEX' },
  { key: 'constitution', label: 'Constitution', abbr: 'CON' },
  { key: 'intelligence', label: 'Intelligence', abbr: 'INT' },
  { key: 'wisdom', label: 'Wisdom', abbr: 'WIS' },
  { key: 'charisma', label: 'Charisma', abbr: 'CHA' },
];

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

export function AbilityScoresSection() {
  const { setSelectedChoice } = useCharacterBuilder();
  const [method, setMethod] = useState<'roll' | 'array' | 'point-buy'>('roll');
  const [scores, setScores] = useState<Record<string, number>>({
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  });
  const [previousScores, setPreviousScores] = useState<Record<string, number>>(
    {}
  );

  const handleRoll = (ability: string) => {
    // Roll 4d6, drop lowest
    const rolls = Array.from(
      { length: 4 },
      () => Math.floor(Math.random() * 6) + 1
    );
    rolls.sort((a, b) => b - a);
    const total = rolls.slice(0, 3).reduce((sum, roll) => sum + roll, 0);

    setPreviousScores((prev) => ({ ...prev, [ability]: scores[ability] }));
    setScores((prev) => ({ ...prev, [ability]: total }));
    setSelectedChoice(`ability_${ability}`, total);
  };

  const handleArrayMethod = () => {
    setMethod('array');
    // For demo, just assign standard array values
    const newScores = ABILITY_NAMES.reduce(
      (acc, ability, index) => {
        acc[ability.key] = STANDARD_ARRAY[index] || 10;
        return acc;
      },
      {} as Record<string, number>
    );

    setPreviousScores(scores);
    setScores(newScores);

    Object.entries(newScores).forEach(([ability, score]) => {
      setSelectedChoice(`ability_${ability}`, score);
    });
  };

  const getModifier = (score: number) => Math.floor((score - 10) / 2);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2
          className="text-2xl font-bold font-serif"
          style={{ color: 'var(--text-primary)' }}
        >
          Ability Scores
        </h2>

        <div className="flex gap-2">
          <Button
            variant={method === 'roll' ? 'primary' : 'secondary'}
            onClick={() => setMethod('roll')}
            size="sm"
          >
            Roll (4d6)
          </Button>
          <Button
            variant={method === 'array' ? 'primary' : 'secondary'}
            onClick={handleArrayMethod}
            size="sm"
          >
            Standard Array
          </Button>
          <Button
            variant={method === 'point-buy' ? 'primary' : 'secondary'}
            onClick={() => setMethod('point-buy')}
            size="sm"
          >
            Point Buy
          </Button>
        </div>
      </div>

      {method === 'roll' && (
        <div
          className="p-4 rounded-lg"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          <p className="text-sm text-muted mb-4">
            Click the dice next to each ability to roll 4d6 and drop the lowest
            die.
          </p>
        </div>
      )}

      {method === 'array' && (
        <div
          className="p-4 rounded-lg"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          <p className="text-sm text-muted mb-4">
            Standard Array: 15, 14, 13, 12, 10, 8 - assign these values to your
            abilities as you see fit.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {ABILITY_NAMES.map((ability) => (
          <motion.div
            key={ability.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: ABILITY_NAMES.indexOf(ability) * 0.1 }}
            className="relative"
          >
            <div
              className="p-4 rounded-lg border-2 transition-all duration-300"
              style={{
                backgroundColor: 'var(--card-bg)',
                borderColor: 'var(--border-primary)',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3
                  className="font-bold text-sm"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {ability.abbr}
                </h3>
                {method === 'roll' && (
                  <div className="flex items-center gap-2">
                    <DiceRoller
                      dice="d6"
                      count={4}
                      size="small"
                      onRoll={() => handleRoll(ability.key)}
                    />
                  </div>
                )}
              </div>

              <AnimatedStat
                label={ability.label}
                value={scores[ability.key]}
                previousValue={previousScores[ability.key] || 10}
                modifier={getModifier(scores[ability.key])}
                animate={true}
                variant="compact"
                size="small"
              />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="text-center">
        <p className="text-sm text-muted">
          Total modifier:{' '}
          {Object.values(scores).reduce(
            (sum, score) => sum + getModifier(score),
            0
          )}
        </p>
      </div>
    </div>
  );
}
