import styles from './CombatExperience.module.css';
import { damageToastText, type DamageToast } from './damageToasts';

export interface DamageToastsProps {
  toasts: readonly DamageToast[];
}

/**
 * Pure rendering. Every decision about what to announce, when, and for how
 * long belongs to `damageToasts.ts`/`useDamageToasts.ts`.
 *
 * `aria-live="polite"` rather than `assertive`: this is a flourish over the
 * Story log, which already narrates the same beat, and it must not interrupt
 * a screen reader mid-sentence to repeat it.
 */
export function DamageToasts({ toasts }: DamageToastsProps) {
  if (toasts.length === 0) return null;
  return (
    <div
      className={styles.damageToasts}
      data-testid="damage-toasts"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-testid={`damage-toast-${toast.id}`}
          className={`${styles.damageToast} ${
            toast.toViewer ? styles.damageToastIncoming : ''
          } ${toast.critical ? styles.damageToastCritical : ''}`}
        >
          <strong>−{toast.amount}</strong>
          <span>
            {toast.critical ? 'Critical · ' : ''}
            {damageToastText(toast)}
          </span>
          <small>{toast.toViewer ? 'You' : toast.target}</small>
        </div>
      ))}
    </div>
  );
}
