import type { CompositionSource } from '@/compositions/compositionSource';
import { encodeRoomDocument } from '@/compositions/roomDocument';
import { create } from '@bufbuild/protobuf';
import { CompositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRoomDraft,
  LEGACY_ROOM_DRAFT_STORAGE_KEY,
  ROOM_DRAFT_STORAGE_KEY,
  stringifyRoomDraft,
  type RoomDraft,
} from './roomDraft';
import { createEmptyScene } from './sceneState';
import { SCENE_STORAGE_KEY, stringifyScene } from './serialization';
import type { KeyValueStorage, WorldScene, WorldTransform } from './types';
import { WorldBuildingConcept } from './WorldBuildingConcept';

const DRAG_MIME = 'application/x-rpg-world-building-item+json';

vi.mock('@/compositions/CompositionThumbnailRenderer', () => ({
  ThumbnailRenderer: () => null,
}));

/** Deferred authoring/lobby seams for the publishing busy-boundary tests:
 * a held putDungeon keeps the Save & Play transaction (and its editor
 * interaction lock) in flight deterministically. */
const publishRpc = vi.hoisted(() => {
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
    gets: [] as Array<{ deferred: ReturnType<typeof makeDeferred<never>> }>,
    puts: [] as Array<{ deferred: ReturnType<typeof makeDeferred<never>> }>,
    lobby: { created: 0, ready: 0, started: 0 },
    reset: () => {
      publishRpc.gets.length = 0;
      publishRpc.puts.length = 0;
      publishRpc.lobby.created = 0;
      publishRpc.lobby.ready = 0;
      publishRpc.lobby.started = 0;
    },
  };
});

vi.mock('@/author/authoringRpc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/author/authoringRpc')>();
  return {
    ...actual,
    defaultAuthoringClient: {
      putDungeon: vi.fn(async () => {
        const deferred = publishRpc.makeDeferred<never>();
        publishRpc.puts.push({ deferred });
        return deferred.promise as never;
      }),
      getDungeon: vi.fn(async () => {
        const deferred = publishRpc.makeDeferred<never>();
        publishRpc.gets.push({ deferred });
        return deferred.promise as never;
      }),
      listScenarios: vi.fn(),
    },
  };
});

vi.mock('@/api/useCreateLobby', () => ({
  useCreateLobby: () => ({
    createLobby: vi.fn(async () => {
      publishRpc.lobby.created += 1;
      return { lobbyId: 'lobby-1' } as never;
    }),
    loading: false,
    error: null,
  }),
}));

vi.mock('@/api/useSetLobbyReady', () => ({
  useSetLobbyReady: () => ({
    setReady: vi.fn(async () => {
      publishRpc.lobby.ready += 1;
    }),
    loading: false,
    error: null,
  }),
}));

vi.mock('@/api/useStartLobbyEncounter', () => ({
  useStartLobbyEncounter: () => ({
    startEncounter: vi.fn(async () => {
      publishRpc.lobby.started += 1;
      return { encounterId: 'enc-1' } as never;
    }),
    loading: false,
    error: null,
  }),
}));

vi.mock('./WorldBuildingViewport', () => ({
  WorldBuildingViewport: (props: {
    scene: WorldScene;
    previewScene: WorldScene | null;
    selectedIds: string[];
    tool: 'select' | 'move' | 'rotate';
    onSelect: (ids: string[]) => void;
    onDrop: (
      payload: { kind: 'prop' | 'arrangement'; id: string },
      target:
        | { kind: 'ground'; point: { x: number; z: number } }
        | {
            kind: 'surface';
            point: { x: number; y: number; z: number };
            supportId: string;
          }
    ) => void;
    onDragFinished: () => void;
    onTransformPreview: (scene: WorldScene | null) => void;
    onTransformCommit: (scene: WorldScene) => void;
    onTransformReject: (message: string) => void;
    roomAuthoring?: {
      tool: string;
      repeat?: {
        assetRef: string;
        step: number;
        originOffset: number;
        maxCount: number;
      };
      onRepeatGesture?: (
        assetRef: string,
        transforms: readonly WorldTransform[]
      ) => void;
      onWalkableGesture: (
        cells: Array<{ q: number; r: number }>,
        mode: 'paint' | 'erase'
      ) => void;
      monsters?: Array<{
        id: string;
        ref: string;
        cell: { q: number; r: number };
      }>;
      partyStart?: { q: number; r: number } | null;
      selectedActorId?: string | null;
      onPlaceMonster?: (cell: { q: number; r: number }) => void;
      onMoveMonster?: (id: string, cell: { q: number; r: number }) => void;
      onStartGesture?: (cell: { q: number; r: number }) => void;
      onSelectActor?: (actor: string | null) => void;
    };
  }) => {
    const readPayload = (event: React.DragEvent) => {
      try {
        return JSON.parse(event.dataTransfer.getData(DRAG_MIME));
      } catch {
        return null;
      }
    };
    const moved = (base: WorldScene, amount: number): WorldScene => ({
      ...base,
      items: base.items.map((item) =>
        props.selectedIds.includes(item.id) ||
        item.supportId === props.selectedIds[0]
          ? {
              ...item,
              transform: { ...item.transform, x: item.transform.x + amount },
            }
          : item
      ),
    });
    return (
      <div data-testid="mock-world-viewport">
        <output data-testid="viewport-scene">
          {JSON.stringify(props.scene)}
        </output>
        <output data-testid="viewport-displayed-scene">
          {JSON.stringify(props.previewScene ?? props.scene)}
        </output>
        <output data-testid="viewport-selection">
          {props.selectedIds.join(',')}
        </output>
        <output data-testid="viewport-tool">{props.tool}</output>
        <output data-testid="viewport-room-tool">
          {props.roomAuthoring?.tool ?? ''}
        </output>
        <div
          data-testid="canvas-ground"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const payload = readPayload(event);
            props.onDragFinished();
            if (payload) {
              props.onDrop(payload, {
                kind: 'ground',
                point: { x: 0.13, z: -0.27 },
              });
            }
          }}
        />
        <div
          data-testid="canvas-tabletop"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const payload = readPayload(event);
            props.onDragFinished();
            if (payload && props.scene.items[0]) {
              props.onDrop(payload, {
                kind: 'surface',
                point: { x: 0.22, y: 0.9685, z: -0.18 },
                supportId: props.scene.items[0].id,
              });
            }
          }}
        />
        <button onClick={() => props.onSelect([])}>Canvas left click</button>
        <button
          onClick={() => props.onTransformPreview(moved(props.scene, 0.75))}
        >
          Preview gizmo move
        </button>
        <button
          onClick={() =>
            props.onTransformCommit(props.previewScene ?? props.scene)
          }
        >
          Release gizmo
        </button>
        <button onClick={() => props.onTransformPreview(null)}>
          Cancel gizmo
        </button>
        {props.roomAuthoring && (
          <>
            <button
              onClick={() => {
                const repeat = props.roomAuthoring?.repeat;
                if (!repeat) return;
                props.roomAuthoring?.onRepeatGesture?.(repeat.assetRef, [
                  { x: repeat.originOffset, y: 0, z: 0, rotationY: 0 },
                  {
                    x: repeat.originOffset + repeat.step,
                    y: 0,
                    z: 0,
                    rotationY: 0,
                  },
                ]);
              }}
            >
              Commit repeat gesture
            </button>
            <button
              onClick={() =>
                props.roomAuthoring?.onWalkableGesture(
                  [
                    { q: 0, r: 0 },
                    { q: 1, r: 0 },
                  ],
                  'paint'
                )
              }
            >
              Commit rectangle gesture
            </button>
            <button
              onClick={() =>
                props.roomAuthoring?.onWalkableGesture(
                  [{ q: 5, r: -5 }],
                  'erase'
                )
              }
            >
              Erase empty cell
            </button>
            <button
              onClick={() =>
                props.roomAuthoring?.onPlaceMonster?.({ q: 1, r: 0 })
              }
            >
              Commit monster gesture
            </button>
            <button
              onClick={() => {
                const actor = props.roomAuthoring?.selectedActorId;
                if (actor && actor !== 'start')
                  props.roomAuthoring?.onMoveMonster?.(actor, {
                    q: 2,
                    r: -2,
                  });
              }}
            >
              Commit monster move gesture
            </button>
            <button
              onClick={() =>
                props.roomAuthoring?.onStartGesture?.({ q: 0, r: 0 })
              }
            >
              Commit start gesture
            </button>
            <output data-testid="viewport-actors">
              {JSON.stringify({
                monsters: props.roomAuthoring?.monsters ?? [],
                partyStart: props.roomAuthoring?.partyStart ?? null,
                selectedActorId: props.roomAuthoring?.selectedActorId ?? null,
              })}
            </output>
          </>
        )}
        <button
          onClick={() =>
            props.onTransformReject(
              'Transform rejected; drag-start positions were restored.'
            )
          }
        >
          Reject gizmo
        </button>
      </div>
    );
  },
}));

