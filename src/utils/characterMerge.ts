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
  Alignment,
  Background,
  Class,
  Race,
  Subrace,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';

/**
 * Merges an incoming character update with the existing character data,
 * preserving visual-critical fields when the incoming data has default/empty values.
 *
 * Visual-critical fields that get preserved from existing data when incoming is empty:
 * - race (enum: 0 = UNSPECIFIED)
 * - subrace (enum: 0 = UNSPECIFIED)
 * - class (enum: 0 = UNSPECIFIED)
 * - background (enum: 0 = UNSPECIFIED)
 * - alignment (enum: 0 = UNSPECIFIED)
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

    // Preserve subrace if incoming has default (UNSPECIFIED = 0)
    subrace:
      incoming.subrace === Subrace.UNSPECIFIED &&
      existing.subrace !== Subrace.UNSPECIFIED
        ? existing.subrace
        : incoming.subrace,

    // Preserve class if incoming has default (UNSPECIFIED = 0)
    class:
      incoming.class === Class.UNSPECIFIED &&
      existing.class !== Class.UNSPECIFIED
        ? existing.class
        : incoming.class,

    // Preserve background if incoming has default (UNSPECIFIED = 0)
    background:
      incoming.background === Background.UNSPECIFIED &&
      existing.background !== Background.UNSPECIFIED
        ? existing.background
        : incoming.background,

    // Preserve alignment if incoming has default (UNSPECIFIED = 0)
    alignment:
      incoming.alignment === Alignment.UNSPECIFIED &&
      existing.alignment !== Alignment.UNSPECIFIED
        ? existing.alignment
        : incoming.alignment,

    // Preserve appearance if incoming doesn't have it or is an empty proto message.
    // An empty Appearance (all string fields default to "") is treated as "not set"
    // to prevent a partial combat event from wiping out the visual appearance.
    appearance: (() => {
      const a = incoming.appearance;
      const hasAppearance =
        a && (a.skinTone || a.primaryColor || a.secondaryColor || a.eyeColor);
      return hasAppearance ? a : existing.appearance;
    })(),

    // Preserve equipment slots if incoming doesn't have them or is an empty proto
    // message. An empty EquipmentSlots (all optional slots undefined) is treated
    // as "not set" to prevent a partial combat event from clearing equipped items.
    equipmentSlots: (() => {
      const s = incoming.equipmentSlots;
      const hasEquipmentSlots =
        s &&
        (s.mainHand ||
          s.offHand ||
          s.armor ||
          s.helmet ||
          s.boots ||
          s.gloves ||
          s.cloak ||
          s.amulet ||
          s.ring1 ||
          s.ring2 ||
          s.belt);
      return hasEquipmentSlots ? s : existing.equipmentSlots;
    })(),

    // Preserve name if incoming is empty
    name: incoming.name || existing.name,
  };

  return merged;
}
