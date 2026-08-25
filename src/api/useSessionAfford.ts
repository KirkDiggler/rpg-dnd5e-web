import {
  ClockKind,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useState } from 'react';
import { sessionClient } from './client';

export interface UseSessionAffordResult {
  clock: ClockKind;
  declarations: Declaration[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches one member's turn-economy budget (`SessionService.Afford`) —
 * "backend tells dumb client what it can do" (Kirk's ruling, toolkit#1138,
 * carried into `turnHud.ts`'s own doc comment, which is the pure mapping
 * this hook's answer feeds). `AffordResponse`'s own doc comment: empty
 * `declarations` on `CLOCK_KIND_WORLD` IS the answer (free roam), never
 * "unknown" — this hook does not distinguish that from "never fetched
 * yet" either; both start at `CLOCK_KIND_UNSPECIFIED`/`[]` until a real
 * response lands, and `turnHud.ts` treats anything short of
 * `CLOCK_KIND_TURN` as free-roam by design (see its own doc comment).
 *
 * `session`/`member` empty/falsy is the "not ready yet" state, same
 * convention as `useSessionWhere`/`useSessionView` — `loading`/`error`
 * both clear rather than leaving a stale error visible from a previous
 * session/member pair.
 *
 * NO MOUNT FETCH, same reasoning as `useSessionView`'s own doc comment: an
 * Afford answer only means something relative to the CURRENT game state
 * (which clock a member is in, right now), not something that stays true
 * just because a component mounted. `SessionEncounterView` is the single
 * owner of every fetch — once when the member is first known, then again
 * on the specific `StreamEvents` kinds that can change a budget (fight
 * start/end, turn end, a strike/miss/downing landing, the encounter
 * ending), after the local player's own Move/Attack round-trips, and
 * after a fight-lock `Move` refusal (see that component's own comments
 * for the full trigger list — this hook only owns the RPC and the state
 * machine around it, not when to call it).
 *
 * KEEPS LAST-GOOD ON A REFETCH ERROR, unlike `useSessionWhere`/
 * `useSessionView`, which null out on failure. The slice-4 lesson
 * (Copilot review, PR #768: `pathIndex` silently going dead on a
 * background refetch failure while the canvas kept drawing the old
 * scene) has the same shape here — a `clock`/`declarations` pair that
 * goes stale because ONE background Afford refetch failed is a worse
 * answer than the LAST one the server actually gave, so a failed refetch
 * only sets `error` and leaves `clock`/`declarations` exactly as they
 * were. The very first fetch has no "last good" to fall back to, so it
 * behaves the same either way: both start at the unfetched defaults
 * above and stay there until a call actually succeeds.
 */
export function useSessionAfford(
  session: string,
  member: string
): UseSessionAffordResult {
  const [clock, setClock] = useState<ClockKind>(ClockKind.UNSPECIFIED);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchAfford = useCallback(async () => {
    if (!session || !member) {
      setClock(ClockKind.UNSPECIFIED);
      setDeclarations([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await sessionClient.afford({ session, member });
      setClock(response.clock);
      setDeclarations(response.declarations);
    } catch (err) {
      // Last-good `clock`/`declarations` are deliberately left untouched —
      // see this module's own doc comment.
      setError(err instanceof Error ? err : new Error('Afford RPC failed'));
    } finally {
      setLoading(false);
    }
  }, [session, member]);

  // The only automatic behaviour: a session/member pair going away resets
  // the budget, so a stale error or stale declarations from a previous
  // pair can never outlive it (same clearing rule as useSessionView).
  useEffect(() => {
    if (!session || !member) {
      setClock(ClockKind.UNSPECIFIED);
      setDeclarations([]);
      setError(null);
      setLoading(false);
    }
  }, [session, member]);

  return { clock, declarations, loading, error, refetch: fetchAfford };
}
