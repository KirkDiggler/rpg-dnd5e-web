import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';

interface SkillsPanelProps {
  character: Character;
}

const SKILL_ABILITY_MAP: Record<
  string,
  keyof NonNullable<Character['abilityScores']>
> = {
  Acrobatics: 'dexterity',
  'Animal Handling': 'wisdom',
  Arcana: 'intelligence',
  Athletics: 'strength',
  Deception: 'charisma',
  History: 'intelligence',
  Insight: 'wisdom',
  Intimidation: 'charisma',
  Investigation: 'intelligence',
  Medicine: 'wisdom',
  Nature: 'intelligence',
  Perception: 'wisdom',
  Performance: 'charisma',
  Persuasion: 'charisma',
  Religion: 'intelligence',
  'Sleight of Hand': 'dexterity',
  Stealth: 'dexterity',
  Survival: 'wisdom',
};

export function SkillsPanel({ character }: SkillsPanelProps) {
  const getModifier = (score: number) => Math.floor((score - 10) / 2);
  const formatModifier = (mod: number) => (mod >= 0 ? `+${mod}` : `${mod}`);

  const proficiencyBonus = character.proficiencyBonus || 2;
  const skillProficiencies = character.skillProficiencies || [];

  const skills = Object.entries(SKILL_ABILITY_MAP).map(([skill, ability]) => {
    const abilityScore = character.abilityScores?.[ability] || 10;
    const baseModifier = getModifier(abilityScore);
    const isProficient = skillProficiencies.includes(skill);
    const totalModifier = baseModifier + (isProficient ? proficiencyBonus : 0);

    return {
      name: skill,
      ability: ability.slice(0, 3).toUpperCase(),
      isProficient,
      modifier: totalModifier,
    };
  });

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.3 }}
      className="game-card p-6"
      style={{
        background: 'var(--card-bg)',
        border: '2px solid var(--border-primary)',
        borderRadius: '0.75rem',
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <BookOpen
          className="w-5 h-5"
          style={{ color: 'var(--accent-primary)' }}
        />
        <h2
          className="text-xl font-bold font-serif"
          style={{ color: 'var(--text-primary)' }}
        >
          Skills
        </h2>
      </div>

      <div className="space-y-1 max-h-96 overflow-y-auto">
        {skills.map((skill, index) => (
          <motion.div
            key={skill.name}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.02 * index }}
            className="flex items-center justify-between p-1.5 rounded hover:bg-opacity-50 transition-colors"
            style={{
              backgroundColor: skill.isProficient
                ? 'var(--accent-primary)'
                : 'transparent',
              opacity: skill.isProficient ? 0.1 : 1,
            }}
          >
            <div className="flex items-center gap-2">
              {/* Proficiency Indicator */}
              <div
                className="w-2.5 h-2.5 rounded-full border"
                style={{
                  borderColor: 'var(--border-primary)',
                  backgroundColor: skill.isProficient
                    ? 'var(--accent-primary)'
                    : 'transparent',
                }}
              />

              {/* Skill Name */}
              <span
                className="text-sm"
                style={{ color: 'var(--text-primary)' }}
              >
                {skill.name}
              </span>

              {/* Ability */}
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                ({skill.ability})
              </span>
            </div>

            {/* Modifier */}
            <span
              className="text-sm font-bold"
              style={{
                color: skill.isProficient
                  ? 'var(--accent-primary)'
                  : 'var(--text-secondary)',
              }}
            >
              {formatModifier(skill.modifier)}
            </span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
