import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RoomWallFinish } from '../world-building/regionFinishTypes';
import {
  placeRoomMonster,
  setRoomPartyStart,
} from '../world-building/roomDraft';
import { addProp, groupSelection } from '../world-building/sceneState';
import {
  projectStudioArrange,
  type StudioArrangeTarget,
} from '../world-building/studioArrange';
import { createFakeStudioSession } from './fixtures/fakeStudioSession';
import { createPopulatedStudioDocument } from './fixtures/studioDocument';
import { StudioInspector, type StudioInspectorProps } from './StudioInspector';
import {
  studioInspectionOf,
  type EncounterStudioSession,
} from './studioSession';

function inspector(
  session: EncounterStudioSession,
  overrides: Partial<StudioInspectorProps> = {}
) {
  const props: StudioInspectorProps = {
    session,
    inspection: studioInspectionOf(
      session.arrange,
      session.document.draft.scene
    ),
    view: 'layout',
    layoutTool: 'select',
    armedTool: null,
    onConfigure: vi.fn(),
    onMoveCreature: vi.fn(),
    onFrameChange: vi.fn(),
    onArmTool: vi.fn(),
    onOpenRegion: vi.fn(),
    onPlacePartyStart: vi.fn(),
    ...overrides,
  };
  render(<StudioInspector {...props} />);
  return props;
}
const region = () => screen.getByRole('region', { name: 'Inspector' });
function selected(
  session: EncounterStudioSession,
  target: StudioArrangeTarget,
  regionResolutions?: Parameters<
    typeof projectStudioArrange
  >[0]['regionResolutions']
): EncounterStudioSession {
  return {
    ...session,
    arrange: projectStudioArrange({
      draft: session.document.draft,
      target,
      selectionRevision: 1,
      regionResolutions,
    }),
  };
}
function populated(): EncounterStudioSession {
  const session = createFakeStudioSession();
  const document = createPopulatedStudioDocument();
  return { ...session, document };
}
function withScene(): EncounterStudioSession {
  const session = createFakeStudioSession();
  let scene = addProp(
    session.document.draft.scene,
    'dnd5e:props:books',
    { x: 1, y: 0, z: 1, rotationY: 0 },
    'books'
  );
  scene = addProp(
    scene,
    'dnd5e:props:candle',
    { x: 2, y: 0, z: 1, rotationY: 0 },
    'candle'
  );
  scene = addProp(
    scene,
    'dnd5e:props:barrel',
    { x: 3, y: 0, z: 1, rotationY: 0 },
    'barrel'
  );
  scene = groupSelection(scene, ['books', 'candle'], 'shelf', 'Shelf');
  return {
    ...session,
    document: {
      ...session.document,
      draft: { ...session.document.draft, scene },
    },
  };
}

