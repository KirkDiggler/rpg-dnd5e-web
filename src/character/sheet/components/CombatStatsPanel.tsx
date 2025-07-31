import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { motion } from 'framer-motion';
import { Footprints, Heart, Shield, Sword, Zap } from 'lucide-react';

interface CombatStatsPanelProps {
  character: Character;
}

export function CombatStatsPanel({ character }: CombatStatsPanelProps) {
  const getModifier = (score: number) => Math.floor((score - 10) / 2);
  const formatModifier = (mod: number) => (mod >= 0 ? `+${mod}` : `${mod}`);

  // Calculate derived stats
  const dexModifier = getModifier(character.abilityScores?.dexterity || 10);
  const initiative = dexModifier;

  // TODO: These should come from character data once available in protos
  const armorClass = 10 + dexModifier; // Base AC calculation
  const speed = 30; // Default speed in feet
  const hitDice = `1d${character.class === 'Fighter' ? 10 : 8}`; // Simplified hit dice

  const combatStats = [
    {
      label: 'Armor Class',
      value: armorClass.toString(),
      icon: Shield,
      color: 'var(--accent-primary)',
    },
    {
      label: 'Initiative',
      value: formatModifier(initiative),
      icon: Zap,
      color: 'var(--warning)',
    },
    {
      label: 'Speed',
      value: `${speed} ft`,
      icon: Footprints,
      color: 'var(--success)',
    },
    {
      label: 'Hit Dice',
      value: `${character.level}${hitDice}`,
      icon: Heart,
      color: 'var(--error)',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="game-card p-6"
      style={{
        background: 'var(--card-bg)',
        border: '2px solid var(--border-primary)',
        borderRadius: '0.75rem',
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Sword className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
        <h2
          className="text-xl font-bold font-serif"
          style={{ color: 'var(--text-primary)' }}
        >
          Combat Stats
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {combatStats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 * index }}
              className="text-center p-4 rounded-lg border-2 hover:border-opacity-100 transition-all"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: stat.color,
                borderOpacity: 0.5,
              }}
            >
              <Icon
                className="w-6 h-6 mx-auto mb-2"
                style={{ color: stat.color }}
              />
              <div
                className="text-2xl font-bold mb-1"
                style={{ color: 'var(--text-primary)' }}
              >
                {stat.value}
              </div>
              <div
                className="text-xs uppercase"
                style={{ color: 'var(--text-muted)' }}
              >
                {stat.label}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Attacks Section */}
      <div
        className="mt-6 pt-4 border-t"
        style={{ borderColor: 'var(--border-primary)' }}
      >
        <h3
          className="text-sm font-bold uppercase mb-3"
          style={{ color: 'var(--text-secondary)' }}
        >
          Attacks & Spellcasting
        </h3>

        {/* Placeholder for attacks - will be populated from equipment/spells */}
        <div
          className="text-sm text-center py-4 rounded border-2 border-dashed"
          style={{
            borderColor: 'var(--border-primary)',
            color: 'var(--text-muted)',
          }}
        >
          Equip weapons to see attack options
        </div>
      </div>
    </motion.div>
  );
}
