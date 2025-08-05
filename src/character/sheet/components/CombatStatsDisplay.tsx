import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Card } from '../../../components/ui/Card';

interface CombatStatsDisplayProps {
  character: Character;
}

// Helper function to calculate proficiency bonus based on level
function calculateProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

// Helper function to calculate initiative modifier
function calculateInitiativeModifier(dexterity?: number): number {
  if (!dexterity) return 0;
  return Math.floor((dexterity - 10) / 2);
}

// Helper function to format modifier with sign
function formatModifier(modifier: number): string {
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

export function CombatStatsDisplay({ character }: CombatStatsDisplayProps) {
  const combatStats = character.combatStats;
  const abilityScores = character.abilityScores;

  const proficiencyBonus = calculateProficiencyBonus(character.level);
  const initiativeModifier = calculateInitiativeModifier(
    abilityScores?.dexterity
  );

  const stats = [
    {
      label: 'Armor Class',
      value: combatStats?.armorClass || 10,
      description: 'Base defense against attacks',
    },
    {
      label: 'Hit Points',
      value: `${character.currentHitPoints || 0}`,
      description: 'Current health',
    },
    {
      label: 'Initiative',
      value: formatModifier(initiativeModifier),
      description: 'Turn order modifier in combat',
    },
    {
      label: 'Proficiency Bonus',
      value: formatModifier(proficiencyBonus),
      description: 'Bonus for proficient skills and attacks',
    },
    {
      label: 'Speed',
      value: `${combatStats?.speed || 30} ft`,
      description: 'Movement per turn',
    },
    {
      label: 'Hit Dice',
      value: `${character.level}d8`,
      description: 'Dice for recovering hit points',
    },
  ];

  return (
    <Card className="p-6">
      <h3
        className="text-xl font-bold mb-6"
        style={{
          fontFamily: 'Cinzel, serif',
          color: 'var(--text-primary)',
        }}
      >
        Combat Statistics
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="text-center p-4 rounded-lg"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <div
              className="text-2xl font-bold mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
              {stat.value}
            </div>
            <div
              className="font-semibold mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              {stat.label}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-subtle)' }}>
              {stat.description}
            </div>
          </div>
        ))}
      </div>

      {/* Health Info */}
      <div className="mt-6 text-center">
        <div className="text-sm" style={{ color: 'var(--text-subtle)' }}>
          Current Hit Points: {character.currentHitPoints || 0}
        </div>
      </div>
    </Card>
  );
}
