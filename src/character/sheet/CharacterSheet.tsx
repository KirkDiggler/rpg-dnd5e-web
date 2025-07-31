import { useGetCharacter } from '@/api/characterHooks';
import { create } from '@bufbuild/protobuf';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { GetCharacterRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { AbilityScoresPanel } from './components/AbilityScoresPanel';
import { CharacterHeader } from './components/CharacterHeader';
import { CombatStatsPanel } from './components/CombatStatsPanel';
import { EquipmentSlots } from './components/EquipmentSlots';
import { InventoryGrid } from './components/InventoryGrid';
import { SavingThrowsPanel } from './components/SavingThrowsPanel';
import { SkillsPanel } from './components/SkillsPanel';

interface CharacterSheetProps {
  characterId: string;
  onBack?: () => void;
}

export function CharacterSheet({ characterId, onBack }: CharacterSheetProps) {
  const [character, setCharacter] = useState<Character | null>(null);
  const { getCharacter, loading, error } = useGetCharacter();

  useEffect(() => {
    const fetchCharacter = async () => {
      try {
        const request = create(GetCharacterRequestSchema, { characterId });
        const response = await getCharacter(request);
        if (response.character) {
          setCharacter(response.character);
        }
      } catch (err) {
        console.error('Failed to fetch character:', err);
      }
    };

    fetchCharacter();
  }, [characterId, getCharacter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5 p-4 flex items-center justify-center">
        <div className="text-xl" style={{ color: 'var(--text-primary)' }}>
          Loading character...
        </div>
      </div>
    );
  }

  if (error || !character) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5 p-4 flex items-center justify-center">
        <div className="text-xl" style={{ color: 'var(--error)' }}>
          Failed to load character
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5 p-4">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
          {/* Back Button */}
          {onBack && (
            <button
              onClick={onBack}
              className="mb-4 px-4 py-2 rounded-lg border transition-colors flex items-center gap-2"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            >
              ← Back to Characters
            </button>
          )}

          {/* Character Header */}
          <CharacterHeader character={character} />

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column */}
            <div className="lg:col-span-1 space-y-6">
              <AbilityScoresPanel character={character} />
              <SavingThrowsPanel character={character} />
              <SkillsPanel character={character} />
            </div>

            {/* Middle Column */}
            <div className="lg:col-span-1 space-y-6">
              <CombatStatsPanel character={character} />
              <EquipmentSlots character={character} />
            </div>

            {/* Right Column */}
            <div className="lg:col-span-1 space-y-6">
              <InventoryGrid character={character} />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
