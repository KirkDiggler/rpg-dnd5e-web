import { create } from '@bufbuild/protobuf';
import {
  LobbyEventSchema,
  LobbySnapshotSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/events_pb';
import { LobbyMemberSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/types_pb';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  streamLobbyFn: vi.fn(),
}));

vi.mock('./client', () => ({
  lobbyClient: {
    streamLobby: hoisted.streamLobbyFn,
  },
}));

import { useLobbyCharacterId } from './useLobbyCharacterId';

const snapshotStream = (
  members: Array<{ playerId: string; characterId: string }>
) => ({
  [Symbol.asyncIterator]: async function* () {
    yield create(LobbyEventSchema, {
      event: {
        case: 'snapshot',
        value: create(LobbySnapshotSchema, {
          members: members.map((member) =>
            create(LobbyMemberSchema, {
              ...member,
              characterName: member.characterId,
            })
          ),
        }),
      },
    });
  },
});

beforeEach(() => {
  hoisted.streamLobbyFn.mockReset();
});

describe('useLobbyCharacterId', () => {
  it('does not open a lobby stream without a resumable lobby and player', () => {
    renderHook(() => useLobbyCharacterId('', 'alice'));
    expect(hoisted.streamLobbyFn).not.toHaveBeenCalled();
  });

  it('recovers the authenticated players character from the authoritative lobby snapshot', async () => {
    hoisted.streamLobbyFn.mockReturnValue(
      snapshotStream([
        { playerId: 'bob', characterId: 'char-bob' },
        { playerId: 'alice', characterId: 'char-alice' },
      ])
    );

    const { result } = renderHook(() =>
      useLobbyCharacterId('lobby-1', 'alice')
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.characterId).toBe('char-alice');
    expect(result.current.error).toBeNull();
    expect(hoisted.streamLobbyFn).toHaveBeenCalledWith(
      expect.objectContaining({ lobbyId: 'lobby-1' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('reports an honest error when the authenticated player has no lobby seat', async () => {
    hoisted.streamLobbyFn.mockReturnValue(
      snapshotStream([{ playerId: 'bob', characterId: 'char-bob' }])
    );

    const { result } = renderHook(() =>
      useLobbyCharacterId('lobby-1', 'alice')
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.characterId).toBeUndefined();
    expect(result.current.error?.message).toContain(
      'authenticated player has no lobby seat'
    );
  });
});
