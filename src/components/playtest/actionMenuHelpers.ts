/**
 * Pure display helpers for the server-authored action menu (TakeAction wave
 * #426). These format the server's verdict for the UI — they NEVER compute
 * availability, legality, targeting rules, or economy cost. The server
 * (toolkit → rpg-api) decides all of that; the web only renders it.
 */

import type { AvailableAction } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import {
  EconomySlot,
  TargetKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';

/** Display order for the economy-slot groups in the menu. */
export const ECONOMY_SLOT_ORDER: EconomySlot[] = [
  EconomySlot.ACTION,
  EconomySlot.BONUS_ACTION,
  EconomySlot.REACTION,
  EconomySlot.MOVEMENT,
  EconomySlot.FREE,
  EconomySlot.UNSPECIFIED,
];

/** Human-readable group heading for an economy slot. */
export function economySlotLabel(slot: EconomySlot): string {
  switch (slot) {
    case EconomySlot.ACTION:
      return 'Action';
    case EconomySlot.BONUS_ACTION:
      return 'Bonus Action';
    case EconomySlot.REACTION:
      return 'Reaction';
    case EconomySlot.MOVEMENT:
      return 'Movement';
    case EconomySlot.FREE:
      return 'Free';
    case EconomySlot.UNSPECIFIED:
    default:
      // UNSPECIFIED is a server defect (toolkit should always set a slot); we
      // surface it rather than hide it so the gap is visible in a playtest.
      return 'Other';
  }
}

/**
 * Group available actions by economy slot, preserving the server's order within
 * each group. Returns only non-empty groups, in ECONOMY_SLOT_ORDER. Pure — the
 * server already decided the menu; this is layout only.
 */
export function groupActionsBySlot(
  actions: AvailableAction[]
): Array<{ slot: EconomySlot; actions: AvailableAction[] }> {
  const bySlot = new Map<EconomySlot, AvailableAction[]>();
  for (const action of actions) {
    const list = bySlot.get(action.economySlot);
    if (list) {
      list.push(action);
    } else {
      bySlot.set(action.economySlot, [action]);
    }
  }
  return ECONOMY_SLOT_ORDER.filter((slot) => bySlot.has(slot)).map((slot) => ({
    slot,
    actions: bySlot.get(slot)!,
  }));
}

/**
 * Whether the UI must raise a targeting prompt before dispatching this action.
 * Driven entirely by the server's target_kind — the web does not know which
 * actions need a target, it asks the menu entry.
 *  - SINGLE_ENTITY / POSITION / AREA → prompt for a target
 *  - SELF → no prompt (targets the actor); dispatch with a self ActionTarget
 *  - NONE → no prompt (untargeted, e.g. Dash); dispatch with no target
 *  - UNSPECIFIED → server defect; treat as "no prompt" and let the server reject
 */
export function targetKindNeedsPrompt(kind: TargetKind): boolean {
  return (
    kind === TargetKind.SINGLE_ENTITY ||
    kind === TargetKind.POSITION ||
    kind === TargetKind.AREA
  );
}

/** Short human label for a target kind (debug / tooltip surface). */
export function targetKindLabel(kind: TargetKind): string {
  switch (kind) {
    case TargetKind.SELF:
      return 'self';
    case TargetKind.SINGLE_ENTITY:
      return 'single target';
    case TargetKind.POSITION:
      return 'position';
    case TargetKind.AREA:
      return 'area';
    case TargetKind.NONE:
      return 'no target';
    case TargetKind.UNSPECIFIED:
    default:
      return 'unspecified';
  }
}

/** Stable key for an action menu entry (the ref triple). */
export function actionKey(action: AvailableAction): string {
  const r = action.ref;
  return r ? `${r.module}:${r.type}:${r.id}` : action.displayName;
}
