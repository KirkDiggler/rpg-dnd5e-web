import type {
  ClassInfo,
  RaceInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  Class,
  Race,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

/**
 * Race lookup utilities for converting between enum IDs and full RaceInfo objects
 */
export const raceLookup = {
  /**
   * Find a RaceInfo by its enum value
   */
  findByEnum: (races: RaceInfo[], raceEnum: Race): RaceInfo | undefined => {
    return races.find((race) => race.id === Race[raceEnum].toLowerCase());
  },

  /**
   * Find a RaceInfo by its enum value, throwing if not found
   */
  findByEnumOrThrow: (races: RaceInfo[], raceEnum: Race): RaceInfo => {
    const race = raceLookup.findByEnum(races, raceEnum);
    if (!race) {
      throw new Error(
        `Race not found for enum: ${Race[raceEnum]} (${raceEnum})`
      );
    }
    return race;
  },
};

/**
 * Class lookup utilities for converting between enum IDs and full ClassInfo objects
 */
export const classLookup = {
  /**
   * Find a ClassInfo by its enum value
   */
  findByEnum: (
    classes: ClassInfo[],
    classEnum: Class
  ): ClassInfo | undefined => {
    return classes.find((cls) => cls.id === Class[classEnum].toLowerCase());
  },

  /**
   * Find a ClassInfo by its enum value, throwing if not found
   */
  findByEnumOrThrow: (classes: ClassInfo[], classEnum: Class): ClassInfo => {
    const cls = classLookup.findByEnum(classes, classEnum);
    if (!cls) {
      throw new Error(
        `Class not found for enum: ${Class[classEnum]} (${classEnum})`
      );
    }
    return cls;
  },
};

/**
 * Get race name from enum, with fallback
 */
export function getRaceName(races: RaceInfo[], raceEnum: Race): string {
  const race = raceLookup.findByEnum(races, raceEnum);
  return race?.name || Race[raceEnum] || 'Unknown Race';
}

/**
 * Get class name from enum, with fallback
 */
export function getClassName(classes: ClassInfo[], classEnum: Class): string {
  const cls = classLookup.findByEnum(classes, classEnum);
  return cls?.name || Class[classEnum] || 'Unknown Class';
}

/**
 * Type guard for checking if race is loaded
 */
export function isRaceLoaded(race: RaceInfo | undefined): race is RaceInfo {
  return race !== undefined;
}

/**
 * Type guard for checking if class is loaded
 */
export function isClassLoaded(cls: ClassInfo | undefined): cls is ClassInfo {
  return cls !== undefined;
}
