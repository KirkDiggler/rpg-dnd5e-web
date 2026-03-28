/**
 * Utilities for merging partial character updates with existing character data.
 *
 * When the API sends character updates in combat events (AttackResolved,
 * MonsterTurnCompleted, FeatureActivated), it may only populate combat-relevant
 * fields (HP, conditions, resources) while leaving visual fields (class, race,
 * appearance, equipment) at their proto3 default values.
 *
 * Naively replacing the full character object with the event's partial data
 * causes the 3D model to lose its class textures and revert to defaults.
 *
 * This merge function preserves the existing character's visual state while
 * applying the updated combat state from the event.
 */

import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  Class,
  Race,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

/**
 * Merges an incoming character update with the existing character data,
 * preserving visual-critical fields when the incoming data has default/empty values.
 *
 * Visual-critical fields that get preserved from existing data when incoming is empty:
 * - race (enum: 0 = UNSPECIFIED)
 * - class (enum: 0 = UNSPECIFIED)
 * - appearance (optional message: undefined)
 * - equipmentSlots (optional message: undefined)
 * - name (string: empty = not set)
 *
 * All other fields are taken from the incoming character (latest combat state).
 *
 * @param existing - The full character data currently in the map
 * @param incoming - The partial character data from the combat event
 * @returns A merged character with visual state preserved and combat state updated
 */
export function mergeCharacterUpdate(
  existing: Character | undefined,
  incoming: Character
): Character {
  // No existing data to preserve — use incoming as-is
  if (!existing) {
    return incoming;
  }

  // Start with incoming as the base (latest combat state wins)
  // Then restore visual fields from existing when incoming has defaults
  const merged: Character = {
    ...incoming,

    // Preserve race if incoming has default (UNSPECIFIED = 0)
    race:
      incoming.race === Race.UNSPECIFIED && existing.race !== Race.UNSPECIFIED
        ? existing.race
        : incoming.race,

    // Preserve class if incoming has default (UNSPECIFIED = 0)
    class:
      incoming.class === Class.UNSPECIFIED &&
      existing.class !== Class.UNSPECIFIED
        ? existing.class
        : incoming.class,

    // Preserve appearance if incoming doesn't have it
    appearance: incoming.appearance ?? existing.appearance,

    // Preserve equipment slots if incoming doesn't have them
    equipmentSlots: incoming.equipmentSlots ?? existing.equipmentSlots,

    // Preserve name if incoming is empty
    name: incoming.name || existing.name,
  };

  return merged;
}
