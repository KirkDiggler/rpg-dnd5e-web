import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Card } from '../../../components/ui/Card';

interface DnDCombatStatsProps {
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

export function DnDCombatStats({ character }: DnDCombatStatsProps) {
  const combatStats = character.combatStats;
  const abilityScores = character.abilityScores;

  // Use API data when available, fallback to calculations
  const initiativeModifier =
    combatStats?.initiative !== undefined
      ? combatStats.initiative
      : calculateModifier(abilityScores?.dexterity || 10);
  const maxHP = combatStats?.hitPointMaximum || 10; // Use API hitPointMaximum
  const currentHP = character.currentHitPoints || maxHP;
  const tempHP = character.temporaryHitPoints || 0;

  // Calculate AC if not provided in API (base 10 + DEX modifier for no armor)
  const armorClass =
    combatStats?.armorClass !== undefined && combatStats.armorClass > 0
      ? combatStats.armorClass
      : 10 + calculateModifier(abilityScores?.dexterity || 10);

  return (
    <Card className="p-4">
      {/* Top Row - AC, Initiative, Speed, HP */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        {/* Armor Class */}
        <div className="text-center">
          <h4
            className="text-xs font-bold mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            AC
          </h4>
          <div
            className="w-12 h-12 mx-auto rounded-full flex items-center justify-center text-xl font-bold"
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--text-button)',
            }}
          >
            {armorClass}
          </div>
        </div>

        {/* Initiative */}
        <div className="text-center">
          <h4
            className="text-xs font-bold mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            INITIATIVE
          </h4>
          <div
            className="text-2xl font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            {formatModifier(initiativeModifier)}
          </div>
        </div>

        {/* Speed */}
        <div className="text-center">
          <h4
            className="text-xs font-bold mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            SPEED
          </h4>
          <div
            className="text-2xl font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            {combatStats?.speed || 30}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            ft
          </div>
        </div>

        {/* Hit Points - Display Only */}
        <div className="text-center">
          <h4
            className="text-xs font-bold mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            HIT POINTS
          </h4>
          <div className="text-xl font-bold" style={{ color: 'var(--health)' }}>
            {currentHP}/{maxHP}
          </div>
          {tempHP > 0 && (
            <div className="text-sm" style={{ color: 'var(--accent-primary)' }}>
              +{tempHP} temp
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row - Hit Dice and Death Saves */}
      <div
        className="grid grid-cols-2 gap-4 pt-3 border-t"
        style={{ borderColor: 'var(--border-primary)' }}
      >
        <div className="text-center">
          <h4
            className="text-xs font-bold mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            HIT DICE
          </h4>
          <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
            {combatStats?.hitDice || `${character.level}d8`}
          </div>
        </div>

        <div className="text-center">
          <h4
            className="text-xs font-bold mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            DEATH SAVES
          </h4>
          <div
            className="flex justify-center gap-2 text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            <span>S: ○○○</span>
            <span>F: ○○○</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
