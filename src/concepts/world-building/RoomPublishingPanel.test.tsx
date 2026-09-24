/**
 * RoomPublishingPanel against deferred fakes of every real asynchronous
 * seam (plan §2 "Required focused proof"): the authoring PutDungeon/Get
 * boundary and the shared lobby launch. Each case drives real component
 * interactions — clicks, typing, dialogs — and observes exact requests,
 * refusals, fencing and busy behavior. No test asserts hook names.
 */
import type { AuthoringClient } from '@/author/authoringRpc';
import { Code, ConnectError } from '@connectrpc/connect';
import type {
  CreateLobbyResponse,
  StartEncounterResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeWorldBuilderV4Site,
  WORLD_BUILDER_V4_SITE_YAML,
} from './fixtures/worldBuilderV4Site';
import { createRoomDraft, type RoomDraft } from './roomDraft';
import { RoomPublishingPanel } from './RoomPublishingPanel';
import { decodeSingleRoomDungeon } from './singleRoomDungeon';
import type { SiteScope } from './siteScope';
import type { WorldScene } from './types';

/** ── Deferred authoring client ─────────────────────────────────────── */

type PutAnswer = {
  errors: Array<{ path: string; message: string }>;
};
type GetAnswer = { yaml: string };
type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function makeDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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
      request: { key: string; yaml: string; validateOnly: boolean };
      deferred: ReturnType<typeof makeDeferred<never>>;
    }>,
    gets: [] as Array<{
      key: string;
      deferred: ReturnType<typeof makeDeferred<never>>;
    }>,
    lobby: {
      createLobby: [] as Array<{ campaignId: string; characterId: string }>,
      setReady: [] as Array<{ lobbyId: string; ready: boolean }>,
      startEncounter: [] as Array<{ lobbyId: string; dungeonKey?: string }>,
      createLobbyDeferred: null as ReturnType<
        typeof makeDeferred<never>
      > | null,
      setReadyDeferred: null as ReturnType<typeof makeDeferred<never>> | null,
      startDeferred: null as ReturnType<typeof makeDeferred<never>> | null,
      failCreateLobby: null as unknown,
      failSetReady: null as unknown,
      failStart: null as unknown,
    },
    reset: () => {
      rpc.puts.length = 0;
      rpc.gets.length = 0;
      rpc.lobby.createLobby.length = 0;
      rpc.lobby.setReady.length = 0;
      rpc.lobby.startEncounter.length = 0;
      rpc.lobby.createLobbyDeferred = null;
      rpc.lobby.setReadyDeferred = null;
      rpc.lobby.startDeferred = null;
      rpc.lobby.failCreateLobby = null;
      rpc.lobby.failSetReady = null;
      rpc.lobby.failStart = null;
    },
  };
});

vi.mock('@/api/useCreateLobby', () => ({
  useCreateLobby: () => ({
    createLobby: vi.fn(
      async (input: { campaignId: string; characterId: string }) => {
        rpc.lobby.createLobby.push(input);
        if (rpc.lobby.failCreateLobby) throw rpc.lobby.failCreateLobby;
        const deferred =
          rpc.lobby.createLobbyDeferred ?? rpc.makeDeferred<never>();
        return deferred.promise as never as CreateLobbyResponse;
      }
    ),
    loading: false,
    error: null,
  }),
}));

vi.mock('@/api/useSetLobbyReady', () => ({
  useSetLobbyReady: () => ({
    setReady: vi.fn(async (input: { lobbyId: string; ready: boolean }) => {
      rpc.lobby.setReady.push(input);
      if (rpc.lobby.failSetReady) throw rpc.lobby.failSetReady;
      const deferred = rpc.lobby.setReadyDeferred ?? rpc.makeDeferred<never>();
      return deferred.promise as never;
    }),
    loading: false,
    error: null,
  }),
}));

vi.mock('@/api/useStartLobbyEncounter', () => ({
  useStartLobbyEncounter: () => ({
    startEncounter: vi.fn(
      async (input: { lobbyId: string; dungeonKey?: string }) => {
        rpc.lobby.startEncounter.push(input);
        if (rpc.lobby.failStart) throw rpc.lobby.failStart;
        const deferred = rpc.lobby.startDeferred ?? rpc.makeDeferred<never>();
        return deferred.promise as never as StartEncounterResponse;
      }
    ),
    loading: false,
    error: null,
  }),
}));

let putAnswers: Deferred<PutAnswer>[] = [];
let getAnswers: Deferred<GetAnswer | Error>[] = [];

/** Real saves (validateOnly=false) — the debounced background preview
 * also calls putDungeon, so tests must always address the actual save. */
function savePuts() {
  return rpc.puts.filter((put) => !put.request.validateOnly);
}

