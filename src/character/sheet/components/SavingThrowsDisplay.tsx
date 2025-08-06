import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Card } from '../../../components/ui/Card';

interface SavingThrowsDisplayProps {
  character: Character;
}

interface SavingThrow {
  ability: string;
  short: string;
  modifier: number;
  isProficient: boolean;
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

export function SavingThrowsDisplay({ character }: SavingThrowsDisplayProps) {
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
          Saving Throws
        </h3>
        <p className="text-center" style={{ color: 'var(--text-muted)' }}>
          No ability scores available
        </p>
      </Card>
    );
  }

  // Get saving throw proficiencies from character
  // This would ideally come from the character's class and race
  // For now, we'll use a placeholder system
  const savingThrowProficiencies = new Set<string>([
    // These should come from the character's protobuf data
    // For demonstration, let's assume some common ones based on class
  ]);

  const savingThrows: SavingThrow[] = [
    {
      ability: 'Strength',
      short: 'STR',
      modifier: calculateModifier(abilityScores.strength || 10),
      isProficient: savingThrowProficiencies.has('strength'),
    },
    {
      ability: 'Dexterity',
      short: 'DEX',
      modifier: calculateModifier(abilityScores.dexterity || 10),
      isProficient: savingThrowProficiencies.has('dexterity'),
    },
    {
      ability: 'Constitution',
      short: 'CON',
      modifier: calculateModifier(abilityScores.constitution || 10),
      isProficient: savingThrowProficiencies.has('constitution'),
    },
    {
      ability: 'Intelligence',
      short: 'INT',
      modifier: calculateModifier(abilityScores.intelligence || 10),
      isProficient: savingThrowProficiencies.has('intelligence'),
    },
    {
      ability: 'Wisdom',
      short: 'WIS',
      modifier: calculateModifier(abilityScores.wisdom || 10),
      isProficient: savingThrowProficiencies.has('wisdom'),
    },
    {
      ability: 'Charisma',
      short: 'CHA',
      modifier: calculateModifier(abilityScores.charisma || 10),
      isProficient: savingThrowProficiencies.has('charisma'),
    },
  ];

  return (
    <Card className="p-6 h-fit">
      <h3
        className="text-xl font-bold mb-6 text-center"
        style={{
          fontFamily: 'Cinzel, serif',
          color: 'var(--text-primary)',
        }}
      >
        Saving Throws
      </h3>

      <div className="space-y-3">
        {savingThrows.map((save) => {
          const totalModifier =
            save.modifier + (save.isProficient ? proficiencyBonus : 0);

          return (
            <div
              key={save.short}
              className="flex items-center justify-between p-3 rounded-lg transition-all hover:scale-105"
              style={{
                backgroundColor: save.isProficient
                  ? 'var(--card-bg)'
                  : 'var(--bg-secondary)',
                border: `1px solid ${
                  save.isProficient
                    ? 'var(--accent-primary)'
                    : 'var(--border-primary)'
                }`,
              }}
            >
              <div className="flex items-center gap-2">
                {/* Proficiency Indicator */}
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: save.isProficient
                      ? 'var(--uncommon)'
                      : 'var(--border-primary)',
                  }}
                  title={save.isProficient ? 'Proficient' : 'Not Proficient'}
                />

                {/* Ability Name */}
                <div className="flex-1">
                  <div
                    className="font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {save.ability}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: 'var(--text-subtle)' }}
                  >
                    {save.short}
                  </div>
                </div>
              </div>

              {/* Modifier Display */}
              <div
                className="text-lg font-bold min-w-[3rem] text-center"
                style={{
                  color: save.isProficient
                    ? 'var(--text-primary)'
                    : 'var(--text-muted)',
                }}
              >
                {formatModifier(totalModifier)}
              </div>
            </div>
          );
        })}
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
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: 'var(--border-primary)' }}
            />
            <span style={{ color: 'var(--text-subtle)' }}>Not Proficient</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