describe('StudioInspector', () => {
  it('nothing selected renders the Room heading', () => {
    inspector(createFakeStudioSession());
    expect(
      within(region()).getByRole('heading', { level: 2, name: 'Room' })
    ).toBeTruthy();
  });

  it('a wall selection renders the wall name heading', () => {
    inspector(selected(populated(), { kind: 'wall', id: 'studio-wall' }));
    expect(
      within(region()).getByRole('heading', {
        level: 2,
        name: 'Studio north wall',
      })
    ).toBeTruthy();
  });

  it("room view shows size, notes, party start and each region's room-default wall finish, and no floor default", () => {
    const session = createFakeStudioSession();
    const draft = setRoomPartyStart(session.document.draft, { q: 1, r: 0 });
    draft.scene = {
      ...draft.scene,
      version: 7,
      mapLabels: [
        { id: 'torch', text: 'Torch note', location: { x: 0, z: 0 } },
        { id: 'hall-label', text: 'Hall', location: { x: 1, z: 0 } },
      ],
      authoringRegions: [
        {
          id: 'hall',
          labelId: 'hall-label',
          boundary: { kind: 'automatic' },
          wallFinish: {
            materialRef: 'mat:stone',
            patternStart: {} as RoomWallFinish['patternStart'],
          },
        },
      ],
    };
    const props = inspector({
      ...session,
      document: { ...session.document, draft },
    });
    const room = within(region());
    expect(room.getByRole('textbox', { name: 'Width (hexes)' })).toBeTruthy();
    fireEvent.click(
      room.getByRole('button', { name: 'Select note Torch note' })
    );
    expect(session.mapLabelSelection.select).toHaveBeenCalledWith('torch');
    expect(room.queryByRole('button', { name: 'Select note Hall' })).toBeNull();
    expect(room.getByText('Hex 1, 0')).toBeTruthy();
    fireEvent.click(room.getByRole('button', { name: 'Move party start' }));
    expect(props.onPlacePartyStart).toHaveBeenCalledTimes(1);
    expect(room.getByText('Hall: mat:stone')).toBeTruthy();
    fireEvent.click(room.getByRole('button', { name: 'Edit region Hall' }));
    expect(props.onOpenRegion).toHaveBeenCalledWith('hall-label');
    expect(room.queryByText(/floor.default|default floor/i)).toBeNull();
    expect(room.queryByLabelText(/floor/i)).toBeNull();
  });

  it('group view lists its members and ungroups through one intent', () => {
    const ungroup = vi.fn();
    const session = selected(withScene(), { kind: 'scene', ids: ['shelf'] });
    inspector({
      ...session,
      propControls: {
        ...session.propControls,
        groupActions: (
          <button type="button" onClick={ungroup}>
            Ungroup
          </button>
        ),
      },
    });
    const view = within(region());
    expect(view.getByRole('heading', { level: 2, name: 'Shelf' })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Select member books' }));
    expect(session.viewportProps.onSelect).toHaveBeenCalledWith(['books']);
    expect(
      view.getByRole('button', { name: 'Select member candle' })
    ).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Ungroup' }));
    expect(ungroup).toHaveBeenCalledTimes(1);
    expect(
      view.queryByRole('region', { name: 'Selection configuration' })
    ).toBeNull();
  });

  it('label view shows text and cell and renames through one intent', () => {
    const session = createFakeStudioSession();
    session.document.draft.scene.mapLabels = [
      { id: 'note', text: 'Old note', location: { x: 1.5, z: -2 } },
    ];
    const live = selected(session, { kind: 'label', id: 'note' });
    inspector(live);
    const view = within(region());
    expect(
      (view.getByLabelText('Rename label') as HTMLInputElement).value
    ).toBe('Old note');
    expect(
      (view.getByLabelText('Label world X') as HTMLInputElement).value
    ).toBe('1.5');
    expect(
      (view.getByLabelText('Label world Z') as HTMLInputElement).value
    ).toBe('-2');
    fireEvent.change(view.getByLabelText('Rename label'), {
      target: { value: 'New note' },
    });
    fireEvent.submit(view.getByRole('form', { name: 'Arrange selected noun' }));
    expect(live.commitArrange).toHaveBeenCalledExactlyOnceWith({
      kind: 'label-edit',
      target: { kind: 'label', id: 'note' },
      text: 'New note',
    });
  });

  it('party start view shows its cell and Move arms the gesture', () => {
    const session = createFakeStudioSession();
    const draft = setRoomPartyStart(session.document.draft, { q: 2, r: -1 });
    const props = inspector(
      selected(
        { ...session, document: { ...session.document, draft } },
        {
          kind: 'start',
        }
      )
    );
    const view = within(region());
    expect(
      view.getByRole('heading', { level: 2, name: 'Party start' })
    ).toBeTruthy();
    expect(
      (view.getByLabelText('Starting hex q') as HTMLInputElement).value
    ).toBe('2');
    expect(
      (view.getByLabelText('Starting hex r') as HTMLInputElement).value
    ).toBe('-1');
    fireEvent.click(view.getByRole('button', { name: 'Move party start' }));
    expect(props.onPlacePartyStart).toHaveBeenCalledTimes(1);
  });

  it('two picked roots show only the pick strip, and Group selection is offered', () => {
    const group = vi.fn();
    const session = selected(withScene(), {
      kind: 'scene',
      ids: ['shelf', 'barrel'],
    });
    inspector({
      ...session,
      propControls: {
        ...session.propControls,
        groupActions: (
          <button type="button" onClick={group}>
            Group selection
          </button>
        ),
      },
    });
    const view = within(region());
    expect(
      view.getByRole('heading', { level: 2, name: '2 props picked' })
    ).toBeTruthy();
    expect(view.queryByRole('region', { name: 'Room size' })).toBeNull();
    expect(view.getByLabelText('World X')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Group selection' }));
    expect(group).toHaveBeenCalledTimes(1);
  });

  it('hex view shows the fixed play values read-only', () => {
    inspector(
      selected(createFakeStudioSession(), { kind: 'hex', cell: { q: 1, r: 0 } })
    );
    const view = within(region());
    expect(view.getByText('Cell q 1, r 0')).toBeTruthy();
    const play = within(view.getByRole('region', { name: 'Play' }));
    expect(
      play.getByText(
        'Void: transparent · Lighting: bright · Standing: centre-covered'
      )
    ).toBeTruthy();
    expect(play.queryByRole('textbox')).toBeNull();
    expect(play.queryByRole('combobox')).toBeNull();
    expect(
      view.queryByRole('form', { name: 'Arrange selected noun' })
    ).toBeNull();
  });

  it('hex view names the region and lighting and opens that region', () => {
    const session = createFakeStudioSession();
    session.document.draft.scene.mapLabels = [
      { id: 'hall-label', text: 'Hall', location: { x: 0, z: 0 } },
    ];
    session.document.draft.scene.authoringRegions = [
      {
        id: 'hall',
        labelId: 'hall-label',
        lighting: { background: 0.25 },
        boundary: { kind: 'explicit', cells: [{ q: 0, r: 0 }] },
      },
    ];
    const props = inspector(
      selected(session, { kind: 'hex', cell: { q: 0, r: 0 } }, [
        {
          id: 'hall',
          status: 'resolved',
          area: { kind: 'hex-union', cells: [{ q: 0, r: 0 }] },
        },
      ])
    );
    const view = within(region());
    expect(view.getByText(/Hall · Lighting: background 25%/)).toBeTruthy();
    expect(view.getByText(/Not walkable/)).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Edit region Hall' }));
    expect(props.onOpenRegion).toHaveBeenCalledWith('hall-label');
  });

  it('hex view with no region says none is drawn', () => {
    inspector(
      selected(createFakeStudioSession(), { kind: 'hex', cell: { q: 0, r: 0 } })
    );
    expect(within(region()).getByText('No region is drawn here.')).toBeTruthy();
  });

  it('wall view shows finish, endpoints, height and Place a door, and Place a door arms the door tool', () => {
    const props = inspector(
      selected(populated(), { kind: 'wall', id: 'studio-wall' })
    );
    const view = within(region());
    expect(view.getByLabelText('Appearance height')).toBeTruthy();
    expect(view.getByLabelText('Start X')).toBeTruthy();
    expect(view.getByLabelText('End Z')).toBeTruthy();
    expect(
      view.getByRole('button', { name: 'Change wall appearance' })
    ).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Place a door' }));
    expect(props.onArmTool).toHaveBeenCalledExactlyOnceWith('door');
  });

  it('door view shows position and width and removes the door through one intent', () => {
    const live = selected(populated(), {
      kind: 'door',
      wallId: 'studio-wall',
      openingId: 'studio-opening',
      doorId: 'studio-door',
    });
    inspector(live);
    const view = within(region());
    expect(
      (view.getByLabelText('Along wall position') as HTMLInputElement).value
    ).toBe('6');
    expect((view.getByLabelText('Door width') as HTMLInputElement).value).toBe(
      '2'
    );
    expect(
      view.getByText(/Model: dnd5e:env:dark-fortress:wall_door_double_01/)
    ).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Delete doorway' }));
    expect(live.commitArrange).toHaveBeenCalledExactlyOnceWith({
      kind: 'door-remove',
      target: {
        kind: 'door',
        wallId: 'studio-wall',
        openingId: 'studio-opening',
        doorId: 'studio-door',
      },
    });
  });

  it('creature view shows look, facing and the creature orders form', () => {
    const session = createFakeStudioSession();
    const draft = placeRoomMonster(session.document.draft, {
      id: 'guard',
      ref: 'dnd5e:monsters:skeleton',
      startingCell: { location: { q: 0, r: 0 } },
    });
    const live = selected(
      {
        ...session,
        document: { ...session.document, draft },
        socialControls: {
          ...session.socialControls,
          selection: <form aria-label="Creature orders" />,
        },
      },
      { kind: 'actor', id: 'guard' }
    );
    const props = inspector(live);
    const view = within(region());
    expect(view.getByLabelText('NPC appearance')).toBeTruthy();
    expect(view.getByLabelText('Starting facing')).toBeTruthy();
    expect(view.getByRole('form', { name: 'Creature orders' })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Edit factions' }));
    expect(props.onConfigure).toHaveBeenCalledWith('factions');
  });

  it('a creature view never renders the Factions form', () => {
    const session = createFakeStudioSession();
    const draft = placeRoomMonster(session.document.draft, {
      id: 'guard',
      ref: 'dnd5e:monsters:skeleton',
      startingCell: { location: { q: 0, r: 0 } },
    });
    inspector(
      selected(
        {
          ...session,
          document: { ...session.document, draft },
          socialControls: {
            ...session.socialControls,
            factions: <form aria-label="Factions" />,
          },
        },
        { kind: 'actor', id: 'guard' }
      )
    );
    expect(
      within(region()).queryByRole('form', { name: 'Factions' })
    ).toBeNull();
  });

  it('prop view shows position, the arrange extras and prop orders for a declared prop', () => {
    const session = selected(withScene(), { kind: 'scene', ids: ['barrel'] });
    inspector({
      ...session,
      socialControls: {
        ...session.socialControls,
        selection: <form aria-label="Prop orders" />,
      },
    });
    const view = within(region());
    expect(
      view.getByRole('heading', { level: 2, name: 'barrel' })
    ).toBeTruthy();
    expect(view.getByLabelText('World X')).toBeTruthy();
    expect(view.getByText('Reused actions and light controls')).toBeTruthy();
    expect(view.getByRole('form', { name: 'Prop orders' })).toBeTruthy();
    expect(view.queryByText('Reused group actions')).toBeNull();
  });

  it('a refused wall edit keeps the staged height and shows the refusal', () => {
    const live = selected(populated(), { kind: 'wall', id: 'studio-wall' });
    inspector({ ...live, commitArrange: vi.fn(() => false) });
    const view = within(region());
    fireEvent.change(view.getByLabelText('Appearance height'), {
      target: { value: '5' },
    });
    fireEvent.submit(view.getByRole('form', { name: 'Arrange selected noun' }));
    expect(view.getByRole('alert').textContent).toMatch(/refused/);
    expect(
      (view.getByLabelText('Appearance height') as HTMLInputElement).value
    ).toBe('5');
  });
});
