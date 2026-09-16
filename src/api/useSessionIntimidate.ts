import type { IntimidateResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export interface IntimidateParams {
  session: string;
  /** Who threatens — the local player's own member id. */
  member: string;
  /**
   * Who is threatened — an available candidate on the selected Intimidate
   * offer. The candidates on that offer are the members who can currently
   * SEE the actor, which is the direction this verb cares about: a threat
   * reaches somebody who can see who is making it, not somebody the actor
   * happens to be looking at. The caller supplies one; this hook never
   * infers or defaults a target.
   */
  target: string;
}

export interface UseSessionIntimidateResult {
  intimidate: (params: IntimidateParams) => Promise<IntimidateResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around `SessionService.Intimidate` — mirrors
 * `useSessionAttack`/`useSessionSearch`: one file per verb, `loading` true
 * while in flight, `error` set on failure, the returned promise rejects so
 * the caller decides what to show.
 *
 * THE RESPONSE IS NOT THE OUTCOME, and that is the whole shape of this hook.
 * `IntimidateResponse` carries no beaten, total or dc: the roll reaches the
 * actor on the `intimidated` beat, whose audience is every member whose
 * sight reaches the actor's cell — the actor included — exactly like
 * everyone else at the table (ruled by Kirk on rpg-api-protos#339). A caller
 * that narrated this return value would be writing a second account of a die
 * the log is already reporting, and two accounts of one roll is how a client
 * learns to disagree with the table about what was rolled.
 *
 * So there are two things here worth reading, and neither is a verdict:
 * `paused` with `roll` is the OFFER WINDOW — the attempt stopped to ask this
 * member whether to spend a held Guidance or Bardic Inspiration, answered
 * with the generic React verb — and `saved`/`delivery` are the ordinary
 * partial-write report every mutating verb at this seam carries.
 *
 * NOR IS THE CONSEQUENCE HERE. A beaten threat lands a deed on the witnesses
 * and stops; what the deed is worth is the threatened creature's own mind's
 * to decide, and it reaches a client as that creature's next turn — the
 * coward running while it can still see you, the berserker charging. There
 * is deliberately no "fleeing" field to render.
 *
 * NO SELECTOR IS ECHOED, unlike Attack and Cast. `IntimidateRequest` names
 * the session, the member and the target and nothing else, so there is no
 * opaque declaration id to go stale and no stale-declaration recovery path
 * for this verb. The offer's own id is what the dock arms; the door does not
 * ask for it back.
 */
export function useSessionIntimidate(): UseSessionIntimidateResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const intimidate = useCallback(
    async (params: IntimidateParams): Promise<IntimidateResponse> => {
      setLoading(true);
      setError(null);
      try {
        return await sessionClient.intimidate(params);
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('Intimidate RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { intimidate, loading, error };
}
