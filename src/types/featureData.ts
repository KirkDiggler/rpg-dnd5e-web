/**
 * TypeScript interfaces for feature JSON data from the toolkit.
 * These match the Go structs in rpg-toolkit/rulebooks/dnd5e/features/
 *
 * The bytes come through feature.featureData from the proto and are parsed as JSON.
 */

/**
 * Ref structure matching core.Ref from toolkit
 */
export interface Ref {
  module: string;
  type: string;
  value: string;
}

/**
 * Base fields common to all feature data
 */
interface BaseFeatureData {
  ref?: Ref;
  id: string;
  name: string;
  level?: number;
}

/**
 * Features with limited uses (most activatable features)
 */
interface UsageFeatureData extends BaseFeatureData {
  uses: number;
  max_uses: number;
  character_id?: string;
}

/**
 * Rage feature data
 * From: rpg-toolkit/rulebooks/dnd5e/features/rage.go
 */
export interface RageData extends UsageFeatureData {
  id: 'rage';
}

/**
 * Second Wind feature data
 * From: rpg-toolkit/rulebooks/dnd5e/features/second_wind.go
 */
export interface SecondWindData extends UsageFeatureData {
  id: 'second_wind';
}

/**
 * Action Surge feature data
 * From: rpg-toolkit/rulebooks/dnd5e/features/action_surge.go
 */
export interface ActionSurgeData extends UsageFeatureData {
  id: 'action_surge';
}

/**
 * Union type for all feature data variants
 */
export type FeatureData =
  | RageData
  | SecondWindData
  | ActionSurgeData
  | BaseFeatureData;

/**
 * Type guards for feature data
 */
export function isRageData(data: FeatureData): data is RageData {
  return data.id === 'rage';
}

export function isSecondWindData(data: FeatureData): data is SecondWindData {
  return data.id === 'second_wind';
}

export function isActionSurgeData(data: FeatureData): data is ActionSurgeData {
  return data.id === 'action_surge';
}

/**
 * Check if feature data has usage tracking
 */
export function hasUsageData(data: FeatureData): data is UsageFeatureData {
  return 'uses' in data && 'max_uses' in data;
}

/**
 * Parse feature data from proto bytes.
 * Returns undefined if data is empty or invalid.
 */
export function parseFeatureData(
  featureData: Uint8Array | undefined
): FeatureData | undefined {
  if (!featureData || featureData.length === 0) {
    return undefined;
  }

  try {
    const jsonStr = new TextDecoder().decode(featureData);
    return JSON.parse(jsonStr) as FeatureData;
  } catch {
    console.warn('Failed to parse feature data:', featureData);
    return undefined;
  }
}
