import type { ReactResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import type { ReactChoice } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export interface ReactParams {
  session: string;
  /** Who answers — the local player's own member id, the window's audience. */
  member: string;
  /**
   * Opaque selector echoed exactly from the VERB_REACT Afford declaration.
   *
   * IT IS ALSO WHICH WINDOW. Several movers can pass the same reactor in one
   * step, so the selector names the offered window rather than the verb —
   * there is no mover and no reaction ref to send, because the server already
   * decided both when it posed the window.
   */
  declarationId: string;
  /** Take the reaction, or let the mover pass. */
  choice: ReactChoice;
}

export interface UseReactResult {
  react: (params: ReactParams) => Promise<ReactResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around `SessionService.React` — mirrors `useSessionAttack` and
 * `useSessionActivate`: one file per verb, `loading` true while in flight,
 * `error` set on failure, the returned promise rejects so the caller decides
 * what to show.
 *
 * A STRIKE'S OUTCOME IS NOT IN THE RESPONSE. The ack says only what was
 * persisted and what reached the stream; the swing arrives as the ordinary
 * Struck/Missed beat with its `reaction` populated, and the fight resumes on
 * the beats that follow. A second outcome surface here would be two answers to
 * "what happened", free to disagree.
 *
 * NO RULES LOGIC HAPPENS HERE. The caller supplies an available server
 * declaration and this echoes its opaque `id` unchanged; it never constructs
 * or parses a selector.
 */
export function useSessionReact(): UseReactResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const react = useCallback(
    async (params: ReactParams): Promise<ReactResponse> => {
      setLoading(true);
      setError(null);
      try {
        return await sessionClient.react({
          session: params.session,
          member: params.member,
          declarationId: params.declarationId,
          choice: params.choice,
        });
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('React RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { react, loading, error };
}
