/**
 * Ending a watch leaves its run (rpg-project#1008), through the REAL studio,
 * publishing and launch hooks. The lobby sequence and the session's Exit
 * and GetSeat are fakes that answer at once; each case drives the studio's
 * own controls and observes the exact Exit requests.
 */
import type { CompositionSource } from '@/compositions/compositionSource';
import { Code, ConnectError } from '@connectrpc/connect';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ROOM_DRAFT_STORAGE_KEY,
  stringifyRoomDraft,
  type RoomDraftDocument,
} from '../world-building/roomDraft';
import type { KeyValueStorage } from '../world-building/types';
import { EncounterStudioWorkspace } from './EncounterStudioWorkspace';
import { createCastleS4Document } from './fixtures/castleS4';
import type { WatchedRun } from './runWatch';

const fakes = vi.hoisted(() => ({
  exit: vi.fn(),
  getSeat: vi.fn(),
  /** What each StartEncounter answers, in order: an encounter id or a
   * refusal. */
  starts: [] as Array<string | Error>,
  startCalls: 0,
  createCalls: 0,
  /** Every Exit and StartEncounter, in the order they were made. */
  order: [] as string[],
}));

vi.mock('@/author/authoringRpc', async (importOriginal) => {
  const { Code: code, ConnectError: Refusal } =
    await import('@connectrpc/connect');
  const client = {
    putDungeon: async () => ({ errors: [] }),
    getDungeon: async () => {
      throw new Refusal('no such dungeon', code.NotFound);
    },
    listScenarios: async () => ({ scenarios: [] }),
    deleteDungeon: async () => ({}),
    renameDungeon: async () => ({}),
  };
  return {
    ...(await importOriginal<typeof import('@/author/authoringRpc')>()),
    defaultAuthoringClient: client,
    defaultAuthoringLibraryClient: client,
  };
});
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  lobbyClient: { listDungeons: vi.fn(async () => ({ dungeons: [] })) },
  sessionClient: { exit: fakes.exit, getSeat: fakes.getSeat },
}));
vi.mock('@/api/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/hooks')>()),
  useGetCharacter: () => ({ data: null, loading: false, error: null }),
}));
vi.mock('@/author/useAuthoringGate', () => ({
  useAuthoringGate: () => ({ state: 'live', retry: vi.fn() }),
}));
vi.mock('@/api/useCreateLobby', () => ({
  useCreateLobby: () => ({
    createLobby: async () => {
      fakes.createCalls += 1;
      return { lobbyId: `lobby-${fakes.createCalls}` };
    },
    loading: false,
    error: null,
  }),
}));
vi.mock('@/api/useSetLobbyReady', () => ({
  useSetLobbyReady: () => ({
    setReady: async () => ({}),
    loading: false,
    error: null,
  }),
}));
vi.mock('@/api/useStartLobbyEncounter', () => ({
  useStartLobbyEncounter: () => ({
    startEncounter: async () => {
      const answer = fakes.starts[fakes.startCalls];
      fakes.startCalls += 1;
      fakes.order.push('start');
      if (answer instanceof Error) throw answer;
      return { encounterId: answer ?? 'unexpected-start' };
    },
    loading: false,
    error: null,
  }),
}));
/** Watching is dev-only and streams the record; here it is available and
 * the record is empty. */
vi.mock('./runWatch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./runWatch')>();
  const empty = { rows: [], notice: undefined };
  return {
    ...actual,
    watchUnavailableReason: () => null,
    useRunWatch: (
      watch: Parameters<typeof actual.useRunFold>[0],
      draft: Parameters<typeof actual.useRunFold>[1]
    ) => actual.useRunFold(watch, draft, empty),
  };
});
vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  Canvas: () => <canvas data-testid="webgl-boundary" />,
}));
vi.mock('@/compositions/CompositionThumbnailRenderer', () => ({
  ThumbnailRenderer: () => null,
}));
vi.mock('../world-building/useWorldMaterialCatalog', () => ({
  useWorldMaterialCatalog: () => ({
    catalog: null,
    status: 'unavailable',
    message: 'No material catalog in tests.',
  }),
}));

class MemoryStorage implements KeyValueStorage {
  readonly bytes = new Map<string, string>();
  getItem(key: string): string | null {
    return this.bytes.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.bytes.set(key, value);
  }
  constructor(document: RoomDraftDocument) {
    this.bytes.set(
      ROOM_DRAFT_STORAGE_KEY,
      stringifyRoomDraft(document.draft, document.scope)
    );
  }
}

