import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  Class,
  Race,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { Card } from '../../../components/ui/Card';

interface CharacterHeaderProps {
  character: Character;
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

export function CharacterHeader({ character }: CharacterHeaderProps) {
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
      className="p-6"
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
          <div className="text-center">
            <div
              className="text-2xl font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              {character.currentHitPoints || 0}
            </div>
            <div className="text-sm" style={{ color: 'var(--text-subtle)' }}>
              Hit Points
            </div>
          </div>
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
            >
              {character.experiencePoints || 0}
            </div>
            <div className="text-sm" style={{ color: 'var(--text-subtle)' }}>
              Experience
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
