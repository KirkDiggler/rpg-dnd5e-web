import type { CompositionSource } from '@/compositions/compositionSource';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Keep the real editor, replacing only the WebGL boundary unavailable in jsdom.
vi.mock('./WorldBuildingViewport', () => ({
  WorldBuildingViewport: () => <div data-testid="viewport" />,
}));

/** Deferred authoring/lobby seams so a publishing transaction can be held
 * in flight while the busy boundary is exercised. */
const rpc = vi.hoisted(() => {
  const makeDeferred = <T,>(): {
    promise: Promise<T>;
    resolve: (v: T) => void;
    reject: (e: unknown) => void;
  } => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
  return {
    makeDeferred,
    puts: [] as Array<{
      validateOnly: boolean;
      deferred: ReturnType<typeof makeDeferred<never>>;
    }>,
    gets: [] as Array<{ deferred: ReturnType<typeof makeDeferred<never>> }>,
    lobby: {
      created: 0,
      ready: 0,
      started: 0,
      startDeferred: null as ReturnType<typeof makeDeferred<never>> | null,
    },
    reset: () => {
      rpc.puts.length = 0;
      rpc.gets.length = 0;
      rpc.lobby.created = 0;
      rpc.lobby.ready = 0;
      rpc.lobby.started = 0;
      rpc.lobby.startDeferred = null;
    },
  };
});

vi.mock('@/author/authoringRpc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/author/authoringRpc')>();
  return {
    ...actual,
    defaultAuthoringClient: {
      putDungeon: vi.fn(async (request: { validateOnly: boolean }) => {
        const deferred = rpc.makeDeferred<never>();
        rpc.puts.push({ validateOnly: request.validateOnly, deferred });
        if (request.validateOnly) return { errors: [] } as never;
        return deferred.promise as never;
      }),
      getDungeon: vi.fn(async () => {
        const deferred = rpc.makeDeferred<never>();
        rpc.gets.push({ deferred });
        return deferred.promise as never;
      }),
      listScenarios: vi.fn(),
    },
  };
});

vi.mock('@/api/useCreateLobby', () => ({
  useCreateLobby: () => ({
    createLobby: vi.fn(async () => {
      rpc.lobby.created += 1;
      return { lobbyId: 'lobby-1' } as never;
    }),
    loading: false,
    error: null,
  }),
}));

vi.mock('@/api/useSetLobbyReady', () => ({
  useSetLobbyReady: () => ({
    setReady: vi.fn(async () => {
      rpc.lobby.ready += 1;
    }),
    loading: false,
    error: null,
  }),
}));

vi.mock('@/api/useStartLobbyEncounter', () => ({
  useStartLobbyEncounter: () => ({
    startEncounter: vi.fn(async () => {
      rpc.lobby.started += 1;
      if (rpc.lobby.startDeferred) return rpc.lobby.startDeferred.promise;
      return { encounterId: 'enc-1' } as never;
    }),
    loading: false,
    error: null,
  }),
}));

import { Code, ConnectError } from '@connectrpc/connect';
import { WorldBuilderWorkspace } from './WorldBuilderWorkspace';

const source = {
  worldId: 'world-1',
  reader: {
    listCompositions: async () => [],
    getComposition: async () => null,
  },
} as CompositionSource;

const storage = {
  values: new Map<string, string>(),
  getItem(key: string) {
    return this.values.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    this.values.set(key, value);
  },
};

const savePuts = () => rpc.puts.filter((put) => !put.validateOnly);

/** Walk the route's destination nav (web#1152): saving, loading, snapshots and
 * publishing live in the Library; the room document's identity lives on The
 * site; building stays on Rooms; the composer is its own editor. */
const goTo = (
  destination: 'Rooms' | 'Prop compositions' | 'The site' | 'Library'
) => fireEvent.click(screen.getByRole('button', { name: destination }));

beforeEach(() => {
  rpc.reset();
  storage.values.clear();
});

