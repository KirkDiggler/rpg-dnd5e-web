import type { CompositionSource } from '@/compositions/compositionSource';
import { create } from '@bufbuild/protobuf';
import { CompositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCENE_STORAGE_KEY, stringifyScene } from './serialization';
import type { KeyValueStorage, WorldScene } from './types';
import { WorldBuildingConcept } from './WorldBuildingConcept';

const DRAG_MIME = 'application/x-rpg-world-building-item+json';

vi.mock('@/compositions/CompositionThumbnailRenderer', () => ({
  ThumbnailRenderer: () => null,
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