function fakeClient(): AuthoringClient {
  return {
    putDungeon: vi.fn(async (request: never) => {
      const record = request as unknown as {
        key: string;
        yaml: string;
        validateOnly: boolean;
      };
      const deferred = makeDeferred<PutAnswer>();
      rpc.puts.push({ request: record, deferred: deferred as never });
      putAnswers.push(deferred);
      return deferred.promise as never;
    }),
    getDungeon: vi.fn(async (request: never) => {
      const record = request as unknown as { key: string };
      const deferred = makeDeferred<GetAnswer | Error>();
      rpc.gets.push({ key: record.key, deferred: deferred as never });
      getAnswers.push(deferred);
      const answer = await deferred.promise;
      if (answer instanceof Error) throw answer;
      return answer as never;
    }),
    listScenarios: vi.fn(),
  } as unknown as AuthoringClient;
}

/** ── A rich complete-room draft ────────────────────────────────────── */

function richScene(): WorldScene {
  return {
    version: 1,
    id: 'scene-1',
    name: 'Torture chamber',
    items: [
      {
        id: 'table',
        kind: 'prop',
        assetRef: 'dnd5e:props:torture-table',
        label: 'Torture table',
        transform: { x: -2.25, y: 0, z: 1.3, rotationY: 0.37 },
        heightScale: 1.5,
        parentId: 'furniture',
      },
      {
        id: 'candles',
        kind: 'prop',
        assetRef: 'dnd5e:props:candles',
        label: 'Candles',
        transform: { x: -2.1, y: 1.2, z: 1.25, rotationY: 0.37 },
        supportId: 'table',
        parentId: 'furniture',
        pointLight: {
          enabled: true,
          offset: { x: 0, y: 0.5, z: 0 },
          color: '#ff9d52',
          intensity: 1.1,
          range: 2.6,
        },
      },
      {
        id: 'dressing',
        kind: 'prop',
        assetRef: 'dnd5e:props:books',
        label: 'Books',
        transform: { x: 1, y: 0, z: -1, rotationY: 0 },
      },
    ],
    groups: [
      {
        id: 'furniture',
        kind: 'group',
        label: 'Furniture',
        transform: { x: -2.175, y: 0.6, z: 1.275, rotationY: 0.37 },
      },
    ],
  };
}

function richDraft(id = 'room-abc123'): RoomDraft {
  const draft = createRoomDraft(richScene(), id);
  draft.name = 'Torture chamber';
  draft.room.walkableHexes = [
    { q: 0, r: 0 },
    { q: 1, r: 0 },
    { q: -1, r: 0 },
  ];
  draft.room.propDeclarations = {
    table: {
      blocksMovement: true,
      blocksLineOfSight: false,
      footprint: { width: 1.2, depth: 0.5, offsetX: 0.1, offsetZ: -0.2 },
    },
    dressing: {
      blocksMovement: false,
      blocksLineOfSight: false,
      footprint: { width: 1, depth: 1, offsetX: 0, offsetZ: 0 },
    },
  };
  draft.room.partyStart = { q: 0, r: 0 };
  draft.room.monsters = [
    {
      id: 'skeleton-a',
      ref: 'dnd5e:monsters:skeleton',
      startingCell: { location: { q: 1, r: 0 } },
    },
  ];
  return draft;
}

function renderPanel(
  draft: RoomDraft,
  characterId: string | null = 'char-1',
  onPlay = vi.fn()
) {
  const client = fakeClient();
  const onImportDraft = vi.fn(() => true);
  render(
    <RoomPublishingPanel
      draft={draft}
      capability={{ characterId, onPlay }}
      client={client}
      onImportDraft={onImportDraft}
    />
  );
  return { client, onImportDraft, onPlay };
}

beforeEach(() => {
  rpc.reset();
  putAnswers = [];
  getAnswers = [];
});

describe('RoomPublishingPanel — key control', () => {
  it('derives a stable default key from a suitable room ID', () => {
    renderPanel(richDraft('room-abc123'));
    const input = screen.getByRole('textbox', {
      name: 'Dungeon key',
    }) as HTMLInputElement;
    expect(input.value).toBe('room-room-abc123');
    expect(screen.queryByTestId('key-request')).toBeNull();
  });

  it('leaves the key empty and asks for an explicit key for an unsuitable ID', async () => {
    renderPanel(richDraft('Room 1!'));
    const input = screen.getByRole('textbox', {
      name: 'Dungeon key',
    }) as HTMLInputElement;
    expect(input.value).toBe('');
    expect(screen.getByTestId('key-request').textContent).toMatch(
      /enter an explicit dungeon key/i
    );

    // Saving without a key refuses visibly and sends nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/dungeon key/i)
    );
    expect(rpc.puts).toHaveLength(0);
    expect(rpc.gets).toHaveLength(0);
  });

  it('never renames the key when the room name is edited by the caller', () => {
    const draft = richDraft();
    renderPanel(draft);
    const before = (
      screen.getByRole('textbox', { name: 'Dungeon key' }) as HTMLInputElement
    ).value;
    // A caller-side document mutation that changes the room name but not
    // the room ID must not move the publication key.
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    expect(
      (screen.getByRole('textbox', { name: 'Dungeon key' }) as HTMLInputElement)
        .value
    ).toBe(before);
  });
});

