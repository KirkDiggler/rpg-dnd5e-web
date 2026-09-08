import type { CastResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export interface CastParams {
  session: string;
  /** Who is casting — the local player's own member id. */
  member: string;
  /**
   * Opaque selector echoed exactly from the chosen Afford declaration.
   *
   * IT IS ALSO WHICH SPELL. Afford compiles one Cast offer per castable
   * cantrip, so the selector names the row rather than the verb — there is no
   * spell ref on the request, and constructing one here would mean deciding
   * the thing Afford exists to have already decided (design rpg-project#405,
   * R1).
   */
  declarationId: string;
  /**
   * Who the spell lands on, for a declaration whose `targetKind` is MEMBER.
   *
   * OPTIONAL HERE, ALWAYS SENT ON THE WIRE, exactly as Activate's is:
   * `CastRequest.target` is a proto3 scalar, so omitting it sends `''`, which
   * IS how the contract spells "no target". A populated target on a
   * TARGET_KIND_NONE declaration is `INVALID_ARGUMENT` rather than a value
   * quietly ignored, so a self cast must leave this unset.
   */
  target?: string;
}

export interface UseCastResult {
  cast: (params: CastParams) => Promise<CastResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around `SessionService.Cast` — one file per verb, the shape
 * `useSessionActivate` keeps, for the same reasons.
 *
 * A SEPARATE VERB FROM Activate, NOT A FLAG ON IT. The request is identical
 * field for field so that what differs between the two is the machine behind
 * them, never the fields in front (R1). Sharing one hook would put that
 * difference back in the client.
 *
 * THE RESPONSE SAYS NOTHING ABOUT WHAT COMES NEXT. It carries only what was
 * persisted and what reached the stream; the caller re-reads Afford to learn
 * what is still declarable.
 *
 * NO RULES LOGIC HAPPENS HERE. The caller supplies an available server
 * declaration and this echoes its opaque `id` unchanged.
 */
export function useSessionCast(): UseCastResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const cast = useCallback(
    async (params: CastParams): Promise<CastResponse> => {
      setLoading(true);
      setError(null);
      try {
        return await sessionClient.cast({
          session: params.session,
          member: params.member,
          declarationId: params.declarationId,
          target: params.target ?? '',
        });
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('Cast RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { cast, loading, error };
}
