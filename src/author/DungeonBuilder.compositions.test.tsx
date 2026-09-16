import type { CompositionReader } from '@/compositions/compositionJsonAdapter';
import { compositionRef } from '@/compositions/compositionRef';
import type { CompositionSource } from '@/compositions/compositionSource';
import { encodeRoomDocument } from '@/compositions/roomDocument';
import { createRoomDraft } from '@/concepts/world-building/roomDraft';
import { createEmptyScene } from '@/concepts/world-building/sceneState';
import { create } from '@bufbuild/protobuf';
import {
  CompositionSchema,
  type Composition,
} from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthoringClient } from './authoringRpc';
import { DungeonBuilder } from './DungeonBuilder';
import {
  emitDungeon,
  emptyDungeon,
  paintCell,
  placeAt,
  type DungeonDoc,
} from './dungeonYaml';
import { fixtureAtlasOf } from './fixtures/fixtureAtlas';
import { axialKey, fromOffset } from './hexOffset';

vi.mock('@/api/useListDungeons', () => ({
  useListDungeons: () => ({
    dungeons: [],
    loading: false,
    error: null,
    refetch: async () => {},
  }),
}));

const authoringClient = {
  listScenarios: vi.fn(async () => ({ scenarios: [] })),
} as unknown as AuthoringClient;

const p = (column: number) => fromOffset('pointy', [column, 0]);

function sceneJson(name: string): string {
  return JSON.stringify({
    kind: 'rpg-world-building-scene',
    version: 1,
    scene: {
      version: 1,
      id: 'authored-scene',
      name,
      items: [],
      groups: [],
    },
  });
}

function composition(id: string, worldId: string, name: string): Composition {
  return create(CompositionSchema, {
    id,
    worldId,
    json: sceneJson(name),
  });
}

function compositionDoc(count = 1): DungeonDoc {
  let doc = emptyDungeon();
  for (let index = 0; index < count; index += 1) {
    doc = paintCell(doc, 'region-1', p(index));
    doc = placeAt(doc, {
      id: `table-${index + 1}`,
      ref: compositionRef('snapshot-1234'),
      at: p(index),
      blocksMovement: true,
      blocksLos: false,
      facing: index === 0 ? 'ne' : 'sw',
      offset: index === 0 ? [0.2, -0.1] : undefined,
    });
  }
  return doc;
}

function sourceWith(
  getComposition: CompositionReader['getComposition'],
  worldId = 'world-current'
): CompositionSource {
  return {
    worldId,
    reader: {
      getComposition,
      listCompositions: vi.fn(async () => []),
    },
  };
}

function mount(doc: DungeonDoc, compositionSource?: CompositionSource) {
  return render(
    <DungeonBuilder
      authoringClient={authoringClient}
      fixtureCompile={fixtureAtlasOf}
      initialYaml={emitDungeon(doc)}
      persistDraft={false}
      compositionSource={compositionSource}
    />
  );
}

function placement(index: number): SVGGElement {
  return document.querySelector(`[data-placement="${index}"]`)!;
}

function occupiedCell(column = 0): SVGPolygonElement {
  return document.querySelector(`[data-cell="${axialKey(p(column))}"]`)!;
}

