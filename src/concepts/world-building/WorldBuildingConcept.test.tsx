import type { CompositionSource } from '@/compositions/compositionSource';
import { encodeRoomDocument } from '@/compositions/roomDocument';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { CompositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decodeWorldBuilderV4Site,
  WORLD_BUILDER_V4_SITE_YAML,
} from './fixtures/worldBuilderV4Site';
import {
  createRoomDraft,
  LEGACY_ROOM_DRAFT_STORAGE_KEY,
  ROOM_DRAFT_ENVELOPE_VERSION,
  ROOM_DRAFT_STORAGE_KEY,
  stringifyRoomDraft,
  type RoomDraft,
} from './roomDraft';
import { createEmptyScene } from './sceneState';
import { SCENE_STORAGE_KEY, stringifyScene } from './serialization';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from './singleRoomDungeon';
import type { SiteScope } from './siteScope';
import type { KeyValueStorage, WorldScene, WorldTransform } from './types';
import { WorldBuildingConcept } from './WorldBuildingConcept';

const DRAG_MIME = 'application/x-rpg-world-building-item+json';

/** The Site editor is the document screen (rpg-dnd5e-web#1152, corrected
 * model). The old `The site` and `Library` destinations are gone: identity, the
 * local draft, the revision history, the arrangement library, portable JSON and
 * publishing all live in the header's `Identity` panel, which overlays the
 * canvas without unmounting it. */
const openIdentity = () => {
  const button = screen.getByRole('button', { name: 'Identity' });
  if (button.getAttribute('aria-expanded') !== 'true') fireEvent.click(button);
};
const closeIdentity = () => {
  const button = screen.getByRole('button', { name: 'Identity' });
  if (button.getAttribute('aria-expanded') === 'true') fireEvent.click(button);
};
/** `Props` is collapsed by default; opening it reveals the palette and the
 * scene tree in one section. */
