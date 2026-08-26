import {
  ClockKind,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useRef, useState } from 'react';
import { sessionClient } from './client';

export interface UseSessionAffordResult {
  /** Last successful provider display values for this exact session/member. */
  clock: ClockKind;
  declarations: Declaration[];
  loading: boolean;
  error: Error | null;
  /** True only after the newest request generation succeeds. */
  fresh: boolean;
  /** Synchronously revokes authority without discarding last-good display. */
  invalidate: () => void;
  refetch: () => Promise<void>;
}

interface AffordState {
  key: string;
  clock: ClockKind;
  declarations: Declaration[];
  loading: boolean;
  error: Error | null;
  fresh: boolean;
}

function emptyState(key: string): AffordState {
  return {
    key,
    clock: ClockKind.UNSPECIFIED,
    declarations: [],
    loading: false,
    error: null,
    fresh: false,
  };
}

/**
 * Fetches the member's generated action declarations without interpreting
 * them. Last-good values remain displayable after invalidation or failure, but
 * `fresh` is the separate execution authority: refetch/invalidate revoke it
 * immediately, only a successful response for the current key/generation
 * restores it, and errors remain stale. The route owns all fetch triggers.
 */
export function useSessionAfford(
  session: string,
  member: string
): UseSessionAffordResult {
  const key = `${session}\u0000${member}`;
  const [state, setState] = useState<AffordState>(() => emptyState(key));
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

  const fetchAfford = useCallback(async () => {
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
      const response = await sessionClient.afford({ session, member });
      if (!isCurrent()) return;
      setState({
        key,
        clock: response.clock,
        declarations: response.declarations,
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
        error: err instanceof Error ? err : new Error('Afford RPC failed'),
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

  // Effects reset after commit; render-time key association prevents the first
  // render of a new pair from exposing old declarations, errors, or freshness.
  const current = state.key === key ? state : emptyState(key);
  return {
    clock: current.clock,
    declarations: current.declarations,
    loading: current.loading,
    error: current.error,
    fresh: current.fresh,
    invalidate,
    refetch: fetchAfford,
  };
}
