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
 * Resume-after-refresh (#444): fires GetMyActiveLobby once per distinct
 * playerId, the moment that identity becomes known, to learn whether the
 * caller has an active lobby or running encounter to resume into instead of
 * landing on Home. playerId only gates WHEN the call fires (auth has to be
 * ready first) — the RPC itself carries no request fields; identity comes
 * from the authenticated context server-side (matches StreamLobby's
 * pattern).
 *
 * Keyed to the playerId VALUE, not a fire-once boolean (Copilot review on
 * #461): a dev override switch, or Discord auth resolving over an initial
 * fallback id, changes playerId after mount — without this, the hook would
 * silently keep resolving/showing the PREVIOUS identity's session forever.
 * A playerId change clears data/error immediately and refires.
 *
 * `loading` is a plain derived expression, not stored state set inside the
 * effect — it has to be correct on the render that first sees a known
 * playerId, before the effect has even run (Copilot review on #461: a
 * useEffect-set loading flag lags one tick behind first paint in a real
 * browser, long enough for a caller gating "hold render until this
 * resolves" — App.tsx's Home screen — to flash before the spinner).
 */
export function useMyActiveLobby(
  playerId: string | null
): UseMyActiveLobbyResult {
  const [data, setData] = useState<MyActiveLobby | null>(null);
  const [error, setError] = useState<Error | null>(null);
  // firedForRef dedupes the EFFECT (don't re-fire an in-flight/completed
  // fetch for the same playerId on every render). resolvedForRef gates
  // `loading` (has the CURRENT playerId's fetch actually settled) — these
  // have to be two separate marks: firedForRef flips the instant the fetch
  // starts, but the fetch is still in flight at that point, so gating
  // `loading` on firedForRef alone would report "done" before the RPC
  // response arrives.
  const firedForRef = useRef<string | null>(null);
  const resolvedForRef = useRef<string | null>(null);

  const loading = Boolean(playerId) && resolvedForRef.current !== playerId;

  useEffect(() => {
    if (!playerId || firedForRef.current === playerId) return;
    firedForRef.current = playerId;

    setData(null);
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
        resolvedForRef.current = playerId;
      }
    })();
  }, [playerId]);

  return { data, loading, error };
}
