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
      <Card className="p-6">
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
    <Card className="p-6">
      <h3
        className="text-xl font-bold mb-6 text-center"
        style={{
          fontFamily: 'Cinzel, serif',
          color: 'var(--ink-black)',
        }}
      >
        Ability Scores
      </h3>

      <div className="space-y-4">
        {abilities.map((ability) => (
          <div
            key={ability.short}
            className="flex items-center justify-between p-4 rounded-lg"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <div className="flex-1">
              <div
                className="font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {ability.name}
              </div>
              <div className="text-sm" style={{ color: 'var(--text-subtle)' }}>
                {ability.short}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Ability Score */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--text-button)',
                }}
              >
                {ability.value}
              </div>

              {/* Modifier */}
              <div
                className="w-16 h-8 rounded flex items-center justify-center font-bold"
                style={{
                  backgroundColor:
                    ability.modifier >= 0 ? 'var(--uncommon)' : 'var(--health)',
                  color: 'white',
                }}
              >
                {formatModifier(ability.modifier)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
