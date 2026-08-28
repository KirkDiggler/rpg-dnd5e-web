import { create } from '@bufbuild/protobuf';
import { StreamLobbyRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { useEffect, useRef, useState } from 'react';
import { lobbyClient } from './client';

export interface UseLobbyCharacterIdResult {
  characterId: string | undefined;
  loading: boolean;
  error: Error | null;
}

interface LobbyCharacterState extends UseLobbyCharacterIdResult {
  scopeKey: string;
}

/**
 * Recovers the authenticated player's character id from the lobby snapshot
 * retained beside a running encounter. GetMyActiveLobby identifies the lobby
 * and encounter; StreamLobby's first snapshot remains the authoritative
 * player-to-character seat mapping. The stream is closed immediately after
 * that one snapshot because the running session owns all later gameplay.
 */
export function useLobbyCharacterId(
  lobbyId: string,
  playerId: string
): UseLobbyCharacterIdResult {
  const scopeKey = `${lobbyId}\u0000${playerId}`;
  const ready = Boolean(lobbyId && playerId);
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const [state, setState] = useState<LobbyCharacterState>(() => ({
    scopeKey,
    characterId: undefined,
    loading: ready,
    error: null,
  }));

  useEffect(() => {
    const controller = new AbortController();
    setState({
      scopeKey,
      characterId: undefined,
      loading: ready,
      error: null,
    });
    if (!ready) return () => controller.abort();

    const isCurrent = () =>
      scopeRef.current === scopeKey && !controller.signal.aborted;

    void (async () => {
      try {
        const request = create(StreamLobbyRequestSchema, { lobbyId });
        const stream = lobbyClient.streamLobby(request, {
          signal: controller.signal,
        });
        for await (const event of stream) {
          if (event.event.case !== 'snapshot') {
            throw new Error(
              'lobby resume stream did not begin with a snapshot'
            );
          }
          const member = event.event.value.members.find(
            (candidate) => candidate.playerId === playerId
          );
          if (!member?.characterId) {
            throw new Error(
              'authenticated player has no lobby seat with a character'
            );
          }
          if (!isCurrent()) return;
          setState({
            scopeKey,
            characterId: member.characterId,
            loading: false,
            error: null,
          });
          controller.abort();
          return;
        }
        throw new Error('lobby resume stream ended before its snapshot');
      } catch (cause) {
        if (controller.signal.aborted) return;
        const error =
          cause instanceof Error
            ? cause
            : new Error('failed to recover the lobby character');
        if (!isCurrent()) return;
        setState({
          scopeKey,
          characterId: undefined,
          loading: false,
          error,
        });
      }
    })();

    return () => controller.abort();
  }, [lobbyId, playerId, ready, scopeKey]);

  if (state.scopeKey !== scopeKey) {
    return { characterId: undefined, loading: ready, error: null };
  }
  return {
    characterId: state.characterId,
    loading: state.loading,
    error: state.error,
  };
}