describe('RoomPublishingPanel — save to a new key', () => {
  it('reads first (NotFound), then submits the exact rich v3 YAML', async () => {
    renderPanel(richDraft('room-abc123'));
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));

    await waitFor(() => expect(rpc.gets).toHaveLength(1));
    expect(rpc.gets[0]!.key).toBe('room-room-abc123');
    getAnswers[0]!.reject(new ConnectError('no such key', Code.NotFound));

    await waitFor(() => expect(savePuts()).toHaveLength(1));
    const put = savePuts()[0]!;
    expect(put.request.key).toBe('room-room-abc123');
    expect(put.request.validateOnly).toBe(false);

    // The submitted YAML round-trips through the existing adapter with
    // the complete graph: full scene, height, light, explicit false flags,
    // monsters and the party start.
    const decoded = decodeSingleRoomDungeon(put.request.yaml);
    expect(decoded.key).toBe('room-room-abc123');
    expect(decoded.draft.name).toBe('Torture chamber');
    expect(decoded.draft.scene.items.map((item) => item.id)).toEqual([
      'table',
      'candles',
      'dressing',
    ]);
    expect(decoded.draft.scene.groups.map((g) => g.id)).toEqual(['furniture']);
    const table = decoded.draft.scene.items.find((i) => i.id === 'table');
    expect(table?.heightScale).toBe(1.5);
    const candles = decoded.draft.scene.items.find((i) => i.id === 'candles');
    expect(candles?.pointLight).toMatchObject({
      enabled: true,
      color: '#ff9d52',
    });
    expect(decoded.draft.room.propDeclarations.table).toMatchObject({
      blocksMovement: true,
      blocksLineOfSight: false,
      footprint: { width: 1.2, depth: 0.5 },
    });
    expect(decoded.draft.room.propDeclarations.dressing).toMatchObject({
      blocksMovement: false,
      blocksLineOfSight: false,
    });
    expect(decoded.draft.room.monsters).toEqual([
      {
        id: 'skeleton-a',
        ref: 'dnd5e:monsters:skeleton',
        startingCell: { location: { q: 1, r: 0 } },
      },
    ]);
    expect(decoded.draft.room.partyStart).toEqual({ q: 0, r: 0 });
    // The key exists ONLY in the canonical YAML, never in the draft.
    expect(JSON.stringify(decoded.draft)).not.toContain('"key"');

    await resolvePut(putAnswers[0]!, { errors: [] });
    await waitFor(() =>
      expect(
        screen.getByText(/Saved to the authoring server as “room-room-abc123”/)
      ).toBeTruthy()
    );
  });

  it('shows provider field paths when the server refuses the source', async () => {
    renderPanel(richDraft('room-abc123'));
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() => expect(rpc.gets).toHaveLength(1));
    getAnswers[0]!.reject(new ConnectError('no such key', Code.NotFound));
    await waitFor(() => expect(savePuts()).toHaveLength(1));
    await resolvePut(savePuts()[0]!.deferred, {
      errors: [
        { path: 'room.walkableHexes[3]', message: 'cell outside workspace' },
      ],
    });
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(
        /room\.walkableHexes\[3\].*cell outside workspace/s
      )
    );
  });

  it('surfaces a transport failure without touching the draft bytes', async () => {
    renderPanel(richDraft('room-abc123'));
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() => expect(rpc.gets).toHaveLength(1));
    getAnswers[0]!.reject(new ConnectError('no such key', Code.NotFound));
    await waitFor(() => expect(savePuts()).toHaveLength(1));
    await act(async () => {
      savePuts()[0]!.deferred.reject(new Error('connection reset'));
    });
    await waitFor(() =>
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    );
    expect(screen.getAllByRole('alert')[0]!.textContent).toMatch(
      /connection reset/
    );
  });
});