function selectPlacement(column = 0) {
  fireEvent.click(screen.getByRole('button', { name: 'Select' }));
  fireEvent.pointerDown(occupiedCell(column));
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe('DungeonBuilder composition placement metadata', () => {
  it('reports a room-document placement as not placeable while scene placements stay ready', async () => {
    const roomDraft = createRoomDraft(
      createEmptyScene('cellar-scene'),
      'cellar-room'
    );
    roomDraft.scene.name = 'Cellar Snapshot';
    const getComposition = vi.fn(async (worldId: string, id: string) =>
      create(CompositionSchema, {
        id,
        worldId,
        json:
          id === 'room-snapshot-9'
            ? encodeRoomDocument(roomDraft)
            : sceneJson('The Lantern Table'),
      })
    );
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(0));
    doc = paintCell(doc, 'region-1', p(1));
    doc = placeAt(doc, {
      id: 'room-placement',
      ref: compositionRef('room-snapshot-9'),
      at: p(0),
      blocksMovement: true,
      blocksLos: false,
    });
    doc = placeAt(doc, {
      id: 'scene-placement',
      ref: compositionRef('scene-snapshot-3'),
      at: p(1),
      blocksMovement: true,
      blocksLos: false,
    });
    mount(doc, sourceWith(getComposition));

    await waitFor(() =>
      expect(placement(0).getAttribute('data-composition-status')).toBe(
        'not-placeable'
      )
    );
    await waitFor(() =>
      expect(placement(1).getAttribute('data-composition-status')).toBe('ready')
    );
    expect(occupiedCell(0).querySelector(':scope > title')?.textContent).toBe(
      'Room snapshot · Cellar Snapshot · not placeable as a prop'
    );
    selectPlacement(0);
    const status = screen.getByTestId('composition-placement-status');
    expect(status.getAttribute('data-status')).toBe('not-placeable');
    expect(status.textContent).toContain('not placeable as a prop');

    // Legacy scene placements keep the exact ready behavior.
    selectPlacement(1);
    expect(screen.getByTestId('composition-placement-status').textContent).toBe(
      'Composition · The Lantern Table'
    );
  });

  it('names available placements from authored JSON and resolves a repeated snapshot only once', async () => {
    const getComposition = vi.fn(async (worldId: string, id: string) =>
      composition(id, worldId, 'The Lantern Table')
    );
    const doc = compositionDoc(2);
    mount(doc, sourceWith(getComposition));

    await waitFor(() =>
      expect(placement(0).getAttribute('data-composition-status')).toBe('ready')
    );
    expect(getComposition).toHaveBeenCalledTimes(1);
    expect(getComposition).toHaveBeenCalledWith(
      'world-current',
      'snapshot-1234'
    );
    expect(placement(0).querySelector('title')).toBeNull();
    expect(occupiedCell(0).querySelector(':scope > title')?.textContent).toBe(
      'The Lantern Table'
    );
    expect(occupiedCell(1).querySelector(':scope > title')?.textContent).toBe(
      'The Lantern Table'
    );

    // The title-bearing element remains the real pointer target: entering it
    // updates the board hover path and pressing it keeps selection routing.
    fireEvent.pointerEnter(occupiedCell(0));
    selectPlacement();
    expect(
      screen.getByTestId('placement-panel').querySelector('h3')?.textContent
    ).toBe('The Lantern Table');
    expect(
      screen.getByTestId('composition-placement-status').textContent
    ).toContain('Composition · The Lantern Table');
    expect(screen.getByText(compositionRef('snapshot-1234'))).toBeDefined();
  });

  it('keeps a null/NotFound placement explicit, selectable, unchanged, and removable', async () => {
    const getComposition = vi.fn(async () => null);
    const doc = compositionDoc();
    const originalYaml = emitDungeon(doc);
    mount(doc, sourceWith(getComposition));

    await waitFor(() =>
      expect(placement(0).getAttribute('data-composition-status')).toBe(
        'missing'
      )
    );
    expect(occupiedCell().querySelector(':scope > title')?.textContent).toBe(
      'Deleted or missing composition · snapshot-1234'
    );
    expect(
      placement(0).querySelector('[data-composition-missing="0"]')?.textContent
    ).toBe('Deleted / missing composition');

    selectPlacement();
    const status = screen.getByTestId('composition-placement-status');
    expect(status.getAttribute('data-status')).toBe('missing');
    expect(status.textContent).toBe(
      'Deleted or missing composition · snapshot-1234'
    );
    expect((screen.getByTestId('placement-id') as HTMLInputElement).value).toBe(
      'table-1'
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Source' }));
    expect((screen.getByTestId('yaml-text') as HTMLTextAreaElement).value).toBe(
      originalYaml
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Inspector' }));
    fireEvent.click(screen.getByRole('button', { name: 'remove' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Source' }));
    expect(
      (screen.getByTestId('yaml-text') as HTMLTextAreaElement).value
    ).toContain('place: []');
  });

  it('never calls pending, failed, wrong-world, or unconfigured reads deleted', async () => {
    let rejectPending!: (reason: Error) => void;
    const pending = new Promise<Composition | null>((_resolve, reject) => {
      rejectPending = reject;
    });
    const doc = compositionDoc();
    const originalYaml = emitDungeon(doc);
    const getComposition = vi.fn(() => pending);
    const view = mount(doc, sourceWith(getComposition));

    expect(placement(0).getAttribute('data-composition-status')).toBe(
      'loading'
    );
    expect(occupiedCell().querySelector(':scope > title')?.textContent).toBe(
      'Loading composition · snapshot-1234'
    );
    expect(placement(0).textContent).not.toContain('deleted');

    await act(async () => rejectPending(new Error('reader unavailable')));
    await waitFor(() =>
      expect(placement(0).getAttribute('data-composition-status')).toBe('error')
    );
    expect(occupiedCell().querySelector(':scope > title')?.textContent).toBe(
      'Could not load composition · snapshot-1234'
    );
    expect(placement(0).textContent).not.toContain('deleted');
    fireEvent.click(screen.getByRole('tab', { name: 'Source' }));
    expect((screen.getByTestId('yaml-text') as HTMLTextAreaElement).value).toBe(
      originalYaml
    );

    view.rerender(
      <DungeonBuilder
        authoringClient={authoringClient}
        fixtureCompile={fixtureAtlasOf}
        initialYaml={originalYaml}
        persistDraft={false}
        compositionSource={sourceWith(async (worldId, id) =>
          composition(id, `${worldId}-wrong`, 'Wrong World')
        )}
      />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Inspector' }));
    await waitFor(() =>
      expect(placement(0).getAttribute('data-composition-status')).toBe('error')
    );
    expect(
      occupiedCell().querySelector(':scope > title')?.textContent
    ).not.toContain('Wrong World');
    expect(screen.queryByText(/Deleted or missing composition/)).toBeNull();

    view.rerender(
      <DungeonBuilder
        authoringClient={authoringClient}
        fixtureCompile={fixtureAtlasOf}
        initialYaml={originalYaml}
        persistDraft={false}
      />
    );
    expect(placement(0).getAttribute('data-composition-status')).toBe(
      'missing-source'
    );
    expect(occupiedCell().querySelector(':scope > title')?.textContent).toBe(
      'Composition source not configured · snapshot-1234'
    );
  });
});
