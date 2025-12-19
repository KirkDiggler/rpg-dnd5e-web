/**
 * TypeScript interfaces for condition JSON data from the toolkit.
 * These match the Go structs in rpg-toolkit/rulebooks/dnd5e/conditions/
 *
 * The bytes come through condition.conditionData from the proto and are parsed as JSON.
 */

import { ConditionId } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import type { Ref } from './featureData';

/**
 * Base fields common to all condition data
 */
interface BaseConditionData {
  ref?: Ref;
  character_id: string;
}

/**
 * Raging condition data - active rage state
 * From: rpg-toolkit/rulebooks/dnd5e/conditions/raging.go
 */
export interface RagingData extends BaseConditionData {
  damage_bonus: number;
  level: number;
  source: string; // Ref string format: "dnd5e:features:rage"
  turns_active: number;
  was_hit_this_turn: boolean;
  did_attack_this_turn: boolean;
}

/**
 * Unarmored Defense condition data
 * From: rpg-toolkit/rulebooks/dnd5e/conditions/unarmored_defense.go
 */
export interface UnarmoredDefenseData extends BaseConditionData {
  type: 'barbarian' | 'monk';
  source: string;
}

/**
 * Brutal Critical condition data
 * From: rpg-toolkit/rulebooks/dnd5e/conditions/brutal_critical.go
 */
export interface BrutalCriticalData extends BaseConditionData {
  level: number;
  extra_dice: number;
}

/**
 * Sneak Attack condition data
 * From: rpg-toolkit/rulebooks/dnd5e/conditions/sneak_attack.go
 */
export interface SneakAttackData extends BaseConditionData {
  level: number;
  damage_dice: number;
}

/**
 * Martial Arts condition data
 * From: rpg-toolkit/rulebooks/dnd5e/conditions/martial_arts.go
 */
export interface MartialArtsData extends BaseConditionData {
  monk_level: number;
}

/**
 * Unarmored Movement condition data
 * From: rpg-toolkit/rulebooks/dnd5e/conditions/unarmored_movement.go
 */
export interface UnarmoredMovementData extends BaseConditionData {
  monk_level: number;
}

/**
 * Improved Critical condition data
 * From: rpg-toolkit/rulebooks/dnd5e/conditions/improved_critical.go
 */
export interface ImprovedCriticalData extends BaseConditionData {
  threshold: number; // Critical threshold (19 for Champion level 3)
}

/**
 * Fighting style condition data (shared by most fighting styles)
 * From: rpg-toolkit/rulebooks/dnd5e/conditions/fighting_style_*.go
 * Most fighting styles just have the base fields.
 */
export type FightingStyleData = BaseConditionData;

/**
 * Union type for all condition data variants
 */
export type ConditionData =
  | RagingData
  | UnarmoredDefenseData
  | BrutalCriticalData
  | SneakAttackData
  | MartialArtsData
  | UnarmoredMovementData
  | ImprovedCriticalData
  | FightingStyleData
  | BaseConditionData;

/**
 * Type guards for condition data
 */
export function isRagingData(data: ConditionData): data is RagingData {
  return 'damage_bonus' in data && 'turns_active' in data;
}

export function isUnarmoredDefenseData(
  data: ConditionData
): data is UnarmoredDefenseData {
  return 'type' in data && (data.type === 'barbarian' || data.type === 'monk');
}

export function isBrutalCriticalData(
  data: ConditionData
): data is BrutalCriticalData {
  return 'extra_dice' in data;
}

export function isSneakAttackData(
  data: ConditionData
): data is SneakAttackData {
  return 'damage_dice' in data;
}

export function isMartialArtsData(
  data: ConditionData
): data is MartialArtsData {
  return 'monk_level' in data && !('threshold' in data);
}

export function isUnarmoredMovementData(
  data: ConditionData
): data is UnarmoredMovementData {
  return 'monk_level' in data && !('threshold' in data);
}

export function isImprovedCriticalData(
  data: ConditionData
): data is ImprovedCriticalData {
  return 'threshold' in data;
}

/**
 * Parse condition data from proto bytes.
 * Returns undefined if data is empty or invalid.
 */
export function parseConditionData(
  conditionData: Uint8Array | undefined
): ConditionData | undefined {
  if (!conditionData || conditionData.length === 0) {
    return undefined;
  }

  try {
    const jsonStr = new TextDecoder().decode(conditionData);
    return JSON.parse(jsonStr) as ConditionData;
  } catch {
    console.warn('Failed to parse condition data:', conditionData);
    return undefined;
  }
}

/**
 * Map ConditionId enum to display-friendly strings
 */
export function conditionIdToString(id: ConditionId): string {
  switch (id) {
    case ConditionId.RAGING:
      return 'raging';
    case ConditionId.BRUTAL_CRITICAL:
      return 'brutal_critical';
    case ConditionId.FIGHTING_STYLE_DUELING:
      return 'fighting_style_dueling';
    case ConditionId.FIGHTING_STYLE_TWO_WEAPON_FIGHTING:
      return 'fighting_style_two_weapon_fighting';
    case ConditionId.SNEAK_ATTACK:
      return 'sneak_attack';
    case ConditionId.DIVINE_SMITE:
      return 'divine_smite';
    case ConditionId.FIGHTING_STYLE_GREAT_WEAPON_FIGHTING:
      return 'fighting_style_great_weapon_fighting';
    case ConditionId.FIGHTING_STYLE_ARCHERY:
      return 'fighting_style_archery';
    case ConditionId.FIGHTING_STYLE_DEFENSE:
      return 'fighting_style_defense';
    case ConditionId.FIGHTING_STYLE_PROTECTION:
      return 'fighting_style_protection';
    default:
      return 'unknown';
  }
}

/**
 * Get the martial arts die for a monk level
 */
export function getMartialArtsDie(monkLevel: number): string {
  if (monkLevel >= 17) return '1d10';
  if (monkLevel >= 11) return '1d8';
  if (monkLevel >= 5) return '1d6';
  return '1d4';
}

/**
 * Get the speed bonus for unarmored movement
 */
export function getUnarmoredMovementBonus(monkLevel: number): number {
  if (monkLevel >= 18) return 30;
  if (monkLevel >= 14) return 25;
  if (monkLevel >= 10) return 20;
  if (monkLevel >= 6) return 15;
  return 10;
}