const openProps = () => {
  const summary = screen.getByLabelText('Props');
  const details = summary.closest('details') as HTMLDetailsElement | null;
  if (details && !details.open) fireEvent.click(summary);
};

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
    gets: [] as Array<{
      key: string;
      deferred: ReturnType<typeof makeDeferred<never>>;
    }>,
    puts: [] as Array<{
      request: { key: string; yaml: string; validateOnly: boolean };
      deferred: ReturnType<typeof makeDeferred<never>>;
    }>,
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
      putDungeon: vi.fn(
        async (request: {
          key: string;
          yaml: string;
          validateOnly: boolean;
        }) => {
          const deferred = publishRpc.makeDeferred<never>();
          publishRpc.puts.push({ request, deferred });
          return deferred.promise as never;
        }
      ),
      getDungeon: vi.fn(async (request: { key: string }) => {
        const deferred = publishRpc.makeDeferred<never>();
        publishRpc.gets.push({ key: request.key, deferred });
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

function dragLabelTo(
  label: string,
  targetTestId = 'canvas-ground',
  searchFor?: string
) {
  const transfer = new TransferStub();
  if (searchFor !== undefined) {
    fireEvent.change(screen.getByLabelText('Search assets'), {
      target: { value: searchFor },
    });
  }
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
      screen.getByRole('button', { name: 'Select Wall run wall-run' })
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
    openIdentity();
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
      openIdentity();
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
      closeIdentity();
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
    openIdentity();
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
    openIdentity();
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
    openIdentity();
    fireEvent.click(screen.getByRole('button', { name: 'Reload room draft' }));
    closeIdentity();
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

    openIdentity();
    fireEvent.click(screen.getByRole('button', { name: 'Save room draft' }));
    expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).not.toBe(corrupt);
    // THE CURRENT DRAFT-ENVELOPE VERSION (rpg-project#501 §6.1). It was
    // pinned to 3 while the envelope's only job was to say whether a scope
    // rode along; it now also says which MONSTER SHAPE the draft stores, so a
    // save writes the version this build actually produces.
    expect(
      JSON.parse(storage.values.get(ROOM_DRAFT_STORAGE_KEY) ?? '{}').version
    ).toBe(ROOM_DRAFT_ENVELOPE_VERSION);
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
    openIdentity();
    fireEvent.click(screen.getByRole('button', { name: 'Save room draft' }));
    expect(storage.values.get(ROOM_DRAFT_STORAGE_KEY)).not.toBe(corrupt);
    // THE CURRENT DRAFT-ENVELOPE VERSION (rpg-project#501 §6.1). It was
    // pinned to 3 while the envelope's only job was to say whether a scope
    // rode along; it now also says which MONSTER SHAPE the draft stores, so a
    // save writes the version this build actually produces.
    expect(
      JSON.parse(storage.values.get(ROOM_DRAFT_STORAGE_KEY) ?? '{}').version
    ).toBe(ROOM_DRAFT_ENVELOPE_VERSION);
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
    // THE MIGRATED DRAFT IS REWRITTEN AT THE CURRENT ENVELOPE VERSION, while
    // the LEGACY RECOVERY COPY IS LEFT EXACTLY AS IT WAS — which is the claim
    // this test exists to make (rpg-project#501 §6.1 moved the number to 5).
    expect(
      JSON.parse(v1Storage.values.get(ROOM_DRAFT_STORAGE_KEY) ?? '{}').version
    ).toBe(ROOM_DRAFT_ENVELOPE_VERSION);
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

    openIdentity();
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
      // `startingCell`, not `cell` (rpg-project#501 §6.1). This inline type
      // describes what the viewport emits, so it moves with the shape — a
      // stale copy here is what CI's typecheck caught after the local suite
      // passed, because vitest transpiles without checking types.
      startingCell: { location: { q: number; r: number }; facing?: string };
    }>;
    partyStart: { q: number; r: number } | null;
    selectedActorId: string | null;
  } {
    return JSON.parse(
      screen.getByTestId('viewport-actors').textContent ?? '{}'
    );
  }

  it('opens on Select, and selecting an actor arms a move that is spent by one click', () => {
    // WHAT CHANGED AND WHY (Kirk, 2026-09-19): the room opened on PAINT, so an
    // accidental first click authored walkable ground; and `select` plus a
    // selected actor meant the next floor click MOVED it, so an author could
    // not select a creature to edit its orders and then click a prop — or
    // empty ground — without relocating the creature. Neither is a way to just
    // look at what you placed.
    render(
      <WorldBuildingConcept
        roomMode
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
      />
    );

    // The default is Select: an accidental first click authors nothing.
    expect(
      screen
        .getByRole('button', { name: 'Select' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Paint' }).getAttribute('aria-pressed')
    ).toBe('false');
    expect(screen.getByTestId('interaction-status').textContent).toMatch(
      /Left: select/
    );

    // Placing one, then selecting it from the list, ARMS the move and says so…
    fireEvent.click(screen.getByRole('button', { name: 'Place skeleton' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit monster gesture' })
    );
    fireEvent.click(screen.getByRole('button', { name: /^Move monster / }));
    expect(
      screen.getByRole('button', { name: 'Move' }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.getByTestId('interaction-status').textContent).toMatch(
      /Click the floor: move monster/
    );

    // …and the move is ONE-SHOT: it is spent by the click that performs it, so
    // the next click is a plain selection again.
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit monster move gesture' })
    );
    expect(
      screen
        .getByRole('button', { name: 'Select' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.getByTestId('interaction-status').textContent).toMatch(
      /Left: select/
    );
  });

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
    expect(placed.startingCell.location).toEqual({ q: 1, r: 0 });
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
      // THE MOVE KEEPS THE FACING (rpg-project#501 §6.1): `startingCell` is one
      // noun, so moving a creature to another hex does not re-aim it. This
      // placement authored no facing, so the object carries only `location`.
      startingCell: { location: { q: 2, r: -2 } },
    });

    // One whole-room Undo, one Redo.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(actors().monsters[0].startingCell.location).toEqual({
      q: 1,
      r: 0,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(actors().monsters[0].startingCell.location).toEqual({
      q: 2,
      r: -2,
    });

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
    openIdentity();
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
    closeIdentity();
    expect(actors().monsters).toEqual([placed]);
    expect(actors().partyStart).toEqual({ q: 0, r: 0 });

    // Reload restores the autosaved bytes with the same actor identities.
    openIdentity();
    fireEvent.click(screen.getByRole('button', { name: 'Reload room draft' }));
    closeIdentity();
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

  it('imports the engine’s own v4 site, shows its policies, and publishes them unchanged', async () => {
    // The whole slice on one document (rpg-dnd5e-web#1157): the import
    // hydrates the editor's scope, the Policies and creature views report
    // document facts without editing them, and the publish transaction emits
    // the policies back instead of silently dropping them.
    const fixture = decodeWorldBuilderV4Site();
    render(
      <WorldBuildingConcept
        roomMode
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
        roomPublishing={{ characterId: 'char-1', onPlay: vi.fn() }}
      />
    );

    openIdentity();
    fireEvent.change(screen.getByRole('textbox', { name: 'Canonical YAML' }), {
      target: { value: WORLD_BUILDER_V4_SITE_YAML },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Import canonical YAML' })
    );
    await waitFor(() => expect(publishedDraft().id).toBe('room-1'));

    // Part 2 — the Policies node renders the site's factions and dispositions
    // as EDITABLE facts (rpg-dnd5e-web#1160): the id, the mix, the shared table
    // with each entry's weight, say and one word, and the pair's stance and
    // `until`.
    const policies = screen.getByTestId('site-factions');
    expect(
      (
        within(policies).getByLabelText(
          'Faction id for goblins'
        ) as HTMLInputElement
      ).value
    ).toBe('goblins');
    expect(
      within(policies).getByText(/coward ×2 · soldier ×1 · aggressive ×1/)
    ).toBeTruthy();
    expect(within(policies).getByText('intimidated')).toBeTruthy();
    expect(
      within(policies).getByText(
        /Fine! The cellar door is behind the barrels\./
      )
    ).toBeTruthy();
    // The pair and its stance are the DISPOSITIONS node's, which is a peer of
    // Factions now rather than a section inside one wrapper.
    const pair = screen.getByTestId('site-dispositions');
    expect(
      (
        within(pair).getByLabelText(
          'Between first faction'
        ) as HTMLSelectElement
      ).value
    ).toBe('goblins');
    expect(
      (within(pair).getByLabelText('Stance') as HTMLSelectElement).value
    ).toBe('hostile');
    expect(within(pair).getByText('fact goblin-cowed')).toBeTruthy();
    // Editable: the facts are controls now, not a readout.
    expect(
      policies.querySelectorAll('input, select, button').length
    ).toBeGreaterThan(0);

    // Part 3 — the selected goblin's inheritance against its own orders.
    fireEvent.click(
      screen.getByRole('button', { name: /^Move monster .* goblin-1$/ })
    );
    const creature = screen.getByLabelText('Selected creature');
    expect(
      (within(creature).getByLabelText('Creature faction') as HTMLInputElement)
        .value
    ).toBe('goblins');
    // ITS FACTION SUPPLIES the mix and the two-trigger table …
    expect(
      within(creature).getByText(/coward ×2 · soldier ×1 · aggressive ×1/)
    ).toBeTruthy();
    expect(within(creature).getAllByText('intimidated').length).toBeGreaterThan(
      0
    );
    // … and ITS OWN ORDERS override it: one word, one trigger, and a weapon
    // list read AS A LIST — the order is the point, so it is asserted in order
    // rather than as a joined string.
    expect(
      (within(creature).getByLabelText('Creature temper') as HTMLSelectElement)
        .value
    ).toBe('coward');
    expect(within(creature).getAllByText(/^time$/).length).toBeGreaterThan(0);
    expect(
      [
        ...within(creature)
          .getByTestId('creature-weapons')
          .querySelectorAll('ol li code'),
      ].map((weapon) => weapon.textContent)
    ).toEqual(['dnd5e:weapons:scimitar', 'dnd5e:weapons:shortbow']);
    expect(
      within(creature).getByTestId('faction-layer-rule').textContent
    ).toMatch(/nearest key wins WHOLESALE/);
    expect(
      within(creature).getByTestId('temper-asymmetry').textContent
    ).toMatch(/placement’s is one word/);

    // Part 1 — publishing the imported document keeps its policies.
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() => expect(publishRpc.gets).toHaveLength(1));
    expect(publishRpc.gets[0]!.key).toBe('front-room-site');
    await act(async () =>
      publishRpc.gets[0]!.deferred.reject(
        new ConnectError('new key', Code.NotFound)
      )
    );
    await waitFor(() =>
      expect(
        publishRpc.puts.filter((put) => !put.request.validateOnly)
      ).toHaveLength(1)
    );
    const emittedYaml = publishRpc.puts.find(
      (put) => !put.request.validateOnly
    )!.request.yaml;
    expect(emittedYaml.startsWith('version: 4\n')).toBe(true);
    const emitted = decodeSingleRoomDungeon(emittedYaml);
    expect(emitted.factions).toEqual(fixture.factions);
    expect(emitted.dispositions).toEqual(fixture.dispositions);
  });

  it('moves a document’s policies with it through undo, and empties them on New room', async () => {
    // The scope travels in the same history entry as the draft: an Undo
    // across two imports must not pair document A's room with document B's
    // policies, and New room must author none.
    const plain = encodeSingleRoomDungeon({
      key: 'plain-room',
      draft: createRoomDraft(createEmptyScene('scene-plain'), 'room-plain'),
    });
    render(
      <WorldBuildingConcept
        roomMode
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
        roomPublishing={{ characterId: 'char-1', onPlay: vi.fn() }}
      />
    );
    const importYaml = (text: string) => {
      fireEvent.change(
        screen.getByRole('textbox', { name: 'Canonical YAML' }),
        { target: { value: text } }
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Import canonical YAML' })
      );
    };

    openIdentity();
    importYaml(WORLD_BUILDER_V4_SITE_YAML);
    await waitFor(() => expect(publishedDraft().id).toBe('room-1'));
    expect(screen.getByTestId('site-factions')).toBeTruthy();
    expect(screen.getByTestId('site-dispositions')).toBeTruthy();

    // A policy-free document replaces it: the scope is emptied with the draft.
    importYaml(plain);
    await waitFor(() => expect(publishedDraft().id).toBe('room-plain'));
    expect(screen.getByTestId('policies-none')).toBeTruthy();

    // Undo restores the earlier document TOGETHER WITH its policies.
    closeIdentity();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(publishedDraft().id).toBe('room-1');
    expect(
      within(screen.getByTestId('site-factions')).getByLabelText(
        'Faction id for goblins'
      )
    ).toBeTruthy();

    // New room is a fresh document: it authors no policies.
    openIdentity();
    fireEvent.click(screen.getByRole('button', { name: 'New room' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm new room' }));
    expect(screen.getByTestId('policies-none')).toBeTruthy();
  });

  it('authors policies with no YAML, keeps them across a reload, and publishes them', async () => {
    // The whole loop this slice exists for (rpg-dnd5e-web#1160): an author
    // creates a faction and a disposition in the Policies node with no YAML,
    // the local envelope carries them, a RELOAD brings them back, and the
    // reloaded room publishes the document it was saved as instead of one the
    // engine refuses for an undeclared faction.
    const storage = new MemoryStorage();
    const mount = () => (
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={deterministicIds()}
        roomPublishing={{ characterId: 'char-1', onPlay: vi.fn() }}
      />
    );

    const first = render(mount());
    // A faction, then its id renamed to what a placement would name.
    fireEvent.click(screen.getByRole('button', { name: 'Add faction' }));
    const idInput = screen.getByLabelText(
      'Faction id for faction-1'
    ) as HTMLInputElement;
    fireEvent.change(idInput, { target: { value: 'goblins' } });
    fireEvent.blur(idInput);
    // A disposition between the new faction and the party.
    fireEvent.click(screen.getByRole('button', { name: 'Add disposition' }));
    expect(screen.getByLabelText('Faction id for goblins')).toBeTruthy();

    // The local envelope carries the scope beside the draft.
    await waitFor(() => {
      const stored = JSON.parse(
        storage.values.get(ROOM_DRAFT_STORAGE_KEY) ?? '{}'
      ) as { version: number; scope?: SiteScope };
      expect(stored.version).toBe(ROOM_DRAFT_ENVELOPE_VERSION);
      expect(stored.scope?.factions?.[0]?.id).toBe('goblins');
    });
    first.unmount();

    // Reload from the same storage: the policies are back, with no import.
    render(mount());
    expect(screen.getByLabelText('Faction id for goblins')).toBeTruthy();

    // Publish, and the emitted document carries what was saved.
    openIdentity();
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() => expect(publishRpc.gets).toHaveLength(1));
    await act(async () =>
      publishRpc.gets[0]!.deferred.reject(
        new ConnectError('new key', Code.NotFound)
      )
    );
    await waitFor(() =>
      expect(
        publishRpc.puts.filter((put) => !put.request.validateOnly)
      ).toHaveLength(1)
    );
    const emittedYaml = publishRpc.puts.find(
      (put) => !put.request.validateOnly
    )!.request.yaml;
    expect(emittedYaml.startsWith('version: 4\n')).toBe(true);
    const emitted = decodeSingleRoomDungeon(emittedYaml);
    expect(emitted.factions?.map((faction) => faction.id)).toEqual(['goblins']);
    expect(emitted.dispositions?.[0]?.between).toEqual(['goblins', 'party']);
  });

  it("authors a creature's weapon list in order with no YAML, and publishes that order", async () => {
    // The loop this slice exists for (rpg-dnd5e-web#1164): an author selects a
    // placed creature and gives it weapons in a deliberate order, with no YAML.
    // ORDER IS THE POINT — the driver reaches for the FIRST action in reach —
    // so the REORDER is the assertion that matters. Two refs surviving would
    // pass even if the list were sorted, which is exactly the bug this test is
    // here to catch.
    const storage = new MemoryStorage();
    const mount = () => (
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={deterministicIds()}
        roomPublishing={{ characterId: 'char-1', onPlay: vi.fn() }}
      />
    );

    const first = render(mount());
    fireEvent.click(screen.getByRole('button', { name: 'Place skeleton' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit monster gesture' })
    );
    fireEvent.click(screen.getByRole('button', { name: /^Move monster / }));

    // The bow, then the blade, then the blade moved FIRST — the author's order
    // is deliberately not the order they were typed in.
    fireEvent.change(screen.getByLabelText('New weapon reference'), {
      target: { value: 'dnd5e:weapons:shortbow' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add weapon' }));
    fireEvent.change(screen.getByLabelText('New weapon reference'), {
      target: { value: 'dnd5e:weapons:scimitar' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add weapon' }));
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Move dnd5e:weapons:scimitar earlier',
      })
    );

    const shownWeapons = () =>
      [
        ...screen
          .getByTestId('creature-weapons')
          .querySelectorAll('ol li code'),
      ].map((weapon) => weapon.textContent);
    expect(shownWeapons()).toEqual([
      'dnd5e:weapons:scimitar',
      'dnd5e:weapons:shortbow',
    ]);

    // The order is what the local envelope carries …
    await waitFor(() => {
      const stored = JSON.parse(
        storage.values.get(ROOM_DRAFT_STORAGE_KEY) ?? '{}'
      ) as {
        draft?: {
          room?: { monsterBindings?: Record<string, { actions?: string[] }> };
        };
      };
      const bindings = stored.draft?.room?.monsterBindings ?? {};
      const ids = Object.keys(bindings);
      expect(ids).toHaveLength(1);
      expect(bindings[ids[0]!]?.actions).toEqual([
        'dnd5e:weapons:scimitar',
        'dnd5e:weapons:shortbow',
      ]);
    });
    first.unmount();

    // … it survives a reload with no import …
    render(mount());
    fireEvent.click(screen.getByRole('button', { name: /^Move monster / }));
    expect(shownWeapons()).toEqual([
      'dnd5e:weapons:scimitar',
      'dnd5e:weapons:shortbow',
    ]);

    // … and it is what the ENGINE is handed. Orders alone are a v4 key, so the
    // document must claim 4 even with no site scope authored.
    openIdentity();
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() => expect(publishRpc.gets).toHaveLength(1));
    await act(async () =>
      publishRpc.gets[0]!.deferred.reject(
        new ConnectError('new key', Code.NotFound)
      )
    );
    await waitFor(() =>
      expect(
        publishRpc.puts.filter((put) => !put.request.validateOnly)
      ).toHaveLength(1)
    );
    const emittedYaml = publishRpc.puts.find(
      (put) => !put.request.validateOnly
    )!.request.yaml;
    expect(emittedYaml.startsWith('version: 4\n')).toBe(true);
    const emitted = decodeSingleRoomDungeon(emittedYaml);
    const bindings = emitted.draft.room.monsterBindings ?? {};
    const ids = Object.keys(bindings);
    expect(ids).toHaveLength(1);
    expect(bindings[ids[0]!]?.actions).toEqual([
      'dnd5e:weapons:scimitar',
      'dnd5e:weapons:shortbow',
    ]);
  });

  it('authors a placed prop’s orders — holdable and a carried record — and publishes the block (rpg-project#488 R1)', async () => {
    // The fourth declaration kind, authored through the form. The engine
    // decodes this block and REFUSES it at compile until rpg-toolkit#1854, so
    // what this test claims is the DOCUMENT half: the block the author wrote
    // reaches the published YAML intact rather than being dropped by the
    // builder — the failure mode this whole wave is about.
    const storage = new MemoryStorage();
    const seed = seedImportedRoom(storage);
    // The prop needs a declaration to be a candidate at all: that is where its
    // footprint comes from, and the engine refuses a binding without one.
    seed.room.propDeclarations = {
      'prop-1': {
        blocksMovement: false,
        blocksLineOfSight: false,
        footprint: { width: 1, depth: 1, offsetX: 0, offsetZ: 0 },
      },
    };
    storage.setItem(ROOM_DRAFT_STORAGE_KEY, stringifyRoomDraft(seed));

    render(
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={deterministicIds()}
        roomPublishing={{ characterId: 'char-1', onPlay: vi.fn() }}
      />
    );

    // A record to carry first, so the picker has something to offer.
    fireEvent.click(screen.getByRole('button', { name: 'Add intel record' }));
    fireEvent.change(screen.getByLabelText('Intel reveals fact for intel-1'), {
      target: { value: 'saved-wiseman' },
    });

    // A prop's options belong to the SELECTION now (web#1178), so the prop is
    // chosen first — that selection is what the panel is about.
    fireEvent.click(screen.getByLabelText('Select Books prop-1'));
    const panel = screen.getByTestId('prop-orders-prop-1');
    fireEvent.click(within(panel).getByLabelText('Holdable for prop-1'));
    fireEvent.change(
      within(panel).getByLabelText('Give prop-1 an intel record'),
      {
        target: { value: 'intel-1' },
      }
    );

    // The local envelope carries it …
    await waitFor(() => {
      const stored = JSON.parse(
        storage.values.get(ROOM_DRAFT_STORAGE_KEY) ?? '{}'
      ) as { draft?: { room?: { propBindings?: Record<string, unknown> } } };
      expect(stored.draft?.room?.propBindings).toEqual({
        'prop-1': { holdable: true, holds: ['intel-1'] },
      });
    });

    // … and it is what the ENGINE is handed.
    openIdentity();
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() => expect(publishRpc.gets).toHaveLength(1));
    await act(async () =>
      publishRpc.gets[0]!.deferred.reject(
        new ConnectError('new key', Code.NotFound)
      )
    );
    await waitFor(() =>
      expect(
        publishRpc.puts.filter((put) => !put.request.validateOnly)
      ).toHaveLength(1)
    );
    const emittedYaml = publishRpc.puts.find(
      (put) => !put.request.validateOnly
    )!.request.yaml;
    expect(emittedYaml).toContain('propBindings:');
    const emitted = decodeSingleRoomDungeon(emittedYaml);
    expect(emitted.draft.room.propBindings).toEqual({
      'prop-1': { holdable: true, holds: ['intel-1'] },
    });
  });

  it('authors intel and a creature in reserve with no YAML, and publishes both (web#1176)', async () => {
    // The Front Room's driving case, end to end: a record is declared in the
    // Intel node, a creature holds it and is held in reserve until the fact it
    // teaches lands. Nothing here is YAML — and the point of the test is that
    // NOTHING IS DROPPED between the forms and the bytes the engine is handed.
    // The three drop bugs this slice had to fix (the two encode calls and the
    // storage envelope each enumerated only factions/dispositions) would leave
    // this test green on intel and red on the published document.
    //
    // THE PRICED CHECKS WERE PART OF THIS WALK AND ARE GONE
    // (rpg-dnd5e-web#1201): the builder no longer offers `intimidate` or
    // `persuade`, so the walk authors what it still can.
    const storage = new MemoryStorage();
    const mount = () => (
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={deterministicIds()}
        roomPublishing={{ characterId: 'char-1', onPlay: vi.fn() }}
      />
    );

    const first = render(mount());

    // 1. An intel record naming the fact the lie teaches.
    fireEvent.click(screen.getByRole('button', { name: 'Add intel record' }));
    const idBox = screen.getByLabelText(
      'Intel id for intel-1'
    ) as HTMLInputElement;
    fireEvent.change(idBox, { target: { value: 'cellar-lie' } });
    fireEvent.blur(idBox);
    fireEvent.change(
      screen.getByLabelText('Intel reveals fact for cellar-lie'),
      {
        target: { value: 'cellar-is-clear' },
      }
    );

    // 2. A creature, with the record in its hands.
    fireEvent.click(screen.getByRole('button', { name: 'Place skeleton' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit monster gesture' })
    );
    fireEvent.click(screen.getByRole('button', { name: /^Move monster / }));

    fireEvent.change(screen.getByLabelText('Give intel record'), {
      target: { value: 'cellar-lie' },
    });

    // 3. Held in reserve until that fact lands.
    fireEvent.change(screen.getByLabelText('Arrives form'), {
      target: { value: 'fact' },
    });
    fireEvent.change(screen.getByLabelText('Arrives fact'), {
      target: { value: 'cellar-is-clear' },
    });

    // The local envelope carries all of it beside the draft.
    await waitFor(() => {
      const stored = JSON.parse(
        storage.values.get(ROOM_DRAFT_STORAGE_KEY) ?? '{}'
      ) as {
        scope?: SiteScope;
        draft?: {
          room?: {
            monsterBindings?: Record<
              string,
              {
                holds?: string[];
                arrives?: { fact?: string };
              }
            >;
          };
        };
      };
      expect(stored.scope?.intel).toEqual([
        { id: 'cellar-lie', reveals: { fact: 'cellar-is-clear' } },
      ]);
      const bindings = stored.draft?.room?.monsterBindings ?? {};
      const only = Object.values(bindings)[0];
      expect(only?.holds).toEqual(['cellar-lie']);
      expect(only?.arrives).toEqual({ fact: 'cellar-is-clear' });
    });
    first.unmount();

    // It survives a reload with no import …
    render(mount());
    fireEvent.click(screen.getByRole('button', { name: /^Move monster / }));
    expect(screen.getByTestId('creature-arrives-note').textContent).toMatch(
      /Held in reserve until fact cellar-is-clear/
    );
    // And the removed control stays removed across a reload.
    expect(screen.queryByLabelText('Persuade dc 0')).toBeNull();

    // … and it is what the ENGINE is handed.
    openIdentity();
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() => expect(publishRpc.gets).toHaveLength(1));
    await act(async () =>
      publishRpc.gets[0]!.deferred.reject(
        new ConnectError('new key', Code.NotFound)
      )
    );
    await waitFor(() =>
      expect(
        publishRpc.puts.filter((put) => !put.request.validateOnly)
      ).toHaveLength(1)
    );
    const emittedYaml = publishRpc.puts.find(
      (put) => !put.request.validateOnly
    )!.request.yaml;
    expect(emittedYaml.startsWith('version: 4\n')).toBe(true);
    const emitted = decodeSingleRoomDungeon(emittedYaml);
    expect(emitted.intel).toEqual([
      { id: 'cellar-lie', reveals: { fact: 'cellar-is-clear' } },
    ]);
    const emittedBindings = emitted.draft.room.monsterBindings ?? {};
    const emittedCreature = Object.values(emittedBindings)[0];
    expect(emittedCreature?.holds).toEqual(['cellar-lie']);
    expect(emittedCreature?.arrives).toEqual({ fact: 'cellar-is-clear' });
  });

  it('New room adopts a fresh undoable identity and cannot reuse the old publication shortcut', async () => {
    const storage = new MemoryStorage();
    const original = seedImportedRoom(storage);
    render(
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={deterministicIds()}
        roomPublishing={{ characterId: 'char-1', onPlay: vi.fn() }}
      />
    );
    openIdentity();
    const oldKey = (
      screen.getByRole('textbox', { name: 'Dungeon key' }) as HTMLInputElement
    ).value;
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() => expect(publishRpc.gets).toHaveLength(1));
    expect(
      (
        screen.getByRole('button', {
          name: 'Checking key…',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    await act(async () =>
      publishRpc.gets[0]!.deferred.reject(
        new ConnectError('new key', Code.NotFound)
      )
    );
    await waitFor(() =>
      expect(
        publishRpc.puts.filter((p) => !p.request.validateOnly)
      ).toHaveLength(1)
    );
    await act(async () =>
      publishRpc.puts
        .find((p) => !p.request.validateOnly)!
        .deferred.resolve({ errors: [] } as never)
    );
    await screen.findByText(`Saved to the authoring server as “${oldKey}”.`);

    fireEvent.click(screen.getByRole('button', { name: 'New room' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm new room' }));
    const fresh = publishedDraft();
    expect(fresh.id).not.toBe(original.id);
    expect(fresh.name).toBe('Untitled room');
    expect(fresh.room.implicitRegionId).toBe(`${fresh.id}-region`);
    expect(fresh.scene.items).toEqual([]);
    expect(JSON.parse(storage.getItem(ROOM_DRAFT_STORAGE_KEY)!).draft.id).toBe(
      fresh.id
    );
    expect(
      (screen.getByRole('textbox', { name: 'Dungeon key' }) as HTMLInputElement)
        .value
    ).toBe(`room-${fresh.id}`);

    // Deliberately target the previous file: a different document must ask,
    // even though this same mounted publishing hook saved that key earlier.
    fireEvent.change(screen.getByRole('textbox', { name: 'Dungeon key' }), {
      target: { value: oldKey },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save to server' }));
    await waitFor(() => expect(publishRpc.gets).toHaveLength(2));
    expect(publishRpc.gets[1]!.key).toBe(oldKey);
    await act(async () =>
      publishRpc.gets[1]!.deferred.resolve({
        yaml: 'previous document',
      } as never)
    );
    await screen.findByRole('alertdialog', { name: `Overwrite ${oldKey}` });
    expect(publishRpc.puts.filter((p) => !p.request.validateOnly)).toHaveLength(
      1
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    closeIdentity();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(publishedDraft()).toEqual(original);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(publishedDraft()).toEqual(fresh);
  });

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
    openIdentity();
    fireEvent.change(screen.getByLabelText('Site name'), {
      target: { value: 'Renamed by author' },
    });
    fireEvent.blur(screen.getByLabelText('Site name'));

    const renamed = publishedDraft();
    expect(renamed.name).toBe('Renamed by author');
    expect(renamed.scene.name).toBe('Renamed by author');

    // Exactly one Undo restores BOTH names.
    closeIdentity();
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
    openIdentity();
    fireEvent.change(screen.getByLabelText('Site name'), {
      target: { value: 'Busy test room' },
    });
    fireEvent.blur(screen.getByLabelText('Site name'));
    expect(publishedDraft().name).toBe('Busy test room');
    openIdentity();
    fireEvent.click(screen.getByRole('button', { name: 'Save & Play' }));
    await waitFor(() => expect(publishRpc.gets).toHaveLength(1));
    publishRpc.gets[0]!.deferred.reject(
      new (await import('@connectrpc/connect')).ConnectError(
        'no such key',
        (await import('@connectrpc/connect')).Code.NotFound
      )
    );
    // Wait for the TRANSACTIONAL save, not merely the first `putDungeon`:
    // the debounced background preview also issues one (validateOnly) and
    // can land first, because the click's synchronous DOM work can outlast
    // the 400ms preview debounce on a slow runner. Indexing `puts[0]` then
    // resolves the preview's deferred and strands the save forever.
    await waitFor(() =>
      expect(
        publishRpc.puts.filter((p) => !p.request.validateOnly)
      ).toHaveLength(1)
    );

    // While the save is in flight: keyboard undo is a no-op.
    const before = screen.getByTestId('room-draft-json').textContent;
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.getByTestId('room-draft-json').textContent).toBe(before);

    // Every source-changing path is refused. The Identity panel overlays the
    // canvas without unmounting it, so the canvas gesture the old Library
    // destination could not produce is exercised here too.
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit rectangle gesture' })
    );
    expect(screen.getByTestId('room-draft-json').textContent).toBe(before);
    expect(
      (
        screen.getByRole('button', {
          name: 'Reload room draft',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.change(screen.getByLabelText('Portable JSON'), {
      target: { value: '{"kind":"rpg-room-authoring-draft","version":3}' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Import room draft JSON' })
    );
    expect(screen.getByTestId('room-draft-json').textContent).toBe(before);
    expect(publishedDraft().name).toBe('Busy test room');
    expect(screen.getByRole('alert').textContent).toMatch(
      /Save & Play is running/
    );

    // The transaction completes: the shared launch ran for the same
    // captured key, and the editor unlocks. Resolve the save itself, never
    // whichever `putDungeon` happened to be recorded first.
    publishRpc.puts
      .find((p) => !p.request.validateOnly)!
      .deferred.resolve({ errors: [] } as never);
    await waitFor(() => expect(onPlay).toHaveBeenCalledWith('enc-1', 'char-1'));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(publishedDraft().name).toBe('Imported room title');
  });
});

describe('WorldBuildingConcept site organization (web#1152, corrected model)', () => {
  it('collapses Props by default and merges the palette and the checkbox-free tree in one section', () => {
    const storage = new MemoryStorage();
    render(
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={deterministicIds()}
      />
    );

    // Rooms is navigation and open; Props is collapsed by default.
    const rooms = screen.getByLabelText('Rooms');
    expect((rooms.closest('details') as HTMLDetailsElement).open).toBe(true);
    const props = screen.getByLabelText('Props');
    expect((props.closest('details') as HTMLDetailsElement).open).toBe(false);

    // The one room is a camera target marked as current.
    expect(
      screen
        .getByRole('button', { name: /^Focus room / })
        .getAttribute('aria-current')
    ).toBe('true');

    dragLabelTo('Drag Books into scene');
    expect(scene().items).toHaveLength(1);
    openProps();
    expect(
      (screen.getByLabelText('Props').closest('details') as HTMLDetailsElement)
        .open
    ).toBe(true);

    // The palette and the scene tree are in the SAME section, and the tree
    // has NO checkboxes: a row click is a plain select and Shift-click
    // extends/toggles, mirroring the canvas.
    expect(screen.getByLabelText('Search assets')).toBeTruthy();
    expect(screen.getByLabelText('Placed props')).toBeTruthy();
    expect(
      screen.queryByRole('checkbox', { name: /Select books/i })
    ).toBeNull();
    // A valid drop selects the new prop.
    expect(screen.getByTestId('viewport-selection').textContent).toBe(
      scene().items[0]!.id
    );
    fireEvent.click(screen.getByRole('button', { name: /Select books/i }));
    expect(screen.getByTestId('viewport-selection').textContent).toBe(
      scene().items[0]!.id
    );
    fireEvent.click(screen.getByRole('button', { name: /Select books/i }), {
      shiftKey: true,
    });
    expect(screen.getByTestId('viewport-selection').textContent).toBe('');
  });

  it('groups the site tree under its group with loose props after, nesting parentId and marking supportId', () => {
    const storage = new MemoryStorage();
    const draft = createRoomDraft(createEmptyScene('tree-scene'), 'tree-room');
    draft.scene.groups = [
      {
        id: 'g1',
        kind: 'group',
        label: 'Dining set',
        transform: { x: 0, y: 0, z: 0, rotationY: 0 },
      },
    ];
    draft.scene.items = [
      {
        id: 'loose-1',
        kind: 'prop',
        assetRef: 'dnd5e:props:books',
        label: 'Loose books',
        transform: { x: 0, y: 0, z: 0, rotationY: 0 },
      },
      {
        id: 'member-1',
        kind: 'prop',
        assetRef: 'dnd5e:props:vase',
        label: 'Grouped vase',
        parentId: 'g1',
        transform: { x: 1, y: 0, z: 0, rotationY: 0 },
      },
      {
        id: 'attached-1',
        kind: 'prop',
        assetRef: 'dnd5e:props:books',
        label: 'Attached books',
        supportId: 'member-1',
        transform: { x: 1, y: 0.5, z: 0, rotationY: 0 },
      },
    ];
    storage.setItem(ROOM_DRAFT_STORAGE_KEY, stringifyRoomDraft(draft));
    render(
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={deterministicIds()}
      />
    );
    openProps();

    const rows = Array.from(
      screen
        .getByLabelText('Placed props')
        .querySelectorAll('button.wb-tree-row')
    ).map((row) => row.textContent);
    // Group first, its members nested under it, then the loose props.
    expect(rows).toEqual([
      'Dining set',
      '↳ Grouped vase',
      'Loose books',
      'Attached books · attached',
    ]);
  });

  it('treats the room entry as pure navigation: it never changes the site nouns', () => {
    render(
      <WorldBuildingConcept
        roomMode
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
      />
    );

    // The right-hand nouns are present whichever room the camera is on. These
    // are the SITE's nouns — shared things, keyed to the document. A prop's own
    // options are NOT among them (web#1178): they belong to a selection, so
    // nothing here lists every door or every prop any more.
    expect(screen.getByLabelText('Monsters')).toBeTruthy();
    // The site's nouns are peers, each its own collapsible node: "Policies"
    // was a wrapper over exactly two of them (rpg-dnd5e-web#1178 follow-up).
    expect(screen.getByLabelText('Factions')).toBeTruthy();
    expect(screen.getByLabelText('Dispositions')).toBeTruthy();
    expect(screen.getByLabelText('Intel')).toBeTruthy();
    expect(screen.queryByLabelText('Doors')).toBeNull();
    expect(screen.queryByLabelText('Prop orders')).toBeNull();
    // A local room draft carries no site scope, and the read-only Policies
    // view says so plainly: absence is the authored state, not an error.
    expect(screen.getByTestId('policies-none')).toBeTruthy();

    const selectionBefore =
      screen.getByTestId('viewport-selection').textContent;
    fireEvent.click(screen.getByRole('button', { name: /^Focus room / }));
    expect(screen.getByLabelText('Monsters')).toBeTruthy();
    // The site's nouns are peers, each its own collapsible node: "Policies"
    // was a wrapper over exactly two of them (rpg-dnd5e-web#1178 follow-up).
    expect(screen.getByLabelText('Factions')).toBeTruthy();
    expect(screen.getByLabelText('Dispositions')).toBeTruthy();
    expect(screen.getByLabelText('Intel')).toBeTruthy();
    expect(screen.getByTestId('policies-none')).toBeTruthy();
    expect(screen.getByTestId('viewport-selection').textContent).toBe(
      selectionBefore
    );
  });

  it('reads a selected creature as inherited vs overridden, with both asymmetries stated', () => {
    render(
      <WorldBuildingConcept
        roomMode
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
      />
    );

    // Nothing selected: no creature facts and no selection declarations.
    expect(
      screen.queryByRole('region', { name: 'Selection declarations' })
    ).toBeNull();
    expect(screen.queryByText('Faction')).toBeNull();

    // A selected creature names the actor's orders shape in one place.
    fireEvent.click(screen.getByRole('button', { name: 'Place skeleton' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Commit monster gesture' })
    );
    fireEvent.click(screen.getByRole('button', { name: /^Move monster / }));
    // ONE RULE FOR EVERY NOUN (web#1178): a creature is a selection, so its
    // facts open the SAME scope the props use — not a section inside the
    // Monsters roster. Selecting it is what shows them.
    expect(screen.getByTestId('selected-creature')).toBeTruthy();
    expect(
      screen.getByRole('region', { name: 'Selection declarations' })
    ).toBeTruthy();
    expect(screen.getByText('Faction')).toBeTruthy();
    expect(screen.getByText('Inherits')).toBeTruthy();
    expect(screen.getByText('Overrides')).toBeTruthy();
    // `faction` absent is the kind's default, never a faction named
    // `monsters` and never an error.
    expect(screen.getByTestId('creature-inherits-none')).toBeTruthy();
    // The OVERRIDES half is an EDITOR on the authoring surface, so its empty
    // state is stated per section and each statement is actionable. The
    // read-only single line survives only where no editor is wired
    // (`SitePolicies.test.tsx` covers that path).
    expect(screen.getByTestId('creature-weapons-none')).toBeTruthy();
    // THE CREATURE'S ORDERS ARE NAMED, NOT PASTED (rpg-dnd5e-web#1201). The
    // inline table editor was REMOVED from this panel by Kirk's ruling — "there
    // should be no inline table defined on a monster anymore" — so what stands
    // here is the answer to "what does it answer WITH": a picker over the site's
    // root tables, and the statement that names none.
    expect(screen.getByTestId('creature-table-none')).toBeTruthy();
    expect(
      (screen.getByLabelText('Table for id-4') as HTMLSelectElement).value
    ).toBe('');
    // And the inline table it no longer authors has no editor here: the row
    // appears only READ-ONLY when a hand-written file carries one, which this
    // document does not.
    expect(screen.queryByTestId('creature-inline-table-readonly')).toBeNull();
    expect(
      (screen.getByLabelText('Creature temper') as HTMLSelectElement).value
    ).toBe('');
    // Both asymmetries are stated where an author reads the split.
    expect(screen.getByTestId('faction-layer-rule').textContent).toMatch(
      /nearest key wins WHOLESALE/
    );
    expect(screen.getByTestId('temper-asymmetry').textContent).toMatch(
      /placement’s is one word/
    );
    // A creature is a SELECTION like any other (web#1178), so the scope that
    // holds its facts is the same one a prop opens. What a creature does NOT
    // get is the prop half of that scope — a transform and a footprint are not
    // properties of a placed actor.
    expect(screen.getByTestId('selected-creature')).toBeTruthy();
    expect(screen.queryByTestId('selected-prop-orders')).toBeNull();
    expect(screen.queryByLabelText('Movement & sight declaration')).toBeNull();

    // Props selected: the same scope, now carrying the prop's own sections.
    dragLabelTo('Drag Books into scene');
    expect(
      screen.getByRole('region', { name: 'Selection declarations' })
    ).toBeTruthy();
  });

  it('keeps arrangement library and portable JSON out of the Site body and inside Identity', () => {
    const storage = new MemoryStorage();
    render(
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={deterministicIds()}
        compositionSource={{
          worldId: 'test-world',
          reader: {
            listCompositions: vi.fn(async () => []),
            getComposition: vi.fn(),
          },
        }}
      />
    );

    // Not in the site's build body.
    expect(screen.queryByText('Arrangement library')).toBeNull();
    expect(screen.queryByLabelText('Portable JSON')).toBeNull();
    // In the Identity panel, along with the revision history.
    openIdentity();
    expect(screen.getByText('Arrangement library')).toBeTruthy();
    expect(screen.getByLabelText('Portable JSON')).toBeTruthy();
    expect(
      screen.getByRole('region', { name: 'Revision history' })
    ).toBeTruthy();
    expect(screen.getByLabelText('Site name')).toBeTruthy();
    // Closing it puts the document admin away again.
    closeIdentity();
    expect(screen.queryByText('Arrangement library')).toBeNull();
    expect(screen.queryByLabelText('Portable JSON')).toBeNull();
  });
});

describe('per-prop options belong to the selection (web#1178)', () => {
  /** The one asset the catalog declares leaves for. Dropping a prop SELECTS it
   * (`dropIntoScene`), which is why these tests land on the panel directly. */
  const DOOR_LABEL = 'Drag Double Door into scene';

  function mount() {
    render(
      <WorldBuildingConcept
        roomMode
        storage={new MemoryStorage()}
        idFactory={deterministicIds()}
      />
    );
  }

  /** The id the scene gave the prop just dropped. */
  function firstPropId(): string {
    return publishedDraft().scene.items[0]!.id;
  }

  it('offers orders for a selected, declared, non-door prop', () => {
    mount();
    dragLabelTo('Drag Books into scene');
    // A plain prop has no door state — it is not a door.
    expect(screen.queryByTestId('selected-door-state')).toBeNull();
    // An UNDECLARED prop gets the declaration button rather than orders:
    // holdable hangs off the declaration the engine requires, so offering it
    // here would invite a refusal the author could not explain.
    expect(screen.queryByTestId('selected-prop-orders')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Add authored footprint' })
    );
    expect(screen.getByTestId('selected-prop-orders')).toBeTruthy();
  });

  it('offers door state for a selected door, and never orders beside it', () => {
    mount();
    // Find the door the way an author would — the palette is long, so the
    // search box is the way to it.
    dragLabelTo(DOOR_LABEL, 'canvas-ground', 'door');
    expect(screen.getByTestId('selected-door-state')).toBeTruthy();
    // A door may not also carry orders — the engine's refusal, mirrored here so
    // the panel cannot offer the combination.
    expect(screen.queryByTestId('selected-prop-orders')).toBeNull();
    // And the door is the SELECTED prop, so nothing listed every door.
    expect(screen.queryByLabelText('Doors')).toBeNull();
  });

  it('hides both per-prop sections for a multi-selection, and says why', () => {
    mount();
    dragLabelTo('Drag Books into scene');
    dragLabelTo('Drag Candles into scene');
    const [books, candles] = publishedDraft().scene.items;
    fireEvent.click(
      screen.getByLabelText(`Select ${books!.label} ${books!.id}`)
    );
    fireEvent.click(
      screen.getByLabelText(`Select ${candles!.label} ${candles!.id}`),
      { shiftKey: true }
    );
    expect(screen.queryByTestId('selected-door-state')).toBeNull();
    expect(screen.queryByTestId('selected-prop-orders')).toBeNull();
    // One control cannot mean two props' values, so the panel states that
    // rather than leaving an unexplained gap.
    expect(screen.getByTestId('option-sections-multi').textContent).toMatch(
      /belong to one prop/
    );
    // What DOES generalise is still offered.
    expect(
      screen.getByRole('region', { name: 'Selection declarations' })
    ).toBeTruthy();
  });

  it('a single selection offers no multi-select explanation', () => {
    mount();
    dragLabelTo('Drag Books into scene');
    // The drop SELECTS the prop, which is what makes its options appear at all
    // — and with one prop there is no multi-selection to explain.
    expect(screen.getByTestId('viewport-selection').textContent).toBe(
      firstPropId()
    );
    expect(screen.queryByTestId('option-sections-multi')).toBeNull();
  });
});
