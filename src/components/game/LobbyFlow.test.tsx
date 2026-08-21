/**
 * Covers the S3 dungeon-picker slice of LobbyFlow (rpg-project#131): the
 * picker is host-only, and starting the encounter carries the selected key
 * on StartEncounterRequest.dungeon_key. Everything else LobbyFlow does
 * (create/join, ready-up, streaming) is exercised elsewhere / by the live
 * walk — this file mocks the API hooks at the module boundary rather than
 * re-deriving StreamLobby's wire behavior.
 */
import type {
  HostChanged,
  LobbySnapshot,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/events_pb';
import type { DungeonSummary } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  startEncounterFn: vi.fn(async () => ({ encounterId: 'enc-1' }) as never),
  hostPlayerId: null as string | null,
  dungeonsError: null as Error | null,
  refetchDungeonsFn: vi.fn(),
}));

vi.mock('../../api/useCreateLobby', () => ({
  useCreateLobby: () => ({ createLobby: vi.fn(), loading: false }),
}));
vi.mock('../../api/useJoinLobby', () => ({
  useJoinLobby: () => ({ joinLobby: vi.fn(), loading: false }),
}));
vi.mock('../../api/useSetLobbyReady', () => ({
  useSetLobbyReady: () => ({ setReady: vi.fn(), loading: false }),
}));
vi.mock('../../api/useStartLobbyEncounter', () => ({
  useStartLobbyEncounter: () => ({
    startEncounter: hoisted.startEncounterFn,
    loading: false,
    error: null,
  }),
}));
vi.mock('../../api/useListDungeons', () => ({
  useListDungeons: () => ({
    dungeons: [
      { key: 'reference-tomb', name: 'The Reference Tomb' },
      { key: 'smoke-test', name: 'Smoke Test' },
    ] as DungeonSummary[],
    loading: false,
    error: hoisted.dungeonsError,
    refetch: hoisted.refetchDungeonsFn,
  }),
}));
// A minimal stand-in for the real streaming hook: seeds a single ready,
// connected member (the host, when configured) via the same
// onSnapshot/onHostChanged callbacks the real StreamLobby dispatch uses, so
// LobbyFlow's isHost/allReady gates land in the state this test needs
// without reimplementing StreamLobby's wire contract.
vi.mock('../../api/useLobbyStream', () => ({
  useLobbyStream: (
    lobbyId: string | null,
    options: {
      onSnapshot?: (e: LobbySnapshot) => void;
      onHostChanged?: (e: HostChanged) => void;
    }
  ) => {
    const optionsRef = useRef(options);
    optionsRef.current = options;
    useEffect(() => {
      if (!lobbyId || !hoisted.hostPlayerId) return;
      const playerId = hoisted.hostPlayerId;
      optionsRef.current.onSnapshot?.({
        members: [
          {
            playerId,
            characterId: 'char-1',
            characterName: 'Alice',
            isHost: true,
            isReady: true,
            isConnected: true,
          },
        ],
      } as LobbySnapshot);
      optionsRef.current.onHostChanged?.({ playerId } as HostChanged);
       
    }, [lobbyId]);
    return { connectionState: 'connected' as const, error: null };
  },
}));

import { LobbyFlow } from './LobbyFlow';

beforeEach(() => {
  hoisted.startEncounterFn.mockClear();
  hoisted.hostPlayerId = null;
  hoisted.dungeonsError = null;
  hoisted.refetchDungeonsFn.mockClear();
});

describe('LobbyFlow — dungeon picker (rpg-project#131)', () => {
  it('does not render the dungeon picker for a non-host member', () => {
    // No host configured -- playerId 'alice' never becomes host, matching
    // a member who joined someone else's lobby.
    render(
      <LobbyFlow
        playerId="alice"
        onEncounterStarted={vi.fn()}
        onBack={vi.fn()}
        initialLobbyId="lobby-1"
      />
    );

    expect(screen.queryByTestId('dungeon-picker')).toBeNull();
    expect(screen.queryByTestId('start-encounter-button')).toBeNull();
  });

  it('host sees the dungeon picker, and starting the encounter sends the selected key on dungeon_key', () => {
    hoisted.hostPlayerId = 'alice';

    render(
      <LobbyFlow
        playerId="alice"
        onEncounterStarted={vi.fn()}
        onBack={vi.fn()}
        initialLobbyId="lobby-1"
      />
    );

    screen.getByTestId('dungeon-picker');

    fireEvent.click(screen.getByRole('button', { name: /choose a dungeon/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Smoke Test' }));

    fireEvent.click(screen.getByTestId('start-encounter-button'));

    expect(hoisted.startEncounterFn).toHaveBeenCalledWith({
      lobbyId: 'lobby-1',
      dungeonKey: 'smoke-test',
    });
  });

  it('starting without picking a dungeon sends an empty dungeon_key — server keeps its own default precedence', () => {
    hoisted.hostPlayerId = 'alice';

    render(
      <LobbyFlow
        playerId="alice"
        onEncounterStarted={vi.fn()}
        onBack={vi.fn()}
        initialLobbyId="lobby-1"
      />
    );

    fireEvent.click(screen.getByTestId('start-encounter-button'));

    expect(hoisted.startEncounterFn).toHaveBeenCalledWith({
      lobbyId: 'lobby-1',
      dungeonKey: '',
    });
  });

  it('shows an inline error with retry when ListDungeons fails, instead of a silently-empty picker', () => {
    hoisted.hostPlayerId = 'alice';
    hoisted.dungeonsError = new Error('ListDungeons RPC failed');

    render(
      <LobbyFlow
        playerId="alice"
        onEncounterStarted={vi.fn()}
        onBack={vi.fn()}
        initialLobbyId="lobby-1"
      />
    );

    // The picker itself must not render empty/blank -- that's
    // indistinguishable from "no dungeons authored".
    expect(screen.queryByTestId('dungeon-picker')).toBeNull();
    screen.getByText('ListDungeons RPC failed');

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(hoisted.refetchDungeonsFn).toHaveBeenCalledOnce();
  });

  it('Start still works with the empty-key server default while ListDungeons is erroring', () => {
    hoisted.hostPlayerId = 'alice';
    hoisted.dungeonsError = new Error('ListDungeons RPC failed');

    render(
      <LobbyFlow
        playerId="alice"
        onEncounterStarted={vi.fn()}
        onBack={vi.fn()}
        initialLobbyId="lobby-1"
      />
    );

    fireEvent.click(screen.getByTestId('start-encounter-button'));

    expect(hoisted.startEncounterFn).toHaveBeenCalledWith({
      lobbyId: 'lobby-1',
      dungeonKey: '',
    });
  });
});

describe('LobbyFlow — the seat survives resume (web#762 slice 1)', () => {
  it('reports the roster character id with the encounter start when mounted without a characterId prop', async () => {
    hoisted.hostPlayerId = 'alice';
    const onEncounterStarted = vi.fn();

    render(
      <LobbyFlow
        playerId="alice"
        onEncounterStarted={onEncounterStarted}
        onBack={vi.fn()}
        initialLobbyId="lobby-1"
      />
    );

    fireEvent.click(screen.getByTestId('start-encounter-button'));
    await vi.waitFor(() =>
      expect(onEncounterStarted).toHaveBeenCalledWith('enc-1', 'char-1')
    );
  });
});
