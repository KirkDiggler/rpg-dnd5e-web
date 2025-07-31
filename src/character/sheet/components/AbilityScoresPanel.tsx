import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { motion } from 'framer-motion';

interface AbilityScoresPanelProps {
  character: Character;
}

export function AbilityScoresPanel({ character }: AbilityScoresPanelProps) {
  const getModifier = (score: number) => Math.floor((score - 10) / 2);
  const formatModifier = (mod: number) => (mod >= 0 ? `+${mod}` : `${mod}`);

  const abilities = [
    {
      key: 'strength',
      label: 'STR',
      fullName: 'Strength',
      value: character.abilityScores?.strength || 10,
    },
    {
      key: 'dexterity',
      label: 'DEX',
      fullName: 'Dexterity',
      value: character.abilityScores?.dexterity || 10,
    },
    {
      key: 'constitution',
      label: 'CON',
      fullName: 'Constitution',
      value: character.abilityScores?.constitution || 10,
    },
    {
      key: 'intelligence',
      label: 'INT',
      fullName: 'Intelligence',
      value: character.abilityScores?.intelligence || 10,
    },
    {
      key: 'wisdom',
      label: 'WIS',
      fullName: 'Wisdom',
      value: character.abilityScores?.wisdom || 10,
    },
    {
      key: 'charisma',
      label: 'CHA',
      fullName: 'Charisma',
      value: character.abilityScores?.charisma || 10,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 }}
      className="game-card p-6"
      style={{
        background: 'var(--card-bg)',
        border: '2px solid var(--border-primary)',
        borderRadius: '0.75rem',
      }}
    >
      <h2
        className="text-xl font-bold font-serif mb-4"
        style={{ color: 'var(--text-primary)' }}
      >
        Ability Scores
      </h2>

      <div className="grid grid-cols-3 gap-3">
        {abilities.map((ability, index) => {
          const modifier = getModifier(ability.value);
          return (
            <motion.div
              key={ability.key}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 * index }}
              className="relative"
            >
              <div
                className="text-center p-4 rounded-lg border-2 hover:border-accent-primary transition-colors"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border-primary)',
                }}
              >
                {/* Ability Label */}
                <div
                  className="text-xs font-bold uppercase mb-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {ability.label}
                </div>

                {/* Modifier (Large) */}
                <div
                  className="text-2xl font-bold mb-1"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {formatModifier(modifier)}
                </div>

                {/* Score (Small) */}
                <div
                  className="text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {ability.value}
                </div>

                {/* Tooltip */}
                <div
                  className="absolute inset-x-0 -bottom-6 text-xs text-center opacity-0 hover:opacity-100 transition-opacity pointer-events-none"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {ability.fullName}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
