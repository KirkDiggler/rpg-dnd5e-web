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
  reshapeWallEndpoint,
  resizeWallLength,
  rotateWall,
  setWallAppearance,
  snapWallPoint,
  translateWall,
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
  changeField('Search wall appearances', search);
  fireEvent.click(
    screen
      .getByRole('group', { name: 'Wall appearance choices' })
      .querySelector(`[data-wall-appearance-ref="${ref}"]`)!
  );
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
    submitForm('Wall exact length');
    wall = resizeWallLength({ wall, endpoint: 'end', length: 8 }).wall;
    expect(storage.document()).toEqual(withWall(states.at(-1)!, wall));
    states.push(storage.document());
    changeField('Wall rotate degrees', '15');
    submitForm('Wall rotation');
    wall = rotateWall(wall, { angle: Math.PI / 12 });
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
    fireEvent.click(button('Dismiss wall controls'));
    selectWall(storage, wall); // unchanged selection does not force controls to reappear
    expect(screen.queryByLabelText('Wall length')).toBeNull();
    fireEvent.click(button('Select')); // explicit reopen
    changeField('Wall move X', '0');
    changeField('Wall move Z', '0');
    submitForm('Wall movement');
    const end = pointer(storage, wall.line.end);
    fireEvent.pointerDown(
      surface().querySelector(`[data-wall-endpoint="end"]`)!,
      end
    );
    fireEvent.pointerMove(surface(), end);
    fireEvent.pointerUp(surface(), end);
    changeField('Wall move X', '999');
    submitForm('Wall movement');
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
    const storage = new MemoryStorage(original);
    const idFactory = (): string => 'unfinished-wall';
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