class TransferStub {
  values = new Map<string, string>();
  effectAllowed = 'uninitialized';
  dropEffect = 'none';
  getData(type: string): string {
    return this.values.get(type) ?? '';
  }
  setData(type: string, value: string): void {
    this.values.set(type, value);
  }
}

class MemoryStorage implements KeyValueStorage {
  values = new Map<string, string>();
  failGet = false;
  failSet = false;
  writes = 0;
  getItem(key: string): string | null {
    if (this.failGet) throw new Error('storage blocked');
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failSet) throw new Error('quota blocked');
    this.writes += 1;
    this.values.set(key, value);
  }
}

const deterministicIds = () => {
  let index = 0;
  return () => `id-${++index}`;
};

function scene(): WorldScene {
  return JSON.parse(screen.getByTestId('viewport-scene').textContent ?? '{}');
}

function displayedScene(): WorldScene {
  return JSON.parse(
    screen.getByTestId('viewport-displayed-scene').textContent ?? '{}'
  );
}

function dragLabelTo(label: string, targetTestId = 'canvas-ground') {
  const transfer = new TransferStub();
  const source = screen.getByLabelText(label);
  fireEvent.dragStart(source, { dataTransfer: transfer });
  fireEvent.dragOver(screen.getByTestId(targetTestId), {
    dataTransfer: transfer,
  });
  fireEvent.drop(screen.getByTestId(targetTestId), { dataTransfer: transfer });
  fireEvent.dragEnd(source, { dataTransfer: transfer });
  return transfer;
}

afterEach(() => vi.restoreAllMocks());

function worldSource(initial: WorldScene[] = []): {
  source: CompositionSource;
  createComposition: ReturnType<typeof vi.fn>;
  getComposition: ReturnType<typeof vi.fn>;
  listCompositions: ReturnType<typeof vi.fn>;
  deleteComposition: ReturnType<typeof vi.fn>;
} {
  const records = initial.map((entry, index) =>
    create(CompositionSchema, {
      id: `composition-${index + 1}`,
      worldId: 'test-world',
      json: stringifyScene(entry),
    })
  );
  const createComposition = vi.fn(async (worldId: string, json: string) => {
    const record = create(CompositionSchema, {
      id: `composition-${records.length + 1}`,
      worldId,
      json,
    });
    records.push(record);
    return record;
  });
  const getComposition = vi.fn(
    async (_worldId: string, id: string) =>
      records.find((entry) => entry.id === id) ?? null
  );
  const listCompositions = vi.fn(async () => [...records]);
  const deleteComposition = vi.fn(async (_worldId: string, id: string) => {
    const index = records.findIndex((entry) => entry.id === id);
    if (index >= 0) records.splice(index, 1);
  });
  return {
    source: {
      worldId: 'test-world',
      reader: { getComposition, listCompositions },
      writer: { createComposition, deleteComposition },
    },
    createComposition,
    getComposition,
    listCompositions,
    deleteComposition,
  };
}

