import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Card } from '../../../components/ui/Card';

interface AbilityScoresDisplayProps {
  character: Character;
}

interface AbilityScore {
  name: string;
  short: string;
  value: number;
  modifier: number;
}

// Helper function to calculate ability modifier
function calculateModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

// Helper function to format modifier with sign
function formatModifier(modifier: number): string {
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

export function AbilityScoresDisplay({ character }: AbilityScoresDisplayProps) {
  const abilityScores = character.abilityScores;

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
          Ability Scores
        </h3>
        <p className="text-center" style={{ color: 'var(--text-muted)' }}>
          No ability scores available
        </p>
      </Card>
    );
  }

  const abilities: AbilityScore[] = [
    {
      name: 'Strength',
      short: 'STR',
      value: abilityScores.strength || 10,
      modifier: calculateModifier(abilityScores.strength || 10),
    },
    {
      name: 'Dexterity',
      short: 'DEX',
      value: abilityScores.dexterity || 10,
      modifier: calculateModifier(abilityScores.dexterity || 10),
    },
    {
      name: 'Constitution',
      short: 'CON',
      value: abilityScores.constitution || 10,
      modifier: calculateModifier(abilityScores.constitution || 10),
    },
    {
      name: 'Intelligence',
      short: 'INT',
      value: abilityScores.intelligence || 10,
      modifier: calculateModifier(abilityScores.intelligence || 10),
    },
    {
      name: 'Wisdom',
      short: 'WIS',
      value: abilityScores.wisdom || 10,
      modifier: calculateModifier(abilityScores.wisdom || 10),
    },
    {
      name: 'Charisma',
      short: 'CHA',
      value: abilityScores.charisma || 10,
      modifier: calculateModifier(abilityScores.charisma || 10),
    },
  ];

  return (
    <Card className="p-4 h-fit">
      <h3
        className="text-xl font-bold mb-4 text-center"
        style={{
          fontFamily: 'Cinzel, serif',
          color: 'var(--text-primary)',
        }}
      >
        Ability Scores
      </h3>

      <div className="space-y-3">
        {abilities.map((ability) => (
          <div
            key={ability.short}
            className="text-center p-3 rounded-lg transition-all hover:scale-105"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            {/* Ability Name */}
            <div
              className="text-sm font-medium mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
              {ability.short.toUpperCase()}
            </div>

            {/* Score Circle - D&D traditional style */}
            <div className="relative mx-auto mb-2">
              <div
                className="w-16 h-16 rounded border-2 flex flex-col items-center justify-center"
                style={{
                  backgroundColor: 'var(--card-bg)',
                  borderColor: 'var(--accent-primary)',
                }}
              >
                <div
                  className="text-xl font-bold leading-none"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {ability.value}
                </div>
              </div>

              {/* Modifier Badge */}
              <div
                className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-8 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  backgroundColor:
                    ability.modifier >= 0 ? 'var(--uncommon)' : 'var(--health)',
                  color: 'white',
                }}
              >
                {formatModifier(ability.modifier)}
              </div>
            </div>

            {/* Full Name */}
            <div
              className="text-xs font-medium"
              style={{ color: 'var(--text-subtle)' }}
            >
              {ability.name}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
