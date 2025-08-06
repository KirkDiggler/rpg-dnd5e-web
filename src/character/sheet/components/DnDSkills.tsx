import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Skill } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { Card } from '../../../components/ui/Card';

interface DnDSkillsProps {
  character: Character;
}

// Helper function to calculate ability modifier
function calculateModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

// Helper function to format modifier with sign
function formatModifier(modifier: number): string {
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

// Helper function to calculate proficiency bonus
function calculateProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

// Standard D&D 5e skills with their enum mappings
const SKILLS = [
  { name: 'Acrobatics', ability: 'dex', enumValue: Skill.ACROBATICS },
  { name: 'Animal Handling', ability: 'wis', enumValue: Skill.ANIMAL_HANDLING },
  { name: 'Arcana', ability: 'int', enumValue: Skill.ARCANA },
  { name: 'Athletics', ability: 'str', enumValue: Skill.ATHLETICS },
  { name: 'Deception', ability: 'cha', enumValue: Skill.DECEPTION },
  { name: 'History', ability: 'int', enumValue: Skill.HISTORY },
  { name: 'Insight', ability: 'wis', enumValue: Skill.INSIGHT },
  { name: 'Intimidation', ability: 'cha', enumValue: Skill.INTIMIDATION },
  { name: 'Investigation', ability: 'int', enumValue: Skill.INVESTIGATION },
  { name: 'Medicine', ability: 'wis', enumValue: Skill.MEDICINE },
  { name: 'Nature', ability: 'int', enumValue: Skill.NATURE },
  { name: 'Perception', ability: 'wis', enumValue: Skill.PERCEPTION },
  { name: 'Performance', ability: 'cha', enumValue: Skill.PERFORMANCE },
  { name: 'Persuasion', ability: 'cha', enumValue: Skill.PERSUASION },
  { name: 'Religion', ability: 'int', enumValue: Skill.RELIGION },
  { name: 'Sleight of Hand', ability: 'dex', enumValue: Skill.SLEIGHT_OF_HAND },
  { name: 'Stealth', ability: 'dex', enumValue: Skill.STEALTH },
  { name: 'Survival', ability: 'wis', enumValue: Skill.SURVIVAL },
];

export function DnDSkills({ character }: DnDSkillsProps) {
  const abilityScores = character.abilityScores;
  const proficiencyBonus =
    character.combatStats?.proficiencyBonus !== undefined &&
    character.combatStats.proficiencyBonus > 0
      ? character.combatStats.proficiencyBonus
      : calculateProficiencyBonus(character.level);

  // Get skill proficiencies from API
  const skillProficiencies = character.proficiencies?.skills || [];

  const getAbilityModifier = (ability: string): number => {
    switch (ability) {
      case 'str':
        return calculateModifier(abilityScores?.strength || 10);
      case 'dex':
        return calculateModifier(abilityScores?.dexterity || 10);
      case 'con':
        return calculateModifier(abilityScores?.constitution || 10);
      case 'int':
        return calculateModifier(abilityScores?.intelligence || 10);
      case 'wis':
        return calculateModifier(abilityScores?.wisdom || 10);
      case 'cha':
        return calculateModifier(abilityScores?.charisma || 10);
      default:
        return 0;
    }
  };

  return (
    <Card className="p-4">
      <h4
        className="text-sm font-bold mb-3 uppercase tracking-wider text-center"
        style={{
          color: 'var(--text-primary)',
        }}
      >
        Skills
      </h4>

      <div className="space-y-1">
        {skillProficiencies.length === 0 ? (
          <div
            className="text-xs text-center"
            style={{ color: 'var(--text-secondary)' }}
          >
            No skill proficiencies
          </div>
        ) : (
          SKILLS.filter((skill) =>
            skillProficiencies.includes(skill.enumValue)
          ).map((skill) => {
            const abilityModifier = getAbilityModifier(skill.ability);
            const isProficient = true; // Always true since we're filtering
            const totalModifier = abilityModifier + proficiencyBonus;

            return (
              <div
                key={skill.name}
                className="flex items-center justify-between py-0.5 px-2 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-800 text-xs"
              >
                {/* Left side - Proficiency dot and modifier */}
                <div className="flex items-center gap-1">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${isProficient ? 'bg-green-500' : 'bg-gray-300'}`}
                  />
                  <div
                    className="font-bold w-5 text-right"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {formatModifier(totalModifier)}
                  </div>
                </div>

                {/* Right side - Skill Name */}
                <div
                  className="text-xs truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {skill.name}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Passive Perception */}
      <div
        className="mt-2 pt-2 border-t"
        style={{ borderColor: 'var(--border-primary)' }}
      >
        <div className="flex justify-between items-center">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Passive Perception
          </span>
          <span
            className="text-sm font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            {10 +
              getAbilityModifier('wis') +
              (skillProficiencies.includes(Skill.PERCEPTION)
                ? proficiencyBonus
                : 0)}
          </span>
        </div>
      </div>
    </Card>
  );
}
