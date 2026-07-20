/**
 * EquipmentPopover (rpg-dnd5e-web#531 round 2) — the in-game surface for
 * the equipment bench: an animated popover opened from the combat dock's
 * equipment chip. The standalone Equipment tab stays the workbench; this
 * proves the interaction pattern over the combat scene.
 *
 * Fixture-driven: pinned to the fighter cast (richest interactions —
 * sword+board ⇄ greatsword). In real life the popover shows the VIEWER's
 * character; that wiring is out of scope until the CONTRACT.md request
 * lands (see §8 — the popover wants equipment on the encounter-hydrated
 * character, never a fetch-on-open).
 *
 * Motion: scale+fade from the chip's corner (bottom-right), ~200ms,
 * collapsed to a plain fade when the user prefers reduced motion.
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { EquipmentSlots } from './EquipmentSlots';
import type { EquipIntent } from './fixtures';
import { applyIntent, EQUIP_CASTS } from './fixtures';
import { InventoryLight } from './InventoryLight';

interface EquipmentPopoverProps {
  open: boolean;
}

export function EquipmentPopover({ open }: EquipmentPopoverProps) {
  const reduced = useReducedMotion();
  // Fighter cast: the acceptance loadout (sword+board ⇄ greatsword).
  const cast = EQUIP_CASTS[0];
  const [equipped, setEquipped] = useState<Record<string, string>>({
    ...cast.equipped,
  });
  const stats = useMemo(() => cast.serverStats(equipped), [cast, equipped]);

  const onIntent = (intent: EquipIntent) =>
    setEquipped((eq) => applyIntent(eq, cast.items, intent));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="equip-popover hud-skin"
          data-testid="equipment-popover"
          role="dialog"
          aria-label={`Equipment — ${cast.name}`}
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
          transition={{ duration: reduced ? 0.1 : 0.2, ease: 'easeOut' }}
          style={{ transformOrigin: 'bottom right' }}
        >
          <div className="equip-popover-header">
            {cast.name} · {cast.classLabel}
            <span className="equip-popover-stats">
              AC <strong>{stats.ac}</strong> · {stats.damage}
              <em className="equip-stats-note"> (server-computed)</em>
            </span>
          </div>
          <div className="equip-popover-body">
            <EquipmentSlots
              cast={cast}
              equipped={equipped}
              onIntent={onIntent}
            />
            <InventoryLight
              cast={cast}
              equipped={equipped}
              onIntent={onIntent}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
