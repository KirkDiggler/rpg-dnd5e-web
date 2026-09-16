import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Race } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { getClassDisplayName } from '../../../utils/displayNames';

interface CharacterHeaderProps {
  character: Character;
  /** Enter the level-up screen. Absent where levelling is not offered. */
  onLevelUp?: () => void;
}

// Simple read-only HP display component
function HPDisplay({
  currentHP,
  maxHP,
  tempHP = 0,
}: {
  currentHP: number;
  maxHP: number;
  tempHP?: number;
}) {
  return (
    <div className="text-center">
      <div
        className="text-2xl font-bold"
        style={{ color: 'var(--text-primary)' }}
      >
        {currentHP}
        {tempHP > 0 && <span className="text-sm text-blue-400">+{tempHP}</span>}
        <span className="text-lg" style={{ color: 'var(--text-muted)' }}>
          /{maxHP}
        </span>
      </div>
      <div className="text-sm" style={{ color: 'var(--text-subtle)' }}>
        Hit Points
      </div>
    </div>
  );
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

export function CharacterHeader({
  character,
  onLevelUp,
}: CharacterHeaderProps) {
  // THE GAP IS THE SIGNAL. Entitlement is what the character MAY take, derived
  // by the API from its experience total; the record says what it HAS taken.
  // The difference is the whole "level up available" state — no flag, no
  // stored field, nothing to keep in sync — so a character that is entitled
  // and keeps playing without levelling is simply one whose gap is still open.
  const levelUpAvailable = character.entitledLevel > character.level;
  // NAME THE LEVEL THE SCREEN OFFERS, NOT THE ONE ENTITLEMENT REACHES. The
  // screen takes one level at a time — GetNextLevel returns "the class level
  // the character would take, one above its current level" — while
  // entitlement can run several ahead, because R4.10 makes the gap the signal
  // and an eligible character may keep playing without levelling. The two
  // agree only while the gap is exactly one.
  const nextLevel = character.level + 1;

  return (
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
      className="p-4"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Character Name and Basic Info */}
        <div className="space-y-2">
          <h1
            className="text-4xl font-bold"
            style={{
              fontFamily: 'Cinzel, serif',
              color: 'var(--text-primary)',
            }}
          >
            {character.name}
          </h1>
          <div className="flex flex-wrap gap-4 text-lg">
            <span style={{ color: 'var(--text-muted)' }}>
              Level {character.level} {getRaceDisplayName(character.race)}{' '}
              {getClassDisplayName(character.class)}
            </span>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex gap-6">
          <HPDisplay
            currentHP={character.currentHitPoints || 0}
            maxHP={character.combatStats?.hitPointMaximum || 0}
            tempHP={character.temporaryHitPoints || 0}
          />
          <div className="text-center">
            <div
              className="text-2xl font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              {character.combatStats?.armorClass || 10}
            </div>
            <div className="text-sm" style={{ color: 'var(--text-subtle)' }}>
              Armor Class
            </div>
          </div>
          <div className="text-center">
            <div
              className="text-2xl font-bold"
              style={{ color: 'var(--text-primary)' }}
              data-testid="experience-readout"
            >
              {character.experiencePoints || 0}
              {/* A next threshold of 0 means there is no next level, because
                  the character is at the top of the table — not that the next
                  level is free — so there is nothing to show it against. */}
              {character.nextLevelThreshold > 0 && (
                <span
                  className="text-lg"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {' / '}
                  {character.nextLevelThreshold}
                </span>
              )}
            </div>
            <div className="text-sm" style={{ color: 'var(--text-subtle)' }}>
              Experience
            </div>
          </div>
        </div>
      </div>

      {levelUpAvailable && onLevelUp && (
        <div className="mt-4 flex justify-end">
          <Button
            data-testid="level-up-prompt"
            variant="commit"
            onClick={onLevelUp}
          >
            Level Up to {nextLevel}
          </Button>
        </div>
      )}
    </Card>
  );
}
