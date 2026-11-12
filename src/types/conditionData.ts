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
 * Current composed Raging data from conditions/composed_data.go.
 * Bindings stay opaque: this reader never derives a bonus or class level.
 */
export interface RagingData {
  ref: 'dnd5e:conditions:raging';
  member_id: string;
  origin: { ref: string; entity_id: string };
  bindings: Record<string, unknown>;
  runtime: {
    state: string;
    bag: {
      turns_active: number;
      round_activated: number;
      saw_turn_end: boolean;
      was_hit_this_turn: boolean;
      did_attack_this_turn: boolean;
    };
  };
}

/** Current linked envelope. Bindings and part bags remain opaque to the UI. */
export interface LinkedConditionData {
  ref: {
    module: 'dnd5e';
    type: 'conditions';
    id: 'linked-effects' | 'blessed' | 'baned';
  };
  member_id: string;
  address_source_id: string;
  application_id: string;
  role: 'coordinator' | 'recipient';
  origin: { ref: string; entity_id: string };
  bindings: Record<string, unknown>;
  runtime: {
    parts: {
      parts: Record<string, { state: string; bag: Record<string, unknown> }>;
    };
    lifetime?: {
      phase: 'live';
      pending_members: string[];
      live_members: string[];
    };
  };
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
  | LinkedConditionData
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
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function conditionRefName(ref: unknown): string | undefined {
  if (typeof ref === 'string') return ref;
  if (
    !isRecord(ref) ||
    !nonemptyString(ref.module) ||
    !nonemptyString(ref.type) ||
    !nonemptyString(ref.id)
  )
    return undefined;
  return `${ref.module}:${ref.type}:${ref.id}`;
}

function distinctKeys(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(nonemptyString) &&
    new Set(value).size === value.length
  );
}

export function isLinkedConditionData(
  data: unknown
): data is LinkedConditionData {
  if (
    !isRecord(data) ||
    !isRecord(data.ref) ||
    data.ref.module !== 'dnd5e' ||
    data.ref.type !== 'conditions'
  )
    return false;
  if (
    !nonemptyString(data.ref.id) ||
    !['linked-effects', 'blessed', 'baned'].includes(data.ref.id)
  )
    return false;
  if (
    !nonemptyString(data.member_id) ||
    !nonemptyString(data.application_id) ||
    !nonemptyString(data.address_source_id)
  )
    return false;
  if (
    !isRecord(data.origin) ||
    !nonemptyString(data.origin.ref) ||
    !nonemptyString(data.origin.entity_id) ||
    !isRecord(data.bindings)
  )
    return false;
  if (!Array.isArray(data.bindings.parts) || data.bindings.parts.length === 0)
    return false;
  if (
    !isRecord(data.runtime) ||
    !isRecord(data.runtime.parts) ||
    !isRecord(data.runtime.parts.parts)
  )
    return false;
  const snapshots = Object.values(data.runtime.parts.parts);
  if (
    snapshots.length === 0 ||
    !snapshots.every(
      (part) =>
        isRecord(part) && nonemptyString(part.state) && isRecord(part.bag)
    )
  )
    return false;
  if (data.role === 'recipient') {
    const owner = data.bindings.owner;
    return (
      data.runtime.lifetime === undefined &&
      isRecord(owner) &&
      nonemptyString(owner.member_id) &&
      nonemptyString(owner.condition_ref) &&
      nonemptyString(owner.source_id) &&
      nonemptyString(data.bindings.member_key)
    );
  }
  if (
    data.role !== 'coordinator' ||
    data.ref.id !== 'linked-effects' ||
    data.bindings.owner !== undefined ||
    data.bindings.member_key !== undefined
  )
    return false;
  const lifetime = data.runtime.lifetime;
  if (
    !isRecord(lifetime) ||
    lifetime.phase !== 'live' ||
    !distinctKeys(lifetime.pending_members) ||
    !distinctKeys(lifetime.live_members)
  )
    return false;
  const live = new Set(lifetime.live_members);
  return lifetime.pending_members.every((key) => !live.has(key));
}

export function isRagingData(data: unknown): data is RagingData {
  if (!isRecord(data) || data.ref !== 'dnd5e:conditions:raging') return false;
  const { origin, runtime } = data;
  if (
    !nonemptyString(data.member_id) ||
    !isRecord(origin) ||
    !isRecord(data.bindings)
  )
    return false;
  if (!nonemptyString(origin.ref) || !nonemptyString(origin.entity_id))
    return false;
  if (
    !isRecord(runtime) ||
    !nonemptyString(runtime.state) ||
    !isRecord(runtime.bag)
  )
    return false;
  const bag = runtime.bag;
  return (
    nonnegativeInteger(bag.turns_active) &&
    nonnegativeInteger(bag.round_activated) &&
    typeof bag.saw_turn_end === 'boolean' &&
    typeof bag.was_hit_this_turn === 'boolean' &&
    typeof bag.did_attack_this_turn === 'boolean'
  );
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
    const data: unknown = JSON.parse(jsonStr);
    if (!isRecord(data)) return undefined;
    const ref = conditionRefName(data.ref);
    if (ref === 'dnd5e:conditions:concentrating') return undefined;
    if (
      [
        'dnd5e:conditions:linked-effects',
        'dnd5e:conditions:blessed',
        'dnd5e:conditions:baned',
      ].includes(ref ?? '') &&
      !isLinkedConditionData(data)
    )
      return undefined;
    if (ref === 'dnd5e:conditions:raging' && !isRagingData(data))
      return undefined;
    return data as unknown as ConditionData;
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
    case ConditionId.UNARMORED_DEFENSE:
      return 'unarmored_defense';
    case ConditionId.IMPROVED_CRITICAL:
      return 'improved_critical';
    case ConditionId.MARTIAL_ARTS:
      return 'martial_arts';
    case ConditionId.UNARMORED_MOVEMENT:
      return 'unarmored_movement';
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
