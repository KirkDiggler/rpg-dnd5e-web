import { create } from '@bufbuild/protobuf';
import { GetMyActiveLobbyRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import type { LobbyStatus } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/types_pb';
import { useEffect, useRef, useState } from 'react';
import { lobbyClient } from './client';

export interface MyActiveLobby {
  lobbyId: string;
  encounterId: string;
  lobbyStatus: LobbyStatus;
}

interface UseMyActiveLobbyResult {
  /** Null until the lookup resolves. An empty lobbyId means no active lobby — not an error. */
  data: MyActiveLobby | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Resume-after-refresh (#444): fires GetMyActiveLobby exactly once, the
 * moment playerId first becomes non-null, to learn whether the caller has
 * an active lobby or running encounter to resume into instead of landing
 * on Home. playerId only gates WHEN the call fires (auth has to be ready
 * first) — the RPC itself carries no request fields; identity comes from
 * the authenticated context server-side (matches StreamLobby's pattern).
 */
export function useMyActiveLobby(
  playerId: string | null
): UseMyActiveLobbyResult {
  const [data, setData] = useState<MyActiveLobby | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!playerId || firedRef.current) return;
    firedRef.current = true;

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const request = create(GetMyActiveLobbyRequestSchema, {});
        const response = await lobbyClient.getMyActiveLobby(request);
        setData({
          lobbyId: response.lobbyId,
          encounterId: response.encounterId,
          lobbyStatus: response.lobbyStatus,
        });
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error('GetMyActiveLobby RPC failed')
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [playerId]);

  return { data, loading, error };
}
