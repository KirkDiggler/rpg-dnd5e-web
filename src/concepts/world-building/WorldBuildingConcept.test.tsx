import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KeyValueStorage, WorldScene } from './types';
import { WorldBuildingConcept } from './WorldBuildingConcept';

const DRAG_MIME = 'application/x-rpg-world-building-item+json';

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

describe('WorldBuildingConcept drag-to-add and gizmo shell', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
    mounted.unmount();

    render(<WorldBuildingConcept storage={storage} idFactory={ids} />);
    expect(scene().items).toHaveLength(1);
    expect(screen.getByText('Books arrangement')).toBeTruthy();
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
