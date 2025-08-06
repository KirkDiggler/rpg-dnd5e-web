import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Card } from '../../../components/ui/Card';

interface CombatStatsDisplayProps {
  character: Character;
}

// Helper function to calculate proficiency bonus based on level
function calculateProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

// Helper function to calculate ability modifier
function calculateModifier(score: number): number {
  return Math.floor((score - 10) / 2);
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

  // Calculate death save success/failures (placeholder for now)
  const deathSaves = {
    successes: 0,
    failures: 0,
  };

  const primaryStats = [
    {
      label: 'Armor Class',
      value: combatStats?.armorClass || 10,
      description: 'Base defense against attacks',
      important: true,
    },
    {
      label: 'Initiative',
      value: formatModifier(initiativeModifier),
      description: 'Turn order modifier in combat',
      important: true,
    },
    {
      label: 'Speed',
      value: `${combatStats?.speed || 30} ft`,
      description: 'Movement per turn',
      important: true,
    },
  ];

  const secondaryStats = [
    {
      label: 'Proficiency Bonus',
      value: formatModifier(proficiencyBonus),
      description: 'Bonus for proficient skills and attacks',
    },
    {
      label: 'Hit Dice',
      value: `${character.level}d8`, // This should ideally come from class info
      description: 'Dice for recovering hit points',
    },
    {
      label: 'Passive Perception',
      value: 10 + calculateModifier(abilityScores?.wisdom || 10), // Base calculation
      description: 'Passive awareness of surroundings',
    },
  ];

  return (
    <Card className="p-4">
      <h3
        className="text-xl font-bold mb-4"
        style={{
          fontFamily: 'Cinzel, serif',
          color: 'var(--text-primary)',
        }}
      >
        Combat Statistics
      </h3>

      {/* Primary Combat Stats - Larger display */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {primaryStats.map((stat) => (
          <div
            key={stat.label}
            className="text-center p-4 rounded-lg transition-all hover:scale-105"
            style={{
              backgroundColor: 'var(--card-bg)',
              border: '2px solid var(--accent-primary)',
            }}
          >
            <div
              className="text-3xl font-bold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {stat.value}
            </div>
            <div
              className="font-semibold mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
              {stat.label}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-subtle)' }}>
              {stat.description}
            </div>
          </div>
        ))}
      </div>

      {/* Secondary Stats - Smaller display */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {secondaryStats.map((stat) => (
          <div
            key={stat.label}
            className="text-center p-3 rounded-lg"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <div
              className="text-lg font-bold mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
              {stat.value}
            </div>
            <div
              className="text-sm font-medium mb-1"
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

      {/* Death Saves (if applicable) */}
      {character.currentHitPoints === 0 && (
        <div
          className="p-4 rounded-lg mb-4"
          style={{
            backgroundColor: 'var(--health)',
            border: '1px solid var(--border-primary)',
          }}
        >
          <h4 className="text-lg font-bold mb-3 text-white text-center">
            Death Saving Throws
          </h4>
          <div className="flex justify-center gap-8">
            <div className="text-center">
              <div className="text-white font-bold">Successes</div>
              <div className="flex gap-1 mt-1">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-4 h-4 rounded-full border-2 border-white"
                    style={{
                      backgroundColor:
                        i <= deathSaves.successes ? 'white' : 'transparent',
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="text-center">
              <div className="text-white font-bold">Failures</div>
              <div className="flex gap-1 mt-1">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-4 h-4 rounded-full border-2 border-white"
                    style={{
                      backgroundColor:
                        i <= deathSaves.failures ? 'white' : 'transparent',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hit Point Details */}
      <div
        className="p-3 rounded-lg text-center"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
        }}
      >
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Health Details
        </div>
        <div className="mt-1 space-y-1">
          <div style={{ color: 'var(--text-primary)' }}>
            Current: {character.currentHitPoints || 0} / {100}{' '}
            {/* TODO: Calculate max HP */}
          </div>
          {character.temporaryHitPoints && character.temporaryHitPoints > 0 && (
            <div style={{ color: 'var(--uncommon)' }}>
              Temporary HP: +{character.temporaryHitPoints}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
