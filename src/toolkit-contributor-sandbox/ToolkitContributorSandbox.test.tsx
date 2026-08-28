import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TOOLKIT_SANDBOX_BARBARIAN,
  TOOLKIT_SANDBOX_FIGHTER,
  TOOLKIT_SANDBOX_KEY,
  type ToolkitSandboxPlayer,
} from './constants';

const hoisted = vi.hoisted(() => ({
  fighter: {
    authoring: { putDungeon: vi.fn() },
    character: { listCharacters: vi.fn() },
    lobby: {
      createLobby: vi.fn(),
      joinLobby: vi.fn(),
      setReady: vi.fn(),
      startEncounter: vi.fn(),
    },
  },
  barbarian: {
    authoring: { putDungeon: vi.fn() },
    character: { listCharacters: vi.fn() },
    lobby: {
      createLobby: vi.fn(),
      joinLobby: vi.fn(),
      setReady: vi.fn(),
      startEncounter: vi.fn(),
    },
  },
}));

vi.mock('./clients', () => ({
  toolkitSandboxClients: hoisted,
}));

import { ToolkitContributorSandbox } from './ToolkitContributorSandbox';

const fighter = hoisted.fighter;
const barbarian = hoisted.barbarian;

function resetClients() {
  for (const client of [fighter, barbarian]) {
    client.authoring.putDungeon.mockReset();
    client.character.listCharacters.mockReset();
    client.lobby.createLobby.mockReset();
    client.lobby.joinLobby.mockReset();
    client.lobby.setReady.mockReset();
    client.lobby.startEncounter.mockReset();
    client.authoring.putDungeon.mockResolvedValue({
      errors: [],
      atlas: undefined,
    });
    client.lobby.setReady.mockResolvedValue({});
    client.lobby.startEncounter.mockResolvedValue({ encounterId: 'enc-1' });
  }

  fighter.character.listCharacters.mockResolvedValue({
    characters: [{ id: 'fighter-char' }],
  });
  barbarian.character.listCharacters.mockResolvedValue({
    characters: [{ id: 'barbarian-char' }],
  });
  fighter.lobby.createLobby.mockResolvedValue({
    lobbyId: 'lobby-1',
    joinRef: 'join-fighter',
  });
  barbarian.lobby.createLobby.mockResolvedValue({
    lobbyId: 'lobby-1',
    joinRef: 'join-barbarian',
  });
  fighter.lobby.joinLobby.mockResolvedValue({ lobbyId: 'lobby-1' });
  barbarian.lobby.joinLobby.mockResolvedValue({ lobbyId: 'lobby-1' });
}

async function clickTemplateSave() {
  const saveButton = screen.getByRole('button', {
    name: /^Save/,
  }) as HTMLButtonElement;
  await waitFor(() => expect(saveButton.disabled).toBe(false));
  fireEvent.click(saveButton);
  expect(fighter.authoring.putDungeon).toHaveBeenLastCalledWith(
    expect.objectContaining({
      key: TOOLKIT_SANDBOX_KEY,
      validateOnly: false,
    })
  );
}

