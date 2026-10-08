import type { RestResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { RestKind } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export interface Rester {
  member: string;
  /** Hit dice this member spends; zero is a legal answer. */
  hitDice: number;
}

export interface RestParams {
  session: string;
  /** Every member who rests — the group rests together, in one call. */
  resters: readonly Rester[];
}

export interface UseSessionRestResult {
  rest: (params: RestParams) => Promise<RestResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around `SessionService.Rest` — `useSessionLeave`'s shape.
 *
 * The response says only that the rest was saved and delivered. What it did
 * — hit points, hit dice, resources refilled, concentration and conditions
 * ended — arrives on one RESTED beat per rester, which the story renders. This
 * hook reads nothing out of the answer. SHORT is the only kind granted today.
 * A rest is refused FAILED_PRECONDITION, spending nothing for anyone, when a
 * rester is in a fight or asks for more hit dice than they have left; the
 * rejection carries the server's message for the caller to show.
 */
export function useSessionRest(): UseSessionRestResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const rest = useCallback(
    async (params: RestParams): Promise<RestResponse> => {
      setLoading(true);
      setError(null);
      try {
        return await sessionClient.rest({
          session: params.session,
          kind: RestKind.SHORT,
          resters: params.resters.map(({ member, hitDice }) => ({
            member,
            hitDice,
          })),
        });
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('Rest RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { rest, loading, error };
}
