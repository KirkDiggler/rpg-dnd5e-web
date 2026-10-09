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
  const demand = vi.fn();
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
              onAppearanceDemandChange={demand}
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
    demand,
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

  it('wall position, facing, fixed-endpoint length, dimensions and explicit appearance choice form one transaction', () => {
    const joined = owner();
    joined.selectWall();
    const before = joined.session.document;
    const writes = joined.writes();
    expect(screen.queryByLabelText('World Y')).toBeNull();
    expect(screen.queryByLabelText('Search wall appearances')).toBeNull();
    expect(joined.demand).toHaveBeenLastCalledWith(false);
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
    expect(joined.demand).toHaveBeenLastCalledWith(true);
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