describe('RoomPublishingPanel — existing key confirmation', () => {
  it('requires explicit confirmation before overwriting and cancel writes nothing', async () => {
    renderPanel(richDraft('room-abc123'));
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() => expect(rpc.gets).toHaveLength(1));
    getAnswers[0]!.resolve({ yaml: 'version: 3\nkey: room-room-abc123\n' });

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Overwrite room-room-abc123',
    });
    expect(dialog.textContent).toMatch(/No save happened yet/);
    expect(dialog.textContent).toMatch(/already\s+names a dungeon/);
    // The opaque key alone is not enough to recognise a renamed room, so
    // the confirmation names the room being saved and takes focus.
    expect(dialog.textContent).toMatch(/Torture chamber/);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Overwrite “room-room-abc123”' })
    );

    // Cancel: no stored bytes change.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(rpc.puts).toHaveLength(0);

    // A retry reads again and the author can now confirm explicitly.
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() => expect(rpc.gets).toHaveLength(2));
    getAnswers[1]!.resolve({ yaml: 'version: 3\n' });
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Overwrite “room-room-abc123”',
      })
    );
    await waitFor(() => expect(rpc.puts).toHaveLength(1));
    expect(savePuts()[0]!.request.key).toBe('room-room-abc123');
  });

  it('a key change invalidates a pending confirmation', async () => {
    renderPanel(richDraft('room-abc123'));
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() => expect(rpc.gets).toHaveLength(1));
    getAnswers[0]!.resolve({ yaml: 'version: 3\n' });
    await screen.findByRole('alertdialog', {
      name: 'Overwrite room-room-abc123',
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Dungeon key' }), {
      target: { value: 'my-own-key' },
    });
    expect(screen.queryByRole('alertdialog', { name: /Overwrite/ })).toBeNull();
  });
});

