/**
 * The seat is visible (rpg-project#548): a refused launch or a live seat read
 * on load shows "<Character> is still in another run." with an Abandon run
 * button. Exit runs only on that click; a launch refusal relaunches once.
 */
import { Code, ConnectError } from '@connectrpc/connect';
import type {
  HostChanged,
  LobbySnapshot,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/events_pb';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  startEncounterFn: vi.fn(),
  getSeatFn: vi.fn(),
  exitFn: vi.fn(),
}));

vi.mock('../../api/client', () => ({
  sessionClient: { getSeat: hoisted.getSeatFn, exit: hoisted.exitFn },
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
    dungeons: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
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
      if (!lobbyId) return;
      optionsRef.current.onSnapshot?.({
        members: [
          {
            playerId: 'alice',
            characterId: 'char-1',
            characterName: 'Alice',
            isHost: true,
            isReady: true,
            isConnected: true,
          },
        ],
      } as LobbySnapshot);
      optionsRef.current.onHostChanged?.({ playerId: 'alice' } as HostChanged);
    }, [lobbyId]);
    return { connectionState: 'connected' as const, error: null };
  },
}));

import { LobbyFlow } from './LobbyFlow';

const REFUSAL = new ConnectError(
  'a party character is seated in another run: launch session "new-1": launch: character "char-1" is seated in session "run-7": live',
  Code.FailedPrecondition
);

function renderLobby(onEncounterStarted = vi.fn()) {
  render(
    <LobbyFlow
      playerId="alice"
      characterId="char-1"
      onEncounterStarted={onEncounterStarted}
      onBack={vi.fn()}
      initialLobbyId="lobby-1"
    />
  );
  return onEncounterStarted;
}

beforeEach(() => {
  hoisted.startEncounterFn.mockReset();
  hoisted.getSeatFn.mockReset();
  hoisted.exitFn.mockReset();
  hoisted.getSeatFn.mockRejectedValue(
    new ConnectError('no seat', Code.NotFound)
  );
});

describe('LobbyFlow — seated in another run', () => {
  it('a refused launch shows the notice and Abandon run', async () => {
    hoisted.startEncounterFn.mockRejectedValueOnce(REFUSAL);
    renderLobby();

    fireEvent.click(await screen.findByTestId('start-encounter-button'));

    await screen.findByText('Alice is still in another run.');
    screen.getByRole('button', { name: 'Abandon run' });
    expect(hoisted.exitFn).not.toHaveBeenCalled();
  });

  it('clicking Abandon run exits the seat, then relaunches once', async () => {
    hoisted.startEncounterFn
      .mockRejectedValueOnce(REFUSAL)
      .mockResolvedValueOnce({ encounterId: 'enc-2' });
    hoisted.exitFn.mockResolvedValue({});
    const started = renderLobby();

    fireEvent.click(await screen.findByTestId('start-encounter-button'));
    fireEvent.click(await screen.findByRole('button', { name: 'Abandon run' }));

    await waitFor(() =>
      expect(started).toHaveBeenCalledWith('enc-2', 'char-1')
    );
    expect(hoisted.exitFn).toHaveBeenCalledWith({
      session: 'run-7',
      member: 'char-1',
    });
    expect(hoisted.startEncounterFn).toHaveBeenCalledTimes(2);
  });

  it('an Exit failure shows its text and does not relaunch', async () => {
    hoisted.startEncounterFn.mockRejectedValueOnce(REFUSAL);
    hoisted.exitFn.mockRejectedValue(new Error('exit refused: run is busy'));
    renderLobby();

    fireEvent.click(await screen.findByTestId('start-encounter-button'));
    fireEvent.click(await screen.findByRole('button', { name: 'Abandon run' }));

    await screen.findByText('exit refused: run is busy');
    expect(hoisted.startEncounterFn).toHaveBeenCalledTimes(1);
  });

  it('a seat on load shows the notice, and Abandon only exits', async () => {
    hoisted.getSeatFn.mockResolvedValue({ session: 'run-3' });
    hoisted.exitFn.mockResolvedValue({});
    renderLobby();

    fireEvent.click(await screen.findByRole('button', { name: 'Abandon run' }));

    await waitFor(() =>
      expect(hoisted.exitFn).toHaveBeenCalledWith({
        session: 'run-3',
        member: 'char-1',
      })
    );
    expect(hoisted.startEncounterFn).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('seat-notice')).toBeNull());
  });

  it('NotFound on load shows nothing and never calls Exit', async () => {
    renderLobby();
    await waitFor(() => expect(hoisted.getSeatFn).toHaveBeenCalled());
    expect(screen.queryByTestId('seat-notice')).toBeNull();
    expect(hoisted.exitFn).not.toHaveBeenCalled();
  });

  it('a refusal that does not parse falls back to GetSeat', async () => {
    hoisted.startEncounterFn.mockRejectedValueOnce(
      new ConnectError(
        'a character is seated elsewhere',
        Code.FailedPrecondition
      )
    );
    renderLobby();
    await waitFor(() => expect(hoisted.getSeatFn).toHaveBeenCalledTimes(1));
    hoisted.getSeatFn.mockResolvedValue({ session: 'run-9' });

    fireEvent.click(await screen.findByTestId('start-encounter-button'));

    await screen.findByRole('button', { name: 'Abandon run' });
    expect(hoisted.getSeatFn).toHaveBeenCalledTimes(2);
  });
});
