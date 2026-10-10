import type { CompositionSource } from '@/compositions/compositionSource';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useEffect } from 'react';
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
interface ThumbnailRequest {
  requestKey: string;
  onComplete(key: string, image: string): void;
  onError(key: string, message: string): void;
  onRootError(message: string): void;
}
const worker = vi.hoisted(() => ({ latest: null as ThumbnailRequest | null }));
vi.mock('@/compositions/CompositionThumbnailRenderer', () => ({
  ThumbnailRenderer: (props: ThumbnailRequest) => {
    useEffect(() => {
      worker.latest = props;
    }, [props]);
    return <div data-testid="thumbnail-worker" />;
  },
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
  worker.latest = null;
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
  fireEvent.change(
    name === 'Search wall appearances'
      ? screen.getByRole('searchbox', { name })
      : screen.getByLabelText(name),
    { target: { value } }
  );
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
    click('Size');
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
    change('New label world X', '0');
    change('New label world Z', '0');
    submit('Map label coordinates');
    const second = storage.document().draft.scene.mapLabels![1];
    expect(second.text).toBe('Kitchen');
    expect(second.id).not.toBe(first.id);
    change('Existing label', second.id);
    click('Arrange');
    change('Rename label', 'Courtyard');
    expect(storage.document().draft.scene.mapLabels![1].text).toBe('Kitchen');
    submit('Arrange selected noun');
    expect(storage.document().draft.scene.mapLabels![1]).toMatchObject({
      id: second.id,
      text: 'Courtyard',
    });
    change('Label world X', '-1');
    change('Label world Z', '1');
    submit('Arrange selected noun');
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
    expect(
      (screen.getByLabelText('Rename label') as HTMLInputElement).value
    ).toBe('Courtyard');
    expect(storage.document().draft.scene.mapLabels![1].text).toBe('Courtyard');
    click('Label');
    change('Existing label', second.id);
    click('Arrange');
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
    click('Label');
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
    click('Size');
    change('Width (hexes)', '9');
    change('Height (hexes)', '7');
    submit('Workspace dimensions');
    click('Label');
    change('Label name', 'Edge');
    submit('New map label');
    place(storage, { x: 5, z: 0 });
    const accepted = storage.document();
    const before = storage.writes();
    click('Size');
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

function drawWall(
  storage: MemoryStorage,
  first: WorldPoint,
  last: WorldPoint
): void {
  fireEvent.pointerDown(surface(), {
    ...point(storage, first),
    pointerId: 7,
    button: 0,
  });
  fireEvent.pointerMove(surface(), { ...point(storage, last), pointerId: 7 });
  fireEvent.pointerUp(surface(), {
    ...point(storage, last),
    pointerId: 7,
    button: 0,
  });
}
const castleRef = 'dnd5e:env:fantasy-kingdom:castle_wall_01';
function chooseCastle(): void {
  change('Search wall appearances', 'castle_wall_01');
  fireEvent.click(
    document.querySelector(`[data-wall-appearance-ref="${castleRef}"]`)!
  );
}

describe('compact Studio wall UI through the actual owner and Layout', () => {
  it('default has exactly two bands; Size Apply/Cancel/Escape/reopen do not resize hidden content', async () => {
    const storage = new MemoryStorage();
    mount(storage);
    await ready();
    const original = storage.document();
    fireEvent.keyDown(surface(), { key: 'Escape' });
    expect(
      screen.getByRole('button', { name: 'Paint' }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(storage.document()).toEqual(original);
    expect(document.querySelectorAll('.es-header, .es-toolbar')).toHaveLength(
      2
    );
    expect(screen.queryByRole('textbox', { name: 'Width (hexes)' })).toBeNull();
    expect(screen.queryByLabelText('Label name')).toBeNull();
    expect(screen.queryByTestId('thumbnail-worker')).toBeNull();
    click('Size');
    change('Width (hexes)', '9');
    change('Height (hexes)', '7');
    click('Cancel dimensions');
    expect(screen.queryByRole('textbox', { name: 'Width (hexes)' })).toBeNull();
    expect(storage.document()).toEqual(original);
    click('Size');
    expect(
      (screen.getByLabelText('Width (hexes)') as HTMLInputElement).value
    ).toBe('');
    change('Width (hexes)', '9');
    change('Height (hexes)', '7');
    fireEvent.keyDown(screen.getByLabelText('Width (hexes)'), {
      key: 'Escape',
    });
    expect(screen.queryByRole('textbox', { name: 'Width (hexes)' })).toBeNull();
    expect(storage.document()).toEqual(original);
    click('Size');
    change('Width (hexes)', '9');
    change('Height (hexes)', '7');
    submit('Workspace dimensions');
    expect(screen.queryByRole('textbox', { name: 'Width (hexes)' })).toBeNull();
    const committed = storage.document();
    const writes = storage.writes();
    click('Size');
    expect(
      (screen.getByLabelText('Width (hexes)') as HTMLInputElement).value
    ).toBe('9');
    click('Size'); // hiding alone never reframes/resizes/history
    expect(storage.writes()).toBe(writes);
    expect(storage.document()).toEqual(committed);
    click('Undo');
    expect(storage.document()).toEqual(original);
  });
  it('Wall is enabled unarmed, demands thumbnails only while visible, preserves armed appearance and snap, and draws consecutively', async () => {
    const storage = new MemoryStorage();
    mount(storage);
    await ready();
    click('Wall');
    expect(screen.getByText(/No appearance armed/)).toBeTruthy();
    expect(screen.getAllByTestId('thumbnail-worker')).toHaveLength(1);
    drawWall(storage, { x: -3, z: -2 }, { x: -1, z: -2 });
    expect(
      screen.getByText(/Choose a wall appearance before drawing/)
    ).toBeTruthy();
    expect(storage.document().draft.room.walls ?? []).toHaveLength(0);
    chooseCastle(); // still-loading imagery never disables selection
    click('Dismiss wall controls');
    expect(screen.queryByTestId('thumbnail-worker')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Wall' }).getAttribute('aria-pressed')
    ).toBe('true');
    drawWall(storage, { x: -3, z: -2 }, { x: -1, z: -2 });
    drawWall(storage, { x: 1, z: 1 }, { x: 3, z: 1 });
    const walls = storage.document().draft.room.walls!;
    expect(walls).toHaveLength(2);
    expect(walls.every((wall) => wall.appearance.assetRef === castleRef)).toBe(
      true
    );
    fireEvent.keyDown(surface(), { key: 'Escape' });
    expect(
      screen.queryByRole('searchbox', { name: 'Search wall appearances' })
    ).toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Select' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    click('Undo');
    expect(storage.document().draft.room.walls).toHaveLength(1);
    click('Redo');
    expect(storage.document().draft.room.walls).toEqual(walls);
    click('Wall');
    fireEvent.click(
      screen.getByLabelText('Snap to hex centres, corners and side midpoints')
    );
    fireEvent.keyDown(screen.getByLabelText('Search wall appearances'), {
      key: 'Escape',
    });
    expect(
      screen
        .getByRole('button', { name: 'Select' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      screen.queryByRole('searchbox', { name: 'Search wall appearances' })
    ).toBeNull();
    click('3D');
    click('Layout');
    click('Wall');
    expect(
      (
        screen.getByLabelText(
          'Snap to hex centres, corners and side midpoints'
        ) as HTMLInputElement
      ).checked
    ).toBe(true);
    expect(
      document
        .querySelector(`[data-wall-appearance-ref="${castleRef}"]`)!
        .getAttribute('aria-pressed')
    ).toBe('true');
    click('Dismiss wall controls');
    fireEvent.keyDown(surface(), { key: 'Escape' });
    expect(
      screen
        .getByRole('button', { name: 'Select' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(storage.document().draft.room.walls).toEqual(walls);
  });
  it('Select opens precision without fencing captured movement; numeric/edit/appearance/remove and root Delete share real history', async () => {
    const storage = new MemoryStorage();
    mount(storage);
    await ready();
    click('Wall');
    chooseCastle();
    click('Dismiss wall controls');
    drawWall(storage, { x: -3, z: -2 }, { x: -1, z: -2 });
    const original = storage.document().draft.room.walls![0];
    click('Select');
    const hit = surface().querySelector(`line[data-wall-id="${original.id}"]`)!;
    fireEvent.pointerDown(hit, {
      ...point(storage, { x: -2, z: -2 }),
      pointerId: 7,
      button: 0,
    });
    expect(screen.getByLabelText('Wall length')).toBeTruthy(); // selection/demand rerender while drag is captured
    change('Wall length', '2.25');
    click('Change wall appearance');
    act(() =>
      worker.latest!.onComplete(
        worker.latest!.requestKey,
        'data:image/png;base64,cosmetic'
      )
    );
    expect(
      (screen.getByLabelText('Wall length') as HTMLInputElement).value
    ).toBe('2.25');
    fireEvent.pointerMove(surface(), {
      ...point(storage, { x: -1, z: -1 }),
      pointerId: 7,
    });
    fireEvent.pointerUp(surface(), {
      ...point(storage, { x: -1, z: -1 }),
      pointerId: 7,
      button: 0,
    });
    expect(storage.document().draft.room.walls![0].line).toEqual({
      start: { x: -2, z: -1 },
      end: { x: 0, z: -1 },
    });
    change('Wall length', '3');
    fireEvent.keyDown(screen.getByLabelText('Wall length'), { key: 'Delete' });
    expect(storage.document().draft.room.walls).toHaveLength(1);
    submit('Arrange selected noun');
    expect(storage.document().draft.room.walls![0].line.end.x).toBe(1);
    change('Wall midpoint X', '0.5');
    submit('Arrange selected noun');
    expect(storage.document().draft.room.walls![0].line.start.x).toBe(-1);
    const beforeRefusal = storage.document();
    change('Wall midpoint X', '9999');
    submit('Arrange selected noun');
    expect(storage.document()).toEqual(beforeRefusal);
    expect(
      (screen.getByLabelText('Wall midpoint X') as HTMLInputElement).value
    ).toBe('9999');
    expect(screen.getByText(/Arrange edit refused/)).toBeTruthy();
    change('Wall midpoint X', '0.5');
    change('Y facing (degrees)', '-90');
    submit('Arrange selected noun');
    const rotated = storage.document().draft.room.walls![0];
    expect(rotated.line.start.z).toBeCloseTo(-2.5);
    expect(rotated.line.end.z).toBeCloseTo(0.5);
    expect(rotated.id).toBe(original.id);
    expect(rotated.blocker.blocksMovement).toBe(
      original.blocker.blocksMovement
    );
    change('Search wall appearances', 'castle_wall_02');
    fireEvent.click(
      document.querySelector(
        '[data-wall-appearance-ref="dnd5e:env:fantasy-kingdom:castle_wall_02"]'
      )!
    );
    submit('Arrange selected noun');
    const appearanceChanged = storage.document().draft.room.walls![0];
    expect(appearanceChanged).toEqual({
      ...rotated,
      appearance: {
        ...rotated.appearance,
        assetRef: 'dnd5e:env:fantasy-kingdom:castle_wall_02',
      },
    });
    const committed = storage.document();
    click('Options (N)');
    expect(storage.document()).toEqual(committed);
    click('Options (N)');
    click('Select');
    click('Remove wall');
    expect(storage.document().draft.room.walls ?? []).toEqual([]);
    click('Undo');
    expect(storage.document().draft.room.walls).toEqual([appearanceChanged]);
    // Undo clears selection. A select-only click is not an edit, even when controls open.
    const before = storage.writes();
    const restoredHit = surface().querySelector(
      `line[data-wall-id="${original.id}"]`
    )!;
    fireEvent.pointerDown(restoredHit, {
      ...point(storage, { x: 0.5, z: -1 }),
      pointerId: 7,
      button: 0,
    });
    fireEvent.pointerUp(surface(), {
      ...point(storage, { x: 0.5, z: -1 }),
      pointerId: 7,
      button: 0,
    });
    expect(storage.writes()).toBe(before);
    fireEvent.keyDown(surface(), { key: 'Delete' });
    expect(storage.document().draft.room.walls ?? []).toEqual([]);
  });
  it('actual picker reaches non-wall choices, no-results and renderer errors without disabling assets', async () => {
    const storage = new MemoryStorage();
    mount(storage);
    await ready();
    click('Wall');
    change('Search wall appearances', 'alchemy_tools_01');
    const choice = document.querySelector(
      '[data-wall-appearance-ref="dnd5e:props:dark-fortress:alchemy_tools_01"]'
    )!;
    expect(choice).not.toBeNull();
    act(() => worker.latest!.onRootError('WebGL unavailable test'));
    expect(screen.getByText('Preview unavailable')).toBeTruthy();
    fireEvent.click(choice);
    click('Dismiss wall controls');
    drawWall(storage, { x: 0, z: 0 }, { x: 2, z: 0 });
    expect(storage.document().draft.room.walls![0].appearance.assetRef).toBe(
      'dnd5e:props:dark-fortress:alchemy_tools_01'
    );
    click('Wall');
    change('Search wall appearances', 'no-such-appearance');
    expect(screen.getByText(/No matching wall appearances/)).toBeTruthy();
  });
  it('Label Dismiss and Escape keep committed labels but never revive canceled placement', async () => {
    const storage = new MemoryStorage();
    mount(storage);
    await ready();
    click('Label');
    change('Label name', 'Kitchen');
    submit('New map label');
    place(storage, { x: 0, z: 0 });
    const committed = storage.document();
    submit('New map label');
    click('Dismiss label controls');
    expect(screen.queryByLabelText('Label name')).toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Select' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    click('Label');
    expect(screen.queryByText(/Placing “Kitchen”/)).toBeNull();
    submit('New map label');
    fireEvent.keyDown(surface(), { key: 'Escape' });
    expect(screen.queryByLabelText('Label name')).toBeNull();
    expect(storage.document()).toEqual(committed);
  });
});

describe('direct selected endpoint through Studio', () => {
  it('reshapes a rotated wall with stable identity and exactly one commit, then undo restores it', async () => {
    const storage = new MemoryStorage();
    mount(storage);
    await ready();
    click('Wall');
    chooseCastle();
    click('Dismiss wall controls');
    drawWall(storage, { x: -2, z: -2 }, { x: 2, z: 0 });
    const original = storage.document();
    const wall = original.draft.room.walls![0];
    click('Select');
    const hit = surface().querySelector(`line[data-wall-id="${wall.id}"]`)!;
    fireEvent.pointerDown(hit, {
      ...point(storage, { x: 0, z: -1 }),
      pointerId: 7,
      button: 0,
    });
    fireEvent.pointerUp(surface(), {
      ...point(storage, { x: 0, z: -1 }),
      pointerId: 7,
      button: 0,
    });
    const handle = surface().querySelector(
      `[data-wall-id="${wall.id}"][data-wall-endpoint="end"]`
    )!;
    const writes = storage.writes();
    fireEvent.pointerDown(handle, {
      ...point(storage, wall.line.end),
      pointerId: 7,
      button: 0,
    });
    fireEvent.pointerMove(surface(), {
      ...point(storage, { x: 1, z: 3 }),
      pointerId: 7,
    });
    expect(storage.writes()).toBe(writes);
    fireEvent.pointerUp(surface(), {
      ...point(storage, { x: 1, z: 3 }),
      pointerId: 7,
      button: 0,
    });
    expect(storage.writes()).toBe(writes + 1);
    const changed = storage.document().draft.room.walls![0];
    expect(changed.id).toBe(wall.id);
    expect(changed.line.start).toEqual(wall.line.start);
    expect(changed.line.end.x).toBeCloseTo(1);
    expect(changed.line.end.z).toBeCloseTo(3);
    expect(changed.appearance).toEqual(wall.appearance);
    click('Undo');
    expect(storage.document()).toEqual(original);
  });
});

describe('cosmetic presentation arrivals', () => {
  it('real thumbnail completion preserves staged name/Size drafts without history; an actual owner commit resets Size staging', async () => {
    const storage = new MemoryStorage();
    mount(storage);
    await ready();
    const original = storage.document();
    click('Wall');
    fireEvent.click(screen.getByRole('button', { name: /^Rename encounter / }));
    change('Encounter name', 'Staged name');
    click('Size');
    change('Width (hexes)', '9');
    change('Height (hexes)', '7');
    const writes = storage.writes();
    act(() =>
      worker.latest!.onComplete(
        worker.latest!.requestKey,
        'data:image/png;base64,cosmetic'
      )
    );
    expect(
      (screen.getByLabelText('Encounter name') as HTMLInputElement).value
    ).toBe('Staged name');
    expect(
      (screen.getByLabelText('Width (hexes)') as HTMLInputElement).value
    ).toBe('9');
    expect(storage.document()).toEqual(original);
    expect(storage.writes()).toBe(writes);
    submit('Rename encounter');
    expect(storage.document().draft.name).toBe('Staged name');
    expect(
      (screen.getByLabelText('Width (hexes)') as HTMLInputElement).value
    ).toBe('');
    click('Cancel dimensions');
    click('Undo');
    expect(storage.document()).toEqual(original);
  });
});

describe('M1 exact precision no-ops through the real owner', () => {
  it('untouched diagonal length preserves both endpoint choices, bytes and history; an edited length still commits', async () => {
    const storage = new MemoryStorage();
    mount(storage);
    await ready();
    const blank = storage.document();
    click('Wall');
    chooseCastle();
    click('Dismiss wall controls');
    drawWall(storage, { x: 0, z: 0 }, { x: 3, z: 2 });
    click('Select');
    const drawn = storage.document();
    const bytes = storage.bytes.get(ROOM_DRAFT_STORAGE_KEY);
    const writes = storage.writes();
    for (const endpoint of ['end', 'start']) {
      change('Fixed endpoint', endpoint === 'end' ? 'start' : 'end');
      submit('Arrange selected noun');
      expect(storage.document()).toEqual(drawn);
      expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
      expect(storage.writes()).toBe(writes);
    }
    click('Undo');
    expect(storage.document()).toEqual(blank); // No phantom precision history.
    expect(
      (screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    click('Redo');
    expect(storage.document()).toEqual(drawn);
    const hit = surface().querySelector(
      `line[data-wall-id="${drawn.draft.room.walls![0].id}"]`
    )!;
    fireEvent.pointerDown(hit, {
      ...point(storage, { x: 1.5, z: 1 }),
      pointerId: 7,
      button: 0,
    });
    fireEvent.pointerUp(surface(), {
      ...point(storage, { x: 1.5, z: 1 }),
      pointerId: 7,
      button: 0,
    });
    const beforeEdit = storage.writes();
    // An explicit edit to the displayed precision is a real intent, not an epsilon no-op.
    change('Wall length', '');
    change('Wall length', '3.605551');
    submit('Arrange selected noun');
    const edited = storage.document();
    expect(edited).not.toEqual(drawn);
    expect(storage.writes()).toBe(beforeEdit + 1);
    click('Undo');
    expect(storage.document()).toEqual(drawn);
    click('Redo');
    expect(storage.document()).toEqual(edited);
  });
  it.each(['Wall midpoint X', 'Y facing (degrees)'])(
    'untouched %s preserves fractional pose, bytes and history exactly',
    async (field) => {
      const storage = new MemoryStorage();
      mount(storage);
      await ready();
      const blank = storage.document();
      click('Wall');
      chooseCastle();
      click('Dismiss wall controls');
      drawWall(storage, { x: -2.7, z: -3.1 }, { x: 3.2, z: 5.7 });
      click('Select');
      const drawn = storage.document();
      const bytes = storage.bytes.get(ROOM_DRAFT_STORAGE_KEY);
      const writes = storage.writes();
      expect(screen.getByLabelText(field)).toBeTruthy();
      submit('Arrange selected noun');
      expect(storage.document()).toEqual(drawn);
      expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
      expect(storage.writes()).toBe(writes);
      click('Undo');
      expect(storage.document()).toEqual(blank);
      expect(
        (screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement)
          .disabled
      ).toBe(true);
      click('Redo');
      expect(storage.document()).toEqual(drawn);
    }
  );
});
