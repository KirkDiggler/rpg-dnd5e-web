/**
 * Pure helpers for EncounterDock's identity block plus EncounterView's
 * mode-gated EncounterMap.movementRemaining prop, split out into a plain
 * .ts module so they can be exported for unit testing without tripping
 * react-refresh/only-export-components on the .tsx component files (fast
 * refresh only works when a .tsx file exports components).
 */

import type { ActionEconomy } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { EncounterMode } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';

/**
 * Capitalizes a class_ref id ("fighter" -> "Fighter") — display formatting
 * only, not a class->label lookup table the toolkit doesn't give us.
 */
export function classLabel(classRefId: string | undefined): string | null {
  if (!classRefId) return null;
  return classRefId.charAt(0).toUpperCase() + classRefId.slice(1);
}

/**
 * HP tier for the bar's color — pure display bucketing off server-given
 * current/max, same category as EconomyBar's spent/unspent tint.
 */
export function hpTier(current: number, max: number): 'high' | 'mid' | 'low' {
  if (max <= 0) return 'low';
  const pct = current / max;
  if (pct > 0.5) return 'high';
  if (pct > 0.25) return 'mid';
  return 'low';
}

/**
 * Resolves the identity block's display name: the server's display_name
 * when it's set, else the raw entity id (never a blank label) — the server
 * doesn't populate display_name on the real StartEncounter path yet
 * (KirkDiggler/rpg-api#664), so this fallback is the common case today, not
 * an edge case.
 */
export function resolveName(
  displayName: string | undefined,
  entityId: string
): string {
  return displayName || entityId || '—';
}

/**
 * Resolves EncounterMap's movementRemaining prop: the server-authored
 * economy.movementRemaining in TURN_BASED (rpg-dnd5e-web#486 — replacing
 * EncounterMap's fabricated DEFAULT_MOVEMENT_FEET=30 fallback, the combat
 * sibling of the free-roam budget #485 killed), undefined in FREE_ROAM
 * (HexGrid's own effectiveMovementRemaining override from #485 ignores
 * this prop entirely outside TURN_BASED, so passing anything through here
 * would be inert either way — undefined keeps that explicit). `?? 0` while
 * turnState hasn't arrived yet is more honest than falling back to a fake
 * 30ft that doesn't exist server-side.
 */
export function resolveMovementRemaining(
  mode: EncounterMode,
  economy: ActionEconomy | null | undefined
): number | undefined {
  if (mode !== EncounterMode.TURN_BASED) return undefined;
  return economy?.movementRemaining ?? 0;
}