describe('WorldBuildingConcept drag-to-add and gizmo shell', () => {
  it('applies normal height to a mixed group and restores both heights with one Undo', () => {
    const storage = new MemoryStorage();
    const draft = createRoomDraft(
      createEmptyScene('height-scene'),
      'height-room'
    );
    draft.scene.groups = [
      {
        id: 'wall-run',
        kind: 'group',
        label: 'Wall run',
        transform: { x: 0, y: 0, z: 0, rotationY: 0 },
      },
    ];
    draft.scene.items = [1, 1.5].map((heightScale, index) => ({
      id: `wall-${index}`,
      kind: 'prop',
      label: `Wall ${index}`,
      assetRef: 'dnd5e:env:dark-fortress:45_wall_01',
      parentId: 'wall-run',
      transform: { x: index * 2, y: 0, z: 0, rotationY: 0 },
      heightScale,
    }));
    storage.setItem(ROOM_DRAFT_STORAGE_KEY, stringifyRoomDraft(draft));
    render(<WorldBuildingConcept roomMode storage={storage} />);
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select Wall run wall-run' })
    );
    expect(screen.getByText('Height scale · Mixed')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Height scale percent'), {
      target: { value: '100' },
    });
    const apply = screen.getByRole('button', {
      name: 'Apply height',
    }) as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);
    expect(scene().items.map((item) => item.heightScale)).toEqual([1, 1]);
    expect(scene().items.map((item) => item.transform)).toEqual(
      draft.scene.items.map((item) => item.transform)
    );
    expect(apply.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(scene().items.map((item) => item.heightScale)).toEqual([1, 1.5]);
    expect(
      (screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it('searches, places, groups, exports, and reopens a generated exact ref with legacy assets', () => {
    const storage = new MemoryStorage();
    const ids = deterministicIds();
    const mounted = render(
      <WorldBuildingConcept storage={storage} idFactory={ids} />
    );
    fireEvent.change(screen.getByLabelText('Search assets'), {
      target: { value: 'dnd5e:props:dark-fortress:alchemy_tools_01' },
    });
    expect(
      screen.getAllByLabelText('Drag Alchemy Tools 01 into scene')
    ).toHaveLength(1);
    dragLabelTo('Drag Alchemy Tools 01 into scene');
    expect(scene().items[0]).toMatchObject({
      assetRef: 'dnd5e:props:dark-fortress:alchemy_tools_01',
      transform: { x: 0.13, y: 0, z: -0.27, rotationY: 0 },
    });

    fireEvent.change(screen.getByLabelText('Search assets'), {
      target: { value: 'books' },
    });
    dragLabelTo('Drag Books into scene');
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /Select dark fortress alchemy tools 01 id-2/i,
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Group selection' }));
    expect(scene().groups).toHaveLength(1);
    expect(scene().items.map((item) => item.assetRef)).toEqual([
      'dnd5e:props:dark-fortress:alchemy_tools_01',
      'dnd5e:props:books',
    ]);

    URL.createObjectURL = vi.fn(() => 'blob:world-building');
    URL.revokeObjectURL = vi.fn();
    fireEvent.click(screen.getByRole('button', { name: 'Export scene JSON' }));
    const portable = (
      screen.getByLabelText('Portable JSON') as HTMLTextAreaElement
    ).value;
    expect(JSON.parse(portable).scene.items[0].assetRef).toBe(
      'dnd5e:props:dark-fortress:alchemy_tools_01'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save local draft' }));
    mounted.unmount();

    render(<WorldBuildingConcept storage={storage} idFactory={ids} />);
    expect(scene().items.map((item) => item.assetRef)).toEqual([
      'dnd5e:props:dark-fortress:alchemy_tools_01',
      'dnd5e:props:books',
    ]);
  });

  it('keeps Select / Move / Rotate visible and never arms placement from ordinary clicks', () => {
    render(
      <WorldBuildingConcept
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
      />
    );

    const toolbar = screen.getByRole('toolbar', { name: 'Manipulation tools' });
    expect(toolbar).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Select' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.getByRole('button', { name: 'Move' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rotate' })).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Drag Books into scene'));
    fireEvent.click(screen.getByRole('button', { name: 'Canvas left click' }));
    expect(scene().items).toHaveLength(0);
    expect(screen.getByTestId('viewport-tool').textContent).toBe('select');
  });

  it('creates exactly one selected prop from a valid ground drop and exposes Move', () => {
    render(
      <WorldBuildingConcept
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
      />
    );

    dragLabelTo('Drag Books into scene');
    expect(scene().items).toHaveLength(1);
    expect(scene().items[0]).toMatchObject({
      id: 'id-2',
      assetRef: 'dnd5e:props:books',
      transform: { x: 0.13, y: 0, z: -0.27, rotationY: 0 },
    });
    expect(screen.getByTestId('viewport-selection').textContent).toBe('id-2');
    expect(screen.getByTestId('viewport-tool').textContent).toBe('move');
    expect(
      screen.getByRole('button', { name: 'Move' }).getAttribute('aria-pressed')
    ).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(scene().items).toHaveLength(0);
  });

  it('authors, edits, toggles, and removes a visual point light on the selected prop', () => {
    render(
      <WorldBuildingConcept
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
      />
    );
    dragLabelTo('Drag Candles into scene');

    fireEvent.click(screen.getByRole('button', { name: 'Add point light' }));
    expect(scene().items[0]!.pointLight).toEqual({
      enabled: true,
      offset: { x: 0, y: 0.5, z: 0 },
      color: '#ff9d52',
      intensity: 1.1,
      range: 2.6,
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Light enabled' }));
    fireEvent.change(screen.getByLabelText('Light offset X'), {
      target: { value: '0.25' },
    });
    fireEvent.change(screen.getByLabelText('Light color'), {
      target: { value: '#abcdef' },
    });
    fireEvent.change(screen.getByLabelText('Light intensity'), {
      target: { value: '2.5' },
    });
    fireEvent.change(screen.getByLabelText('Light range'), {
      target: { value: '4.5' },
    });
    expect(scene().items[0]!.pointLight).toMatchObject({
      enabled: false,
      offset: { x: 0.25 },
      color: '#abcdef',
      intensity: 2.5,
      range: 4.5,
    });

    const imported = scene();
    imported.items[0]!.pointLight!.color = '#ABCDEF';
    fireEvent.change(screen.getByLabelText('Portable JSON'), {
      target: {
        value: JSON.stringify({
          kind: 'rpg-world-building-scene',
          version: 1,
          scene: imported,
        }),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import scene JSON' }));
    expect(scene().items).toHaveLength(1);
    fireEvent.click(screen.getByLabelText(/Select candles/i));
    expect(
      (screen.getByLabelText('Light color') as HTMLInputElement).value
    ).toBe('#abcdef');
    expect(scene().items[0]!.pointLight!.color).toBe('#ABCDEF');

    fireEvent.click(screen.getByRole('button', { name: 'Remove point light' }));
    expect(scene().items[0]!.pointLight).toBeUndefined();
  });

  it('records exact tabletop height/support from one valid prop drop', () => {
    render(
      <WorldBuildingConcept
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
      />
    );
    dragLabelTo('Drag Torture Table into scene');
    dragLabelTo('Drag Candles into scene', 'canvas-tabletop');

    expect(scene().items).toHaveLength(2);
    expect(scene().items[1]).toMatchObject({
      assetRef: 'dnd5e:props:candles',
      supportId: 'id-2',
      transform: { x: 0.22, y: 0.9685, z: -0.18 },
    });
  });

  it('leaves scene/history/identity allocation untouched for malformed, external, and unknown drops', () => {
    render(
      <WorldBuildingConcept
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
      />
    );
    const ground = screen.getByTestId('canvas-ground');

    fireEvent.drop(ground, { dataTransfer: new TransferStub() });
    const malformed = new TransferStub();
    malformed.setData(DRAG_MIME, 'not json');
    fireEvent.drop(ground, { dataTransfer: malformed });
    const unknown = new TransferStub();
    unknown.setData(
      DRAG_MIME,
      JSON.stringify({ kind: 'prop', id: 'https://invalid.example/evil.glb' })
    );
    fireEvent.drop(ground, { dataTransfer: unknown });
    expect(scene().items).toHaveLength(0);
    expect(
      (screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);

    dragLabelTo('Drag Vase into scene');
    expect(scene().items[0]!.id).toBe('id-2');
  });

  it('previews without persistence/history, cancels cleanly, then commits one undoable gizmo action', () => {
    const storage = new MemoryStorage();
    render(
      <WorldBuildingConcept storage={storage} idFactory={deterministicIds()} />
    );
    dragLabelTo('Drag Books into scene');
    const start = structuredClone(scene());
    const writesAfterDrop = storage.writes;

    fireEvent.click(screen.getByRole('button', { name: 'Preview gizmo move' }));
    expect(displayedScene().items[0]!.transform.x).toBeCloseTo(
      start.items[0]!.transform.x + 0.75
    );
    expect(scene()).toEqual(start);
    expect(storage.writes).toBe(writesAfterDrop);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel gizmo' }));
    expect(displayedScene()).toEqual(start);
    expect(scene()).toEqual(start);
    expect(storage.writes).toBe(writesAfterDrop);

    fireEvent.click(screen.getByRole('button', { name: 'Preview gizmo move' }));
    fireEvent.click(screen.getByRole('button', { name: 'Release gizmo' }));
    expect(scene().items[0]!.transform.x).toBeCloseTo(
      start.items[0]!.transform.x + 0.75
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(scene().items[0]!.transform).toEqual(start.items[0]!.transform);
  });

  it('previews and commits a support relationship closure without moving it twice', () => {
    render(
      <WorldBuildingConcept
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
      />
    );
    dragLabelTo('Drag Torture Table into scene');
    dragLabelTo('Drag Candles into scene', 'canvas-tabletop');
    const start = structuredClone(scene());
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Select Torture Table id-2/i })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Preview gizmo move' }));
    fireEvent.click(screen.getByRole('button', { name: 'Release gizmo' }));
    expect(scene().items[0]!.transform.x).toBeCloseTo(
      start.items[0]!.transform.x + 0.75
    );
    expect(scene().items[1]!.transform.x).toBeCloseTo(
      start.items[1]!.transform.x + 0.75
    );
  });

  it('rejects an invalid final gizmo result without a commit', () => {
    render(
      <WorldBuildingConcept
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
      />
    );
    dragLabelTo('Drag Books into scene');
    const start = scene();
    fireEvent.click(screen.getByRole('button', { name: 'Preview gizmo move' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject gizmo' }));

    expect(scene()).toEqual(start);
    expect(displayedScene()).toEqual(start);
    expect(screen.getByRole('alert').textContent).toMatch(
      /positions were restored/i
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(scene().items).toHaveLength(0);
  });

  it('drags an arrangement to independent ground stamps with fresh remapped relationships', () => {
    render(
      <WorldBuildingConcept
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
        now={() => '2026-09-05T00:00:00.000Z'}
      />
    );
    dragLabelTo('Drag Torture Table into scene');
    dragLabelTo('Drag Candles into scene', 'canvas-tabletop');
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Select Torture Table id-2/i })
    );
    fireEvent.change(screen.getByLabelText('Arrangement name'), {
      target: { value: 'Decorated table' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save selection' }));

    dragLabelTo('Drag Decorated table arrangement onto ground');
    dragLabelTo('Drag Decorated table arrangement onto ground');
    const stamped = scene();
    expect(stamped.items).toHaveLength(6);
    const firstStamp = stamped.items.slice(2, 4);
    const secondStamp = stamped.items.slice(4, 6);
    const firstTable = firstStamp.find(
      (item) => item.assetRef === 'dnd5e:props:torture-table'
    )!;
    const firstCandle = firstStamp.find(
      (item) => item.assetRef === 'dnd5e:props:candles'
    )!;
    const secondTable = secondStamp.find(
      (item) => item.assetRef === 'dnd5e:props:torture-table'
    )!;
    const secondCandle = secondStamp.find(
      (item) => item.assetRef === 'dnd5e:props:candles'
    )!;
    expect(firstCandle.supportId).toBe(firstTable.id);
    expect(secondCandle.supportId).toBe(secondTable.id);
    expect(firstTable.id).not.toBe(secondTable.id);
  });

  it('leaves Ctrl/Cmd/Alt+R browser shortcuts untouched while plain R remains coherent', () => {
    render(
      <WorldBuildingConcept
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
      />
    );
    dragLabelTo('Drag Books into scene');
    const before = scene();

    for (const modifiers of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
    ]) {
      const reload = createEvent.keyDown(window, {
        key: 'r',
        cancelable: true,
        ...modifiers,
      });
      fireEvent(window, reload);
      expect(reload.defaultPrevented).toBe(false);
      expect(scene()).toEqual(before);
    }

    const rotate = createEvent.keyDown(window, {
      key: 'r',
      cancelable: true,
    });
    fireEvent(window, rotate);
    expect(rotate.defaultPrevented).toBe(true);
    expect(scene().items[0]!.transform.rotationY).toBeCloseTo(Math.PI / 12);
  });

  it('reopens saved scene/library data after drag-based editing', () => {
    const storage = new MemoryStorage();
    const ids = deterministicIds();
    const mounted = render(
      <WorldBuildingConcept storage={storage} idFactory={ids} />
    );
    dragLabelTo('Drag Books into scene');
    fireEvent.change(screen.getByLabelText('Arrangement name'), {
      target: { value: 'Books arrangement' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save selection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save local draft' }));
    mounted.unmount();

    render(<WorldBuildingConcept storage={storage} idFactory={ids} />);
    expect(scene().items).toHaveLength(1);
    expect(screen.getByText('Books arrangement')).toBeTruthy();
  });

  it('saves immutable named snapshots to the configured world and refreshes the list', async () => {
    const world = worldSource();
    render(
      <WorldBuildingConcept
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
        compositionSource={world.source}
      />
    );

    expect(screen.getByText(/World library · test-world/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Scene name'), {
      target: { value: 'Lantern Supper' },
    });
    fireEvent.blur(screen.getByLabelText('Scene name'));
    dragLabelTo('Drag Candles into scene');
    fireEvent.click(screen.getByRole('button', { name: 'Add point light' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save composition to world' })
    );

    await waitFor(() =>
      expect(world.createComposition).toHaveBeenCalledTimes(1)
    );
    const [worldId, json] = world.createComposition.mock.calls[0]!;
    expect(worldId).toBe('test-world');
    expect(json).toContain('Lantern Supper');
    expect(json).toContain('"pointLight"');
    expect(await screen.findByText('Lantern Supper')).toBeTruthy();
    expect(world.listCompositions).toHaveBeenCalledTimes(2);

    fireEvent.click(
      screen.getByRole('button', { name: 'Save composition to world' })
    );
    await waitFor(() =>
      expect(world.createComposition).toHaveBeenCalledTimes(2)
    );
    expect(screen.getByText(/Latest snapshot ID: composition-2/)).toBeTruthy();
  });

  it('requires explicit permanent-delete confirmation, leaves cancellation untouched, and refreshes after success', async () => {
    const remoteSnapshot: WorldScene = {
      version: 1,
      id: 'remote-snapshot',
      name: 'Disposable Lantern Supper',
      items: [],
      groups: [],
    };
    const world = worldSource([remoteSnapshot]);
    const onCompositionDeleted = vi.fn();
    render(
      <WorldBuildingConcept
        storage={new MemoryStorage()}
        compositionSource={world.source}
        onCompositionDeleted={onCompositionDeleted}
      />
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Delete Disposable Lantern Supper',
      })
    );
    expect(
      screen.getByRole('group', {
        name: 'Permanent deletion confirmation for Disposable Lantern Supper',
      }).textContent
    ).toMatch(/dungeon placements.*remain.*remove them explicitly/i);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Cancel delete Disposable Lantern Supper',
      })
    );
    expect(world.deleteComposition).not.toHaveBeenCalled();
    expect(screen.getByText('Disposable Lantern Supper')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Delete Disposable Lantern Supper',
      })
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Permanently delete Disposable Lantern Supper',
      })
    );

    await waitFor(() =>
      expect(world.deleteComposition).toHaveBeenCalledWith(
        'test-world',
        'composition-1'
      )
    );
    await waitFor(() =>
      expect(screen.queryByText('Disposable Lantern Supper')).toBeNull()
    );
    expect(world.listCompositions).toHaveBeenCalledTimes(2);
    expect(onCompositionDeleted).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toMatch(
      /dungeon placements were not changed.*remove them explicitly/i
    );
  });

  it('keeps reader-only compositions openable and clears a pending delete when write access is removed', async () => {
    const remoteSnapshot: WorldScene = {
      version: 1,
      id: 'remote-snapshot',
      name: 'Reader Only Supper',
      items: [],
      groups: [],
    };
    const world = worldSource([remoteSnapshot]);
    const { rerender } = render(
      <WorldBuildingConcept
        storage={new MemoryStorage()}
        compositionSource={world.source}
      />
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete Reader Only Supper' })
    );
    expect(
      screen.getByRole('group', {
        name: 'Permanent deletion confirmation for Reader Only Supper',
      })
    ).toBeTruthy();

    const readerOnlySource: CompositionSource = {
      worldId: world.source.worldId,
      reader: world.source.reader,
    };
    rerender(
      <WorldBuildingConcept
        storage={new MemoryStorage()}
        compositionSource={readerOnlySource}
      />
    );

    await screen.findByRole('button', { name: 'Open Reader Only Supper' });
    expect(
      screen.queryByRole('button', { name: 'Delete Reader Only Supper' })
    ).toBeNull();
    expect(
      screen.queryByRole('group', {
        name: 'Permanent deletion confirmation for Reader Only Supper',
      })
    ).toBeNull();
    expect(world.deleteComposition).not.toHaveBeenCalled();
  });

  it('can delete malformed unopenable records by ID while preserving them on failure', async () => {
    const malformed = create(CompositionSchema, {
      id: 'composition-bad-json',
      worldId: 'test-world',
      json: '{not valid scene json',
    });
    const deleteComposition = vi
      .fn<(worldId: string, id: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('delete refused'))
      .mockResolvedValueOnce();
    const listCompositions = vi
      .fn()
      .mockResolvedValueOnce([malformed])
      .mockResolvedValueOnce([]);
    const source: CompositionSource = {
      worldId: 'test-world',
      reader: {
        listCompositions,
        getComposition: vi.fn(async () => malformed),
      },
      writer: {
        createComposition: vi.fn(),
        deleteComposition,
      },
    };
    render(
      <WorldBuildingConcept
        storage={new MemoryStorage()}
        compositionSource={source}
      />
    );

    expect(await screen.findByText('composition-bad-json')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete composition-bad-json' })
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Permanently delete composition-bad-json',
      })
    );
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /delete refused/
    );
    expect(screen.getByText('composition-bad-json')).toBeTruthy();
    expect(listCompositions).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Permanently delete composition-bad-json',
      })
    );
    await waitFor(() =>
      expect(screen.queryByText('composition-bad-json')).toBeNull()
    );
    expect(deleteComposition).toHaveBeenCalledTimes(2);
    expect(listCompositions).toHaveBeenCalledTimes(2);
  });

  it('deleting the currently open world record keeps its workspace and prior local draft', async () => {
    const localDraft: WorldScene = {
      version: 1,
      id: 'local-draft-a',
      name: 'Local Draft A',
      items: [],
      groups: [],
    };
    const remoteSnapshot: WorldScene = {
      version: 1,
      id: 'remote-snapshot-b',
      name: 'Open Snapshot B',
      items: [],
      groups: [],
    };
    const storage = new MemoryStorage();
    storage.setItem(SCENE_STORAGE_KEY, stringifyScene(localDraft));
    const world = worldSource([remoteSnapshot]);
    render(
      <WorldBuildingConcept
        storage={storage}
        compositionSource={world.source}
      />
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Open Snapshot B' })
    );
    await waitFor(() => expect(scene()).toEqual(remoteSnapshot));
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete Open Snapshot B' })
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Permanently delete Open Snapshot B',
      })
    );

    await waitFor(() => expect(world.deleteComposition).toHaveBeenCalled());
    expect(scene()).toEqual(remoteSnapshot);
    expect(storage.values.get(SCENE_STORAGE_KEY)).toBe(
      stringifyScene(localDraft)
    );
    expect(screen.getByText(/World snapshot open/i)).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Save composition to world' })
    );
    await waitFor(() =>
      expect(world.createComposition).toHaveBeenCalledTimes(1)
    );
    expect(screen.getByText(/Latest snapshot ID: composition-1/)).toBeTruthy();
  });

  it('preserves a distinct local draft after opening a world snapshot, effects flush, and remount', async () => {
    const localDraft: WorldScene = {
      version: 1,
      id: 'local-draft-a',
      name: 'Local Draft A',
      items: [],
      groups: [],
    };
    const remoteSnapshot: WorldScene = {
      version: 1,
      id: 'remote-snapshot-b',
      name: 'Remote Snapshot B',
      items: [],
      groups: [],
    };
    const storage = new MemoryStorage();
    storage.setItem(SCENE_STORAGE_KEY, stringifyScene(localDraft));
    const world = worldSource([remoteSnapshot]);
    const mounted = render(
      <WorldBuildingConcept
        storage={storage}
        idFactory={deterministicIds()}
        compositionSource={world.source}
      />
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Remote Snapshot B' })
    );
    await waitFor(() => expect(scene()).toEqual(remoteSnapshot));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(storage.values.get(SCENE_STORAGE_KEY)).toBe(
      stringifyScene(localDraft)
    );
    expect(screen.getByText(/local draft preserved/i)).toBeTruthy();

    mounted.unmount();
    render(
      <WorldBuildingConcept
        storage={storage}
        idFactory={deterministicIds()}
        compositionSource={world.source}
      />
    );
    expect(scene()).toEqual(localDraft);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Remote Snapshot B' })
    );
    await waitFor(() => expect(scene()).toEqual(remoteSnapshot));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(storage.values.get(SCENE_STORAGE_KEY)).toBe(
      stringifyScene(localDraft)
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reopen local draft' }));
    expect(scene()).toEqual(localDraft);
  });

  it('flushes the latest local edit made while a world Get is pending', async () => {
    const localDraft: WorldScene = {
      version: 1,
      id: 'local-draft-a',
      name: 'Local Draft A',
      items: [],
      groups: [],
    };
    const remoteSnapshot: WorldScene = {
      version: 1,
      id: 'remote-snapshot-b',
      name: 'Remote Snapshot B',
      items: [],
      groups: [],
    };
    const remoteRecord = create(CompositionSchema, {
      id: 'composition-1',
      worldId: 'test-world',
      json: stringifyScene(remoteSnapshot),
    });
    let resolveGet!: (record: typeof remoteRecord) => void;
    const pendingGet = new Promise<typeof remoteRecord>((resolve) => {
      resolveGet = resolve;
    });
    const source: CompositionSource = {
      worldId: 'test-world',
      reader: {
        listCompositions: vi.fn(async () => [remoteRecord]),
        getComposition: vi.fn(() => pendingGet),
      },
    };
    const storage = new MemoryStorage();
    storage.setItem(SCENE_STORAGE_KEY, stringifyScene(localDraft));
    render(
      <WorldBuildingConcept storage={storage} compositionSource={source} />
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Remote Snapshot B' })
    );
    fireEvent.change(screen.getByLabelText('Scene name'), {
      target: { value: 'Latest Local Draft A' },
    });
    fireEvent.blur(screen.getByLabelText('Scene name'));
    resolveGet(remoteRecord);

    await waitFor(() => expect(scene()).toEqual(remoteSnapshot));
    const stored = storage.values.get(SCENE_STORAGE_KEY);
    expect(stored).toContain('Latest Local Draft A');
    expect(stored).not.toContain('Remote Snapshot B');
  });

  function roomNamed(name: string): RoomDraft {
    const draft = createRoomDraft(
      createEmptyScene(`scene-${name}`),
      `room-${name}`
    );
    draft.scene.name = name;
    return draft;
  }

  function roomRecord(id: string, draft: RoomDraft) {
    return create(CompositionSchema, {
      id,
      worldId: 'test-world',
      json: encodeRoomDocument(draft),
    });
  }

  function currentRoom(): RoomDraft {
    const envelope = JSON.parse(
      screen.getByTestId('room-draft-json').textContent ?? '{}'
    ) as { draft: RoomDraft };
    return envelope.draft;
  }

  it('opens a saved room snapshot under its authored scene name while the local draft stays intact', async () => {
    const local = roomNamed('Local Cellar');
    const remote = roomNamed('Remote Tavern Cellar');
    remote.scene.items = [
      {
        id: 'remote-prop-1',
        kind: 'prop',
        assetRef: 'dnd5e:props:books',
        label: 'Remote books',
        transform: { x: 0.5, y: 0.25, z: -0.5, rotationY: 0.3 },
      },
    ];
    remote.room.walkableHexes = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ];
    remote.room.propDeclarations = {
      'remote-prop-1': {
        blocksMovement: true,
        blocksLineOfSight: false,
        footprint: { width: 0.8, depth: 0.6, offsetX: 0, offsetZ: 0 },
      },
    };
    const storage = new MemoryStorage();
    storage.setItem(ROOM_DRAFT_STORAGE_KEY, stringifyRoomDraft(local));
    const record = roomRecord('room-snapshot-1', remote);
    const source: CompositionSource = {
      worldId: 'test-world',
      reader: {
        listCompositions: vi.fn(async () => [record]),
        getComposition: vi.fn(async () => record),
      },
    };
    render(
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={deterministicIds()}
        compositionSource={source}
      />
    );

    // The saved-room list and open action are labeled by the authored visible
    // scene name, not the stored room metadata name.
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Remote Tavern Cellar' })
    );
    await waitFor(() =>
      expect(screen.getByText(/Opened “Remote Tavern Cellar”/)).toBeTruthy()
    );
    expect(currentRoom()).toEqual(remote);
    expect(
      document
        .querySelector('[data-workspace-origin]')
        ?.getAttribute('data-workspace-origin')
    ).toBe('world');
    expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).toBe(
      stringifyRoomDraft(local)
    );
  });

  it('returns room workspace to local autosave after save, reload, and import', async () => {
    const storage = new MemoryStorage();
    const local = roomNamed('Local Cellar');
    const remote = roomNamed('Remote Cellar');
    const record = roomRecord('room-snapshot-1', remote);
    const source: CompositionSource = {
      worldId: 'test-world',
      reader: {
        listCompositions: vi.fn(async () => [record]),
        getComposition: vi.fn(async () => record),
      },
    };
    render(
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={deterministicIds()}
        compositionSource={source}
      />
    );
    const openRemote = async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Open Remote Cellar' })
      );
      await waitFor(() =>
        expect(
          document
            .querySelector('[data-workspace-origin]')
            ?.getAttribute('data-workspace-origin')
        ).toBe('world')
      );
    };
    const expectLocalAutosave = async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Commit rectangle gesture' })
      );
      await waitFor(() =>
        expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).toBe(
          stringifyRoomDraft(currentRoom())
        )
      );
    };

    await openRemote();
    fireEvent.click(screen.getByRole('button', { name: 'Save room draft' }));
    expect(
      document
        .querySelector('[data-workspace-origin]')
        ?.getAttribute('data-workspace-origin')
    ).toBe('local');
    await expectLocalAutosave();

    await openRemote();
    fireEvent.click(screen.getByRole('button', { name: 'Reload room draft' }));
    expect(
      document
        .querySelector('[data-workspace-origin]')
        ?.getAttribute('data-workspace-origin')
    ).toBe('local');
    await expectLocalAutosave();

    await openRemote();
    fireEvent.change(screen.getByLabelText('Portable JSON'), {
      target: { value: stringifyRoomDraft(local) },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Import room draft JSON' })
    );
    expect(
      document
        .querySelector('[data-workspace-origin]')
        ?.getAttribute('data-workspace-origin')
    ).toBe('local');
    await expectLocalAutosave();
  });

  it('keeps current local bytes intact when a deferred room Get resolves after unmount', async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      ROOM_DRAFT_STORAGE_KEY,
      stringifyRoomDraft(roomNamed('Local Cellar'))
    );
    const remote = roomNamed('Remote Cellar');
    const record = roomRecord('room-snapshot-1', remote);
    let resolveGet!: (value: typeof record) => void;
    const pendingGet = new Promise<typeof record>((resolve) => {
      resolveGet = resolve;
    });
    const source: CompositionSource = {
      worldId: 'test-world',
      reader: {
        listCompositions: vi.fn(async () => [record]),
        getComposition: vi.fn(() => pendingGet),
      },
    };
    const mounted = render(
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={deterministicIds()}
        compositionSource={source}
      />
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Remote Cellar' })
    );

    // A replacement editor saves newer local bytes while the old Get is still
    // pending; the stale continuation must never overwrite them.
    const replacement = roomNamed('Replacement Cellar');
    const replacementBytes = stringifyRoomDraft(replacement);
    storage.setItem(ROOM_DRAFT_STORAGE_KEY, replacementBytes);
    const writesAfterReplacement = storage.writes;

    mounted.unmount();
    resolveGet(record);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storage.writes).toBe(writesAfterReplacement);
    expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).toBe(replacementBytes);
    render(
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={deterministicIds()}
      />
    );
    expect(currentRoom().scene.name).toBe('Replacement Cellar');
  });

  it('drops a deferred room Get after the source is replaced and still opens normally from the new source', async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      ROOM_DRAFT_STORAGE_KEY,
      stringifyRoomDraft(roomNamed('Local Cellar'))
    );
    const oldRecord = roomRecord('room-old', roomNamed('Old Cellar'));
    let resolveOld!: (value: typeof oldRecord) => void;
    const pendingOld = new Promise<typeof oldRecord>((resolve) => {
      resolveOld = resolve;
    });
    const oldSource: CompositionSource = {
      worldId: 'test-world',
      reader: {
        listCompositions: vi.fn(async () => [oldRecord]),
        getComposition: vi.fn(() => pendingOld),
      },
    };
    const newRecord = roomRecord('room-new', roomNamed('New Cellar'));
    const newSource: CompositionSource = {
      worldId: 'test-world',
      reader: {
        listCompositions: vi.fn(async () => [newRecord]),
        getComposition: vi.fn(async () => newRecord),
      },
    };
    const ids = deterministicIds();
    const view = render(
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={ids}
        compositionSource={oldSource}
      />
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Old Cellar' })
    );

    view.rerender(
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={ids}
        compositionSource={newSource}
      />
    );
    const bytesBefore = storage.values.get(ROOM_DRAFT_STORAGE_KEY);
    resolveOld(oldRecord);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The fenced continuation left both the editor and the stored bytes alone.
    expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytesBefore);
    expect(currentRoom().scene.name).toBe('Local Cellar');
    expect(screen.queryByText(/Opened “Old Cellar”/)).toBeNull();

    // A normal open against the replacement source still works.
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open New Cellar' })
    );
    await waitFor(() => expect(currentRoom().scene.name).toBe('New Cellar'));
    expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytesBefore);
  });

  it('keeps remote workspace edits out of the local draft until explicit Save local draft', async () => {
    const localDraft: WorldScene = {
      version: 1,
      id: 'local-draft-a',
      name: 'Local Draft A',
      items: [],
      groups: [],
    };
    const remoteSnapshot: WorldScene = {
      version: 1,
      id: 'remote-snapshot-b',
      name: 'Remote Snapshot B',
      items: [],
      groups: [],
    };
    const storage = new MemoryStorage();
    storage.setItem(SCENE_STORAGE_KEY, stringifyScene(localDraft));
    const world = worldSource([remoteSnapshot]);
    render(
      <WorldBuildingConcept
        storage={storage}
        idFactory={deterministicIds()}
        compositionSource={world.source}
      />
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Remote Snapshot B' })
    );
    await waitFor(() => expect(scene()).toEqual(remoteSnapshot));
    dragLabelTo('Drag Books into scene');
    await waitFor(() =>
      expect(storage.values.get(SCENE_STORAGE_KEY)).toBe(
        stringifyScene(localDraft)
      )
    );
    expect(screen.getByText(/not saved locally/i)).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Save composition to world' })
    );
    await waitFor(() =>
      expect(world.createComposition).toHaveBeenCalledTimes(1)
    );
    expect(storage.values.get(SCENE_STORAGE_KEY)).toBe(
      stringifyScene(localDraft)
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save local draft' }));
    const explicitlySaved = scene();
    expect(storage.values.get(SCENE_STORAGE_KEY)).toBe(
      stringifyScene(explicitlySaved)
    );
    dragLabelTo('Drag Vase into scene');
    await waitFor(() =>
      expect(storage.values.get(SCENE_STORAGE_KEY)).toBe(
        stringifyScene(scene())
      )
    );
    expect(screen.getByText('Saved locally')).toBeTruthy();
  });

  it('shows list/open/save errors without replacing the current valid scene', async () => {
    const original: WorldScene = {
      version: 1,
      id: 'original',
      name: 'Original scene',
      items: [],
      groups: [],
    };
    const source: CompositionSource = {
      worldId: 'test-world',
      reader: {
        listCompositions: vi.fn(async () => {
          throw new Error('library offline');
        }),
        getComposition: vi.fn(),
      },
      writer: {
        createComposition: vi.fn(async () => {
          throw new Error('save refused');
        }),
        deleteComposition: vi.fn(),
      },
    };
    const storage = new MemoryStorage();
    storage.setItem(
      'rpg.concepts.world-building.scene.v1',
      stringifyScene(original)
    );
    render(
      <WorldBuildingConcept storage={storage} compositionSource={source} />
    );

    expect(await screen.findByText(/library offline/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save composition to world' })
    );
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /save refused/
    );
    expect(scene()).toEqual(original);
  });

  it('arms a generated catalog Repeat action without placing, then commits one undoable ordinary group', async () => {
    const storage = new MemoryStorage();
    render(
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={deterministicIds()}
      />
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search assets' }), {
      target: { value: 'Barricade 02' },
    });
    expect(scene().items).toHaveLength(0);
    fireEvent.click(
      screen.getByRole('button', { name: 'Repeat Barricade 02' })
    );
    expect(screen.getByTestId('viewport-room-tool').textContent).toBe('repeat');
    expect(scene().items).toHaveLength(0);

    fireEvent.click(
      screen.getByRole('button', { name: 'Commit repeat gesture' })
    );
    expect(scene().items).toHaveLength(2);
    expect(scene().groups).toHaveLength(1);
    expect(
      scene().items.every((item) => item.parentId === scene().groups[0]!.id)
    ).toBe(true);
    const firstRun = structuredClone(scene());
    expect(screen.getByTestId('viewport-room-tool').textContent).toBe('repeat');

    fireEvent.click(
      screen.getByRole('button', { name: 'Commit repeat gesture' })
    );
    expect(scene().items).toHaveLength(4);
    expect(scene().groups).toHaveLength(2);
    const secondRun = structuredClone(scene());

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(scene()).toEqual(firstRun);
    expect(screen.getByTestId('viewport-room-tool').textContent).toBe('repeat');
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(scene()).toEqual(secondRun);

    await waitFor(() =>
      expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).toBeTruthy()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload room draft' }));
    expect(scene()).toEqual(secondRun);
  });

  it('disarms Repeat on palette drag without changing another room tool on a canceled drag', () => {
    render(
      <WorldBuildingConcept
        roomMode
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rectangle' }));
    expect(screen.getByTestId('viewport-room-tool').textContent).toBe(
      'rectangle'
    );

    const card = screen.getByLabelText('Drag Barricade 02 into scene');
    const transfer = new TransferStub();
    fireEvent.dragStart(card, { dataTransfer: transfer });
    fireEvent.dragEnd(card, { dataTransfer: transfer });
    expect(screen.getByTestId('viewport-room-tool').textContent).toBe(
      'rectangle'
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Repeat Barricade 02' })
    );
    expect(screen.getByTestId('viewport-room-tool').textContent).toBe('repeat');
    fireEvent.dragStart(card, { dataTransfer: transfer });
    fireEvent.dragEnd(card, { dataTransfer: transfer });
    expect(screen.getByTestId('viewport-room-tool').textContent).toBe('select');
  });

  it('keeps corrupt current room bytes through StrictMode replay and unrelated edits until explicit save', () => {
    const storage = new MemoryStorage();
    const corrupt = '{"kind":"rpg-room-authoring-draft","version":2,"draft":';
    storage.values.set(ROOM_DRAFT_STORAGE_KEY, corrupt);

    render(
      <StrictMode>
        <WorldBuildingConcept
          roomMode
          storage={storage}
          idFactory={deterministicIds()}
        />
      </StrictMode>
    );

    expect(screen.getByRole('alert').textContent).toMatch(
      /Room draft load failed/
    );
    expect(screen.getByText(/Autosave paused/)).toBeTruthy();
    expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).toBe(corrupt);
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit rectangle gesture' })
    );
    expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).toBe(corrupt);

    fireEvent.click(screen.getByRole('button', { name: 'Save room draft' }));
    expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).not.toBe(corrupt);
    expect(
      JSON.parse(storage.values.get(ROOM_DRAFT_STORAGE_KEY) ?? '{}').version
    ).toBe(3);
  });

  it('keeps corrupt current bytes and untouched legacy bytes until an explicit save', () => {
    const storage = new MemoryStorage();
    const corrupt = '{bad-v3';
    const legacyEnvelope = JSON.parse(
      stringifyRoomDraft(roomNamed('Legacy Cellar'))
    ) as { version: number; draft: Record<string, unknown> };
    // A fixed legacy local envelope: version 2 carrying draft version 2,
    // which never had actor fields.
    legacyEnvelope.version = 2;
    legacyEnvelope.draft.version = 2;
    delete legacyEnvelope.draft.monsters;
    const legacyRaw = JSON.stringify(legacyEnvelope);
    storage.values.set(ROOM_DRAFT_STORAGE_KEY, corrupt);
    storage.values.set(LEGACY_ROOM_DRAFT_STORAGE_KEY, legacyRaw);

    render(
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={deterministicIds()}
      />
    );

    // The present-but-invalid current draft is never reinterpreted as
    // absent: older bytes are not recovered, and autosave stays paused.
    expect(screen.getByRole('alert').textContent).toMatch(
      /Room draft load failed/
    );
    expect(screen.getByText(/Autosave paused/)).toBeTruthy();
    const shown = JSON.parse(
      screen.getByTestId('room-draft-json').textContent ?? '{}'
    ) as { draft: RoomDraft };
    expect(shown.draft.version).toBe(3);
    expect(shown.draft.name).toBe('Untitled room');
    expect(shown.draft.id).not.toBe('legacy-room');
    expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).toBe(corrupt);

    // Unrelated committed edits do not replace unreadable bytes either.
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit rectangle gesture' })
    );
    expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).toBe(corrupt);
    expect(storage.values.get(LEGACY_ROOM_DRAFT_STORAGE_KEY)).toBe(legacyRaw);

    // Only an explicit valid save replaces them, and it writes v3 to the
    // current key alone; legacy bytes are never removed or rewritten.
    fireEvent.click(screen.getByRole('button', { name: 'Save room draft' }));
    expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).not.toBe(corrupt);
    expect(
      JSON.parse(storage.values.get(ROOM_DRAFT_STORAGE_KEY) ?? '{}').version
    ).toBe(3);
    expect(storage.values.get(LEGACY_ROOM_DRAFT_STORAGE_KEY)).toBe(legacyRaw);
  });

  it('loads valid v2 and migrates valid v1 while leaving the legacy recovery copy intact', () => {
    const valid = createRoomDraft(createEmptyScene('scene-v2'), 'room-v2');
    const v2Storage = new MemoryStorage();
    v2Storage.values.set(ROOM_DRAFT_STORAGE_KEY, stringifyRoomDraft(valid));
    const first = render(
      <WorldBuildingConcept
        roomMode
        storage={v2Storage}
        idFactory={deterministicIds()}
      />
    );
    expect(
      JSON.parse(screen.getByTestId('room-draft-json').textContent ?? '{}')
        .draft.id
    ).toBe('room-v2');
    first.unmount();

    const legacyEnvelope = JSON.parse(stringifyRoomDraft(valid));
    legacyEnvelope.version = 1;
    legacyEnvelope.draft.version = 1;
    delete legacyEnvelope.draft.workspace;
    const legacyRaw = JSON.stringify(legacyEnvelope);
    const v1Storage = new MemoryStorage();
    v1Storage.values.set(LEGACY_ROOM_DRAFT_STORAGE_KEY, legacyRaw);
    render(
      <WorldBuildingConcept
        roomMode
        storage={v1Storage}
        idFactory={deterministicIds()}
      />
    );
    expect(
      JSON.parse(v1Storage.values.get(ROOM_DRAFT_STORAGE_KEY) ?? '{}').version
    ).toBe(3);
    expect(v1Storage.values.get(LEGACY_ROOM_DRAFT_STORAGE_KEY)).toBe(legacyRaw);
  });

  it('preserves corrupt storage when explicit save or reset encounters a storage failure', () => {
    const storage = new MemoryStorage();
    const corrupt = '{bad-current';
    storage.values.set(ROOM_DRAFT_STORAGE_KEY, corrupt);
    storage.failSet = true;
    render(
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={deterministicIds()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save room draft' }));
    expect(screen.getByRole('alert').textContent).toMatch(/quota blocked/);
    expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).toBe(corrupt);
    fireEvent.click(screen.getByRole('button', { name: 'New room' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm new room' }));
    expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).toBe(corrupt);
    expect(screen.getByRole('alert').textContent).toMatch(/quota blocked/);
  });

  it('does not inspect or overwrite room storage from the standalone composer mount', () => {
    const storage = new MemoryStorage();
    storage.values.set(ROOM_DRAFT_STORAGE_KEY, '{inactive-room-bytes');
    render(
      <WorldBuildingConcept storage={storage} idFactory={deterministicIds()} />
    );
    expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).toBe(
      '{inactive-room-bytes'
    );
  });

  it('expands room workspace metadata without moving content or painting cells', () => {
    render(
      <WorldBuildingConcept
        roomMode
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
      />
    );
    const room = () =>
      JSON.parse(screen.getByTestId('room-draft-json').textContent ?? '{}')
        .draft;
    const before = structuredClone(room());

    fireEvent.click(
      screen.getByRole('button', { name: 'Expand workspace · radius 6 → 10' })
    );

    expect(room().workspace).toEqual({ hexRadius: 10, horizontalLimit: 20 });
    expect({ ...room(), workspace: before.workspace }).toEqual(before);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(room()).toEqual(before);
  });

  it('commits one rectangle release as one undoable room-history action', () => {
    render(
      <WorldBuildingConcept
        roomMode
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
      />
    );

    expect(screen.getByRole('button', { name: 'Rectangle' })).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit rectangle gesture' })
    );
    expect(
      JSON.parse(screen.getByTestId('room-draft-json').textContent ?? '{}')
        .draft.room.walkableHexes
    ).toEqual([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit rectangle gesture' })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(
      JSON.parse(screen.getByTestId('room-draft-json').textContent ?? '{}')
        .draft.room.walkableHexes
    ).toEqual([]);
    expect(
      (screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Erase empty cell' }));
    expect(
      (screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(
      JSON.parse(screen.getByTestId('room-draft-json').textContent ?? '{}')
        .draft.room.walkableHexes
    ).toHaveLength(2);
  });

  it('shows non-destructive strict import errors and keeps the valid scene', () => {
    render(
      <WorldBuildingConcept
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
      />
    );
    dragLabelTo('Drag Books into scene');
    const before = scene();
    fireEvent.change(screen.getByLabelText('Portable JSON'), {
      target: {
        value: JSON.stringify({
          kind: 'rpg-world-building-scene',
          version: 1,
          scene: {
            ...before,
            items: [
              {
                ...before.items[0],
                assetRef: 'https://invalid.example/evil.glb',
              },
            ],
          },
        }),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import scene JSON' }));

    expect(screen.getByRole('alert').textContent).toMatch(
      /not in the local prop catalog/i
    );
    expect(scene()).toEqual(before);
  });
});

describe('room actor authoring', () => {
  function actors(): {
    monsters: Array<{
      id: string;
      ref: string;
      cell: { q: number; r: number };
    }>;
    partyStart: { q: number; r: number } | null;
    selectedActorId: string | null;
  } {
    return JSON.parse(
      screen.getByTestId('viewport-actors').textContent ?? '{}'
    );
  }

  it('places, moves and removes a monster as one-Undo whole-room transactions with stable ids', () => {
    render(
      <WorldBuildingConcept
        roomMode
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
      />
    );

    // The monster palette reuses the four existing promoted choices.
    fireEvent.click(screen.getByRole('button', { name: 'Place skeleton' }));
    expect(
      screen
        .getByRole('button', { name: 'Place skeleton' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit monster gesture' })
    );
    expect(actors().monsters).toHaveLength(1);
    const placed = actors().monsters[0];
    expect(placed.ref).toBe('dnd5e:monsters:skeleton');
    expect(placed.cell).toEqual({ q: 1, r: 0 });
    // A structurally valid placement on unpainted ground is retained: the
    // encounter decides legality at Play, not this editor.
    expect(
      JSON.parse(screen.getByTestId('room-draft-json').textContent ?? '{}')
        .draft.room.walkableHexes
    ).toEqual([]);
    expect(actors().selectedActorId).toBe(placed.id);

    // A move keeps the minted id and changes only the cell.
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`^Move monster Skeleton ${placed.id}$`),
      })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit monster move gesture' })
    );
    expect(actors().monsters[0]).toEqual({
      id: placed.id,
      ref: 'dnd5e:monsters:skeleton',
      cell: { q: 2, r: -2 },
    });

    // One whole-room Undo, one Redo.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(actors().monsters[0].cell).toEqual({ q: 1, r: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(actors().monsters[0].cell).toEqual({ q: 2, r: -2 });

    // Repeat placement keeps arming until the tool changes.
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit monster gesture' })
    );
    expect(actors().monsters).toHaveLength(2);

    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`^Remove monster Skeleton ${placed.id}$`),
      })
    );
    expect(actors().monsters).toHaveLength(1);
    expect(actors().monsters[0].id).not.toBe(placed.id);
  });

  it('places, moves and clears the party start without ever inventing an origin', () => {
    render(
      <WorldBuildingConcept
        roomMode
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
      />
    );
    expect(
      (
        screen.getByRole('button', {
          name: 'Clear party start',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Place party start' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit start gesture' })
    );
    expect(actors().partyStart).toEqual({ q: 0, r: 0 });
    expect(actors().selectedActorId).toBe('start');

    // The start can sit off painted ground: structural validity only.
    fireEvent.click(screen.getByRole('button', { name: 'Erase empty cell' }));
    expect(actors().partyStart).toEqual({ q: 0, r: 0 });

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(actors().partyStart).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(actors().partyStart).toEqual({ q: 0, r: 0 });

    fireEvent.click(screen.getByRole('button', { name: 'Clear party start' }));
    expect(actors().partyStart).toBeNull();
    // Absence is the authored state: no key, never a null or origin stub.
    expect(screen.getByTestId('room-draft-json').textContent).not.toContain(
      'partyStart'
    );
  });

  it('keeps actors through scenery edits and keeps every scenery pose through actor edits', () => {
    render(
      <WorldBuildingConcept
        roomMode
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
      />
    );

    // A selected prop keeps its selection and its pose through actor edits.
    dragLabelTo('Drag Books into scene');
    const booksId = scene().items[0]?.id as string;
    expect(actors().selectedActorId).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Place skeleton' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit monster gesture' })
    );
    const placed = actors().monsters[0];
    // Placing an actor never deleted the selected scenery or remapped it.
    expect(scene().items).toHaveLength(1);
    expect(scene().items[0]?.id).toBe(booksId);
    expect(scene().items[0]?.transform).toEqual({
      x: 0.13,
      y: 0,
      z: -0.27,
      rotationY: 0,
    });

    // A scenery edit retains the actors and the start.
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit rectangle gesture' })
    );
    expect(actors().monsters).toEqual([placed]);

    // Selecting the actor keeps the prop's own selection untouched, and
    // removing the actor leaves the prop exactly where it was.
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit monster move gesture' })
    );
    expect(actors().monsters[0].id).toBe(placed.id);
    expect(scene().items[0]?.id).toBe(booksId);
    expect(actors().selectedActorId).toBe(placed.id);

    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`^Remove monster Skeleton ${placed.id}$`),
      })
    );
    expect(actors().monsters).toEqual([]);
    expect(scene().items).toHaveLength(1);
    expect(scene().items[0]?.id).toBe(booksId);
  });

  it('retains stable ids and the start through export, import and reopen', () => {
    const storage = new MemoryStorage();
    render(
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={deterministicIds()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Place skeleton' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit monster gesture' })
    );
    const placed = actors().monsters[0];
    fireEvent.click(screen.getByRole('button', { name: 'Place party start' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit start gesture' })
    );
    expect(actors().partyStart).toEqual({ q: 0, r: 0 });

    // Export → import is a lossless whole-draft transfer: actor identities
    // are the stable join, never reminted.
    fireEvent.click(
      screen.getByRole('button', { name: 'Export room draft JSON' })
    );
    const exported = (
      screen.getByLabelText('Portable JSON') as HTMLInputElement
    ).value;
    expect(exported).toContain(placed.id);
    fireEvent.click(
      screen.getByRole('button', { name: 'Import room draft JSON' })
    );
    expect(actors().monsters).toEqual([placed]);
    expect(actors().partyStart).toEqual({ q: 0, r: 0 });

    // Reload restores the autosaved bytes with the same actor identities.
    fireEvent.click(screen.getByRole('button', { name: 'Reload room draft' }));
    expect(actors().monsters).toEqual([placed]);
    expect(actors().partyStart).toEqual({ q: 0, r: 0 });
  });

  it('never routes actor placement through prop drops, arrangements or a second editor', () => {
    const storage = new MemoryStorage();
    render(
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={deterministicIds()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Place skeleton' }));
    // A palette drag stays the prop contract: a real prop drop creates a
    // freely-posed prop, and the armed monster tool does not intercept it.
    dragLabelTo('Drag Books into scene');
    expect(scene().items).toHaveLength(1);
    expect(actors().monsters).toEqual([]);
    expect(actors().partyStart).toBeNull();
    // The placed actor count changes only through its own gesture.
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit monster gesture' })
    );
    expect(actors().monsters).toHaveLength(1);
    expect(scene().items).toHaveLength(1);
  });
});