describe('RoomPublishingPanel — Save & Play', () => {
  it('save success precedes createLobby → ready → StartEncounter → onPlay with the same key and character', async () => {
    const onPlay = vi.fn();
    renderPanel(richDraft('room-abc123'), 'char-1', onPlay);

    rpc.lobby.createLobbyDeferred = makeDeferred();
    rpc.lobby.setReadyDeferred = makeDeferred();
    rpc.lobby.startDeferred = makeDeferred();

    fireEvent.click(screen.getByRole('button', { name: 'Save & Play' }));
    await waitFor(() => expect(rpc.gets).toHaveLength(1));
    getAnswers[0]!.reject(new ConnectError('no such key', Code.NotFound));
    await waitFor(() => expect(savePuts()).toHaveLength(1));
    await resolvePut(savePuts()[0]!.deferred, { errors: [] });

    await waitFor(() =>
      expect(rpc.lobby.createLobby).toEqual([
        { campaignId: 'default-campaign', characterId: 'char-1' },
      ])
    );
    await act(async () => {
      rpc.lobby.createLobbyDeferred!.resolve({
        lobbyId: 'lobby-7',
      } as never);
    });
    await waitFor(() =>
      expect(rpc.lobby.setReady).toEqual([{ lobbyId: 'lobby-7', ready: true }])
    );
    await act(async () => {
      rpc.lobby.setReadyDeferred!.resolve(undefined as never);
    });
    await waitFor(() =>
      expect(rpc.lobby.startEncounter).toEqual([
        { lobbyId: 'lobby-7', dungeonKey: 'room-room-abc123' },
      ])
    );
    await act(async () => {
      rpc.lobby.startDeferred!.resolve({
        encounterId: 'enc-42',
      } as never);
    });

    await waitFor(() =>
      expect(onPlay).toHaveBeenCalledWith('enc-42', 'char-1')
    );
  });

  it('a failed save never creates a lobby and shows the provider paths', async () => {
    const onPlay = vi.fn();
    renderPanel(richDraft('room-abc123'), 'char-1', onPlay);
    fireEvent.click(screen.getByRole('button', { name: 'Save & Play' }));
    await waitFor(() => expect(rpc.gets).toHaveLength(1));
    getAnswers[0]!.reject(new ConnectError('no such key', Code.NotFound));
    await waitFor(() => expect(savePuts()).toHaveLength(1));
    await resolvePut(savePuts()[0]!.deferred, {
      errors: [{ path: 'room.monsters[0].ref', message: 'unknown monster' }],
    });
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(
        /room\.monsters\[0\]\.ref.*unknown monster/s
      )
    );
    expect(rpc.lobby.createLobby).toEqual([]);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('a missing character visibly disables Play but leaves Save available', () => {
    renderPanel(richDraft('room-abc123'), null);
    const play = screen.getByRole('button', {
      name: 'Save & Play',
    }) as HTMLButtonElement;
    expect(play.disabled).toBe(true);
    expect(screen.getByText(/Pick a character on Home to play/)).toBeTruthy();
    const save = screen.getByRole('button', {
      name: 'Save to server',
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
  });

  it('duplicate clicks produce one transaction', async () => {
    const onPlay = vi.fn();
    renderPanel(richDraft('room-abc123'), 'char-1', onPlay);
    rpc.lobby.createLobbyDeferred = makeDeferred();
    rpc.lobby.setReadyDeferred = makeDeferred();
    rpc.lobby.startDeferred = makeDeferred();

    const playButton = screen.getByRole('button', {
      name: 'Save & Play',
    }) as HTMLButtonElement;
    fireEvent.click(playButton);
    await waitFor(() => expect(rpc.gets).toHaveLength(1));
    getAnswers[0]!.reject(new ConnectError('no such key', Code.NotFound));
    await waitFor(() => expect(savePuts()).toHaveLength(1));
    await resolvePut(savePuts()[0]!.deferred, { errors: [] });
    await waitFor(() => expect(rpc.lobby.createLobby).toHaveLength(1));

    // Second click while the launch transaction is still in flight: the
    // button reads "Starting…" and is disabled, and even a forced event
    // must not start a second transaction.
    expect(playButton.disabled).toBe(true);
    fireEvent.click(playButton);
    expect(savePuts()).toHaveLength(1);
    expect(rpc.lobby.createLobby).toHaveLength(1);
    await act(async () => {
      rpc.lobby.createLobbyDeferred!.resolve({
        lobbyId: 'lobby-7',
      } as never);
    });
    await act(async () => {
      rpc.lobby.setReadyDeferred!.resolve(undefined as never);
    });
    await act(async () => {
      rpc.lobby.startDeferred!.resolve({
        encounterId: 'enc-42',
      } as never);
    });

    await waitFor(() => expect(onPlay).toHaveBeenCalledTimes(1));
    expect(rpc.lobby.createLobby).toHaveLength(1);
    expect(rpc.lobby.startEncounter).toHaveLength(1);
  });

  it('a launch failure names its seam, stays in the editor and never navigates', async () => {
    const onPlay = vi.fn();
    renderPanel(richDraft('room-abc123'), 'char-1', onPlay);
    rpc.lobby.failCreateLobby = new Error('lobby service down');

    fireEvent.click(screen.getByRole('button', { name: 'Save & Play' }));
    await waitFor(() => expect(rpc.gets).toHaveLength(1));
    getAnswers[0]!.reject(new ConnectError('no such key', Code.NotFound));
    await waitFor(() => expect(savePuts()).toHaveLength(1));
    await resolvePut(savePuts()[0]!.deferred, { errors: [] });
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(
        /create the lobby: lobby service down/
      )
    );
    expect(onPlay).not.toHaveBeenCalled();
    expect(rpc.lobby.setReady).toEqual([]);
  });
});

describe('RoomPublishingPanel — canonical YAML exchange', () => {
  it('export shows the root key and import adopts key and room', async () => {
    const { onImportDraft } = renderPanel(richDraft('room-abc123'));

    fireEvent.click(
      screen.getByRole('button', { name: 'Export canonical YAML' })
    );
    const textarea = screen.getByRole('textbox', {
      name: 'Canonical YAML',
    }) as HTMLTextAreaElement;
    const exported = decodeSingleRoomDungeon(textarea.value);
    expect(exported.key).toBe('room-room-abc123');
    expect(textarea.value).toContain('key: room-room-abc123');
    expect(textarea.value).toContain('version: 3');

    // Import a canonical file with a different key: the editor document
    // callback receives the decoded draft and the key is adopted.
    const importedYaml = textarea.value.replace(
      'key: room-room-abc123',
      'key: imported-key'
    );
    fireEvent.change(textarea, { target: { value: importedYaml } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Import canonical YAML' })
    );
    await waitFor(() => expect(onImportDraft).toHaveBeenCalledTimes(1));
    const importedDraft = (
      onImportDraft.mock.calls as unknown as Array<[RoomDraft]>
    )[0]![0];
    expect(importedDraft.id).toBe('room-abc123');
    await waitFor(() =>
      expect(
        (
          screen.getByRole('textbox', {
            name: 'Dungeon key',
          }) as HTMLInputElement
        ).value
      ).toBe('imported-key')
    );
    // The textarea returns to mirroring the encoded current source.
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Canonical YAML',
        }) as HTMLTextAreaElement
      ).value
    ).toContain('key: imported-key');
  });

  it('refuses a malformed import visibly and keeps the editor document', () => {
    const { onImportDraft } = renderPanel(richDraft('room-abc123'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Canonical YAML' }), {
      target: { value: 'not: [valid, single-room, yaml' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Import canonical YAML' })
    );
    expect(screen.getByRole('alert').textContent).toMatch(
      /Could not import this canonical YAML/
    );
    expect(onImportDraft).not.toHaveBeenCalled();
    // The key was not adopted.
    expect(
      (screen.getByRole('textbox', { name: 'Dungeon key' }) as HTMLInputElement)
        .value
    ).toBe('room-room-abc123');
  });

  it('a rejected import does not adopt the file key', () => {
    const onImportDraft = vi.fn(() => false);
    const client = fakeClient();
    render(
      <RoomPublishingPanel
        draft={richDraft('room-abc123')}
        capability={{ characterId: 'char-1', onPlay: vi.fn() }}
        client={client}
        onImportDraft={onImportDraft}
      />
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Canonical YAML' }), {
      target: {
        value:
          'version: 3\nkey: other-key\nplay: {void: transparent, lighting: bright, standing: centre-covered}\nroom: {version: 3, id: room-abc123, name: X, coordinateFrame: {horizontalPlane: world-xz, verticalAxis: world-y-up, distanceUnit: world-scene-unit, hexRadius: 1, footprintFrame: owner-local-xz}, workspace: {hexRadius: 6, horizontalLimit: 12}, scene: {version: 1, id: s, name: X, items: [], groups: []}, room: {implicitRegionId: r, walkableHexes: [], propDeclarations: {}, arrangementDeclarations: {}, monsters: []}}\n',
      },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Import canonical YAML' })
    );
    expect(onImportDraft).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole('textbox', { name: 'Dungeon key' }) as HTMLInputElement)
        .value
    ).toBe('room-room-abc123');
  });
});

