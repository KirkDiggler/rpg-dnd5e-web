/**
 * relocateCut — the viewer's own character set down elsewhere, as a CUT
 * (rpg-project#925). The operator: "I do like the cut away while walking off
 * and appearing in the cell".
 *
 * THE ACT ONLY ANIMATES; THE SNAPSHOTS PLACE. The character's position is
 * GetWhere's after the act's refresh (`actRefreshKeys`: where, view, …); the
 * cut hides that jump: the view fades out with the authored words, the
 * camera is pointed at `to` while it is dark, and the view fades back in on
 * the character. Input is not accepted while it plays, and it ALWAYS ends:
 * every phase is a timer, and the whole cut is bounded. With reduced motion
 * it cuts without the fade: the words hold, then the view is simply back.
 */
import type { Act } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isOwnRelocation } from './relocateLine';

export const CUT_OUT_MS = 600;
export const CUT_HOLD_MS = 1800;
export const CUT_IN_MS = 600;
/** The cut never outlives this, whatever its timers do. */
export const CUT_MAX_MS = CUT_OUT_MS + CUT_HOLD_MS + CUT_IN_MS + 1000;

export type RelocateCutPhase = 'out' | 'hold' | 'in';

export interface RelocateCut {
  /** The act's identity: one cut per relocation. */
  readonly key: string;
  /** The authored words, verbatim ('' when none were authored). */
  readonly words: string;
  /** Where the character was set down, when the act says (always, for the
   * mover's own version). */
  readonly to?: { readonly x: number; readonly y: number };
  readonly phase: RelocateCutPhase;
  /** No fade: the reduced-motion path. */
  readonly reduced: boolean;
}

/** The viewer's own relocation in a run, if any: the cut's start. */
export function ownRelocation(
  run: readonly Act[],
  viewer: string
): Omit<RelocateCut, 'phase' | 'reduced'> | undefined {
  for (const act of run) {
    if (act.body.case !== 'relocate') continue;
    const relocate = act.body.value;
    if (!isOwnRelocation(relocate, viewer)) continue;
    return {
      key: `${act.session}:${act.id}`,
      words: relocate.words,
      ...(relocate.to ? { to: { x: relocate.to.x, y: relocate.to.y } } : {}),
    };
  }
  return undefined;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** The cut's state and its starter. */
export function useRelocateCut(): {
  cut: RelocateCut | null;
  start: (from: Omit<RelocateCut, 'phase' | 'reduced'>) => void;
} {
  const [cut, setCut] = useState<RelocateCut | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clear = () => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
  };
  useEffect(() => clear, []);

  const start = useCallback((from: Omit<RelocateCut, 'phase' | 'reduced'>) => {
    clear();
    const reduced = prefersReducedMotion();
    const at = (ms: number, next: () => void) =>
      timers.current.push(setTimeout(next, ms));
    if (reduced) {
      setCut({ ...from, phase: 'hold', reduced });
      at(CUT_HOLD_MS, () => setCut(null));
    } else {
      setCut({ ...from, phase: 'out', reduced });
      at(CUT_OUT_MS, () =>
        setCut((c) => (c?.key === from.key ? { ...c, phase: 'hold' } : c))
      );
      at(CUT_OUT_MS + CUT_HOLD_MS, () =>
        setCut((c) => (c?.key === from.key ? { ...c, phase: 'in' } : c))
      );
      at(CUT_OUT_MS + CUT_HOLD_MS + CUT_IN_MS, () =>
        setCut((c) => (c?.key === from.key ? null : c))
      );
    }
    // The bound: whatever happens to the timers above, the cut ends.
    at(CUT_MAX_MS, () => setCut((c) => (c?.key === from.key ? null : c)));
  }, []);

  return { cut, start };
}
