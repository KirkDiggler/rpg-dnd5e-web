import type { CompositionSource } from '@/compositions/compositionSource';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRoomDraft,
  parseRoomDocumentJson,
  ROOM_DRAFT_STORAGE_KEY,
  stringifyRoomDraft,
  type RoomDraftDocument,
} from '../world-building/roomDraft';
import type { KeyValueStorage, WorldPoint } from '../world-building/types';
import { workspaceBounds } from '../world-building/workspaceGeometry';
import { EncounterStudioWorkspace } from './EncounterStudioWorkspace';
import { createLayoutTransform, worldToClient } from './layoutGeometry';

// Real Studio shell, owner, codecs and Layout gestures. Only WebGL and private
// thumbnail loading are stopped; no server/browser/provider proof is implied.
vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  Canvas: () => <div data-testid="webgl-boundary" />,
}));
vi.mock('@/compositions/CompositionThumbnailRenderer', () => ({
  ThumbnailRenderer: () => null,
}));

const bounds = { left: 30, top: 70, width: 960, height: 600 };
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 7;
    this.isPrimary = init.isPrimary ?? true;
  }
}
class MemoryStorage implements KeyValueStorage {
  readonly bytes = new Map<string, string>();
  readonly setItem = vi.fn((key: string, value: string): void => {
    this.bytes.set(key, value);
  });
  getItem(key: string): string | null {
    return this.bytes.get(key) ?? null;
  }
  constructor() {
    const draft = createRoomDraft(
      {
        version: 1,
        id: 'scene',
        name: 'Blank label fixture',
        items: [],
        groups: [],
      },
      'room'
    );
    this.bytes.set(ROOM_DRAFT_STORAGE_KEY, stringifyRoomDraft(draft, {}));
  }
  document(): RoomDraftDocument {
    return parseRoomDocumentJson(this.bytes.get(ROOM_DRAFT_STORAGE_KEY)!);
  }
  writes(): number {
    return this.setItem.mock.calls.filter(
      ([key]) => key === ROOM_DRAFT_STORAGE_KEY
    ).length;
  }
}
let source: CompositionSource;
let captures: Set<number>;
beforeEach(() => {
  source = {
    worldId: 'controls-test-world',
    reader: {
      listCompositions: vi.fn(async () => []),
      getComposition: vi.fn(async () => null),
    },
  };
  captures = new Set();
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    }
  );
  vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({
      ...bounds,
      x: bounds.left,
      y: bounds.top,
      right: bounds.left + bounds.width,
      bottom: bounds.top + bounds.height,
      toJSON: (): object => ({}),
    })
  );
  Object.defineProperties(SVGSVGElement.prototype, {
    setPointerCapture: {
      configurable: true,
      value: (id: number): void => {
        captures.add(id);
      },
    },
    releasePointerCapture: {
      configurable: true,
      value: (id: number): void => {
        captures.delete(id);
      },
    },
    hasPointerCapture: {
      configurable: true,
      value: (id: number): boolean => captures.has(id),
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const click = (name: string): void => {
  fireEvent.click(screen.getByRole('button', { name }));
};
const change = (name: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
};
const submit = (name: string): void => {
  fireEvent.submit(screen.getByRole('form', { name }));
};
const surface = (): HTMLElement =>
  screen.getByRole('application', { name: 'Layout floor surface' });
function point(
  storage: MemoryStorage,
  location: WorldPoint
): { clientX: number; clientY: number } {
  const workspace = storage.document().draft.workspace;
  const client = worldToClient(
    location,
    createLayoutTransform(
      bounds,
      { center: { x: 0, z: 0 }, zoom: 1 },
      workspace.kind === 'centered-odd-r'
        ? workspaceBounds(workspace)
        : workspace.horizontalLimit
    )
  )!;
  return { clientX: client.x, clientY: client.y };
}
function place(storage: MemoryStorage, location: WorldPoint): void {
  fireEvent.pointerDown(surface(), {
    ...point(storage, location),
    pointerId: 7,
    button: 0,
  });
  fireEvent.pointerUp(surface(), {
    ...point(storage, location),
    pointerId: 7,
    button: 0,
  });
}
function mount(storage: MemoryStorage): ReturnType<typeof render> {
  let nextId = 0;
  const idFactory = (): string => `controls-${++nextId}`;
  return render(
    <EncounterStudioWorkspace
      compositionSource={source}
      storage={storage}
      idFactory={idFactory}
    />
  );
}
async function ready(): Promise<void> {
  await waitFor(() =>
    expect(source.reader.listCompositions).toHaveBeenCalled()
  );
}

describe('Task 5 controls through the real owner', () => {
  it('Apply produces exact centered dimensions without painting, one undo snapshot, and no cancel-before-intent self-fence', async () => {
    const storage = new MemoryStorage();
    const original = storage.document();
    mount(storage);
    await ready();
    change('Width (hexes)', '73');
    change('Height (hexes)', '48');
    expect(storage.document()).toEqual(original);
    submit('Workspace dimensions');
    await waitFor(() =>
      expect(storage.document().draft.workspace.kind).toBe('centered-odd-r')
    );
    expect(storage.document().draft.workspace).toMatchObject({
      widthHexes: 73,
      heightHexes: 48,
    });
    expect(surface().querySelectorAll('[data-cell]')).toHaveLength(3504);
    expect(storage.document().draft.room).toEqual(original.draft.room);
    expect(storage.document().draft.scene.items).toEqual(
      original.draft.scene.items
    );
    click('Undo');
    expect(storage.document()).toEqual(original);
    expect(
      (screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    click('Redo');
    expect(storage.document().draft.workspace).toMatchObject({
      widthHexes: 73,
      heightHexes: 48,
    });
  });
  it('typed placement/drag/rename/coordinate move/delete each work on live intents with stable duplicate IDs, no floor edits and 3D persistence', async () => {
    const storage = new MemoryStorage();
    const original = storage.document();
    mount(storage);
    await ready();
    click('Label');
    change('Label name', 'Kitchen');
    submit('New map label');
    const before = storage.writes();
    place(storage, { x: 2, z: 1 });
    expect(storage.writes()).toBe(before + 1);
    const first = storage.document().draft.scene.mapLabels![0];
    expect(first.text).toBe('Kitchen');
    expect(first.location).toEqual({ x: 2, z: 1 });
    click('Undo');
    expect(storage.document()).toEqual(original);
    click('Redo');
    expect(storage.document().draft.scene.mapLabels![0].id).toBe(first.id);
    submit('New map label');
    change('Label world X', '0');
    change('Label world Z', '0');
    submit('Map label coordinates');
    const second = storage.document().draft.scene.mapLabels![1];
    expect(second.text).toBe('Kitchen');
    expect(second.id).not.toBe(first.id);
    change('Existing label', second.id);
    change('Rename label', 'Courtyard');
    expect(storage.document().draft.scene.mapLabels![1].text).toBe('Kitchen');
    submit('Rename map label');
    expect(storage.document().draft.scene.mapLabels![1]).toMatchObject({
      id: second.id,
      text: 'Courtyard',
    });
    change('Label world X', '-1');
    change('Label world Z', '1');
    submit('Map label coordinates');
    expect(storage.document().draft.scene.mapLabels![1].location).toEqual({
      x: -1,
      z: 1,
    });
    const firstText = surface().querySelector(`[data-label-id="${first.id}"]`)!;
    fireEvent.pointerDown(firstText, {
      ...point(storage, first.location),
      pointerId: 7,
      button: 0,
    });
    fireEvent.pointerMove(surface(), {
      ...point(storage, { x: 3, z: 2 }),
      pointerId: 7,
    });
    expect(storage.document().draft.scene.mapLabels![0].location).toEqual(
      first.location
    );
    fireEvent.pointerUp(surface(), {
      ...point(storage, { x: 3, z: 2 }),
      pointerId: 7,
      button: 0,
    });
    expect(storage.document().draft.scene.mapLabels![0]).toMatchObject({
      id: first.id,
      location: { x: 3, z: 2 },
    });
    click('Undo');
    expect(storage.document().draft.scene.mapLabels![0].location).toEqual(
      first.location
    );
    change('Existing label', second.id);
    change('Rename label', 'Must not commit');
    click('3D');
    expect(screen.getByTestId('webgl-boundary')).toBeTruthy();
    click('Layout');
    expect(screen.queryByLabelText('Rename label')).toBeNull();
    expect(storage.document().draft.scene.mapLabels![1].text).toBe('Courtyard');
    click('Label');
    change('Existing label', second.id);
    click('Delete label');
    expect(storage.document().draft.scene.mapLabels).toEqual([first]);
    click('Undo');
    expect(storage.document().draft.scene.mapLabels).toHaveLength(2);
    expect(storage.document().draft.room).toEqual(original.draft.room);
    expect(storage.document().draft.workspace).toEqual(
      original.draft.workspace
    );
    expect(surface().querySelectorAll('[data-walkable="true"]')).toHaveLength(
      0
    );
  });
  it('creates a second label directly from a selected first label; Escape and view retirement cancel only genuinely armed placement', async () => {
    const storage = new MemoryStorage();
    mount(storage);
    await ready();
    click('Label');
    change('Label name', 'Kitchen');
    submit('New map label');
    place(storage, { x: 2, z: 1 });
    const kitchen = storage.document();
    const first = kitchen.draft.scene.mapLabels![0];
    const before = storage.writes();
    change('Existing label', first.id);
    change('Label name', 'Courtyard');
    submit('New map label');
    expect(screen.getByText(/Placing “Courtyard”/)).toBeTruthy();
    expect(
      (screen.getByLabelText('Existing label') as HTMLSelectElement).value
    ).toBe('');
    fireEvent.keyDown(screen.getByLabelText('Label name'), { key: 'Escape' });
    expect(screen.queryByText(/Placing “Courtyard”/)).toBeNull();
    expect(storage.document()).toEqual(kitchen);
    expect(storage.writes()).toBe(before);
    change('Existing label', first.id);
    submit('New map label');
    expect(screen.getByText(/Placing “Courtyard”/)).toBeTruthy();
    click('3D');
    click('Layout');
    expect(screen.queryByText(/Placing “Courtyard”/)).toBeNull();
    expect(storage.document()).toEqual(kitchen);
    expect(storage.writes()).toBe(before);
    click('Label');
    change('Existing label', first.id);
    submit('New map label');
    expect(screen.getByText(/Placing “Courtyard”/)).toBeTruthy();
    place(storage, { x: -2, z: -1 });
    const labels = storage.document().draft.scene.mapLabels!;
    expect(labels).toHaveLength(2);
    expect(labels[0]).toEqual(first);
    expect(labels[1]).toMatchObject({
      text: 'Courtyard',
      location: { x: -2, z: -1 },
    });
    expect(labels[1].id).not.toBe(first.id);
    expect(storage.document().draft.room).toEqual(kitchen.draft.room);
    expect(storage.document().draft.workspace).toEqual(kitchen.draft.workspace);
    expect(storage.writes()).toBe(before + 1);
    expect(surface().querySelectorAll('[data-walkable="true"]')).toHaveLength(
      0
    );
    click('Undo');
    expect(storage.document()).toEqual(kitchen);
    click('Redo');
    expect(storage.document().draft.scene.mapLabels).toEqual(labels);
  });
  it('failed shrink retains current dimensions/draft/error and navigation/document changes retire live label drags without history', async () => {
    const storage = new MemoryStorage();
    mount(storage);
    await ready();
    change('Width (hexes)', '9');
    change('Height (hexes)', '7');
    submit('Workspace dimensions');
    click('Label');
    change('Label name', 'Edge');
    submit('New map label');
    place(storage, { x: 5, z: 0 });
    const accepted = storage.document();
    const before = storage.writes();
    change('Width (hexes)', '2');
    change('Height (hexes)', '2');
    submit('Workspace dimensions');
    expect(storage.document()).toEqual(accepted);
    expect(storage.writes()).toBe(before);
    expect(screen.getByText('Current: 9 × 7 hexes')).toBeTruthy();
    expect(
      (screen.getByLabelText('Width (hexes)') as HTMLInputElement).value
    ).toBe('2');
    expect(screen.getByText(/Resize refused/)).toBeTruthy();
    expect(screen.getByText(/mapLabels.*location/)).toBeTruthy();
    const label = accepted.draft.scene.mapLabels![0];
    fireEvent.pointerDown(
      surface().querySelector(`[data-label-id="${label.id}"]`)!,
      { ...point(storage, label.location), pointerId: 7, button: 0 }
    );
    fireEvent.pointerMove(surface(), {
      ...point(storage, { x: 4, z: 0 }),
      pointerId: 7,
    });
    click('3D');
    click('Layout');
    fireEvent.pointerUp(surface(), {
      ...point(storage, { x: 4, z: 0 }),
      pointerId: 7,
      button: 0,
    });
    expect(storage.document()).toEqual(accepted);
    expect(storage.writes()).toBe(before);
    expect(captures.size).toBe(0);
    click('Undo');
    expect(storage.document().draft.scene.mapLabels).toBeUndefined();
    click('Undo');
    expect(storage.document().draft.workspace.kind).toBeUndefined();
  });
});