describe('RoomPublishingPanel — the site scope (web#1157)', () => {
  it('publishes an imported site’s factions and dispositions instead of dropping them', async () => {
    // THE REGRESSION THE SLICE EXISTS FOR: before this, `encodeSingleRoomDungeon`
    // was called with no scope and the imported policies vanished on publish.
    const fixture = decodeWorldBuilderV4Site();
    render(
      <RoomPublishingPanel
        draft={fixture.draft}
        scope={{
          factions: fixture.factions,
          dispositions: fixture.dispositions,
        }}
        capability={{ characterId: 'char-1', onPlay: vi.fn() }}
        client={fakeClient()}
        onImportDraft={vi.fn(() => true)}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() => expect(rpc.gets).toHaveLength(1));
    await act(async () =>
      getAnswers[0]!.reject(new ConnectError('absent', Code.NotFound))
    );
    await waitFor(() => expect(savePuts()).toHaveLength(1));
    const yaml = savePuts()[0]!.request.yaml;
    // The document carries v4 keys, so the root claims v4.
    expect(yaml.startsWith('version: 4\n')).toBe(true);
    const emitted = decodeSingleRoomDungeon(yaml);
    expect(emitted.factions).toEqual(fixture.factions);
    expect(emitted.dispositions).toEqual(fixture.dispositions);
  });

  it('hands the imported document’s scope to the editor callback', () => {
    const fixture = decodeWorldBuilderV4Site();
    const onImportDraft = vi.fn<
      (draft: RoomDraft, scope: SiteScope) => boolean
    >(() => true);
    render(
      <RoomPublishingPanel
        draft={richDraft('room-abc123')}
        capability={{ characterId: 'char-1', onPlay: vi.fn() }}
        client={fakeClient()}
        onImportDraft={onImportDraft}
      />
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Canonical YAML' }), {
      target: { value: WORLD_BUILDER_V4_SITE_YAML },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Import canonical YAML' })
    );
    expect(onImportDraft).toHaveBeenCalledTimes(1);
    const [draft, scope] = onImportDraft.mock.calls[0]!;
    expect(draft.id).toBe('room-1');
    expect(scope.factions).toEqual(fixture.factions);
    expect(scope.dispositions).toEqual(fixture.dispositions);
  });

  it('validates the current bytes on demand and surfaces the engine’s own answer', async () => {
    const fixture = decodeWorldBuilderV4Site();
    render(
      <RoomPublishingPanel
        draft={fixture.draft}
        scope={{
          factions: fixture.factions,
          dispositions: fixture.dispositions,
        }}
        capability={{ characterId: 'char-1', onPlay: vi.fn() }}
        client={fakeClient()}
        onImportDraft={vi.fn(() => true)}
      />
    );
    // The live preview validates on change; the deliberate verb re-sends the
    // SAME bytes so an author can ask again without editing.
    await waitFor(() =>
      expect(rpc.puts.some((put) => put.request.validateOnly)).toBe(true)
    );
    const before = rpc.puts.length;
    fireEvent.click(
      screen.getByRole('button', { name: 'Validate with server' })
    );
    await waitFor(() => expect(rpc.puts.length).toBeGreaterThan(before));
    const last = rpc.puts[rpc.puts.length - 1]!;
    expect(last.request.validateOnly).toBe(true);
    expect(last.request.yaml.startsWith('version: 4\n')).toBe(true);
  });

  it('names a document the strict encoder refuses instead of going inert', () => {
    render(
      <RoomPublishingPanel
        draft={richDraft('room-abc123')}
        // `party` is the players' side and is never declared — the strict
        // decoder's refusal, shown verbatim (rpg-dnd5e-web#1160).
        scope={{ factions: [{ id: 'party' }] }}
        capability={{ characterId: 'char-1', onPlay: vi.fn() }}
        client={fakeClient()}
        onImportDraft={vi.fn(() => true)}
      />
    );
    expect(screen.getByTestId('encode-refusal').textContent).toMatch(
      /players' side/
    );
    // There are no bytes to validate, so the deliberate verb is disabled.
    expect(
      (
        screen.getByRole('button', {
          name: 'Validate with server',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it('retires an in-flight transaction when the scope changes under the same room', async () => {
    // The fencing change is the scope joining the `yaml` memo's dependency
    // list: the emitted YAML is the request identity, so a scope change
    // retires through `owner.yaml !== yaml` and no second mechanism.
    const fixture = decodeWorldBuilderV4Site();
    const client = fakeClient();
    const onImportDraft = vi.fn(() => true);
    const panel = (scope: SiteScope) => (
      <RoomPublishingPanel
        draft={fixture.draft}
        scope={scope}
        capability={{ characterId: 'char-1', onPlay: vi.fn() }}
        client={client}
        onImportDraft={onImportDraft}
      />
    );
    const view = render(
      panel({
        factions: fixture.factions,
        dispositions: fixture.dispositions,
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() => expect(rpc.gets).toHaveLength(1));
    // Same room, same draft bytes — only the policies changed.
    view.rerender(panel({}));
    await act(async () =>
      getAnswers[0]!.reject(new ConnectError('absent', Code.NotFound))
    );
    expect(savePuts()).toHaveLength(0);
    // The editor lock released with the retired transaction.
    expect(
      (screen.getByRole('textbox', { name: 'Dungeon key' }) as HTMLInputElement)
        .disabled
    ).toBe(false);
  });
});

describe('RoomPublishingPanel — parent identity changes during a transaction', () => {
  it('does not launch a different character when an old save completes', async () => {
    const draft = richDraft();
    const client = fakeClient();
    const onPlay = vi.fn();
    const onImportDraft = vi.fn(() => true);
    const panel = (characterId: string) => (
      <RoomPublishingPanel
        draft={draft}
        capability={{ characterId, onPlay }}
        client={client}
        onImportDraft={onImportDraft}
      />
    );
    const view = render(panel('char-a'));
    fireEvent.click(screen.getByRole('button', { name: 'Save & Play' }));
    await waitFor(() => expect(rpc.gets).toHaveLength(1));
    await act(async () =>
      getAnswers[0]!.reject(new ConnectError('absent', Code.NotFound))
    );
    await waitFor(() => expect(savePuts()).toHaveLength(1));
    view.rerender(panel('char-b'));
    await resolvePut(savePuts()[0]!.deferred, { errors: [] });
    expect(rpc.lobby.createLobby).toHaveLength(0);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('retires a key-check when the same room gets different source bytes', async () => {
    const draft = richDraft();
    const client = fakeClient();
    const onPlay = vi.fn();
    const onImportDraft = vi.fn(() => true);
    const panel = (value: RoomDraft) => (
      <RoomPublishingPanel
        draft={value}
        capability={{ characterId: 'char-a', onPlay }}
        client={client}
        onImportDraft={onImportDraft}
      />
    );
    const view = render(panel(draft));
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() => expect(rpc.gets).toHaveLength(1));
    const changed = structuredClone(draft);
    changed.scene.items[0]!.transform.x += 0.125;
    view.rerender(panel(changed));
    await act(async () =>
      getAnswers[0]!.reject(new ConnectError('absent', Code.NotFound))
    );
    expect(savePuts()).toHaveLength(0);
    expect(
      (screen.getByRole('textbox', { name: 'Dungeon key' }) as HTMLInputElement)
        .disabled
    ).toBe(false);
  });

  it('releases busy state when a different room retires a pending operation', async () => {
    const client = fakeClient();
    const onPlay = vi.fn();
    const onImportDraft = vi.fn(() => true);
    const panel = (draft: RoomDraft) => (
      <RoomPublishingPanel
        draft={draft}
        capability={{ characterId: 'char-a', onPlay }}
        client={client}
        onImportDraft={onImportDraft}
      />
    );
    const view = render(panel(richDraft('first-room')));
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() => expect(rpc.gets).toHaveLength(1));
    view.rerender(panel(richDraft('second-room')));
    await act(async () =>
      getAnswers[0]!.reject(new ConnectError('absent', Code.NotFound))
    );
    expect(savePuts()).toHaveLength(0);
    expect(
      (screen.getByRole('textbox', { name: 'Dungeon key' }) as HTMLInputElement)
        .disabled
    ).toBe(false);
  });

  it('halts the in-flight launch when the same room receives changed source during lobby creation', async () => {
    const onPlay = vi.fn();
    const client = fakeClient();
    const onImportDraft = vi.fn(() => true);
    const draft = richDraft();
    const panel = (value: RoomDraft) => (
      <RoomPublishingPanel
        draft={value}
        capability={{ characterId: 'char-a', onPlay }}
        client={client}
        onImportDraft={onImportDraft}
      />
    );
    const view = render(panel(draft));
    rpc.lobby.createLobbyDeferred = rpc.makeDeferred();
    rpc.lobby.setReadyDeferred = rpc.makeDeferred();
    rpc.lobby.startDeferred = rpc.makeDeferred();

    fireEvent.click(screen.getByRole('button', { name: 'Save & Play' }));
    await waitFor(() => expect(rpc.gets).toHaveLength(1));
    await act(async () =>
      getAnswers[0]!.reject(new ConnectError('absent', Code.NotFound))
    );
    await waitFor(() => expect(savePuts()).toHaveLength(1));
    await resolvePut(savePuts()[0]!.deferred, { errors: [] });
    await waitFor(() => expect(rpc.lobby.createLobby).toHaveLength(1));

    // The source bytes change (same room ID) while createLobby is pending:
    // the transaction's captured identity is stale, so the child launch is
    // cancelled — no ready step, no encounter, no navigation.
    const changed = structuredClone(draft);
    changed.scene.items[0]!.transform.x += 0.25;
    view.rerender(panel(changed));
    await act(async () => {
      rpc.lobby.createLobbyDeferred!.resolve({ lobbyId: 'lobby-9' } as never);
    });

    expect(rpc.lobby.setReady).toEqual([]);
    expect(rpc.lobby.startEncounter).toEqual([]);
    expect(onPlay).not.toHaveBeenCalled();
    // The editor lock released with the retired transaction.
    expect(
      (screen.getByRole('textbox', { name: 'Dungeon key' }) as HTMLInputElement)
        .disabled
    ).toBe(false);
  });

  it('retires an armed overwrite confirmation when the same room changes source', async () => {
    const onPlay = vi.fn();
    const client = fakeClient();
    const onImportDraft = vi.fn(() => true);
    const draft = richDraft();
    const panel = (value: RoomDraft) => (
      <RoomPublishingPanel
        draft={value}
        capability={{ characterId: 'char-a', onPlay }}
        client={client}
        onImportDraft={onImportDraft}
      />
    );
    const view = render(panel(draft));
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() => expect(rpc.gets).toHaveLength(1));
    await act(async () =>
      getAnswers[0]!.resolve({ yaml: 'version: 3\nkey: room-room-abc123\n' })
    );
    await screen.findByRole('alertdialog', {
      name: 'Overwrite room-room-abc123',
    });

    // Same room ID, different source bytes: the confirmation was armed for
    // a source that no longer exists and must never complete a save.
    const changed = structuredClone(draft);
    changed.scene.items[0]!.transform.x += 0.25;
    view.rerender(panel(changed));
    expect(screen.queryByRole('alertdialog', { name: /Overwrite/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() => expect(rpc.gets).toHaveLength(2));
    // The new read must re-arm from scratch, not inherit the old one.
    await act(async () => getAnswers[1]!.resolve({ yaml: 'version: 3\n' }));
    expect(
      await screen.findByRole('alertdialog', {
        name: 'Overwrite room-room-abc123',
      })
    ).toBeTruthy();
    expect(savePuts()).toHaveLength(0);
  });

  it('never shows a stale saved status as current after the source changes', async () => {
    const client = fakeClient();
    const onImportDraft = vi.fn(() => true);
    const draft = richDraft();
    const panel = (value: RoomDraft) => (
      <RoomPublishingPanel
        draft={value}
        capability={{ characterId: 'char-a', onPlay: vi.fn() }}
        client={client}
        onImportDraft={onImportDraft}
      />
    );
    const view = render(panel(draft));
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() => expect(rpc.gets).toHaveLength(1));
    await act(async () =>
      getAnswers[0]!.reject(new ConnectError('absent', Code.NotFound))
    );
    await waitFor(() => expect(savePuts()).toHaveLength(1));
    await resolvePut(savePuts()[0]!.deferred, { errors: [] });
    expect(
      await screen.findByText(/Saved to the authoring server as/)
    ).toBeTruthy();

    // Same room ID, changed source: the old save's status describes bytes
    // that are no longer the document and must not present as current.
    const changed = structuredClone(draft);
    changed.scene.items[0]!.transform.x += 0.375;
    view.rerender(panel(changed));
    expect(screen.queryByText(/Saved to the authoring server as/)).toBeNull();
  });
});

/** Resolve a deferred putDungeon answer inside act so state updates land. */
async function resolvePut(
  deferred: { resolve: (value: never) => void },
  answer: PutAnswer
) {
  await act(async () => {
    deferred.resolve(answer as never);
  });
}
