/**
 * useDamageToasts — turns the stream of revealed attack outcomes into a small
 * expiring stack of damage toasts. See `damageToasts.ts` for why the timing
 * hangs off the REVEALED result rather than the raw event.
 */
import { useEffect, useRef, useState } from 'react';
import {
  DAMAGE_TOAST_LIMIT,
  DAMAGE_TOAST_TTL_MS,
  damageToastFor,
  type DamageToast,
} from './damageToasts';
import type { CombatExperienceAttackOutcome } from './types';

export function useDamageToasts(
  result: CombatExperienceAttackOutcome | undefined,
  ttlMs: number = DAMAGE_TOAST_TTL_MS
): readonly DamageToast[] {
  const [toasts, setToasts] = useState<readonly DamageToast[]>([]);
  // Deliberately unbounded, unlike `timers`: this holds only attack ids, and
  // "one toast per attack, forever" is the guarantee — evicting old ids to save
  // a few kilobytes would let a catch-up replay re-announce a fight the player
  // already watched.
  const announced = useRef(new Set<string>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Expiry timers are owned by a ref, NOT by the effect's cleanup. Tying them
  // to cleanup would clear the previous toast's timer every time a new result
  // arrived, and that toast would then never expire — the failure mode a
  // fast exchange hits first.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
      pending.length = 0;
    };
  }, []);

  useEffect(() => {
    const toast = damageToastFor(result);
    if (!toast || announced.current.has(toast.id)) return;
    announced.current.add(toast.id);

    setToasts((current) => [...current, toast].slice(-DAMAGE_TOAST_LIMIT));

    const handle = setTimeout(() => {
      setToasts((current) => current.filter((entry) => entry.id !== toast.id));
      // Drop the spent handle, IN PLACE. Only PENDING timers belong here;
      // pushing and never removing would grow the array for the life of the
      // fight and hold every fired closure alive with it (Copilot on #839).
      // Spliced rather than reassigned so the unmount cleanup, which captured
      // this array at mount, still sees the same one.
      const index = timers.current.indexOf(handle);
      if (index >= 0) timers.current.splice(index, 1);
    }, ttlMs);
    timers.current.push(handle);
  }, [result, ttlMs]);

  return toasts;
}
