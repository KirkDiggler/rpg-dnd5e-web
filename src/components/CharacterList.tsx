import { create } from '@bufbuild/protobuf';
import { CreateDraftRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useCreateDraft, useListCharacters } from '../api/hooks';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/Dialog';

interface CharacterListProps {
  playerId?: string;
  sessionId?: string;
}

export function CharacterList({ playerId, sessionId }: CharacterListProps) {
  const {
    data: characters,
    loading,
    error,
  } = useListCharacters({ playerId, sessionId });
  const { createDraft, loading: creating } = useCreateDraft();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateCharacter = async () => {
    try {
      const request = create(CreateDraftRequestSchema, {
        playerId: playerId || '',
        sessionId: sessionId || '',
      });
      const response = await createDraft(request);
      if (response.draft) {
        // TODO: Navigate to character creation wizard with draft ID
        console.log('Created draft:', response.draft.id);
      }
    } catch (err) {
      console.error('Failed to create draft:', err);
    }
  };

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
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button variant="primary">Create Character</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Character</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p style={{ color: 'var(--ink-brown)' }}>
                Ready to forge a new hero? Let's begin your adventure!
              </p>
              <div className="flex gap-4 justify-end">
                <Button
                  variant="secondary"
                  onClick={() => setIsCreating(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setIsCreating(false);
                    handleCreateCharacter();
                  }}
                  disabled={creating}
                >
                  {creating ? 'Creating...' : 'Start Creation'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
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
                        {character.race?.id || 'Unknown Race'}
                      </span>
                      <span
                        className="font-semibold"
                        style={{ color: 'var(--ink-sepia)' }}
                      >
                        {character.class?.id || 'Unknown Class'}
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
                          {character.hitPoints || 0}
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
                          {character.armorClass || 10}
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
