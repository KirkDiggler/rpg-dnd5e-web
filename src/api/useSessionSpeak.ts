import type { SpeakResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import { sessionClient } from './client';

/**
 * Who is spoken to: a creature (a member id) or a placed prop (a prop id).
 *
 * THE WIRE'S OWN ONEOF, unwrapped of its empty arm. `SpeakOption.target` and
 * `SpeakRequest.target` are the same two arms, so the row the player picked
 * is echoed back without being translated through a local shape first. An
 * unset target is not representable here because the server refuses one.
 */
export type SpeakTarget =
  | { case: 'memberId'; value: string }
  | { case: 'propId'; value: string };

export interface SpeakParams {
  session: string;
  /** Who speaks — the local player's own member id. */
  member: string;
  /** Who is spoken to, echoed from the picked `SpeakOption.target`. */
  target: SpeakTarget;
  /**
   * The line picked, echoed verbatim from `SpeakOption.option_id`. OPAQUE:
   * which skill it rolls and what it does are the server's answer.
   */
  optionId: string;
  /**
   * The revision of the interaction the picked line was offered at, echoed
   * verbatim from `SpeakOption.revision` (rpg-project#924). OPAQUE: the
   * client never compares or increments it. A reply from a menu the
   * conversation has moved past is refused with `ABORTED` and nothing spent.
   * 0 (a line that reads no interaction) is sent as the wire's own default.
   */
  revision: bigint;
}

export interface UseSessionSpeakResult {
  speak: (params: SpeakParams) => Promise<SpeakResponse>;
  loading: boolean;
  error: Error | null;
}

/**
 * Thin wrapper around `SessionService.Speak` (rpg-project#569): the one social
 * verb. Intimidate and Persuade are options now, whose check lists their
 * skill, so this hook replaces both of theirs.
 *
 * THE RESPONSE IS NOT THE OUTCOME. `SpeakResponse` carries no beaten, total or
 * dc: the roll reaches the actor on the `spoke` beat, whose audience is every
 * member whose sight reaches the actor, and the creature's reply arrives as
 * `answered`. The story log narrates both once for the whole table.
 *
 * NO SELECTOR IS ECHOED. `SpeakRequest` names the target, the option and the
 * offered line's revision; a stale option is refused at the door
 * (`ErrNoOption`), a moved-on revision with `ABORTED`, and a line another
 * speaker's waiting roll holds with `FAILED_PRECONDITION`. The caller decides
 * how each reads.
 */
export function useSessionSpeak(): UseSessionSpeakResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const speak = useCallback(
    async (params: SpeakParams): Promise<SpeakResponse> => {
      setLoading(true);
      setError(null);
      try {
        return await sessionClient.speak(params);
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error('Speak RPC failed');
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { speak, loading, error };
}
