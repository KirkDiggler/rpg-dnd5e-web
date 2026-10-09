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
  within,
} from '@testing-library/react';
import { StrictMode, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WORLD_BUILDING_CATALOG_BY_REF } from '../world-building/catalog';
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
  moveSelection,
  rotateSelection,
  setSelectionHeight,
} from '../world-building/sceneState';
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
import {
  createWall,
  previewWallTransform,
  reshapeWallEndpoint,
  resizeWallLength,
  rotateWall,
  setWallAppearance,
  snapWallPoint,
  translateWall,
  wallDirectionYaw,
  wallMidpoint,
} from '../world-building/structuralWallEditing';
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
import { WorldBuildingConcept } from '../world-building/WorldBuildingConcept';
import type { WorldBuildingViewportProps } from '../world-building/WorldBuildingViewport';
import { EncounterStudioWorkspace } from './EncounterStudioWorkspace';
import {
  createCastleWorkspaceDocument,
  createSparseMaxWorkspaceDocument,
} from './fixtures/castleWorkspace';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';
import {
  clientToWorld,
  createLayoutTransform,
  layoutCellCenter,
  worldToClient,
} from './layoutGeometry';
import { LayoutViewport } from './LayoutViewport';
import type { EncounterStudioSession, StructuralWall } from './studioSession';
import { StudioWallControls } from './StudioWallControls';

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
    act(() => viewport().onSelect([viewport().scene.items[0].id]));
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
    act(() => viewport().onSelect([viewport().scene.items[0].id]));
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
    act(() => viewport().onSelect([viewport().scene.items[0].id]));
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
    act(() => viewport().onSelect([viewport().scene.items[0].id]));
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
  if (!screen.queryByLabelText('Width (hexes)'))
    fireEvent.click(button('Size'));
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
  changeField('New label world X', String(location.x));
  changeField('New label world Z', String(location.z));
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
    changeField('Rename label', 'Staged only');
    changeField('Rename label', 'Kitchen');
    submitForm('Arrange selected noun'); // explicit same text
    changeField('Label world X', '-7');
    changeField('Label world X', '-8');
    changeField('Label world Z', '-5');
    changeField('Label world Z', '-6');
    submitForm('Arrange selected noun'); // explicit same point
    changeField('Rename label', 'Never committed');
    fireEvent.keyDown(screen.getByLabelText('Rename label'), { key: 'Escape' });
    fireEvent.click(button('Label'));
    fireEvent.click(button('Size'));
    changeField('Width (hexes)', '74');
    fireEvent.click(button('Cancel dimensions'));
    changeField('Label name', 'Never placed');
    submitForm('New map label');
    // Arming from a selected label must really succeed before cancellation:
    // clearing that old selection is not document/tool/view retirement.
    expect(screen.getByText(/Placing “Never placed”/)).not.toBeNull();
    fireEvent.keyDown(screen.getByLabelText('Label name'), { key: 'Escape' });
    expect(screen.queryByText(/Placing “Never placed”/)).toBeNull();
    fireEvent.click(button('Label'));
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
    act(() => viewport().onSelect([viewport().scene.items[0].id]));
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

describe('compact header canonical naming through the populated owner', () => {
  it('trimmed rename synchronizes both names once, preserves IDs/scope/key, and shares history/reload; refusal and navigation never commit staging', async () => {
    const original = seed();
    const storage = new MemoryStorage(original);
    const mounted = mount(storage);
    await settled();
    const rename = (): void => {
      fireEvent.click(
        screen.getByRole('button', { name: /^Rename encounter / })
      );
    };
    rename();
    changeField('Encounter name', '  Castle encounter  ');
    const writes = storage.roomWrites();
    fireEvent.click(button('Apply encounter name'));
    const renamed = {
      ...original,
      draft: {
        ...original.draft,
        name: 'Castle encounter',
        scene: { ...original.draft.scene, name: 'Castle encounter' },
      },
    };
    expect(storage.document()).toEqual(renamed);
    expect(storage.roomWrites()).toBe(writes + 1);
    expect(screen.queryByLabelText('Encounter name')).toBeNull();
    rename();
    changeField('Encounter name', ' Castle encounter ');
    submitForm('Rename encounter');
    expect(storage.roomWrites()).toBe(writes + 1); // trimmed no-op, not another history frame
    rename();
    changeField('Encounter name', '   ');
    submitForm('Rename encounter');
    expect(screen.getByLabelText('Encounter name')).toBeTruthy();
    expect(screen.getByText(/Rename refused/)).toBeTruthy();
    expect(storage.document()).toEqual(renamed);
    changeField('Encounter name', 'x'.repeat(121));
    submitForm('Rename encounter');
    expect(storage.document()).toEqual(renamed);
    changeField('Encounter name', 'Discard Escape');
    fireEvent.keyDown(screen.getByLabelText('Encounter name'), {
      key: 'Escape',
    });
    expect(screen.queryByLabelText('Encounter name')).toBeNull();
    rename();
    changeField('Encounter name', 'Discard navigation');
    switchTo('3D');
    switchTo('Layout');
    expect(storage.document()).toEqual(renamed);
    expect(screen.queryByLabelText('Encounter name')).toBeNull();
    fireEvent.click(button('Undo'));
    expect(storage.document()).toEqual(original);
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button('Redo'));
    expect(storage.document()).toEqual(renamed);
    mounted.unmount();
    mount(storage);
    await settled();
    expect(storage.document()).toEqual(renamed);
    expect(
      storage.setItem.mock.calls.every(
        ([key]) =>
          key === ROOM_DRAFT_STORAGE_KEY || !key.includes('encounter-studio')
      )
    ).toBe(true);
  });
});

const castleWallRef = 'dnd5e:env:fantasy-kingdom:castle_wall_01';
const snapLabel = 'Snap to hex centres, corners and side midpoints';
function chooseAppearance(ref: string, search: string): void {
  const creation = screen.queryByRole('region', { name: 'New wall palette' });
  if (!creation && !screen.queryByLabelText('Search wall appearances'))
    fireEvent.click(button('Change wall appearance'));
  const region =
    creation ?? screen.getByRole('region', { name: 'Arrange selection' });
  fireEvent.change(within(region).getByLabelText('Search wall appearances'), {
    target: { value: search },
  });
  fireEvent.click(
    within(region)
      .getByRole('group', { name: 'Wall appearance choices' })
      .querySelector(`[data-wall-appearance-ref="${ref}"]`)!
  );
  if (!creation) submitForm('Arrange selected noun');
}
function rotatedSeed(): RoomDraftDocument {
  const document = seed(true);
  const wall = rotateWall(document.draft.room.walls![0], {
    angle: Math.PI / 6,
  });
  // Distinct blocker values make appearance/geometry preservation non-vacuous.
  wall.blocker.blocksLineOfSight = false;
  wall.blocker.footprint = {
    width: 8.5,
    depth: 0.4,
    offsetX: 0.2,
    offsetZ: -0.1,
  };
  document.draft.room.walls = [wall];
  document.scope.concealments!['studio-secret'].props = [
    wall.id,
    'studio-door',
  ];
  return parseRoomDocumentJson(
    stringifyRoomDraft(document.draft, document.scope)
  );
}
function withWall(
  document: RoomDraftDocument,
  wall: StructuralWall
): RoomDraftDocument {
  return {
    ...document,
    draft: {
      ...document.draft,
      room: {
        ...document.draft.room,
        walls: document.draft.room.walls!.map((entry) =>
          entry.id === wall.id ? wall : entry
        ),
      },
    },
  };
}
function pointer(storage: MemoryStorage, world: WorldPoint): PointerEventInit {
  return { ...pointInDocument(storage, world), pointerId: 7, button: 0 };
}
function sampledPoint(storage: MemoryStorage, world: WorldPoint): WorldPoint {
  // Round-trip the injected browser projection, so exact helper comparisons
  // include the same finite coordinate precision as the DOM event, not an epsilon guess.
  const client = pointInDocument(storage, world);
  const workspace = storage.document().draft.workspace;
  return clientToWorld(
    { x: client.clientX, y: client.clientY },
    createLayoutTransform(
      bounds,
      { center: { x: 0, z: 0 }, zoom: 1 },
      workspace.kind === 'centered-odd-r'
        ? workspaceBounds(workspace)
        : workspace.horizontalLimit
    )
  )!;
}
function draw(
  storage: MemoryStorage,
  start: WorldPoint,
  end: WorldPoint
): void {
  fireEvent.pointerDown(surface(), pointer(storage, start));
  fireEvent.pointerMove(surface(), pointer(storage, end));
  fireEvent.pointerUp(surface(), pointer(storage, end));
}
function wallHit(id: string): Element {
  return surface().querySelector(`line[data-wall-id="${id}"]`)!;
}
function selectWall(storage: MemoryStorage, wall: StructuralWall): void {
  const event = pointer(storage, wallMidpoint(wall));
  fireEvent.pointerDown(wallHit(wall.id), event);
  fireEvent.pointerUp(surface(), event);
}

