import { decodeCompositionScene } from '@/compositions/compositionScene';
import type { CompositionSource } from '@/compositions/compositionSource';
import {
  decodeRoomDocumentJson,
  encodeRoomDocument,
} from '@/compositions/roomDocument';
import { create } from '@bufbuild/protobuf';
import { CompositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { StrictMode, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertRoomDocumentSize,
  parseRoomDocumentJson,
  resizeRoomWorkspace,
  ROOM_DRAFT_STORAGE_KEY,
  stringifyRoomDraft,
  updateWalkableHexes,
  type RoomDraftDocument,
  type RoomHexCell,
} from '../world-building/roomDraft';
import {
  MAX_JSON_LENGTH,
  parseSceneJson,
  stringifyScene,
} from '../world-building/serialization';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from '../world-building/singleRoomDungeon';
import { scopeFrom } from '../world-building/siteScope';
import type {
  KeyValueStorage,
  WorldPoint,
  WorldScene,
} from '../world-building/types';
import {
  workspaceBounds,
  workspaceCells,
} from '../world-building/workspaceGeometry';
import { WorldBuilderWorkspace } from '../world-building/WorldBuilderWorkspace';
import type { WorldBuildingViewportProps } from '../world-building/WorldBuildingViewport';
import { EncounterStudioWorkspace } from './EncounterStudioWorkspace';
import {
  createCastleWorkspaceDocument,
  createSparseMaxWorkspaceDocument,
} from './fixtures/castleWorkspace';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';
import {
  createLayoutTransform,
  layoutCellCenter,
  worldToClient,
} from './layoutGeometry';

const boundary = vi.hoisted(() => ({
  latest: null as WorldBuildingViewportProps | null,
}));
const services = vi.hoisted(() => ({
  putDungeon: vi.fn(),
  getDungeon: vi.fn(),
  listScenarios: vi.fn(),
  createLobby: vi.fn(),
  setReady: vi.fn(),
  startEncounter: vi.fn(),
}));

// jsdom cannot create WebGL. Keep the REAL WorldBuildingViewport, but stop at
// Canvas: observe the controlled WorldSceneContents inputs, without rendering
// its Three/model subtree. Callback invocations below exercise the actual owner
// commands, NOT real raycasts, loaded meshes, or TransformControls gestures.
vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  Canvas: ({
    children,
  }: {
    children: ReactElement<WorldBuildingViewportProps>;
  }) => {
    boundary.latest = children.props;
    return <div data-testid="webgl-boundary" />;
  },
}));
vi.mock('@/compositions/CompositionThumbnailRenderer', () => ({
  ThumbnailRenderer: () => null,
}));
vi.mock('@/author/authoringRpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/author/authoringRpc')>()),
  defaultAuthoringClient: {
    putDungeon: services.putDungeon,
    getDungeon: services.getDungeon,
    listScenarios: services.listScenarios,
  },
}));
vi.mock('@/api/useCreateLobby', () => ({
  useCreateLobby: () => ({
    createLobby: services.createLobby,
    loading: false,
    error: null,
  }),
}));
vi.mock('@/api/useSetLobbyReady', () => ({
  useSetLobbyReady: () => ({
    setReady: services.setReady,
    loading: false,
    error: null,
  }),
}));
vi.mock('@/api/useStartLobbyEncounter', () => ({
  useStartLobbyEncounter: () => ({
    startEncounter: services.startEncounter,
    loading: false,
    error: null,
  }),
}));