const HERO = 'hero-1';
const seatedIn = (session: string) =>
  new ConnectError(
    `start encounter: launch: character "${HERO}" is seated in session "${session}": character is seated in another session`,
    Code.FailedPrecondition
  );

let source: CompositionSource;
beforeEach(() => {
  fakes.exit.mockReset();
  fakes.order = [];
  fakes.exit.mockImplementation(async (request: { session: string }) => {
    fakes.order.push(`exit ${request.session}`);
    return {};
  });
  fakes.getSeat.mockReset();
  fakes.getSeat.mockRejectedValue(new ConnectError('no seat', Code.NotFound));
  fakes.starts = [];
  fakes.startCalls = 0;
  fakes.createCalls = 0;
  source = {
    worldId: 'joined-test-world',
    reader: {
      listCompositions: vi.fn(async () => []),
      getComposition: vi.fn(async () => null),
    },
    writer: { createComposition: vi.fn(), deleteComposition: vi.fn() },
  };
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount(
  props: {
    initialWatch?: WatchedRun | null;
    onWatchEnded?: () => void;
    onWatchStarted?: (run: WatchedRun) => void;
    onWatchLost?: (run: WatchedRun) => void;
    onPlayWatched?: (encounterId: string, characterId: string) => void;
    onBack?: () => void;
  } = {}
) {
  const document = createCastleS4Document();
  const storage = new MemoryStorage(document);
  render(
    <EncounterStudioWorkspace
      compositionSource={source}
      storage={storage}
      characterId={HERO}
      onPlay={vi.fn()}
      {...props}
    />
  );
  return { roomId: document.draft.id };
}

const watchButton = () => screen.getByRole('button', { name: 'Watch a run' });
const panel = () => within(screen.getByTestId('studio-watch'));
async function watchStarts(): Promise<void> {
  await waitFor(() =>
    expect(watchButton().hasAttribute('disabled')).toBe(false)
  );
  fireEvent.click(watchButton());
  await screen.findByTestId('studio-watch');
}

describe('Stop watching leaves the run (rpg-project#1008)', () => {
  it('Stop watching exits the watched run with its session and member, then stops', async () => {
    fakes.starts = ['run-1'];
    const onWatchEnded = vi.fn();
    mount({ onWatchEnded });
    await watchStarts();
    fireEvent.click(panel().getByRole('button', { name: 'Stop watching' }));
    await waitFor(() =>
      expect(screen.queryByTestId('studio-watch')).toBeNull()
    );
    expect(fakes.exit).toHaveBeenCalledWith({ session: 'run-1', member: HERO });
    expect(onWatchEnded).toHaveBeenCalled();
  });

  it('a refused leave is said; the watch stays until Stop watching anyway', async () => {
    fakes.starts = ['run-1'];
    fakes.exit.mockRejectedValue(
      new ConnectError('a roll is waiting', Code.FailedPrecondition)
    );
    const onWatchEnded = vi.fn();
    mount({ onWatchEnded });
    await watchStarts();
    fireEvent.click(panel().getByRole('button', { name: 'Stop watching' }));
    expect((await panel().findByRole('alert')).textContent).toContain(
      'Could not leave the run: a roll is waiting'
    );
    expect(onWatchEnded).not.toHaveBeenCalled();
    fireEvent.click(
      panel().getByRole('button', { name: 'Stop watching anyway' })
    );
    expect(screen.queryByTestId('studio-watch')).toBeNull();
    expect(onWatchEnded).toHaveBeenCalled();
  });

  it('a run already gone counts as left', async () => {
    fakes.starts = ['run-1'];
    fakes.exit.mockRejectedValue(new ConnectError('gone', Code.NotFound));
    mount();
    await watchStarts();
    fireEvent.click(panel().getByRole('button', { name: 'Stop watching' }));
    await waitFor(() =>
      expect(screen.queryByTestId('studio-watch')).toBeNull()
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a second Watch a run waits for the first run to be left before it starts the next', async () => {
    fakes.starts = ['run-1', 'run-2'];
    const onWatchStarted = vi.fn();
    mount({ onWatchStarted });
    await watchStarts();
    expect(fakes.exit).not.toHaveBeenCalled();
    // The leave answers only when the test says so.
    let answerExit!: () => void;
    fakes.exit.mockImplementationOnce(
      (request: { session: string }) =>
        new Promise((resolve) => {
          answerExit = () => {
            fakes.order.push(`exit ${request.session}`);
            resolve({});
          };
        })
    );
    fireEvent.click(watchButton());
    await waitFor(() =>
      expect(fakes.exit).toHaveBeenCalledWith({
        session: 'run-1',
        member: HERO,
      })
    );
    // Give a launch that did not wait every chance to start.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(fakes.startCalls).toBe(1);
    await act(async () => answerExit());
    await waitFor(() =>
      expect(onWatchStarted).toHaveBeenLastCalledWith(
        expect.objectContaining({ session: 'run-2', member: HERO })
      )
    );
    expect(fakes.order).toEqual(['start', 'exit run-1', 'start']);
  });

  it('the watch remembers the draft it was started from', async () => {
    fakes.starts = ['run-1'];
    const onWatchStarted = vi.fn();
    const { roomId } = mount({ onWatchStarted });
    await watchStarts();
    expect(onWatchStarted).toHaveBeenCalledWith({
      session: 'run-1',
      member: HERO,
      room: roomId,
    });
  });

  it('Play in the game does not leave the run, and coming back watches it still', async () => {
    fakes.starts = ['run-1'];
    const onPlayWatched = vi.fn();
    mount({ onPlayWatched });
    await watchStarts();
    fireEvent.click(panel().getByRole('button', { name: 'Play in the game' }));
    expect(onPlayWatched).toHaveBeenCalledWith('run-1', HERO);
    cleanup();
    // The game's Back to the studio remounts it on the same run.
    mount({ initialWatch: { session: 'run-1', member: HERO } });
    await screen.findByTestId('studio-watch');
    expect(fakes.exit).not.toHaveBeenCalled();
  });

  it('leaving the studio while watching leaves the run first', async () => {
    fakes.starts = ['run-1'];
    const onBack = vi.fn();
    mount({ onBack });
    await watchStarts();
    fireEvent.click(
      within(document.querySelector<HTMLElement>('.es-header')!).getByRole(
        'button',
        { name: 'Back' }
      )
    );
    const confirm = within(
      screen.getByRole('alertdialog', {
        name: 'Confirm leaving Encounter Studio',
      })
    );
    expect(confirm.getByText(/Leaving also leaves the run/)).toBeTruthy();
    fireEvent.click(
      confirm.getByRole('button', { name: 'Leave Encounter Studio' })
    );
    await waitFor(() => expect(onBack).toHaveBeenCalled());
    expect(fakes.exit).toHaveBeenCalledWith({ session: 'run-1', member: HERO });
  });

  it('a remembered watch of another draft is not drawn here; App hears it once', async () => {
    const onWatchLost = vi.fn();
    const lost = { session: 'run-1', member: HERO, room: 'another-draft' };
    mount({ initialWatch: lost, onWatchLost });
    await waitFor(() => expect(onWatchLost).toHaveBeenCalledWith(lost));
    expect(screen.queryByTestId('studio-watch')).toBeNull();
  });
});

describe('Watch a run while the character is seated elsewhere (rpg-project#1008)', () => {
  it('a seat refusal offers Abandon run; abandoning frees the seat and the watch starts', async () => {
    fakes.starts = [seatedIn('old-run'), 'run-2'];
    mount();
    await waitFor(() =>
      expect(watchButton().hasAttribute('disabled')).toBe(false)
    );
    fireEvent.click(watchButton());
    const notice = await screen.findByTestId('seat-notice');
    expect(notice.textContent).toContain('is still in another run');
    // The refusal is answered by the notice, not repeated as a dead end.
    expect(screen.queryByText(/Could not start the encounter/)).toBeNull();
    expect(watchButton().hasAttribute('disabled')).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByTestId('abandon-run-button'));
    });
    expect(fakes.exit).toHaveBeenCalledWith({
      session: 'old-run',
      member: HERO,
    });
    await screen.findByTestId('studio-watch');
    expect(screen.queryByTestId('seat-notice')).toBeNull();
  });

  it('a seat already held when the studio opens is offered before any launch', async () => {
    fakes.getSeat.mockResolvedValue({ session: 'old-run' });
    mount();
    await screen.findByTestId('seat-notice');
    expect(watchButton().hasAttribute('disabled')).toBe(true);
    expect(fakes.createCalls).toBe(0);
  });

  it('a second refusal after the abandon is shown, not offered again', async () => {
    fakes.starts = [seatedIn('old-run'), seatedIn('older-run')];
    mount();
    await waitFor(() =>
      expect(watchButton().hasAttribute('disabled')).toBe(false)
    );
    fireEvent.click(watchButton());
    await screen.findByTestId('seat-notice');
    await act(async () => {
      fireEvent.click(screen.getByTestId('abandon-run-button'));
    });
    expect(
      await screen.findByText(/Could not start the encounter/)
    ).toBeTruthy();
    expect(screen.queryByTestId('seat-notice')).toBeNull();
  });
});