describe('complete Studio doors through real Layout gestures', () => {
  it('hover/click creates one closed door; selecting drag, Arrange, cancellation and whole removal share history and codecs', async () => {
    const original = createPopulatedStudioDocument();
    const storage = new MemoryStorage(original);
    const mounted = mount(storage);
    await settled();
    const writes = storage.roomWrites();
    const bytes = storage.bytes.get(ROOM_DRAFT_STORAGE_KEY);
    fireEvent.click(button('Door'));
    changeField(
      'Complete door appearance',
      'dnd5e:env:dark-fortress:wall_door_double_01'
    );
    fireEvent.pointerMove(
      wallHit('studio-wall'),
      pointer(storage, { x: -2, z: -3 })
    );
    expect(screen.getByRole('alert').textContent).toMatch(/overlap/);
    fireEvent.pointerDown(
      wallHit('studio-wall'),
      pointer(storage, { x: -2, z: -3 })
    );
    expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    expect(storage.roomWrites()).toBe(writes);
    fireEvent.pointerMove(
      wallHit('studio-wall'),
      pointer(storage, { x: -0.25, z: -3 })
    );
    expect(surface().querySelectorAll('[data-door-id]')).toHaveLength(2); // actual matching cut/door preview
    expect(storage.roomWrites()).toBe(writes);
    fireEvent.pointerDown(
      wallHit('studio-wall'),
      pointer(storage, { x: -0.25, z: -3 })
    );
    expect(button('Select').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByLabelText('Complete door appearance')).toBeNull();
    const created = storage.document();
    const opening = created.draft.room.walls![0].openings.at(-1)!;
    expect(created.draft.room.doorBindings![opening.door!.id]).toEqual({
      closed: true,
    });
    expect(created.scope).toEqual(original.scope);
    expect(storage.roomWrites()).toBe(writes + 1);
    const hit = (): Element =>
      surface().querySelector(`[data-door-id="${opening.door!.id}"] circle`)!;
    const start = pointer(storage, { x: -0.25, z: -3 });
    const end = pointer(storage, { x: -0.125, z: -3 });
    fireEvent.pointerDown(hit(), start);
    fireEvent.pointerMove(surface(), end);
    expect(storage.document()).toEqual(created);
    expect(
      Number(
        (screen.getByLabelText('Along wall position') as HTMLInputElement).value
      )
    ).toBeCloseTo(3.875, 6);
    fireEvent.pointerUp(surface(), end);
    const dragged = storage.document();
    expect(dragged.draft.room.walls![0].openings.at(-1)!.position).toBeCloseTo(
      3.875,
      12
    );
    expect(storage.roomWrites()).toBe(writes + 2);
    changeField('Along wall position', '3.75');
    changeField('Door width', '1.5');
    submitForm('Arrange selected noun');
    const arranged = storage.document();
    expect(arranged.draft.room.walls![0].openings.at(-1)).toMatchObject({
      position: 3.75,
      width: 1.5,
      door: opening.door,
    });
    expect(storage.roomWrites()).toBe(writes + 3);
    for (const cancel of ['Escape', 'capture-loss', 'view'] as const) {
      fireEvent.pointerDown(hit(), start);
      fireEvent.pointerMove(surface(), end);
      if (cancel === 'Escape') fireEvent.keyDown(window, { key: 'Escape' });
      else if (cancel === 'capture-loss')
        fireEvent.lostPointerCapture(surface(), end);
      else {
        switchTo('3D');
        switchTo('Layout');
      }
      fireEvent.pointerUp(surface(), end);
      expect(storage.document()).toEqual(arranged);
      expect(storage.roomWrites()).toBe(writes + 3);
    }
    fireEvent.click(button('Delete doorway'));
    expect(storage.document()).toEqual(original);
    for (const expected of [arranged, dragged, created, original]) {
      fireEvent.click(button('Undo'));
      expect(storage.document()).toEqual(expected);
    }
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    for (const expected of [created, dragged, arranged]) {
      fireEvent.click(button('Redo'));
      expect(storage.document()).toEqual(expected);
    }
    expectCodecs(arranged);
    mounted.unmount();
    mount(storage);
    await settled();
    expect(storage.document()).toEqual(arranged);
    expect(
      surface().querySelector(`[data-door-id="${opening.door!.id}"]`)
    ).not.toBeNull();
  });
});

