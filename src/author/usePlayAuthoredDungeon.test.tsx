/**
 * Deferred-promise proof for the shared launch hook: the real
 * createLobby → setReady → StartEncounter sequence in order, the
 * monotonic fencing that retires stale launches (identity change,
 * unmount, A→B→A resurrection), the duplicate-launch latch, and
 * phase-named failures. No test asserts hook names — every case drives
 * real awaited RPC promises and observes actual calls and state.
 */
import type {
  CreateLobbyResponse,
  StartEncounterResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const makeDeferred = <T,>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
  } => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
  return {
    createLobby: makeDeferred<CreateLobbyResponse>(),
    setReady: makeDeferred<void>(),
    startEncounter: makeDeferred<StartEncounterResponse>(),
    calls: {
      createLobby: [] as Array<{ campaignId: string; characterId: string }>,
      setReady: [] as Array<{ lobbyId: string; ready: boolean }>,
      startEncounter: [] as Array<{ lobbyId: string; dungeonKey?: string }>,
    },
    /** Fresh pending promises per test — a resolved deferred must never
     * leak into the next case's "in flight" window. */
    reset: () => {
      hoisted.createLobby = makeDeferred<CreateLobbyResponse>();
      hoisted.setReady = makeDeferred<void>();
      hoisted.startEncounter = makeDeferred<StartEncounterResponse>();
      hoisted.calls.createLobby.length = 0;
      hoisted.calls.setReady.length = 0;
      hoisted.calls.startEncounter.length = 0;
    },
    /** Replace only the deferreds mid-test (after a rejection, a retry
     * needs an actually-answering server) while keeping the call log. */
    freshPromises: () => {
      hoisted.createLobby = makeDeferred<CreateLobbyResponse>();
      hoisted.setReady = makeDeferred<void>();
      hoisted.startEncounter = makeDeferred<StartEncounterResponse>();
    },
  };
});

vi.mock('@/api/useCreateLobby', () => ({
  useCreateLobby: () => ({
    createLobby: vi.fn(
      async (input: { campaignId: string; characterId: string }) => {
        hoisted.calls.createLobby.push(input);
        return hoisted.createLobby.promise;
      }
    ),
    loading: false,
    error: null,
  }),
}));

vi.mock('@/api/useSetLobbyReady', () => ({
  useSetLobbyReady: () => ({
    setReady: vi.fn(async (input: { lobbyId: string; ready: boolean }) => {
      hoisted.calls.setReady.push(input);
      return hoisted.setReady.promise;
    }),
    loading: false,
    error: null,
  }),
}));

vi.mock('@/api/useStartLobbyEncounter', () => ({
  useStartLobbyEncounter: () => ({
    startEncounter: vi.fn(
      async (input: { lobbyId: string; dungeonKey?: string }) => {
        hoisted.calls.startEncounter.push(input);
        return hoisted.startEncounter.promise;
      }
    ),
    loading: false,
    error: null,
  }),
}));

import { usePlayAuthoredDungeon } from './usePlayAuthoredDungeon';

const lobbyResponse = {
  lobbyId: 'lobby-1',
  joinRef: 'join-1',
  hostPlayerId: 'player-1',
} as unknown as CreateLobbyResponse;
const startedResponse = {
  encounterId: 'enc-9',
} as unknown as StartEncounterResponse;

const settleAll = async () => {
  await act(async () => {
    hoisted.createLobby.resolve(lobbyResponse);
    hoisted.setReady.resolve(undefined as never);
    hoisted.startEncounter.resolve(startedResponse);
  });
};

beforeEach(() => {
  hoisted.reset();
});