describe('WorldBuilderWorkspace', () => {
  it('requires explicit confirmation before Back and preserves live editor state', () => {
    const onBack = vi.fn();
    render(
      <WorldBuilderWorkspace
        compositionSource={source}
        storage={storage}
        onBack={onBack}
      />
    );

    goTo('The site');
    fireEvent.change(screen.getByRole('textbox', { name: 'Room name' }), {
      target: { value: 'Unexported room work' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back to main menu' }));
    expect(onBack).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        /Leave the World Builder\? Saved rooms and autosaved local drafts/i
      )
    ).toBeTruthy();
    expect(
      screen.getByText(/any change not saved or exported may be lost/i)
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      (screen.getByRole('textbox', { name: 'Room name' }) as HTMLInputElement)
        .value
    ).toBe('Unexported room work');
    expect(onBack).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Back to main menu' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Leave World Builder' })
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('keeps one active keyed editor and requires explicit switching', () => {
    render(
      <WorldBuilderWorkspace compositionSource={source} storage={storage} />
    );

    expect(
      screen.getByRole('button', { name: 'Rooms' }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.getByRole('heading', { name: 'World Builder' })).toBeTruthy();
    expect(
      screen.getByRole('region', { name: 'Room Authoring Draft' })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Prop compositions' }));
    expect(screen.getByRole('button', { name: 'Switch editor' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel switch' })).toBeTruthy();
    expect(
      screen.getByRole('region', { name: 'Room Authoring Draft' })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel switch' }));
    expect(
      screen.getByRole('region', { name: 'Room Authoring Draft' })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Prop compositions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch editor' }));
    expect(screen.getByRole('heading', { name: 'World Builder' })).toBeTruthy();
    expect(
      screen.getByRole('region', { name: 'World Building Concept' })
    ).toBeTruthy();
    expect(
      screen.queryByRole('region', { name: 'Room Authoring Draft' })
    ).toBeNull();
  });

  it('separates building from saving: the room screen carries no save/load, the Library does', () => {
    render(
      <WorldBuilderWorkspace
        compositionSource={source}
        storage={storage}
        onBack={vi.fn()}
        characterId="char-1"
        onPlay={vi.fn()}
      />
    );

    // Rooms is building: tools, palette, canvas, the selected thing's
    // declarations, and the actors. No save/load in the chrome.
    expect(
      screen.getByRole('region', { name: 'Room Authoring Draft' })
    ).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Room setup' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Back to main menu' })
    ).toBeTruthy();
    for (const name of ['Save room draft', 'Reload room draft', 'New room']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByRole('region', { name: 'Publish room' })).toBeNull();
    expect(screen.queryByText('Arrangement library')).toBeNull();
    expect(screen.queryByLabelText('Portable JSON')).toBeNull();

    // The Library is a place you go: saving, loading, snapshots,
    // arrangements — and the server publish.
    goTo('Library');
    expect(
      screen.getByRole('button', { name: 'Save room draft' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Reload room draft' })
    ).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Publish room' })).toBeTruthy();
    expect(screen.getByText('Arrangement library')).toBeTruthy();
    expect(screen.getByLabelText('Portable JSON')).toBeTruthy();
    expect(
      screen.queryByRole('region', { name: 'Room Authoring Draft' })
    ).toBeNull();

    // The site is the scope that belongs to no single selection: identity
    // here, and no select-then-declare panel.
    goTo('The site');
    expect(screen.getByRole('region', { name: 'Site identity' })).toBeTruthy();
    expect(screen.getByLabelText('Room name')).toBeTruthy();
    expect(screen.queryByLabelText('Portable JSON')).toBeNull();

    // The composer keeps its own screen, chrome and libraries: the design
    // leaves it as it already is.
    goTo('Prop compositions');
    fireEvent.click(screen.getByRole('button', { name: 'Switch editor' }));
    expect(
      screen.getByRole('region', { name: 'World Building Concept' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Save local draft' })
    ).toBeTruthy();
    expect(screen.getByText('Arrangement library')).toBeTruthy();
    // The composer keeps its own save verbs too: no room snapshot button
    // appears in its panel under a room's name.
    expect(
      screen.queryByRole('button', { name: 'Save room snapshot to world' })
    ).toBeNull();
  });

  it('renders publishing controls only when the route injects a play capability', () => {
    render(
      <WorldBuilderWorkspace
        compositionSource={source}
        storage={storage}
        characterId={null}
        onPlay={vi.fn()}
      />
    );
    goTo('Library');
    expect(screen.getByRole('region', { name: 'Publish room' })).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Save & Play' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(screen.getByText(/Pick a character on Home to play/)).toBeTruthy();

    // Without the capability (e.g. the local-only Concepts Lab mount) the
    // panel — and its RPC effects — never exist.
    cleanup();
    render(
      <WorldBuilderWorkspace compositionSource={source} storage={storage} />
    );
    goTo('Library');
    expect(screen.queryByRole('region', { name: 'Publish room' })).toBeNull();
  });

  it('blocks Back and mode switching during an in-flight save-and-play transaction and releases after', async () => {
    const onBack = vi.fn();
    const onPlay = vi.fn();
    render(
      <WorldBuilderWorkspace
        compositionSource={source}
        storage={storage}
        onBack={onBack}
        characterId="char-1"
        onPlay={onPlay}
      />
    );

    goTo('Library');
    // A debounced preview may finish before the user's save on a busy CI
    // runner. Exercise that ordering rather than relying on fast execution.
    await waitFor(() => expect(rpc.puts).toHaveLength(1));

    // Drive a real publishing transaction into its save: existence read
    // answers NotFound, then the save itself is held in flight.
    fireEvent.click(screen.getByRole('button', { name: 'Save & Play' }));
    await waitFor(() => expect(rpc.gets).toHaveLength(1));
    rpc.gets[0]!.deferred.reject(
      new ConnectError('no such key', Code.NotFound)
    );
    await waitFor(() => expect(savePuts()).toHaveLength(1));

    // While the transaction mutates server state, navigation is locked.
    fireEvent.click(screen.getByRole('button', { name: 'Back to main menu' }));
    expect(
      screen.queryByText(/Leave the World Builder\? Saved rooms/i)
    ).toBeNull();
    expect(onBack).not.toHaveBeenCalled();
    expect(
      (
        screen.getByRole('button', {
          name: 'Prop compositions',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Rooms' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(screen.getByText(/Save & Play is running/i)).toBeTruthy();

    // The transaction completes: launch runs, the latch releases, and the
    // idle leave confirmation is intact.
    await act(async () =>
      savePuts()[0]!.deferred.resolve({ errors: [] } as never)
    );
    await waitFor(() => expect(onPlay).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: 'Back to main menu',
          }) as HTMLButtonElement
        ).disabled
      ).toBe(false)
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to main menu' }));
    expect(
      screen.getByText(/Leave the World Builder\? Saved rooms/i)
    ).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Leave World Builder' })
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('blocks Back even against a held deferred launch seam, and never routes mid-transaction', async () => {
    rpc.lobby.startDeferred = rpc.makeDeferred<never>();
    const onBack = vi.fn();
    const onPlay = vi.fn();
    render(
      <WorldBuilderWorkspace
        compositionSource={source}
        storage={storage}
        onBack={onBack}
        characterId="char-1"
        onPlay={onPlay}
      />
    );

    goTo('Library');
    fireEvent.click(screen.getByRole('button', { name: 'Save & Play' }));
    await waitFor(() => expect(rpc.gets).toHaveLength(1));
    rpc.gets[0]!.deferred.reject(
      new ConnectError('no such key', Code.NotFound)
    );
    await waitFor(() => expect(savePuts()).toHaveLength(1));
    await act(async () =>
      savePuts()[0]!.deferred.resolve({ errors: [] } as never)
    );
    // StartEncounter remains pending: navigation must stay locked until its
    // actual response, not merely until a fast chain happens to settle.
    await waitFor(() => expect(rpc.lobby.started).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Back to main menu' }));
    expect(onBack).not.toHaveBeenCalled();
    expect(onPlay).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/Leave the World Builder\? Saved rooms/i)
    ).toBeNull();
    await act(async () =>
      rpc.lobby.startDeferred!.resolve({ encounterId: 'enc-1' } as never)
    );

    await waitFor(() => expect(onPlay).toHaveBeenCalledTimes(1));
    expect(onPlay).toHaveBeenCalledWith('enc-1', 'char-1');
  });
});
