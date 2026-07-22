/**
 * Presentation-owned types for `BeatStage.tsx` (rpg-dnd5e-web#561), kept
 * in their own module rather than inline in the component file — the
 * same separation `src/components/game/equipment/equipmentTypes.ts`
 * gives `EquipmentSlots.tsx`/`InventoryLight.tsx`: presentation types
 * are owned by the presentation layer, not borrowed from the data layer
 * (`fixtures.ts`). A secondary benefit: an exported, non-component
 * helper like `verdictLabel()` living in a component file (rather than
 * here) can trip this repo's `react-refresh/only-export-components`
 * lint rule — this module sidesteps that too, but the ownership
 * separation above is the actual reason it exists.
 *
 * `BeatAttackView`/`BeatDamageView` are deliberately NOT imported from
 * `./fixtures` — see `BeatStage.tsx`'s header for why. `fixtures.ts`'s
 * `AttackResolvedLike`/`EntityDamagedLike` are a structural superset of
 * these (same field names/types, plus more), so passing one where a
 * `BeatAttackView`/`BeatDamageView` is expected needs no adapter or cast.
 */

/** The ONLY fields `BeatStage` reads off an attack. */
export interface BeatAttackView {
  attackerEntityId: string;
  hit: boolean;
  critical: boolean;
  attackRoll: number;
  attackBonus: number;
  targetAc: number;
}

/** The ONLY field `BeatStage` reads off a damage event. */
export interface BeatDamageView {
  amount: number;
}

export type VerdictLabel = 'HIT' | 'MISS' | 'CRIT' | 'NAT-1' | '';

export function verdictLabel(attack?: BeatAttackView): VerdictLabel {
  if (!attack) return '';
  if (attack.critical) return 'CRIT';
  if (attack.attackRoll === 1 && !attack.hit) return 'NAT-1';
  return attack.hit ? 'HIT' : 'MISS';
}
