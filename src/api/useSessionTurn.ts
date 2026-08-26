import {
  ClockKind,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useRef, useState } from 'react';
import { sessionClient } from './client';

export interface UseSessionTurnResult {
  clock: ClockKind;
  /** Whose turn it currently is on that clock — empty on the world clock. */
  active: string;
  /** Which round the clock is in — zero on the world clock. */
  round: number;
  /** The fight's initiative order, first to act first — empty on the
   * world clock. Kept alongside `participants` (same ids, same order) for
   * any caller that only needs ids; `participants` is the richer answer
   * (name/kind/standing/active) the combat panel actually renders from. */
  order: string[];
  /** One entry per member of the fight the asker is in — name, kind,
   * standing, and which one is active (rpg-project#249 §3's `Participant`,
   * landed rpg-toolkit#1137). Empty on the world clock, same as `order`. */
  participants: Participant[];
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
 *   `useSessionAfford`: a combat experience that briefly can't reach the
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
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // Same key/request fencing as Afford. Render-time key updates make a late
  // completion stale before the key-reset effect runs; generations ensure an
  // older overlapping request for the same key cannot overwrite a newer
  // server snapshot (including error/loading state).
  const generationRef = useRef(0);
  const keyRef = useRef({ session, member });
  keyRef.current = { session, member };

  const fetchTurn = useCallback(async () => {
    if (
      keyRef.current.session !== session ||
      keyRef.current.member !== member
    ) {
      return;
    }
    if (!session || !member) {
      generationRef.current += 1;
      setClock(ClockKind.UNSPECIFIED);
      setActive('');
      setRound(0);
      setOrder([]);
      setParticipants([]);
      setError(null);
      setLoading(false);
      return;
    }

    const generation = ++generationRef.current;
    const isCurrent = () =>
      generation === generationRef.current &&
      keyRef.current.session === session &&
      keyRef.current.member === member;
    setLoading(true);
    setError(null);
    try {
      const response = await sessionClient.turn({ session, member });
      if (!isCurrent()) return;
      setClock(response.clock);
      setActive(response.active);
      setRound(response.round);
      setOrder(response.order);
      setParticipants(response.participants);
    } catch (err) {
      if (!isCurrent()) return;
      // Last-good clock/active/round/order/participants deliberately
      // untouched — see this module's own doc comment.
      setError(err instanceof Error ? err : new Error('Turn RPC failed'));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [session, member]);

  // Every key transition resets the old pair's public turn answer, including
  // direct nonempty -> nonempty changes. Cleanup also invalidates unmount work.
  useEffect(() => {
    generationRef.current += 1;
    setClock(ClockKind.UNSPECIFIED);
    setActive('');
    setRound(0);
    setOrder([]);
    setParticipants([]);
    setError(null);
    setLoading(false);
    return () => {
      generationRef.current += 1;
    };
  }, [session, member]);

  return {
    clock,
    active,
    round,
    order,
    participants,
    loading,
    error,
    refetch: fetchTurn,
  };
}
