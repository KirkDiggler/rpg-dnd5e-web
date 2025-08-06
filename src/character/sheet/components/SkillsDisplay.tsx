import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Skill } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { Card } from '../../../components/ui/Card';

interface SkillsDisplayProps {
  character: Character;
}

interface CharacterSkill {
  name: string;
  ability: string;
  abilityShort: string;
  modifier: number;
  isProficient: boolean;
  isExpertise: boolean; // For rogues, bards, etc.
}

// Helper function to calculate ability modifier
function calculateModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

// Helper function to calculate proficiency bonus based on level
function calculateProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

// Helper function to format modifier with sign
function formatModifier(modifier: number): string {
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

// Mapping from Skill enum to display information
const SKILL_INFO: Record<
  Skill,
  { name: string; ability: string; abilityShort: string }
> = {
  [Skill.UNSPECIFIED]: {
    name: 'Unknown',
    ability: 'strength',
    abilityShort: 'STR',
  },
  [Skill.ACROBATICS]: {
    name: 'Acrobatics',
    ability: 'dexterity',
    abilityShort: 'DEX',
  },
  [Skill.ANIMAL_HANDLING]: {
    name: 'Animal Handling',
    ability: 'wisdom',
    abilityShort: 'WIS',
  },
  [Skill.ARCANA]: {
    name: 'Arcana',
    ability: 'intelligence',
    abilityShort: 'INT',
  },
  [Skill.ATHLETICS]: {
    name: 'Athletics',
    ability: 'strength',
    abilityShort: 'STR',
  },
  [Skill.DECEPTION]: {
    name: 'Deception',
    ability: 'charisma',
    abilityShort: 'CHA',
  },
  [Skill.HISTORY]: {
    name: 'History',
    ability: 'intelligence',
    abilityShort: 'INT',
  },
  [Skill.INSIGHT]: { name: 'Insight', ability: 'wisdom', abilityShort: 'WIS' },
  [Skill.INTIMIDATION]: {
    name: 'Intimidation',
    ability: 'charisma',
    abilityShort: 'CHA',
  },
  [Skill.INVESTIGATION]: {
    name: 'Investigation',
    ability: 'intelligence',
    abilityShort: 'INT',
  },
  [Skill.MEDICINE]: {
    name: 'Medicine',
    ability: 'wisdom',
    abilityShort: 'WIS',
  },
  [Skill.NATURE]: {
    name: 'Nature',
    ability: 'intelligence',
    abilityShort: 'INT',
  },
  [Skill.PERCEPTION]: {
    name: 'Perception',
    ability: 'wisdom',
    abilityShort: 'WIS',
  },
  [Skill.PERFORMANCE]: {
    name: 'Performance',
    ability: 'charisma',
    abilityShort: 'CHA',
  },
  [Skill.PERSUASION]: {
    name: 'Persuasion',
    ability: 'charisma',
    abilityShort: 'CHA',
  },
  [Skill.RELIGION]: {
    name: 'Religion',
    ability: 'intelligence',
    abilityShort: 'INT',
  },
  [Skill.SLEIGHT_OF_HAND]: {
    name: 'Sleight of Hand',
    ability: 'dexterity',
    abilityShort: 'DEX',
  },
  [Skill.STEALTH]: {
    name: 'Stealth',
    ability: 'dexterity',
    abilityShort: 'DEX',
  },
  [Skill.SURVIVAL]: {
    name: 'Survival',
    ability: 'wisdom',
    abilityShort: 'WIS',
  },
};

export function SkillsDisplay({ character }: SkillsDisplayProps) {
  const abilityScores = character.abilityScores;
  const proficiencyBonus = calculateProficiencyBonus(character.level);

  if (!abilityScores) {
    return (
      <Card className="p-4">
        <h3
          className="text-xl font-bold mb-4 text-center"
          style={{
            fontFamily: 'Cinzel, serif',
            color: 'var(--text-primary)',
          }}
        >
          Skills
        </h3>
        <p className="text-center" style={{ color: 'var(--text-muted)' }}>
          No ability scores available
        </p>
      </Card>
    );
  }

  // Get only proficient skills from character data
  const proficientSkills = character.proficiencies?.skills || [];

  // If no proficiencies, show a message instead of empty skills
  if (proficientSkills.length === 0) {
    return (
      <Card className="p-4">
        <h3
          className="text-xl font-bold mb-4 text-center"
          style={{
            fontFamily: 'Cinzel, serif',
            color: 'var(--text-primary)',
          }}
        >
          Skills
        </h3>
        <p
          className="text-center text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          No skill proficiencies
        </p>
      </Card>
    );
  }

  const skills: CharacterSkill[] = proficientSkills.map((skillEnum) => {
    const skillInfo = SKILL_INFO[skillEnum] || SKILL_INFO[Skill.UNSPECIFIED];
    const abilityScoreValue = abilityScores
      ? abilityScores[skillInfo.ability as keyof typeof abilityScores]
      : undefined;
    const abilityScore =
      typeof abilityScoreValue === 'number' ? abilityScoreValue : 10;
    const baseModifier = calculateModifier(abilityScore);

    // All skills in this list are proficient by definition
    const isProficient = true;
    const isExpertise = false; // TODO: Add expertise tracking when available in protobuf

    let totalModifier = baseModifier + proficiencyBonus;
    if (isExpertise) {
      totalModifier += proficiencyBonus; // Double proficiency for expertise
    }

    return {
      name: skillInfo.name,
      ability: skillInfo.ability,
      abilityShort: skillInfo.abilityShort,
      modifier: totalModifier,
      isProficient,
      isExpertise,
    };
  });

  // Sort skills alphabetically
  skills.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Card className="p-4">
      <h3
        className="text-xl font-bold mb-4 text-center"
        style={{
          fontFamily: 'Cinzel, serif',
          color: 'var(--text-primary)',
        }}
      >
        Skills
      </h3>

      <div className="space-y-2">
        {skills.map((skill) => (
          <div
            key={skill.name}
            className="flex items-center justify-between p-2 rounded transition-all hover:scale-105"
            style={{
              backgroundColor: skill.isProficient
                ? 'var(--card-bg)'
                : 'var(--bg-secondary)',
              border: `1px solid ${
                skill.isProficient
                  ? 'var(--accent-primary)'
                  : 'var(--border-primary)'
              }`,
            }}
          >
            <div className="flex items-center gap-2 flex-1">
              {/* Proficiency/Expertise Indicator */}
              <div className="flex flex-col items-center gap-0.5">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    backgroundColor: skill.isExpertise
                      ? 'var(--legendary)'
                      : skill.isProficient
                        ? 'var(--uncommon)'
                        : 'var(--border-primary)',
                  }}
                  title={
                    skill.isExpertise
                      ? 'Expertise'
                      : skill.isProficient
                        ? 'Proficient'
                        : 'Not Proficient'
                  }
                />
                {skill.isExpertise && (
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: 'var(--legendary)' }}
                  />
                )}
              </div>

              {/* Skill Name and Ability */}
              <div className="flex-1">
                <div
                  className="font-medium text-sm"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {skill.name}
                </div>
                <div
                  className="text-xs"
                  style={{ color: 'var(--text-subtle)' }}
                >
                  {skill.abilityShort}
                </div>
              </div>
            </div>

            {/* Modifier Display */}
            <div
              className="text-sm font-bold min-w-[2.5rem] text-center"
              style={{
                color: skill.isProficient
                  ? 'var(--text-primary)'
                  : 'var(--text-muted)',
              }}
            >
              {formatModifier(skill.modifier)}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div
        className="mt-4 pt-3 border-t"
        style={{ borderColor: 'var(--border-primary)' }}
      >
        <div className="flex items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: 'var(--uncommon)' }}
            />
            <span style={{ color: 'var(--text-subtle)' }}>Proficient</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="flex flex-col items-center gap-0.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: 'var(--legendary)' }}
              />
              <div
                className="w-1 h-1 rounded-full"
                style={{ backgroundColor: 'var(--legendary)' }}
              />
            </div>
            <span style={{ color: 'var(--text-subtle)' }}>Expertise</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: 'var(--border-primary)' }}
            />
            <span style={{ color: 'var(--text-subtle)' }}>Not Proficient</span>
          </div>
        </div>
      </div>

      {/* Quick Stats - only show if Perception is proficient */}
      {skills.some((s) => s.name === 'Perception') && (
        <div
          className="mt-4 pt-3 border-t text-center"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Passive Perception:{' '}
            {10 + (skills.find((s) => s.name === 'Perception')?.modifier || 0)}
          </div>
        </div>
      )}
    </Card>
  );
}
