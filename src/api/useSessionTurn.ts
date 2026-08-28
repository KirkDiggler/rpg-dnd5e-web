import {
  ClockKind,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useRef, useState } from 'react';
import { sessionClient } from './client';

export interface UseSessionTurnResult {
  /** Last successful provider display values for this exact session/member. */
  clock: ClockKind;
  active: string;
  round: number;
  order: string[];
  participants: Participant[];
  loading: boolean;
  error: Error | null;
  /** True only after the newest request generation succeeds. */
  fresh: boolean;
  /** Synchronously revokes authority without discarding last-good display. */
  invalidate: () => void;
  refetch: () => Promise<void>;
}

interface TurnState {
  key: string;
  clock: ClockKind;
  active: string;
  round: number;
  order: string[];
  participants: Participant[];
  loading: boolean;
  error: Error | null;
  fresh: boolean;
}

function emptyState(key: string): TurnState {
  return {
    key,
    clock: ClockKind.UNSPECIFIED,
    active: '',
    round: 0,
    order: [],
    participants: [],
    loading: false,
    error: null,
    fresh: false,
  };
}

/**
 * Fetches the member-scoped Turn snapshot. Last-good values remain available
 * for stale display, while `fresh` is the fail-closed execution authority.
 * Refetch/invalidate revoke freshness immediately; only the newest successful
 * request for the current key restores it. Errors retain display and stay
 * stale. The route owns all fetch triggers.
 */
export function useSessionTurn(
  session: string,
  member: string
): UseSessionTurnResult {
  const key = `${session}\u0000${member}`;
  const [state, setState] = useState<TurnState>(() => emptyState(key));
  const generationRef = useRef(0);
  const keyRef = useRef(key);
  keyRef.current = key;

  const invalidate = useCallback(() => {
    if (keyRef.current !== key) return;
    generationRef.current += 1;
    setState((previous) =>
      previous.key === key
        ? { ...previous, loading: false, fresh: false }
        : emptyState(key)
    );
  }, [key]);

  const fetchTurn = useCallback(async () => {
    if (keyRef.current !== key) return;
    if (!session || !member) {
      generationRef.current += 1;
      setState(emptyState(key));
      return;
    }

    const generation = ++generationRef.current;
    const isCurrent = () =>
      generation === generationRef.current && keyRef.current === key;
    setState((previous) => ({
      ...(previous.key === key ? previous : emptyState(key)),
      key,
      loading: true,
      error: null,
      fresh: false,
    }));

    try {
      const response = await sessionClient.turn({ session, member });
      if (!isCurrent()) return;
      setState({
        key,
        clock: response.clock,
        active: response.active,
        round: response.round,
        order: response.order,
        participants: response.participants,
        loading: false,
        error: null,
        fresh: true,
      });
    } catch (err) {
      if (!isCurrent()) return;
      setState((previous) => ({
        ...(previous.key === key ? previous : emptyState(key)),
        key,
        loading: false,
        error: err instanceof Error ? err : new Error('Turn RPC failed'),
        fresh: false,
      }));
    }
  }, [key, member, session]);

  useEffect(() => {
    generationRef.current += 1;
    setState(emptyState(key));
    return () => {
      generationRef.current += 1;
    };
  }, [key]);

  const current = state.key === key ? state : emptyState(key);
  return {
    clock: current.clock,
    active: current.active,
    round: current.round,
    order: current.order,
    participants: current.participants,
    loading: current.loading,
    error: current.error,
    fresh: current.fresh,
    invalidate,
    refetch: fetchTurn,
  };
}
