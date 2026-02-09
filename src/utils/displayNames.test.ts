import {
  Class,
  MonsterType,
  Race,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { describe, expect, it } from 'vitest';
import {
  formatCharacterSummary,
  getClassDisplayName,
  getMonsterTypeDisplayName,
  getRaceDisplayName,
} from './displayNames';

describe('getRaceDisplayName', () => {
  it('returns "Unknown" for UNSPECIFIED', () => {
    expect(getRaceDisplayName(Race.UNSPECIFIED)).toBe('Unknown');
  });

  it('returns correct names for all races', () => {
    const races = [
      Race.HUMAN,
      Race.ELF,
      Race.DWARF,
      Race.HALFLING,
      Race.DRAGONBORN,
      Race.GNOME,
      Race.HALF_ELF,
      Race.HALF_ORC,
      Race.TIEFLING,
    ];
    for (const r of races) {
      const name = getRaceDisplayName(r);
      expect(name).not.toBe('Unknown');
      expect(name).not.toBe('Unknown Race');
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

describe('getClassDisplayName', () => {
  it('returns "Unknown" for UNSPECIFIED', () => {
    expect(getClassDisplayName(Class.UNSPECIFIED)).toBe('Unknown');
  });

  it('returns correct names for all classes', () => {
    const classes = [
      Class.BARBARIAN,
      Class.BARD,
      Class.CLERIC,
      Class.DRUID,
      Class.FIGHTER,
      Class.MONK,
      Class.PALADIN,
      Class.RANGER,
      Class.ROGUE,
      Class.SORCERER,
      Class.WARLOCK,
      Class.WIZARD,
    ];
    for (const c of classes) {
      const name = getClassDisplayName(c);
      expect(name).not.toBe('Unknown');
      expect(name).not.toBe('Unknown Class');
    }
  });
});

describe('formatCharacterSummary', () => {
  it('combines level, race, and class', () => {
    expect(formatCharacterSummary(5, Race.ELF, Class.WIZARD)).toBe(
      'Level 5 Elf Wizard'
    );
  });
});

describe('getMonsterTypeDisplayName', () => {
  it('returns "Unknown" for UNSPECIFIED', () => {
    expect(getMonsterTypeDisplayName(MonsterType.UNSPECIFIED)).toBe('Unknown');
  });

  it('returns names for known monsters', () => {
    expect(getMonsterTypeDisplayName(MonsterType.SKELETON)).toBe('Skeleton');
    expect(getMonsterTypeDisplayName(MonsterType.GIANT_SPIDER)).toBe(
      'Giant Spider'
    );
    expect(getMonsterTypeDisplayName(MonsterType.GOBLIN)).toBe('Goblin');
  });
});
