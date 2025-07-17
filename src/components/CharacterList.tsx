import { AnimatePresence, motion } from 'framer-motion';
import { useListCharacters } from '../api/hooks';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface CharacterListProps {
  playerId?: string;
  sessionId?: string;
  onCreateCharacter?: () => void;
}

export function CharacterList({
  playerId,
  sessionId,
  onCreateCharacter,
}: CharacterListProps) {
  const {
    data: characters,
    loading,
    error,
  } = useListCharacters({ playerId, sessionId });

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
        <p className="mb-4" style={{ color: 'var(--ink-brown)' }}>
          Failed to load characters
        </p>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Try Again
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2
          className="text-3xl font-bold text-shadow"
          style={{
            fontFamily: 'Cinzel, serif',
            color: 'var(--parchment-light)',
          }}
        >
          Your Characters
        </h2>
        <Button variant="primary" onClick={onCreateCharacter}>
          Create Character
        </Button>
      </div>

      {characters.length === 0 ? (
        <Card className="text-center py-12">
          <div className="space-y-4">
            <h3
              className="text-xl"
              style={{
                fontFamily: 'Cinzel, serif',
                color: 'var(--ink-black)',
              }}
            >
              No Characters Yet
            </h3>
            <p style={{ color: 'var(--ink-brown)' }}>
              Your adventure awaits! Create your first character to begin.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {characters.map((character) => (
              <motion.div
                key={character.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <Card
                  rarity={
                    character.level > 15
                      ? 'legendary'
                      : character.level > 10
                        ? 'epic'
                        : character.level > 5
                          ? 'rare'
                          : character.level > 3
                            ? 'uncommon'
                            : 'common'
                  }
                  className="cursor-pointer hover:scale-105 transition-transform"
                >
                  <div className="space-y-3">
                    <h3
                      className="text-xl font-bold"
                      style={{
                        fontFamily: 'Cinzel, serif',
                        color: 'var(--ink-black)',
                      }}
                    >
                      {character.name}
                    </h3>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: 'var(--ink-brown)' }}>
                        Level {character.level}{' '}
                        {character.race || 'Unknown Race'}
                      </span>
                      <span
                        className="font-semibold"
                        style={{ color: 'var(--ink-sepia)' }}
                      >
                        {character.class || 'Unknown Class'}
                      </span>
                    </div>

                    {/* Character stats preview */}
                    <div className="grid grid-cols-3 gap-2 pt-2">
                      <div className="stat-block">
                        <div
                          className="text-xs"
                          style={{ color: 'var(--ink-sepia)' }}
                        >
                          HP
                        </div>
                        <div className="font-bold">
                          {character.currentHitPoints || 0}
                        </div>
                      </div>
                      <div className="stat-block">
                        <div
                          className="text-xs"
                          style={{ color: 'var(--ink-sepia)' }}
                        >
                          AC
                        </div>
                        <div className="font-bold">
                          {character.combatStats?.armorClass || 10}
                        </div>
                      </div>
                      <div className="stat-block">
                        <div
                          className="text-xs"
                          style={{ color: 'var(--ink-sepia)' }}
                        >
                          Init
                        </div>
                        <div className="font-bold">
                          {character.abilityScores?.dexterity
                            ? `+${Math.floor((character.abilityScores.dexterity - 10) / 2)}`
                            : '+0'}
                        </div>
                      </div>
                    </div>

                    {/* XP Progress bar */}
                    <div className="space-y-1">
                      <div
                        className="flex justify-between text-xs"
                        style={{ color: 'var(--ink-sepia)' }}
                      >
                        <span>Experience</span>
                        <span>{character.experiencePoints || 0} XP</span>
                      </div>
                      <div className="resource-bar">
                        <div
                          className="resource-fill"
                          style={{
                            width: `${((character.experiencePoints || 0) % 1000) / 10}%`,
                            backgroundColor: 'var(--experience)',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
