import type { PersuadeResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

export interface PersuadeParams {
  session: string;
  /** Who appeals — the local player's own member id. */
  member: string;
  /**
   * Who is appealed to — an available candidate on the selected Persuade
   * offer. The candidates on that offer are the members who can currently
   * SEE the actor, which is the direction this verb cares about: words reach
   * somebody who can see who is speaking, not somebody the actor happens to
   * be looking at. The caller supplies one; this hook never infers or
   * defaults a target.
   */
  target: string;
}

export interface UseSessionPersuadeResult {
  persuade: (params: PersuadeParams) => Promise<PersuadeResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around `SessionService.Persuade` — `useSessionIntimidate`'s
 * twin, field for field and law for law, because a caller that learned one
 * must not have to learn a second (rpg-project#458).
 *
 * THE RESPONSE IS NOT THE OUTCOME. `PersuadeResponse` carries no beaten, total
 * or dc: the roll reaches the actor on the `persuaded` beat, whose audience is
 * every member whose sight reaches the actor's cell — the actor included —
 * exactly like everyone else at the table (ruled by Kirk on
 * rpg-api-protos#339, carried onto this verb by rpg-api-protos#340). A caller
 * that narrated this return value would be writing a second account of a die
 * the log is already reporting.
 *
 * NOR IS THE ANSWER HERE, and that is the larger omission of the two. A
 * settled appeal may have made the goblin speak a line the author wrote, teach
 * the party a fact, or bolt for the door — the author's table, rolled by the
 * world. None of it is on this response. It arrives as the `answered` beat,
 * which is the whole reason there are two beats: the creature's answer is the
 * WORLD'S account, not this caller's receipt.
 *
 * A FAILED APPEAL IS AN OUTCOME, NOT AN ERROR, so the promise resolves. It is
 * also where the goblin's bad directions come from: the `persuade_failed`
 * table fires on exactly that path, and the party walks off believing
 * something false.
 *
 * NO SELECTOR IS ECHOED, unlike Attack and Cast. `PersuadeRequest` names the
 * session, the member and the target and nothing else, so there is no opaque
 * declaration id to go stale and no stale-declaration recovery path for this
 * verb.
 *
 * IT WORKS ON BOTH CLOCKS. On the turn clock it costs the standard action; on
 * the world clock it costs nothing, because the world clock has no economy
 * (R3, rpg-project#457). Nothing here knows which clock it is on — the server
 * prices it and this hook sends the same three fields either way.
 */
export function useSessionPersuade(): UseSessionPersuadeResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const persuade = useCallback(
    async (params: PersuadeParams): Promise<PersuadeResponse> => {
      setLoading(true);
      setError(null);
      try {
        return await sessionClient.persuade(params);
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('Persuade RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { persuade, loading, error };
}
