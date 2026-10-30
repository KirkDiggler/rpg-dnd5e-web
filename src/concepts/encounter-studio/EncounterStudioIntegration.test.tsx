import { decodeCompositionScene } from '@/compositions/compositionScene';
import type { CompositionSource } from '@/compositions/compositionSource';
import {
  decodeRoomDocumentJson,
  encodeRoomDocument,
} from '@/compositions/roomDocument';
import type { WorldMaterialCatalog } from '@/rendering/worldMaterialCatalog';
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
import { parse as parseYaml } from 'yaml';
import referenceTombYaml from '../../author/fixtures/reference-tomb.yaml?raw';
import { WORLD_BUILDING_CATALOG_BY_REF } from '../world-building/catalog';
import { concealmentHiding } from '../world-building/concealmentEdits';
import { contentWorkspace } from '../world-building/contentGrid';
import frontGoblinOptionsYaml from '../world-building/fixtures/frontGoblinOptions.yaml?raw';
import { nextIntelId } from '../world-building/intelEdits';
import { renameRegion, setRegionLighting } from '../world-building/regionEdits';
import {
  assertRoomDocumentSize,
  cellOwners,
  cellsInWorldRectangle,
  floorCells,
  MAX_FLOOR_HEXES,
  paintCells,
  parseRoomDocumentJson,
  regionCells,
  ROOM_DRAFT_STORAGE_KEY,
  stringifyRoomDraft,
  type RoomDraftDocument,
  type RoomHexCell,
  type RoomRegion,
} from '../world-building/roomDraft';
import {
  finishRoomFixture,
  FIT_WALL_REF,
  GRAY_REF,
} from '../world-building/roomFinishTestFixtures';
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
import { nextFactionId } from '../world-building/sitePolicyEdits';
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
  type WorkspaceBounds,
} from '../world-building/workspaceGeometry';
import { MAX_WORLD_COORD } from '../world-building/worldBounds';
import { WorldBuilderWorkspace } from '../world-building/WorldBuilderWorkspace';
import { WorldBuildingConcept } from '../world-building/WorldBuildingConcept';
import type { WorldBuildingViewportProps } from '../world-building/WorldBuildingViewport';
import { defaultDraftKey, exportDraftYaml, readDraftYaml } from './draftFile';
import { EncounterStudioWorkspace } from './EncounterStudioWorkspace';
import {
  createEmptyCastDocument,
  createGuardCastDocument,
  GUARD,
  SOLDIER,
} from './fixtures/castDocument';
import {
  createCastleKeepDocument,
  KEEP_ROOMS,
  keepRoomCells,
} from './fixtures/castleKeep';
import { createCastleReadBackDocument } from './fixtures/castleReadBack';
import { createCastleS4Document } from './fixtures/castleS4';
import {
  castleRectangleCells,
  createCastleWorkspaceDocument,
} from './fixtures/castleWorkspace';
import {
  createRegionLightingDocument,
  createUnresolvedRegionLightingDocument,
  LIGHTING_REGIONS,
} from './fixtures/regionLighting';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';
import referenceCastleYaml from './fixtures/the-mad-king.yaml?raw';
import {
  clientToWorld,
  createLayoutTransform,
  layoutCellCenter,
  worldToClient,
  type LayoutTransform,
} from './layoutGeometry';
import { LayoutViewport } from './LayoutViewport';
import { cellsBounds, contentBounds } from './overviewFrame';
import type { EncounterStudioSession, StructuralWall } from './studioSession';
import { studioButton } from './studioTestNavigation';
import { StudioWallControls } from './StudioWallControls';