async function saveTemplate() {
  render(<ToolkitContributorSandbox />);
  await clickTemplateSave();

  await waitFor(() => {
    expect(fighter.character.listCharacters).toHaveBeenCalledOnce();
    expect(barbarian.character.listCharacters).toHaveBeenCalledOnce();
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function settleDeferred() {
  await act(async () => {
    await Promise.resolve();
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function chooseParty(
  label: string,
  creator: typeof fighter | typeof barbarian
) {
  const partyButton = screen.getByRole('button', {
    name: label,
  }) as HTMLButtonElement;
  await waitFor(() => expect(partyButton.disabled).toBe(false));
  fireEvent.click(partyButton);
  await waitFor(() => expect(creator.lobby.startEncounter).toHaveBeenCalled());
}

function expectResultLinks(players: readonly ToolkitSandboxPlayer[]) {
  const links = screen.getAllByRole('link');
  expect(links).toHaveLength(players.length);
  expect(links.map((link) => link.getAttribute('href'))).toEqual(
    players.map((player) => `/?playerId=${player}`)
  );
}

beforeEach(() => {
  resetClients();
});

describe('ToolkitContributorSandbox', () => {
  it('saves the fixed dungeon then starts a fighter-only party through only the fighter client', async () => {
    await saveTemplate();
    await chooseParty('Fighter', fighter);

    expect(fighter.lobby.createLobby).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: TOOLKIT_SANDBOX_KEY,
        characterId: 'fighter-char',
      })
    );
    expect(fighter.lobby.setReady).toHaveBeenCalledWith(
      expect.objectContaining({ lobbyId: 'lobby-1', ready: true })
    );
    expect(fighter.lobby.startEncounter).toHaveBeenCalledWith(
      expect.objectContaining({
        lobbyId: 'lobby-1',
        dungeonKey: TOOLKIT_SANDBOX_KEY,
      })
    );
    expect(barbarian.lobby.createLobby).not.toHaveBeenCalled();
    expect(barbarian.lobby.joinLobby).not.toHaveBeenCalled();
    expect(barbarian.lobby.setReady).not.toHaveBeenCalled();
    expectResultLinks([TOOLKIT_SANDBOX_FIGHTER]);
  });

  it('starts a barbarian-only party through only the barbarian client', async () => {
    await saveTemplate();
    await chooseParty('Barbarian', barbarian);

    expect(barbarian.lobby.createLobby).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: TOOLKIT_SANDBOX_KEY,
        characterId: 'barbarian-char',
      })
    );
    expect(barbarian.lobby.setReady).toHaveBeenCalledWith(
      expect.objectContaining({ lobbyId: 'lobby-1', ready: true })
    );
    expect(barbarian.lobby.startEncounter).toHaveBeenCalledWith(
      expect.objectContaining({
        lobbyId: 'lobby-1',
        dungeonKey: TOOLKIT_SANDBOX_KEY,
      })
    );
    expect(fighter.lobby.createLobby).not.toHaveBeenCalled();
    expect(fighter.lobby.joinLobby).not.toHaveBeenCalled();
    expect(fighter.lobby.setReady).not.toHaveBeenCalled();
    expectResultLinks([TOOLKIT_SANDBOX_BARBARIAN]);
  });

  it('runs fighter then barbarian in the fixed create, join, ready, and start sequence', async () => {
    await saveTemplate();
    await chooseParty('Fighter then Barbarian', fighter);

    expect(fighter.character.listCharacters).toHaveBeenCalledOnce();
    expect(barbarian.character.listCharacters).toHaveBeenCalledOnce();
    expect(fighter.lobby.createLobby).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'toolkit-contributor-sandbox',
        characterId: 'fighter-char',
      })
    );
    expect(barbarian.lobby.joinLobby).toHaveBeenCalledWith(
      expect.objectContaining({
        joinRef: 'join-fighter',
        characterId: 'barbarian-char',
      })
    );
    expect(fighter.lobby.setReady).toHaveBeenCalledWith(
      expect.objectContaining({ lobbyId: 'lobby-1', ready: true })
    );
    expect(barbarian.lobby.setReady).toHaveBeenCalledWith(
      expect.objectContaining({ lobbyId: 'lobby-1', ready: true })
    );
    expect(fighter.lobby.startEncounter).toHaveBeenCalledWith(
      expect.objectContaining({
        lobbyId: 'lobby-1',
        dungeonKey: 'toolkit-contributor-sandbox',
      })
    );
    expectResultLinks([TOOLKIT_SANDBOX_FIGHTER, TOOLKIT_SANDBOX_BARBARIAN]);
  });

  it('runs barbarian then fighter in the fixed create, join, ready, and start sequence', async () => {
    await saveTemplate();

    const partyButton = screen.getByRole('button', {
      name: 'Barbarian then Fighter',
    }) as HTMLButtonElement;
    await waitFor(() => expect(partyButton.disabled).toBe(false));
    fireEvent.click(partyButton);
    await waitFor(() =>
      expect(barbarian.lobby.startEncounter).toHaveBeenCalled()
    );

    expect(barbarian.lobby.createLobby).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: TOOLKIT_SANDBOX_KEY,
        characterId: 'barbarian-char',
      })
    );
    expect(fighter.lobby.joinLobby).toHaveBeenCalledWith(
      expect.objectContaining({
        joinRef: 'join-barbarian',
        characterId: 'fighter-char',
      })
    );
    expect(barbarian.lobby.setReady).toHaveBeenCalledWith(
      expect.objectContaining({ lobbyId: 'lobby-1', ready: true })
    );
    expect(fighter.lobby.setReady).toHaveBeenCalledWith(
      expect.objectContaining({ lobbyId: 'lobby-1', ready: true })
    );
    expect(barbarian.lobby.startEncounter).toHaveBeenCalledWith(
      expect.objectContaining({
        lobbyId: 'lobby-1',
        dungeonKey: TOOLKIT_SANDBOX_KEY,
      })
    );
    expectResultLinks([TOOLKIT_SANDBOX_BARBARIAN, TOOLKIT_SANDBOX_FIGHTER]);
  });

  it('surfaces a wrong-owner CreateLobby rejection and stops before ready, start, or a result link', async () => {
    fighter.lobby.createLobby.mockRejectedValue(
      new Error('fighter-char does not belong to toolkit-sandbox-fighter')
    );

    await saveTemplate();
    const partyButton = screen.getByRole('button', {
      name: 'Fighter',
    }) as HTMLButtonElement;
    await waitFor(() => expect(partyButton.disabled).toBe(false));
    fireEvent.click(partyButton);

    await screen.findByText(
      'fighter-char does not belong to toolkit-sandbox-fighter'
    );
    expect(fighter.lobby.setReady).not.toHaveBeenCalled();
    expect(barbarian.lobby.setReady).not.toHaveBeenCalled();
    expect(fighter.lobby.startEncounter).not.toHaveBeenCalled();
    expect(barbarian.lobby.startEncounter).not.toHaveBeenCalled();
    expect(partyButton.disabled).toBe(true);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('leaves every party choice disabled when either fixed character list is not exactly one character', async () => {
    fighter.character.listCharacters.mockResolvedValue({ characters: [] });

    await saveTemplate();

    await screen.findByText('Expected exactly one fighter character.');
    expect(
      (screen.getByRole('button', { name: 'Fighter' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Barbarian then Fighter',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it('keeps party choices disabled when the template save receives validation errors', async () => {
    fighter.authoring.putDungeon.mockImplementation((request) =>
      Promise.resolve(
        request.validateOnly
          ? { errors: [], atlas: undefined }
          : {
              atlas: undefined,
              errors: [{ path: 'key', message: 'fixed template rejected' }],
            }
      )
    );

    render(<ToolkitContributorSandbox />);
    const saveButton = screen.getByRole('button', {
      name: /^Save/,
    }) as HTMLButtonElement;
    await waitFor(() => expect(saveButton.disabled).toBe(false));
    fireEvent.click(saveButton);

    await screen.findByText('fixed template rejected');
    expect(fighter.character.listCharacters).not.toHaveBeenCalled();
    expect(barbarian.character.listCharacters).not.toHaveBeenCalled();
    expect(
      (screen.getByRole('button', { name: 'Fighter' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it('stops a two-player party after JoinLobby rejects', async () => {
    barbarian.lobby.joinLobby.mockRejectedValue(new Error('join refused'));

    await saveTemplate();
    const partyButton = screen.getByRole('button', {
      name: 'Fighter then Barbarian',
    }) as HTMLButtonElement;
    await waitFor(() => expect(partyButton.disabled).toBe(false));
    fireEvent.click(partyButton);

    await screen.findByText('join refused');
    expect(fighter.lobby.setReady).not.toHaveBeenCalled();
    expect(barbarian.lobby.setReady).not.toHaveBeenCalled();
    expect(fighter.lobby.startEncounter).not.toHaveBeenCalled();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('waits for a successful save callback before listing and ignores a stale list completion after a newer save', async () => {
    const persisted = deferred<{ errors: never[]; atlas: undefined }>();
    const staleFighterList = deferred<{ characters: Array<{ id: string }> }>();
    fighter.authoring.putDungeon.mockImplementation((request) =>
      request.validateOnly
        ? Promise.resolve({ errors: [], atlas: undefined })
        : persisted.promise
    );
    fighter.character.listCharacters
      .mockImplementationOnce(() => staleFighterList.promise)
      .mockResolvedValue({ characters: [{ id: 'fighter-char' }] });

    render(<ToolkitContributorSandbox />);
    await clickTemplateSave();
    expect(fighter.character.listCharacters).not.toHaveBeenCalled();

    await act(async () => {
      persisted.resolve({ errors: [], atlas: undefined });
      await persisted.promise;
    });
    await waitFor(() =>
      expect(fighter.character.listCharacters).toHaveBeenCalledOnce()
    );
    expect(barbarian.character.listCharacters).not.toHaveBeenCalled();

    await clickTemplateSave();
    await waitFor(() => {
      expect(fighter.character.listCharacters).toHaveBeenCalledTimes(2);
      expect(barbarian.character.listCharacters).toHaveBeenCalledOnce();
      expect(
        (screen.getByRole('button', { name: 'Fighter' }) as HTMLButtonElement)
          .disabled
      ).toBe(false);
    });

    await act(async () => {
      staleFighterList.resolve({ characters: [{ id: 'stale-fighter-char' }] });
      await staleFighterList.promise;
    });
    await settleDeferred();

    expect(barbarian.character.listCharacters).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('makes a stale in-flight lobby success inert after a newer successful save callback', async () => {
    const staleCreate = deferred<{ lobbyId: string; joinRef: string }>();
    fighter.lobby.createLobby.mockImplementationOnce(() => staleCreate.promise);

    await saveTemplate();
    const partyButton = screen.getByRole('button', {
      name: 'Fighter',
    }) as HTMLButtonElement;
    fireEvent.click(partyButton);
    expect(fighter.lobby.createLobby).toHaveBeenCalledOnce();

    await clickTemplateSave();
    await waitFor(() => {
      expect(fighter.character.listCharacters).toHaveBeenCalledTimes(2);
      expect(barbarian.character.listCharacters).toHaveBeenCalledTimes(2);
      expect(partyButton.disabled).toBe(false);
    });

    await act(async () => {
      staleCreate.resolve({ lobbyId: 'stale-lobby', joinRef: 'stale-join' });
      await staleCreate.promise;
    });
    await settleDeferred();

    expect(fighter.lobby.setReady).not.toHaveBeenCalled();
    expect(fighter.lobby.startEncounter).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('ignores a stale in-flight lobby rejection after a newer successful save callback', async () => {
    const staleCreate = deferred<{ lobbyId: string; joinRef: string }>();
    fighter.lobby.createLobby.mockImplementationOnce(() => staleCreate.promise);

    await saveTemplate();
    fireEvent.click(screen.getByRole('button', { name: 'Fighter' }));
    await waitFor(() => expect(fighter.lobby.createLobby).toHaveBeenCalled());

    await clickTemplateSave();
    await waitFor(() =>
      expect(fighter.character.listCharacters).toHaveBeenCalledTimes(2)
    );

    await act(async () => {
      staleCreate.reject(new Error('stale create rejected'));
      try {
        await staleCreate.promise;
      } catch {
        // The component is responsible for ignoring this stale rejection.
      }
    });
    await settleDeferred();

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('does not start competing lobbies for rapid double party activation', async () => {
    const create = deferred<{ lobbyId: string; joinRef: string }>();
    fighter.lobby.createLobby.mockImplementation(() => create.promise);

    await saveTemplate();
    const partyButton = screen.getByRole('button', {
      name: 'Fighter',
    }) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(partyButton);
      fireEvent.click(partyButton);
    });

    expect(fighter.lobby.createLobby).toHaveBeenCalledOnce();
    expect(fighter.lobby.setReady).not.toHaveBeenCalled();
    expect(fighter.lobby.startEncounter).not.toHaveBeenCalled();
  });

  it('stops after SetReady rejects and renders no result link', async () => {
    fighter.lobby.setReady.mockRejectedValue(
      new Error('fighter ready rejected')
    );

    await saveTemplate();
    fireEvent.click(screen.getByRole('button', { name: 'Fighter' }));

    await screen.findByText('fighter ready rejected');
    expect(fighter.lobby.startEncounter).not.toHaveBeenCalled();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('stops after StartEncounter rejects and renders no result link', async () => {
    fighter.lobby.startEncounter.mockRejectedValue(
      new Error('fighter start rejected')
    );

    await saveTemplate();
    fireEvent.click(screen.getByRole('button', { name: 'Fighter' }));

    await screen.findByText('fighter start rejected');
    expect(fighter.lobby.setReady).toHaveBeenCalledOnce();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('awaits each cross-client two-seat boundary in temporal order', async () => {
    const created = deferred<{ lobbyId: string; joinRef: string }>();
    const joined = deferred<{ lobbyId: string }>();
    const fighterReady = deferred<Record<string, never>>();
    const barbarianReady = deferred<Record<string, never>>();
    const started = deferred<{ encounterId: string }>();
    fighter.lobby.createLobby.mockImplementation(() => created.promise);
    barbarian.lobby.joinLobby.mockImplementation(() => joined.promise);
    fighter.lobby.setReady.mockImplementation(() => fighterReady.promise);
    barbarian.lobby.setReady.mockImplementation(() => barbarianReady.promise);
    fighter.lobby.startEncounter.mockImplementation(() => started.promise);

    await saveTemplate();
    fireEvent.click(
      screen.getByRole('button', { name: 'Fighter then Barbarian' })
    );
    expect(fighter.lobby.createLobby).toHaveBeenCalledOnce();
    expect(barbarian.lobby.joinLobby).not.toHaveBeenCalled();

    await act(async () => {
      created.resolve({ lobbyId: 'lobby-1', joinRef: 'join-fighter' });
      await created.promise;
    });
    await waitFor(() =>
      expect(barbarian.lobby.joinLobby).toHaveBeenCalledOnce()
    );
    expect(fighter.lobby.setReady).not.toHaveBeenCalled();

    await act(async () => {
      joined.resolve({ lobbyId: 'lobby-1' });
      await joined.promise;
    });
    await waitFor(() => expect(fighter.lobby.setReady).toHaveBeenCalledOnce());
    expect(barbarian.lobby.setReady).not.toHaveBeenCalled();

    await act(async () => {
      fighterReady.resolve({});
      await fighterReady.promise;
    });
    await waitFor(() =>
      expect(barbarian.lobby.setReady).toHaveBeenCalledOnce()
    );
    expect(fighter.lobby.startEncounter).not.toHaveBeenCalled();

    await act(async () => {
      barbarianReady.resolve({});
      await barbarianReady.promise;
    });
    await waitFor(() =>
      expect(fighter.lobby.startEncounter).toHaveBeenCalledOnce()
    );

    await act(async () => {
      started.resolve({ encounterId: 'enc-1' });
      await started.promise;
    });
    await waitFor(() =>
      expectResultLinks([TOOLKIT_SANDBOX_FIGHTER, TOOLKIT_SANDBOX_BARBARIAN])
    );

    expect(fighter.lobby.createLobby.mock.invocationCallOrder[0]).toBeLessThan(
      barbarian.lobby.joinLobby.mock.invocationCallOrder[0]
    );
    expect(barbarian.lobby.joinLobby.mock.invocationCallOrder[0]).toBeLessThan(
      fighter.lobby.setReady.mock.invocationCallOrder[0]
    );
    expect(fighter.lobby.setReady.mock.invocationCallOrder[0]).toBeLessThan(
      barbarian.lobby.setReady.mock.invocationCallOrder[0]
    );
    expect(barbarian.lobby.setReady.mock.invocationCallOrder[0]).toBeLessThan(
      fighter.lobby.startEncounter.mock.invocationCallOrder[0]
    );
  });

  it('ignores a late successful save callback after the sandbox unmounts', async () => {
    const persisted = deferred<{ errors: never[]; atlas: undefined }>();
    fighter.authoring.putDungeon.mockImplementation((request) =>
      request.validateOnly
        ? Promise.resolve({ errors: [], atlas: undefined })
        : persisted.promise
    );

    const { unmount } = render(<ToolkitContributorSandbox />);
    await clickTemplateSave();
    expect(fighter.character.listCharacters).not.toHaveBeenCalled();
    expect(barbarian.character.listCharacters).not.toHaveBeenCalled();

    unmount();
    await act(async () => {
      persisted.resolve({ errors: [], atlas: undefined });
      await persisted.promise;
    });
    await settleDeferred();

    expect(fighter.character.listCharacters).not.toHaveBeenCalled();
    expect(barbarian.character.listCharacters).not.toHaveBeenCalled();
  });
});
