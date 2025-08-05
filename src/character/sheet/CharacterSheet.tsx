import { motion } from 'framer-motion';
import { useGetCharacter } from '../../api/hooks';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { AbilityScoresDisplay } from './components/AbilityScoresDisplay';
import { CharacterHeader } from './components/CharacterHeader';
import { CombatStatsDisplay } from './components/CombatStatsDisplay';

interface CharacterSheetProps {
  characterId: string;
  onBack: () => void;
}

export function CharacterSheet({ characterId, onBack }: CharacterSheetProps) {
  const {
    data: character,
    loading,
    error,
    refetch,
  } = useGetCharacter(characterId);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-16 h-16 border-4 border-t-transparent rounded-full"
          style={{
            borderColor: 'var(--board-accent)',
            borderTopColor: 'transparent',
          }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="text-center py-8">
        <p className="mb-4" style={{ color: 'var(--text-muted)' }}>
          Failed to load character
        </p>
        <div className="space-x-4">
          <Button variant="secondary" onClick={() => refetch()}>
            Try Again
          </Button>
          <Button variant="secondary" onClick={onBack}>
            Back to List
          </Button>
        </div>
      </Card>
    );
  }

  if (!character) {
    return (
      <Card className="text-center py-8">
        <p className="mb-4" style={{ color: 'var(--text-muted)' }}>
          Character not found
        </p>
        <Button variant="secondary" onClick={onBack}>
          Back to List
        </Button>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-6xl mx-auto space-y-6"
    >
      {/* Back Button */}
      <div className="flex justify-start">
        <Button variant="secondary" onClick={onBack}>
          ← Back to Character List
        </Button>
      </div>

      {/* Character Header */}
      <CharacterHeader character={character} />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Ability Scores */}
        <div className="lg:col-span-1">
          <AbilityScoresDisplay character={character} />
        </div>

        {/* Right Column - Combat Stats and other info */}
        <div className="lg:col-span-2 space-y-6">
          <CombatStatsDisplay character={character} />

          {/* Placeholder for future sections */}
          <Card className="p-6">
            <h3
              className="text-xl font-bold mb-4"
              style={{
                fontFamily: 'Cinzel, serif',
                color: 'var(--text-primary)',
              }}
            >
              Coming Soon
            </h3>
            <p style={{ color: 'var(--text-muted)' }}>
              Skills, equipment, spells, and other character features will be
              added in future phases.
            </p>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
