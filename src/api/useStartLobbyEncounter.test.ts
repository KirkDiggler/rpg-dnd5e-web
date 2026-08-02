import type { StartEncounterResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  startEncounterFn: vi.fn<() => Promise<StartEncounterResponse>>(),
}));

vi.mock('./client', () => ({
  lobbyClient: {
    startEncounter: hoisted.startEncounterFn,
  },
}));

// Import AFTER vi.mock so the mock is applied
import { useStartLobbyEncounter } from './useStartLobbyEncounter';

beforeEach(() => {
  hoisted.startEncounterFn.mockReset();
});

describe('useStartLobbyEncounter', () => {
  it('sends the chosen dungeonKey on StartEncounterRequest.dungeon_key', async () => {
    hoisted.startEncounterFn.mockResolvedValue({
      encounterId: 'enc-1',
    } as StartEncounterResponse);

    const { result } = renderHook(() => useStartLobbyEncounter());

    await act(async () => {
      await result.current.startEncounter({
        lobbyId: 'lobby-1',
        dungeonKey: 'reference-tomb',
      });
    });

    expect(hoisted.startEncounterFn).toHaveBeenCalledWith(
      expect.objectContaining({
        lobbyId: 'lobby-1',
        dungeonKey: 'reference-tomb',
      })
    );
  });

  it('sends an empty dungeon_key when none is selected — server falls back to its own caller->env->default precedence, unchanged', async () => {
    hoisted.startEncounterFn.mockResolvedValue({
      encounterId: 'enc-1',
    } as StartEncounterResponse);

    const { result } = renderHook(() => useStartLobbyEncounter());

    await act(async () => {
      await result.current.startEncounter({ lobbyId: 'lobby-1' });
    });

    expect(hoisted.startEncounterFn).toHaveBeenCalledWith(
      expect.objectContaining({ lobbyId: 'lobby-1', dungeonKey: '' })
    );
  });
});