describe('joined structural walls in the populated Studio document', () => {
  it('consecutive free/snapped draws, rotated protected reshape, precision, removal and interleaved prop history preserve the full payload through codecs/reload', async () => {
    const original = rotatedSeed();
    const storage = new MemoryStorage(original);
    let id = 0;
    const mounted = mount(storage, () => `joined-wall-${++id}`);
    await settled();
    expect(document.querySelectorAll('.es-header, .es-toolbar')).toHaveLength(
      2
    );
    expect(screen.queryByLabelText('Width (hexes)')).toBeNull();
    gesture(zero);
    const floor = storage.document();
    expectPreserved(floor, original);
    const states: RoomDraftDocument[] = [original, floor];
    fireEvent.click(button('Wall'));
    expect((screen.getByLabelText(snapLabel) as HTMLInputElement).checked).toBe(
      false
    );
    chooseAppearance(castleWallRef, 'castle_wall_01');
    for (const [start, end, snapped] of [
      [{ x: -1.2, z: 3.2 }, { x: 1.6, z: 4.1 }, false],
      [{ x: -2.3, z: 5.2 }, { x: 2.4, z: 5.1 }, true],
    ] as const) {
      if (snapped) fireEvent.click(screen.getByLabelText(snapLabel));
      const writes = storage.roomWrites();
      fireEvent.pointerDown(surface(), pointer(storage, start));
      fireEvent.pointerMove(surface(), pointer(storage, end));
      expect(storage.roomWrites()).toBe(writes);
      expect(storage.document()).toEqual(states.at(-1));
      expect(
        surface().querySelector('[data-wall-preview="create"]')
      ).not.toBeNull();
      fireEvent.pointerUp(surface(), pointer(storage, end));
      const next = storage.document();
      const wall = next.draft.room.walls!.at(-1)!;
      const entry = WORLD_BUILDING_CATALOG_BY_REF.get(castleWallRef)!;
      if (entry.source !== 'generated')
        throw new Error('Expected generated wall asset');
      expect(wall).toEqual(
        createWall({
          id: wall.id,
          assetRef: castleWallRef,
          start: snapWallPoint({
            point: sampledPoint(storage, start),
            enabled: snapped,
          }).point,
          end: snapWallPoint({
            point: sampledPoint(storage, end),
            enabled: snapped,
          }).point,
          height: entry.asset.boundsMeters[1],
          thickness: entry.asset.boundsMeters[2],
          elevation: 0,
        })
      );
      expect(next).toEqual({
        ...states.at(-1)!,
        draft: {
          ...states.at(-1)!.draft,
          room: {
            ...states.at(-1)!.draft.room,
            walls: [...states.at(-1)!.draft.room.walls!, wall],
          },
        },
      });
      expect(storage.roomWrites()).toBe(writes + 1);
      expect(button('Wall').getAttribute('aria-pressed')).toBe('true');
      states.push(next);
    }
    fireEvent.click(button('Dismiss wall controls'));
    expect(screen.queryByLabelText('Search wall appearances')).toBeNull();
    expect(storage.document()).toEqual(states.at(-1));
    fireEvent.click(button('Wall'));
    expect((screen.getByLabelText(snapLabel) as HTMLInputElement).checked).toBe(
      true
    );
    fireEvent.click(screen.getByLabelText(snapLabel)); // existing wall free transform
    fireEvent.click(button('Select'));
    let wall = original.draft.room.walls![0];
    const anchor = wallMidpoint(wall);
    const destination = { x: anchor.x + 0.5, z: anchor.z + 0.75 };
    const writes = storage.roomWrites();
    fireEvent.pointerDown(wallHit(wall.id), pointer(storage, anchor));
    fireEvent.pointerMove(surface(), pointer(storage, destination));
    expect(storage.roomWrites()).toBe(writes); // selection/context demand is not a commit
    const from = sampledPoint(storage, anchor),
      to = sampledPoint(storage, destination);
    wall = translateWall(wall, { x: to.x - from.x, z: to.z - from.z });
    fireEvent.pointerUp(surface(), pointer(storage, destination));
    expect(storage.document()).toEqual(withWall(states.at(-1)!, wall));
    states.push(storage.document());
    const target = { x: wall.line.start.x, z: wall.line.start.z + 4 };
    const theoretical = reshapeWallEndpoint({
      wall,
      endpoint: 'end',
      point: sampledPoint(storage, target),
    });
    expect(theoretical.clamped).toBe(true);
    expect(theoretical.appliedLength).toBeCloseTo(7);
    const handle = surface().querySelector(
      `[data-wall-id="${wall.id}"][data-wall-endpoint="end"]`
    )!;
    fireEvent.pointerDown(handle, pointer(storage, wall.line.end));
    fireEvent.pointerMove(surface(), pointer(storage, target));
    expect(storage.document()).toEqual(states.at(-1));
    const feedback = surface().querySelector(
      '[data-wall-feedback="Clamped to preserve openings"]'
    )!;
    expect(feedback).not.toBeNull();
    const applied = pointInDocument(storage, theoretical.wall.line.end);
    expect(Number(feedback.getAttribute('cx'))).toBeCloseTo(
      applied.clientX - bounds.left
    );
    expect(Number(feedback.getAttribute('cy'))).toBeCloseTo(
      applied.clientY - bounds.top
    );
    expect(
      Math.abs(applied.clientY - pointInDocument(storage, target).clientY)
    ).toBeGreaterThan(10);
    fireEvent.pointerUp(surface(), pointer(storage, target));
    wall = theoretical.wall;
    expect(storage.document()).toEqual(withWall(states.at(-1)!, wall));
    expect(wall.openings).toEqual(original.draft.room.walls![0].openings);
    expect(wall.blocker.footprint.width).toBeCloseTo(7.5);
    states.push(storage.document());
    changeField('Wall length', '8');
    submitForm('Arrange selected noun');
    wall = resizeWallLength({ wall, endpoint: 'end', length: 8 }).wall;
    expect(storage.document()).toEqual(withWall(states.at(-1)!, wall));
    states.push(storage.document());
    const requestedYawDegrees =
      ((wallDirectionYaw(wall) - Math.PI / 12) * 180) / Math.PI;
    // Arrange accepts absolute degrees, not the retired delta form. Derive the
    // exact oracle from that input and the PRE-edit yaw, never the edited result.
    // Degree conversion can differ by one ULP from the old literal PI / 12.
    const expectedAngle =
      wallDirectionYaw(wall) - (requestedYawDegrees * Math.PI) / 180;
    expect(expectedAngle).toBeCloseTo(Math.PI / 12); // same +15° XZ direction
    changeField('Y facing (degrees)', String(requestedYawDegrees));
    submitForm('Arrange selected noun');
    wall = rotateWall(wall, { angle: expectedAngle });
    expect(storage.document()).toEqual(withWall(states.at(-1)!, wall));
    states.push(storage.document());
    chooseAppearance(castleWallRef, 'castle_wall_01');
    wall = setWallAppearance(wall, {
      ...wall.appearance,
      assetRef: castleWallRef,
    });
    expect(storage.document()).toEqual(withWall(states.at(-1)!, wall));
    expect(wall.blocker.blocksLineOfSight).toBe(false);
    expect(wall.blocker.footprint).toMatchObject({
      depth: 0.4,
      offsetX: 0.2,
      offsetZ: -0.1,
    });
    states.push(storage.document());
    const beforeRemoval = storage.document();
    fireEvent.click(button('Remove wall'));
    const removed = storage.document();
    expect(removed).toEqual({
      ...beforeRemoval,
      draft: {
        ...beforeRemoval.draft,
        room: {
          ...beforeRemoval.draft.room,
          walls: beforeRemoval.draft.room.walls!.filter(
            (entry) => entry.id !== wall.id
          ),
          doorBindings: Object.fromEntries(
            Object.entries(beforeRemoval.draft.room.doorBindings!).filter(
              ([key]) => key !== 'studio-door'
            )
          ),
        },
      },
      // Explicit site policy references are carried, not silently scrubbed.
      // The server, not this authoring operation, judges dangling references.
      scope: beforeRemoval.scope,
    });
    fireEvent.click(button('Undo'));
    expect(storage.document()).toEqual(beforeRemoval); // restores owned binding/identities; unchanged references resolve again
    fireEvent.click(button('Redo'));
    expect(storage.document()).toEqual(removed);
    states.push(removed);
    switchTo('3D');
    expect(viewport().roomAuthoring?.walls).toEqual(removed.draft.room.walls);
    expect(viewport().roomAuthoring?.doorBindings).toEqual(
      removed.draft.room.doorBindings
    );
    act(() => viewport().onSelect(['studio-decoration']));
    const nextScene = moved(viewport().scene);
    act(() => viewport().onTransformPreview(nextScene));
    expect(storage.document()).toEqual(removed);
    act(() => viewport().onSelect([viewport().scene.items[0].id]));
    act(() => viewport().onTransformCommit(nextScene));
    const final = { ...removed, draft: { ...removed.draft, scene: nextScene } };
    expect(storage.document()).toEqual(final);
    states.push(final);
    switchTo('Layout');
    for (const expected of states.slice(0, -1).reverse()) {
      fireEvent.click(button('Undo'));
      expect(storage.document()).toEqual(expected);
    }
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    for (const expected of states.slice(1)) {
      fireEvent.click(button('Redo'));
      expect(storage.document()).toEqual(expected);
    }
    expect((button('Redo') as HTMLButtonElement).disabled).toBe(true);
    // Encode while the attached door is present as well as after reconciliation.
    expectCodecs(beforeRemoval);
    expectCodecs(final);
    fireEvent.click(button('Undo')); // prop
    fireEvent.click(button('Undo')); // removal: reload with the attachment present
    expect(storage.document()).toEqual(beforeRemoval);
    mounted.unmount();
    mount(storage);
    await settled();
    expect(storage.document()).toEqual(beforeRemoval);
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    switchTo('3D');
    expect(viewport().scene).toEqual(beforeRemoval.draft.scene);
    expect(viewport().roomAuthoring?.walls).toEqual(
      beforeRemoval.draft.room.walls
    );
    expect(viewport().roomAuthoring?.doorBindings).toEqual(
      beforeRemoval.draft.room.doorBindings
    );
  });

  it('populated selection/reflow, cancel, no-op, refusal and late epoch release create no wall history or writes', async () => {
    const original = rotatedSeed();
    const storage = new MemoryStorage(original);
    mount(storage);
    await settled();
    const writes = storage.roomWrites();
    const bytes = storage.bytes.get(ROOM_DRAFT_STORAGE_KEY);
    fireEvent.click(button('Select'));
    const wall = original.draft.room.walls![0];
    selectWall(storage, wall);
    fireEvent.click(button('Arrange'));
    selectWall(storage, wall); // unchanged selection does not force controls to reappear
    expect(
      screen.queryByRole('form', { name: 'Arrange selected noun' })
    ).toBeNull();
    fireEvent.click(button('Arrange')); // explicit reopen
    changeField('Wall midpoint X', String(wallMidpoint(wall).x));
    changeField('Wall midpoint Z', String(wallMidpoint(wall).z));
    submitForm('Arrange selected noun');
    const end = pointer(storage, wall.line.end);
    fireEvent.pointerDown(
      surface().querySelector(`[data-wall-endpoint="end"]`)!,
      end
    );
    fireEvent.pointerMove(surface(), end);
    fireEvent.pointerUp(surface(), end);
    changeField('Wall midpoint X', String(wallMidpoint(wall).x + 999));
    submitForm('Arrange selected noun');
    expect(
      screen
        .getAllByRole('alert')
        .map((entry) => entry.textContent)
        .join(' ')
    ).toMatch(/outside|workspace/i);
    fireEvent.pointerDown(
      wallHit(wall.id),
      pointer(storage, wallMidpoint(wall))
    );
    fireEvent.pointerMove(surface(), pointer(storage, { x: 1, z: 1 }));
    fireEvent.pointerCancel(surface(), { pointerId: 7 });
    fireEvent.pointerUp(surface(), pointer(storage, { x: 1, z: 1 }));
    fireEvent.click(button('Wall'));
    chooseAppearance(castleWallRef, 'castle_wall_01');
    draw(storage, { x: 0, z: 4 }, { x: 0, z: 4 }); // zero-length
    fireEvent.pointerDown(surface(), pointer(storage, { x: -1, z: 4 }));
    fireEvent.pointerMove(surface(), pointer(storage, { x: 1, z: 4 }));
    fireEvent.keyDown(surface(), { key: 'Escape' });
    fireEvent.pointerUp(surface(), pointer(storage, { x: 1, z: 4 }));
    fireEvent.click(button('Wall'));
    fireEvent.pointerDown(surface(), pointer(storage, { x: -1, z: 4 }));
    fireEvent.pointerMove(surface(), pointer(storage, { x: 1, z: 4 }));
    fireEvent.click(screen.getByLabelText(snapLabel)); // epoch retirement on same mounted SVG
    fireEvent.pointerUp(surface(), pointer(storage, { x: 1, z: 4 }));
    expect(surface().querySelector('[data-wall-preview="create"]')).toBeNull();
    const retired = surface();
    fireEvent.pointerDown(retired, pointer(storage, { x: -1, z: 4 }));
    fireEvent.pointerMove(retired, pointer(storage, { x: 1, z: 4 }));
    switchTo('3D');
    fireEvent.pointerUp(retired, pointer(storage, { x: 1, z: 4 }));
    expect(viewport().roomAuthoring?.walls).toEqual(original.draft.room.walls);
    switchTo('Layout');
    fireEvent.click(button('Wall'));
    expect((screen.getByLabelText(snapLabel) as HTMLInputElement).checked).toBe(
      true
    );
    expect(storage.document()).toEqual(original);
    expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    expect(storage.roomWrites()).toBe(writes);
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    expect(captured.size).toBe(0);
  });

  it('ordinary joined wall/name authoring retains unfinished intel while actual save/export and strict codecs refuse it', async () => {
    const original = rotatedSeed();
    original.draft.scene.version = 2;
    original.draft.scene.mapLabels = [
      { id: 'strict-noop-label', text: 'Map', location: { x: 0, z: 0 } },
    ];
    const storage = new MemoryStorage(original);
    let idSequence = 0;
    const idFactory = (): string => `unfinished-${++idSequence}`;
    const mounted = render(
      <WorldBuildingConcept roomMode storage={storage} idFactory={idFactory} />
    );
    fireEvent.click(button('Add intel record'));
    const bytes = storage.bytes.get(ROOM_DRAFT_STORAGE_KEY);
    const writes = storage.roomWrites();
    let session: EncounterStudioSession | undefined;
    // Studio deliberately has no policy editor. Stage through the real legacy
    // editor, then retain THAT owner via its presentation seam; no fake owner,
    // unchecked storage input, second document or synthetic policy command.
    mounted.rerender(
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={idFactory}
        studioPresentation={{
          view: 'layout',
          render: (next) => {
            session = next;
            return (
              <>
                <LayoutViewport
                  draft={next.document.draft}
                  documentContext={next.document}
                  tool="wall"
                  frame={{ center: { x: 0, z: 0 }, zoom: 1 }}
                  onFrameChange={() => {}}
                  onCommit={next.commitFloor}
                  wallEditing={next.wallEditing}
                  intentEpoch={next.intentEpoch}
                />
                <StudioWallControls
                  session={next}
                  drawing
                  onDismiss={() => {}}
                  onExitWallTool={() => {}}
                />
              </>
            );
          },
        }}
      />
    );
    const unfinished = session!.document;
    const unfinishedIntel = unfinished.scope.intel!.find(
      (entry) =>
        !original.scope.intel!.some((previous) => previous.id === entry.id)
    )!;
    expect(unfinishedIntel).toMatchObject({ reveals: { fact: '' } });
    act(() =>
      expect(session!.mapLabelSelection.select('strict-noop-label')).toBe(true)
    );
    const label = unfinished.draft.scene.mapLabels![0];
    const historyAvailable = { undo: session!.canUndo, redo: session!.canRedo };
    act(() =>
      expect(
        session!.commitArrange({
          kind: 'label-edit',
          target: { kind: 'label', id: label.id },
          text: label.text,
          location: label.location,
        })
      ).toBe(false)
    );
    expect(session!.notice).toMatch(/must name a fact/);
    expect(session!.document).toBe(unfinished);
    expect({ undo: session!.canUndo, redo: session!.canRedo }).toEqual(
      historyAvailable
    );
    expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    expect(storage.roomWrites()).toBe(writes);

    act(() => expect(session!.renameDocument('Unfinished castle')).toBe(true));
    const renamed = session!.document;
    expect(renamed).toEqual({
      ...unfinished,
      draft: {
        ...unfinished.draft,
        name: 'Unfinished castle',
        scene: { ...unfinished.draft.scene, name: 'Unfinished castle' },
      },
    });
    act(() => session!.wallEditing.select('studio-wall'));
    act(() =>
      expect(
        session!.commitArrange({
          kind: 'wall-edit',
          target: { kind: 'wall', id: 'studio-wall' },
          midpoint: { x: 0.125 },
        })
      ).toBe(true)
    );
    expect(session!.document.scope).toEqual(unfinished.scope);
    expect(() =>
      stringifyRoomDraft(session!.document.draft, session!.document.scope)
    ).toThrow(/must name a fact/);
    act(() => session!.undo());
    expect(session!.document).toEqual(renamed);
    act(() =>
      expect(
        session!.doorEditing.setAsset(
          'dnd5e:env:dark-fortress:wall_door_double_01'
        )
      ).toBe(true)
    );
    act(() => expect(session!.doorEditing.setActive(true)).toBe(true));
    const source = session!.document.draft.room.walls![0];
    const point = {
      x:
        source.line.start.x +
        ((source.line.end.x - source.line.start.x) * 3.75) / 8,
      z:
        source.line.start.z +
        ((source.line.end.z - source.line.start.z) * 3.75) / 8,
    };
    act(() => expect(session!.doorEditing.create(source.id, point)).toBe(true));
    expect(session!.document.scope).toEqual(unfinished.scope);
    expect(session!.document.draft.room.walls![0].openings).toHaveLength(
      source.openings.length + 1
    );
    expect(() =>
      stringifyRoomDraft(session!.document.draft, session!.document.scope)
    ).toThrow(/must name a fact/);
    expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    act(() => session!.undo());
    expect(session!.document).toEqual(renamed);
    chooseAppearance(castleWallRef, 'castle_wall_01');
    draw(storage, { x: -1, z: 4 }, { x: 1, z: 4 });
    const authored = session!.document;
    expect(authored.draft.room.walls).toHaveLength(2);
    expect(authored.scope).toEqual(unfinished.scope);
    expect(authored.draft.room.doorBindings).toEqual(
      original.draft.room.doorBindings
    );
    act(() => session!.saveLocalDraft());
    expect(session!.notice).toMatch(/must name a fact/);
    expect(() => stringifyRoomDraft(authored.draft, authored.scope)).toThrow(
      /must name a fact/
    );
    expect(() =>
      encodeSingleRoomDungeon({
        key: 'unfinished',
        draft: authored.draft,
        ...authored.scope,
      })
    ).toThrow(/must name a fact/);
    act(() => session!.undo());
    expect(session!.document).toEqual(renamed);
    act(() => session!.undo());
    expect(session!.document).toEqual(unfinished);
    act(() => session!.redo());
    act(() => session!.redo());
    expect(session!.document).toEqual(authored);
    mounted.rerender(
      <WorldBuildingConcept roomMode storage={storage} idFactory={idFactory} />
    );
    fireEvent.click(button('Identity'));
    fireEvent.click(button('Export room draft JSON'));
    expect(screen.getByRole('alert').textContent).toMatch(
      /Export refused.*must name a fact/
    );
    expect(
      (screen.getByLabelText('Portable JSON') as HTMLTextAreaElement).value
    ).toBe('');
    expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    expect(storage.roomWrites()).toBe(writes);
    // Fix only the unfinished fact with the actual policy form; the previously
    // edited walls/name become persistable together, without dropping policy.
    fireEvent.change(
      screen.getByLabelText(`Intel reveals fact for ${unfinishedIntel.id}`),
      {
        target: { value: 'author-completed' },
      }
    );
    const completed = storage.document();
    expect(completed).toEqual({
      ...authored,
      scope: {
        ...authored.scope,
        intel: authored.scope.intel!.map((entry) =>
          entry.id === unfinishedIntel.id
            ? { ...entry, reveals: { fact: 'author-completed' } }
            : entry
        ),
      },
    });
    expectCodecs(completed);
  });
});

