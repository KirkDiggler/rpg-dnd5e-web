/**
 * EquipmentPopover (rpg-dnd5e-web#531 round 2, promoted to production for
 * #571) — the in-game surface for the equipment bench: an animated
 * popover opened from the combat dock's equipment chip.
 *
 * Fully prop-driven: no fixture dependency, no internal equip-simulation
 * state. The caller (EncounterDock, fed from the encounter-hydrated
 * CharacterData) owns `equipped`/`items`/`slots`/`armorClass`/
 * `mainHandDamage` and reacts to `onIntent` by calling the real
 * EquipItem/UnequipItem RPCs and refreshing local state from the
 * response. The `/concepts` equipment bench renders this same component
 * fed from fixtures.ts (its own local state stands in for the server).
 *
 * Motion: scale+fade from the chip's corner (bottom-right), ~200ms,
 * collapsed to a plain fade when the user prefers reduced motion.
 *
 * Non-modal (Copilot review on #575): this is a floating panel toggled by
 * its dock chip, not a modal dialog — it doesn't trap focus, close on
 * Escape, or return focus on close, the same as every other dock overlay
 * (`OverlayPanel`, used for the settings/menu popovers right next to this
 * one — see `src/components/ui/combat/OverlayPanel.tsx`, a plain
 * unlabeled div with no role at all). `role="dialog"` would claim modal
 * semantics this component doesn't implement and would make this one
 * overlay behave inconsistently with its siblings; `role="region"` names
 * the landmark via `aria-label` without the false modal claim.
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { EquipmentSlots } from './EquipmentSlots';
import type {
  EquipIntent,
  EquippedMap,
  ItemLike,
  SlotDefLike,
} from './equipmentTypes';
import { InventoryLight } from './InventoryLight';

export interface EquipmentPopoverProps {
  open: boolean;
  characterName: string;
  classLabel: string | undefined;
  slots: SlotDefLike[];
  equipped: EquippedMap;
  items: ItemLike[];
  /** Server-composed AC readout (CharacterData.armor_class_detail). */
  armorClass: { total: number; note: string } | undefined;
  /** Server-composed main-hand damage display (occupancy-dependent). */
  mainHandDamage: string;
  onIntent: (intent: EquipIntent) => void;
  /** A prior intent's RPC is in flight — see EquipmentSlots' doc comment. */
  busy?: boolean;
}

export function EquipmentPopover({
  open,
  characterName,
  classLabel,
  slots,
  equipped,
  items,
  armorClass,
  mainHandDamage,
  onIntent,
  busy,
}: EquipmentPopoverProps) {
  const reduced = useReducedMotion();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="equip-popover hud-skin"
          data-testid="equipment-popover"
          role="region"
          aria-label={`Equipment — ${characterName}`}
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
          transition={{ duration: reduced ? 0.1 : 0.2, ease: 'easeOut' }}
          style={{ transformOrigin: 'bottom right' }}
        >
          <div className="equip-popover-header">
            {characterName}
            {classLabel ? ` · ${classLabel}` : ''}
            <span className="equip-popover-stats">
              {armorClass !== undefined && (
                <>
                  AC <strong>{armorClass.total}</strong>
                  {armorClass.note ? ` (${armorClass.note})` : ''}
                  {mainHandDamage ? ' · ' : ''}
                </>
              )}
              {mainHandDamage}
            </span>
          </div>
          <div className="equip-popover-body">
            <EquipmentSlots
              slots={slots}
              equipped={equipped}
              items={items}
              onIntent={onIntent}
              busy={busy}
            />
            <InventoryLight
              slots={slots}
              equipped={equipped}
              items={items}
              onIntent={onIntent}
              busy={busy}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
