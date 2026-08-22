import { ClockKind } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useState } from 'react';
import { sessionClient } from './client';

export interface UseSessionTurnResult {
  clock: ClockKind;
  /** Whose turn it currently is on that clock — empty on the world clock. */
  active: string;
  /** Which round the clock is in — zero on the world clock. */
  round: number;
  /** The fight's initiative order, first to act first — empty on the
   * world clock. */
  order: string[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches one member's own turn state (`SessionService.Turn` — "asked of
 * A MEMBER, never of the session," `TurnRequest`'s own doc comment:
 * several clocks can run at once, so there is no single "whose turn is
 * it" to ask). Same discipline as `useSessionAfford`, which this hook
 * mirrors field-for-field in spirit (both describe "the current state of
 * this member's turn economy," just from different angles — Afford is
 * can-I-pay, Turn is whose-go-is-it):
 *
 * - `session`/`member` empty/falsy is "not ready yet" — clears rather
 *   than answering about a stale pair.
 * - NO MOUNT FETCH of its own — `SessionEncounterView` owns every fetch,
 *   same trigger list as Afford (member-bootstrap, the combat-relevant
 *   `StreamEvents` kinds, after the local player's own Move/Attack/
 *   EndTurn round-trips). A turn-order answer, like an Afford answer,
 *   only means something relative to the CURRENT game state.
 * - KEEPS LAST-GOOD ON A REFETCH ERROR, same slice-4/5a reasoning as
 *   `useSessionAfford`: a `CombatPanel` that briefly can't reach the
 *   server should keep showing the last known turn order rather than
 *   collapsing to "nobody's turn."
 */
export function useSessionTurn(
  session: string,
  member: string
): UseSessionTurnResult {
  const [clock, setClock] = useState<ClockKind>(ClockKind.UNSPECIFIED);
  const [active, setActive] = useState('');
  const [round, setRound] = useState(0);
  const [order, setOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchTurn = useCallback(async () => {
    if (!session || !member) {
      setClock(ClockKind.UNSPECIFIED);
      setActive('');
      setRound(0);
      setOrder([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await sessionClient.turn({ session, member });
      setClock(response.clock);
      setActive(response.active);
      setRound(response.round);
      setOrder(response.order);
    } catch (err) {
      // Last-good clock/active/round/order deliberately untouched — see
      // this module's own doc comment.
      setError(err instanceof Error ? err : new Error('Turn RPC failed'));
    } finally {
      setLoading(false);
    }
  }, [session, member]);

  useEffect(() => {
    if (!session || !member) {
      setClock(ClockKind.UNSPECIFIED);
      setActive('');
      setRound(0);
      setOrder([]);
      setError(null);
      setLoading(false);
    }
  }, [session, member]);

  return { clock, active, round, order, loading, error, refetch: fetchTurn };
}
