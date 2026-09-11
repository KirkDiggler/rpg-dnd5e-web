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
  /** Ordered provider-validated targets for this one cast. */
  targets: readonly string[];
  /**
   * The cell a caster-edge shape is aimed toward, in the same dungeon-absolute
   * coordinates every other verb speaks.
   *
   * A REFERENCE, NEVER A SHAPE. Thunderwave's cube starts at the caster's own
   * edge and points somewhere; the player names the direction by clicking a
   * cell and the engine derives which cells the cube covers. Sending anything
   * more than the aimed-at cell would be this client computing coverage, which
   * is the one thing it must not do.
   *
   * Set only for a declaration whose `target_kind` is CELL — the server
   * refuses a cell on any other kind, exactly as it refuses targets on an
   * area cast.
   */
  cell?: { x: number; y: number };
  /** Deprecated scalar retained only for callers still crossing the old seam. */
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
          target: '',
          targets: [...params.targets],
          cell: params.cell,
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
