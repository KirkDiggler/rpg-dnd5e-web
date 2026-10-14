/**
 * Save and Play in the studio (S6) through the REAL owner and the real
 * publishing and launch hooks, against deferred fakes of every
 * asynchronous seam: the authoring PutDungeon/GetDungeon boundary
 * (author/testing/fakeAuthoringClient) and the lobby sequence. Each case
 * drives the studio's own controls and observes the exact requests.
 */
import {
  type Deferred,
  type FakeAuthoringSink,
} from '@/author/testing/fakeAuthoringClient';
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
import { documentPlacementNames } from '../world-building/placementNames';
import {
  parseRoomDocumentJson,
  ROOM_DRAFT_STORAGE_KEY,
  stringifyRoomDraft,
  type RoomDraftDocument,
} from '../world-building/roomDraft';
import type { KeyValueStorage } from '../world-building/types';
import { defaultDraftKey, exportDraftYaml } from './draftFile';
import { EncounterStudioWorkspace } from './EncounterStudioWorkspace';
import { createCastleS4Document } from './fixtures/castleS4';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';
import { PUBLICATION_STORAGE_KEY } from './publicationMemory';

const sink = vi.hoisted(
  (): FakeAuthoringSink => ({
    puts: [],
    gets: [],
    putAnswers: [],
    getAnswers: [],
  })
);
vi.mock('@/author/authoringRpc', async (importOriginal) => {
  const { fakeAuthoringClient } =
    await import('@/author/testing/fakeAuthoringClient');
  return {
    ...(await importOriginal<typeof import('@/author/authoringRpc')>()),
    defaultAuthoringClient: fakeAuthoringClient(sink),
  };
});

const gate = vi.hoisted(() => ({
  state: 'live' as 'probing' | 'live' | 'gate-off' | 'unreachable',
  retry: vi.fn(),
}));
vi.mock('@/author/useAuthoringGate', () => ({
  useAuthoringGate: () => ({ state: gate.state, retry: gate.retry }),
}));

/** Each lobby call waits on a deferred the test settles. */
const lobby = vi.hoisted(() => ({
  createLobby: [] as Array<{
    input: { campaignId: string; characterId: string };
    answer: Deferred<unknown>;
  }>,
  setReady: [] as Array<{
    input: { lobbyId: string; ready: boolean };
    answer: Deferred<unknown>;
  }>,
  startEncounter: [] as Array<{
    input: { lobbyId: string; dungeonKey?: string };
    answer: Deferred<unknown>;
  }>,
}));
vi.mock('@/api/useCreateLobby', async () => {
  const { makeDeferred } = await import('@/author/testing/fakeAuthoringClient');
  return {
    useCreateLobby: () => ({
      createLobby: (input: { campaignId: string; characterId: string }) => {
        const answer = makeDeferred<unknown>();
        lobby.createLobby.push({ input, answer });
        return answer.promise;
      },
      loading: false,
      error: null,
    }),
  };
});
vi.mock('@/api/useSetLobbyReady', async () => {
  const { makeDeferred } = await import('@/author/testing/fakeAuthoringClient');
  return {
    useSetLobbyReady: () => ({
      setReady: (input: { lobbyId: string; ready: boolean }) => {
        const answer = makeDeferred<unknown>();
        lobby.setReady.push({ input, answer });
        return answer.promise;
      },
      loading: false,
      error: null,
    }),
  };
});
vi.mock('@/api/useStartLobbyEncounter', async () => {
  const { makeDeferred } = await import('@/author/testing/fakeAuthoringClient');
  return {
    useStartLobbyEncounter: () => ({
      startEncounter: (input: { lobbyId: string; dungeonKey?: string }) => {
        const answer = makeDeferred<unknown>();
        lobby.startEncounter.push({ input, answer });
        return answer.promise;
      },
      loading: false,
      error: null,
    }),
  };
});

// jsdom cannot create WebGL; these tests stay in Layout.
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
  readonly getItem = vi.fn(
    (key: string): string | null => this.bytes.get(key) ?? null
  );
  readonly setItem = vi.fn((key: string, value: string): void => {
    this.bytes.set(key, value);
  });
  constructor(document: RoomDraftDocument) {
    this.bytes.set(
      ROOM_DRAFT_STORAGE_KEY,
      stringifyRoomDraft(document.draft, document.scope)
    );
  }
  document(): RoomDraftDocument {
    return parseRoomDocumentJson(this.bytes.get(ROOM_DRAFT_STORAGE_KEY)!);
  }
}

