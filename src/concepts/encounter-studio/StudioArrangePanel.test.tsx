import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldBuildingConcept } from '../world-building/WorldBuildingConcept';
import {
  ROOM_DRAFT_STORAGE_KEY,
  stringifyRoomDraft,
  type RoomDraftDocument,
} from '../world-building/roomDraft';
import { moveSelection } from '../world-building/sceneState';
import type { KeyValueStorage } from '../world-building/types';
import { StudioArrangePanel } from './StudioArrangePanel';
import { createRegionLightingDocument } from './fixtures/regionLighting';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';
import type {
  EncounterStudioSession,
  StudioArrangeIntent,
} from './studioSession';

// Real owner/session/adapters/history/storage; no WebGL/browser proof claimed.
vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  Canvas: () => null,
}));
vi.mock('@/compositions/CompositionThumbnailRenderer', () => ({
  ThumbnailRenderer: () => null,
}));
afterEach(cleanup);

function owner(document = createPopulatedStudioDocument()) {
  const bytes = new Map([
    [
      ROOM_DRAFT_STORAGE_KEY,
      stringifyRoomDraft(document.draft, document.scope),
    ],
  ]);
  const setItem = vi.fn((key: string, value: string) => {
    bytes.set(key, value);
  });
  const storage: KeyValueStorage = {
    getItem: (key) => bytes.get(key) ?? null,
    setItem,
  };
  const calls: StudioArrangeIntent[] = [];
  let session: EncounterStudioSession;
  let expanded = true;
  const presentation = () => (
    <WorldBuildingConcept
      roomMode
      storage={storage}
      studioPresentation={{
        view: '3d',
        render: (next) => {
          session = next;
          return (
            <StudioArrangePanel
              session={{
                ...next,
                commitArrange: (intent) => {
                  calls.push(intent);
                  return next.commitArrange(intent);
                },
              }}
              expanded={expanded}
            />
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
    calls,
    bytes,
    writes: () =>
      setItem.mock.calls.filter(([key]) => key === ROOM_DRAFT_STORAGE_KEY)
        .length,
    selectScene(ids: string[]) {
      act(() => session.viewportProps.onSelect(ids));
    },
    selectWall() {
      act(() => session.wallEditing.select('studio-wall'));
    },
    selectActor() {
      act(() =>
        session.viewportProps.roomAuthoring!.onSelectActorTarget!({
          kind: 'actor',
          id: 'goblin-1',
        })
      );
    },
    collapse(value: boolean) {
      expanded = !value;
      mounted.rerender(presentation());
    },
  };
}
const change = (name: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
};
const apply = (): void => {
  fireEvent.submit(screen.getByRole('form', { name: 'Arrange selected noun' }));
};
const token = (name: string): string =>
  (screen.getByLabelText(name) as HTMLInputElement).value;

function diagonalDocument(): RoomDraftDocument {
  const document = createPopulatedStudioDocument();
  const wall = document.draft.room.walls![0];
  wall.line = { start: { x: 0, z: 0 }, end: { x: 3, z: 2 } };
  wall.openings = [];
  wall.blocker.footprint.width = Math.hypot(3, 2);
  return document;
}

describe('Arrange staged fields joined to the actual document owner', () => {
  it('leads with exact endpoints, keeps midpoint secondary and commits both endpoints atomically with shared history', () => {
    const document = diagonalDocument();
    const attached =
      createPopulatedStudioDocument().draft.room.walls![0].openings.find(
        (opening) => opening.door
      )!;
    document.draft.room.walls![0].openings = [
      { ...attached, position: 1, width: 0.5 },
    ];
    const joined = owner(document);
    joined.selectWall();
    const before = joined.session.document;
    expect(token('Start X')).toBe('0');
    expect(token('End Z')).toBe('2');
    expect(
      screen.getByLabelText('Wall midpoint X').closest('details')?.open
    ).toBe(false);
    const writes = joined.writes();
    change('Start X', '3'); // matches the OLD end X, evaluated with the new end
    change('Start Z', '2');
    change('End X', '6.135791357913579');
    change('End Z', '4.2');
    expect(joined.session.document).toBe(before);
    apply();
    const after = joined.session.document;
    expect(after.draft.room.walls![0].line).toEqual({
      start: { x: 3, z: 2 },
      end: { x: 6.135791357913579, z: 4.2 },
    });
    expect(after.scope).toEqual(before.scope);
    expect(after.draft.scene).toEqual(before.draft.scene);
    expect(after.draft.room.doorBindings).toEqual(
      before.draft.room.doorBindings
    );
    expect(after.draft.room.walls![0].openings).toEqual(
      before.draft.room.walls![0].openings
    );
    expect(joined.writes()).toBe(writes + 1);
    act(() => joined.session.undo());
    expect(joined.session.document).toEqual(before);
    act(() => joined.session.redo());
    expect(joined.session.document).toEqual(after);
    const equal = joined.session.document;
    const equalWrites = joined.writes();
    change('End X', '6.135791357913579');
    apply();
    expect(joined.session.document).toBe(equal);
    expect(joined.writes()).toBe(equalWrites);
    change('End Z', '5');
    change('Wall length', '12');
    apply();
    expect(screen.getByRole('alert').textContent).toMatch(/refused/);
    expect(joined.session.notice).toMatch(/separately/);
    expect(joined.session.document).toBe(equal);
    expect(joined.writes()).toBe(equalWrites);
  });
  it('wall-endpoint snap toggles only editor state and retires captured edits', () => {
    const joined = owner(diagonalDocument());
    joined.selectWall();
    expect(
      (screen.getByLabelText('Snap to wall endpoints') as HTMLInputElement)
        .checked
    ).toBe(true);
    const before = joined.session.document;
    const writes = joined.writes();
    const stale = joined.session.wallEditing.edit;
    fireEvent.click(screen.getByLabelText('Snap to wall endpoints'));
    expect(joined.session.wallEditing.endpointSnapEnabled).toBe(false);
    act(() =>
      expect(stale({ ...before.draft.room.walls![0], label: 'Stale' })).toBe(
        false
      )
    );
    expect(joined.session.document).toBe(before);
    expect(joined.writes()).toBe(writes);
  });
  it('shows canonical single-root values; one Enter submits every dirty section once and undo restores the whole noun', () => {
    const joined = owner();
    joined.selectScene(['studio-decoration']);
    const before = joined.session.document;
    expect(token('World X')).toBe('-2.25');
    expect(token('World Y')).toBe('1');
    expect(token('Y facing (degrees)')).toBe('21.199438');
    apply();
    expect(joined.calls).toHaveLength(0);
    const writes = joined.writes();
    change('World X', '-1.5');
    change('World Z', '2');
    change('Y facing (degrees)', '45');
    change('Height scale (%)', '137.1234567');
    fireEvent.keyDown(screen.getByLabelText('World X'), { key: 'Enter' });
    expect(joined.calls).toHaveLength(1);
    expect(joined.calls[0]).toEqual({
      kind: 'scene-edit',
      target: { kind: 'scene', ids: ['studio-decoration'] },
      position: { x: -1.5, z: 2 },
      rotation: { kind: 'absolute', radians: Math.PI / 4 },
      heightScale: 1.371234567,
    });
    expect(joined.writes()).toBe(writes + 1);
    const prop = joined.session.document.draft.scene.items.find(
      (item) => item.id === 'studio-decoration'
    )!;
    expect(prop.transform).toMatchObject({
      x: -1.5,
      y: 1,
      z: 2,
      rotationY: Math.PI / 4,
    });
    expect(prop.heightScale).toBe(1.371234567);
    act(() => joined.session.undo());
    expect(joined.session.document).toEqual(before);
    expect(joined.session.canUndo).toBe(false);
  });

  it('keeps mixed height honest and uses relative rotation at a true multi-root pivot; successful rotation resets to zero', () => {
    const document = createPopulatedStudioDocument();
    document.draft.scene.items.find(
      (item) => item.id === 'table'
    )!.heightScale = 1.37567891;
    const joined = owner(document);
    joined.selectScene(['table', 'cellar-door']);
    expect(screen.getByText('Selection pivot · world units')).toBeTruthy();
    expect(screen.queryByLabelText('Y facing (degrees)')).toBeNull();
    expect(screen.getByPlaceholderText('Mixed')).toBeTruthy();
    expect(token('Height scale (%)')).toBe('');
    const before = joined.session.document;
    change('Rotate by (degrees)', '12.5');
    apply();
    expect(joined.calls[0]).toEqual({
      kind: 'scene-edit',
      target: { kind: 'scene', ids: ['cellar-door', 'table'] },
      rotation: { kind: 'relative', radians: (12.5 * Math.PI) / 180 },
    });
    expect(token('Rotate by (degrees)')).toBe('0');
    expect(
      joined.session.document.draft.scene.items.find(
        (item) => item.id === 'cellar-door'
      )
    ).not.toHaveProperty('heightScale');
    expect(
      joined.session.document.draft.scene.items.find(
        (item) => item.id === 'table'
      )!.heightScale
    ).toBe(1.37567891);
    act(() => joined.session.undo());
    expect(joined.session.document).toEqual(before);
  });

  it('untouched rounded diagonal yaw/length and rounded percent never become values; a tiny typed edit does', () => {
    const document = diagonalDocument();
    document.draft.scene.items.find(
      (item) => item.id === 'studio-decoration'
    )!.heightScale = 1.23456789123;
    const joined = owner(document);
    joined.selectWall();
    const before = joined.session.document;
    const bytes = joined.bytes.get(ROOM_DRAFT_STORAGE_KEY);
    const writes = joined.writes();
    expect(token('Wall length')).toBe('3.605551');
    expect(token('Y facing (degrees)')).toBe('-33.690068');
    change('Fixed endpoint', 'end');
    apply();
    expect(joined.calls).toHaveLength(0);
    expect(joined.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    change('Appearance elevation', '0.25');
    apply();
    expect(joined.calls[0]).toEqual({
      kind: 'wall-edit',
      target: { kind: 'wall', id: 'studio-wall' },
      appearance: { elevation: 0.25 },
    });
    expect(joined.session.document.draft.room.walls![0].line).toEqual(
      before.draft.room.walls![0].line
    );
    act(() => joined.session.undo());
    joined.selectScene(['studio-decoration']);
    expect(token('Height scale (%)')).toBe('123.456789');
    change('World X', '-2.2499999999999996');
    apply();
    expect(joined.calls.at(-1)).toEqual({
      kind: 'scene-edit',
      target: { kind: 'scene', ids: ['studio-decoration'] },
      position: { x: -2.2499999999999996 },
    });
    expect(
      joined.session.document.draft.scene.items.find(
        (item) => item.id === 'studio-decoration'
      )!.heightScale
    ).toBe(1.23456789123);
    expect(joined.writes()).toBeGreaterThan(writes);
  });

  it.each(['Apply', 'field Enter'])(
    'search Enter preserves dirty wall fields/swap, bytes and history until legitimate %s',
    (method) => {
      const joined = owner();
      joined.selectWall();
      const before = joined.session.document;
      const bytes = joined.bytes.get(ROOM_DRAFT_STORAGE_KEY);
      const writes = joined.writes();
      change('Appearance elevation', '0.25');
      fireEvent.click(
        screen.getByRole('button', { name: 'Change wall appearance' })
      );
      change('Search wall appearances', 'castle_wall');
      const ref = 'dnd5e:env:fantasy-kingdom:castle_wall_01';
      fireEvent.click(
        document.querySelector(`[data-wall-appearance-ref="${ref}"]`)!
      );
      const search = screen.getByLabelText('Search wall appearances');
      expect(fireEvent.keyDown(search, { key: 'Enter' })).toBe(false); // cancels native implicit submission too
      expect(joined.calls).toHaveLength(0);
      expect(joined.session.document).toBe(before);
      expect(joined.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
      expect(joined.writes()).toBe(writes);
      expect(joined.session.canUndo).toBe(false);
      expect(joined.session.canRedo).toBe(false);
      expect(token('Appearance elevation')).toBe('0.25');
      expect(token('Search wall appearances')).toBe('castle_wall');
      expect(
        document
          .querySelector(`[data-wall-appearance-ref="${ref}"]`)!
          .getAttribute('aria-pressed')
      ).toBe('true');
      if (method === 'Apply') apply();
      else
        fireEvent.keyDown(screen.getByLabelText('Appearance elevation'), {
          key: 'Enter',
        });
      expect(joined.calls).toHaveLength(1);
      expect(joined.writes()).toBe(writes + 1);
      expect(
        joined.session.document.draft.room.walls![0].appearance
      ).toMatchObject({ elevation: 0.25, assetRef: ref });
      act(() => joined.session.undo());
      expect(joined.session.document).toEqual(before);
      expect(joined.session.canUndo).toBe(false);
    }
  );

  it('attached door exposes only owning-wall position/width and commits its whole dirty form once', () => {
    const joined = owner();
    const target = {
      kind: 'door' as const,
      wallId: 'studio-wall',
      openingId: 'studio-opening',
      doorId: 'studio-door',
    };
    act(() => expect(joined.session.doorEditing.select(target)).toBe(true));
    const before = joined.session.document;
    const writes = joined.writes();
    expect(screen.queryByLabelText('World X')).toBeNull();
    expect(screen.queryByLabelText('Y facing (degrees)')).toBeNull();
    expect(token('Along wall position')).toBe('6');
    expect(token('Door width')).toBe('2');
    change('Along wall position', '6.125');
    change('Door width', '1.5');
    fireEvent.keyDown(screen.getByLabelText('Door width'), { key: 'Enter' });
    expect(joined.calls).toEqual([
      { kind: 'door-edit', target, position: 6.125, width: 1.5 },
    ]);
    expect(joined.writes()).toBe(writes + 1);
    expect(joined.session.document.draft.room.doorBindings).toEqual(
      before.draft.room.doorBindings
    );
    act(() => joined.session.undo());
    expect(joined.session.document).toEqual(before);
    expect(joined.session.canUndo).toBe(false);
  });

  it('wall position, facing, fixed-endpoint length, dimensions and explicit appearance choice form one transaction', () => {
    const joined = owner();
    joined.selectWall();
    const before = joined.session.document;
    const writes = joined.writes();
    expect(screen.queryByLabelText('World Y')).toBeNull();
    expect(screen.queryByLabelText('Search wall appearances')).toBeNull();
    expect(document.querySelector('[data-wall-appearance-ref]')).toBeNull();
    change('Wall midpoint X', '1');
    change('Wall midpoint Z', '-2');
    change('Y facing (degrees)', '30');
    change('Wall length', '10');
    change('Fixed endpoint', 'end');
    change('Appearance height', '4');
    change('Appearance thickness', '0.5');
    change('Appearance elevation', '0.25');
    fireEvent.click(
      screen.getByRole('button', { name: 'Change wall appearance' })
    );
    expect(
      document.querySelector('[data-wall-appearance-ref] img')
    ).not.toBeNull();
    const ref = 'dnd5e:env:fantasy-kingdom:castle_wall_01';
    fireEvent.click(
      document.querySelector(`[data-wall-appearance-ref="${ref}"]`)!
    );
    expect(joined.writes()).toBe(writes);
    apply();
    expect(joined.calls).toHaveLength(1);
    expect(joined.calls[0]).toEqual({
      kind: 'wall-edit',
      target: { kind: 'wall', id: 'studio-wall' },
      midpoint: { x: 1, z: -2 },
      yaw: Math.PI / 6,
      length: { value: 10, anchor: 'end' },
      appearance: { height: 4, thickness: 0.5, elevation: 0.25, assetRef: ref },
    });
    const wall = joined.session.document.draft.room.walls![0];
    expect((wall.line.start.x + wall.line.end.x) / 2).toBeCloseTo(1);
    expect((wall.line.start.z + wall.line.end.z) / 2).toBeCloseTo(-2);
    expect(wall.openings).toEqual(
      before.draft.room.walls![0].openings.map((opening) => ({
        ...opening,
        position: opening.position + 2,
      }))
    );
    expect(joined.session.document.draft.room.doorBindings).toEqual(
      before.draft.room.doorBindings
    );
    expect(joined.writes()).toBe(writes + 1);
    act(() => joined.session.undo());
    expect(joined.session.document).toEqual(before);
    expect(joined.session.canUndo).toBe(false);
  });

  it('numeric length clamps through the actual owner to protect attached openings in one undo step', () => {
    const joined = owner();
    joined.selectWall();
    const before = joined.session.document;
    const writes = joined.writes();
    change('Wall length', '2');
    apply();
    const wall = joined.session.document.draft.room.walls![0];
    expect(wall.line).toEqual({
      start: { x: -4, z: -3 },
      end: { x: 3, z: -3 },
    });
    expect(token('Wall length')).toBe('7');
    expect(wall.openings).toEqual(before.draft.room.walls![0].openings);
    expect(joined.session.document.draft.room.doorBindings).toEqual(
      before.draft.room.doorBindings
    );
    expect(joined.calls).toHaveLength(1);
    expect(joined.writes()).toBe(writes + 1);
    act(() => joined.session.undo());
    expect(joined.session.document).toEqual(before);
    expect(joined.session.canUndo).toBe(false);
  });

  it.each(['', '-', '+', '1e', 'Infinity', 'NaN'])(
    'retains incomplete numeric token %j without partially committing earlier fields',
    (invalid) => {
      const joined = owner();
      joined.selectWall();
      const before = joined.session.document;
      const writes = joined.writes();
      change('Wall midpoint X', '1');
      change('Appearance thickness', invalid);
      fireEvent.blur(screen.getByLabelText('Wall midpoint X'));
      expect(joined.calls).toHaveLength(0);
      apply();
      expect(joined.calls).toHaveLength(0);
      expect(screen.getByRole('alert').textContent).toMatch(/finite numeric/);
      expect(token('Appearance thickness')).toBe(invalid);
      expect(joined.session.document).toBe(before);
      expect(joined.writes()).toBe(writes);
    }
  );

  it('label text and XZ are atomic; owner refusal retains the complete draft; Cancel/Escape never commit', () => {
    const joined = owner();
    act(() => joined.session.createMapLabel('Original', { x: 0, z: 0 }));
    const id = joined.session.document.draft.scene.mapLabels![0].id;
    act(() => joined.session.mapLabelSelection.select(id));
    const before = joined.session.document;
    const writes = joined.writes();
    expect(screen.queryByLabelText('Y facing (degrees)')).toBeNull();
    change('Rename label', 'Renamed');
    change('Label world X', '9999');
    apply();
    expect(joined.session.document).toBe(before);
    expect(token('Rename label')).toBe('Renamed');
    expect(token('Label world X')).toBe('9999');
    expect(screen.getByRole('alert').textContent).toMatch(/refused/);
    change('Label world X', '1');
    change('Label world Z', '-1');
    fireEvent.keyDown(screen.getByLabelText('Rename label'), { key: 'Enter' });
    expect(joined.calls).toHaveLength(2);
    expect(joined.writes()).toBe(writes + 1);
    expect(joined.session.document.draft.scene.mapLabels![0]).toMatchObject({
      id,
      text: 'Renamed',
      location: { x: 1, z: -1 },
    });
    change('Rename label', 'Never commit');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Arrange' }));
    expect(token('Rename label')).toBe('Renamed');
    change('Rename label', 'Never commit');
    fireEvent.keyDown(screen.getByLabelText('Rename label'), { key: 'Escape' });
    expect(token('Rename label')).toBe('Renamed');
    expect(joined.calls).toHaveLength(2);
    act(() => joined.session.undo());
    expect(joined.session.document).toEqual(before);
  });

  it('actor/start expose only integer hex capabilities and default facing removal preserves absence', () => {
    const joined = owner();
    joined.selectActor();
    const actor = () =>
      joined.session.document.draft.room.monsterDeclarations.find(
        (monster) => monster.id === 'goblin-1'
      )!;
    expect(screen.queryByLabelText('World X')).toBeNull();
    expect(screen.queryByLabelText('Height scale (%)')).toBeNull();
    expect(screen.getByRole('option', { name: 'Asset default' })).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(9);
    change('Starting hex q', '0.5');
    apply();
    expect(joined.calls).toHaveLength(0);
    expect(screen.getByRole('alert').textContent).toMatch(/integers/);
    change('Starting hex q', '0');
    change('Starting hex r', '1');
    change('Starting facing', 'ne');
    apply();
    expect(joined.calls[0]).toEqual({
      kind: 'actor-start',
      target: { kind: 'actor', id: 'goblin-1' },
      location: { q: 0, r: 1 },
      facing: { kind: 'compass', value: 'ne' },
    });
    expect(actor().startingCell).toEqual({
      location: { q: 0, r: 1 },
      facing: 'ne',
    });
    change('Starting facing', '');
    apply();
    expect(actor().startingCell).not.toHaveProperty('facing');
    act(() =>
      joined.session.viewportProps.roomAuthoring!.onSelectActorTarget!({
        kind: 'start',
      })
    );
    expect(screen.queryByLabelText('Starting facing')).toBeNull();
    expect(screen.queryByLabelText('Y facing (degrees)')).toBeNull();
    change('Starting hex q', '1');
    apply();
    expect(joined.calls.at(-1)?.kind).toBe('start-position');
    expect(joined.session.document.draft.room.partyStart?.q).toBe(1);
  });

  it('clean preview fields follow owner values; dirty fields survive cosmetic preview and commit stays blocked', () => {
    const joined = owner();
    joined.selectScene(['studio-decoration']);
    const before = joined.session.document;
    change('World X', '-1.25');
    const preview = moveSelection(before.draft.scene, ['studio-decoration'], {
      x: 0.5,
      y: 0.25,
      z: 1,
    });
    act(() => joined.session.viewportProps.onTransformPreview(preview));
    expect(token('World X')).toBe('-1.25');
    expect(token('World Y')).toBe('1.25');
    expect(token('World Z')).toBe('2.3');
    expect(screen.getByRole('status').textContent).toMatch(/Preview/);
    expect(
      (
        screen.getByRole('button', {
          name: 'Apply Arrange',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    apply();
    expect(joined.calls).toHaveLength(0);
    expect(joined.session.document).toBe(before);
    joined.collapse(true);
    expect(screen.queryByRole('form')).toBeNull();
    expect(joined.session.arrange?.kind).toBe('scene');
    joined.collapse(false);
    expect(token('World X')).toBe('-1.25');
    act(() => joined.session.cancelTransients());
    expect(token('World X')).toBe('-2.25');
  });

  it('selection and epoch-only retirement discard tokens; collapse never edits and unrelated document replacement resets them', () => {
    const joined = owner();
    joined.selectWall();
    change('Wall length', '12');
    const before = joined.session.document;
    joined.collapse(true);
    expect(joined.session.document).toBe(before);
    expect(joined.calls).toHaveLength(0);
    joined.collapse(false);
    expect(token('Wall length')).toBe('12');
    act(() => joined.session.cancelTransients());
    expect(token('Wall length')).toBe('8');
    change('Wall length', '13');
    act(() => joined.session.renameDocument('Replaced snapshot'));
    expect(token('Wall length')).toBe('8');
    change('Wall length', '14');
    joined.selectActor();
    joined.selectWall();
    expect(token('Wall length')).toBe('8');
    expect(joined.calls).toHaveLength(0);
    expect(
      within(
        screen.getByRole('region', { name: 'Arrange selection' })
      ).getByRole('heading').textContent
    ).toContain('Studio north wall');
  });
  it('explicit canonical defaults preserve missing fields, history, bytes and writes exactly', () => {
    const joined = owner();
    joined.selectScene(['studio-decoration']);
    const before = joined.session.document;
    const bytes = joined.bytes.get(ROOM_DRAFT_STORAGE_KEY);
    const writes = joined.writes();
    change('World X', '-2.2');
    change('World X', '-2.25');
    change('Height scale (%)', '99');
    change('Height scale (%)', '100');
    apply();
    expect(joined.calls).toHaveLength(1);
    expect(joined.session.document).toBe(before);
    expect(
      joined.session.document.draft.scene.items.find(
        (item) => item.id === 'studio-decoration'
      )
    ).not.toHaveProperty('heightScale');
    expect(joined.session.canUndo).toBe(false);
    joined.selectActor();
    change('Starting facing', 'ne');
    change('Starting facing', '');
    apply();
    expect(joined.calls.at(-1)).toEqual({
      kind: 'actor-start',
      target: { kind: 'actor', id: 'goblin-1' },
      facing: { kind: 'default' },
    });
    expect(joined.session.document).toBe(before);
    expect(
      joined.session.document.draft.room.monsterDeclarations.find(
        (monster) => monster.id === 'goblin-1'
      )!.startingCell
    ).not.toHaveProperty('facing');
    expect(joined.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    expect(joined.writes()).toBe(writes);
    expect(joined.session.canUndo).toBe(false);
  });

  it('an empty group has actual origin/yaw but no invented height or free tilt/XYZ scale', () => {
    const document = createPopulatedStudioDocument();
    document.draft.scene.groups.push({
      id: 'empty',
      kind: 'group',
      label: 'Empty group',
      transform: { x: 1.125, y: 0.5, z: -2.125, rotationY: 0.25 },
    });
    const joined = owner(document);
    joined.selectScene(['empty']);
    expect(token('World X')).toBe('1.125');
    expect(token('World Y')).toBe('0.5');
    expect(token('World Z')).toBe('-2.125');
    expect(token('Y facing (degrees)')).toBe('14.323945');
    expect(screen.queryByLabelText('Height scale (%)')).toBeNull();
    expect(screen.queryByLabelText(/tilt|scale X|scale Z/i)).toBeNull();
    expect(joined.calls).toHaveLength(0);
  });
});

describe('linked room label Arrange affordances', () => {
  it('projects mode/reason on the existing label selection and removes only the linked pair, atomically', () => {
    const joined = owner();
    act(() =>
      expect(
        joined.session.regionEditing.createRoomLabel('Forest', { x: 0, z: 0 })
      ).toBe(true)
    );
    const before = joined.session.document;
    const region = before.draft.scene.authoringRegions![0];
    act(() => joined.session.mapLabelSelection.select(region.labelId));
    expect(
      screen.getByText(/Automatic · Unresolved.*No enclosure accepted/)
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete label' })).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete region and label' })
    );
    expect(joined.calls.at(-1)).toEqual({
      kind: 'region-remove',
      target: { kind: 'label', id: region.labelId },
      regionId: region.id,
    });
    expect(
      joined.session.document.draft.scene.authoringRegions
    ).toBeUndefined();
    expect(joined.session.document.draft.room).toEqual(before.draft.room);
    expect(joined.session.document.scope).toEqual(before.scope);
    act(() => joined.session.undo());
    expect(joined.session.document).toEqual(before);
  });
});

describe('linked label staged background joined to owner', () => {
  it('dirty equal label tokens keep strict policy refusal; lighting alone retains unfinished policy without invented facts', () => {
    const document = createRegionLightingDocument();
    const bytes = new Map([
      [
        ROOM_DRAFT_STORAGE_KEY,
        stringifyRoomDraft(document.draft, document.scope),
      ],
    ]);
    const storage: KeyValueStorage = {
      getItem: (key) => bytes.get(key) ?? null,
      setItem: (key, value) => {
        bytes.set(key, value);
      },
    };
    const mounted = render(<WorldBuildingConcept roomMode storage={storage} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add intel record' }));
    let session: EncounterStudioSession;
    mounted.rerender(
      <WorldBuildingConcept
        roomMode
        storage={storage}
        studioPresentation={{
          view: 'layout',
          render: (next) => {
            session = next;
            return <StudioArrangePanel session={next} expanded />;
          },
        }}
      />
    );
    act(() => session.mapLabelSelection.select('lighting-left-label'));
    const unfinished = session!.document;
    const savedBytes = bytes.get(ROOM_DRAFT_STORAGE_KEY);
    expect(unfinished.scope.intel!.at(-1)).toMatchObject({
      reveals: { fact: '' },
    });
    change('Rename label', 'other');
    change('Rename label', 'left');
    change('Background light (%)', '15');
    apply();
    expect(session!.document).toBe(unfinished);
    expect(screen.getByRole('alert').textContent).toMatch(/refused/);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Arrange' }));
    change('Background light (%)', '15');
    apply();
    expect(session!.document.draft.scene.authoringRegions![0].lighting).toEqual(
      { background: 0.15 }
    );
    expect(session!.document.scope).toEqual(unfinished.scope);
    expect(bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(savedBytes);
    expect(() =>
      stringifyRoomDraft(session!.document.draft, session!.document.scope)
    ).toThrow();
    act(() => session!.undo());
    expect(session!.document).toEqual(unfinished);
  });
  function linked(configured = false) {
    const joined = owner(createRegionLightingDocument(configured));
    act(() => joined.session.mapLabelSelection.select('lighting-left-label'));
    return joined;
  }
  it('distinguishes absent baseline from deliberate 100 and equal authored noops', () => {
    const joined = linked();
    const before = joined.session.document;
    const writes = joined.writes();
    expect(token('Background light (%)')).toBe('');
    expect(
      screen.getByText('Baseline · no region light authored')
    ).toBeTruthy();
    apply();
    change('Rename label', 'Left renamed');
    apply();
    expect(joined.session.document.draft.scene.version).toBe(3);
    expect(
      joined.session.document.draft.scene.authoringRegions![0]
    ).not.toHaveProperty('lighting');
    act(() => joined.session.undo());
    expect(joined.session.document).toEqual(before);
    change('Background light (%)', '100');
    apply();
    expect(joined.calls.at(-1)).toEqual({
      kind: 'label-edit',
      target: { kind: 'label', id: 'lighting-left-label' },
      regionLighting: { regionId: 'lighting-left', value: { background: 1 } },
    });
    expect(joined.session.document.draft.scene.version).toBe(4);
    const authored = joined.session.document;
    const bytes = joined.bytes.get(ROOM_DRAFT_STORAGE_KEY);
    const equalWrites = joined.writes();
    change('Background light (%)', '100');
    apply();
    expect(joined.session.document).toBe(authored);
    expect(joined.bytes.get(ROOM_DRAFT_STORAGE_KEY)).toBe(bytes);
    expect(joined.writes()).toBe(equalWrites);
    expect(equalWrites).toBeGreaterThan(writes);
    act(() => joined.session.undo());
    expect(joined.session.document).toEqual(before);
  });
  it('composes dirty rename/move/background as one history step preserving the full payload', () => {
    const joined = linked();
    const before = joined.session.document;
    const writes = joined.writes();
    change('Rename label', 'Kitchen');
    change('Label world X', '-2.25');
    change('Background light (%)', '15');
    expect(joined.session.document).toBe(before);
    fireEvent.keyDown(screen.getByLabelText('Background light (%)'), {
      key: 'Enter',
    });
    expect(joined.calls).toHaveLength(1);
    expect(joined.calls[0]).toMatchObject({
      text: 'Kitchen',
      location: { x: -2.25 },
      regionLighting: {
        regionId: 'lighting-left',
        value: { background: 0.15 },
      },
    });
    expect(joined.writes()).toBe(writes + 1);
    const expected = structuredClone(before);
    expected.draft.scene.version = 4;
    expected.draft.scene.mapLabels!.find(
      (l) => l.id === 'lighting-left-label'
    )!.text = 'Kitchen';
    expected.draft.scene.mapLabels!.find(
      (l) => l.id === 'lighting-left-label'
    )!.location.x = -2.25;
    expected.draft.scene.authoringRegions![0].lighting = { background: 0.15 };
    expect(joined.session.document).toEqual(expected);
    act(() => joined.session.undo());
    expect(joined.session.document).toEqual(before);
    expect(joined.session.canUndo).toBe(false);
  });
  it.each(['101', '-1', '', 'text', 'Infinity'])(
    'invalid background %j refuses the entire form',
    (value) => {
      const joined = linked();
      const before = joined.session.document;
      const writes = joined.writes();
      change('Rename label', 'Never');
      change('Background light (%)', '15');
      change('Background light (%)', value);
      apply();
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(token('Background light (%)')).toBe(value);
      expect(joined.calls).toHaveLength(0);
      expect(joined.session.document).toBe(before);
      expect(joined.writes()).toBe(writes);
    }
  );
  it('collapse retains the form; cancel/escape/target/epoch/document retire staged lighting', () => {
    const joined = linked(true);
    const before = joined.session.document;
    const writes = joined.writes();
    const reset = () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Use baseline appearance' })
      );
    reset();
    expect(joined.session.document).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Arrange' }));
    expect(token('Background light (%)')).toBe('15');
    reset();
    fireEvent.keyDown(screen.getByLabelText('Background light (%)'), {
      key: 'Escape',
    });
    expect(token('Background light (%)')).toBe('15');
    reset();
    change('Rename label', 'Never');
    joined.collapse(true);
    joined.collapse(false);
    expect(token('Background light (%)')).toBe('');
    expect(token('Rename label')).toBe('Never');
    reset();
    act(() => joined.session.cancelTransients());
    expect(token('Background light (%)')).toBe('15');
    reset();
    act(() => joined.session.mapLabelSelection.select('lighting-right-label'));
    act(() => joined.session.mapLabelSelection.select('lighting-left-label'));
    expect(token('Background light (%)')).toBe('15');
    reset();
    act(() => joined.session.renameDocument('Replaced'));
    expect(token('Background light (%)')).toBe('15');
    expect(joined.calls).toHaveLength(0);
    expect(joined.writes()).toBe(writes + 1);
    reset();
    apply();
    expect(joined.calls.at(-1)).toMatchObject({
      regionLighting: { regionId: 'lighting-left', value: null },
    });
    expect(joined.session.document.draft.scene.version).toBe(4);
    expect(
      joined.session.document.draft.scene.authoringRegions![0]
    ).not.toHaveProperty('lighting');
  });
  it('notes exclude lighting, unresolved saved intent explains not applied', () => {
    const doc = createRegionLightingDocument(true);
    doc.draft.room.walls!.find((w) => w.id === 'lighting-divider')!.line.end.z =
      2.75;
    const joined = owner(doc);
    act(() => joined.session.mapLabelSelection.select('lighting-note'));
    expect(screen.queryByLabelText('Background light (%)')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Use baseline appearance' })
    ).toBeNull();
    act(() => joined.session.mapLabelSelection.select('lighting-left-label'));
    expect(token('Background light (%)')).toBe('15');
    expect(
      screen.getByText('Lighting saved · not applied until boundary resolves')
    ).toBeTruthy();
    expect(screen.getByText(/Automatic · Unresolved/)).toBeTruthy();
  });
});
