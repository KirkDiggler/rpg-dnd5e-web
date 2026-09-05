import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KeyValueStorage, WorldScene } from './types';
import { WorldBuildingConcept } from './WorldBuildingConcept';

vi.mock('./WorldBuildingViewport', () => ({
  WorldBuildingViewport: (props: {
    scene: WorldScene;
    selectedIds: string[];
    placement: { kind: 'prop' | 'arrangement'; id: string } | null;
    onPlaceGround: (point: { x: number; z: number }) => void;
    onPlaceSurface: (
      point: { x: number; y: number; z: number },
      supportId: string
    ) => void;
  }) => (
    <div data-testid="mock-world-viewport">
      <output data-testid="viewport-scene">
        {JSON.stringify(props.scene)}
      </output>
      <output data-testid="viewport-selection">
        {props.selectedIds.join(',')}
      </output>
      <output data-testid="viewport-tool">
        {props.placement
          ? `${props.placement.kind}:${props.placement.id}`
          : 'select'}
      </output>
      <button onClick={() => props.onPlaceGround({ x: 0.13, z: -0.27 })}>
        Canvas ground
      </button>
      <button
        disabled={!props.scene.items[0]}
        onClick={() =>
          props.onPlaceSurface(
            { x: 0.22, y: 0.72, z: -0.18 },
            props.scene.items[0]!.id
          )
        }
      >
        Canvas tabletop
      </button>
    </div>
  ),
}));

class MemoryStorage implements KeyValueStorage {
  values = new Map<string, string>();
  failGet = false;
  failSet = false;
  getItem(key: string): string | null {
    if (this.failGet) throw new Error('storage blocked');
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failSet) throw new Error('quota blocked');
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

afterEach(() => vi.restoreAllMocks());

describe('WorldBuildingConcept real editing path', () => {
  it('builds a decorated table with automatic pointer support, groups, and undo/redo', () => {
    const storage = new MemoryStorage();
    render(
      <WorldBuildingConcept storage={storage} idFactory={deterministicIds()} />
    );
    expect(screen.getByText(/No saved arrangements yet/i)).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Place Torture Table' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Canvas ground' }));
    fireEvent.click(screen.getByRole('button', { name: 'Place Candles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Canvas tabletop' }));

    expect(scene().items).toHaveLength(2);
    expect(scene().items[0].transform).toMatchObject({
      x: 0.13,
      y: 0,
      z: -0.27,
    });
    expect(scene().items[1]).toMatchObject({
      assetRef: 'dnd5e:props:candles',
      supportId: scene().items[0].id,
      transform: { x: 0.22, y: 0.72, z: -0.18 },
    });

    const beforeSupportEdit = scene();
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Select Torture Table/i })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Nudge selection east' })
    );
    expect(scene().items[0].transform.x).toBeCloseTo(
      beforeSupportEdit.items[0].transform.x + 0.1
    );
    expect(scene().items[1].transform.x).toBeCloseTo(
      beforeSupportEdit.items[1].transform.x + 0.1
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));
    expect(scene().items[0].transform.rotationY).toBeCloseTo(Math.PI / 12);
    expect(scene().items[1].transform.rotationY).toBeCloseTo(Math.PI / 12);

    fireEvent.click(screen.getByRole('checkbox', { name: /Select Candles/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Group selection' }));
    expect(scene().groups).toHaveLength(1);
    expect(
      scene().items.every((item) => item.parentId === scene().groups[0].id)
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(scene().groups).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(scene().groups).toHaveLength(1);
  });

  it('duplicates, deletes, and restores a selected prop through editor controls', () => {
    const storage = new MemoryStorage();
    render(
      <WorldBuildingConcept storage={storage} idFactory={deterministicIds()} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Place Books' }));
    fireEvent.click(screen.getByRole('button', { name: 'Canvas ground' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Books/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(scene().items).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(scene().items).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(scene().items).toHaveLength(2);
  });

  it('saves, stamps twice independently, edits one candle, and reopens after remount', () => {
    const storage = new MemoryStorage();
    const idFactory = deterministicIds();
    const mounted = render(
      <WorldBuildingConcept
        storage={storage}
        idFactory={idFactory}
        now={() => '2026-09-05T00:00:00.000Z'}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Place Torture Table' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Canvas ground' }));
    fireEvent.click(screen.getByRole('button', { name: 'Place Candles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Canvas tabletop' }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Select Torture Table/i })
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Candles/i }));
    fireEvent.change(screen.getByLabelText('Arrangement name'), {
      target: { value: 'Decorated table' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save selection' }));

    expect(screen.getByText('Decorated table')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Stamp Decorated table' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Canvas ground' }));
    fireEvent.click(screen.getByRole('button', { name: 'Canvas ground' }));
    const beforeEdit = scene();
    expect(beforeEdit.items).toHaveLength(6);
    const firstStampedCandle = beforeEdit.items[3];
    const secondStampedCandle = beforeEdit.items[5];
    const secondBefore = { ...secondStampedCandle.transform };

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: new RegExp(`Select Candles ${firstStampedCandle.id}`, 'i'),
      })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Nudge selection east' })
    );
    const afterEdit = scene();
    expect(afterEdit.items[3].transform.x).toBeCloseTo(
      firstStampedCandle.transform.x + 0.1
    );
    expect(afterEdit.items[5].transform).toEqual(secondBefore);

    const libraryJson = screen.getByTestId('library-json').textContent ?? '';
    expect(
      JSON.parse(libraryJson).arrangements[0].items[1].transform.x
    ).not.toBe(afterEdit.items[3].transform.x);
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }));

    mounted.unmount();
    render(<WorldBuildingConcept storage={storage} idFactory={idFactory} />);
    expect(scene().items).toHaveLength(6);
    expect(screen.getByText('Decorated table')).toBeTruthy();
  });

  it('shows non-destructive import errors and keeps the valid open scene', () => {
    const storage = new MemoryStorage();
    render(
      <WorldBuildingConcept storage={storage} idFactory={deterministicIds()} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Place Books' }));
    fireEvent.click(screen.getByRole('button', { name: 'Canvas ground' }));
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

  it('reports unavailable storage without losing the editable in-memory scene', () => {
    const storage = new MemoryStorage();
    storage.failGet = true;
    storage.failSet = true;
    render(
      <WorldBuildingConcept storage={storage} idFactory={deterministicIds()} />
    );
    expect(screen.getByRole('alert').textContent).toMatch(/storage blocked/i);
    fireEvent.click(screen.getByRole('button', { name: 'Place Vase' }));
    fireEvent.click(screen.getByRole('button', { name: 'Canvas ground' }));
    expect(scene().items).toHaveLength(1);
    expect(screen.getByRole('alert').textContent).toMatch(/quota blocked/i);
  });
});
