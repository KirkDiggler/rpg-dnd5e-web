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

interface MyActiveLobbyEntry {
  /** Identity key this answer belongs to; never exposed for another key. */
  key: string | null;
  data: MyActiveLobby | null;
  error: Error | null;
}

/**
 * Resume-after-refresh (#444): fires GetMyActiveLobby once per distinct
 * identity, the moment that identity becomes known, to learn whether the
 * caller has an active lobby or running encounter to resume into instead of
 * landing on Home. The RPC itself carries no request fields; identity comes
 * from the authenticated context server-side (matches StreamLobby's pattern).
 *
 * `identityScope` is the world/player/auth-epoch scope key from GameIdentity
 * (web#522 / S6a). It is part of the lookup key, so the SAME player switching
 * worlds — or re-authenticating in the same world — is a new lookup rather
 * than the previous identity's answer, and a late response belonging to the
 * old scope is released instead of populating the new one. Player id stays the
 * readiness gate; omitting the scope keeps the lookup keyed by player alone.
 *
 * `loading` is a plain derived expression, not stored state set inside the
 * effect — it has to be correct on the render that first sees a known
 * identity, before the effect has even run (Copilot review on #461: a
 * useEffect-set loading flag lags one tick behind first paint in a real
 * browser, long enough for a caller gating "hold render until this resolves" —
 * App.tsx's Home screen — to flash before the spinner).
 */
export function useMyActiveLobby(
  playerId: string | null,
  identityScope?: string | null
): UseMyActiveLobbyResult {
  const fetchKey = playerId ? `${identityScope ?? ''}\u0000${playerId}` : null;
  // Updated during render, so a completion racing the key-reset effect is
  // already stale when it tries to publish.
  const fetchKeyRef = useRef<string | null>(fetchKey);
  fetchKeyRef.current = fetchKey;
  const [entry, setEntry] = useState<MyActiveLobbyEntry>(() => ({
    key: fetchKey,
    data: null,
    error: null,
  }));
  // firedForRef dedupes the EFFECT (don't re-fire an in-flight/completed
  // fetch for the same identity on every render). resolvedForRef gates
  // `loading` (has the CURRENT identity's fetch actually settled) — these
  // have to be two separate marks: firedForRef flips the instant the fetch
  // starts, but the fetch is still in flight at that point, so gating
  // `loading` on firedForRef alone would report "done" before the RPC
  // response arrives.
  const firedForRef = useRef<string | null>(null);
  const resolvedForRef = useRef<string | null>(null);

  const loading = Boolean(fetchKey) && resolvedForRef.current !== fetchKey;

  useEffect(() => {
    if (!fetchKey || firedForRef.current === fetchKey) return;
    firedForRef.current = fetchKey;

    setEntry({ key: fetchKey, data: null, error: null });

    (async () => {
      try {
        const request = create(GetMyActiveLobbyRequestSchema, {});
        const response = await lobbyClient.getMyActiveLobby(request);
        // The identity moved on while this was in flight: release the answer
        // rather than publishing the previous world's lobby under the new one.
        if (fetchKeyRef.current !== fetchKey) return;
        setEntry({
          key: fetchKey,
          data: {
            lobbyId: response.lobbyId,
            encounterId: response.encounterId,
            lobbyStatus: response.lobbyStatus,
          },
          error: null,
        });
      } catch (err) {
        if (fetchKeyRef.current !== fetchKey) return;
        setEntry({
          key: fetchKey,
          data: null,
          error:
            err instanceof Error
              ? err
              : new Error('GetMyActiveLobby RPC failed'),
        });
      } finally {
        if (fetchKeyRef.current === fetchKey) resolvedForRef.current = fetchKey;
      }
    })();
  }, [fetchKey]);

  // Associate every published answer with its key so the render that notices
  // a key change cannot expose the previous identity's lobby or error in that
  // pre-effect window.
  const current = entry.key === fetchKey ? entry : null;
  return {
    data: current?.data ?? null,
    loading,
    error: current?.error ?? null,
  };
}
