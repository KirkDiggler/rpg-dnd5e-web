import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';

interface SavingThrowsPanelProps {
  character: Character;
}

export function SavingThrowsPanel({ character }: SavingThrowsPanelProps) {
  const getModifier = (score: number) => Math.floor((score - 10) / 2);
  const formatModifier = (mod: number) => (mod >= 0 ? `+${mod}` : `${mod}`);

  const savingThrows = [
    {
      ability: 'Strength',
      value: character.abilityScores?.strength || 10,
      isProficient:
        character.savingThrowProficiencies?.includes('Strength') || false,
    },
    {
      ability: 'Dexterity',
      value: character.abilityScores?.dexterity || 10,
      isProficient:
        character.savingThrowProficiencies?.includes('Dexterity') || false,
    },
    {
      ability: 'Constitution',
      value: character.abilityScores?.constitution || 10,
      isProficient:
        character.savingThrowProficiencies?.includes('Constitution') || false,
    },
    {
      ability: 'Intelligence',
      value: character.abilityScores?.intelligence || 10,
      isProficient:
        character.savingThrowProficiencies?.includes('Intelligence') || false,
    },
    {
      ability: 'Wisdom',
      value: character.abilityScores?.wisdom || 10,
      isProficient:
        character.savingThrowProficiencies?.includes('Wisdom') || false,
    },
    {
      ability: 'Charisma',
      value: character.abilityScores?.charisma || 10,
      isProficient:
        character.savingThrowProficiencies?.includes('Charisma') || false,
    },
  ];

  const proficiencyBonus = character.proficiencyBonus || 2;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.2 }}
      className="game-card p-6"
      style={{
        background: 'var(--card-bg)',
        border: '2px solid var(--border-primary)',
        borderRadius: '0.75rem',
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Shield
          className="w-5 h-5"
          style={{ color: 'var(--accent-primary)' }}
        />
        <h2
          className="text-xl font-bold font-serif"
          style={{ color: 'var(--text-primary)' }}
        >
          Saving Throws
        </h2>
      </div>

      <div className="space-y-2">
        {savingThrows.map((save, index) => {
          const baseModifier = getModifier(save.value);
          const totalModifier =
            baseModifier + (save.isProficient ? proficiencyBonus : 0);

          return (
            <motion.div
              key={save.ability}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * index }}
              className="flex items-center justify-between p-2 rounded hover:bg-opacity-50 transition-colors"
              style={{
                backgroundColor: save.isProficient
                  ? 'var(--accent-primary)'
                  : 'transparent',
                opacity: save.isProficient ? 0.1 : 1,
              }}
            >
              <div className="flex items-center gap-3">
                {/* Proficiency Indicator */}
                <div
                  className="w-3 h-3 rounded-full border-2"
                  style={{
                    borderColor: 'var(--border-primary)',
                    backgroundColor: save.isProficient
                      ? 'var(--accent-primary)'
                      : 'transparent',
                  }}
                />

                {/* Ability Name */}
                <span
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {save.ability}
                </span>
              </div>

              {/* Modifier */}
              <span
                className="text-sm font-bold"
                style={{
                  color: save.isProficient
                    ? 'var(--accent-primary)'
                    : 'var(--text-secondary)',
                }}
              >
                {formatModifier(totalModifier)}
              </span>
            </motion.div>
          );
        })}
      </div>

      <div
        className="mt-4 pt-4 border-t text-xs text-center"
        style={{
          borderColor: 'var(--border-primary)',
          color: 'var(--text-muted)',
        }}
      >
        Proficiency Bonus: +{proficiencyBonus}
      </div>
    </motion.div>
  );
}