class MemoryStorage implements KeyValueStorage {
  readonly bytes = new Map<string, string>();
  failWrites = false;
  readonly getItem = vi.fn(
    (key: string): string | null => this.bytes.get(key) ?? null
  );
  readonly setItem = vi.fn((key: string, value: string): void => {
    if (this.failWrites) throw new Error('storage quota test failure');
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
  roomWrites(): number {
    return this.setItem.mock.calls.filter(
      ([key]) => key === ROOM_DRAFT_STORAGE_KEY
    ).length;
  }
}

// Browser geometry/capture shims only; all Layout pointer sampling, membership,
// previews, cancellation and commits run in the real LayoutViewport.
const bounds = { left: 30, top: 70, width: 960, height: 600 };
let captured: Set<number>;
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 7;
    this.isPrimary = init.isPrimary ?? true;
  }
}
let source: CompositionSource;
beforeEach(() => {
  vi.clearAllMocks();
  boundary.latest = null;
  captured = new Set();
  source = {
    worldId: 'joined-test-world',
    reader: {
      listCompositions: vi.fn(async () => []),
      getComposition: vi.fn(async () => null),
    },
    writer: { createComposition: vi.fn(), deleteComposition: vi.fn() },
  };
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
        captured.add(id);
      },
    },
    releasePointerCapture: {
      configurable: true,
      value: (id: number): void => {
        captured.delete(id);
      },
    },
    hasPointerCapture: {
      configurable: true,
      value: (id: number): boolean => captured.has(id),
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function seed(emptyFloor = false): RoomDraftDocument {
  const document = createPopulatedStudioDocument();
  if (emptyFloor) document.draft.room.walkableHexes = [];
  // Compare normalized supported data, not pre-validation representations.
  return parseRoomDocumentJson(
    stringifyRoomDraft(document.draft, document.scope)
  );
}
function mount(
  storage: MemoryStorage,
  idFactory?: () => string
): ReturnType<typeof render> {
  return render(
    <EncounterStudioWorkspace
      compositionSource={source}
      storage={storage}
      idFactory={idFactory}
    />
  );
}
function button(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}
function switchTo(name: 'Layout' | '3D'): void {
  fireEvent.click(button(name));
}
function surface(): SVGSVGElement {
  return screen.getByRole('application', {
    name: 'Layout floor surface',
  }) as unknown as SVGSVGElement;
}
function at(cell: RoomHexCell): { clientX: number; clientY: number } {
  const point = worldToClient(
    layoutCellCenter(cell),
    createLayoutTransform(bounds, { center: { x: 0, z: 0 }, zoom: 1 }, 12)
  )!;
  return { clientX: point.x, clientY: point.y };
}
const zero = { q: 0, r: 0 };
const one = { q: 1, r: 0 };
const two = { q: 2, r: 0 };
function gesture(first: RoomHexCell, last = first): void {
  fireEvent.pointerDown(surface(), { ...at(first), pointerId: 7, button: 0 });
  fireEvent.pointerMove(surface(), { ...at(last), pointerId: 7 });
  fireEvent.pointerUp(surface(), { ...at(last), pointerId: 7, button: 0 });
}
function cells(): string[] {
  return [...surface().querySelectorAll('[data-walkable="true"]')].map(
    (node) => node.getAttribute('data-cell')!
  );
}
function viewport(): WorldBuildingViewportProps {
  expect(screen.getByTestId('webgl-boundary')).not.toBeNull();
  expect(boundary.latest).not.toBeNull();
  return boundary.latest!;
}
function withoutFloor(document: RoomDraftDocument): object {
  return {
    ...document,
    draft: {
      ...document.draft,
      room: { ...document.draft.room, walkableHexes: undefined },
    },
  };
}
function expectPreserved(
  actual: RoomDraftDocument,
  original: RoomDraftDocument
): void {
  // Whole normalized document equality includes every scope key, identity,
  // declaration/binding, wall/opening/door, transform/group/support and light.
  expect(withoutFloor(actual)).toEqual(withoutFloor(original));
}
async function settled(): Promise<void> {
  await waitFor(() =>
    expect(source.reader.listCompositions).toHaveBeenCalled()
  );
}
function moved(scene: WorldScene): WorldScene {
  const next = structuredClone(scene);
  next.items.find((item) => item.id === 'studio-decoration')!.transform.x +=
    0.5;
  return next;
}

describe('Encounter Studio joined document boundary', () => {
  it('draw switch return undo redo reload uses one document and preserves the populated payload', async () => {
    const original = seed(true);
    // Keep this fixture coverage non-vacuous: policies must not disappear from
    // the expected value just because Studio does not offer their inspectors.
    expect(Object.keys(original.scope).sort()).toEqual([
      'concealments',
      'dispositions',
      'endings',
      'exits',
      'factions',
      'intel',
      'scenarios',
      'tables',
    ]);
    expect(original.draft.room.walls![0].openings).toHaveLength(2);
    expect(original.draft.room.walls![0].openings[1].door?.id).toBe(
      'studio-door'
    );
    expect(original.draft.room.doorBindings!['studio-door']).toEqual({
      closed: true,
    });
    expect(original.draft.scene.groups.length).toBeGreaterThan(0);
    expect(
      original.draft.scene.items.find((item) => item.id === 'studio-decoration')
    ).toMatchObject({ parentId: 'furniture', supportId: 'table' });
    expect(
      original.draft.scene.items.find((item) => item.id === 'table')?.pointLight
        ?.enabled
    ).toBe(true);
    expect(original.draft.room.monsterDeclarations.length).toBeGreaterThan(0);
    expect(original.draft.room.partyStart).toBeDefined();
    const storage = new MemoryStorage(original);
    const view = mount(storage);
    await settled();
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    gesture(zero, two);
    expect(cells()).toEqual(['0,0', '2,0']);
    expect(storage.document().draft.room.walkableHexes).toEqual([zero, two]);
    expectPreserved(storage.document(), original);
    gesture(one);
    expect(cells()).toEqual(['0,0', '1,0', '2,0']);
    expectPreserved(storage.document(), original);
    fireEvent.click(button('Erase'));
    gesture(one);
    expect(cells()).toEqual(['0,0', '2,0']);
    expectPreserved(storage.document(), original);
    fireEvent.click(button('Rectangle'));
    gesture(zero, two);
    expect(cells()).toEqual(['0,0', '1,0', '2,0']);
    const restored = storage.document();
    expectPreserved(restored, original);
    const writes = storage.roomWrites();
    switchTo('3D');
    const committedScene = viewport().scene;
    expect(viewport().roomAuthoring?.walkableHexes).toEqual([zero, one, two]);
    expect(viewport().scene).toEqual(restored.draft.scene);
    switchTo('Layout');
    expect(storage.roomWrites()).toBe(writes);
    switchTo('3D');
    expect(viewport().scene).toBe(committedScene); // navigation did not copy/remount the document
    switchTo('Layout');
    fireEvent.click(button('Undo'));
    expect(cells()).toEqual(['0,0', '2,0']); // last EDIT, not navigation
    expectPreserved(storage.document(), original);
    fireEvent.click(button('Redo'));
    expect(storage.document()).toEqual(restored);
    switchTo('3D');
    expect(viewport().scene).toEqual(committedScene); // history intentionally restores cloned snapshots
    switchTo('Layout');
    // A remounted/copied history cannot traverse all four joined commands.
    for (const expected of [
      ['0,0', '2,0'],
      ['0,0', '1,0', '2,0'],
      ['0,0', '2,0'],
      [],
    ]) {
      fireEvent.click(button('Undo'));
      expect(cells()).toEqual(expected);
      expectPreserved(storage.document(), original);
    }
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    for (let index = 0; index < 4; index += 1) fireEvent.click(button('Redo'));
    expect(storage.document()).toEqual(restored);
    view.unmount();
    mount(storage);
    await settled();
    expect(cells()).toEqual(['0,0', '1,0', '2,0']);
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true); // reload recovers data, not history
    expect(storage.document()).toEqual(restored);
    switchTo('3D');
    expect(viewport().scene).toEqual(restored.draft.scene);
    expect(viewport().roomAuthoring?.walkableHexes).toEqual(
      restored.draft.room.walkableHexes
    );
  });

  it('3D prop commit shares history with Layout floor edits and preserves selection', async () => {
    const original = seed(true);
    const storage = new MemoryStorage(original);
    mount(storage);
    await settled();
    gesture(zero);
    const floorDocument = storage.document();
    switchTo('3D');
    act(() => viewport().onSelect(['studio-decoration']));
    const nextScene = moved(viewport().scene);
    act(() => viewport().onTransformPreview(nextScene));
    expect(storage.document()).toEqual(floorDocument);
    act(() => viewport().onTransformCommit(nextScene));
    const propDocument = storage.document();
    const committedPropScene = viewport().scene;
    expect(propDocument).toEqual({
      ...floorDocument,
      draft: { ...floorDocument.draft, scene: nextScene },
    });
    switchTo('Layout');
    switchTo('3D');
    expect(viewport().selectedIds).toEqual(['studio-decoration']);
    expect(viewport().scene).toBe(committedPropScene);
    switchTo('Layout');
    fireEvent.click(button('Undo'));
    expect(storage.document()).toEqual(floorDocument);
    expect(cells()).toEqual(['0,0']);
    fireEvent.click(button('Undo'));
    expect(storage.document()).toEqual(original);
    expect(cells()).toEqual([]);
    fireEvent.click(button('Redo'));
    expect(storage.document()).toEqual(floorDocument);
    fireEvent.click(button('Redo'));
    expect(storage.document()).toEqual(propDocument);
    switchTo('3D');
    expect(viewport().scene).toEqual(nextScene);
    expect(viewport().selectedIds).toEqual([]); // existing Undo/Redo semantics clear selection
  });

  it('pending Layout rectangle and 3D transform cannot leak across switching', async () => {
    const original = seed(true);
    const storage = new MemoryStorage(original);
    mount(storage);
    await settled();
    fireEvent.click(button('Rectangle'));
    const retiredSurface = surface();
    fireEvent.pointerDown(retiredSurface, { ...at(zero), pointerId: 7 });
    fireEvent.pointerMove(retiredSurface, { ...at(two), pointerId: 7 });
    expect(retiredSurface.querySelectorAll('[data-preview-cell]')).toHaveLength(
      3
    );
    const writes = storage.roomWrites();
    switchTo('3D');
    expect(captured.size).toBe(0);
    fireEvent.pointerUp(retiredSurface, { ...at(two), pointerId: 7 });
    expect(viewport().roomAuthoring?.walkableHexes).toEqual([]);
    act(() => viewport().onSelect(['studio-decoration']));
    const late = viewport();
    const preview = moved(late.scene);
    act(() => late.onTransformPreview(preview));
    expect(viewport().previewScene).toEqual(preview);
    expect(storage.document()).toEqual(original);
    switchTo('Layout');
    act(() => {
      late.onTransformCommit(preview);
      late.onDrop(
        { kind: 'prop', id: 'dnd5e:props:dark-fortress:alchemy_tools_01' },
        { kind: 'ground', point: { x: 1, z: 1 } }
      );
    });
    expect(cells()).toEqual([]);
    expect(surface().querySelectorAll('[data-preview-cell]')).toHaveLength(0);
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    expect(storage.roomWrites()).toBe(writes);
    expect(storage.document()).toEqual(original);
    switchTo('3D');
    expect(viewport().scene).toEqual(original.draft.scene);
    expect(viewport().previewScene).toBeNull();
    expect(viewport().selectedIds).toEqual(['studio-decoration']);
  });

  it('Studio and legacy builder reopen the same draft key in both directions', async () => {
    const storage = new MemoryStorage(seed(true));
    const studio = mount(storage);
    await settled();
    gesture(zero, two);
    const authored = storage.document();
    studio.unmount();
    const legacy = render(
      <WorldBuilderWorkspace compositionSource={source} storage={storage} />
    );
    await settled();
    expect(viewport().roomAuthoring?.walkableHexes).toEqual([zero, two]);
    expect(viewport().scene).toEqual(authored.draft.scene);
    expect(
      parseRoomDocumentJson(screen.getByTestId('room-draft-json').textContent!)
    ).toEqual(authored);
    act(() => viewport().onTransformCommit(moved(viewport().scene)));
    const legacyAuthored = storage.document();
    expect(legacyAuthored.draft.scene).not.toEqual(authored.draft.scene);
    expect(legacyAuthored.scope).toEqual(authored.scope);
    legacy.unmount();
    mount(storage);
    await settled();
    expect(cells()).toEqual(['0,0', '2,0']);
    switchTo('3D');
    expect(viewport().scene).toEqual(legacyAuthored.draft.scene);
    expect(storage.document()).toEqual(legacyAuthored);
    expect(
      storage.getItem.mock.calls.some(([key]) => key === ROOM_DRAFT_STORAGE_KEY)
    ).toBe(true);
    expect(
      storage.setItem.mock.calls.every(
        ([key]) => !key.includes('encounter-studio')
      )
    ).toBe(true);
  });

  it('view switching invokes no authoring publication, composition write or lobby launch', async () => {
    const storage = new MemoryStorage(seed(true));
    mount(storage);
    await settled();
    gesture(zero);
    switchTo('3D');
    act(() => viewport().onTransformCommit(moved(viewport().scene)));
    switchTo('Layout');
    fireEvent.click(button('Undo'));
    fireEvent.click(button('Redo'));
    fireEvent.click(button('Save local draft'));
    expect(
      screen.queryByRole('button', {
        name: /Save & Play|Publish|Validate with server/,
      })
    ).toBeNull();
    for (const call of Object.values(services))
      expect(call).not.toHaveBeenCalled();
    expect(source.writer!.createComposition).not.toHaveBeenCalled();
    expect(source.writer!.deleteComposition).not.toHaveBeenCalled();
    expect(source.reader.getComposition).not.toHaveBeenCalled();
  });

  it('corrupt current bytes survive StrictMode replay, floor edits and view changes', async () => {
    const storage = new MemoryStorage(seed());
    const corrupt = '{broken-current-draft';
    storage.bytes.set(ROOM_DRAFT_STORAGE_KEY, corrupt);
    render(
      <StrictMode>
        <EncounterStudioWorkspace
          compositionSource={source}
          storage={storage}
        />
      </StrictMode>
    );
    await settled();
    expect(screen.getByText(/Autosave is paused/)).not.toBeNull();
    expect(button('Replace unreadable local draft')).not.toBeNull();
    gesture(zero, two);
    expect(cells()).toEqual(['0,0', '2,0']);
    switchTo('3D');
    expect(viewport().roomAuthoring?.walkableHexes).toEqual([zero, two]);
    switchTo('Layout');
    fireEvent.click(button('Undo'));
    expect(cells()).toEqual([]);
    fireEvent.click(button('Redo'));
    expect(cells()).toEqual(['0,0', '2,0']);
    expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(corrupt);
    expect(storage.roomWrites()).toBe(0);
  });

  it('failed persistence keeps latest full data in memory and good stored bytes for reload', async () => {
    const original = seed(true);
    const storage = new MemoryStorage(original);
    const view = mount(storage);
    await settled();
    const goodBytes = storage.bytes.get(ROOM_DRAFT_STORAGE_KEY);
    storage.failWrites = true;
    gesture(zero, two);
    expect(cells()).toEqual(['0,0', '2,0']);
    expect(screen.getByRole('status').textContent).toBe(
      'Room save failed — draft kept in memory'
    );
    expect(screen.getByText(/storage quota test failure/)).not.toBeNull();
    switchTo('3D');
    expect(viewport().roomAuthoring?.walkableHexes).toEqual([zero, two]);
    expect(viewport().scene).toEqual(original.draft.scene);
    const next = moved(viewport().scene);
    act(() => viewport().onTransformCommit(next));
    expect(viewport().scene).toEqual(next);
    switchTo('Layout');
    fireEvent.click(button('Save local draft'));
    expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(goodBytes);
    fireEvent.click(button('Undo'));
    switchTo('3D');
    expect(viewport().scene).toEqual(original.draft.scene);
    expect(viewport().roomAuthoring?.walkableHexes).toEqual([zero, two]);
    switchTo('Layout');
    fireEvent.click(button('Redo'));
    switchTo('3D');
    expect(viewport().scene).toEqual(next);
    expect(storage.document()).toEqual(original);
    view.unmount();
    storage.failWrites = false;
    mount(storage);
    await settled();
    expect(cells()).toEqual([]);
    expect(storage.document()).toEqual(original);
  });

  it('refused 3D commit preserves last good document and shared history with visible feedback', async () => {
    const original = seed(true);
    const storage = new MemoryStorage(original);
    mount(storage);
    await settled();
    gesture(zero);
    const good = storage.document();
    switchTo('3D');
    const invalid = moved(viewport().scene);
    invalid.items[0].transform.x = 9999;
    act(() => viewport().onTransformCommit(invalid));
    expect(viewport().scene).toEqual(good.draft.scene);
    expect(screen.getByRole('alert').textContent).toMatch(
      /transform|outside|range/i
    );
    expect(storage.document()).toEqual(good);
    switchTo('Layout');
    fireEvent.click(button('Undo'));
    expect(storage.document()).toEqual(original);
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button('Redo'));
    expect(storage.document()).toEqual(good);
  });
});