let source: CompositionSource;
beforeEach(() => {
  sink.puts.length = 0;
  sink.gets.length = 0;
  sink.putAnswers.length = 0;
  sink.getAnswers.length = 0;
  lobby.createLobby.length = 0;
  lobby.setReady.length = 0;
  lobby.startEncounter.length = 0;
  gate.state = 'live';
  gate.retry.mockReset();
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const HERO = 'hero-1';

function mount(
  document: RoomDraftDocument = createCastleS4Document(),
  props: {
    characterId?: string | null;
    onPlay?: (encounterId: string, characterId: string) => void;
    storage?: MemoryStorage;
  } = {}
) {
  const storage = props.storage ?? new MemoryStorage(document);
  const onPlay = props.onPlay ?? vi.fn();
  const view = render(
    <EncounterStudioWorkspace
      compositionSource={source}
      storage={storage}
      characterId={props.characterId === undefined ? HERO : props.characterId}
      onPlay={onPlay}
    />
  );
  return { storage, onPlay, view };
}

async function settled(): Promise<void> {
  await waitFor(() =>
    expect(source.reader.listCompositions).toHaveBeenCalled()
  );
}

const play = (): HTMLButtonElement =>
  screen.getByRole('button', { name: 'Save & Play' });
const status = (): string =>
  document.querySelector('.es-publish-status')?.textContent ?? '';
const panel = () =>
  within(screen.getByRole('region', { name: 'Save and Play' }));
const draftPanel = () =>
  within(screen.getByRole('region', { name: 'Draft file' }));
const keyIn = (scope: ReturnType<typeof panel>): HTMLInputElement =>
  scope.getByLabelText('File key') as HTMLInputElement;
/** Real saves only; the live preview also calls putDungeon (validate-only). */
const savePuts = () => sink.puts.filter((put) => !put.request.validateOnly);

async function answerGet(index: number, answer: { yaml: string } | Error) {
  await waitFor(() => expect(sink.gets.length).toBeGreaterThan(index));
  await act(async () => {
    if (answer instanceof Error) sink.getAnswers[index]!.reject(answer);
    else sink.getAnswers[index]!.resolve(answer);
  });
}
async function answerSave(
  index: number,
  answer: { errors: Array<{ path: string; message: string }> } | Error
) {
  await waitFor(() => expect(savePuts().length).toBeGreaterThan(index));
  const put = savePuts()[index]!;
  await act(async () => {
    if (answer instanceof Error) put.deferred.reject(answer);
    else put.deferred.resolve(answer as never);
  });
}
async function answerLaunch(encounterId = 'encounter-7') {
  await waitFor(() => expect(lobby.createLobby).toHaveLength(1));
  await act(async () =>
    lobby.createLobby[0]!.answer.resolve({ lobbyId: 'lobby-1' })
  );
  await waitFor(() => expect(lobby.setReady).toHaveLength(1));
  await act(async () => lobby.setReady[0]!.answer.resolve({}));
  await waitFor(() => expect(lobby.startEncounter).toHaveLength(1));
  await act(async () =>
    lobby.startEncounter[0]!.answer.resolve({ encounterId })
  );
}
const notFound = () => new ConnectError('no such dungeon', Code.NotFound);

describe('S6 one key', () => {
  it('the key seeds from the room name slug on a fresh draft', async () => {
    const document = createCastleS4Document();
    mount(document);
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Draft file' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save to server…' }));
    expect(keyIn(draftPanel()).value).toBe(defaultDraftKey(document));
    expect(keyIn(panel()).value).toBe(defaultDraftKey(document));
    // The name's slug, not the publishing hook's room-id default.
    expect(keyIn(panel()).value).toBe(
      document.draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    );
    expect(keyIn(panel()).value).not.toBe(`room-${document.draft.id}`);
  });

  it('export and publish share one key: typing in Draft file changes the key the publish row shows', async () => {
    const { storage } = mount();
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Draft file' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save to server…' }));
    fireEvent.change(keyIn(draftPanel()), { target: { value: 'mad-king' } });
    expect(keyIn(panel()).value).toBe('mad-king');
    fireEvent.change(keyIn(panel()), { target: { value: 'mad-king-2' } });
    expect(keyIn(draftPanel()).value).toBe('mad-king-2');
    expect(
      draftPanel().getByRole('button', { name: 'Download mad-king-2.yaml' })
    ).toBeTruthy();
    // The server save goes under the same key, with the export's bytes.
    fireEvent.click(panel().getByRole('button', { name: 'Save to server' }));
    await answerGet(0, notFound());
    expect(sink.gets[0]!.key).toBe('mad-king-2');
    await waitFor(() => expect(savePuts()).toHaveLength(1));
    expect(savePuts()[0]!.request).toEqual(
      expect.objectContaining({
        key: 'mad-king-2',
        yaml: exportDraftYaml(storage.document(), 'mad-king-2'),
      })
    );
  });

  it("an import adopts the file's key for both", async () => {
    mount(createPopulatedStudioDocument());
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Draft file' }));
    fireEvent.change(screen.getByLabelText('Draft file to import'), {
      target: {
        files: [
          new File(
            [exportDraftYaml(createCastleS4Document(), 'mad-king')],
            'mad-king.yaml',
            { type: 'text/yaml' }
          ),
        ],
      },
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Replace draft' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save to server…' }));
    await waitFor(() => expect(keyIn(panel()).value).toBe('mad-king'));
    expect(keyIn(draftPanel()).value).toBe('mad-king');
  });

  it('changing the key drops an armed overwrite', async () => {
    mount();
    await settled();
    fireEvent.click(play());
    await answerGet(0, { yaml: 'version: 4\n' });
    expect(
      await screen.findByRole('alertdialog', { name: /^Replace / })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Draft file' }));
    fireEvent.change(keyIn(draftPanel()), { target: { value: 'fresh-key' } });
    expect(screen.queryByRole('alertdialog', { name: /^Replace / })).toBeNull();
    expect(savePuts()).toHaveLength(0);
  });
});

