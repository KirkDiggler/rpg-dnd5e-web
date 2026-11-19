/**
 * Leaving a watched run (rpg-project#1008).
 *
 * A watched run is an ordinary open run: the character stays seated in it
 * until it leaves. Ending a watch leaves the run with the game's own Leave
 * (`useSessionLeave`, `SessionService.Exit`), the same verb Home's
 * "Abandon run" uses. The member is the run's only member, so the engine
 * closes the run behind it (the reserved "abandoned" ending) and frees the
 * seat.
 *
 * A run that is already gone (NotFound) or already ended ("encounter
 * closed") has nothing to leave: that counts as left. Any other refusal is
 * said in the server's words, and the caller lets the operator stop anyway.
 */
import { useSessionLeave } from '@/api/useSessionLeave';
import { Code, ConnectError } from '@connectrpc/connect';
import { useCallback, useState } from 'react';
import type { WatchedRun } from './runWatch';

/** True when Exit refused because there is no run left to leave. */
export function runAlreadyGone(err: unknown): boolean {
  const refusal = ConnectError.from(err);
  return (
    refusal.code === Code.NotFound ||
    (refusal.code === Code.FailedPrecondition &&
      /encounter closed/.test(refusal.rawMessage))
  );
}

export interface WatchLeave {
  /** A leave is in flight. */
  leaving: boolean;
  /** The last refused leave, as a sentence; null when none. */
  refusal: string | null;
  /** Leaves the run; true when the seat is free (or the run was gone). */
  leaveRun(run: WatchedRun): Promise<boolean>;
  clearRefusal(): void;
}

export function useWatchLeave(): WatchLeave {
  const { leave } = useSessionLeave();
  const [leaving, setLeaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const leaveRun = useCallback(
    async (run: WatchedRun): Promise<boolean> => {
      setLeaving(true);
      setRefusal(null);
      try {
        await leave({ session: run.session, member: run.member });
        return true;
      } catch (err) {
        if (runAlreadyGone(err)) return true;
        setRefusal(
          `Could not leave the run: ${ConnectError.from(err).rawMessage}`
        );
        return false;
      } finally {
        setLeaving(false);
      }
    },
    [leave]
  );
  const clearRefusal = useCallback(() => setRefusal(null), []);
  return { leaving, refusal, leaveRun, clearRefusal };
}