function changeField(name: string, value: string): void {
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
}
function submitForm(name: string): void {
  fireEvent.submit(screen.getByRole('form', { name }));
}
function resize(width: number, height: number): void {
  changeField('Width (hexes)', String(width));
  changeField('Height (hexes)', String(height));
  submitForm('Workspace dimensions');
}
function pointInDocument(
  storage: MemoryStorage,
  world: WorldPoint
): { clientX: number; clientY: number } {
  const workspace = storage.document().draft.workspace;
  const client = worldToClient(
    world,
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
function paintWorkspace(storage: MemoryStorage): void {
  const all = workspaceCells(storage.document().draft.workspace);
  // Both tested rectangles have an even height: first row is even and last
  // row is odd, so these contained endpoints enclose every cell centre.
  const start = pointInDocument(storage, layoutCellCenter(all[0]));
  const end = pointInDocument(storage, layoutCellCenter(all[all.length - 1]));
  fireEvent.click(button('Rectangle'));
  fireEvent.pointerDown(surface(), { ...start, pointerId: 7, button: 0 });
  fireEvent.pointerMove(surface(), { ...end, pointerId: 7 });
  fireEvent.pointerUp(surface(), { ...end, pointerId: 7, button: 0 });
}
function createLabelAt(text: string, location: WorldPoint): void {
  changeField('Label name', text);
  submitForm('New map label');
  changeField('Label world X', String(location.x));
  changeField('Label world Z', String(location.z));
  submitForm('Map label coordinates');
}
function expectCodecs(document: RoomDraftDocument): void {
  const json = stringifyRoomDraft(document.draft, document.scope);
  expect(json.length).toBeLessThanOrEqual(MAX_JSON_LENGTH);
  expect(parseRoomDocumentJson(json)).toEqual(document);
  const yaml = encodeSingleRoomDungeon({
    key: 'studio-castle',
    draft: document.draft,
    ...document.scope,
  });
  const decoded = decodeSingleRoomDungeon(yaml);
  expect({ draft: decoded.draft, scope: scopeFrom(decoded) }).toEqual(document);
  expect(
    parseRoomDocumentJson(stringifyRoomDraft(decoded.draft, scopeFrom(decoded)))
  ).toEqual(document);
  // A room-library snapshot intentionally owns only the draft, NOT site scope.
  // JSON/YAML/local storage above prove the separate complete scope boundary.
  expect(decodeRoomDocumentJson(encodeRoomDocument(document.draft))).toEqual(
    document.draft
  );
  const composition = create(CompositionSchema, {
    json: stringifyScene(document.draft.scene),
  });
  expect(decodeCompositionScene(composition)).toEqual(document.draft.scene);
  expect(parseSceneJson(composition.json)).toEqual(document.draft.scene);
}

describe('Task 6 populated workspace/label integration', () => {
  it('castle fixture preserves the complete payload and survives real JSON/YAML/snapshot/composition codecs', () => {
    const base = seed();
    const castle = createCastleWorkspaceDocument();
    expect(workspaceCells(castle.draft.workspace)).toHaveLength(3504);
    expect(castle.draft.room.walkableHexes).toHaveLength(3504);
    expect(
      new Set(
        castle.draft.room.walkableHexes.map((cell) => `${cell.q},${cell.r}`)
      ).size
    ).toBe(3504);
    expect(castle).toEqual({
      ...base,
      draft: {
        ...base.draft,
        workspace: resizeRoomWorkspace(base, 73, 48).draft.workspace,
        room: {
          ...base.draft.room,
          walkableHexes: castle.draft.room.walkableHexes,
        },
        scene: {
          ...base.draft.scene,
          version: 2,
          mapLabels: [
            {
              id: 'castle-kitchen',
              text: 'Kitchen',
              location: { x: -8, z: -6 },
            },
            {
              id: 'castle-courtyard',
              text: 'Courtyard',
              location: { x: 8, z: 6 },
            },
          ],
        },
      },
    });
    expectCodecs(castle);
    const independent = createCastleWorkspaceDocument();
    independent.draft.scene.mapLabels![0].text = 'Changed annotation';
    expect(castle.draft.scene.mapLabels![0].text).toBe('Kitchen');
  });

  it('real resize/paint/label forms preserve all populated data through no-ops, cancellation, refused shrink, shared history and reload', async () => {
    const original = seed();
    const storage = new MemoryStorage(original);
    let id = 0;
    const view = mount(storage, () => `joined-label-${++id}`);
    await settled();
    resize(73, 48);
    const resized = resizeRoomWorkspace(original, 73, 48);
    expect(storage.document()).toEqual(resized); // growth changes no geometry/policy
    expect(surface().querySelectorAll('[data-cell]')).toHaveLength(3504);
    paintWorkspace(storage);
    const painted = {
      ...resized,
      draft: updateWalkableHexes(
        resized.draft,
        workspaceCells(resized.draft.workspace),
        'paint'
      ),
    };
    expect(storage.document()).toEqual(painted);
    fireEvent.click(button('Label'));
    createLabelAt('Kitchen', { x: -8, z: -6 });
    const kitchenId = storage.document().draft.scene.mapLabels![0].id;
    expect(kitchenId).toMatch(/^joined-label-\d+$/);
    const kitchen = {
      ...painted,
      draft: {
        ...painted.draft,
        scene: {
          ...painted.draft.scene,
          mapLabels: [
            { id: kitchenId, text: 'Kitchen', location: { x: -8, z: -6 } },
          ],
        },
      },
    };
    expect(storage.document()).toEqual(kitchen);
    createLabelAt('Courtyard', { x: 8, z: 6 });
    const courtyardId = storage.document().draft.scene.mapLabels![1].id;
    expect(courtyardId).not.toBe(kitchenId);
    const castle = createCastleWorkspaceDocument();
    const labeled = {
      ...castle,
      draft: {
        ...castle.draft,
        scene: {
          ...castle.draft.scene,
          mapLabels: [
            { id: kitchenId, text: 'Kitchen', location: { x: -8, z: -6 } },
            { id: courtyardId, text: 'Courtyard', location: { x: 8, z: 6 } },
          ],
        },
      },
    };
    expect(storage.document()).toEqual(labeled);
    const bytes = storage.bytes.get(ROOM_DRAFT_STORAGE_KEY);
    const writes = storage.roomWrites();
    resize(73, 48); // no-op dimensions
    changeField('Existing label', kitchenId);
    submitForm('Rename map label'); // same text
    submitForm('Map label coordinates'); // same point
    changeField('Rename label', 'Never committed');
    fireEvent.keyDown(screen.getByLabelText('Rename label'), { key: 'Escape' });
    changeField('Width (hexes)', '74');
    fireEvent.click(button('Cancel dimensions'));
    changeField('Label name', 'Never placed');
    submitForm('New map label');
    // Arming from a selected label must really succeed before cancellation:
    // clearing that old selection is not document/tool/view retirement.
    expect(screen.getByText(/Placing “Never placed”/)).not.toBeNull();
    fireEvent.keyDown(screen.getByLabelText('Label name'), { key: 'Escape' });
    expect(screen.queryByText(/Placing “Never placed”/)).toBeNull();
    submitForm('New map label');
    expect(screen.getByText(/Placing “Never placed”/)).not.toBeNull();
    fireEvent.click(button('Cancel placement'));
    resize(2, 2);
    expect(screen.getByText(/Resize refused/)).not.toBeNull();
    expect(
      screen
        .getAllByRole('alert')
        .map((node) => node.textContent)
        .join(' ')
    ).toMatch(/walkableHexes.*outside/i);
    expect(storage.document()).toEqual(labeled);
    expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    expect(storage.roomWrites()).toBe(writes);
    switchTo('3D');
    expect(viewport().scene).toEqual(labeled.draft.scene);
    expect(viewport().roomAuthoring?.walkableHexes).toEqual(
      labeled.draft.room.walkableHexes
    );
    const nextScene = moved(viewport().scene);
    act(() => viewport().onTransformCommit(nextScene));
    const propEdited = {
      ...labeled,
      draft: { ...labeled.draft, scene: nextScene },
    };
    expect(storage.document()).toEqual(propEdited);
    switchTo('Layout');
    switchTo('3D');
    expect(viewport().scene).toEqual(nextScene);
    switchTo('Layout');
    // Exactly five committed edits; all navigation/no-op/cancel/refusal entries
    // are absent. Whole-document comparisons protect every policy and identity.
    for (const expected of [labeled, kitchen, painted, resized, original]) {
      fireEvent.click(button('Undo'));
      expect(storage.document()).toEqual(expected);
    }
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    for (const expected of [resized, painted, kitchen, labeled, propEdited]) {
      fireEvent.click(button('Redo'));
      expect(storage.document()).toEqual(expected);
    }
    expect((button('Redo') as HTMLButtonElement).disabled).toBe(true);
    expectCodecs(propEdited);
    view.unmount();
    mount(storage);
    await settled();
    expect(cells()).toHaveLength(3504);
    expect(surface().querySelectorAll('[data-label-id]')).toHaveLength(2);
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    expect(storage.document()).toEqual(propEdited);
    switchTo('3D');
    expect(viewport().scene).toEqual(propEdited.draft.scene);
    expect(viewport().roomAuthoring?.walkableHexes).toEqual(
      propEdited.draft.room.walkableHexes
    );
  }, 60000);

  it('sparse maximum fits but fully painted maximum refuses before history/storage without losing prior label edit', async () => {
    const original = createSparseMaxWorkspaceDocument();
    expect(workspaceCells(original.draft.workspace)).toHaveLength(16384);
    expect(original.draft.room.walkableHexes.length).toBeLessThan(16384);
    expectCodecs(original);
    const fullyPainted = {
      ...original,
      draft: updateWalkableHexes(
        original.draft,
        workspaceCells(original.draft.workspace),
        'paint'
      ),
    };
    expect(fullyPainted.draft.room.walkableHexes).toHaveLength(16384);
    expect(() => assertRoomDocumentSize(fullyPainted)).toThrow(
      /maximum 500000 characters/
    );
    expect(() =>
      stringifyRoomDraft(fullyPainted.draft, fullyPainted.scope)
    ).toThrow(/maximum 500000 characters/);
    const storage = new MemoryStorage(original);
    mount(storage, () => 'max-label');
    await settled();
    expect(surface().querySelectorAll('[data-cell]')).toHaveLength(16384);
    fireEvent.click(button('Label'));
    createLabelAt('Courtyard', { x: 8, z: 6 });
    const good = storage.document();
    expect(good).toEqual({
      ...original,
      draft: {
        ...original.draft,
        scene: {
          ...original.draft.scene,
          mapLabels: [
            { id: 'max-label', text: 'Courtyard', location: { x: 8, z: 6 } },
          ],
        },
      },
    });
    const bytes = storage.bytes.get(ROOM_DRAFT_STORAGE_KEY);
    const writes = storage.roomWrites();
    paintWorkspace(storage);
    expect(screen.getByRole('alert').textContent).toMatch(
      /maximum 500000 characters/
    );
    expect(storage.document()).toEqual(good);
    expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    expect(storage.roomWrites()).toBe(writes);
    expect(cells()).toHaveLength(original.draft.room.walkableHexes.length);
    switchTo('3D');
    expect(viewport().scene).toEqual(good.draft.scene);
    expect(viewport().roomAuthoring?.walkableHexes).toEqual(
      good.draft.room.walkableHexes
    );
    switchTo('Layout');
    fireEvent.click(button('Undo'));
    expect(storage.document()).toEqual(original);
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button('Redo'));
    expect(storage.document()).toEqual(good);
    expect((button('Redo') as HTMLButtonElement).disabled).toBe(true);
  }, 60000);
});