describe('S6 Save & Play', () => {
  it('gate-off disables Save & Play with the server sentence and leaves export usable', async () => {
    gate.state = 'gate-off';
    const { storage } = mount();
    await settled();
    expect(play().disabled).toBe(true);
    expect(play().title).toBe(
      'The server is not accepting authored encounters.'
    );
    expect(
      screen.getByText('The server is not accepting authored encounters.')
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Draft file' }));
    let blob: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
      blob = value as Blob;
      return 'blob:draft';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const key = defaultDraftKey(storage.document());
    fireEvent.click(
      draftPanel().getByRole('button', { name: `Download ${key}.yaml` })
    );
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob!);
    });
    expect(text).toBe(exportDraftYaml(storage.document(), key));
    fireEvent.click(screen.getByRole('button', { name: 'Save to server…' }));
    expect(
      (
        panel().getByRole('button', {
          name: 'Save to server',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    // Authoring off: nothing is asked of the server, not even a preview.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(sink.puts).toHaveLength(0);
    expect(sink.gets).toHaveLength(0);
  });

  it('an unreachable server disables Save & Play with its sentence and a retry', async () => {
    gate.state = 'unreachable';
    mount();
    await settled();
    expect(play().disabled).toBe(true);
    expect(play().title).toBe('The server could not be reached.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry server' }));
    expect(gate.retry).toHaveBeenCalledTimes(1);
  });

  it('no character disables Save & Play with the Home sentence and leaves Save to server enabled', async () => {
    const { storage } = mount(undefined, { characterId: null });
    await settled();
    expect(play().disabled).toBe(true);
    expect(play().title).toBe('Pick a character on Home to play.');
    fireEvent.click(screen.getByRole('button', { name: 'Draft file' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save to server…' }));
    const save = panel().getByRole('button', {
      name: 'Save to server',
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await answerGet(0, notFound());
    await answerSave(0, { errors: [] });
    const key = defaultDraftKey(storage.document());
    await waitFor(() => expect(status()).toBe(`Saved as ${key}`));
    expect(lobby.createLobby).toHaveLength(0);
  });

  it('Save & Play on a new key: GetDungeon NotFound, PutDungeon with the exact export bytes, then createLobby, setReady, startEncounter with the key, then onPlay(encounterId, characterId)', async () => {
    const { storage, onPlay } = mount();
    await settled();
    const key = defaultDraftKey(storage.document());
    fireEvent.click(play());
    expect(screen.getByRole('region', { name: 'Save and Play' })).toBeTruthy();
    await waitFor(() => expect(status()).toBe('Checking key…'));
    expect(sink.gets.map((get) => get.key)).toEqual([key]);
    await answerGet(0, notFound());
    await waitFor(() => expect(status()).toBe('Saving…'));
    expect(savePuts()).toHaveLength(1);
    expect(savePuts()[0]!.request).toEqual(
      expect.objectContaining({
        key,
        validateOnly: false,
        yaml: exportDraftYaml(storage.document(), key),
      })
    );
    // Nothing is launched before the save answers.
    expect(lobby.createLobby).toHaveLength(0);
    await answerSave(0, { errors: [] });
    await waitFor(() => expect(status()).toBe('Starting…'));
    await answerLaunch('encounter-7');
    expect(lobby.createLobby[0]!.input).toEqual(
      expect.objectContaining({ characterId: HERO })
    );
    expect(lobby.setReady[0]!.input).toEqual({
      lobbyId: 'lobby-1',
      ready: true,
    });
    expect(lobby.startEncounter[0]!.input).toEqual({
      lobbyId: 'lobby-1',
      dungeonKey: key,
    });
    await waitFor(() =>
      expect(onPlay).toHaveBeenCalledWith('encounter-7', HERO)
    );
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('Save & Play on an existing key asks; Keep saves nothing; Replace saves and plays', async () => {
    const { storage, onPlay } = mount();
    await settled();
    const key = defaultDraftKey(storage.document());
    fireEvent.click(play());
    await answerGet(0, { yaml: 'version: 4\n' });
    const ask = await screen.findByRole('alertdialog', {
      name: `Replace ${key}`,
    });
    expect(ask.textContent).toContain(
      `${key} already exists on the server. Replace it?`
    );
    expect(document.activeElement).toBe(
      within(ask).getByRole('button', { name: 'Replace' })
    );
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(savePuts()).toHaveLength(0);
    expect(lobby.createLobby).toHaveLength(0);
    fireEvent.click(play());
    await answerGet(1, { yaml: 'version: 4\n' });
    fireEvent.click(
      within(
        await screen.findByRole('alertdialog', { name: `Replace ${key}` })
      ).getByRole('button', { name: 'Replace' })
    );
    await answerSave(0, { errors: [] });
    await answerLaunch();
    await waitFor(() => expect(onPlay).toHaveBeenCalledTimes(1));
  });

  it('a second Save & Play to the same key does not ask', async () => {
    const { onPlay } = mount();
    await settled();
    fireEvent.click(play());
    await answerGet(0, notFound());
    await answerSave(0, { errors: [] });
    await answerLaunch();
    await waitFor(() => expect(onPlay).toHaveBeenCalledTimes(1));
    lobby.createLobby.length = 0;
    lobby.setReady.length = 0;
    lobby.startEncounter.length = 0;
    fireEvent.click(play());
    await waitFor(() => expect(savePuts()).toHaveLength(2));
    expect(sink.gets).toHaveLength(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await answerSave(1, { errors: [] });
    await answerLaunch('encounter-8');
    await waitFor(() =>
      expect(onPlay).toHaveBeenLastCalledWith('encounter-8', HERO)
    );
  });

  it('PutDungeon invalid shows the refusals and launches nothing', async () => {
    const document = createCastleS4Document();
    mount(document);
    await settled();
    fireEvent.click(play());
    await answerGet(0, notFound());
    await answerSave(0, {
      errors: [
        {
          path: 'room.room.monsterBindings.gate-1.faction',
          message: 'names no declared faction',
        },
        { path: 'line 3', message: 'mapping values are not allowed here' },
      ],
    });
    const refusals = within(
      await screen.findByRole('group', { name: 'Server refusals' })
    );
    const name = documentPlacementNames(document).get('gate-1')!;
    const jump = refusals.getByRole('button', {
      name: `${name}: names no declared faction`,
    });
    expect(
      refusals.getByText('mapping values are not allowed here')
    ).toBeTruthy();
    expect(refusals.getAllByRole('button')).toHaveLength(1);
    expect(lobby.createLobby).toHaveLength(0);
    expect(status()).toBe('');
    // The jump selects the creature and opens its inspector.
    fireEvent.click(jump);
    expect(
      within(screen.getByRole('region', { name: 'Inspector' })).getByRole(
        'heading',
        { level: 2 }
      ).textContent
    ).toBe(name);
  });

  it("the live preview's refusals jump too", async () => {
    const document = createCastleS4Document();
    mount(document, { characterId: null });
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Draft file' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save to server…' }));
    await waitFor(
      () =>
        expect(
          sink.puts.filter((put) => put.request.validateOnly).length
        ).toBeGreaterThan(0),
      { timeout: 2000 }
    );
    const preview = sink.puts.filter((put) => put.request.validateOnly).at(-1)!;
    const exit = document.scope.exits!.findIndex(
      (entry) => entry.id === 'postern'
    );
    await act(async () =>
      preview.deferred.resolve({
        errors: [{ path: `exits[${exit}].cell`, message: 'is not standable' }],
      } as never)
    );
    const cell = document.scope.exits![exit]!.cell;
    fireEvent.click(
      await screen.findByRole('button', {
        name: `Hex ${cell.q}, ${cell.r}: is not standable`,
      })
    );
    expect(
      within(screen.getByRole('region', { name: 'Inspector' })).getByRole(
        'heading',
        { level: 2 }
      ).textContent
    ).toBe(`Hex ${cell.q}, ${cell.r}`);
  });

  it('transport failure shows "Save failed" and the draft is unchanged', async () => {
    const { storage } = mount();
    await settled();
    const before = storage.document();
    fireEvent.click(play());
    await answerGet(0, notFound());
    await answerSave(0, new ConnectError('connection reset', Code.Unavailable));
    expect(
      await screen.findByText(
        'Save failed: Unavailable: connection reset. Your draft is unchanged.'
      )
    ).toBeTruthy();
    expect(storage.document()).toEqual(before);
    expect(status()).toBe('');
    expect(lobby.createLobby).toHaveLength(0);
    // Recoverable: the control is live again and the next press saves.
    expect(play().disabled).toBe(false);
  });

  it('startEncounter failure shows the seam sentence and no onPlay', async () => {
    const { storage, onPlay } = mount();
    await settled();
    fireEvent.click(play());
    await answerGet(0, notFound());
    await answerSave(0, { errors: [] });
    await waitFor(() => expect(lobby.createLobby).toHaveLength(1));
    await act(async () =>
      lobby.createLobby[0]!.answer.resolve({ lobbyId: 'lobby-1' })
    );
    await waitFor(() => expect(lobby.setReady).toHaveLength(1));
    await act(async () => lobby.setReady[0]!.answer.resolve({}));
    await waitFor(() => expect(lobby.startEncounter).toHaveLength(1));
    await act(async () =>
      lobby.startEncounter[0]!.answer.reject(new Error('no seats left'))
    );
    expect(
      await screen.findByText('Could not start the encounter: no seats left')
    ).toBeTruthy();
    expect(onPlay).not.toHaveBeenCalled();
    // The file did save; that is said, and nothing more.
    expect(status()).toBe(`Saved as ${defaultDraftKey(storage.document())}`);
  });

  it('edits during a save are refused and the saved bytes are the captured bytes', async () => {
    const { storage } = mount();
    await settled();
    // The key is seeded from the first name; a rename never renames it.
    const key = defaultDraftKey(storage.document());
    const rename = (from: string, to: string): void => {
      fireEvent.click(
        screen.getByRole('button', { name: `Rename encounter ${from}` })
      );
      fireEvent.change(screen.getByLabelText('Encounter name'), {
        target: { value: to },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Apply encounter name' })
      );
    };
    rename(storage.document().draft.name, 'Renamed castle');
    fireEvent.click(screen.getByRole('button', { name: 'Save local draft' }));
    await waitFor(() =>
      expect(storage.document().draft.name).toBe('Renamed castle')
    );
    const undo = screen.getByRole('button', {
      name: 'Undo',
    }) as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
    const captured = storage.document();
    fireEvent.click(play());
    await answerGet(0, notFound());
    await waitFor(() => expect(savePuts()).toHaveLength(1));
    // Mid-save: rename, undo and the local save are all refused.
    rename('Renamed castle', 'A different castle');
    expect(
      screen.getByText(/^Save & Play is running — the room is locked/)
    ).toBeTruthy();
    expect(undo.disabled).toBe(true);
    fireEvent.click(undo);
    fireEvent.click(screen.getByRole('button', { name: 'Save local draft' }));
    expect(storage.document()).toEqual(captured);
    expect(screen.getByText(/^Rename refused/)).toBeTruthy();
    expect(savePuts()[0]!.request.yaml).toBe(exportDraftYaml(captured, key));
    await answerSave(0, { errors: [] });
    await waitFor(() => expect(lobby.createLobby).toHaveLength(1));
    // Home and view stay ungated: they change no bytes.
    fireEvent.click(screen.getByRole('button', { name: 'Encounter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Build' }));
    expect(storage.document().draft.name).toBe(captured.draft.name);
  });
});

describe('S6 the saved key outlives the studio mount (T7)', () => {
  /** Save & Play on a fresh key all the way into play. */
  async function playFresh(getIndex = 0, saveIndex = 0): Promise<void> {
    fireEvent.click(play());
    await answerGet(getIndex, notFound());
    await answerSave(saveIndex, { errors: [] });
    await answerLaunch();
  }

  it('reopening the studio after a save does not ask before overwriting the same key', async () => {
    const first = mount();
    await settled();
    const key = defaultDraftKey(first.storage.document());
    await playFresh();
    await waitFor(() => expect(first.onPlay).toHaveBeenCalledTimes(1));
    first.view.unmount();
    lobby.createLobby.length = 0;
    lobby.setReady.length = 0;
    lobby.startEncounter.length = 0;
    const again = mount(undefined, { storage: first.storage });
    await settled();
    fireEvent.click(play());
    await waitFor(() => expect(savePuts()).toHaveLength(2));
    expect(sink.gets).toHaveLength(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(savePuts()[1]!.request.key).toBe(key);
    await answerSave(1, { errors: [] });
    await answerLaunch();
    await waitFor(() => expect(again.onPlay).toHaveBeenCalledTimes(1));
  });

  it('a different draft id asks', async () => {
    const first = mount();
    await settled();
    await playFresh();
    await waitFor(() => expect(first.onPlay).toHaveBeenCalledTimes(1));
    first.view.unmount();
    // Another draft under the same storage: the record names the old one.
    const other = first.storage.document();
    other.draft.id = 'another-room';
    first.storage.bytes.set(
      ROOM_DRAFT_STORAGE_KEY,
      stringifyRoomDraft(other.draft, other.scope)
    );
    mount(undefined, { storage: first.storage });
    await settled();
    fireEvent.click(play());
    await waitFor(() => expect(sink.gets).toHaveLength(2));
    expect(savePuts()).toHaveLength(1);
  });

  it('an import clears the remembered save', async () => {
    const document = createCastleS4Document();
    const first = mount(document);
    await settled();
    const key = defaultDraftKey(first.storage.document());
    await playFresh();
    await waitFor(() => expect(first.onPlay).toHaveBeenCalledTimes(1));
    // The same room id and the same key, but a file from outside.
    fireEvent.click(screen.getByRole('button', { name: 'Draft file' }));
    fireEvent.change(screen.getByLabelText('Draft file to import'), {
      target: {
        files: [
          new File([exportDraftYaml(document, key)], `${key}.yaml`, {
            type: 'text/yaml',
          }),
        ],
      },
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Replace draft' })
    );
    expect(keyIn(draftPanel()).value).toBe(key);
    fireEvent.click(play());
    await waitFor(() => expect(sink.gets).toHaveLength(2));
    expect(savePuts()).toHaveLength(1);
    expect(first.storage.bytes.get(PUBLICATION_STORAGE_KEY)).toBe('null');
  });

  it('a malformed record is ignored', async () => {
    const document = createCastleS4Document();
    const storage = new MemoryStorage(document);
    storage.bytes.set(PUBLICATION_STORAGE_KEY, '{"roomId": 7, "key"');
    mount(document, { storage });
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Draft file' }));
    expect(keyIn(draftPanel()).value).toBe(defaultDraftKey(document));
    fireEvent.click(play());
    await waitFor(() => expect(sink.gets).toHaveLength(1));
    expect(savePuts()).toHaveLength(0);
  });
});
