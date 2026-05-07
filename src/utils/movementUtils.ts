/**
 * Movement utilities — single source of truth for "feet of movement remaining
 * this turn" on the web client.
 *
 * Why this helper exists
 * ----------------------
 * `TurnState.movementUsed` and `TurnState.movementMax` are deprecated proto
 * fields. The api still populates them (derived from
 * `30 - state.MovementRemaining` and a hardcoded 30), but the canonical source
 * is `TurnState.actionEconomy.movementRemaining` — which is what the api
 * orchestrator actually carries through across turns and across OpenDoor.
 *
 * The deprecated fields can desync from the canonical value. Wave 2 hit this:
 * after OpenDoor, the api was setting `actionEconomy.movementRemaining = 30`
 * correctly but the deprecated `movementUsed` was being computed off a
 * different code path that read 0 from `state.MovementRemaining` (the
 * orchestrator wrote it back as 0 transiently). Web call sites that did
 * `(movementMax || 30) - (movementUsed || 0)` saw `30 - 30 = 0` and rendered
 * "no movement left" — no range indicator, no pathing into the revealed room,
 * and adjacent attacks worked but any attack requiring even a 1-hex step did
 * not.
 *
 * Always read movement-remaining through this helper. Prefer
 * `actionEconomy.movementRemaining` when present; fall back to the deprecated
 * subtraction only when actionEconomy is absent (older snapshots, tests).
 */

import type {
  CombatState,
  TurnState,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';

/** Default base movement in feet when nothing is reported. */
export const DEFAULT_MOVEMENT_FEET = 30;

/**
 * Returns feet of movement remaining for the active turn.
 *
 * Resolution order:
 *   1. `currentTurn.actionEconomy.movementRemaining` (canonical, non-deprecated)
 *   2. `(currentTurn.movementMax || 30) - (currentTurn.movementUsed || 0)`
 *      (deprecated subtraction, kept as fallback)
 *   3. 0 when no `currentTurn` is present
 */
export function getMovementRemaining(
  turn: TurnState | null | undefined
): number {
  if (!turn) return 0;
  if (turn.actionEconomy) {
    return turn.actionEconomy.movementRemaining;
  }
  const max = turn.movementMax || DEFAULT_MOVEMENT_FEET;
  const used = turn.movementUsed || 0;
  return max - used;
}

/** Convenience: read movement-remaining from an arbitrary CombatState shape. */
export function getMovementRemainingFromCombat(
  combat: CombatState | null | undefined
): number {
  return getMovementRemaining(combat?.currentTurn);
}

/**
 * Returns the maximum movement budget for the active turn (used for progress
 * bars / display, NOT for range gating). Prefers
 * `actionEconomy.movementMax`, falls back to deprecated `movementMax`, then
 * to the 30 ft default.
 */
export function getMovementMax(turn: TurnState | null | undefined): number {
  if (!turn) return DEFAULT_MOVEMENT_FEET;
  if (turn.actionEconomy && turn.actionEconomy.movementMax > 0) {
    return turn.actionEconomy.movementMax;
  }
  return turn.movementMax || DEFAULT_MOVEMENT_FEET;
}