const materialPreview = vi.hoisted(() => ({
  catalog: null as WorldMaterialCatalog | null,
}));
vi.mock('../world-building/useWorldMaterialCatalog', () => ({
  useWorldMaterialCatalog: () => ({
    catalog: materialPreview.catalog,
    status: materialPreview.catalog ? 'ready' : 'unavailable',
    message: 'Candidate preview — scale awaits acceptance.',
  }),
}));
const boundary = vi.hoisted(() => ({
  latest: null as WorldBuildingViewportProps | null,
  /** Canvas mounts stand in for WebGL context creations. */
  mounts: 0,
  frameloop: undefined as string | undefined,
  dpr: undefined as unknown,
  shadows: undefined as unknown,
  element: null as HTMLCanvasElement | null,
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
vi.mock('@react-three/fiber', async (importOriginal) => {
  const { useEffect, useRef } = await import('react');
  return {
    ...(await importOriginal<typeof import('@react-three/fiber')>()),
    Canvas: ({
      children,
      frameloop,
      dpr,
      shadows,
      onCreated,
    }: {
      children: ReactElement<WorldBuildingViewportProps>;
      frameloop?: string;
      dpr?: unknown;
      shadows?: unknown;
      onCreated?: (state: { gl: { domElement: HTMLCanvasElement } }) => void;
    }) => {
      boundary.latest = children.props;
      boundary.frameloop = frameloop;
      boundary.dpr = dpr;
      boundary.shadows = shadows;
      const element = useRef<HTMLCanvasElement>(null);
      useEffect(() => {
        boundary.mounts++;
        boundary.element = element.current;
        onCreated?.({ gl: { domElement: element.current! } });
        // Mount-only, like a real renderer's creation.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return <canvas ref={element} data-testid="webgl-boundary" />;
    },
  };
});
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
/** The authoring gate answers what each test sets; off by default, so a
 * test that is not about Save and Play sends no validate-only preview. */
const gate = vi.hoisted(() => ({
  state: 'gate-off' as 'probing' | 'live' | 'gate-off' | 'unreachable',
  retry: vi.fn(),
}));
vi.mock('@/author/useAuthoringGate', () => ({
  useAuthoringGate: () => ({ state: gate.state, retry: gate.retry }),
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
  gate.state = 'gate-off';
  boundary.latest = null;
  boundary.mounts = 0;
  boundary.frameloop = undefined;
  boundary.element = null;
  materialPreview.catalog = null;
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

it('saves a reusable creature without a position, then places independent looks by map intent', () => {
  const storage = new MemoryStorage(seed());
  const original = storage.document();
  let nextId = 0;
  const mounted = mount(storage, () => `created-${++nextId}`);
  fireEvent.click(button('Encounter'));
  // The inactive map retains the full asset palette. Scope this long journey's
  // queries to the active editor instead of repeatedly walking that hidden DOM.
  const page = within(mounted.container);
  let screen = within(
    page.getByRole('region', { name: 'Encounter configuration' })
  );
  // Cast is the Encounter home's default section. This existing rules-editor
  // regression deliberately enters advanced editing.
  fireEvent.click(screen.getByRole('button', { name: 'Advanced editor' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add a cast member' }));
  fireEvent.change(screen.getByLabelText('Cast member id'), {
    target: { value: 'town_guard' },
  });
  fireEvent.change(screen.getByLabelText('Cast member name'), {
    target: { value: 'Town Guard' },
  });
  fireEvent.change(screen.getByLabelText('CON', { exact: true }), {
    target: { value: '12' },
  });
  fireEvent.change(screen.getByLabelText('Hit dice'), {
    target: { value: '2d8' },
  });
  fireEvent.change(screen.getByLabelText('Armor'), {
    target: { value: 'dnd5e:armor:chain-shirt' },
  });
  fireEvent.change(screen.getByLabelText('Experience'), {
    target: { value: '0' },
  });
  fireEvent.click(screen.getByRole('radio', { name: 'Soldier Male' }));
  expect(storage.document()).toEqual(original);
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  const template = storage.document().scope.templates!.town_guard;
  expect(template).toEqual({
    base: 'dnd5e:monsters:human',
    name: 'Town Guard',
    abilities: { con: 12 },
    hitDice: '2d8',
    armor: 'dnd5e:armor:chain-shirt',
    experience: 0,
  });
  const palette = storage.document().draft.scene.creaturePalette;
  expect(palette).toEqual([
    {
      id: expect.any(String),
      name: 'Town Guard',
      ref: 'dnd5e:monsters:town_guard',
      modelRef: 'dnd5e:npcs:kingdom:soldier-male-01',
    },
  ]);
  expect(storage.document().draft.room.monsterDeclarations).toEqual(
    original.draft.room.monsterDeclarations
  );
  expect(screen.queryByLabelText('Starting hex q')).toBeNull();
  expect(screen.queryByLabelText('Placement look')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Place on map' })).toBeNull();
  fireEvent.click(page.getByRole('button', { name: 'Build' }));
  switchTo('3D');
  fireEvent.click(page.getByRole('button', { name: 'Monsters & NPCs' }));
  const palettePanel = page.getByRole('region', {
    name: 'Monsters and NPCs palette',
  });
  screen = within(palettePanel);
  expect(palettePanel).toBeTruthy();
  expect(
    (screen.getByLabelText('Placement look') as HTMLSelectElement).disabled
  ).toBe(false);
  expect(
    [...screen.getByLabelText('Placement look').querySelectorAll('option')].map(
      (option) => option.value
    )
  ).toEqual(['01', '02', '03', '04']);
  expect(
    [
      ...screen
        .getByLabelText('Placement skin tone')
        .querySelectorAll('option'),
    ].map((option) => option.value)
  ).toEqual(['A', 'B', 'C']);
  for (const [index, [style, skin]] of [
    ['02', 'B'],
    ['04', 'C'],
  ].entries()) {
    fireEvent.change(screen.getByLabelText('Placement look'), {
      target: { value: style },
    });
    fireEvent.change(screen.getByLabelText('Placement skin tone'), {
      target: { value: skin },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Place on map' }));
    expect(viewport().roomAuthoring?.tool).toBe('monster');
    const before = storage.document();
    const click = viewport().roomAuthoring!.onPlaceMonster!;
    act(() => click({ q: index, r: 0 }));
    expect(storage.document().draft.room.monsterDeclarations).toHaveLength(
      before.draft.room.monsterDeclarations.length + 1
    );
    expect(viewport().roomAuthoring?.tool).toBe('select');
    act(() => click({ q: index, r: 0 })); // spent callback cannot place a second actor
    expect(storage.document().draft.room.monsterDeclarations).toHaveLength(
      before.draft.room.monsterDeclarations.length + 1
    );
    expect(palettePanel.isConnected).toBe(true);
    expect(palettePanel.closest('[hidden], [aria-hidden="true"]')).toBeNull();
    expect(
      (screen.getByLabelText('Placement look') as HTMLSelectElement).value
    ).toBe(style);
    expect(
      (screen.getByLabelText('Placement skin tone') as HTMLSelectElement).value
    ).toBe(skin);
  }
  const final = storage.document();
  expect(
    final.draft.room.monsterDeclarations
      .slice(-2)
      .map((actor) => [actor.ref, actor.appearanceRef])
  ).toEqual([
    [
      'dnd5e:monsters:town_guard',
      'dnd5e:npcs:kingdom:soldier-male-01-style-02-b',
    ],
    [
      'dnd5e:monsters:town_guard',
      'dnd5e:npcs:kingdom:soldier-male-01-style-04-c',
    ],
  ]);
  expect(final.draft.scene.creaturePalette).toEqual(palette);
  for (const actor of final.draft.room.monsterDeclarations.slice(-2))
    expect(final.draft.scene.actorNames?.[actor.id]).toBe('Town Guard');
  fireEvent.click(button('Undo'));
  expect(storage.document().draft.room.monsterDeclarations).toHaveLength(
    original.draft.room.monsterDeclarations.length + 1
  );
  expect(storage.document().draft.scene.creaturePalette).toEqual(palette);
  fireEvent.click(button('Redo'));
  expect(storage.document()).toEqual(final);
  expect(final.scope.templates!.town_guard).toEqual(template);
  expect(final.scope.factions).toEqual(original.scope.factions);
  expect(final.draft.room.monsterBindings).toEqual(
    original.draft.room.monsterBindings
  );
  fireEvent.click(screen.getByRole('button', { name: 'Place on map' }));
  const canceled = viewport().roomAuthoring!.onPlaceMonster!;
  fireEvent.click(
    page.getByRole('button', { name: 'Cancel creature placement' })
  );
  act(() => canceled({ q: 0, r: 0 }));
  expect(storage.document()).toEqual(final);
  fireEvent.click(screen.getByRole('button', { name: 'Place on map' }));
  const oldLook = viewport().roomAuthoring!.onPlaceMonster!;
  fireEvent.change(screen.getByLabelText('Placement look'), {
    target: { value: '03' },
  });
  expect(viewport().roomAuthoring?.tool).toBe('select');
  act(() => oldLook({ q: 0, r: 0 }));
  expect(storage.document()).toEqual(final);
  fireEvent.click(screen.getByRole('button', { name: 'Place on map' }));
  const oldTab = viewport().roomAuthoring!.onPlaceMonster!;
  fireEvent.click(
    within(
      page.getByRole('navigation', { name: 'Placement palette' })
    ).getByRole('button', { name: 'Props' })
  );
  act(() => oldTab({ q: 0, r: 0 }));
  expect(storage.document()).toEqual(final);
  mounted.unmount();
  mount(storage);
  expect(storage.document()).toEqual(final);
});

it('the palette lists every cast member, including a rulebook member, and opens the cast', () => {
  const storage = new MemoryStorage(seed());
  const before = storage.document();
  mount(storage);
  switchTo('3D');
  fireEvent.click(screen.getByRole('button', { name: 'Monsters & NPCs' }));
  const palette = within(
    screen.getByRole('region', { name: 'Monsters and NPCs palette' })
  );
  expect(
    within(palette.getByRole('list', { name: 'Cast' }))
      .getAllByRole('button')
      .map((node) => node.textContent)
  ).toEqual(['Goblin', 'Skeleton']);
  // Standard monsters use the existing rules-default appearance.
  expect(palette.getByRole('status').textContent).toBe(
    'Standard monster look.'
  );
  expect(
    (palette.getByRole('button', { name: 'Place on map' }) as HTMLButtonElement)
      .disabled
  ).toBe(false);
  fireEvent.click(palette.getByRole('button', { name: 'Configure creatures' }));
  expect(screen.getByRole('region', { name: 'Cast' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add monster' })).toBeTruthy();
  expect(storage.document()).toEqual(before);
});

it('authors social definitions in Encounter and attaches records to selected creatures and props in the inspector', () => {
  const storage = new MemoryStorage(seed());
  const original = storage.document();
  const recordId = nextIntelId(original.scope);
  const factionId = nextFactionId(original.scope);
  const mounted = mount(storage);
  fireEvent.click(button('Encounter'));
  fireEvent.click(screen.getByRole('button', { name: 'Intel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add intel record' }));
  fireEvent.click(screen.getByLabelText(`Intel ${recordId}`));
  fireEvent.change(
    screen.getByLabelText(`Intel reveals fact for ${recordId}`),
    { target: { value: 'orders-authentic' } }
  );
  const idInput = screen.getByLabelText(`Intel id for ${recordId}`);
  fireEvent.change(idInput, { target: { value: 'orders' } });
  fireEvent.change(idInput, { target: { value: 'orders-letter' } });
  expect(
    storage.document().scope.intel?.some((record) => record.id === recordId)
  ).toBe(true);
  fireEvent.click(
    within(screen.getByTestId(`intel-row-${recordId}`)).getByRole('button', {
      name: 'Apply intel name',
    })
  );
  expect(storage.document().scope.intel).toContainEqual({
    id: 'orders-letter',
    reveals: { fact: 'orders-authentic' },
  });

  fireEvent.click(screen.getByRole('button', { name: 'Factions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add faction' }));
  fireEvent.click(screen.getByLabelText(`Faction ${factionId}`));
  const factionInput = screen.getByLabelText(`Faction id for ${factionId}`);
  fireEvent.change(factionInput, { target: { value: 'castle-watch' } });
  fireEvent.blur(factionInput);
  fireEvent.click(screen.getByLabelText('Faction castle-watch'));
  const mind = screen.getByLabelText('Mind for castle-watch');
  expect(
    document
      .getElementById(mind.getAttribute('list')!)
      ?.querySelector('option[value="goblin-1"]')
  ).not.toBeNull();
  fireEvent.change(mind, { target: { value: 'goblin-1' } });

  fireEvent.click(screen.getByRole('button', { name: 'Dispositions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add disposition' }));
  const newPair = screen
    .getAllByTestId('disposition-goblins-party')
    .at(-1)! as HTMLDetailsElement;
  newPair.open = true;
  fireEvent.change(within(newPair).getByLabelText('Between first faction'), {
    target: { value: 'castle-watch' },
  });
  expect(newPair.isConnected).toBe(true);
  expect(newPair.open).toBe(true);
  const relation = within(screen.getByTestId('disposition-castle-watch-party'));
  fireEvent.change(relation.getByLabelText('Stance'), {
    target: { value: 'neutral' },
  });
  fireEvent.change(relation.getByLabelText('Until form'), {
    target: { value: 'fact' },
  });
  fireEvent.change(relation.getByLabelText('Until fact'), {
    target: { value: 'orders-authentic' },
  });

  fireEvent.click(button('Build'));
  switchTo('3D');
  act(() =>
    viewport().roomAuthoring!.onSelectActorTarget!({
      kind: 'actor',
      id: 'goblin-1',
    })
  );
  fireEvent.change(screen.getByLabelText('Creature faction'), {
    target: { value: 'castle-watch' },
  });
  fireEvent.change(screen.getByLabelText('Give intel record'), {
    target: { value: 'orders-letter' },
  });
  expect(
    storage.document().draft.room.monsterBindings?.['goblin-1']
  ).toMatchObject({ faction: 'castle-watch', holds: ['orders-letter'] });
  expect(storage.document().draft.room.monsterDeclarations).toEqual(
    original.draft.room.monsterDeclarations
  );
  expect(
    screen.getByRole('region', { name: 'Authored dispositions' }).textContent
  ).toContain('orders-authentic');
  fireEvent.click(
    screen.getByRole('button', { name: 'Edit intel definitions' })
  );
  expect(
    screen.getByRole('region', { name: 'Intel definitions' })
  ).toBeTruthy();
  expect(
    screen.getByTestId('intel-held-by-orders-letter').textContent
  ).toContain('goblin-1');

  fireEvent.click(button('Build'));
  act(() => viewport().onSelect(['table']));
  fireEvent.change(screen.getByLabelText('Give table an intel record'), {
    target: { value: 'orders-letter' },
  });
  const attached = storage.document();
  expect(attached.draft.room.propBindings?.table.holds).toEqual([
    'studio-map',
    'orders-letter',
  ]);
  expect(attached.draft.scene).toEqual(original.draft.scene);
  fireEvent.click(button('Undo'));
  expect(storage.document().draft.room.propBindings?.table.holds).toEqual([
    'studio-map',
  ]);
  fireEvent.click(button('Redo'));
  expect(storage.document()).toEqual(attached);
  act(() => viewport().onSelect(['table']));
  fireEvent.click(
    screen.getByRole('button', { name: 'Edit intel definitions' })
  );
  expect(
    screen.getByTestId('intel-held-by-orders-letter').textContent
  ).toContain('table');
  expect(storage.document().scope.dispositions).toContainEqual({
    between: ['castle-watch', 'party'],
    stance: 'neutral',
    until: { fact: 'orders-authentic' },
  });
  expect(storage.document().scope.concealments).toEqual(
    original.scope.concealments
  );
  mounted.unmount();
  mount(storage);
  expect(storage.document()).toEqual(attached);
});

it('authors the front room goblin’s two lines, and emits the engine’s own options block', () => {
  // THE FRONT ROOM'S GOBLIN, authored through the studio from nothing
  // (rpg-project#569 U1). The seed's goblin carries the engine example's line;
  // it is cleared so every key below is one the studio wrote.
  const document = seed();
  const goblin = document.draft.room.monsterBindings!['goblin-1'];
  delete goblin.options;
  const storage = new MemoryStorage(
    parseRoomDocumentJson(stringifyRoomDraft(document.draft, document.scope))
  );
  mount(storage);
  fireEvent.click(button('Build'));
  switchTo('3D');
  act(() =>
    viewport().roomAuthoring!.onSelectActorTarget!({
      kind: 'actor',
      id: 'goblin-1',
    })
  );
  const label = (text: string) => screen.getByLabelText(text);
  const set = (text: string, value: string, index = 0) =>
    fireEvent.change(screen.getAllByLabelText(text)[index], {
      target: { value },
    });
  const line1 = 'line 1 of goblin-1';
  const line2 = 'line 2 of goblin-1';

  // Line 1 — lean on it: Intimidation DC 12.
  fireEvent.click(label('Add a line to goblin-1'));
  set('Line 1 id for goblin-1', 'lean-on-it');
  set('Line 1 for goblin-1', "Where's the cellar? Tell me or you're next.");
  set(`Ability for approach 0 of ${line1}`, 'intimidation');
  set(`DC for approach 0 of ${line1}`, '12');
  fireEvent.click(label(`Add success row to ${line1}`));
  set(`Weight for ${line1} success entry`, '70');
  set(
    `Say (optional) for ${line1} success entry`,
    "Fine! FINE. The cellar door is behind the barrels. Just don't."
  );
  set(`Do for ${line1} success entry`, 'fact');
  set(`fact for ${line1} success entry`, 'goblin-cowed');
  fireEvent.click(label(`Add success row to ${line1}`));
  set(`Weight for ${line1} success entry`, '30', 1);
  set(`Say (optional) for ${line1} success entry`, 'Boss! BOSS!', 1);
  set(`Do for ${line1} success entry`, 'flee', 1);
  fireEvent.click(label(`Add failure row to ${line1}`));
  set(
    `Say (optional) for ${line1} failure entry`,
    'Big talk, for someone standing in my doorway.'
  );

  // Line 2 — talk it round: Persuasion DC 10, which is where a line starts.
  fireEvent.click(label('Add a line to goblin-1'));
  set('Line 2 id for goblin-1', 'talk-it-round');
  set(
    'Line 2 for goblin-1',
    "We're not here for you. Where did the bandits go?"
  );
  fireEvent.click(label(`Add success row to ${line2}`));
  set(
    `Say (optional) for ${line2} success entry`,
    'Bandits took the cellar. Go left at the rope, and mind the third step.'
  );
  fireEvent.click(label(`Add failure row to ${line2}`));
  set(`Weight for ${line2} failure entry`, '100');
  set(
    `Say (optional) for ${line2} failure entry`,
    "Cellar's empty, friend. Nothing down there but rats. Straight on through."
  );
  set(`Do for ${line2} failure entry`, 'fact');
  set(`fact for ${line2} failure entry`, 'cellar-is-clear');

  // The EMITTED document carries the engine's own block, key for key: the
  // fixture is a verbatim copy of the toolkit golden's `front-goblin` options.
  const authored = storage.document();
  const emitted = encodeSingleRoomDungeon({
    key: 'front-room',
    draft: authored.draft,
    ...authored.scope,
  });
  const engine = parseYaml(frontGoblinOptionsYaml) as { options: unknown };
  expect(
    parseYaml(emitted).room.room.monsterBindings['goblin-1'].options
  ).toEqual(engine.options);
  // And nothing else on the goblin moved.
  const rest = { ...authored.draft.room.monsterBindings!['goblin-1'] };
  delete rest.options;
  expect(rest).toEqual(goblin);
  // ~13s alone at the base revision; the default 15s limit trips under full-suite load.
}, 30000);

it('requires explicit prop declaration before attaching intel and scopes controls to one selection', () => {
  const storage = new MemoryStorage(seed());
  mount(storage);
  switchTo('3D');
  act(() => viewport().onSelect(['studio-decoration']));
  expect(
    screen.queryByLabelText('Give studio-decoration an intel record')
  ).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Add authored footprint' })
  );
  fireEvent.change(
    screen.getByLabelText('Give studio-decoration an intel record'),
    { target: { value: 'studio-map' } }
  );
  expect(
    storage.document().draft.room.propBindings?.['studio-decoration']?.holds
  ).toEqual(['studio-map']);
  act(() => viewport().onSelect(['studio-decoration', 'table']));
  expect(
    screen.queryByLabelText('Give studio-decoration an intel record')
  ).toBeNull();
  expect(screen.queryByLabelText('Give table an intel record')).toBeNull();
});

it('names an older creature and moves it once without changing its rules, looks or bindings', () => {
  const storage = new MemoryStorage(seed());
  const before = storage.document();
  const id = before.draft.room.monsterDeclarations[0].id;
  const mounted = mount(storage);
  switchTo('3D');
  act(() =>
    viewport().roomAuthoring!.onSelectActorTarget!({ kind: 'actor', id })
  );
  fireEvent.change(screen.getByLabelText('Map name'), {
    target: { value: 'Standard Guard' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(storage.document().draft.scene.actorNames?.[id]).toBe(
    'Standard Guard'
  );
  expect(
    within(screen.getByRole('region', { name: 'Inspector' })).getByRole(
      'heading',
      { level: 2, name: 'Standard Guard' }
    )
  ).toBeTruthy();
  const named = storage.document();
  fireEvent.click(screen.getByRole('button', { name: 'Move creature' }));
  expect(viewport().roomAuthoring?.tool).toBe('move');
  const move = viewport().roomAuthoring!.onMoveMonster!;
  act(() => move(id, { q: 2, r: 1 }));
  const moved = storage.document();
  expect(moved.draft.room.monsterDeclarations[0]).toEqual({
    ...before.draft.room.monsterDeclarations[0],
    startingCell: {
      ...before.draft.room.monsterDeclarations[0].startingCell,
      location: { q: 2, r: 1 },
    },
  });
  expect(moved.draft.room.monsterBindings).toEqual(
    before.draft.room.monsterBindings
  );
  expect(moved.draft.scene).toEqual(named.draft.scene);
  expect(moved.scope).toEqual(before.scope);
  expect(viewport().roomAuthoring?.tool).toBe('select');
  act(() => move(id, { q: -1, r: 0 }));
  expect(storage.document()).toEqual(moved);
  fireEvent.click(screen.getByRole('button', { name: 'Move creature' }));
  const canceled = viewport().roomAuthoring!.onMoveMonster!;
  fireEvent.click(screen.getByRole('button', { name: 'Cancel creature move' }));
  act(() => canceled(id, { q: -1, r: 0 }));
  expect(storage.document()).toEqual(moved);
  fireEvent.click(button('Undo'));
  expect(storage.document()).toEqual(named);
  fireEvent.click(button('Redo'));
  expect(storage.document()).toEqual(moved);
  mounted.unmount();
  mount(storage);
  expect(storage.document()).toEqual(moved);
});

/** A saved region wall finish, written straight into the document: no edit
 * can choose one, because no region is wall-bound (rpg-project#725). */
const CARRIED_FINISH = {
  materialRef: GRAY_REF,
  patternStart: {
    incoming: { wallId: 'west', direction: 'end-to-start' as const },
    outgoing: { wallId: 'north', direction: 'start-to-end' as const },
  },
};
function installFinishPreview(): { smallRef: string } {
  const asset = WORLD_BUILDING_CATALOG_BY_REF.get(FIT_WALL_REF)!;
  if (asset.source !== 'generated') throw new Error('Expected fit wall.');
  const image = {
    url: '/test.png',
    sha256: 'a'.repeat(64),
    sizeBytes: 10,
    width: 1,
    height: 1,
  };
  const material = {
    ref: GRAY_REF,
    displayName: 'Large gray masonry',
    family: 'masonry',
    baseColor: image,
    normal: image,
    repeatMeters: [3.3, 3.3] as [number, number],
    normalScale: [1, 1] as [number, number],
    roughness: 0.5,
    metalness: 0,
  };
  const smallRef = 'dnd5e:material:test:small_gray';
  materialPreview.catalog = {
    kind: 'candidate',
    catalogSha256: 'a'.repeat(64),
    materials: [
      material,
      { ...material, ref: smallRef, displayName: 'Small gray masonry' },
    ],
    surfaces: [
      {
        assetRef: FIT_WALL_REF,
        glbSha256: asset.asset.glbSha256,
        bindings: [
          {
            id: 'front',
            node: 'WallBody_v1',
            material: 'Masonry_Front',
            side: 'positive-z',
            family: 'masonry',
          },
          {
            id: 'back',
            node: 'WallBody_v1',
            material: 'Masonry_Back',
            side: 'negative-z',
            family: 'masonry',
          },
        ],
      },
    ],
  };
  return { smallRef };
}

function seed(emptyFloor = false): RoomDraftDocument {
  const document = createPopulatedStudioDocument();
  if (emptyFloor)
    document.draft.room.regions = document.draft.room.regions.map((region) => ({
      ...region,
      cells: [],
    }));
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
  return studioButton(name);
}
function switchTo(name: 'Layout' | '3D'): void {
  fireEvent.click(button(name));
}
function surface(): SVGSVGElement {
  return screen.getByRole('application', {
    name: 'Layout floor surface',
  }) as unknown as SVGSVGElement;
}
/** The grid is derived from the content (rpg-project#725 R3), so the
 * surface's fit extent moves as content grows: read it from the cells the
 * surface actually draws, the live presentation, not a stored workspace. */
function drawnExtent(): WorkspaceBounds | null {
  const drawn = document.querySelectorAll(
    '[aria-label="Layout floor surface"] polygon[data-cell]'
  );
  if (drawn.length === 0) return null;
  const extent = {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  };
  for (const node of drawn)
    for (const pair of node.getAttribute('points')!.split(' ')) {
      const [x, z] = pair.split(',').map(Number);
      extent.minX = Math.min(extent.minX, x);
      extent.maxX = Math.max(extent.maxX, x);
      extent.minZ = Math.min(extent.minZ, z);
      extent.maxZ = Math.max(extent.maxZ, z);
    }
  return extent;
}
/** THE LAYOUT'S OWN TRANSFORM, rebuilt from the frame it draws with. Zoom is
 * relative to the derived grid's fit and the view rescales it as the grid
 * grows, so the map holds still on screen (rpg-project#725 R3): a helper
 * that assumed zoom 1 fits the current grid would drift after the first
 * commit. The surface publishes its live frame; the transform is rebuilt
 * with the production function so pointer round trips are exact. A retired
 * (hidden) surface keeps the transform it last drew. */
let lastDrawn: LayoutTransform | null = null;
function drawnTransform(
  extent: WorkspaceBounds | null = drawnExtent()
): LayoutTransform {
  const svg = document.querySelector('.encounter-studio-layout');
  if (svg && extent && svg.hasAttribute('data-frame-zoom')) {
    lastDrawn = createLayoutTransform(
      bounds,
      {
        center: {
          x: Number(svg.getAttribute('data-frame-x')),
          z: Number(svg.getAttribute('data-frame-z')),
        },
        zoom: Number(svg.getAttribute('data-frame-zoom')),
      },
      extent
    );
  }
  if (!lastDrawn) throw new Error('Layout has never drawn a transform.');
  return lastDrawn;
}
function toClient(
  world: WorldPoint,
  extent?: WorkspaceBounds
): { clientX: number; clientY: number } {
  const point = worldToClient(world, drawnTransform(extent))!;
  return { clientX: point.x, clientY: point.y };
}
/** The fit extent exactly as the Layout computes it, from the document. */
function documentFit(storage: MemoryStorage): WorkspaceBounds {
  return workspaceBounds(contentWorkspace(storage.document().draft));
}
function at(cell: RoomHexCell): { clientX: number; clientY: number } {
  return toClient(layoutCellCenter(cell));
}
const zero = { q: 0, r: 0 };
const one = { q: 1, r: 0 };
const two = { q: 2, r: 0 };
function gesture(first: RoomHexCell, last = first): void {
  // Floor fixtures explicitly arm Paint now that Build starts in Select.
  if (
    screen.queryByRole('button', { name: 'Paint' }) &&
    screen
      .getByRole('button', { name: 'Select' })
      .getAttribute('aria-pressed') === 'true'
  )
    fireEvent.click(button('Paint'));
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
  // The floor is the regions' cells (rpg-project#725): compare every region's
  // identity, name and lighting, not the cells a floor edit moved.
  return {
    ...document,
    draft: {
      ...document.draft,
      room: {
        ...document.draft.room,
        regions: document.draft.room.regions.map((region) => ({
          ...region,
          cells: [],
        })),
      },
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

describe('two-wall corner snaps through the real owner', () => {
  it('previews both perpendicular ends and commits one preserved document/Undo step', () => {
    const doc = seed();
    const first = doc.draft.room.walls![0];
    first.line = { start: { x: 0.1, z: 8 }, end: { x: 0.1, z: 0.12 } };
    first.blocker.footprint.width = 7.88;
    doc.draft.room.walls!.push({
      ...structuredClone(first),
      id: 'near-corner',
      openings: [],
      line: { start: { x: 0.18, z: 0.05 }, end: { x: 8, z: 0.05 } },
      blocker: {
        ...first.blocker,
        footprint: { ...first.blocker.footprint, width: 7.82 },
      },
    });
    const storage = new MemoryStorage(doc);
    mount(storage);
    const before = storage.document();
    selectWall(storage, before.draft.room.walls![0]);
    const writes = storage.roomWrites();
    const handle = surface().querySelector('[data-wall-endpoint="end"]')!;
    expect(handle.querySelector('title')?.textContent).toContain('End · X');
    expect(surface().querySelector('[data-wall-direction]')).not.toBeNull();
    fireEvent.pointerDown(handle, pointer(storage, first.line.end));
    fireEvent.pointerMove(surface(), pointer(storage, { x: 0.12, z: 0.07 }));
    expect(
      surface().querySelector(
        '[data-wall-feedback="Joined corner · both ends"]'
      )
    ).not.toBeNull();
    const other = surface().querySelector(
      '[data-rendered-wall-id="near-corner"] [data-wall-span]'
    )!;
    const end = surface().querySelector('[data-wall-endpoint="end"]')!;
    expect(other.getAttribute('x1')).toBe(end.getAttribute('cx'));
    expect(other.getAttribute('y1')).toBe(end.getAttribute('cy'));
    expect(storage.roomWrites()).toBe(writes);
    fireEvent.pointerUp(surface(), pointer(storage, { x: 0.12, z: 0.07 }));
    const after = storage.document();
    expect(after.draft.room.walls![0].line.end).toEqual({ x: 0.1, z: 0.05 });
    expect(after.draft.room.walls![1].line.start).toEqual({ x: 0.1, z: 0.05 });
    expect(after.draft.room.walls![0].line.start).toEqual(first.line.start);
    expect(after.draft.scene).toEqual(before.draft.scene);
    expect(after.scope).toEqual(before.scope);
    expect(after.draft.room.doorBindings).toEqual(
      before.draft.room.doorBindings
    );
    expect(storage.roomWrites()).toBe(writes + 1);
    fireEvent.click(button('Undo'));
    expect(storage.document()).toEqual(before);
    fireEvent.click(button('Redo'));
    expect(storage.document()).toEqual(after);
  });
});

describe('right-angle wall editing through the real owner', () => {
  it('joins a rotated guide, previews then commits once, and preserves the document through Undo/Redo', () => {
    const doc = seed();
    doc.draft.room.walls![0].line = {
      start: { x: -6, z: -8 },
      end: { x: 0, z: 0 },
    };
    doc.draft.room.walls![0].blocker.footprint.width = 10;
    const storage = new MemoryStorage(doc);
    mount(storage);
    const before = storage.document();
    fireEvent.click(button('Wall'));
    chooseAppearance(castleWallRef, 'castle_wall_01');
    const writes = storage.roomWrites();
    fireEvent.click(screen.getByLabelText('Right angles'));
    expect(storage.roomWrites()).toBe(writes);
    fireEvent.pointerDown(surface(), pointer(storage, { x: 0, z: 0 }));
    fireEvent.pointerMove(surface(), pointer(storage, { x: -4.2, z: 3.1 }));
    expect(
      surface()
        .querySelector('[data-wall-feedback]')
        ?.getAttribute('data-wall-feedback')
    ).toContain('perpendicular');
    expect(storage.roomWrites()).toBe(writes);
    fireEvent.pointerUp(surface(), pointer(storage, { x: -4.2, z: 3.1 }));
    const after = storage.document();
    expect(after.draft.room.walls).toHaveLength(
      before.draft.room.walls!.length + 1
    );
    const added = after.draft.room.walls!.at(-1)!;
    expect(added.line.start).toEqual({ x: 0, z: 0 });
    expect(added.line.end.x * 6 + added.line.end.z * 8).toBeCloseTo(0, 12);
    expect(after.draft.room.walls![0]).toEqual(before.draft.room.walls![0]);
    expect(after.draft.room.doorBindings).toEqual(
      before.draft.room.doorBindings
    );
    expect(after.draft.scene).toEqual(before.draft.scene);
    expect(after.scope).toEqual(before.scope);
    expect(storage.roomWrites()).toBe(writes + 1);
    fireEvent.click(button('Undo'));
    expect(storage.document()).toEqual(before);
    fireEvent.click(button('Redo'));
    expect(storage.document()).toEqual(after);
  });
});

describe('Studio authoring homes through the real owner', () => {
  it('fences hidden 3D mutations and old callbacks across homes while table commits still use shared history', () => {
    const storage = new MemoryStorage(seed());
    let session!: EncounterStudioSession;
    const owner = (home: 'build' | 'encounter') => (
      <WorldBuildingConcept
        roomMode
        compositionSource={source}
        storage={storage}
        studioPresentation={{
          home,
          view: '3d',
          render: (next) => {
            session = next;
            return null;
          },
        }}
      />
    );
    const mounted = render(owner('build'));
    act(() =>
      session.viewportProps.onSelect([session.document.draft.scene.items[0].id])
    );
    const oldViewport = session.viewportProps;
    const before = session.document;
    const writes = storage.roomWrites();
    const nextScene = moved(before.draft.scene);
    mounted.rerender(owner('encounter'));
    for (const event of [
      { key: 'Delete' },
      { key: 'r' },
      { key: 'd', ctrlKey: true },
    ])
      fireEvent.keyDown(window, event);
    act(() => {
      oldViewport.onTransformCommit(nextScene);
      session.viewportProps.onTransformCommit(nextScene);
      expect(session.commitFloor([one], 'paint')).toBe(false);
    });
    expect(session.document).toBe(before);
    expect(storage.roomWrites()).toBe(writes);
    mounted.rerender(owner('build'));
    act(() => oldViewport.onTransformCommit(nextScene));
    expect(session.document).toBe(before);
    mounted.rerender(owner('encounter'));
    act(() => expect(session.commitTables({ patrol: {} })).toBe(true));
    expect(session.document.scope.tables).toEqual({ patrol: {} });
    expect(session.document.draft).toEqual(before.draft);
    act(() => session.undo());
    expect(session.document).toEqual(before);
  });

  // Rewritten (rpg-project#725): regions are their cells and name no wall
  // face, so a region wall finish can no longer be chosen or applied; a
  // carried finish is shown, kept through YAML and reload, and never edited.
  it('carries a saved region wall finish it cannot choose or apply, through YAML and reload', () => {
    installFinishPreview();
    const fixture = finishRoomFixture(true);
    const carried = CARRIED_FINISH;
    const storage = new MemoryStorage({
        draft: {
          ...fixture,
          scene: {
            ...fixture.scene,
            version: 6,
            regionPresentation: { left: { wallFinish: carried } },
          },
        },
        scope: {},
      }),
      mounted = mount(storage),
      before = storage.document();
    expect(before.draft.scene.regionPresentation).toEqual({
      left: { wallFinish: carried },
    });
    const writes = storage.roomWrites();
    fireEvent.click(button('Regions'));
    fireEvent.click(button('Edit region Left'));
    const masonry = (): HTMLSelectElement =>
      screen.getByLabelText('Room masonry') as HTMLSelectElement;
    expect(masonry().value).toBe(GRAY_REF);
    expect(masonry().disabled).toBe(true);
    fireEvent.click(button('Edit region Right'));
    expect(masonry().value).toBe('');
    expect(masonry().disabled).toBe(true);
    expect(storage.document()).toEqual(before);
    expect(storage.roomWrites()).toBe(writes);
    const decoded = decodeSingleRoomDungeon(
      encodeSingleRoomDungeon({
        key: 'finish-walk',
        draft: before.draft,
        ...before.scope,
      })
    );
    expect(decoded.draft.scene.regionPresentation).toEqual(
      before.draft.scene.regionPresentation
    );
    mounted.unmount();
    mount(storage);
    expect(storage.document()).toEqual(before);
    fireEvent.click(button('Regions'));
    fireEvent.click(button('Edit region Left'));
    expect(masonry().value).toBe(GRAY_REF);
  });

  it('refuses an incompatible staged appearance and finish as one transaction, then accepts correction without losing staged inputs', () => {
    installFinishPreview();
    const draft = finishRoomFixture();
    delete draft.scene.mapLabels;
    draft.room.walls = [draft.room.walls![0]];
    const storage = new MemoryStorage({ draft, scope: {} });
    mount(storage);
    const before = storage.document();
    selectWall(storage, before.draft.room.walls![0]);
    const writes = storage.roomWrites();
    fireEvent.change(screen.getByLabelText('Appearance height'), {
      target: { value: '4' },
    });
    fireEvent.change(screen.getByLabelText('Wall finish (both sides)'), {
      target: { value: GRAY_REF },
    });
    fireEvent.click(button('Change wall appearance'));
    const form = screen.getByRole('form', { name: 'Arrange selected noun' });
    fireEvent.click(
      within(form).getByTitle('dnd5e:env:dark-fortress:45_wall_01')
    );
    fireEvent.click(button('Apply'));
    // This must reach compatibility refusal, not an unrelated schema/asset guard.
    expect(
      screen.getByText(/has no compatible A face for this finish/)
    ).toBeTruthy();
    expect(storage.document()).toEqual(before);
    expect(storage.roomWrites()).toBe(writes);
    expect(
      (screen.getByLabelText('Appearance height') as HTMLInputElement).value
    ).toBe('4');
    fireEvent.click(within(form).getByTitle(FIT_WALL_REF));
    fireEvent.click(button('Apply'));
    expect(storage.roomWrites()).toBe(writes + 1);
    expect(storage.document().draft.room.walls![0].appearance.height).toBe(4);
    expect(storage.document().draft.scene.wallFinishes!.north).toEqual({
      'positive-z': GRAY_REF,
      'negative-z': GRAY_REF,
    });
  });

  it('sets a standalone wall on both sides by default, stages geometry and finishes atomically, and preserves separate faces through Undo/reload', () => {
    const { smallRef } = installFinishPreview(),
      draft = finishRoomFixture();
    delete draft.scene.mapLabels;
    draft.room.walls = [draft.room.walls![0]];
    const storage = new MemoryStorage({ draft, scope: {} }),
      mounted = mount(storage),
      before = storage.document();
    selectWall(storage, before.draft.room.walls![0]);
    const mode = () =>
      screen.getByLabelText('Set sides separately') as HTMLInputElement;
    expect(mode().checked).toBe(false);
    expect(screen.getByLabelText('Wall side A')).toBeTruthy();
    expect(screen.getByLabelText('Wall side B')).toBeTruthy();
    const writes = storage.roomWrites();
    fireEvent.change(screen.getByLabelText('Wall finish (both sides)'), {
      target: { value: GRAY_REF },
    });
    fireEvent.change(screen.getByLabelText('Appearance height'), {
      target: { value: '4' },
    });
    expect(storage.document()).toEqual(before);
    expect(storage.roomWrites()).toBe(writes);
    fireEvent.click(button('Cancel'));
    expect(storage.document()).toEqual(before);
    fireEvent.change(screen.getByLabelText('Wall finish (both sides)'), {
      target: { value: GRAY_REF },
    });
    fireEvent.change(screen.getByLabelText('Appearance height'), {
      target: { value: '4' },
    });
    fireEvent.click(button('Apply'));
    const both = storage.document();
    expect(storage.roomWrites()).toBe(writes + 1);
    expect(both.draft.scene.version).toBe(7);
    expect(both.draft.scene.regionPresentation).toBeUndefined();
    expect(both.draft.scene.wallFinishes!.north).toEqual({
      'positive-z': GRAY_REF,
      'negative-z': GRAY_REF,
    });
    expect(both.draft.room.walls![0].appearance.height).toBe(4);
    expect(both.draft.room.walls![0].blocker).toEqual(
      before.draft.room.walls![0].blocker
    );
    switchTo('3D');
    const previewWall = {
      ...both.draft.room.walls![0],
      line: { start: { x: 0, z: 0 }, end: { x: 10, z: 0 } },
    };
    act(() => viewport().roomAuthoring!.onWallTransformPreview!(previewWall));
    expect(
      viewport().roomAuthoring!.roomFinishes!.spans.map((span) => span.end)
    ).toEqual([10, 10]);
    expect(storage.document()).toEqual(both);
    act(() => viewport().roomAuthoring!.onWallTransformPreview!(null));
    expect(
      viewport().roomAuthoring!.roomFinishes!.spans.map((span) => span.end)
    ).toEqual([8, 8]);
    switchTo('Layout');
    fireEvent.click(mode());
    expect(storage.document()).toEqual(both);
    fireEvent.change(screen.getByLabelText('Side B finish'), {
      target: { value: smallRef },
    });
    fireEvent.click(button('Apply'));
    const split = storage.document();
    expect(split.draft.scene.wallFinishes!.north).toEqual({
      'positive-z': GRAY_REF,
      'negative-z': smallRef,
    });
    const splitWrites = storage.roomWrites();
    fireEvent.click(mode());
    expect(
      (screen.getByLabelText('Wall finish (both sides)') as HTMLSelectElement)
        .value
    ).toBe('__mixed__');
    fireEvent.click(button('Apply'));
    expect(storage.document()).toEqual(split);
    expect(storage.roomWrites()).toBe(splitWrites);
    fireEvent.click(mode());
    fireEvent.change(screen.getByLabelText('Side B finish'), {
      target: { value: '' },
    });
    fireEvent.click(button('Apply'));
    expect(storage.document().draft.scene.wallFinishes!.north).toEqual({
      'positive-z': GRAY_REF,
    });
    fireEvent.click(button('Undo'));
    expect(storage.document()).toEqual(split);
    fireEvent.click(button('Remove wall'));
    expect(storage.document().draft.scene.wallFinishes).toBeUndefined();
    fireEvent.click(button('Undo'));
    expect(storage.document()).toEqual(split);
    const yaml = encodeSingleRoomDungeon({
      key: 'wall-overrides',
      draft: split.draft,
      ...split.scope,
    });
    expect(decodeSingleRoomDungeon(yaml).draft.scene.wallFinishes).toEqual(
      split.draft.scene.wallFinishes
    );
    mounted.unmount();
    mount(storage);
    selectWall(storage, storage.document().draft.room.walls![0]);
    expect(mode().checked).toBe(true);
    expect(
      (screen.getByLabelText('Side B finish') as HTMLSelectElement).value
    ).toBe(smallRef);
    fireEvent.click(button('Use region / authored defaults'));
    expect(storage.document()).toEqual(split);
    fireEvent.click(button('Apply'));
    expect(storage.document().draft.scene.wallFinishes).toBeUndefined();
    expect(storage.document().draft.scene.version).toBe(7);
  });

  // Rewritten (rpg-project#725): a region is no longer a label's area with a
  // background light; its view edits its own lighting intensity.
  it("a region's view edits its lighting through one intent", () => {
    const storage = new MemoryStorage(createRegionLightingDocument(false));
    mount(storage);
    const before = storage.document();
    const writes = storage.roomWrites();
    expect(button('Select').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button('Edit region left'));
    const inspector = within(screen.getByRole('region', { name: 'Inspector' }));
    expect(inspector.getByRole('region', { name: 'Region' })).toBeTruthy();
    fireEvent.change(inspector.getByLabelText('Lighting (%)'), {
      target: { value: '25' },
    });
    fireEvent.click(inspector.getByRole('button', { name: 'Apply' }));
    expect(storage.document()).toEqual({
      ...before,
      draft: setRegionLighting(before.draft, LIGHTING_REGIONS.left, 0.25),
    });
    expect(storage.roomWrites()).toBe(writes + 1);
    expect(
      (inspector.getByLabelText('Lighting (%)') as HTMLInputElement).value
    ).toBe('25');
    fireEvent.click(button('Undo'));
    expect(storage.document()).toEqual(before);
  });
});

describe('Studio configuration tables through the real owner', () => {
  it('authors multiple rows, preserves unrelated data, shares Undo/Redo and reloads in either view', () => {
    const doc = seed();
    delete doc.scope.tables;
    const storage = new MemoryStorage(doc);
    const mounted = mount(storage);
    const baseline = storage.document();
    fireEvent.click(button('Tables'));
    fireEvent.click(button('Add table'));
    expect(storage.document().scope.tables).toEqual({ 'table-1': {} });
    fireEvent.click(screen.getByLabelText('Table table-1'));
    fireEvent.change(screen.getByLabelText('Table id for table-1'), {
      target: { value: 'patrol' },
    });
    fireEvent.click(button('Apply table name'));
    fireEvent.click(screen.getByLabelText('Table patrol'));
    fireEvent.click(button('Add entry on time to patrol'));
    fireEvent.click(button('Add entry on time to patrol'));
    expect(storage.document().scope.tables?.patrol.time).toHaveLength(2);
    const declared = storage.document();
    expect(declared.draft).toEqual(baseline.draft);
    expect({ ...declared.scope, tables: undefined }).toEqual({
      ...baseline.scope,
      tables: undefined,
    });
    fireEvent.click(button('Undo'));
    expect(storage.document().scope.tables?.patrol.time).toHaveLength(1);
    fireEvent.click(button('Redo'));
    expect(storage.document()).toEqual(declared);
    fireEvent.click(button('Build'));
    switchTo('3D');
    fireEvent.click(button('Encounter'));
    expect(
      screen.getByRole('region', { name: 'Encounter configuration' })
    ).toBeTruthy();
    expect(storage.document()).toEqual(declared);
    mounted.unmount();
    mount(storage);
    fireEvent.click(button('Tables'));
    expect(screen.getByLabelText('Table patrol')).toBeTruthy();
    expect(storage.document()).toEqual(declared);
  });

  it('table intents preserve absence on no-op and reject a captured stale snapshot', () => {
    const doc = seed();
    delete doc.scope.tables;
    const storage = new MemoryStorage(doc);
    let session!: EncounterStudioSession;
    render(
      <WorldBuildingConcept
        roomMode
        compositionSource={source}
        storage={storage}
        studioPresentation={{
          view: 'layout',
          render: (next) => {
            session = next;
            return null;
          },
        }}
      />
    );
    const initial = session.document;
    const writes = storage.roomWrites();
    act(() => expect(session.commitTables(undefined)).toBe(true));
    expect(session.document).toBe(initial);
    expect(storage.roomWrites()).toBe(writes);
    const stale = session.commitTables;
    act(() => expect(session.commitTables({ patrol: {} })).toBe(true));
    const changed = session.document;
    act(() => expect(stale({ obsolete: {} })).toBe(false));
    expect(session.document).toBe(changed);
    expect(session.document.scope.tables).toEqual({ patrol: {} });
    act(() => session.undo());
    expect(session.document.scope).not.toHaveProperty('tables');
  });
});

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
    expect(floorCells(storage.document().draft)).toEqual([zero, two]);
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
    expect(viewport().roomAuthoring?.floorCells).toEqual([zero, one, two]);
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
    expect(viewport().roomAuthoring?.floorCells).toEqual(
      floorCells(restored.draft)
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
    expect(viewport().roomAuthoring?.floorCells).toEqual([]);
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
    expect(viewport().roomAuthoring?.floorCells).toEqual([zero, two]);
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
    fireEvent.click(button('Site'));
    fireEvent.click(button('Save browser recovery'));
    expect(
      screen.queryByRole('button', {
        name: /Publish|Validate with server/,
      })
    ).toBeNull();
    // Play remains separate from Site and switching views never presses it.
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
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
    fireEvent.click(button('Site'));
    expect(button('Replace unreadable local draft')).not.toBeNull();
    gesture(zero, two);
    expect(cells()).toEqual(['0,0', '2,0']);
    switchTo('3D');
    expect(viewport().roomAuthoring?.floorCells).toEqual([zero, two]);
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
    expect(viewport().roomAuthoring?.floorCells).toEqual([zero, two]);
    expect(viewport().scene).toEqual(original.draft.scene);
    const next = moved(viewport().scene);
    act(() => viewport().onSelect([viewport().scene.items[0].id]));
    act(() => viewport().onTransformCommit(next));
    expect(viewport().scene).toEqual(next);
    switchTo('Layout');
    fireEvent.click(button('Site'));
    fireEvent.click(button('Save browser recovery'));
    expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(goodBytes);
    fireEvent.click(button('Undo'));
    switchTo('3D');
    expect(viewport().scene).toEqual(original.draft.scene);
    expect(viewport().roomAuthoring?.floorCells).toEqual([zero, two]);
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
    // Past the world bound: the canvas is unbounded within it (rpg-project#725).
    invalid.items[0].transform.x = 2 * MAX_WORLD_COORD;
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
/** The studio opens framed on the origin at zoom 1 and fits the derived
 * grid (rpg-project#725 R3); read that grid from the surface when it is
 * drawn, else derive it from the stored document. */
function pointInDocument(
  storage: MemoryStorage,
  world: WorldPoint
): { clientX: number; clientY: number } {
  return toClient(world, documentFit(storage));
}
function paintWorkspace(storage: MemoryStorage): void {
  // Paint every cell of the drawn (derived) grid with one rectangle over the
  // box of its cell CENTRES. The rectangle selects every centre it holds,
  // anywhere (rpg-project#725 R3), and the box of an odd-r rectangle's
  // centres holds exactly that rectangle's cells — its corner bounds would
  // also hold the half-offset cells just past each row's end.
  const centres = workspaceCells(
    contentWorkspace(storage.document().draft)
  ).map(layoutCellCenter);
  const xs = centres.map((p) => p.x);
  const zs = centres.map((p) => p.z);
  const start = pointInDocument(storage, {
    x: Math.min(...xs),
    z: Math.min(...zs),
  });
  const end = pointInDocument(storage, {
    x: Math.max(...xs),
    z: Math.max(...zs),
  });
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
    // The castle rectangle is painted floor, not a stored workspace: the
    // canvas is unbounded and the floor is the regions (rpg-project#725).
    const floor = floorCells(castle.draft);
    expect(floor).toHaveLength(3504);
    expect(new Set(floor.map((cell) => `${cell.q},${cell.r}`)).size).toBe(3504);
    expect(castle.draft).not.toHaveProperty('workspace');
    const painted = paintCells(base.draft, castleRectangleCells());
    expect(castle).toEqual({
      ...base,
      draft: {
        ...painted,
        scene: {
          ...painted.scene,
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

  // Rewritten (rpg-project#725 R3): the Size form and resizing are retired
  // with the stored workspace; painting the drawn grid, labels, no-ops,
  // cancellation, shared history and reload still hold.
  it('real paint/label forms preserve all populated data through no-ops, cancellation, shared history and reload', async () => {
    const original = seed();
    const storage = new MemoryStorage(original);
    let id = 0;
    const view = mount(storage, () => `joined-label-${++id}`);
    await settled();
    expect(screen.queryByLabelText('Width (hexes)')).toBeNull();
    const grid = workspaceCells(contentWorkspace(original.draft));
    expect(surface().querySelectorAll('[data-cell]')).toHaveLength(grid.length);
    paintWorkspace(storage);
    const painted = {
      ...original,
      draft: paintCells(original.draft, grid),
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
          version: 2,
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
    const labeled = {
      ...kitchen,
      draft: {
        ...kitchen.draft,
        scene: {
          ...kitchen.draft.scene,
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
    fireEvent.click(button('Label'));
    changeField('Existing label', kitchenId);
    fireEvent.click(button('Inspector'));
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
    expect(storage.document()).toEqual(labeled);
    expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    expect(storage.roomWrites()).toBe(writes);
    switchTo('3D');
    expect(viewport().scene).toEqual(labeled.draft.scene);
    expect(viewport().roomAuthoring?.floorCells).toEqual(
      floorCells(labeled.draft)
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
    // Exactly four committed edits; all navigation/no-op/cancel entries are
    // absent. Whole-document comparisons protect every policy and identity.
    for (const expected of [labeled, kitchen, painted, original]) {
      fireEvent.click(button('Undo'));
      expect(storage.document()).toEqual(expected);
    }
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    for (const expected of [painted, kitchen, labeled, propEdited]) {
      fireEvent.click(button('Redo'));
      expect(storage.document()).toEqual(expected);
    }
    expect((button('Redo') as HTMLButtonElement).disabled).toBe(true);
    expectCodecs(propEdited);
    view.unmount();
    mount(storage);
    await settled();
    expect(cells()).toHaveLength(grid.length);
    expect(surface().querySelectorAll('[data-label-id]')).toHaveLength(2);
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    expect(storage.document()).toEqual(propEdited);
    switchTo('3D');
    expect(viewport().scene).toEqual(propEdited.draft.scene);
    expect(viewport().roomAuthoring?.floorCells).toEqual(
      floorCells(propEdited.draft)
    );
  }, 60000);

  // Rewritten (rpg-project#725): the sparse-maximum workspace and its byte
  // refusal are retired (row runs keep a painted rectangle small); a
  // castle-sized floor still fits the size cap, and a paint past the floor cap
  // still refuses before history/storage without losing a prior label edit.
  it('a castle-sized floor fits the size cap; paint past the floor cap refuses before history/storage without losing a prior label edit', () => {
    const original = createCastleWorkspaceDocument();
    expect(floorCells(original.draft)).toHaveLength(3504);
    expect(() => assertRoomDocumentSize(original)).not.toThrow();
    expectCodecs(original);
    const storage = new MemoryStorage(original);
    let session!: EncounterStudioSession;
    render(
      <WorldBuildingConcept
        roomMode
        compositionSource={source}
        storage={storage}
        idFactory={() => 'max-label'}
        studioPresentation={{
          view: 'layout',
          render: (next) => {
            session = next;
            return null;
          },
        }}
      />
    );
    act(() =>
      expect(session.createMapLabel('Pantry', { x: 8, z: 9 })).toBe(true)
    );
    const good = storage.document();
    expect(good).toEqual({
      ...original,
      draft: {
        ...original.draft,
        scene: {
          ...original.draft.scene,
          mapLabels: [
            ...original.draft.scene.mapLabels!,
            { id: 'max-label', text: 'Pantry', location: { x: 8, z: 9 } },
          ],
        },
      },
    });
    const bytes = storage.bytes.get(ROOM_DRAFT_STORAGE_KEY);
    const writes = storage.roomWrites();
    const pastCap = Array.from({ length: MAX_FLOOR_HEXES + 1 }, (_, i) => ({
      q: i % 512,
      r: 100 + Math.floor(i / 512),
    }));
    act(() => expect(session.commitFloor(pastCap, 'paint')).toBe(false));
    expect(storage.document()).toEqual(good);
    expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    expect(storage.roomWrites()).toBe(writes);
    expect(session.document).toEqual(good);
    act(() => session.undo());
    expect(storage.document()).toEqual(original);
    expect(session.canUndo).toBe(false);
    act(() => session.redo());
    expect(storage.document()).toEqual(good);
    expect(session.canRedo).toBe(false);
  });
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
  if (
    !creation &&
    !screen.queryByRole('searchbox', { name: 'Search wall appearances' })
  )
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
  return clientToWorld(
    { x: client.clientX, y: client.clientY },
    drawnTransform(documentFit(storage))
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
  fireEvent.click(button('Build'));
  if (button('Select').getAttribute('aria-pressed') !== 'true')
    fireEvent.click(button('Select'));
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
    // The room view has no Size section: the canvas is unbounded and the
    // grid is derived (rpg-project#725 R3).
    expect(
      within(
        screen.getByRole('region', { name: 'Inspector' })
      ).queryByLabelText('Width (hexes)')
    ).toBeNull();
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
    expect(
      screen.queryByRole('searchbox', { name: 'Search wall appearances' })
    ).toBeNull();
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
    // The surface moves the start by the pointer's travel, then translates
    // by the start's change — the same operations in the same order, so the
    // expected wall is bit-exact at any zoom (rpg-project#725 R3 rescales it).
    const start = wall.line.start;
    wall = translateWall(wall, {
      x: start.x + (to.x - from.x) - start.x,
      z: start.z + (to.z - from.z) - start.z,
    });
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
    fireEvent.click(button('Options (N)'));
    selectWall(storage, wall); // unchanged selection does not force controls to reappear
    expect(
      screen.queryByRole('form', { name: 'Arrange selected noun' })
    ).toBeNull();
    fireEvent.click(button('Options (N)')); // explicit reopen
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
    // No workspace bounds a wall now (rpg-project#725 R3); the world bound
    // still refuses.
    changeField(
      'Wall midpoint X',
      String(wallMidpoint(wall).x + 2 * MAX_WORLD_COORD)
    );
    submitForm('Arrange selected noun');
    expect(
      screen
        .getAllByRole('alert')
        .map((entry) => entry.textContent)
        .join(' ')
    ).toMatch(/refused|within/i);
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

  it('preserves incomplete policy drafts and rejects retired definition or selection callbacks', () => {
    const owner = arrangeOwner();
    const original = owner.session.document;
    const policy = (): ((scope: RoomDraftDocument['scope']) => void) =>
      (
        owner.session.socialControls.intel as ReactElement<{
          onChange(scope: RoomDraftDocument['scope']): void;
        }>
      ).props.onChange;
    const old = policy();
    act(() =>
      old({
        ...original.scope,
        intel: [{ id: 'draft-record', reveals: { fact: '' } }],
      })
    );
    expect(owner.session.document.scope.intel).toEqual([
      { id: 'draft-record', reveals: { fact: '' } },
    ]);
    expect(owner.storage.document()).toEqual(original);
    act(() =>
      policy()({ ...owner.session.document.scope, intel: original.scope.intel })
    );
    const healed = owner.session.document;
    act(() => old({ ...original.scope, intel: [] }));
    expect(owner.session.document).toEqual(healed);

    act(() =>
      owner.session.viewportProps.roomAuthoring!.onSelectActorTarget!({
        kind: 'actor',
        id: 'goblin-1',
      })
    );
    const actorPanel = render(<>{owner.session.socialControls.selection}</>);
    const faction = within(actorPanel.container).getByLabelText(
      'Creature faction'
    );
    act(() => owner.session.viewportProps.onSelect(['table']));
    const before = owner.session.document;
    fireEvent.change(faction, { target: { value: '' } });
    expect(owner.session.document).toEqual(before);
    actorPanel.unmount();

    act(() => owner.session.viewportProps.onSelect(['studio-decoration']));
    const propPanel = render(<>{owner.session.socialControls.selection}</>);
    const declare = within(propPanel.container).getByRole('button', {
      name: 'Add authored footprint',
    });
    act(() => owner.session.viewportProps.onSelect(['table']));
    fireEvent.click(declare);
    expect(owner.session.document).toEqual(before);
    propPanel.unmount();
  });

  it('owns creature definitions and cast stat blocks atomically and retires stale callbacks', () => {
    const original = seed();
    original.draft.scene.version = 5;
    original.draft.scene.creaturePalette = [
      {
        id: 'guard-look',
        name: 'Guard',
        ref: 'dnd5e:monsters:human',
        modelRef: 'dnd5e:npcs:kingdom:soldier-male-01',
      },
    ];
    original.draft.room.monsterDeclarations[0].appearanceRef =
      'dnd5e:npcs:kingdom:soldier-male-01-style-02-b';
    const owner = arrangeOwner(original);
    const id = original.draft.room.monsterDeclarations[0].id;
    const stale = owner.session;
    act(() => {
      expect(
        owner.session.cast.save({
          ref: 'dnd5e:monsters:town_guard',
          template: {
            base: 'dnd5e:monsters:human',
            hitDice: '2d8',
            armor: 'dnd5e:armor:chain-shirt',
          },
        })
      ).toBe(true);
    });
    act(() => {
      expect(stale.creatures.setDefinition(id, 'dnd5e:monsters:human')).toBe(
        false
      );
    });
    act(() => {
      expect(
        owner.session.creatures.setDefinition(id, 'dnd5e:monsters:town_guard')
      ).toBe(true);
    });
    const changed = owner.session.document;
    expect(changed.draft.room.monsterDeclarations[0]).toEqual({
      ...original.draft.room.monsterDeclarations[0],
      ref: 'dnd5e:monsters:town_guard',
    });
    expect(changed.draft.room.monsterBindings).toEqual(
      original.draft.room.monsterBindings
    );
    expect(changed.scope.tables).toEqual(original.scope.tables);
    act(() => {
      expect(
        owner.session.creatures.armPlacement(
          'dnd5e:monsters:human',
          'dnd5e:npcs:kingdom:soldier-male-01'
        )
      ).toBe(true);
    });
    // The far-off placement refusal is retired with the stored workspace: the
    // canvas is unbounded (rpg-project#725 R3), so no cell is out of bounds.
    expect(owner.session.document).toEqual(changed);
    act(() => owner.session.undo());
    expect(owner.session.document.draft.room.monsterDeclarations).toEqual(
      original.draft.room.monsterDeclarations
    );
    act(() => owner.session.redo());
    expect(owner.session.document).toEqual(changed);
    expect(owner.storage.document()).toEqual(changed);
  });

  // Rewritten (rpg-project#725 R4): a region is the cells it lists, so walls
  // never resolve, break or adopt it (enclosure witnesses are retired); wall
  // motion/break/repair, interleaved edits and full-document history keep it.
  it('joins real regions, T-wall motion/break/repair, interleaved edits and full-document history; walls never move a region', () => {
    const original = createPopulatedStudioDocument();
    const north = original.draft.room.walls![0];
    const extra = (
      id: string,
      start: WorldPoint,
      end: WorldPoint
    ): StructuralWall => ({
      ...structuredClone(north),
      id,
      label: id,
      line: { start, end },
      openings: [],
    });
    original.draft.room.walls!.push(
      extra('east', { x: 4, z: -3 }, { x: 4, z: 3 }),
      extra('south', { x: 4, z: 3 }, { x: -4, z: 3 }),
      extra('west', { x: -4, z: 3 }, { x: -4, z: -3 }),
      extra('middle', { x: 0, z: -3 }, { x: 0, z: 3 })
    );
    const owner = arrangeOwner(original);
    const snapshots = [structuredClone(owner.session.document)];
    const accepted = (operation: () => boolean): void => {
      const writes = owner.storage.roomWrites();
      act(() => expect(operation()).toBe(true));
      expect(owner.storage.roomWrites()).toBe(writes + 1);
      snapshots.push(structuredClone(owner.session.document));
    };
    const newest = (): string =>
      owner.session.document.draft.room.regions.at(-1)!.id;
    accepted(() => owner.session.regionEditing.createRegion('Left'));
    const left = newest();
    // The new region is selected, so the region tool paints into it.
    expect(owner.session.arrange).toMatchObject({
      kind: 'region',
      region: { id: left, name: 'Left', cells: [] },
      resolution: { status: 'unresolved', reason: 'empty' },
    });
    const leftCells = cellsInWorldRectangle(
      { x: -3.6, z: -2.6 },
      { x: -0.4, z: 2.6 }
    );
    accepted(() => owner.session.commitFloor(leftCells, 'paint', left));
    accepted(() => owner.session.regionEditing.createRegion('Right'));
    const right = newest();
    const rightCells = cellsInWorldRectangle(
      { x: 0.4, z: -2.6 },
      { x: 3.6, z: 2.6 }
    );
    accepted(() => owner.session.commitFloor(rightCells, 'paint', right));
    const named = (): RoomRegion[] =>
      owner.session.document.draft.room.regions.filter(
        (region) => region.id === left || region.id === right
      );
    const intent = structuredClone(named());
    expect(intent.map((region) => region.name)).toEqual(['Left', 'Right']);
    const statuses = (): string[] =>
      owner.session.regionEditing.resolutions
        .filter((r) => r.id === left || r.id === right)
        .map((r) => r.status);
    expect(statuses()).toEqual(['resolved', 'resolved']);
    act(() => owner.session.wallEditing.select('middle'));
    const middle = owner.session.document.draft.room.walls!.find(
      (w) => w.id === 'middle'
    )!;
    accepted(() =>
      owner.session.wallEditing.edit({
        ...middle,
        line: { start: { x: 1, z: -3 }, end: { x: 1, z: 3 } },
      })
    );
    expect(named()).toEqual(intent);
    expect(statuses()).toEqual(['resolved', 'resolved']);
    const completeMiddle = owner.session.document.draft.room.walls!.find(
      (w) => w.id === 'middle'
    )!;
    accepted(() =>
      owner.session.wallEditing.edit({
        ...completeMiddle,
        line: { ...completeMiddle.line, end: { x: 1, z: 2 } },
      })
    );
    // A broken enclosure no longer unresolves anything: the cells are listed.
    expect(named()).toEqual(intent);
    expect(statuses()).toEqual(['resolved', 'resolved']);
    const broken = owner.session.document;
    const bytes = owner.storage.bytes.get(ROOM_DRAFT_STORAGE_KEY);
    const writes = owner.storage.roomWrites();
    owner.switchView('layout');
    owner.switchView('3d');
    expect(owner.session.document).toBe(broken);
    expect(owner.storage.roomWrites()).toBe(writes);
    expect(owner.storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    accepted(() => owner.session.wallEditing.edit(completeMiddle));
    expect(named()).toEqual(intent);
    accepted(() => owner.session.createMapLabel('Plain note', { x: 0, z: 4 }));
    accepted(() => owner.session.commitFloor([{ q: 3, r: 0 }], 'paint'));
    act(() => owner.session.viewportProps.onSelect(['table']));
    accepted(() =>
      owner.session.commitArrange({
        kind: 'scene-edit',
        target: { kind: 'scene', ids: ['table'] },
        position: { x: 1.25 },
      })
    );
    expect(named()).toEqual(intent);
    expect(owner.session.document.scope).toEqual(original.scope);
    expect(owner.session.document.draft.room.doorBindings).toEqual(
      original.draft.room.doorBindings
    );
    const beforeRemoval = owner.session.document;
    // Region edits act on the selected region, as the inspector does.
    act(() => expect(owner.session.selectRegion(left)).toBe(true));
    accepted(() => owner.session.regionEditing.removeRegion(left));
    // Removing a region keeps its cells as floor, in the implicit region.
    const owners = cellOwners(owner.session.document.draft);
    const implicit = owner.session.document.draft.room.implicitRegionId;
    expect(
      leftCells.every((c) => owners.get(`${c.q},${c.r}`) === implicit)
    ).toBe(true);
    expect(floorCells(owner.session.document.draft)).toEqual(
      floorCells(beforeRemoval.draft)
    );
    const final = snapshots[snapshots.length - 1];
    for (const expected of snapshots.slice(0, -1).reverse()) {
      act(() => owner.session.undo());
      expect(owner.session.document).toEqual(expected);
    }
    expect(owner.session.canUndo).toBe(false);
    for (const expected of snapshots.slice(1)) {
      act(() => owner.session.redo());
      expect(owner.session.document).toEqual(expected);
    }
    owner.unmount();
    const loaded = arrangeOwner(owner.storage.document());
    expect(loaded.session.document).toEqual(final);
    expect(
      loaded.session.document.draft.room.regions.map((region) => region.name)
    ).toEqual(final.draft.room.regions.map((region) => region.name));
  });

  // Rewritten (rpg-project#725): label binding and enclosing walls are
  // retired; the retired-callback and stale-target refusals still hold.
  it('a region edit through a retired callback or a stale target is refused without history', () => {
    const original = createPopulatedStudioDocument();
    const owner = arrangeOwner(original);
    act(() =>
      expect(owner.session.regionEditing.createRegion('Initially open')).toBe(
        true
      )
    );
    const region = owner.session.document.draft.room.regions.at(-1)!;
    expect(owner.session.arrange).toMatchObject({
      kind: 'region',
      region: { id: region.id },
    });
    const retired = owner.session.regionEditing;
    act(() =>
      expect(
        owner.session.commitFloor([{ q: 0, r: 0 }], 'paint', region.id)
      ).toBe(true)
    );
    const painted = owner.session.document;
    const writes = owner.storage.roomWrites();
    act(() => expect(retired.renameRegion(region.id, 'Late')).toBe(false));
    act(() => expect(retired.setRegionLighting(region.id, 0.5)).toBe(false));
    act(() => expect(retired.removeRegion(region.id)).toBe(false));
    act(() =>
      expect(
        owner.session.commitArrange({
          kind: 'region-edit',
          target: { kind: 'region', id: 'unrelated' },
          name: 'Ghost',
        })
      ).toBe(false)
    );
    act(() =>
      expect(
        owner.session.commitFloor([{ q: 5, r: 5 }], 'paint', 'unrelated')
      ).toBe(false)
    );
    // The implicit region is where unassigned paint lands: never removable.
    const implicit = painted.draft.room.implicitRegionId;
    act(() => expect(owner.session.selectRegion(implicit)).toBe(true));
    act(() =>
      expect(owner.session.regionEditing.removeRegion(implicit)).toBe(false)
    );
    expect(owner.session.document).toBe(painted);
    expect(owner.storage.roomWrites()).toBe(writes);
    // The live callback, on the selected region, is accepted.
    act(() => expect(owner.session.selectRegion(region.id)).toBe(true));
    act(() =>
      expect(owner.session.regionEditing.renameRegion(region.id, 'Late')).toBe(
        true
      )
    );
    const renamed = owner.session.document;
    expect(owner.storage.roomWrites()).toBe(writes + 1);
    act(() => owner.session.undo());
    expect(owner.session.document).toEqual(painted);
    act(() => owner.session.undo());
    expect(
      owner.session.document.draft.room.regions.find((r) => r.id === region.id)
    ).toEqual(region);
    act(() => owner.session.redo());
    act(() => owner.session.redo());
    expect(owner.session.document).toEqual(renamed);
    owner.unmount();
    const loaded = arrangeOwner(owner.storage.document());
    expect(
      loaded.session.regionEditing.resolutions.find((r) => r.id === region.id)
        ?.status
    ).toBe('resolved');
    expect(loaded.session.document.scope).toEqual(original.scope);
  });

  it('placement preview identities never alias an open authored door on another wall or a binding key', () => {
    const document = createPopulatedStudioDocument();
    const source = document.draft.room.walls![0];
    document.draft.room.walls!.push({
      ...source,
      id: 'other-wall',
      line: { start: { x: -4, z: 4 }, end: { x: 4, z: 4 } },
      openings: [
        {
          id: 'other-opening',
          position: 4,
          width: 2,
          door: {
            id: 'preview-door',
            assetRef: source.openings[1].door!.assetRef,
          },
        },
      ],
    });
    document.draft.room.doorBindings!['preview-door'] = {};
    document.draft.room.doorBindings!['preview-door-'] = { closed: true };
    const owner = arrangeOwner(document);
    const before = owner.session.document;
    const writes = owner.storage.roomWrites();
    act(() =>
      owner.session.doorEditing.setAsset(source.openings[1].door!.assetRef)
    );
    act(() => owner.session.doorEditing.setActive(true));
    act(() =>
      expect(
        owner.session.doorEditing.previewPlacement('studio-wall', {
          x: -0.25,
          z: -3,
        })
      ).toBe(true)
    );
    const preview = owner.session.doorEditing.preview!;
    if (!preview.valid) throw new Error('Expected valid preview');
    expect(preview.target.doorId).not.toBe('preview-door');
    expect(preview.target.doorId).not.toBe('preview-door-');
    expect(owner.session.document).toBe(before);
    expect(
      owner.session.document.draft.room.doorBindings!['preview-door']
    ).toEqual({});
    expect(owner.storage.roomWrites()).toBe(writes);
  });

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
    expect((button('Apply') as HTMLButtonElement).disabled).toBe(true);
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
    fireEvent.click(button('Cancel'));
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

describe('Layout regions joined to the real owner', () => {
  function regionSeed(): RoomDraftDocument {
    const document = seed();
    const north = document.draft.room.walls![0];
    north.line = { start: { x: 0, z: 0 }, end: { x: 8, z: 0 } };
    const wall = (
      id: string,
      start: WorldPoint,
      end: WorldPoint
    ): StructuralWall => ({
      ...structuredClone(north),
      id,
      label: id,
      line: { start, end },
      openings: [],
    });
    document.draft.room.walls = [
      north,
      wall('east', { x: 8, z: 0 }, { x: 8, z: 4 }),
      wall('south', { x: 8, z: 4 }, { x: 0, z: 4 }),
      wall('west', { x: 0, z: 4 }, { x: 0, z: 0 }),
      wall('divider', { x: 4, z: 0 }, { x: 4, z: 4 }),
    ];
    return document;
  }
  /** New region in the regions list names a region, selects it and makes
   * it ACTIVE (rpg-project#725 R5); a note kind places a note with the
   * label tool, which places notes only. */
  function place(name: string, x: number, z: number, kind = 'room'): void {
    if (kind === 'room') {
      fireEvent.click(button('Regions'));
      fireEvent.change(screen.getByLabelText('New region name'), {
        target: { value: name },
      });
      fireEvent.submit(screen.getByRole('form', { name: 'New region' }));
      return;
    }
    fireEvent.click(button('Label'));
    fireEvent.change(screen.getByLabelText('Label name'), {
      target: { value: name },
    });
    fireEvent.click(button('Place label on map'));
    fireEvent.change(screen.getByLabelText('New label world X'), {
      target: { value: String(x) },
    });
    fireEvent.change(screen.getByLabelText('New label world Z'), {
      target: { value: String(z) },
    });
    fireEvent.click(button('Place label at coordinates'));
  }
  /** The regions list's radio makes a region the one Paint brushes into. */
  function activate(name: string): void {
    fireEvent.click(button('Build'));
    fireEvent.click(screen.getByRole('radio', { name: `Paint into ${name}` }));
  }
  function floorTool(name: 'Paint' | 'Rectangle' | 'Erase'): void {
    fireEvent.click(button('Build'));
    fireEvent.click(button(name));
  }
  /** A Rooms list row selects its region through session.selectRegion. */
  function selectRegion(name: string): void {
    fireEvent.click(button('Build'));
    fireEvent.click(button(`Edit region ${name}`));
  }
  function regionNamed(
    document: RoomDraftDocument,
    name: string
  ): RoomRegion | undefined {
    return document.draft.room.regions.find((region) => region.name === name);
  }
  function areaIds(): string[] {
    return [...surface().querySelectorAll('[data-region-id]')].map(
      (node) => node.getAttribute('data-region-id')!
    );
  }
  function status(): string {
    return within(screen.getByRole('region', { name: 'Inspector' }))
      .getAllByRole('status')
      .map((node) => node.textContent)
      .join(' ');
  }
  function dragWorld(
    storage: MemoryStorage,
    start: WorldPoint,
    end: WorldPoint
  ): void {
    fireEvent.pointerDown(surface(), pointer(storage, start));
    fireEvent.pointerMove(surface(), pointer(storage, end));
    fireEvent.pointerUp(surface(), pointer(storage, end));
  }
  const change = (name: string, value: string): void => {
    fireEvent.change(screen.getByLabelText(name), { target: { value } });
  };

  // Rewritten (rpg-project#725 R4/R5): a room is a named region of painted
  // cells, not a label bound to an enclosure; walls never move, adopt or
  // unresolve it, so the divider's motion, removal and repair leave it be.
  it('creates two adjacent regions by name and paints them; divider x4→5, removal and repair never move a region', async () => {
    const original = regionSeed();
    const storage = new MemoryStorage(original);
    const mounted = mount(storage);
    await settled();
    place('Left room', 1, 2);
    expect(status()).toMatch(/Not painted yet/);
    // The new region is active: the rectangle brushes into it.
    floorTool('Rectangle');
    dragWorld(storage, { x: 0.4, z: 0.4 }, { x: 3.6, z: 3.6 });
    place('Right room', 7, 2);
    floorTool('Rectangle');
    dragWorld(storage, { x: 4.4, z: 0.4 }, { x: 7.6, z: 3.6 });
    const painted = storage.document();
    const left = regionNamed(painted, 'Left room')!;
    const right = regionNamed(painted, 'Right room')!;
    const pair = structuredClone([left, right]);
    expect(regionCells(left)).toEqual(
      cellsInWorldRectangle({ x: 0.4, z: 0.4 }, { x: 3.6, z: 3.6 }).sort(
        (a, b) => a.r - b.r || a.q - b.q
      )
    );
    expect(regionCells(right).length).toBeGreaterThan(0);
    expect(areaIds()).toEqual(expect.arrayContaining([left.id, right.id]));
    expect(
      screen.getByRole('button', { name: 'Select region Left room' })
    ).toBeTruthy();
    // Regions are gameplay data beside the walls, scene and scope.
    expect(painted.draft.room.walls).toEqual(original.draft.room.walls);
    expect(painted.draft.scene).toEqual(original.draft.scene);
    expect(painted.scope).toEqual(original.scope);
    const writes = storage.roomWrites();
    fireEvent.click(button('Build'));
    fireEvent.click(button('Select'));
    const divider = surface().querySelector('[data-wall-id="divider"]')!;
    fireEvent.pointerDown(divider, pointer(storage, { x: 4, z: 2 }));
    fireEvent.pointerUp(surface(), pointer(storage, { x: 4, z: 2 }));
    change('Wall midpoint X', '5');
    fireEvent.click(button('Apply'));
    expect(storage.roomWrites()).toBe(writes + 1);
    const named = (): RoomRegion[] =>
      storage
        .document()
        .draft.room.regions.filter(
          (r) => r.id === left.id || r.id === right.id
        );
    expect(named()).toEqual(pair);
    expect(areaIds()).toEqual(expect.arrayContaining([left.id, right.id]));
    fireEvent.click(button('Remove wall'));
    expect(named()).toEqual(pair);
    expect(areaIds()).toEqual(expect.arrayContaining([left.id, right.id]));
    fireEvent.click(button('Undo'));
    const final = storage.document();
    expect(named()).toEqual(pair);
    expect(final.scope).toEqual(original.scope);
    expect(final.draft.room.doorBindings).toEqual(
      original.draft.room.doorBindings
    );
    expect(final.draft.scene.items).toEqual(original.draft.scene.items);
    expectCodecs(final);
    mounted.unmount();
    mount(storage);
    await settled();
    expect(storage.document()).toEqual(final);
    expect(areaIds()).toEqual(expect.arrayContaining([left.id, right.id]));
    // Reload with only the attached door's initial state changed: a door's
    // state never touches a region.
    cleanup();
    const opened = structuredClone(final);
    const attached = opened.draft.room.walls![0].openings.find(
      (opening) => opening.door
    )!;
    opened.draft.room.doorBindings![attached.door!.id] = {};
    const openStorage = new MemoryStorage(opened);
    mount(openStorage);
    await settled();
    expect(areaIds()).toEqual(expect.arrayContaining([left.id, right.id]));
    expect(
      openStorage
        .document()
        .draft.room.regions.filter((r) => r.id === left.id || r.id === right.id)
    ).toEqual(pair);
  });

  // Rewritten (rpg-project#725 R5): explicit areas and the region tool are
  // retired. Paint brushes into the ACTIVE region, reassigning cells (no
  // overlap); handing cells back is painting them with the implicit region
  // active; erase removes floor.
  it('paints forest beside meadow by reassigning floor, cancels pending strokes, preserves the brush through views and shares history', async () => {
    const original = seed();
    const storage = new MemoryStorage(original);
    const mounted = mount(storage);
    await settled();
    const implicit = original.draft.room.implicitRegionId;
    const implicitName = original.draft.room.regions.find(
      (r) => r.id === implicit
    )!.name;
    const floor = floorCells(original.draft);
    place('Forest', 0, 0);
    expect(status()).toMatch(/Not painted yet/);
    const forestId = regionNamed(storage.document(), 'Forest')!.id;
    floorTool('Paint');
    const writes = storage.roomWrites();
    fireEvent.pointerDown(surface(), { ...at(zero), button: 0, pointerId: 7 });
    fireEvent.pointerMove(surface(), { ...at(one), pointerId: 7 });
    expect(storage.roomWrites()).toBe(writes);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(surface(), { ...at(one), button: 0, pointerId: 7 });
    expect(storage.roomWrites()).toBe(writes);
    floorTool('Paint');
    gesture(zero, one);
    expect(storage.roomWrites()).toBe(writes + 1);
    const owner = (cell: RoomHexCell): string | undefined =>
      cellOwners(storage.document().draft).get(`${cell.q},${cell.r}`);
    expect(owner(zero)).toBe(forestId);
    expect(owner(one)).toBe(forestId);
    // The cells were already floor: painting a region reassigns, never adds.
    expect(floorCells(storage.document().draft)).toEqual(floor);
    // Select by the region's name on the map: unlike a list row, it does not
    // reframe the view, so the cells below stay on the surface.
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Select region Forest' }),
      { key: 'Enter' }
    );
    expect(status()).toMatch(/Painted · 2 hexes/);
    gesture(zero, one);
    expect(storage.roomWrites()).toBe(writes + 1); // accepted no-op
    floorTool('Rectangle');
    gesture(one, two);
    expect(owner(two)).toBe(forestId);
    // Handing a cell back is painting it with the implicit region active.
    activate(implicitName);
    floorTool('Paint');
    gesture(two);
    expect(owner(two)).toBe(implicit); // handed back, still floor
    expect(owner(zero)).toBe(forestId);
    expect(floorCells(storage.document().draft)).toEqual(floor);
    const beforeView = storage.document();
    fireEvent.pointerDown(surface(), { ...at(two), button: 0, pointerId: 7 });
    switchTo('3D');
    switchTo('Layout');
    fireEvent.pointerUp(surface(), { ...at(two), button: 0, pointerId: 7 });
    expect(storage.document()).toEqual(beforeView);
    // The active region is workspace state: it survives the view switch.
    expect(
      (
        screen.getByRole('radio', {
          name: `Paint into ${implicitName}`,
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
    place('Meadow', 4, 0);
    const meadowId = regionNamed(storage.document(), 'Meadow')!.id;
    floorTool('Paint');
    gesture({ q: 3, r: 0 });
    expect(owner({ q: 3, r: 0 })).toBe(meadowId);
    expect(areaIds()).toEqual(expect.arrayContaining([forestId, meadowId]));
    const distinctRegions = storage.document();
    gesture(zero); // brushing with a region active reassigns: no overlap
    expect(owner(zero)).toBe(meadowId);
    expect(regionCells(regionNamed(storage.document(), 'Forest')!)).toEqual([
      one,
    ]);
    fireEvent.click(button('Undo'));
    expect(storage.document()).toEqual(distinctRegions);
    const afterRegions = storage.document();
    expect(afterRegions.scope).toEqual(original.scope);
    expect(afterRegions.draft.scene.items).toEqual(original.draft.scene.items);
    expect(afterRegions.draft.scene.groups).toEqual(
      original.draft.scene.groups
    );
    expect(afterRegions.draft.room.walls).toEqual(original.draft.room.walls);
    place('Plain note', -5, 0, 'note');
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Select map label Plain note' }),
      { key: 'Enter' }
    );
    fireEvent.click(button('Inspector'));
    expect(screen.queryByRole('button', { name: 'Make active' })).toBeNull();
    expect(button('Delete label')).toBeTruthy();
    const noted = storage.document();
    activate(implicitName);
    floorTool('Paint');
    gesture({ q: 4, r: 0 });
    const withFloor = storage.document();
    expect(owner({ q: 4, r: 0 })).toBe(implicit);
    fireEvent.click(button('Undo'));
    expect(storage.document()).toEqual(noted);
    fireEvent.click(button('Redo'));
    expect(storage.document()).toEqual(withFloor);
    selectRegion('Meadow');
    fireEvent.click(button('Remove region'));
    expect(regionNamed(storage.document(), 'Meadow')).toBeUndefined();
    expect(owner({ q: 3, r: 0 })).toBe(implicit); // its cells stay floor
    expect(
      storage
        .document()
        .draft.scene.mapLabels!.some((label) => label.text === 'Plain note')
    ).toBe(true);
    fireEvent.click(button('Undo'));
    expect(storage.document()).toEqual(withFloor);
    mounted.unmount();
    mount(storage);
    await settled();
    expect(storage.document()).toEqual(withFloor);
    expect(areaIds()).toEqual(expect.arrayContaining([forestId, meadowId]));
  });

  // Rewritten (rpg-project#725 R5): a stroke paints into the region that was
  // active when it began; a history change retires it; a region declared and
  // not yet painted (the successor of an explicit empty area) survives every
  // codec.
  it('a pending stroke keeps the region it began in, history retires it, and a declared unpainted region survives every codec', async () => {
    const original = seed();
    const storage = new MemoryStorage(original);
    mount(storage);
    await settled();
    const implicit = original.draft.room.implicitRegionId;
    const implicitName = original.draft.room.regions.find(
      (r) => r.id === implicit
    )!.name;
    const owner = (cell: RoomHexCell): string | undefined =>
      cellOwners(storage.document().draft).get(`${cell.q},${cell.r}`);
    place('Forest', 0, 0);
    place('Meadow', 4, 0);
    const forestId = regionNamed(storage.document(), 'Forest')!.id;
    activate('Forest');
    floorTool('Paint');
    gesture(zero);
    expect(owner(zero)).toBe(forestId);
    fireEvent.pointerDown(surface(), { ...at(one), button: 0, pointerId: 7 });
    activate('Meadow');
    fireEvent.pointerUp(surface(), { ...at(one), button: 0, pointerId: 7 });
    expect(owner(one)).toBe(forestId);
    const before = storage.document();
    fireEvent.click(button('Undo'));
    const undone = storage.document();
    fireEvent.pointerDown(surface(), { ...at(two), button: 0, pointerId: 7 });
    fireEvent.click(button('Redo'));
    fireEvent.pointerUp(surface(), { ...at(two), button: 0, pointerId: 7 });
    expect(undone).not.toEqual(before);
    expect(storage.document()).toEqual(before);
    // Hand Forest's cells back: it stays listed, declared and unpainted.
    activate(implicitName);
    floorTool('Paint');
    gesture(zero, one);
    const empty = storage.document();
    expect(regionNamed(empty, 'Forest')).toMatchObject({ cells: [] });
    selectRegion('Forest');
    expect(status()).toMatch(/Not painted yet/);
    expectCodecs(empty);
    cleanup();
    mount(storage);
    await settled();
    expect(storage.document()).toEqual(empty);
    selectRegion('Forest');
    expect(status()).toMatch(/Not painted yet/);
  });
});

describe('Studio staged region lighting integrated presentation', () => {
  // Rewritten (rpg-project#725): a region's lighting is its own intensity,
  // edited on the region's view beside its name (its map label).
  it('real Layout selection/form stages, cancels and joins one history step; 3D gets only committed lighting and reload/export retain full payload', async () => {
    const original = createRegionLightingDocument();
    const storage = new MemoryStorage(original);
    const mounted = mount(storage);
    await settled();
    const select = (name = 'left') => {
      fireEvent.click(button('Regions'));
      fireEvent.keyDown(button(`Select region ${name}`), { key: 'Enter' });
    };
    const field = (name: string, value: string) =>
      fireEvent.change(screen.getByLabelText(name), { target: { value } });
    select();
    const bytes = storage.bytes.get(ROOM_DRAFT_STORAGE_KEY);
    const writes = storage.roomWrites();
    field('Lighting (%)', '15');
    expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    fireEvent.click(button('Options (N)'));
    fireEvent.click(button('Options (N)'));
    expect(
      (screen.getByLabelText('Lighting (%)') as HTMLInputElement).value
    ).toBe('15');
    field('Lighting (%)', '15');
    switchTo('3D');
    expect(viewport().roomAuthoring!.regionLighting!.areas).toEqual([]);
    switchTo('Layout');
    select();
    expect(
      (screen.getByLabelText('Lighting (%)') as HTMLInputElement).value
    ).toBe('100');
    field('Region name', 'Kitchen');
    field('Lighting (%)', '15');
    fireEvent.keyDown(screen.getByLabelText('Lighting (%)'), {
      key: 'Enter',
    });
    expect(storage.roomWrites()).toBe(writes + 1);
    const after = storage.document();
    expect(after).toEqual({
      ...original,
      draft: setRegionLighting(
        renameRegion(original.draft, LIGHTING_REGIONS.left, 'Kitchen'),
        LIGHTING_REGIONS.left,
        0.15
      ),
    });
    switchTo('3D');
    expect(viewport().roomAuthoring!.regionLighting!.areas).toHaveLength(1);
    expect(viewport().roomAuthoring!.regionLighting!.areas[0]).toMatchObject({
      regionId: LIGHTING_REGIONS.left,
      background: 0.15,
    });
    fireEvent.click(button('Undo'));
    expect(storage.document()).toEqual(original);
    expect((button('Undo') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button('Redo'));
    expect(storage.document()).toEqual(after);
    const exported = encodeSingleRoomDungeon({
      key: 'studio-lighting-joined',
      draft: after.draft,
      ...after.scope,
    });
    const decoded = decodeSingleRoomDungeon(exported);
    expect(
      parseRoomDocumentJson(
        stringifyRoomDraft(decoded.draft, scopeFrom(decoded))
      )
    ).toEqual(after);
    mounted.unmount();
    mount(storage);
    await settled();
    expect(storage.document()).toEqual(after);
    switchTo('Layout');
    select('Kitchen');
    expect(
      (screen.getByLabelText('Lighting (%)') as HTMLInputElement).value
    ).toBe('15');
    field('Lighting (%)', '100');
    fireEvent.click(button('Apply'));
    expect(
      storage
        .document()
        .draft.room.regions.find((r) => r.id === LIGHTING_REGIONS.left)!
        .lighting
    ).toEqual({ intensity: 1 });
  });
});

describe('S0 inspector through the real owner', () => {
  const inspector = () =>
    within(screen.getByRole('region', { name: 'Inspector' }));
  it('wall height edited in the inspector is one history entry and undo restores it with the wall still selected', async () => {
    const original = createPopulatedStudioDocument();
    const storage = new MemoryStorage(original);
    mount(storage);
    await settled();
    const wall = original.draft.room.walls![0];
    selectWall(storage, wall);
    expect(
      inspector().getByRole('heading', { level: 2, name: 'Studio north wall' })
    ).toBeTruthy();
    const writes = storage.roomWrites();
    fireEvent.change(inspector().getByLabelText('Appearance height'), {
      target: { value: '4' },
    });
    fireEvent.submit(
      inspector().getByRole('form', { name: 'Arrange selected noun' })
    );
    expect(storage.document().draft.room.walls![0].appearance.height).toBe(4);
    expect(storage.roomWrites()).toBe(writes + 1);
    fireEvent.click(button('Undo'));
    expect(storage.document().draft.room.walls![0].appearance.height).toBe(
      wall.appearance.height
    );
    expect(
      inspector().getByRole('heading', { level: 2, name: 'Studio north wall' })
    ).toBeTruthy();
    expect(
      (inspector().getByLabelText('Appearance height') as HTMLInputElement)
        .value
    ).toBe(String(wall.appearance.height));
  });

  it('undo of a creature placement falls back to the room view', async () => {
    const original = createPopulatedStudioDocument();
    original.draft.scene.version = Math.max(
      original.draft.scene.version,
      5
    ) as typeof original.draft.scene.version;
    original.draft.scene.creaturePalette = [
      {
        id: 'guard-look',
        name: 'Gate guard',
        ref: 'dnd5e:monsters:human',
        modelRef: 'dnd5e:npcs:kingdom:soldier-male-01',
      },
    ];
    const storage = new MemoryStorage(original);
    mount(storage);
    await settled();
    switchTo('3D');
    fireEvent.click(button('Monsters & NPCs'));
    fireEvent.click(button('Place on map'));
    act(() => viewport().roomAuthoring!.onPlaceMonster!({ q: -1, r: 1 }));
    expect(storage.document().draft.room.monsterDeclarations).toHaveLength(
      original.draft.room.monsterDeclarations.length + 1
    );
    expect(
      inspector().getByRole('heading', { level: 2, name: 'Gate guard' })
    ).toBeTruthy();
    fireEvent.click(button('Undo'));
    expect(storage.document().draft.room.monsterDeclarations).toEqual(
      original.draft.room.monsterDeclarations
    );
    expect(
      inspector().getByRole('heading', { level: 2, name: 'Room' })
    ).toBeTruthy();
  });

  it('a prop dropped in 3D becomes the selection and opens the prop view', async () => {
    const original = createPopulatedStudioDocument();
    const storage = new MemoryStorage(original);
    mount(storage);
    await settled();
    switchTo('3D');
    fireEvent.keyDown(window, { key: 'n' });
    expect(button('Inspector (N)').getAttribute('aria-expanded')).toBe('false');
    act(() =>
      viewport().onDrop(
        { kind: 'prop', id: 'dnd5e:props:dark-fortress:alchemy_tools_01' },
        { kind: 'ground', point: { x: 1, z: 1 } }
      )
    );
    const before = new Set(original.draft.scene.items.map((item) => item.id));
    const dropped = storage
      .document()
      .draft.scene.items.find((item) => !before.has(item.id))!;
    expect(dropped).toBeTruthy();
    expect(button('Inspector (N)').getAttribute('aria-expanded')).toBe('true');
    expect(
      inspector().getByRole('heading', {
        level: 2,
        name: dropped.label || dropped.id,
      })
    ).toBeTruthy();
    expect(inspector().getByLabelText('World X')).toBeTruthy();
  });
});

describe('S0 one selection across the homes', () => {
  const inspector = () =>
    within(screen.getByRole('region', { name: 'Inspector' }));
  const member = (name: string): HTMLElement =>
    within(screen.getByRole('list', { name: 'Cast members' })).getByRole(
      'button',
      { name: new RegExp(`^${name} ·`) }
    );
  const openCast = (): void => {
    fireEvent.click(button('Encounter'));
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Encounter tools' })
      ).getByRole('button', { name: 'Cast' })
    );
  };

  it("a placement selected on its cast member's form is the map selection with the inspector open", async () => {
    const original = createPopulatedStudioDocument();
    const id = original.draft.room.monsterDeclarations[0]!.id;
    const storage = new MemoryStorage(original);
    mount(storage);
    await settled();
    fireEvent.keyDown(window, { key: 'n' });
    openCast();
    fireEvent.click(member('Goblin'));
    fireEvent.click(button(`Select placement ${id}`));
    expect(button('Build').getAttribute('aria-pressed')).toBe('true');
    // The view the author last used: Layout.
    expect(button('Layout').getAttribute('aria-pressed')).toBe('true');
    expect(button('Inspector (N)').getAttribute('aria-expanded')).toBe('true');
    expect(inspector().getByLabelText('Map name')).toBeTruthy();
    expect(storage.document()).toEqual(original);
  });

  it("a creature selected on the map presses its cast member's row", async () => {
    const original = createPopulatedStudioDocument();
    const id = original.draft.room.monsterDeclarations[0]!.id;
    const storage = new MemoryStorage(original);
    mount(storage);
    await settled();
    switchTo('3D');
    act(() =>
      viewport().roomAuthoring!.onSelectActorTarget!({ kind: 'actor', id })
    );
    expect(inspector().getByLabelText('Map name')).toBeTruthy();
    openCast();
    expect(member('Goblin').getAttribute('aria-pressed')).toBe('true');
    expect(member('Skeleton').getAttribute('aria-pressed')).toBe('false');
  });

  it('switching homes keeps a wall selection', async () => {
    const original = createPopulatedStudioDocument();
    const storage = new MemoryStorage(original);
    mount(storage);
    await settled();
    selectWall(storage, original.draft.room.walls![0]);
    fireEvent.click(button('Encounter'));
    fireEvent.click(button('Regions'));
    fireEvent.click(button('Build'));
    expect(
      inspector().getByRole('heading', { level: 2, name: 'Studio north wall' })
    ).toBeTruthy();
  });

  it('the home lists Cast, Tables, Bundles, Factions, Dispositions, Intel and Facts, and no Creatures or Stat blocks', async () => {
    mount(new MemoryStorage(createPopulatedStudioDocument()));
    await settled();
    fireEvent.click(button('Encounter'));
    expect(
      within(screen.getByRole('navigation', { name: 'Encounter tools' }))
        .getAllByRole('button')
        .map((node) => node.textContent)
    ).toEqual([
      'Cast',
      'Tables',
      'Bundles',
      'Factions',
      'Dispositions',
      'Intel',
      'Endings',
      'Concealments',
      'Scenarios',
      'Facts',
    ]);
    expect(screen.queryByRole('button', { name: 'Creatures' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stat blocks' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Cast' })).toBeTruthy();
  });
});

describe('S2 the fact index through the real owner', () => {
  it('clicking a writer in Facts selects the cook in the inspector', async () => {
    mount(new MemoryStorage(createCastleReadBackDocument()));
    await settled();
    fireEvent.click(button('Encounter'));
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Encounter tools' })
      ).getByRole('button', { name: 'Facts' })
    );
    const facts = screen.getByRole('region', { name: 'Facts' });
    fireEvent.click(
      within(
        facts.querySelector('[data-fact="feast-tonight"]') as HTMLElement
      ).getByRole('button', { name: 'cook: gossip' })
    );
    const inspector = screen.getByRole('region', { name: 'Inspector' });
    expect(
      within(inspector).getByRole('region', { name: 'Read back' }).textContent
    ).toContain('cook, a Commoner of the kitchen, and the kitchen’s mind.');
  });
});

describe('S4 the hidden nouns through the real owner', () => {
  const section = (name: string): void => {
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Encounter tools' })
      ).getByRole('button', { name })
    );
  };

  it('the fact index opens the ending it names', async () => {
    const document = createCastleReadBackDocument();
    document.scope.endings = [
      { id: 'king-deposed', when: { fact: 'king-deposed' } },
    ];
    mount(new MemoryStorage(document));
    await settled();
    fireEvent.click(button('Encounter'));
    section('Facts');
    const facts = screen.getByRole('region', { name: 'Facts' });
    fireEvent.click(
      within(
        facts.querySelector('[data-fact="king-deposed"]') as HTMLElement
      ).getByRole('button', { name: 'ending king-deposed' })
    );
    const endings = within(screen.getByRole('region', { name: 'Endings' }));
    expect(
      (endings.getByLabelText('Ending id') as HTMLInputElement).value
    ).toBe('king-deposed');
  });

  it('an ending added on the home is one history entry', async () => {
    mount(new MemoryStorage(createCastleReadBackDocument()));
    await settled();
    fireEvent.click(button('Encounter'));
    section('Endings');
    const endings = () =>
      within(screen.getByRole('region', { name: 'Endings' }));
    fireEvent.click(endings().getByRole('button', { name: 'Add ending' }));
    fireEvent.change(endings().getByLabelText('Ending id'), {
      target: { value: 'king-slain' },
    });
    fireEvent.change(endings().getByLabelText('Ending when form'), {
      target: { value: 'down' },
    });
    fireEvent.change(endings().getByLabelText('Ending when placement'), {
      target: { value: 'captain' },
    });
    fireEvent.click(endings().getByRole('button', { name: 'Apply ending' }));
    expect(
      within(endings().getByRole('list', { name: 'Authored endings' }))
        .getAllByRole('listitem')
        .map((item) => item.firstChild?.textContent)
    ).toEqual([expect.stringMatching(/^king-slain: when .+ is down$/)]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(endings().getByText('No ending yet.')).toBeTruthy();
  });
});

describe('S4 concealments through the real owner', () => {
  const section = (name: string): void => {
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Encounter tools' })
      ).getByRole('button', { name })
    );
  };
  const withStash = (): RoomDraftDocument => {
    const document = createPopulatedStudioDocument();
    document.scope.concealments = {
      ...document.scope.concealments,
      stash: {
        checks: [{ ability: 'investigation', dc: 14 }],
        props: ['studio-wall'],
      },
    };
    return document;
  };

  it('members picked on the map toggle in one step each', async () => {
    const storage = new MemoryStorage(withStash());
    mount(storage);
    await settled();
    const cell = floorCells(storage.document().draft).find(
      (hex) => Math.abs(hex.q) <= 2 && hex.r === 1
    )!;
    expect(cell).toBeTruthy();
    fireEvent.click(button('Encounter'));
    section('Concealments');
    fireEvent.click(screen.getByRole('button', { name: 'stash' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Add members on the map' })
    );
    expect(
      screen.getByText(/Adding members to stash/, { selector: 'strong' })
    ).toBeTruthy();
    const writes = storage.roomWrites();
    fireEvent.pointerDown(surface(), { ...at(cell), button: 0, pointerId: 7 });
    fireEvent.pointerUp(surface(), { ...at(cell), button: 0, pointerId: 7 });
    expect(storage.document().scope.concealments!.stash.cells).toEqual([cell]);
    expect(storage.roomWrites()).toBe(writes + 1);
    expect(
      document.querySelector(`[data-concealed-cell="${cell.q},${cell.r}"]`)
    ).toBeTruthy();
    fireEvent.pointerDown(surface(), { ...at(cell), button: 0, pointerId: 7 });
    fireEvent.pointerUp(surface(), { ...at(cell), button: 0, pointerId: 7 });
    expect(storage.document().scope.concealments!.stash.cells).toBeUndefined();
    expect(storage.roomWrites()).toBe(writes + 2);
    fireEvent.click(
      screen.getByRole('button', { name: 'Done adding members' })
    );
    expect(screen.queryByText(/Adding members to stash/)).toBeNull();
    expect(document.querySelector('[data-concealed-cell]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(storage.document().scope.concealments!.stash.cells).toEqual([cell]);
  });

  it('a member already in another concealment is refused at the click, naming it', async () => {
    const storage = new MemoryStorage(withStash());
    mount(storage);
    await settled();
    fireEvent.click(button('Encounter'));
    section('Concealments');
    fireEvent.click(screen.getByRole('button', { name: 'stash' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Add members on the map' })
    );
    const writes = storage.roomWrites();
    const taken = { q: 1, r: 0 };
    fireEvent.pointerDown(surface(), { ...at(taken), button: 0, pointerId: 7 });
    fireEvent.pointerUp(surface(), { ...at(taken), button: 0, pointerId: 7 });
    expect(storage.roomWrites()).toBe(writes);
    expect(screen.getByRole('alert').textContent).toContain(
      'Hex q 1, r 0 is already hidden by studio-secret.'
    );
  });

  it('a stored draft with lifetime opens stripped and shows the notice naming the concealment', async () => {
    const document = createPopulatedStudioDocument();
    const storage = new MemoryStorage(document);
    const envelope = JSON.parse(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)!);
    envelope.scope.concealments['studio-secret'].attempts = {
      max: 2,
      lifetime: 'run',
    };
    storage.bytes.set(ROOM_DRAFT_STORAGE_KEY, JSON.stringify(envelope));
    mount(storage);
    await settled();
    expect(screen.getByRole('alert').textContent).toContain(
      'lifetime is not read by the engine; removed from studio-secret, attempts keep max and reset_hexes'
    );
    fireEvent.click(button('Encounter'));
    section('Concealments');
    expect(
      (
        screen.getByLabelText(
          'Max attempts for studio-secret'
        ) as HTMLInputElement
      ).value
    ).toBe('2');
    fireEvent.change(screen.getByLabelText('Reset hexes for studio-secret'), {
      target: { value: '3' },
    });
    expect(
      storage.document().scope.concealments!['studio-secret'].attempts
    ).toEqual({ max: 2, reset_hexes: 3 });
    expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).not.toContain('lifetime');
  });

  it("removing a concealment clears its door's Hidden by", async () => {
    const unnamed = createPopulatedStudioDocument();
    unnamed.scope.intel = [];
    delete unnamed.draft.room.propBindings!.table;
    const storage = new MemoryStorage(unnamed);
    mount(storage);
    await settled();
    fireEvent.click(button('Encounter'));
    section('Concealments');
    fireEvent.click(screen.getByRole('button', { name: 'Remove concealment' }));
    expect(storage.document().scope.concealments).toBeUndefined();
    fireEvent.click(button('Build'));
    const door = document.querySelector('[data-door-id="studio-door"]')!;
    fireEvent.pointerDown(door, { ...at(zero), button: 0, pointerId: 7 });
    fireEvent.pointerUp(door, { ...at(zero), button: 0, pointerId: 7 });
    const hidden = within(
      screen.getByRole('region', { name: 'Inspector' })
    ).getByLabelText('Hidden by') as HTMLSelectElement;
    expect(hidden.value).toBe('');
    expect([...hidden.options].map((option) => option.text)).toEqual([
      'Not hidden',
    ]);
  });
});

describe('S4 the draft as a file through the real owner', () => {
  const openFileOperation = (label: 'Import YAML' | 'Download YAML'): void => {
    if (!screen.queryByRole('region', { name: 'Site management' }))
      fireEvent.click(screen.getByRole('button', { name: 'Site' }));
    fireEvent.click(screen.getByRole('button', { name: label }));
  };
  const fileInput = (): HTMLInputElement => {
    if (!screen.queryByLabelText('Draft file to import'))
      openFileOperation('Import YAML');
    return screen.getByLabelText('Draft file to import') as HTMLInputElement;
  };
  const choose = async (name: string, text: string): Promise<void> => {
    const answered = () =>
      document.querySelector(
        '.es-draft-file-panel > [role="alertdialog"], .es-draft-file-panel > [role="alert"]'
      );
    const previous = answered()?.textContent ?? null;
    fireEvent.change(fileInput(), {
      target: { files: [new File([text], name, { type: 'text/yaml' })] },
    });
    await waitFor(() => {
      const now = answered()?.textContent ?? null;
      expect(now).not.toBeNull();
      expect(now).not.toBe(previous);
    });
  };
  const exported = async (): Promise<{
    name: string;
    text: string;
    type: string;
  }> => {
    let blob: Blob | undefined;
    const create = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((value) => {
        blob = value as Blob;
        return 'blob:draft';
      });
    const revoke = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});
    let name = '';
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        name = this.download;
      });
    fireEvent.click(
      screen.getByRole('button', { name: /^Download .*\.yaml$/ })
    );
    create.mockRestore();
    revoke.mockRestore();
    click.mockRestore();
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob!);
    });
    return { name, text, type: blob!.type };
  };

  it('export downloads the encoder bytes as {key}.yaml', async () => {
    const storage = new MemoryStorage(createCastleS4Document());
    mount(storage);
    await settled();
    openFileOperation('Download YAML');
    const key = screen.getByLabelText('File key') as HTMLInputElement;
    expect(key.value).toBe(defaultDraftKey(storage.document()));
    fireEvent.change(key, { target: { value: 'mad-king' } });
    const file = await exported();
    expect(file.name).toBe('mad-king.yaml');
    expect(file.type).toBe('text/yaml;charset=utf-8');
    expect(file.text).toBe(exportDraftYaml(storage.document(), 'mad-king'));
  });

  it('an accepted import is one history entry and undo restores the previous draft', async () => {
    const castle = createCastleS4Document();
    const storage = new MemoryStorage(createPopulatedStudioDocument());
    mount(storage);
    await settled();
    const before = storage.document();
    await choose('mad-king.yaml', exportDraftYaml(castle, 'mad-king'));
    const confirm = screen.getByRole('alertdialog', { name: 'Confirm import' });
    expect(confirm.textContent).toContain(castle.draft.name);
    expect(storage.document()).toEqual(before);
    fireEvent.click(
      within(confirm).getByRole('button', { name: 'Replace draft' })
    );
    expect(storage.document()).toEqual(castle);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(storage.document()).toEqual(before);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(storage.document()).toEqual(castle);
  });

  // An import replaces the whole document, so the Layout refits to it
  // (rpg-project#725 R3); before this, the castle opened cropped on the
  // previous room's frame until Show entire was pressed.
  it('an accepted import frames the imported content whole', async () => {
    const castle = createCastleS4Document();
    const storage = new MemoryStorage(createPopulatedStudioDocument());
    mount(storage);
    await settled();
    await choose('mad-king.yaml', exportDraftYaml(castle, 'mad-king'));
    fireEvent.click(screen.getByRole('button', { name: 'Replace draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Site' }));
    await settled();
    const content = contentBounds(storage.document().draft);
    for (const corner of [
      { x: content.minX, z: content.minZ },
      { x: content.maxX, z: content.maxZ },
    ]) {
      const client = toClient(corner, documentFit(storage));
      expect(client.clientX).toBeGreaterThanOrEqual(bounds.left);
      expect(client.clientX).toBeLessThanOrEqual(bounds.left + bounds.width);
      expect(client.clientY).toBeGreaterThanOrEqual(bounds.top);
      expect(client.clientY).toBeLessThanOrEqual(bounds.top + bounds.height);
    }
  });

  // A rectangle past the paint cap is refused with the cap in words, on the
  // owner's notice, not a silent empty selection.
  it('an oversized Rectangle shows the paint cap as a notice and changes nothing', async () => {
    const seeded = createPopulatedStudioDocument();
    const wide = {
      ...seeded,
      draft: paintCells(seeded.draft, [
        { q: -200, r: 0 },
        { q: 200, r: 0 },
      ]),
    };
    const storage = new MemoryStorage(wide);
    mount(storage);
    await settled();
    const before = storage.document();
    const writes = storage.roomWrites();
    fireEvent.click(button('Build'));
    fireEvent.click(button('Rectangle'));
    const zoomOut = surface();
    fireEvent.wheel(zoomOut, {
      deltaY: 4000,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    });
    const from = { clientX: bounds.left + 1, clientY: bounds.top + 1 };
    const to = {
      clientX: bounds.left + bounds.width - 1,
      clientY: bounds.top + bounds.height - 1,
    };
    fireEvent.pointerDown(surface(), { ...from, pointerId: 9, button: 0 });
    fireEvent.pointerMove(surface(), { ...to, pointerId: 9 });
    fireEvent.pointerUp(surface(), { ...to, pointerId: 9, button: 0 });
    expect(screen.getByRole('alert').textContent).toContain(
      `A rectangle selects at most ${MAX_FLOOR_HEXES} cells.`
    );
    expect(storage.document()).toEqual(before);
    expect(storage.roomWrites()).toBe(writes);
  });

  it('the next export defaults to the imported key', async () => {
    const storage = new MemoryStorage(createPopulatedStudioDocument());
    mount(storage);
    await settled();
    await choose(
      'mad-king.yaml',
      exportDraftYaml(createCastleS4Document(), 'mad-king')
    );
    fireEvent.click(screen.getByRole('button', { name: 'Replace draft' }));
    openFileOperation('Download YAML');
    expect((screen.getByLabelText('File key') as HTMLInputElement).value).toBe(
      'mad-king'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close Site' }));
    openFileOperation('Download YAML');
    expect((screen.getByLabelText('File key') as HTMLInputElement).value).toBe(
      'mad-king'
    );
  });

  it('a v2 file and a typo are refused, naming the dialect and the field, and change nothing', async () => {
    const storage = new MemoryStorage(createPopulatedStudioDocument());
    mount(storage);
    await settled();
    const before = storage.document();
    const writes = storage.roomWrites();
    await choose('reference-tomb.yaml', referenceTombYaml);
    expect(screen.getByRole('alert').textContent).toBe(
      'This file is a version 2 dungeon, the multi-room dialect. The studio opens single-room files, version 3 or 4.'
    );
    await choose(
      'typo.yaml',
      exportDraftYaml(createCastleS4Document(), 'castle').replace(
        /^endings:/m,
        'endngs:'
      )
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Could not import: Unsupported single-room field: endngs.'
    );
    expect(
      screen.queryByRole('alertdialog', { name: 'Confirm import' })
    ).toBeNull();
    expect(storage.document()).toEqual(before);
    expect(storage.roomWrites()).toBe(writes);
  });
});

describe('S4 renames rewrite references; removes are refused while named (rpg-project#578)', () => {
  let session!: EncounterStudioSession;
  const owner = {
    get session() {
      return session;
    },
  };
  const mountStudio = (
    document: RoomDraftDocument = createCastleS4Document()
  ): typeof owner => {
    render(
      <WorldBuildingConcept
        roomMode
        compositionSource={source}
        storage={new MemoryStorage(document)}
        studioPresentation={{
          home: 'build',
          view: '3d',
          render: (next) => {
            session = next;
            return null;
          },
        }}
      />
    );
    return owner;
  };

  it('renaming a concealment rewrites its intel and its door Hidden by in one step', () => {
    const owner = mountStudio();
    const before = owner.session.document;
    act(() => {
      expect(owner.session.concealments.rename('studio-secret', 'cellar')).toBe(
        true
      );
    });
    const scope = owner.session.document.scope;
    expect(Object.keys(scope.concealments!)).toContain('cellar');
    expect(scope.concealments!['studio-secret']).toBeUndefined();
    expect(scope.intel).toContainEqual({
      id: 'studio-map',
      reveals: { concealment: 'cellar' },
    });
    expect(concealmentHiding(scope, 'studio-door')).toBe('cellar');
    act(() => owner.session.undo());
    expect(owner.session.document).toEqual(before);
  });

  it('removing a concealment that intel names is refused, naming the intel', () => {
    const owner = mountStudio();
    const before = owner.session.document;
    act(() => {
      expect(
        owner.session.concealments.update('studio-secret', undefined)
      ).toBe(false);
    });
    expect(owner.session.document).toBe(before);
    expect(owner.session.notice).toContain(
      'Concealment studio-secret is still named by intel studio-map. Change or remove those first.'
    );
    act(() => {
      expect(owner.session.concealments.update('stash', undefined)).toBe(true);
    });
    expect(owner.session.document.scope.concealments!.stash).toBeUndefined();
  });

  it('renaming an exit rewrites the scenario that binds it in one step', () => {
    const owner = mountStudio();
    const before = owner.session.document;
    act(() => {
      expect(owner.session.exits.set({ q: 2, r: 0 }, 'gate')).toBe(true);
    });
    const scope = owner.session.document.scope;
    expect(scope.exits?.[0]).toEqual({ id: 'gate', cell: { q: 2, r: 0 } });
    expect(scope.scenarios?.['studio-scenario']?.exit).toBe('gate');
    act(() => owner.session.undo());
    expect(owner.session.document).toEqual(before);
  });

  it('removing an exit a scenario binds is refused, naming the binding', () => {
    const owner = mountStudio();
    const before = owner.session.document;
    act(() => {
      expect(owner.session.exits.set({ q: 2, r: 0 }, null)).toBe(false);
    });
    expect(owner.session.document).toBe(before);
    expect(owner.session.notice).toContain(
      'Exit studio-exit is still named by scenario studio-scenario exit. Change or remove those first.'
    );
    const postern = before.scope.exits!.find((exit) => exit.id === 'postern')!;
    act(() => {
      expect(owner.session.exits.set(postern.cell, null)).toBe(true);
    });
    expect(owner.session.document.scope.exits?.map((exit) => exit.id)).toEqual([
      'studio-exit',
    ]);
  });
});

describe('S4 scenario bindings follow the exit, not a namesake (rpg-project#578 review)', () => {
  let session!: EncounterStudioSession;
  const mountCastle = (document: RoomDraftDocument): void => {
    render(
      <WorldBuildingConcept
        roomMode
        compositionSource={source}
        storage={new MemoryStorage(document)}
        studioPresentation={{
          home: 'build',
          view: '3d',
          render: (next) => {
            session = next;
            return null;
          },
        }}
      />
    );
  };

  it('an exit and a concealment that share an id: each rename moves only its own references', () => {
    const castle = createCastleS4Document();
    const postern = castle.scope.exits!.find((exit) => exit.id === 'postern')!;
    castle.scope.concealments!.postern = {
      checks: [{ ability: 'investigation', dc: 12 }],
      cells: [floorCells(castle.draft)[7]!],
    };
    castle.scope.scenarios = {
      ...castle.scope.scenarios,
      escape: { exit: 'postern' },
    };
    mountCastle(castle);
    act(() => {
      expect(session.exits.set(postern.cell, 'sally-port')).toBe(true);
    });
    expect(session.document.scope.scenarios?.escape).toEqual({
      exit: 'sally-port',
    });
    expect(session.document.scope.concealments?.postern).toBeTruthy();
    act(() => {
      expect(session.concealments.rename('postern', 'cache')).toBe(true);
    });
    expect(session.document.scope.scenarios?.escape).toEqual({
      exit: 'sally-port',
    });
    expect(session.document.scope.concealments?.cache).toBeTruthy();
  });

  it('a binding an exit shares with a creature is left to the creature', () => {
    const castle = createCastleS4Document();
    const postern = castle.scope.exits!.find((exit) => exit.id === 'postern')!;
    postern.id = 'captain';
    castle.scope.scenarios = {
      ...castle.scope.scenarios,
      regicide: { target: 'captain' },
    };
    mountCastle(castle);
    act(() => {
      expect(session.exits.set(postern.cell, 'gate')).toBe(true);
    });
    expect(session.document.scope.scenarios?.regicide).toEqual({
      target: 'captain',
    });
    act(() => {
      expect(session.exits.set(postern.cell, null)).toBe(true);
    });
  });
});

describe('S4 a stored concealment that hides nothing (rpg-project#578 review)', () => {
  const section = (name: string): void => {
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Encounter tools' })
      ).getByRole('button', { name })
    );
  };

  it('opens with the refusal on the form and cannot be saved until a member is picked', async () => {
    const castle = createCastleS4Document();
    const storage = new MemoryStorage(castle);
    const envelope = JSON.parse(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)!);
    envelope.scope.concealments.empty = {
      checks: [{ ability: 'investigation', dc: 12 }],
    };
    const stored = JSON.stringify(envelope);
    storage.bytes.set(ROOM_DRAFT_STORAGE_KEY, stored);
    mount(storage);
    await settled();
    expect(
      screen.getByRole('button', {
        name: `Rename encounter ${castle.draft.name}`,
      })
    ).toBeTruthy();
    expect(screen.queryByText(/Room draft load failed/)).toBeNull();
    fireEvent.click(button('Encounter'));
    section('Concealments');
    fireEvent.click(screen.getByRole('button', { name: 'empty' }));
    const form = within(
      screen.getByRole('group', { name: 'Concealment empty' })
    );
    expect(form.getByRole('heading', { name: 'Members (0)' })).toBeTruthy();
    expect(form.getByRole('alert').textContent).toContain(
      'this concealment hides nothing'
    );
    fireEvent.change(form.getByLabelText('DC for check 1 of empty search'), {
      target: { value: '13' },
    });
    expect(storage.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(stored);
    expect(
      screen
        .getAllByRole('alert')
        .some((node) =>
          node.textContent?.includes(
            'Site concealment empty: this concealment hides nothing'
          )
        )
    ).toBe(true);
    fireEvent.click(
      form.getByRole('button', {
        name: 'Add members on the map',
        exact: true,
      } as never)
    );
    const cell = floorCells(castle.draft).find(
      (hex) =>
        Math.abs(hex.q) <= 2 &&
        hex.r === 1 &&
        !Object.values(castle.scope.concealments ?? {}).some((spec) =>
          spec.cells?.some((c) => c.q === hex.q && c.r === hex.r)
        )
    )!;
    fireEvent.pointerDown(surface(), { ...at(cell), button: 0, pointerId: 7 });
    fireEvent.pointerUp(surface(), { ...at(cell), button: 0, pointerId: 7 });
    // The castle frames differently from the test frame, so the clicked
    // hex is whichever walkable hex lies under the point; any one member
    // makes the concealment savable.
    const saved = storage.document().scope.concealments!.empty;
    expect(saved.checks).toEqual([{ ability: 'investigation', dc: 13 }]);
    expect(saved.cells).toHaveLength(1);
  });
});

describe('S1 the cast through the real owner', () => {
  const member = (name: string): HTMLElement =>
    within(screen.getByRole('list', { name: 'Cast members' })).getByRole(
      'button',
      { name: new RegExp(`^${name} ·`) }
    );

  const inspector = () =>
    within(screen.getByRole('region', { name: 'Inspector' }));
  const highlighted = (): string[] =>
    [...(viewport().roomAuthoring?.highlightedActorIds ?? [])].sort();
  const withGoblin = (): RoomDraftDocument => {
    const document = createGuardCastDocument();
    document.draft.room.monsterDeclarations.push({
      id: 'goblin-1',
      ref: 'dnd5e:monsters:goblin',
      startingCell: { location: { q: 3, r: 0 } },
    });
    return document;
  };

  it('selecting a cast member highlights exactly its placements', async () => {
    const storage = new MemoryStorage(withGoblin());
    mount(storage);
    await settled();
    switchTo('3D');
    expect(highlighted()).toEqual([]);
    fireEvent.click(button('Encounter'));
    fireEvent.click(member('Guard'));
    fireEvent.click(button('Build'));
    expect(highlighted()).toEqual(['gate-1', 'gate-2']);
    // One selection, not a set: no single placement is the selection.
    expect(viewport().roomAuthoring?.selectedActorId).toBeNull();
    expect(
      inspector().getByRole('heading', { level: 2, name: 'Guard' })
    ).toBeTruthy();
    expect(
      inspector().getByRole('form', { name: 'Cast member Guard' })
    ).toBeTruthy();
    // Clicking a highlighted placement selects that placement.
    act(() =>
      viewport().roomAuthoring!.onSelectActorTarget!({
        kind: 'actor',
        id: 'gate-2',
      })
    );
    expect(highlighted()).toEqual([]);
    expect(inspector().getByLabelText('Map name')).toBeTruthy();
    expect(
      inspector()
        .getAllByRole('term')
        .find((dt) => dt.firstChild?.textContent?.trim() === 'Cast member')
        ?.nextElementSibling?.textContent?.trim()
    ).toBe('Guard · stat block guard');
    // The member link in a creature view selects the member again.
    fireEvent.click(
      inspector().getByRole('button', { name: 'Open cast member Guard' })
    );
    expect(highlighted()).toEqual(['gate-1', 'gate-2']);
  });

  it("deleting the selected member's template falls back to nothing", async () => {
    const document = createGuardCastDocument();
    document.draft.room.monsterDeclarations = [];
    const storage = new MemoryStorage(document);
    mount(storage);
    await settled();
    fireEvent.click(button('Encounter'));
    fireEvent.click(member('Guard'));
    fireEvent.click(button('Delete cast member'));
    expect(storage.document().scope).not.toHaveProperty('templates');
    fireEvent.click(button('Build'));
    expect(
      inspector().getByRole('heading', { level: 2, name: 'Room' })
    ).toBeTruthy();
    switchTo('3D');
    expect(highlighted()).toEqual([]);
  });

  it('undo after a shuffle restores every look', async () => {
    const original = createGuardCastDocument();
    const storage = new MemoryStorage(original);
    mount(storage);
    await settled();
    fireEvent.click(button('Encounter'));
    fireEvent.click(member('Guard'));
    fireEvent.click(button('Shuffle looks'));
    const looks = (): (string | undefined)[] =>
      storage
        .document()
        .draft.room.monsterDeclarations.map((monster) => monster.appearanceRef);
    const shuffled = looks();
    expect(new Set(shuffled).size).toBe(2);
    expect(shuffled).not.toEqual([SOLDIER, SOLDIER]);
    fireEvent.click(button('Undo'));
    expect(looks()).toEqual([SOLDIER, SOLDIER]);
    expect(storage.document()).toEqual(original);
  });

  it('undo after a cast rename restores the old id on every placement', async () => {
    const original = createGuardCastDocument();
    const storage = new MemoryStorage(original);
    mount(storage);
    await settled();
    fireEvent.click(button('Encounter'));
    fireEvent.click(member('Guard'));
    fireEvent.click(button('Advanced editor'));
    fireEvent.change(screen.getByLabelText('Cast member id'), {
      target: { value: 'gate-guard' },
    });
    fireEvent.click(button('Apply'));
    const refs = (): string[] =>
      storage
        .document()
        .draft.room.monsterDeclarations.map((monster) => monster.ref);
    expect(refs()).toEqual([
      'dnd5e:monsters:gate-guard',
      'dnd5e:monsters:gate-guard',
    ]);
    expect(Object.keys(storage.document().scope.templates ?? {})).toEqual([
      'gate-guard',
    ]);
    fireEvent.click(button('Undo'));
    expect(storage.document()).toEqual(original);
    expect(refs()).toEqual([GUARD, GUARD]);
    fireEvent.click(button('Redo'));
    expect(refs()).toEqual([
      'dnd5e:monsters:gate-guard',
      'dnd5e:monsters:gate-guard',
    ]);
  });
});

it('the imported castle cast can place using existing looks without inventing cast defaults', async () => {
  const read = readDraftYaml(referenceCastleYaml);
  if (!read.ok) throw new Error(read.refusal);
  // Keep the imported templates and exact king appearance, but use a small
  // room for this owner test. Full castle geometry is exercised in the browser.
  const original = createEmptyCastDocument();
  original.scope.templates = read.scope.templates;
  original.draft.room.monsterDeclarations = read.draft.room.monsterDeclarations
    .filter((entry) => entry.ref === 'dnd5e:monsters:mad-king')
    .map((entry) => ({ ...entry, startingCell: { location: { q: 0, r: 0 } } }));
  const storage = new MemoryStorage(original);
  mount(storage);
  await settled();
  switchTo('3D');
  fireEvent.click(button('Monsters & NPCs'));
  const palette = within(
    screen.getByRole('region', { name: 'Monsters and NPCs palette' })
  );
  const members = within(palette.getByRole('list', { name: 'Cast' }));
  // Every imported member's picker is covered by StudioCreaturePalette.test;
  // this real-owner check drives the screenshot's Mad King all the way to disk.
  fireEvent.click(members.getByRole('button', { name: 'The Mad King' }));
  expect(
    (palette.getByRole('button', { name: 'Place on map' }) as HTMLButtonElement)
      .disabled
  ).toBe(false);
  expect(storage.document()).toEqual(original);
  fireEvent.click(palette.getByRole('button', { name: 'Place on map' }));
  act(() => viewport().roomAuthoring!.onPlaceMonster!({ q: 1, r: 0 }));
  const placed = storage.document().draft.room.monsterDeclarations.at(-1)!;
  expect(placed).toMatchObject({
    ref: 'dnd5e:monsters:mad-king',
    appearanceRef: 'dnd5e:npcs:kingdom:prince-01',
    startingCell: { location: { q: 1, r: 0 } },
  });
  expect(storage.document().draft.scene.creaturePalette).toEqual(
    original.draft.scene.creaturePalette
  );
  expect(storage.document().scope.templates).toEqual(original.scope.templates);
  fireEvent.click(button('Undo'));
  expect(storage.document()).toEqual(original);
});

it('Remove from board uses the selected NPC inspector and keeps the cast', async () => {
  const original = createGuardCastDocument();
  const storage = new MemoryStorage(original);
  mount(storage);
  await settled();
  switchTo('3D');
  act(() =>
    viewport().roomAuthoring!.onSelectActorTarget!({
      kind: 'actor',
      id: 'gate-1',
    })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove from board' }));
  expect(
    storage.document().draft.room.monsterDeclarations.map((entry) => entry.id)
  ).toEqual(['gate-2']);
  expect(storage.document().draft.scene.creaturePalette).toEqual(
    original.draft.scene.creaturePalette
  );
  fireEvent.click(button('Undo'));
  expect(storage.document()).toEqual(original);
});

describe('S1 placing a cast member stamps its defaults', () => {
  function castOwner(document: RoomDraftDocument) {
    const storage = new MemoryStorage(document);
    let session: EncounterStudioSession;
    let ids = 0;
    render(
      <WorldBuildingConcept
        roomMode
        storage={storage}
        idFactory={() => `placed-${(ids += 1)}`}
        studioPresentation={{
          view: '3d',
          render: (next) => {
            session = next;
            return null;
          },
        }}
      />
    );
    return {
      get session() {
        return session!;
      },
      storage,
      /** Arm and place; returns the new placement's id. */
      place(ref: string, look: string, q: number): string | undefined {
        act(() => {
          expect(session.creatures.armPlacement(ref, look)).toBe(true);
        });
        act(() =>
          session.viewportProps.roomAuthoring!.onPlaceMonster!({ q, r: 0 })
        );
        return session.document.draft.room.monsterDeclarations.at(-1)?.id;
      },
    };
  }
  const LOOK = 'dnd5e:npcs:kingdom:soldier-male-01-style-02-b';
  const withGuardRecipe = (): RoomDraftDocument => {
    const document = createGuardCastDocument();
    document.draft.room.monsterDeclarations = [];
    return document;
  };

  it.each([
    'thug',
    'goblin',
    'goblin-boss',
    'skeleton',
    'skeleton-captain',
    'zombie',
    'bandit',
  ])(
    'places a standard %s without an appearance override or a new template',
    (kind) => {
      const document = withGuardRecipe();
      const owner = castOwner(document);
      const ref = `dnd5e:monsters:${kind}`;
      act(() => {
        expect(
          owner.session.cast.save({ ref, defaults: { name: 'Named creature' } })
        ).toBe(true);
      });
      const before = owner.session.document;
      const id = owner.place(ref, '', 0)!;
      expect(owner.session.document.draft.room.monsterDeclarations).toEqual([
        { id, ref, startingCell: { location: { q: 0, r: 0 } } },
      ]);
      expect(owner.session.document.scope.templates).toEqual(
        document.scope.templates
      );
      const file = exportDraftYaml(owner.session.document, 'standard-cast');
      expect(file).not.toContain('appearance_ref:');
      const reopened = readDraftYaml(file);
      if (!reopened.ok) throw new Error(reopened.refusal);
      expect(reopened.draft.scene.creaturePalette).toEqual(
        owner.session.document.draft.scene.creaturePalette
      );
      expect(reopened.draft.room.monsterDeclarations).toEqual(
        owner.session.document.draft.room.monsterDeclarations
      );
      act(() => owner.session.undo());
      expect(owner.session.document).toEqual(before);
      act(() => owner.session.redo());
      expect(
        owner.session.document.draft.room.monsterDeclarations[0]
      ).not.toHaveProperty('appearanceRef');
    }
  );

  it('a zombie can look human without changing its rules or existing placements', () => {
    const owner = castOwner(withGuardRecipe());
    const ref = 'dnd5e:monsters:zombie';
    act(() => {
      expect(
        owner.session.cast.save({ ref, defaults: { name: 'Villager' } })
      ).toBe(true);
    });
    const first = owner.place(ref, '', 0)!;
    act(() => {
      expect(
        owner.session.cast.save({
          ref,
          defaults: {
            name: 'Villager',
            modelRef: 'dnd5e:npcs:kingdom:soldier-male-01',
          },
        })
      ).toBe(true);
    });
    const second = owner.place(ref, LOOK, 1)!;
    expect(owner.session.document.draft.room.monsterDeclarations).toEqual([
      { id: first, ref, startingCell: { location: { q: 0, r: 0 } } },
      {
        id: second,
        ref,
        appearanceRef: LOOK,
        startingCell: { location: { q: 1, r: 0 } },
      },
    ]);
    expect(owner.session.document.scope.templates).not.toHaveProperty('zombie');
  });

  it('placing writes the ref, the chosen look and the name in one history entry', () => {
    const owner = castOwner(withGuardRecipe());
    const before = owner.session.document;
    const id = owner.place(GUARD, LOOK, 0)!;
    const after = owner.session.document;
    expect(after.draft.room.monsterDeclarations).toEqual([
      {
        id,
        ref: GUARD,
        appearanceRef: LOOK,
        startingCell: { location: { q: 0, r: 0 } },
      },
    ]);
    expect(after.draft.scene.actorNames).toEqual({ [id]: 'Guard' });
    // The stat block is followed by id: the template is not copied.
    expect(after.scope.templates).toEqual(before.scope.templates);
    act(() => owner.session.undo());
    expect(owner.session.document).toEqual(before);
    expect(owner.session.canUndo).toBe(false);
  });

  it('keeps an imported rulebook cast member when its last placement is removed', () => {
    const document = withGuardRecipe();
    document.draft.room.monsterDeclarations = [
      {
        id: 'last-skeleton',
        ref: 'dnd5e:monsters:skeleton',
        startingCell: { location: { q: 0, r: 0 } },
      },
    ];
    const owner = castOwner(document);
    act(() => {
      expect(owner.session.creatures.select('last-skeleton')).toBe(true);
    });
    act(() => {
      expect(
        owner.session.commitArrange({
          kind: 'actor-remove',
          target: { kind: 'actor', id: 'last-skeleton' },
        })
      ).toBe(true);
    });
    expect(owner.session.document.draft.room.monsterDeclarations).toEqual([]);
    expect(owner.session.document.draft.scene.creaturePalette).toContainEqual(
      expect.objectContaining({
        ref: 'dnd5e:monsters:skeleton',
        name: 'Skeleton',
      })
    );
    act(() => owner.session.undo());
    expect(owner.session.document).toEqual(document);
  });

  it('removes only the selected NPC, retains its cast and restores bindings and looks with Undo', () => {
    const owner = castOwner(withGuardRecipe());
    const first = owner.place(GUARD, LOOK, 0)!;
    const second = owner.place(GUARD, LOOK, 1)!;
    act(() => {
      expect(owner.session.creatures.select(first)).toBe(true);
    });
    const staleRemove = owner.session.commitArrange;
    act(() => {
      expect(owner.session.creatures.select(second)).toBe(true);
    });
    const before = owner.session.document;
    act(() => {
      expect(
        staleRemove({
          kind: 'actor-remove',
          target: { kind: 'actor', id: first },
        })
      ).toBe(false);
    });
    expect(owner.session.document).toEqual(before);
    act(() => {
      owner.session.publishing.setBusy(true);
    });
    act(() => {
      expect(
        owner.session.commitArrange({
          kind: 'actor-remove',
          target: { kind: 'actor', id: second },
        })
      ).toBe(false);
    });
    expect(owner.session.document).toEqual(before);
    act(() => {
      owner.session.publishing.setBusy(false);
    });
    act(() => {
      expect(
        owner.session.commitArrange({
          kind: 'actor-remove',
          target: { kind: 'actor', id: second },
        })
      ).toBe(true);
    });
    expect(
      owner.session.document.draft.room.monsterDeclarations.map(
        (entry) => entry.id
      )
    ).toEqual([first]);
    expect(
      owner.session.document.draft.room.monsterBindings
    ).not.toHaveProperty(second);
    expect(owner.session.document.draft.scene.creaturePalette).toEqual(
      before.draft.scene.creaturePalette
    );
    expect(owner.session.document.scope.templates).toEqual(
      before.scope.templates
    );
    expect(owner.session.arrange).toBeNull();
    act(() => owner.session.undo());
    expect(owner.session.document).toEqual(before);
    act(() => owner.session.redo());
    expect(
      owner.session.document.draft.room.monsterDeclarations.map(
        (entry) => entry.id
      )
    ).toEqual([first]);
  });

  it('placing stamps the default faction onto the binding', () => {
    const owner = castOwner(withGuardRecipe());
    const id = owner.place(GUARD, LOOK, 0)!;
    expect(owner.session.document.draft.room.monsterBindings).toEqual({
      [id]: { faction: 'garrison' },
    });
  });

  it('a stale default faction refuses the placement without a history entry', () => {
    const document = withGuardRecipe();
    document.scope.factions = [{ id: 'kitchen' }];
    const owner = castOwner(document);
    const before = owner.session.document;
    owner.place(GUARD, LOOK, 0);
    expect(owner.session.document).toEqual(before);
    expect(owner.session.canUndo).toBe(false);
    expect(owner.session.notice).toBe(
      "Guard's default faction garrison no longer exists. Choose another in the cast."
    );
  });

  it('changing the default faction afterwards leaves the placed binding unchanged', () => {
    const owner = castOwner(withGuardRecipe());
    const first = owner.place(GUARD, LOOK, 0)!;
    act(() => {
      expect(
        owner.session.cast.save({
          ref: GUARD,
          defaults: {
            name: 'Guard',
            modelRef: 'dnd5e:npcs:kingdom:soldier-male-01',
            faction: 'kitchen',
          },
        })
      ).toBe(true);
    });
    const document = owner.session.document;
    expect(document.draft.scene.creaturePalette?.[0]?.faction).toBe('kitchen');
    expect(document.draft.room.monsterBindings).toEqual({
      [first]: { faction: 'garrison' },
    });
    const second = owner.place(GUARD, LOOK, 1)!;
    expect(owner.session.document.draft.room.monsterBindings).toEqual({
      [first]: { faction: 'garrison' },
      [second]: { faction: 'kitchen' },
    });
  });

  it('a member without a default look still refuses an unavailable placement appearance', () => {
    const owner = castOwner(createPopulatedStudioDocument());
    const before = owner.session.document;
    act(() => {
      expect(
        owner.session.creatures.armPlacement(
          'dnd5e:monsters:goblin',
          'dnd5e:npcs:unpublished:missing'
        )
      ).toBe(false);
    });
    expect(owner.session.notice).toContain(
      'Choose a default look in the cast to place it.'
    );
    act(() => {
      expect(
        owner.session.creatures.armPlacement(
          'dnd5e:monsters:nobody',
          'dnd5e:npcs:kingdom:soldier-male-01'
        )
      ).toBe(false);
    });
    expect(owner.session.viewportProps.roomAuthoring?.tool).not.toBe('monster');
    expect(owner.session.document).toEqual(before);
  });

  it('a look outside the default family cannot be armed', () => {
    const owner = castOwner(withGuardRecipe());
    act(() => {
      expect(
        owner.session.creatures.armPlacement(
          GUARD,
          'dnd5e:npcs:kingdom:peasant-male-01'
        )
      ).toBe(false);
    });
  });
});

describe('the studio 3D canvas stays mounted across view switches (#1271)', () => {
  it('Layout → 3D → Layout → 3D creates one Canvas and pauses rendering while hidden', async () => {
    mount(new MemoryStorage(createPopulatedStudioDocument()));
    await settled();
    expect(boundary.mounts).toBe(0);
    switchTo('3D');
    expect(boundary.mounts).toBe(1);
    expect(boundary.frameloop).toBe('always');
    const canvas = screen.getByTestId('webgl-boundary');
    switchTo('Layout');
    expect(screen.getByTestId('webgl-boundary')).toBe(canvas);
    expect(boundary.frameloop).toBe('never');
    switchTo('3D');
    expect(boundary.mounts).toBe(1);
    expect(boundary.frameloop).toBe('always');
    for (let cycle = 0; cycle < 4; cycle++) {
      switchTo('Layout');
      switchTo('3D');
    }
    expect(boundary.mounts).toBe(1);
    expect(screen.getByTestId('webgl-boundary')).toBe(canvas);
    // The encounter home hides the map: rendering pauses there too.
    fireEvent.click(button('Encounter'));
    expect(boundary.frameloop).toBe('never');
    fireEvent.click(button('Build'));
    expect(boundary.frameloop).toBe('always');
    // Studio profile: capped pixel ratio, no shadow pass.
    expect(boundary.dpr).toEqual([1, 1.25]);
    expect(boundary.shadows).toBe(false);
  });

  it('a lost WebGL context shows a restore action that remounts the canvas', async () => {
    mount(new MemoryStorage(createPopulatedStudioDocument()));
    await settled();
    switchTo('3D');
    const lost = new Event('webglcontextlost', { cancelable: true });
    act(() => {
      boundary.element!.dispatchEvent(lost);
    });
    expect(lost.defaultPrevented).toBe(true);
    const restore = screen.getByRole('button', {
      name: '3D view lost its graphics context, click to restore',
    });
    fireEvent.click(restore);
    expect(boundary.mounts).toBe(2);
    expect(
      screen.queryByRole('button', {
        name: '3D view lost its graphics context, click to restore',
      })
    ).toBeNull();
    // The new canvas is watched too, and a browser restore clears it.
    act(() => {
      boundary.element!.dispatchEvent(
        new Event('webglcontextlost', { cancelable: true })
      );
    });
    expect(screen.getByRole('alert').textContent).toMatch(/lost its graphics/);
    act(() => {
      boundary.element!.dispatchEvent(new Event('webglcontextrestored'));
    });
    expect(
      screen.queryByRole('button', {
        name: '3D view lost its graphics context, click to restore',
      })
    ).toBeNull();
  });
});

describe('S3 the overview through the real owner', () => {
  const inspector = () =>
    within(screen.getByRole('region', { name: 'Inspector' }));
  const glyph = (selector: string): Element =>
    screen
      .getByRole('application', { name: 'Layout floor surface' })
      .querySelector(selector)!;

  it('clicking a drawn creature, prop or party start in Layout opens its inspector view', async () => {
    mount(new MemoryStorage(createCastleReadBackDocument()));
    await settled();
    fireEvent.pointerDown(glyph('[data-placed-creature="cook"] circle'), {
      button: 0,
    });
    expect(
      inspector().getByRole('region', { name: 'Read back' }).textContent
    ).toContain('cook, a Commoner of the kitchen');
    fireEvent.pointerDown(glyph('[data-placed-prop="altar"]'), { button: 0 });
    expect(inspector().getByRole('heading', { level: 2 }).textContent).toBe(
      'Altar'
    );
    fireEvent.pointerDown(glyph('[data-placed-prop="ledger"]'), {
      button: 0,
      shiftKey: true,
    });
    expect(inspector().getByRole('heading', { level: 2 }).textContent).toBe(
      '2 props picked'
    );
    fireEvent.pointerDown(glyph('[data-placed-start] polygon'), { button: 0 });
    expect(
      inspector().getByRole('button', { name: 'Move party start' })
    ).toBeTruthy();
  });

  /** Where a world point lands on the Layout surface, read from the drawn
   * floor's transform. */
  const onSurface = (point: { x: number; z: number }) => {
    const [, tx, ty, scale] = surface()
      .querySelector('.encounter-studio-layout-committed')!
      .getAttribute('transform')!
      .match(/translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\)/)!
      .map(Number);
    return { x: tx + point.x * scale, y: ty + point.z * scale, scale };
  };
  const centreOf = (b: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  }) => ({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 });

  it('selecting a room selects its label and frames it', async () => {
    mount(new MemoryStorage(createCastleKeepDocument()));
    await settled();
    const before = onSurface({ x: 0, z: 0 }).scale;
    const rooms = within(screen.getByRole('list', { name: 'Room list' }));
    const gatehouse = KEEP_ROOMS.find((room) => room.id === 'gatehouse')!;
    const cells = keepRoomCells(gatehouse);
    const row = rooms.getByRole('button', { name: /^Room Gatehouse,/ });
    expect(row.textContent).toContain(`${cells.length} hexes · 9 × 6`);
    fireEvent.click(row);
    expect(row.getAttribute('aria-pressed')).toBe('true');
    expect(inspector().getByRole('heading', { level: 2 }).textContent).toBe(
      'Gatehouse'
    );
    const framed = onSurface(centreOf(cellsBounds(cells)!));
    expect(framed.x).toBeCloseTo(bounds.width / 2, 3);
    expect(framed.y).toBeCloseTo(bounds.height / 2, 3);
    expect(framed.scale).toBeGreaterThan(before);
  });

  it('Show entire frames the content bounds', async () => {
    const document = createCastleKeepDocument();
    mount(new MemoryStorage(document));
    await settled();
    fireEvent.click(
      within(screen.getByRole('list', { name: 'Room list' })).getByRole(
        'button',
        { name: /^Room Chapel,/ }
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show entire' }));
    const content = contentBounds(document.draft);
    const centre = onSurface(centreOf(content));
    expect(centre.x).toBeCloseTo(bounds.width / 2, 3);
    expect(centre.y).toBeCloseTo(bounds.height / 2, 3);
    // The whole floor fits on the surface.
    const corner = onSurface({ x: content.maxX, z: content.maxZ });
    expect(corner.x).toBeLessThanOrEqual(bounds.width + 1e-6);
    expect(corner.y).toBeLessThanOrEqual(bounds.height + 1e-6);
  });

  it('the footer counts areas, creatures, hexes and doors', async () => {
    mount(new MemoryStorage(createCastleKeepDocument()));
    await settled();
    // Eight rooms plus the implicit region holding the rest of the floor
    // (rpg-project#725: every painted region is an area); the castle cast's
    // six placements and the front room's three; 73 × 48 floor; the studio
    // door and five keep doors.
    expect(screen.getByLabelText('Layout counts').textContent).toBe(
      '9 areas · 9 creatures · 3504 hexes · 6 doors'
    );
  });

  it('the real castle counts its nine named regions and the implicit one', async () => {
    const read = readDraftYaml(referenceCastleYaml);
    if (!read.ok) throw new Error(read.refusal);
    expect(
      read.draft.room.regions.filter(
        (region) => region.id !== read.draft.room.implicitRegionId
      )
    ).toHaveLength(9);
    expect(floorCells(read.draft)).toHaveLength(1586);
    mount(new MemoryStorage({ draft: read.draft, scope: read.scope }));
    await settled();
    expect(screen.getByLabelText('Layout counts').textContent).toMatch(
      /^10 areas · \d+ creatures · 1586 hexes · \d+ doors$/
    );
  });

  const row = (name: string): HTMLElement =>
    within(screen.getByRole('list', { name: 'Room list' })).getByRole(
      'button',
      { name: new RegExp(`^Room ${name},`) }
    );
  const pressed = (name: string): string | null =>
    within(screen.getByRole('navigation', { name: 'Studio home' }))
      .getByRole('button', { name })
      .getAttribute('aria-pressed');

  // The walk's "Chapel annex" box (rpg-project#730): New region is active,
  // paint lands in it, a rename moves its map label, removal returns its
  // cells to the implicit region and the floor never changes.
  it('New region is active; it paints, its label follows a rename, and removal returns its cells', async () => {
    const storage = new MemoryStorage(createCastleKeepDocument());
    mount(storage);
    await settled();
    const regions = () => storage.document().draft.room.regions;
    const implicit = storage.document().draft.room.implicitRegionId;
    const floor = floorCells(storage.document().draft);
    fireEvent.click(button('Build'));
    fireEvent.change(screen.getByLabelText('New region name'), {
      target: { value: 'Chapel annex' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'New region' }));
    const annex = regions().find((r) => r.name === 'Chapel annex')!;
    expect(annex.cells).toEqual([]);
    expect(
      (
        screen.getByRole('radio', {
          name: 'Paint into Chapel annex',
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
    // Ten courtyard cells, one stroke along a row.
    const row = keepRoomCells(
      KEEP_ROOMS.find((room) => room.id === 'courtyard')!
    ).filter((cell) => cell.r === 0);
    const ten = row.slice(10, 20);
    fireEvent.click(button('Paint'));
    fireEvent.pointerDown(surface(), {
      ...at(ten[0]!),
      pointerId: 7,
      button: 0,
    });
    for (const cell of ten.slice(1))
      fireEvent.pointerMove(surface(), { ...at(cell), pointerId: 7 });
    fireEvent.pointerUp(surface(), {
      ...at(ten.at(-1)!),
      pointerId: 7,
      button: 0,
    });
    expect(regionCells(regions().find((r) => r.id === annex.id)!)).toHaveLength(
      10
    );
    expect(floorCells(storage.document().draft)).toEqual(floor);
    expect(
      screen.getByRole('button', { name: /^Room Chapel annex, 10 hexes/ })
    ).toBeTruthy();
    // Rename: the region's label on the map is its name.
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Select region Chapel annex' }),
      { key: 'Enter' }
    );
    fireEvent.click(button('Inspector'));
    fireEvent.change(screen.getByLabelText('Region name'), {
      target: { value: 'Vestry' },
    });
    fireEvent.submit(
      screen.getByRole('form', { name: 'Arrange selected noun' })
    );
    expect(
      surface().querySelector(`[data-region-label="${annex.id}"]`)?.textContent
    ).toBe('Vestry');
    expect(
      screen.queryByRole('button', { name: 'Select region Chapel annex' })
    ).toBeNull();
    // Remove: its cells fall back to the implicit region, still floor.
    fireEvent.click(button('Remove region'));
    expect(regions().some((r) => r.id === annex.id)).toBe(false);
    for (const cell of ten)
      expect(
        cellOwners(storage.document().draft).get(`${cell.q},${cell.r}`)
      ).toBe(implicit);
    expect(floorCells(storage.document().draft)).toEqual(floor);
    // The removed region was active; paint falls back to the implicit one.
    expect(
      (
        screen.getByRole('radio', {
          name: `Paint into ${regions().find((r) => r.id === implicit)!.name}`,
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
  });

  // Rewritten (rpg-project#725 R5): "Define explicit area" became the active
  // region. "Make active" on a region's view makes Paint brush into it.
  it('Make active on a region view sets the region Paint brushes into', async () => {
    const storage = new MemoryStorage(createCastleKeepDocument());
    mount(storage);
    await settled();
    fireEvent.click(row('Chapel'));
    expect(inspector().getByRole('status').textContent).toMatch(
      /^Painted · \d+ hexes$/
    );
    const chapel = storage
      .document()
      .draft.room.regions.find((r) => r.name === 'Chapel')!;
    fireEvent.click(inspector().getByRole('button', { name: 'Make active' }));
    expect(
      inspector()
        .getByRole('button', { name: 'Active · Paint lands here' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      (
        screen.getByRole('radio', {
          name: 'Paint into Chapel',
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
    expect(pressed('Build')).toBe('true');
    // A courtyard cell painted now moves to the chapel.
    const courtyard = KEEP_ROOMS.find((room) => room.id === 'courtyard')!;
    const cell = keepRoomCells(courtyard)[0]!;
    // Selecting the row framed the chapel; frame the whole keep again so the
    // courtyard cell is on the surface.
    fireEvent.click(button('Show entire'));
    fireEvent.click(button('Paint'));
    gesture(cell);
    expect(
      cellOwners(storage.document().draft).get(`${cell.q},${cell.r}`)
    ).toBe(chapel.id);
  });

  // Erase is never region-scoped (rpg-project#725 R5): with a region active,
  // an Erase stroke removes the floor wherever it lands, active or not.
  it('Erase with a region active removes the cells from the floor and that region', async () => {
    const storage = new MemoryStorage(createCastleKeepDocument());
    mount(storage);
    await settled();
    const before = storage.document().draft;
    const chapel = before.room.regions.find((r) => r.name === 'Chapel')!;
    const owners = cellOwners(before);
    const inChapel = [...owners].filter(([, id]) => id === chapel.id).length;
    const courtyard = KEEP_ROOMS.find((room) => room.id === 'courtyard')!;
    const chapelRoom = KEEP_ROOMS.find((room) => room.id === 'chapel')!;
    const chapelCell = keepRoomCells(chapelRoom)[40]!;
    const courtyardCell = keepRoomCells(courtyard)[40]!;
    fireEvent.click(row('Chapel'));
    fireEvent.click(inspector().getByRole('button', { name: 'Make active' }));
    fireEvent.click(button('Show entire'));
    fireEvent.click(button('Erase'));
    gesture(chapelCell);
    gesture(courtyardCell);
    const after = storage.document().draft;
    const floor = new Set(floorCells(after).map((c) => `${c.q},${c.r}`));
    expect(floor.has(`${chapelCell.q},${chapelCell.r}`)).toBe(false);
    expect(floor.has(`${courtyardCell.q},${courtyardCell.r}`)).toBe(false);
    expect(floor.size).toBe(floorCells(before).length - 2);
    expect(
      [...cellOwners(after)].filter(([, id]) => id === chapel.id).length
    ).toBe(inChapel - 1);
    // Erase leaves the active region as it was.
    expect(
      (
        screen.getByRole('radio', {
          name: 'Paint into Chapel',
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
  });

  it("the hex view's Edit region selects the label without changing home", async () => {
    mount(new MemoryStorage(createCastleKeepDocument()));
    await settled();
    // A bare floor click in the courtyard selects that hex.
    const courtyard = KEEP_ROOMS.find((room) => room.id === 'courtyard')!;
    const cell = keepRoomCells(courtyard)[40];
    const point = onSurface(layoutCellCenter(cell));
    fireEvent.pointerDown(surface(), {
      clientX: bounds.left + point.x,
      clientY: bounds.top + point.y,
      button: 0,
      pointerId: 3,
    });
    expect(inspector().getByText(`Cell q ${cell.q}, r ${cell.r}`)).toBeTruthy();
    fireEvent.click(
      inspector().getByRole('button', { name: 'Edit region Courtyard' })
    );
    expect(inspector().getByRole('heading', { level: 2 }).textContent).toBe(
      'Courtyard'
    );
    expect(inspector().getByRole('region', { name: 'Region' })).toBeTruthy();
    expect(pressed('Build')).toBe('true');
    expect(row('Courtyard').getAttribute('aria-pressed')).toBe('true');
  });

  // Rewritten (rpg-project#725): a region's label is its name, so removing
  // the region removes its label; its cells stay floor in the implicit region.
  it('Remove region removes the region and its label', async () => {
    const storage = new MemoryStorage(createCastleKeepDocument());
    mount(storage);
    await settled();
    const before = storage.document();
    expect(
      surface().querySelector('[data-region-label="region-armoury"]')
    ).not.toBeNull();
    fireEvent.click(row('Armoury'));
    fireEvent.click(inspector().getByRole('button', { name: 'Remove region' }));
    const after = storage.document();
    expect(after.draft.room.regions.map((region) => region.id)).toEqual(
      before.draft.room.regions
        .map((region) => region.id)
        .filter((id) => id !== 'region-armoury')
    );
    expect(floorCells(after.draft)).toEqual(floorCells(before.draft));
    const owners = cellOwners(after.draft);
    const armoury = KEEP_ROOMS.find((room) => room.id === 'armoury')!;
    expect(
      keepRoomCells(armoury).every(
        (cell) =>
          owners.get(`${cell.q},${cell.r}`) ===
          after.draft.room.implicitRegionId
      )
    ).toBe(true);
    expect(after.draft.scene).toEqual(before.draft.scene);
    expect(
      surface().querySelector('[data-region-label="region-armoury"]')
    ).toBeNull();
    expect(
      within(screen.getByRole('list', { name: 'Room list' })).queryByRole(
        'button',
        { name: /^Room Armoury,/ }
      )
    ).toBeNull();
    fireEvent.click(button('Undo'));
    expect(storage.document()).toEqual(before);
  });

  it('3D names each resolved region once, in its overview colour', async () => {
    mount(new MemoryStorage(createCastleKeepDocument()));
    await settled();
    const colours = new Map(
      [...surface().querySelectorAll('[data-region-id]')].map((node) => [
        node.getAttribute('data-region-id'),
        node.getAttribute('data-region-colour'),
      ])
    );
    switchTo('3D');
    const labels = viewport().regionLabels!;
    // The implicit region holds the rest of the painted floor, so it is a
    // resolved region with a name too (rpg-project#725).
    expect(labels.map((label) => label.text)).toEqual([
      'Front Room',
      ...KEEP_ROOMS.map((room) => room.text),
    ]);
    for (const label of labels)
      expect(label.colour).toBe(colours.get(label.id));
  });

  it('an unresolved region has no 3D label', async () => {
    const document = createUnresolvedRegionLightingDocument();
    mount(new MemoryStorage(document));
    await settled();
    switchTo('3D');
    const ids = viewport().regionLabels!.map((label) => label.id);
    expect(ids).not.toContain('lighting-unbound');
    expect(ids).not.toContain('lighting-empty');
    expect(ids.length).toBeGreaterThan(0);
  });

  it('a prop writer in Facts selects the prop from Layout', async () => {
    mount(new MemoryStorage(createCastleReadBackDocument()));
    await settled();
    expect(button('Layout').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button('Encounter'));
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Encounter tools' })
      ).getByRole('button', { name: 'Facts' })
    );
    const facts = screen.getByRole('region', { name: 'Facts' });
    const row = facts.querySelector(
      '[data-fact="king-is-cultist"]'
    ) as HTMLElement;
    fireEvent.click(within(row).getAllByRole('button')[0]);
    expect(pressed('Build')).toBe('true');
    expect(inspector().getByRole('heading', { level: 2 }).textContent).toBe(
      'Altar'
    );
  });

  it("the group view's Select member selects the member from Layout", async () => {
    mount(new MemoryStorage(createPopulatedStudioDocument()));
    await settled();
    // Select the group in 3D, then come back to Layout with it selected.
    switchTo('3D');
    act(() => viewport().onSelect(['furniture']));
    switchTo('Layout');
    expect(inspector().getByRole('heading', { level: 2 }).textContent).toBe(
      'Furniture'
    );
    fireEvent.click(
      inspector().getByRole('button', { name: 'Select member Table' })
    );
    expect(inspector().getByRole('heading', { level: 2 }).textContent).toBe(
      'Table'
    );
  });

  it("a creature at a region's centre is selectable by click in Layout", async () => {
    mount(new MemoryStorage(createCastleKeepDocument()));
    await settled();
    // The captain stands at the great hall's centre, under its name, which
    // is drawn at the region's centroid (rpg-project#725).
    const label = surface().querySelector(
      '[data-region-label="region-great-hall"]'
    )!;
    const ring = glyph('[data-placed-creature="captain"] circle');
    // Later in the SVG is drawn on top and takes the pointer first.
    expect(
      label.compareDocumentPosition(ring) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    fireEvent.pointerDown(ring, { button: 0 });
    expect(inspector().getByRole('heading', { level: 2 }).textContent).toBe(
      'Captain'
    );
  });

  // Rewritten (rpg-project#725): no region is wall-bound, so a carried finish
  // never applies; its row is flagged even while its material is available.
  it('a room row flags a carried finish that is not applied while the region is painted', async () => {
    installFinishPreview();
    const fixture = finishRoomFixture(true);
    const draft = paintCells(
      fixture,
      cellsInWorldRectangle({ x: 0.4, z: 0.4 }, { x: 3.6, z: 3.6 }),
      'left'
    );
    const storage = new MemoryStorage({
      draft: {
        ...draft,
        scene: {
          ...draft.scene,
          version: 6,
          regionPresentation: { left: { wallFinish: CARRIED_FINISH } },
        },
      },
      scope: {},
    });
    mount(storage);
    await settled();
    expect(row('Left').textContent).toMatch(/hexes · .* — finish unapplied$/);
    expect(row('Left').getAttribute('aria-label')).toMatch(
      /, finish unapplied$/
    );
    expect(row('Right').textContent).not.toContain('finish unapplied');
  });
});

describe('Save and Play through the real owner (S6)', () => {
  it('publishing.setBusy(true) makes an edit a refusal and canUndo false; setBusy(false) releases', () => {
    const storage = new MemoryStorage(seed());
    let session!: EncounterStudioSession;
    render(
      <WorldBuildingConcept
        roomMode
        compositionSource={source}
        storage={storage}
        studioPresentation={{
          home: 'build',
          view: 'layout',
          render: (next) => {
            session = next;
            return null;
          },
        }}
      />
    );
    act(() => expect(session.renameDocument('Before the lock')).toBe(true));
    expect(session.canUndo).toBe(true);
    expect(session.publishing.busy).toBe(false);
    const writes = storage.roomWrites();
    act(() => session.publishing.setBusy(true));
    expect(session.publishing.busy).toBe(true);
    expect(session.canUndo).toBe(false);
    expect(session.canRedo).toBe(false);
    let accepted = true;
    act(() => {
      accepted = session.renameDocument('During the lock');
    });
    expect(accepted).toBe(false);
    expect(session.notice).toMatch(/^Save & Play is running/);
    act(() => {
      accepted = session.selectHex(floorCells(seed().draft)[0]!);
    });
    expect(accepted).toBe(false);
    act(() => session.undo());
    expect(session.document.draft.name).toBe('Before the lock');
    act(() => session.saveLocalDraft());
    expect(storage.roomWrites()).toBe(writes);
    act(() => session.publishing.setBusy(false));
    expect(session.publishing.busy).toBe(false);
    expect(session.notice).toBeNull();
    expect(session.canUndo).toBe(true);
    act(() => expect(session.renameDocument('After the lock')).toBe(true));
  });

  const STUDIO_ONLY =
    'Play does not render this yet; it stays in the studio until the look catalog.';
  const helpText = (field: string): string => {
    const toggle = screen.getByRole('button', { name: `About ${field}` });
    fireEvent.click(toggle);
    return document.getElementById(toggle.getAttribute('aria-controls')!)!
      .textContent!;
  };

  it('the wall finish field carries the studio-only help line', () => {
    installFinishPreview();
    const draft = finishRoomFixture();
    delete draft.scene.mapLabels;
    draft.room.walls = [draft.room.walls![0]];
    const storage = new MemoryStorage({ draft, scope: {} });
    mount(storage);
    selectWall(storage, storage.document().draft.room.walls![0]);
    expect(helpText('Wall finish')).toBe(STUDIO_ONLY);
  });

  it("a region's wall finish says studio-only and its lighting says undecided", async () => {
    installFinishPreview();
    mount(new MemoryStorage({ draft: finishRoomFixture(true), scope: {} }));
    await settled();
    fireEvent.click(
      within(screen.getByRole('list', { name: 'Room list' })).getByRole(
        'button',
        { name: /^Room Left,/ }
      )
    );
    expect(helpText('Region wall finish')).toBe(STUDIO_ONLY);
    expect(helpText('Lighting (%)')).toBe(
      'Play does not render this yet; whether it should is undecided.'
    );
  });
});

it('the castle’s gate tables read as use: lines that resolve in the studio (rpg-project#670)', async () => {
  const read = readDraftYaml(referenceCastleYaml);
  if (!read.ok) throw new Error(read.refusal);
  // THE STUDIO'S OWN TREE, not a panel mounted alone: the first build drew
  // the lines and said "names no bundle" beside each, because the studio
  // renders outside the document root the bundles were provided at.
  const original = createEmptyCastDocument();
  original.scope.bundles = read.scope.bundles;
  original.scope.tables = { 'gate-patrol': read.scope.tables!['gate-patrol'] };
  mount(new MemoryStorage(original));
  await settled();
  fireEvent.click(button('Encounter'));
  fireEvent.click(button('Tables'));
  const tables = screen.getByRole('list', { name: 'Site tables' });
  const lines = Array.from(
    tables.querySelectorAll('li.wb-entry-use .wb-entry-summary')
  ).map((node) => node.textContent);
  expect(lines).toEqual([
    'pursuer',
    'alarm-reactor',
    'patrol · with path a route of 3 waypoints',
  ]);
  expect(within(tables).queryByRole('alert')).toBeNull();
  fireEvent.click(
    within(tables).getByRole('button', {
      name: /Show the rows of .* entry pursuer/,
    })
  );
  expect(
    within(within(tables).getByLabelText('pursuer rows'))
      .getAllByRole('listitem')
      .map((node) => node.textContent)
  ).toEqual([
    expect.stringContaining('enemy remembered'),
    expect.stringContaining('search 6'),
  ]);
});