describe('usePlayAuthoredDungeon', () => {
  it('runs the exact shared lobby sequence and hands the encounter id to onPlay', async () => {
    const onPlay = vi.fn();
    const { result } = renderHook(() =>
      usePlayAuthoredDungeon({ characterId: 'char-1', onPlay })
    );

    let settled: boolean | undefined;
    await act(async () => {
      void result.current.play('dungeon-key-1').then((ok) => {
        settled = ok;
      });
    });

    await waitFor(() =>
      expect(hoisted.calls.createLobby).toEqual([
        { campaignId: 'default-campaign', characterId: 'char-1' },
      ])
    );
    expect(result.current.phase).toBe('create-lobby');
    expect(result.current.launching).toBe(true);

    await act(async () => {
      hoisted.createLobby.resolve(lobbyResponse);
    });
    await waitFor(() =>
      expect(hoisted.calls.setReady).toEqual([
        { lobbyId: 'lobby-1', ready: true },
      ])
    );
    expect(result.current.phase).toBe('ready');

    await act(async () => {
      hoisted.setReady.resolve(undefined as never);
    });
    await waitFor(() =>
      expect(hoisted.calls.startEncounter).toEqual([
        { lobbyId: 'lobby-1', dungeonKey: 'dungeon-key-1' },
      ])
    );
    expect(result.current.phase).toBe('start-encounter');

    await act(async () => {
      hoisted.startEncounter.resolve(startedResponse);
    });
    await waitFor(() => expect(settled).toBe(true));
    expect(onPlay).toHaveBeenCalledWith('enc-9', 'char-1');
    expect(result.current.launching).toBe(false);
    expect(result.current.phase).toBeNull();
  });

  it('refuses to launch without a character and calls nothing', async () => {
    const onPlay = vi.fn();
    const { result } = renderHook(() =>
      usePlayAuthoredDungeon({ characterId: null, onPlay })
    );

    let settled: boolean | undefined;
    await act(async () => {
      settled = await result.current.play('dungeon-key-1');
    });

    expect(settled).toBe(false);
    expect(hoisted.calls.createLobby).toEqual([]);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('blocks a duplicate launch while one is in flight and produces one transaction', async () => {
    const onPlay = vi.fn();
    const { result } = renderHook(() =>
      usePlayAuthoredDungeon({ characterId: 'char-1', onPlay })
    );

    await act(async () => {
      void result.current.play('dungeon-key-1');
    });
    await waitFor(() => expect(hoisted.calls.createLobby).toHaveLength(1));

    let duplicate: boolean | undefined;
    await act(async () => {
      duplicate = await result.current.play('dungeon-key-1');
    });
    expect(duplicate).toBe(false);
    expect(hoisted.calls.createLobby).toHaveLength(1);

    await settleAll();
    await waitFor(() => expect(onPlay).toHaveBeenCalledTimes(1));
  });

  it.each(['create-lobby', 'ready', 'start-encounter'] as const)(
    'a failure at the %s seam names it, stays in the editor and allows a retry',
    async (seam) => {
      const onPlay = vi.fn();
      const { result } = renderHook(() =>
        usePlayAuthoredDungeon({ characterId: 'char-1', onPlay })
      );

      await act(async () => {
        void result.current.play('dungeon-key-1');
      });
      await waitFor(() => expect(hoisted.calls.createLobby).toHaveLength(1));
      if (seam === 'create-lobby') {
        await act(async () => {
          hoisted.createLobby.reject(new Error('server down'));
        });
      } else {
        await act(async () => {
          hoisted.createLobby.resolve(lobbyResponse);
        });
        await waitFor(() => expect(hoisted.calls.setReady).toHaveLength(1));
        await act(async () => {
          if (seam === 'ready')
            hoisted.setReady.reject(new Error('not permitted'));
          else hoisted.setReady.resolve(undefined as never);
        });
      }
      if (seam === 'start-encounter') {
        await waitFor(() =>
          expect(hoisted.calls.startEncounter).toHaveLength(1)
        );
        await act(async () => {
          hoisted.startEncounter.reject(new Error('capacity full'));
        });
      }

      await waitFor(() => expect(result.current.error).toBeTruthy());
      expect(result.current.error).toMatch(
        {
          'create-lobby': /create the lobby: server down/,
          ready: /ready the lobby: not permitted/,
          'start-encounter': /start the encounter: capacity full/,
        }[seam]
      );
      expect(result.current.launching).toBe(false);
      expect(onPlay).not.toHaveBeenCalled();

      // The latch cleared: a retry runs a fresh transaction against a
      // fresh (answering) set of RPC promises.
      hoisted.freshPromises();
      await act(async () => {
        void result.current.play('dungeon-key-2');
      });
      await waitFor(() => expect(hoisted.calls.createLobby).toHaveLength(2));
      await settleAll();
      await waitFor(() => expect(onPlay).toHaveBeenCalledTimes(1));
    }
  );

  it('retires an in-flight launch when the character identity changes and never navigates', async () => {
    const onPlay = vi.fn();
    const { result, rerender } = renderHook(
      ({ characterId }: { characterId: string | null }) =>
        usePlayAuthoredDungeon({ characterId, onPlay }),
      { initialProps: { characterId: 'char-a' as string | null } }
    );

    await act(async () => {
      void result.current.play('dungeon-key-1');
    });
    await waitFor(() => expect(hoisted.calls.createLobby).toHaveLength(1));

    // Character switches while createLobby is still pending: the launch is
    // retired, the editor stops being busy.
    rerender({ characterId: 'char-b' });
    await waitFor(() => expect(result.current.launching).toBe(false));
    expect(result.current.phase).toBeNull();

    // The abandoned RPC answers late: it must not continue its sequence.
    await act(async () => {
      hoisted.createLobby.resolve(lobbyResponse);
    });
    expect(hoisted.calls.setReady).toEqual([]);
    expect(onPlay).not.toHaveBeenCalled();

    // A fresh launch for the new character works.
    let settled: boolean | undefined;
    await act(async () => {
      void result.current.play('dungeon-key-2').then((ok) => {
        settled = ok;
      });
    });
    await waitFor(() => expect(hoisted.calls.createLobby).toHaveLength(2));
    expect(hoisted.calls.createLobby[1]).toEqual({
      campaignId: 'default-campaign',
      characterId: 'char-b',
    });
    await settleAll();
    await waitFor(() => expect(settled).toBe(true));
    expect(onPlay).toHaveBeenCalledWith('enc-9', 'char-b');
  });

  it('does not resurrect an abandoned launch when the identity returns (A→B→A)', async () => {
    const onPlay = vi.fn();
    const { result, rerender } = renderHook(
      ({ characterId }: { characterId: string | null }) =>
        usePlayAuthoredDungeon({ characterId, onPlay }),
      { initialProps: { characterId: 'char-a' as string | null } }
    );

    await act(async () => {
      void result.current.play('dungeon-key-1');
    });
    await waitFor(() => expect(hoisted.calls.createLobby).toHaveLength(1));

    rerender({ characterId: 'char-b' });
    rerender({ characterId: 'char-a' });
    expect(result.current.launching).toBe(false);

    // The abandoned char-a request resolves now, under the ORIGINAL
    // character identity again. The retired token must stay retired.
    await act(async () => {
      hoisted.createLobby.resolve(lobbyResponse);
    });
    expect(hoisted.calls.setReady).toEqual([]);
    expect(hoisted.calls.startEncounter).toEqual([]);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('cancel() retires an in-flight launch monotonically: no next step, no navigation, latch released', async () => {
    const onPlay = vi.fn();
    const { result } = renderHook(() =>
      usePlayAuthoredDungeon({ characterId: 'char-1', onPlay })
    );

    await act(async () => {
      void result.current.play('dungeon-key-1');
    });
    await waitFor(() => expect(hoisted.calls.createLobby).toHaveLength(1));
    expect(result.current.launching).toBe(true);

    await act(async () => {
      result.current.cancel();
    });
    expect(result.current.launching).toBe(false);
    expect(result.current.phase).toBeNull();

    // The abandoned createLobby answers late: no ready step, no navigation.
    await act(async () => {
      hoisted.createLobby.resolve(lobbyResponse);
    });
    expect(hoisted.calls.setReady).toEqual([]);
    expect(onPlay).not.toHaveBeenCalled();

    // The latch is free and cancel() when idle is a harmless no-op.
    await act(async () => {
      result.current.cancel();
    });
    await act(async () => {
      void result.current.play('dungeon-key-2');
    });
    await waitFor(() => expect(hoisted.calls.createLobby).toHaveLength(2));
    await settleAll();
    await waitFor(() => expect(onPlay).toHaveBeenCalledTimes(1));
  });

  it('drops results after unmount without navigating or acting on stale state', async () => {
    const onPlay = vi.fn();
    const { result, unmount } = renderHook(() =>
      usePlayAuthoredDungeon({ characterId: 'char-1', onPlay })
    );

    await act(async () => {
      void result.current.play('dungeon-key-1');
    });
    await waitFor(() => expect(hoisted.calls.createLobby).toHaveLength(1));
    unmount();

    await settleAll();
    expect(onPlay).not.toHaveBeenCalled();
  });
});
