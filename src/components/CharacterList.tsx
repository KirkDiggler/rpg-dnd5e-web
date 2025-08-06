import {
  Class,
  Race,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { AnimatePresence, motion } from 'framer-motion';
import { useListCharacters, useListDrafts } from '../api/hooks';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface CharacterListProps {
  playerId?: string;
  sessionId?: string;
  onCreateCharacter?: () => void;
  onResumeDraft?: (draftId: string) => void;
  onViewCharacter?: (characterId: string) => void;
}

// Helper to convert Race enum to display name
function getRaceDisplayName(raceEnum: Race): string {
  const raceNames: Record<Race, string> = {
    [Race.UNSPECIFIED]: 'Unknown',
    [Race.HUMAN]: 'Human',
    [Race.ELF]: 'Elf',
    [Race.DWARF]: 'Dwarf',
    [Race.HALFLING]: 'Halfling',
    [Race.DRAGONBORN]: 'Dragonborn',
    [Race.GNOME]: 'Gnome',
    [Race.HALF_ELF]: 'Half-Elf',
    [Race.HALF_ORC]: 'Half-Orc',
    [Race.TIEFLING]: 'Tiefling',
  };
  return raceNames[raceEnum] || 'Unknown Race';
}

// Helper to convert Class enum to display name
function getClassDisplayName(classEnum: Class): string {
  const classNames: Record<Class, string> = {
    [Class.UNSPECIFIED]: 'Unknown',
    [Class.BARBARIAN]: 'Barbarian',
    [Class.BARD]: 'Bard',
    [Class.CLERIC]: 'Cleric',
    [Class.DRUID]: 'Druid',
    [Class.FIGHTER]: 'Fighter',
    [Class.MONK]: 'Monk',
    [Class.PALADIN]: 'Paladin',
    [Class.RANGER]: 'Ranger',
    [Class.ROGUE]: 'Rogue',
    [Class.SORCERER]: 'Sorcerer',
    [Class.WARLOCK]: 'Warlock',
    [Class.WIZARD]: 'Wizard',
  };
  return classNames[classEnum] || 'Unknown Class';
}

export function CharacterList({
  playerId,
  sessionId,
  onCreateCharacter,
  onResumeDraft,
  onViewCharacter,
}: CharacterListProps) {
  const {
    data: characters,
    loading: charactersLoading,
    error: charactersError,
  } = useListCharacters({ playerId, sessionId });

  const {
    data: drafts,
    loading: draftsLoading,
    error: draftsError,
  } = useListDrafts({ playerId, sessionId });

  const loading = charactersLoading || draftsLoading;
  const error = charactersError || draftsError;

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
    <div className="space-y-8">
      {/* Drafts Section */}
      {drafts.length > 0 && (
        <div className="space-y-4">
          <h2
            className="text-2xl font-bold text-shadow"
            style={{
              fontFamily: 'Cinzel, serif',
              color: 'var(--parchment-light)',
            }}
          >
            Continue Character Creation
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {drafts.map((draft) => (
              <Card
                key={draft.id}
                className="cursor-pointer hover:scale-105 transition-transform"
                onClick={() => onResumeDraft?.(draft.id)}
              >
                <div className="space-y-2">
                  <h3
                    className="text-lg font-bold"
                    style={{
                      fontFamily: 'Cinzel, serif',
                      color: 'var(--ink-black)',
                    }}
                  >
                    {draft.name || 'Unnamed Character'}
                  </h3>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--ink-brown)' }}>
                      {/* Use full object name if available, otherwise use ID */}
                      {draft.race?.name ||
                        (draft.raceId
                          ? getRaceDisplayName(draft.raceId)
                          : 'No Race')}
                    </span>
                    <span style={{ color: 'var(--ink-sepia)' }}>
                      {/* Use full object name if available, otherwise use ID */}
                      {draft.class?.name ||
                        (draft.classId
                          ? getClassDisplayName(draft.classId)
                          : 'No Class')}
                    </span>
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: 'var(--ink-sepia)' }}
                  >
                    Progress: {draft.progress?.completionPercentage || 0}%
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Characters Section */}
      <div className="space-y-4">
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
                    className="hover:scale-105 transition-transform"
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
                          {getRaceDisplayName(character.race)}
                        </span>
                        <span
                          className="font-semibold"
                          style={{ color: 'var(--ink-sepia)' }}
                        >
                          {getClassDisplayName(character.class)}
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

                      {/* Action Button */}
                      <div className="pt-2">
                        <Button
                          variant="primary"
                          onClick={() => onViewCharacter?.(character.id)}
                          className="w-full"
                        >
                          View Character
                        </Button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