// Real document owner/projections/reducers. Renderer gesture evidence remains
// in the Layout tests above; these callback tests do not claim WebGL raycasts.
describe('Arrange owner atomic noun transactions and arbitration', () => {
  function arrangeOwner(document = createPopulatedStudioDocument()) {
    const storage = new MemoryStorage(document);
    let session: EncounterStudioSession;
    let view: '3d' | 'layout' = '3d';
    const presentation = () => (
      <WorldBuildingConcept
        roomMode
        storage={storage}
        studioPresentation={{
          view,
          render: (next) => {
            session = next;
            return (
              <>
                {next.propControls.tree}
                {next.propControls.selection}
              </>
            );
          },
        }}
      />
    );
    const mounted = render(presentation());
    return {
      get session() {
        return session!;
      },
      storage,
      switchView(next: typeof view) {
        view = next;
        mounted.rerender(presentation());
      },
      unmount: mounted.unmount,
    };
  }

  it('complete door placement preview and closed binding are one ordinary owner transaction; Arrange/no-op/delete preserve unrelated scope', () => {
    const owner = arrangeOwner();
    const ref = 'dnd5e:env:dark-fortress:wall_door_double_01';
    const original = owner.session.document;
    const bytes = owner.storage.bytes.get(ROOM_DRAFT_STORAGE_KEY);
    const writes = owner.storage.roomWrites();
    act(() => expect(owner.session.doorEditing.setAsset(ref)).toBe(true));
    act(() => expect(owner.session.doorEditing.setActive(true)).toBe(true));
    const placement = owner.session.doorEditing;
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(owner.session.document).toBe(original);
    act(() =>
      expect(placement.previewPlacement('studio-wall', { x: -2, z: -3 })).toBe(
        false
      )
    ); // existing arch overlap
    expect(owner.session.doorEditing.preview?.valid).toBe(false);
    expect(owner.session.document).toBe(original);
    expect(owner.storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    act(() =>
      expect(
        placement.previewPlacement('studio-wall', { x: -0.25, z: -3 })
      ).toBe(true)
    );
    expect(owner.session.doorEditing.previewPlacement).toBe(
      placement.previewPlacement
    );
    expect(owner.storage.roomWrites()).toBe(writes);
    act(() =>
      expect(placement.create('studio-wall', { x: -0.25, z: -3 })).toBe(true)
    );
    const created = owner.session.document;
    const selected = owner.session.arrange!;
    if (selected.kind !== 'door') throw new Error('Expected attached door');
    expect(selected.position).toBe(3.75);
    expect(created.draft.room.doorBindings![selected.door.id]).toEqual({
      closed: true,
    });
    expect(created.scope).toEqual(original.scope);
    expect(owner.session.doorEditing.assetRef).toBe(ref);
    expect(owner.session.doorEditing.active).toBe(false);
    expect(owner.session.propTool).toBe('select');
    expect(owner.storage.roomWrites()).toBe(writes + 1);
    act(() =>
      expect(
        owner.session.commitArrange({
          kind: 'door-edit',
          target: selected.target,
          position: selected.position,
          width: selected.width,
        })
      ).toBe(true)
    );
    expect(owner.session.document).toBe(created);
    expect(owner.storage.roomWrites()).toBe(writes + 1);
    act(() =>
      expect(
        owner.session.commitArrange({
          kind: 'door-edit',
          target: selected.target,
          position: 4,
          width: NaN,
        })
      ).toBe(false)
    );
    expect(owner.session.document).toBe(created);
    act(() =>
      expect(
        owner.session.commitArrange({
          kind: 'door-edit',
          target: selected.target,
          position: 3.875,
          width: 1.5,
        })
      ).toBe(true)
    );
    const edited = owner.session.document;
    expect(edited.draft.room.doorBindings).toEqual(
      created.draft.room.doorBindings
    );
    expect(owner.storage.roomWrites()).toBe(writes + 2);
    act(() =>
      expect(
        owner.session.commitArrange({
          kind: 'door-remove',
          target: selected.target,
        })
      ).toBe(true)
    );
    expect(owner.session.document).toEqual(original);
    expect(owner.storage.roomWrites()).toBe(writes + 3);
    for (const expected of [edited, created, original]) {
      act(() => owner.session.undo());
      expect(owner.session.document).toEqual(expected);
    }
    expect(owner.session.canUndo).toBe(false);
  });

  it('door move permits only its intended single initializing selection, not another target/round trip; previews retain locked binding', () => {
    const document = createPopulatedStudioDocument();
    document.draft.room.doorBindings!['studio-door'] = {
      locked: [{ ability: 'dex', dc: 14 }],
    };
    const owner = arrangeOwner(document);
    const target = {
      kind: 'door' as const,
      wallId: 'studio-wall',
      openingId: 'studio-opening',
      doorId: 'studio-door',
    };
    const initial = owner.session;
    act(() => {
      expect(initial.doorEditing.select(target)).toBe(true);
      expect(initial.wallEditing.select(null)).toBe(true); // neutral must not cancel the selecting grab
      expect(initial.doorEditing.previewMove(target, 6.125)).toBe(true);
    });
    expect(owner.session.intentEpoch).toBe(initial.intentEpoch);
    expect(owner.session.doorEditing.preview).toMatchObject({
      valid: true,
      purpose: 'move',
    });
    expect(owner.session.document.draft.room.doorBindings).toEqual(
      document.draft.room.doorBindings
    );
    act(() => expect(initial.doorEditing.move(target, 6.125)).toBe(true));
    const moved = owner.session.document;
    expect(moved.draft.room.doorBindings).toEqual(
      document.draft.room.doorBindings
    );
    const stale = owner.session;
    const writes = owner.storage.roomWrites();
    const bytes = owner.storage.bytes.get(ROOM_DRAFT_STORAGE_KEY);
    act(() => {
      stale.viewportProps.onSelect(['table']);
      stale.doorEditing.select(target);
      expect(stale.doorEditing.move(target, 6.25)).toBe(false);
      expect(stale.doorEditing.previewMove(target, 6.25)).toBe(false);
    });
    expect(owner.session.document).toBe(moved);
    expect(owner.storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    expect(owner.storage.roomWrites()).toBe(writes);
    const beforeView = owner.session;
    owner.switchView('layout');
    act(() => expect(beforeView.doorEditing.move(target, 6.25)).toBe(false));
    expect(owner.session.document).toBe(moved);
  });

  it.each([
    ['actor', 'scene'],
    ['actor', 'actor'],
    ['actor', 'round-trip'],
    ['start', 'scene'],
    ['start', 'actor'],
    ['start', 'round-trip'],
  ] as const)(
    'retires captured %s movement on %s selection before the next render without history or writes',
    (noun, change) => {
      const owner = arrangeOwner();
      const target =
        noun === 'actor'
          ? { kind: 'actor' as const, id: 'goblin-1' }
          : { kind: 'start' as const };
      act(() =>
        owner.session.viewportProps.roomAuthoring!.onSelectActorTarget!(target)
      );
      act(() => owner.session.setPropTool('move'));
      const stale = owner.session;
      const before = stale.document;
      const bytes = owner.storage.bytes.get(ROOM_DRAFT_STORAGE_KEY);
      const writes = owner.storage.roomWrites();
      act(() => {
        if (change === 'actor')
          stale.viewportProps.roomAuthoring!.onSelectActorTarget!({
            kind: 'actor',
            id: 'skeleton-b',
          });
        else stale.viewportProps.onSelect(['table']);
        if (change === 'round-trip')
          stale.viewportProps.roomAuthoring!.onSelectActorTarget!(target);
        if (noun === 'actor')
          stale.viewportProps.roomAuthoring!.onMoveMonster!('goblin-1', {
            q: 1,
            r: 0,
          });
        else stale.viewportProps.roomAuthoring!.onStartGesture!({ q: 1, r: 0 });
      });
      expect(owner.session.document).toBe(before);
      expect(owner.storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
      expect(owner.storage.roomWrites()).toBe(writes);
      expect(owner.session.canUndo).toBe(false);
      expect(owner.session.canRedo).toBe(false);
      expect(owner.session.intentEpoch).toBe(stale.intentEpoch);
      act(() =>
        owner.session.viewportProps.roomAuthoring!.onSelectActorTarget!(target)
      );
      act(() => {
        if (noun === 'actor')
          owner.session.viewportProps.roomAuthoring!.onMoveMonster!(
            'goblin-1',
            { q: 1, r: 0 }
          );
        else
          owner.session.viewportProps.roomAuthoring!.onStartGesture!({
            q: 1,
            r: 0,
          });
      });
      expect(owner.storage.roomWrites()).toBe(writes + 1);
      expect(owner.session.document).not.toBe(before);
      act(() => owner.session.undo());
      expect(owner.session.document).toEqual(before);
      expect(owner.session.canUndo).toBe(false);
    }
  );

  it('refuses a requested actor ID different from the captured Move target without spending its mode', () => {
    const owner = arrangeOwner();
    act(() =>
      owner.session.viewportProps.roomAuthoring!.onSelectActorTarget!({
        kind: 'actor',
        id: 'goblin-1',
      })
    );
    act(() => owner.session.setPropTool('move'));
    const before = owner.session.document;
    const bytes = owner.storage.bytes.get(ROOM_DRAFT_STORAGE_KEY);
    const writes = owner.storage.roomWrites();
    act(() =>
      owner.session.viewportProps.roomAuthoring!.onMoveMonster!('skeleton-b', {
        q: 1,
        r: 0,
      })
    );
    expect(owner.session.document).toBe(before);
    expect(owner.storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    expect(owner.storage.roomWrites()).toBe(writes);
    expect(owner.session.canUndo).toBe(false);
    expect(owner.session.propTool).toBe('move');
    expect(owner.session.viewportProps.roomAuthoring!.tool).toBe('move');
  });

  it('composes scene position/yaw/height once; invalid late fields and exact defaults never write or add history', () => {
    const owner = arrangeOwner();
    act(() => owner.session.viewportProps.onSelect(['studio-decoration']));
    const original = owner.session.document;
    const selected = owner.session.arrange!;
    expect(selected.kind).toBe('scene');
    if (selected.kind !== 'scene') throw new Error('Expected scenery');
    const bytes = owner.storage.bytes.get(ROOM_DRAFT_STORAGE_KEY);
    const writes = owner.storage.roomWrites();
    act(() =>
      expect(
        owner.session.commitArrange({
          kind: 'scene-edit',
          target: selected.target,
          position: selected.position,
          rotation: { kind: 'absolute', radians: selected.yaw! },
          heightScale: 1,
        })
      ).toBe(true)
    );
    expect(owner.session.document).toBe(original);
    expect(owner.session.canUndo).toBe(false);
    expect(owner.storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    expect(owner.storage.roomWrites()).toBe(writes);
    act(() =>
      expect(
        owner.session.commitArrange({
          kind: 'scene-edit',
          target: selected.target,
          position: { x: selected.position.x + 1 },
          heightScale: NaN,
        })
      ).toBe(false)
    );
    expect(owner.session.document).toBe(original);
    expect(owner.storage.roomWrites()).toBe(writes);
    act(() =>
      expect(
        owner.session.commitArrange({
          kind: 'scene-edit',
          target: selected.target,
          position: {
            x: selected.position.x + 0.125,
            y: selected.position.y + 0.25,
          },
          rotation: { kind: 'absolute', radians: selected.yaw! + 0.1 },
          heightScale: 1.25,
        })
      ).toBe(true)
    );
    const edited = owner.session.document;
    expect(
      edited.draft.scene.items.find((item) => item.id === 'studio-decoration')
    ).toMatchObject({
      transform: {
        x: selected.position.x + 0.125,
        y: selected.position.y + 0.25,
        rotationY: selected.yaw! + 0.1,
      },
      heightScale: 1.25,
    });
    expect(edited.scope).toEqual(original.scope);
    expect(owner.storage.roomWrites()).toBe(writes + 1);
    act(() => owner.session.undo());
    expect(owner.session.document).toEqual(original);
    expect(owner.session.canUndo).toBe(false);
    act(() => owner.session.redo());
    expect(owner.session.document).toEqual(edited);
    act(() => owner.session.viewportProps.onSelect(['studio-decoration']));
    const current = owner.session.arrange!;
    if (current.kind !== 'scene') throw new Error('Expected scenery');
    act(() =>
      expect(
        owner.session.commitArrange({
          kind: 'scene-edit',
          target: current.target,
          position: { x: current.position.x + 1e-12 },
        })
      ).toBe(true)
    );
    expect(owner.session.document).not.toEqual(edited);
  });

  it('combines wall length/yaw/final midpoint/appearance once and rejects invalid late appearance atomically', () => {
    const document = createPopulatedStudioDocument();
    document.draft.room.walls![0] = rotateWall(document.draft.room.walls![0], {
      angle: 0.37,
    });
    const owner = arrangeOwner(document);
    act(() => owner.session.wallEditing.select('studio-wall'));
    const original = owner.session.document;
    const selected = owner.session.arrange!;
    if (selected.kind !== 'wall') throw new Error('Expected wall');
    const writes = owner.storage.roomWrites();
    act(() =>
      expect(
        owner.session.commitArrange({
          kind: 'wall-edit',
          target: { id: 'studio-wall', kind: 'wall' },
          midpoint: selected.midpoint,
          yaw: selected.yaw,
          length: { value: selected.length, anchor: 'start' },
          appearance: selected.appearance,
        })
      ).toBe(true)
    );
    expect(owner.session.document).toBe(original);
    expect(owner.session.canUndo).toBe(false);
    expect(owner.storage.roomWrites()).toBe(writes);

    act(() =>
      expect(
        owner.session.commitArrange({
          kind: 'wall-edit',
          target: selected.target,
          midpoint: { x: 1 },
          appearance: { height: -1 },
        })
      ).toBe(false)
    );
    expect(owner.session.document).toBe(original);
    expect(owner.storage.roomWrites()).toBe(writes);
    act(() =>
      expect(
        owner.session.commitArrange({
          kind: 'wall-edit',
          target: selected.target,
          length: { value: 9, anchor: 'start' },
          yaw: selected.yaw + 0.1,
          midpoint: { x: 1, z: -2 },
          appearance: { height: 3.5, thickness: 0.4, elevation: 0.25 },
        })
      ).toBe(true)
    );
    const edited = owner.session.document;
    const wall = edited.draft.room.walls![0];
    expect(wallMidpoint(wall).x).toBeCloseTo(1, 12);
    expect(wallMidpoint(wall).z).toBeCloseTo(-2, 12);
    expect(wall.appearance).toEqual({
      ...selected.wall.appearance,
      height: 3.5,
      thickness: 0.4,
      elevation: 0.25,
    });
    expect(wall.openings).toEqual(selected.wall.openings);
    expect(edited.draft.room.doorBindings).toEqual(
      original.draft.room.doorBindings
    );
    expect(edited.scope).toEqual(original.scope);
    expect(owner.storage.roomWrites()).toBe(writes + 1);
    act(() => owner.session.undo());
    expect(owner.session.document).toEqual(original);
    expect(owner.session.arrange?.kind).toBe('wall'); // existing wall retention
    expect(owner.session.canUndo).toBe(false);
  });

  it('label rename plus position is one strict transaction; an invalid late coordinate never renames', () => {
    const owner = arrangeOwner();
    act(() =>
      expect(owner.session.createMapLabel('Original', { x: 0, z: 0 })).toBe(
        true
      )
    );
    const id = owner.session.document.draft.scene.mapLabels![0].id;
    act(() => owner.session.mapLabelSelection.select(id));
    const original = owner.session.document;
    const writes = owner.storage.roomWrites();
    const target = { kind: 'label' as const, id };
    const label = original.draft.scene.mapLabels![0];
    act(() =>
      expect(
        owner.session.commitArrange({
          kind: 'label-edit',
          target,
          text: label.text,
          location: label.location,
        })
      ).toBe(true)
    );
    expect(owner.session.document).toBe(original);
    expect(owner.storage.roomWrites()).toBe(writes);
    expect(owner.session.canRedo).toBe(false);

    act(() =>
      expect(
        owner.session.commitArrange({
          kind: 'label-edit',
          target,
          text: 'Renamed',
          location: { x: NaN },
        })
      ).toBe(false)
    );
    expect(owner.session.document).toBe(original);
    expect(owner.storage.roomWrites()).toBe(writes);
    act(() =>
      expect(
        owner.session.commitArrange({
          kind: 'label-edit',
          target,
          text: 'Renamed',
          location: { x: 1, z: 2 },
        })
      ).toBe(true)
    );
    expect(owner.session.document.draft.scene.mapLabels![0]).toEqual({
      id,
      text: 'Renamed',
      location: { x: 1, z: 2 },
    });
    expect(owner.storage.roomWrites()).toBe(writes + 1);
    act(() => owner.session.undo());
    expect(owner.session.document).toEqual(original);
  });

  it('distinguishes an actor literally named start from party start; location/facing is one candidate and default removes absence', () => {
    const document = createPopulatedStudioDocument();
    document.draft.room.monsterDeclarations.push({
      ...document.draft.room.monsterDeclarations[0],
      id: 'start',
      startingCell: { location: { q: 0, r: 0 }, facing: 'n' },
    });
    document.draft.room.partyStart = { q: -1, r: 0 };
    const owner = arrangeOwner(document);
    act(() =>
      owner.session.viewportProps.roomAuthoring!.onSelectActorTarget!({
        kind: 'actor',
        id: 'start',
      })
    );
    expect(owner.session.arrange?.kind).toBe('actor');
    expect(
      owner.session.viewportProps.roomAuthoring!.selectedActorTarget
    ).toEqual({ kind: 'actor', id: 'start' });
    const original = owner.session.document;
    act(() =>
      expect(
        owner.session.commitArrange({
          kind: 'actor-start',
          target: { kind: 'actor', id: 'start' },
          location: { q: 1, r: 0 },
          facing: { kind: 'compass', value: 'invalid' },
        })
      ).toBe(false)
    );
    expect(owner.session.document).toBe(original);
    act(() =>
      expect(
        owner.session.commitArrange({
          kind: 'actor-start',
          target: { kind: 'actor', id: 'start' },
          location: { q: 1, r: 0 },
          facing: { kind: 'default' },
        })
      ).toBe(true)
    );
    const actor = owner.session.document.draft.room.monsterDeclarations.find(
      (monster) => monster.id === 'start'
    )!;
    expect(actor.startingCell.location).toEqual({ q: 1, r: 0 });
    expect(Object.hasOwn(actor.startingCell, 'facing')).toBe(false);
    expect(owner.session.document.draft.room.partyStart).toEqual({
      q: -1,
      r: 0,
    });
    act(() => owner.session.undo());
    expect(owner.session.document).toEqual(original);
    expect(owner.session.canUndo).toBe(false);
    act(() =>
      owner.session.viewportProps.roomAuthoring!.onSelectActorTarget!({
        kind: 'start',
      })
    );
    act(() =>
      expect(
        owner.session.commitArrange({
          kind: 'start-position',
          target: { kind: 'start' },
          location: { q: 2, r: 0 },
        })
      ).toBe(true)
    );
    expect(owner.session.document.draft.room.partyStart).toEqual({
      q: 2,
      r: 0,
    });
    expect(owner.session.document.draft.room.monsterDeclarations).toEqual(
      original.draft.room.monsterDeclarations
    );
  });

  it('synchronously fences old scene and wall callbacks on actor selection, including target round-trips; actions never fall back to remembered scenery', () => {
    const owner = arrangeOwner();
    act(() => owner.session.viewportProps.onSelect(['table']));
    const sceneSession = owner.session;
    const selected = sceneSession.arrange!;
    if (selected.kind !== 'scene') throw new Error('Expected scenery');
    const next = structuredClone(sceneSession.document.draft.scene);
    next.items[0].transform.x += 0.1;
    const before = owner.session.document;
    const writes = owner.storage.roomWrites();
    act(() => {
      sceneSession.viewportProps.roomAuthoring!.onSelectActorTarget!({
        kind: 'actor',
        id: 'goblin-1',
      });
      expect(
        sceneSession.commitArrange({
          kind: 'scene-edit',
          target: selected.target,
          position: { x: 1 },
        })
      ).toBe(false);
      sceneSession.viewportProps.onTransformCommit(next);
    });
    expect(owner.session.document).toBe(before);
    expect(owner.session.viewportProps.selectedIds).toEqual([]);
    expect(owner.session.propControls.selection).toBeNull();
    expect(owner.session.propControls.arrangeExtras).toBeNull();
    for (const event of [{ key: 'R' }, { key: 'd', ctrlKey: true }])
      fireEvent.keyDown(window, event);
    expect(owner.session.document).toBe(before);
    act(() => owner.session.viewportProps.onSelect(['table']));
    act(() =>
      expect(
        sceneSession.commitArrange({
          kind: 'scene-edit',
          target: selected.target,
          position: { x: 1 },
        })
      ).toBe(false)
    );
    act(() => owner.session.wallEditing.select('studio-wall'));
    const wallSession = owner.session;
    const wall = wallSession.document.draft.room.walls![0];
    act(() => {
      wallSession.viewportProps.roomAuthoring!.onSelectActorTarget!({
        kind: 'start',
      });
      expect(wallSession.wallEditing.edit({ ...wall, label: 'Stale' })).toBe(
        false
      );
      wallSession.viewportProps.roomAuthoring!.onWallTransformCommit!({
        ...wall,
        label: 'Stale',
      });
    });
    expect(
      owner.session.viewportProps.roomAuthoring!.selectedWallId
    ).toBeNull();
    expect(owner.session.document).toBe(before);
    expect(owner.storage.roomWrites()).toBe(writes);
    expect(owner.session.canUndo).toBe(false);
  });

  it('tree and label picker identities use the arbiter; neutral other-noun deselection does not cancel an initializing gesture', () => {
    const owner = arrangeOwner();
    fireEvent.click(screen.getByRole('button', { name: 'Select Table table' }));
    expect(owner.session.arrange?.kind).toBe('scene');
    act(() => owner.session.createMapLabel('Map', { x: 0, z: 0 }));
    const id = owner.session.document.draft.scene.mapLabels![0].id;
    owner.switchView('layout');
    const initial = owner.session;
    act(() => {
      expect(initial.mapLabelSelection.select(id)).toBe(true);
      expect(initial.wallEditing.select(null)).toBe(true);
    });
    expect(owner.session.arrange?.kind).toBe('label');
    expect(owner.session.intentEpoch).toBe(initial.intentEpoch);
    act(() => expect(initial.moveMapLabel(id, { x: 0.5, z: 0 })).toBe(true));
    const wallGesture = owner.session;
    act(() => {
      expect(wallGesture.wallEditing.select('studio-wall')).toBe(true);
      expect(wallGesture.mapLabelSelection.select(null)).toBe(true);
      expect(wallGesture.moveMapLabel(id, { x: 2, z: 0 })).toBe(false);
      expect(wallGesture.renameMapLabel(id, 'Stale')).toBe(false);
      expect(wallGesture.deleteMapLabel(id)).toBe(false);
    });
    expect(owner.session.arrange?.kind).toBe('wall');
    expect(owner.session.intentEpoch).toBe(wallGesture.intentEpoch);
    act(() =>
      expect(
        wallGesture.wallEditing.edit({
          ...owner.session.document.draft.room.walls![0],
          label: 'Dragged',
        })
      ).toBe(true)
    );
  });

  it('publishes committed values separately from gizmo preview and keeps preview callbacks stable', () => {
    const owner = arrangeOwner();
    act(() => owner.session.viewportProps.onSelect(['table']));
    const first = owner.session;
    const selected = first.arrange!;
    if (selected.kind !== 'scene') throw new Error('Expected scenery');
    const next = structuredClone(first.document.draft.scene);
    next.items.find((item) => item.id === 'table')!.transform.x += 0.25;
    const writes = owner.storage.roomWrites();
    act(() => first.viewportProps.onTransformPreview(next));
    const preview = owner.session.arrange!;
    if (preview.kind !== 'scene') throw new Error('Expected scenery');
    expect(preview.position).toEqual(selected.position);
    expect(preview.preview!.position.x).toBe(selected.position.x + 0.25);
    expect(owner.session.viewportProps.onTransformPreview).toBe(
      first.viewportProps.onTransformPreview
    );
    expect(owner.session.arrange?.selectionRevision).toBe(
      selected.selectionRevision
    );
    act(() =>
      expect(
        owner.session.commitArrange({
          kind: 'scene-edit',
          target: selected.target,
          position: { x: 1 },
        })
      ).toBe(false)
    );
    expect(owner.session.document).toBe(first.document);
    expect(owner.storage.roomWrites()).toBe(writes);
    act(() => owner.session.viewportProps.onTransformCommit(next));
    expect(owner.session.document.draft.scene).toEqual(next);
    expect(
      owner.session.arrange?.kind === 'scene' && owner.session.arrange.preview
    ).toBeUndefined();
    expect(owner.storage.roomWrites()).toBe(writes + 1);
  });

  it('typed actor Delete removes only actor start; document deletion retires absent targets without inventing a selection revision', () => {
    const document = createPopulatedStudioDocument();
    document.draft.room.monsterDeclarations.push({
      ...document.draft.room.monsterDeclarations[0],
      id: 'start',
      startingCell: { location: { q: 0, r: 0 } },
    });
    document.draft.room.partyStart = { q: -1, r: 0 };
    const owner = arrangeOwner(document);
    act(() =>
      owner.session.viewportProps.roomAuthoring!.onSelectActorTarget!({
        kind: 'actor',
        id: 'start',
      })
    );
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(
      owner.session.document.draft.room.monsterDeclarations.some(
        (monster) => monster.id === 'start'
      )
    ).toBe(false);
    expect(owner.session.document.draft.room.partyStart).toEqual(
      document.draft.room.partyStart
    );
    act(() => owner.session.wallEditing.select('studio-wall'));
    const selected = owner.session;
    const revision = selected.arrange!.selectionRevision;
    act(() =>
      expect(
        selected.commitArrange({
          kind: 'wall-remove',
          target: { kind: 'wall', id: 'studio-wall' },
        })
      ).toBe(true)
    );
    expect(owner.session.arrange).toBeNull();
    const writes = owner.storage.roomWrites();
    act(() =>
      expect(
        selected.commitArrange({
          kind: 'wall-edit',
          target: { kind: 'wall', id: 'studio-wall' },
          midpoint: { x: 1 },
        })
      ).toBe(false)
    );
    expect(owner.storage.roomWrites()).toBe(writes);
    act(() => owner.session.undo());
    expect(owner.session.arrange).toBeNull(); // deleted wall's prior selection was cleared
    act(() => owner.session.wallEditing.select('studio-wall'));
    expect(owner.session.arrange!.selectionRevision).toBe(revision + 1); // deletion/undo were not explicit selections
  });

  it('retires Arrange callbacks on view, document and epoch changes without selection-revision churn', () => {
    const owner = arrangeOwner();
    act(() => owner.session.viewportProps.onSelect(['table']));
    const first = owner.session;
    const selected = first.arrange!;
    if (selected.kind !== 'scene') throw new Error('Expected scenery');
    const intent = {
      kind: 'scene-edit' as const,
      target: selected.target,
      position: { x: 1 },
    };
    const revision = selected.selectionRevision;
    owner.switchView('layout');
    act(() => expect(first.commitArrange(intent)).toBe(false));
    expect(owner.session.arrange?.selectionRevision).toBe(revision);
    const layout = owner.session;
    act(() => owner.session.cancelTransients());
    act(() => expect(layout.commitArrange(intent)).toBe(false));
    expect(owner.session.arrange?.selectionRevision).toBe(revision);
    const current = owner.session;
    act(() => {
      expect(current.renameDocument('New document snapshot')).toBe(true);
      expect(current.commitArrange(intent)).toBe(false);
    });
    expect(owner.session.arrange?.selectionRevision).toBe(revision);
    expect(owner.session.document.draft.scene.items[0].transform).toEqual(
      first.document.draft.scene.items[0].transform
    );
    const final = owner.session;
    owner.unmount();
    expect(final.commitArrange(intent)).toBe(false);
  });
});

// Joined presentation → owner → canonical helpers/history/storage/codecs.
// Callback-driven 3D gestures stop at the explicitly mocked Canvas above;
// the separate disposable App browser walk proves actual loaded gizmos.
describe('Arrange joined presentation and canonical document receipts', () => {
  it('atomic group fields then a gizmo preview/commit share full-document undo/redo, codecs and reload without losing support or source', async () => {
    const original = seed();
    const storage = new MemoryStorage(original);
    const mounted = mount(storage);
    await settled();
    switchTo('3D');
    act(() => viewport().onSelect(['furniture', 'table', 'studio-decoration']));
    const group = original.draft.scene.groups.find(
      (item) => item.id === 'furniture'
    )!;
    expect((screen.getByLabelText('World X') as HTMLInputElement).value).toBe(
      String(group.transform.x)
    );
    const writes = storage.roomWrites();
    changeField('World X', String(group.transform.x + 0.25));
    changeField('World Y', String(group.transform.y + 0.125));
    changeField('Y facing (degrees)', '30');
    changeField('Height scale (%)', '125');
    expect(storage.document()).toEqual(original); // typing is not preview/persistence
    submitForm('Arrange selected noun');
    const scene = setSelectionHeight(
      rotateSelection(
        moveSelection(
          original.draft.scene,
          ['furniture', 'table', 'studio-decoration'],
          { x: 0.25, y: 0.125, z: 0 }
        ),
        ['furniture', 'table', 'studio-decoration'],
        Math.PI / 6 - group.transform.rotationY
      ),
      ['furniture', 'table', 'studio-decoration'],
      1.25
    );
    const numeric = { ...original, draft: { ...original.draft, scene } };
    expect(storage.document()).toEqual(numeric);
    expect(storage.roomWrites()).toBe(writes + 1);
    expect(
      scene.items.find((item) => item.id === 'studio-decoration')
    ).toMatchObject({ parentId: 'furniture', supportId: 'table' });
    const gestureScene = moveSelection(
      viewport().scene,
      viewport().selectedIds,
      { x: 0.5, y: 0, z: -0.25 }
    );
    const beforePreview = storage.bytes.get(ROOM_DRAFT_STORAGE_KEY);
    act(() => viewport().onTransformPreview(gestureScene));
    expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(beforePreview);
    expect(screen.getByText(/^Preview ·/)).not.toBeNull();
    expect((button('Apply Arrange') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('World X') as HTMLInputElement).value).toBe(
      String(Number((group.transform.x + 0.75).toFixed(6)))
    ); // display rounding only; full canonical equality is checked below
    act(() => viewport().onTransformCommit(gestureScene));
    const final = {
      ...numeric,
      draft: { ...numeric.draft, scene: gestureScene },
    };
    expect(storage.document()).toEqual(final);
    expect(storage.roomWrites()).toBe(writes + 2);
    expect(source.worldId).toBe('joined-test-world');
    expect(source.writer!.createComposition).not.toHaveBeenCalled();
    switchTo('Layout');
    fireEvent.click(button('Undo'));
    expect(storage.document()).toEqual(numeric);
    fireEvent.click(button('Undo'));
    expect(storage.document()).toEqual(original);
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button('Redo'));
    expect(storage.document()).toEqual(numeric);
    fireEvent.click(button('Redo'));
    expect(storage.document()).toEqual(final);
    expectCodecs(final);
    mounted.unmount();
    mount(storage);
    await settled();
    expect(storage.document()).toEqual(final);
    switchTo('3D');
    expect(viewport().scene).toEqual(final.draft.scene);
    expect(storage.document().draft.room.propBindings).toEqual(
      original.draft.room.propBindings
    );
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
  });

  it('wall atomic fields, real Layout body drag and positive-Y gizmo rotation traverse the same history and preserve attachment/scope through reload', async () => {
    const original = rotatedSeed();
    const storage = new MemoryStorage(original);
    const mounted = mount(storage);
    await settled();
    fireEvent.click(button('Select'));
    selectWall(storage, original.draft.room.walls![0]);
    const writes = storage.roomWrites();
    changeField('Wall midpoint X', '0.5');
    changeField('Appearance height', '3.5');
    changeField('Appearance elevation', '0.125');
    submitForm('Arrange selected noun');
    const numericWall = setWallAppearance(
      translateWall(original.draft.room.walls![0], { x: 0.5, z: 0 }),
      {
        ...original.draft.room.walls![0].appearance,
        height: 3.5,
        elevation: 0.125,
      }
    );
    const numeric = {
      ...original,
      draft: {
        ...original.draft,
        room: { ...original.draft.room, walls: [numericWall] },
      },
    };
    expect(storage.document()).toEqual(numeric);
    expect(storage.roomWrites()).toBe(writes + 1);
    const midpoint = wallMidpoint(numericWall);
    const start = pointer(storage, midpoint);
    const end = pointer(storage, { x: midpoint.x + 0.25, z: midpoint.z + 0.5 });
    fireEvent.pointerDown(wallHit('studio-wall'), start);
    fireEvent.pointerMove(surface(), end);
    // Layout's SVG gesture preview is local; 3D owner previews below additionally
    // synchronize Arrange. Do not claim a Layout → Arrange preview seam.
    expect(surface().querySelector('[data-wall-feedback]')).not.toBeNull();
    expect(storage.document()).toEqual(numeric);
    fireEvent.pointerUp(surface(), end);
    const dragged = storage.document();
    expect(dragged.draft.room.walls![0].line.start.x).toBeCloseTo(
      numericWall.line.start.x + 0.25,
      12
    );
    expect(dragged.draft.room.walls![0].line.start.z).toBeCloseTo(
      numericWall.line.start.z + 0.5,
      12
    );
    expect(storage.roomWrites()).toBe(writes + 2);
    switchTo('3D');
    const nextWall = previewWallTransform({
      wall: dragged.draft.room.walls![0],
      mode: 'rotate',
      change: { x: 0, z: 0, rotationY: 0.2 },
    });
    act(() => viewport().roomAuthoring!.onWallTransformPreview!(nextWall));
    expect(storage.document()).toEqual(dragged);
    expect(
      Number(
        (screen.getByLabelText('Y facing (degrees)') as HTMLInputElement).value
      )
    ).toBeCloseTo((wallDirectionYaw(nextWall) * 180) / Math.PI, 6);
    act(() => viewport().roomAuthoring!.onWallTransformCommit!(nextWall));
    const final = {
      ...dragged,
      draft: {
        ...dragged.draft,
        room: { ...dragged.draft.room, walls: [nextWall] },
      },
    };
    expect(storage.document()).toEqual(final);
    expect(storage.roomWrites()).toBe(writes + 3);
    expect(final.draft.room.walls![0].openings).toEqual(
      original.draft.room.walls![0].openings
    );
    expect(final.draft.room.doorBindings).toEqual(
      original.draft.room.doorBindings
    );
    expect(final.scope).toEqual(original.scope);
    for (const expected of [dragged, numeric, original]) {
      fireEvent.click(button('Undo'));
      expect(storage.document()).toEqual(expected);
    }
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    for (const expected of [numeric, dragged, final]) {
      fireEvent.click(button('Redo'));
      expect(storage.document()).toEqual(expected);
    }
    expectCodecs(final);
    mounted.unmount();
    mount(storage);
    await settled();
    expect(storage.document()).toEqual(final);
    expect(
      surface().querySelector('[data-rendered-wall-id="studio-wall"]')
    ).not.toBeNull();
  });

  it('untouched rounded fields, default height absence, staged cancellation and fresh actor selection preserve bytes/write count and real history', async () => {
    const original = rotatedSeed();
    const storage = new MemoryStorage(original);
    mount(storage);
    await settled();
    fireEvent.click(button('Select'));
    selectWall(storage, original.draft.room.walls![0]);
    const bytes = storage.bytes.get(ROOM_DRAFT_STORAGE_KEY);
    const writes = storage.roomWrites();
    submitForm('Arrange selected noun');
    changeField('Wall midpoint X', '0');
    submitForm('Arrange selected noun');
    changeField('Wall length', '-');
    submitForm('Arrange selected noun');
    expect(screen.getByRole('alert').textContent).toContain('finite numeric');
    fireEvent.keyDown(screen.getByLabelText('Wall length'), { key: 'Escape' });
    changeField('Wall midpoint X', '1');
    fireEvent.click(button('Cancel Arrange'));
    switchTo('3D');
    act(() => viewport().onSelect(['studio-decoration']));
    changeField('Height scale (%)', '100');
    submitForm('Arrange selected noun');
    expect(
      storage
        .document()
        .draft.scene.items.find((item) => item.id === 'studio-decoration')
    ).not.toHaveProperty('heightScale');
    changeField('World X', '1');
    const late = viewport();
    const lateScene = moved(late.scene);
    act(() =>
      viewport().roomAuthoring!.onSelectActorTarget!({
        kind: 'actor',
        id: original.draft.room.monsterDeclarations[0].id,
      })
    );
    expect(screen.queryByLabelText('World X')).toBeNull();
    expect(screen.getByLabelText('Starting facing')).not.toBeNull();
    act(() => late.onTransformCommit(lateScene));
    fireEvent.keyDown(window, { key: 'r' });
    expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    expect(storage.roomWrites()).toBe(writes);
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    act(() =>
      viewport().roomAuthoring!.onSelectActorTarget!({ kind: 'start' })
    );
    expect(screen.queryByLabelText('Starting facing')).toBeNull();
    changeField('Starting hex q', String(original.draft.room.partyStart!.q));
    submitForm('Arrange selected noun');
    expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    expect(storage.roomWrites()).toBe(writes);
    expectCodecs(storage.document());
  });
});
