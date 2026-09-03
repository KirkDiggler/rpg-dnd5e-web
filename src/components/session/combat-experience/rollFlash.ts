/**
 * rollFlash — "the flash carries the truth, the die carries the feel" (Kirk,
 * 2026-09-03): a natural d20 and its arithmetic, read STRAIGHT from the
 * server's already-resolved attack facts (`CombatExperienceAttackOutcome`,
 * itself a projection of the session's Struck/Missed events per
 * rpg-project#289) — never fabricated, never computed client-side.
 * `?rollFlash=` (session/local-world-die/diceDials.ts): off (default) | die
 * | toast | both.
 *
 * # Unlike damageToasts.ts: fires on a miss too
 *
 * `damageToastFor` only fires on a hit for nonzero damage — a miss or a
 * zero-damage hit reports nothing, because there is no damage to announce.
 * The roll flash is about the ROLL, not the damage, so it fires for EVERY
 * settled attack outcome regardless of `hit`.
 *
 * # Timing: two callers, one signal each
 *
 * `useRollFlash` (the hook built on this module) takes whatever result its
 * caller hands it and fires the instant that result is new — the CALLER
 * decides what "new" and "settled" mean for its own render target:
 *
 *  - CombatExperience.tsx passes `useDiceSettleGate`'s own `settledResult`.
 *    For the roller, that only becomes defined once the physical local
 *    world die has actually come to rest (`useDiceSettleGate.ts`'s own doc
 *    comment: `diePresented` flips false the same render
 *    `localWorldDieSettled` flips true, releasing the gate) — the "at
 *    settle" half of the spec. For a spectator (`diceWitnessRole !==
 *    'roller'`), that gate never engages at all (`diePresented` is always
 *    false), so `settledResult` already equals `result` the instant it
 *    arrives — the "else at result arrival" half, for free, from the exact
 *    same signal.
 *  - SessionEncounterView.tsx passes `combat.result` gated on its own
 *    `localWorldDieSettled` boolean directly, for the 3D die-anchored flash
 *    (which needs the die's actual world position, only known inside the
 *    R3F tree `LocalWorldDieLayer.tsx` renders into — see
 *    `LocalWorldDieLayer.tsx`'s own `onSettledAt`).
 */
import type { CombatExperienceAttackOutcome } from './types';

export type RollFlashMode = 'off' | 'die' | 'toast' | 'both';

export type RollFlashNatural = 'nat20' | 'nat1' | 'normal';

export interface RollFlashOutcome {
  readonly id: string;
  readonly d20: number;
  readonly modifier: number;
  readonly total: number;
  readonly natural: RollFlashNatural;
  readonly hit: boolean;
  readonly critical: boolean;
}

/** How long a roll flash stays up — Kirk's own spec for the die overlay:
 * "fading over ~1.5s". Reused for the toast variant too, for one shared
 * rhythm. */
export const ROLL_FLASH_TTL_MS = 1500;

/** Most flashes on screen at once (toast area only — the 3D die overlay
 * only ever shows the latest, see RollFlashDie.tsx). */
export const ROLL_FLASH_LIMIT = 4;

/** Every settled attack produces a flash — see this module's own doc
 * comment on why that's wider than `damageToastFor`'s hit-only gate. */
export function rollFlashFor(
  result: CombatExperienceAttackOutcome | undefined
): RollFlashOutcome | null {
  if (!result) return null;
  return {
    id: result.attackId,
    d20: result.d20,
    modifier: result.total - result.d20,
    total: result.total,
    natural: result.d20 === 20 ? 'nat20' : result.d20 === 1 ? 'nat1' : 'normal',
    hit: result.hit,
    critical: result.critical,
  };
}

/** "d20 17 + 5 = 22" / "d20 8 - 2 = 6" — the toast's one line of copy. Kept
 * here, like `damageToastText`, so the renderer stays dumb and the wording
 * is unit-testable without mounting React. */
export function rollFlashText(outcome: RollFlashOutcome): string {
  const sign = outcome.modifier < 0 ? '-' : '+';
  return `d20 ${outcome.d20} ${sign} ${Math.abs(outcome.modifier)} = ${outcome.total}`;
}
