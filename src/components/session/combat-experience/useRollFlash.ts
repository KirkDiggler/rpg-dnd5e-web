/**
 * useRollFlash — turns a stream of settled attack outcomes into a small
 * expiring stack of roll flashes. Same "announce once, expire
 * independently" shape as useDamageToasts.ts, reused for BOTH render
 * targets (`RollFlashToasts` and the 3D `RollFlashDie`) — the derivation
 * (rollFlash.ts) and the dedup/TTL mechanics are identical between them;
 * only what each caller renders differs. See rollFlash.ts's own doc comment
 * for what each caller passes as `result`/`active` and why.
 */
import { useEffect, useRef, useState } from 'react';
import {
  ROLL_FLASH_LIMIT,
  ROLL_FLASH_TTL_MS,
  rollFlashFor,
  type RollFlashOutcome,
} from './rollFlash';
import type { CombatExperienceAttackOutcome } from './types';

export function useRollFlash(
  result: CombatExperienceAttackOutcome | undefined,
  active: boolean,
  ttlMs: number = ROLL_FLASH_TTL_MS
): readonly RollFlashOutcome[] {
  const [flashes, setFlashes] = useState<readonly RollFlashOutcome[]>([]);
  // Same "hold every id forever, never evict to save memory" guarantee as
  // useDamageToasts.ts's own `announced` — a catch-up replay of an attack
  // already flashed must never re-announce it.
  const announced = useRef(new Set<string>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
      pending.length = 0;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const flash = rollFlashFor(result);
    if (!flash || announced.current.has(flash.id)) return;
    announced.current.add(flash.id);

    setFlashes((current) => [...current, flash].slice(-ROLL_FLASH_LIMIT));

    const handle = setTimeout(() => {
      setFlashes((current) => current.filter((entry) => entry.id !== flash.id));
      const index = timers.current.indexOf(handle);
      if (index >= 0) timers.current.splice(index, 1);
    }, ttlMs);
    timers.current.push(handle);
  }, [result, active, ttlMs]);

  return flashes;
}
