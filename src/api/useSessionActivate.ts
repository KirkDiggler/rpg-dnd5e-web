import type { ActivateResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export interface ActivateParams {
  session: string;
  /** Who is activating — the local player's own member id. */
  member: string;
  /**
   * Opaque selector echoed exactly from the chosen Afford declaration.
   *
   * IT IS ALSO WHICH ABILITY. Activate compiles one offer per thing the
   * character carries, so the selector names the row rather than the verb —
   * there is no ability ref to send, and constructing one here would mean
   * deciding something the server already decided.
   */
  declarationId: string;
  /**
   * Who the ability lands on, for a declaration whose `targetKind` is MEMBER.
   *
   * OPTIONAL HERE, ALWAYS SENT ON THE WIRE. `ActivateRequest.target` is a
   * proto3 scalar, so there is no absent — omitting it here sends `''`, which
   * IS how the contract spells "no target", and the server reads it that way.
   *
   * A NON-EMPTY target on an ability that takes none is refused
   * (`INVALID_ARGUMENT`) rather than ignored, so this must stay unset for the
   * six level-1 activations that prompt for nobody. A dropped target would be
   * a client that believes it aimed Dodge at somebody and a server that knows
   * better.
   */
  target?: string;
}

export interface UseActivateResult {
  activate: (params: ActivateParams) => Promise<ActivateResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around `SessionService.Activate` — mirrors `useSessionAttack`
 * and `useSessionEndTurn`: one file per verb, `loading` true while in flight,
 * `error` set on failure, the returned promise rejects so the caller decides
 * what to show.
 *
 * THE RESPONSE SAYS NOTHING ABOUT WHAT COMES NEXT, on purpose. It carries only
 * what was persisted and what reached the stream; the caller re-reads Afford to
 * learn what is still declarable. A second declaration surface here would be
 * two answers to "what can I do", free to disagree.
 *
 * NO RULES LOGIC HAPPENS HERE. The caller supplies an available server
 * declaration and this echoes its opaque `id` unchanged; it never constructs
 * or parses a selector.
 */
export function useSessionActivate(): UseActivateResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const activate = useCallback(
    async (params: ActivateParams): Promise<ActivateResponse> => {
      setLoading(true);
      setError(null);
      try {
        return await sessionClient.activate({
          session: params.session,
          member: params.member,
          declarationId: params.declarationId,
          target: params.target ?? '',
        });
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('Activate RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { activate, loading, error };
}
