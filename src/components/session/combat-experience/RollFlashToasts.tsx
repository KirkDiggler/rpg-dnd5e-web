import styles from './CombatExperience.module.css';
import { rollFlashText, type RollFlashOutcome } from './rollFlash';

export interface RollFlashToastsProps {
  flashes: readonly RollFlashOutcome[];
}

/**
 * Pure rendering — see rollFlash.ts/useRollFlash.ts for what fires when.
 *
 * OWN visual area, positioned above `DamageToasts` — Kirk, first live
 * session: "the hit is overlapping the damage. I think they are separate
 * presentations." A single attack fires both at once (the roll flash on
 * settle, the damage toast on the same reveal for a hit), so the two used to
 * share the exact same slot and land on top of each other. `.rollFlashToasts`
 * (CombatExperience.module.css) sits at `top: 16px`, `.damageToasts` at
 * `top: 96px` — the roll causally precedes the damage it produces, so
 * reading top-to-bottom follows the fight's own order, and staying on the
 * same horizontal axis avoids splitting the width budget at narrow
 * viewports. This is also why it's a separate stack from `DamageToasts`
 * rather than folded into it: a roll flash fires on every settled attack
 * including a miss, while a damage toast only ever fires on a hit for
 * nonzero damage (see rollFlash.ts's own doc comment) — the two streams
 * disagree about when they have something to say.
 */
export function RollFlashToasts({ flashes }: RollFlashToastsProps) {
  if (flashes.length === 0) return null;
  return (
    <div
      className={styles.rollFlashToasts}
      data-testid="roll-flash-toasts"
      aria-live="polite"
      aria-relevant="additions"
    >
      {flashes.map((flash) => (
        <div
          key={flash.id}
          data-testid={`roll-flash-toast-${flash.id}`}
          className={styles.rollFlashToast}
        >
          <span>{rollFlashText(flash)}</span>
        </div>
      ))}
    </div>
  );
}
