import {
  Class,
  MonsterType,
  Race,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

// Race display names
export function getRaceDisplayName(raceEnum: Race): string {
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

// Class display names
export function getClassDisplayName(classEnum: Class): string {
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

// Format character level and class/race
export function formatCharacterSummary(
  level: number,
  race: Race,
  classEnum: Class
): string {
  return `Level ${level} ${getRaceDisplayName(race)} ${getClassDisplayName(classEnum)}`;
}

// Monster type display names
export function getMonsterTypeDisplayName(monsterType: MonsterType): string {
  const monsterNames: Partial<Record<MonsterType, string>> = {
    [MonsterType.UNSPECIFIED]: 'Unknown',
    // Undead
    [MonsterType.SKELETON]: 'Skeleton',
    [MonsterType.SKELETON_ARCHER]: 'Skeleton Archer',
    [MonsterType.SKELETON_CAPTAIN]: 'Skeleton Captain',
    [MonsterType.ZOMBIE]: 'Zombie',
    [MonsterType.GHOUL]: 'Ghoul',
    // Beasts
    [MonsterType.GIANT_RAT]: 'Giant Rat',
    [MonsterType.GIANT_SPIDER]: 'Giant Spider',
    [MonsterType.GIANT_WOLF_SPIDER]: 'Giant Wolf Spider',
    [MonsterType.WOLF]: 'Wolf',
    [MonsterType.BROWN_BEAR]: 'Brown Bear',
    // Humanoids
    [MonsterType.BANDIT]: 'Bandit',
    [MonsterType.BANDIT_ARCHER]: 'Bandit Archer',
    [MonsterType.BANDIT_CAPTAIN]: 'Bandit Captain',
    [MonsterType.THUG]: 'Thug',
    [MonsterType.GOBLIN]: 'Goblin',
  };
  return monsterNames[monsterType] || 'Unknown Monster';
}
