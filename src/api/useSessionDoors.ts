import type { DoorInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useState } from 'react';
import { sessionClient } from './client';

export interface UseSessionDoorsResult {
  /** Every door keyed by id (`DoorInfo.door` — the same id
   * `AtlasDoorway.connection` speaks), for O(1) lookup at render. */
  doors: ReadonlyMap<string, DoorInfo>;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const EMPTY_DOORS: ReadonlyMap<string, DoorInfo> = new Map();

/**
 * Fetches the session's doors (`SessionService.GetDoors`) — the LIVE half
 * of the atlas's doorways (rpg-project#268). `GetAtlas` says where a
 * door's edges are and never changes; this says what each door is doing
 * now: open, closed, or locked with its DC (public down to the number —
 * full data until v1.0).
 *
 * LOAD ONCE, REFRESH FROM THE STREAM: door state changes exactly when a
 * DOOR event says it did, so this hook fetches on mount and the only other
 * fetch a caller should fire is `refetch` on a `door` event — the same
 * pull-on-signal shape `useSessionRoster` set (rpg-project#264). A failed
 * refetch keeps the last-known doors rather than blanking them: a door
 * drawn in its last-known state beats a doorway drawn stateless.
 */
export function useSessionDoors(session: string): UseSessionDoorsResult {
  const [doors, setDoors] =
    useState<ReadonlyMap<string, DoorInfo>>(EMPTY_DOORS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchDoors = useCallback(async () => {
    if (!session) {
      setDoors(EMPTY_DOORS);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await sessionClient.getDoors({ session });
      setDoors(new Map(response.doors.map((d) => [d.door, d])));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('GetDoors RPC failed'));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) {
      setDoors(EMPTY_DOORS);
      setError(null);
      setLoading(false);
      return;
    }
    void fetchDoors();
  }, [session, fetchDoors]);

  return { doors, loading, error, refetch: fetchDoors };
}
