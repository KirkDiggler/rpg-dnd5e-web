import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Card } from '../../../components/ui/Card';

interface DnDAbilityScoresProps {
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

export function DnDAbilityScores({ character }: DnDAbilityScoresProps) {
  const abilityScores = character.abilityScores;

  if (!abilityScores) {
    return null;
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
    <Card className="p-4">
      <h4
        className="text-sm font-bold mb-3 uppercase tracking-wider text-center"
        style={{
          color: 'var(--text-primary)',
        }}
      >
        Ability Scores
      </h4>

      <div className="space-y-1">
        {abilities.map((ability) => (
          <div
            key={ability.short}
            className="flex items-center justify-between py-1 px-2 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-800"
            title={`${ability.name}: ${ability.value} (${formatModifier(ability.modifier)})`}
          >
            {/* Ability Short Name */}
            <div
              className="font-bold text-sm"
              style={{ color: 'var(--text-primary)' }}
            >
              {ability.short}
            </div>

            {/* Score and Modifier */}
            <div className="flex items-center gap-2">
              <div
                className="text-sm font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                {ability.value}
              </div>
              <div
                className="text-xs px-1"
                style={{
                  color: ability.modifier >= 0 ? 'var(--success)' : 'var(--danger)',
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
