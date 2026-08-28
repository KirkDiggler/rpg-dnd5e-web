/**
 * damageToasts — "how hard did that land", surfaced on the map instead of
 * only in the log.
 *
 * # Timed off the reveal, not off the wire
 *
 * The toast is built from the VISIBLE outcome (`selectVisibleResult`), which
 * is the same gate `downedReveal.ts` uses. That is deliberate: a toast fired
 * when the event arrived would announce the damage while the d20 was still
 * tumbling — the exact reveal-order bug the downed hold exists to fix, wearing
 * a different hat. Damage lands when the roll lands.
 *
 * # One toast per attack, forever
 *
 * Keyed on `attackId`, which is the event's own `(session, seq)` identity. A
 * re-render, a refetch, or a catch-up replay of the same attack cannot produce
 * a second toast for it.
 *
 * Misses produce nothing. A hit for zero produces nothing either — there is no
 * damage to report, and a "0" toast reads as a bug rather than as a beat.
 */
import type { CombatExperienceAttackOutcome } from './types';

export interface DamageToast {
  /** The attack's own identity — also the de-duplication key. */
  id: string;
  amount: number;
  /** Provider-authored word ("slashing"); absent when the event carried none. */
  damageType?: string;
  /** Display name of whoever took it. */
  target: string;
  critical: boolean;
  /** The viewer is the one being hit — resolved from member ids upstream. */
  toViewer: boolean;
}

/** How long a damage toast stays up. Long enough to read mid-fight, short
 * enough that a flurry does not stack into a wall. */
export const DAMAGE_TOAST_TTL_MS = 2600;

/** Most toasts on screen at once; older ones are dropped from the top. */
export const DAMAGE_TOAST_LIMIT = 4;

export function damageToastFor(
  result: CombatExperienceAttackOutcome | undefined
): DamageToast | null {
  if (!result?.hit) return null;
  if (result.damage === undefined || result.damage <= 0) return null;
  return {
    id: result.attackId,
    amount: result.damage,
    damageType: result.damageType,
    target: result.target,
    critical: result.critical,
    toViewer: result.targetIsViewer,
  };
}

/** The toast's one line of copy. Kept here so the renderer stays dumb and the
 * wording is unit-testable without mounting React. */
export function damageToastText(toast: DamageToast): string {
  const type = toast.damageType ? ` ${toast.damageType}` : '';
  return `${toast.amount}${type} damage`;
}