/** A complete seeded room draft whose PUBLISHED name deliberately differs
 * from the scene presentation name, the way a distinct imported document
 * arrives. */
function seedImportedRoom(storageInstance: MemoryStorage): RoomDraft {
  const draft = createRoomDraft(
    {
      version: 1,
      id: 'scene-imported',
      name: 'Scene title kept distinct',
      items: [
        {
          id: 'prop-1',
          kind: 'prop',
          assetRef: 'dnd5e:props:books',
          label: 'Books',
          transform: { x: 1, y: 0, z: 1, rotationY: 0 },
        },
      ],
      groups: [],
    },
    'room-imported-1'
  );
  draft.name = 'Imported room title';
  draft.room.walkableHexes = [{ q: 0, r: 0 }];
  storageInstance.setItem(ROOM_DRAFT_STORAGE_KEY, stringifyRoomDraft(draft));
  return draft;
}

function publishedDraft(): RoomDraft {
  const envelope = JSON.parse(
    (screen.getByTestId('room-draft-json').textContent ?? '{}') as string
  ) as { draft: RoomDraft };
  return envelope.draft;
}

describe('WorldBuildingConcept room publishing', () => {
  afterEach(() => publishRpc.reset());

  it('the explicit scene-name rename also publishes the draft name in one undoable transaction', () => {
    const storageInstance = new MemoryStorage();
    seedImportedRoom(storageInstance);
    render(
      <WorldBuildingConcept
        roomMode
        storage={storageInstance}
        idFactory={deterministicIds()}
      />
    );
    fireEvent.change(screen.getByLabelText('Scene name'), {
      target: { value: 'Renamed by author' },
    });
    fireEvent.blur(screen.getByLabelText('Scene name'));

    const renamed = publishedDraft();
    expect(renamed.name).toBe('Renamed by author');
    expect(renamed.scene.name).toBe('Renamed by author');

    // Exactly one Undo restores BOTH names.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const restored = publishedDraft();
    expect(restored.name).toBe('Imported room title');
    expect(restored.scene.name).toBe('Scene title kept distinct');
  });

  it('unrelated edits never normalize a distinct imported name', () => {
    const storageInstance = new MemoryStorage();
    seedImportedRoom(storageInstance);
    render(
      <WorldBuildingConcept
        roomMode
        storage={storageInstance}
        idFactory={deterministicIds()}
      />
    );
    // An unrelated canvas commit (walkable paint) must not touch names.
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit rectangle gesture' })
    );
    const after = publishedDraft();
    expect(after.name).toBe('Imported room title');
    expect(after.scene.name).toBe('Scene title kept distinct');
  });

  it('an in-flight publishing transaction blocks keyboard, canvas and name edits, then releases the editor', async () => {
    const storageInstance = new MemoryStorage();
    seedImportedRoom(storageInstance);
    const onPlay = vi.fn();
    render(
      <WorldBuildingConcept
        roomMode
        storage={storageInstance}
        idFactory={deterministicIds()}
        roomPublishing={{ characterId: 'char-1', onPlay }}
      />
    );

    // Background validation is already in flight (the derived default key
    // exists) and must NOT freeze editing: the rename below commits while
    // the debounced preview putDungeon is still pending.
    fireEvent.change(screen.getByLabelText('Scene name'), {
      target: { value: 'Busy test room' },
    });
    fireEvent.blur(screen.getByLabelText('Scene name'));
    expect(publishedDraft().name).toBe('Busy test room');
    fireEvent.click(screen.getByRole('button', { name: 'Save & Play' }));
    await waitFor(() => expect(publishRpc.gets).toHaveLength(1));
    publishRpc.gets[0]!.deferred.reject(
      new (await import('@connectrpc/connect')).ConnectError(
        'no such key',
        (await import('@connectrpc/connect')).Code.NotFound
      )
    );
    await waitFor(() => expect(publishRpc.puts).toHaveLength(1));

    // While the save is in flight: keyboard undo is a no-op.
    const before = screen.getByTestId('room-draft-json').textContent;
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.getByTestId('room-draft-json').textContent).toBe(before);

    // A canvas gesture is refused.
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit rectangle gesture' })
    );
    expect(screen.getByTestId('room-draft-json').textContent).toBe(before);

    // A name edit is refused too.
    fireEvent.change(screen.getByLabelText('Scene name'), {
      target: { value: 'Should not apply' },
    });
    fireEvent.blur(screen.getByLabelText('Scene name'));
    expect(publishedDraft().name).toBe('Busy test room');
    expect(screen.getByRole('alert').textContent).toMatch(
      /Save & Play is running/
    );

    // The transaction completes: the shared launch ran for the same
    // captured key, and the editor unlocks.
    publishRpc.puts[0]!.deferred.resolve({ errors: [] } as never);
    await waitFor(() => expect(onPlay).toHaveBeenCalledWith('enc-1', 'char-1'));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(publishedDraft().name).toBe('Imported room title');
  });
});
