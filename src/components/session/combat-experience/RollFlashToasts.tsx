import styles from './CombatExperience.module.css';
import { rollFlashText, type RollFlashOutcome } from './rollFlash';

export interface RollFlashToastsProps {
  flashes: readonly RollFlashOutcome[];
}

/**
 * Pure rendering — see rollFlash.ts/useRollFlash.ts for what fires when.
 * Shares `DamageToasts.tsx`'s own visual area/language (Kirk's own spec:
 * "toast: the existing damage-toast area shows the arithmetic"), but is a
 * SEPARATE stack rather than folded into `DamageToasts` — a roll flash
 * fires on every settled attack including a miss, while a damage toast only
 * ever fires on a hit for nonzero damage (see rollFlash.ts's own doc
 * comment), so the two streams disagree about when they have something to
 * say.
 */
export function RollFlashToasts({ flashes }: RollFlashToastsProps) {
  if (flashes.length === 0) return null;
  return (
    <div
      className={styles.damageToasts}
      data-testid="roll-flash-toasts"
      aria-live="polite"
      aria-relevant="additions"
    >
      {flashes.map((flash) => (
        <div
          key={flash.id}
          data-testid={`roll-flash-toast-${flash.id}`}
          className={styles.damageToast}
        >
          <span>{rollFlashText(flash)}</span>
        </div>
      ))}
    </div>
  );
}
