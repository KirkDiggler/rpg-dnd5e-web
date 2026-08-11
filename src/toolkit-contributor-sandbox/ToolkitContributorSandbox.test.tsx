import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      success: true,
      fieldErrors: [],
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

async function saveTemplate() {
  render(<ToolkitContributorSandbox />);

  const saveButton = screen.getByRole('button', {
    name: /save the compilable subset/i,
  }) as HTMLButtonElement;
  await waitFor(() => expect(saveButton.disabled).toBe(false));
  fireEvent.click(saveButton);
  expect(fighter.authoring.putDungeon).toHaveBeenLastCalledWith(
    expect.objectContaining({
      key: TOOLKIT_SANDBOX_KEY,
      validateOnly: false,
    })
  );

  await waitFor(() => {
    expect(fighter.character.listCharacters).toHaveBeenCalledOnce();
    expect(barbarian.character.listCharacters).toHaveBeenCalledOnce();
  });
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
          ? { success: true, fieldErrors: [] }
          : {
              success: false,
              fieldErrors: [{ message: 'fixed template rejected' }],
            }
      )
    );

    render(<ToolkitContributorSandbox />);
    const saveButton = screen.getByRole('button', {
      name: /save the compilable subset/i,
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
});
