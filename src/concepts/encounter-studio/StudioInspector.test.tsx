import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RoomWallFinish } from '../world-building/regionFinishTypes';
import {
  parseRoomDocumentJson,
  placeRoomMonster,
  setRoomPartyStart,
  stringifyRoomDraft,
  type RoomDraftDocument,
} from '../world-building/roomDraft';
import { addProp, groupSelection } from '../world-building/sceneState';
import { CreatureOrders } from '../world-building/SitePolicies';
import {
  applyStudioActorArrange,
  projectStudioArrange,
  type StudioArrangeIntent,
  type StudioArrangeTarget,
} from '../world-building/studioArrange';
import {
  createGuardCastDocument,
  GUARD,
  placeCastMember,
} from './fixtures/castDocument';
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
    expect(view.queryByRole('region', { name: 'Behaviour' })).toBeNull();
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
    expect(view.queryByRole('region', { name: 'Size' })).toBeNull();
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

  describe('S1 the creature view names its cast member', () => {
    const LOOK = 'dnd5e:npcs:kingdom:soldier-male-01-style-02-b';
    function castSession(
      document: RoomDraftDocument,
      id: string
    ): EncounterStudioSession {
      return selected(
        { ...createFakeStudioSession(), document },
        { kind: 'actor', id }
      );
    }
    const castSection = () =>
      within(within(region()).getByRole('region', { name: 'Cast member' }));
    /** The value a cast summary gives one term. */
    const fact = (term: string): string =>
      castSection()
        .getByText(term, { selector: 'dt' })
        .nextElementSibling?.textContent?.trim() ?? '';

    it('the creature view names its cast member and links to it', () => {
      const onOpenCastMember = vi.fn();
      inspector(castSession(createGuardCastDocument(), 'gate-1'), {
        onOpenCastMember,
      });
      expect(fact('Cast member')).toBe('Guard · stat block guard');
      expect(
        castSection().getByText('Changes to Guard reach every placement.')
      ).toBeTruthy();
      expect(fact('Stat block')).toBe('base Human');
      expect(
        castSection().getByText(
          "Stamped at placement. Changing Guard's default faction does not change this."
        )
      ).toBeTruthy();
      fireEvent.click(
        castSection().getByRole('button', { name: 'Open cast member Guard' })
      );
      expect(onOpenCastMember).toHaveBeenCalledWith(GUARD);
    });

    it('a look equal to the default reads as the default, a changed one as stamped', () => {
      const document = createGuardCastDocument();
      const stamped = placeCastMember(document, 'gate-3', GUARD, 2, LOOK);
      inspector(castSession(stamped, 'gate-1'));
      expect(fact('Look')).toBe("Cast member's default");
      cleanup();
      inspector(castSession(stamped, 'gate-3'));
      expect(fact('Look')).toBe('Stamped at placement');
    });

    it("changing one placement's look leaves its sibling unchanged", () => {
      const document = createGuardCastDocument();
      const session = castSession(document, 'gate-1');
      inspector(session);
      fireEvent.change(within(region()).getByLabelText('Style'), {
        target: { value: '02' },
      });
      fireEvent.click(
        within(region()).getByRole('button', { name: 'Apply Arrange' })
      );
      expect(session.commitArrange).toHaveBeenCalledTimes(1);
      const intent = vi.mocked(session.commitArrange).mock
        .calls[0]![0] as Extract<StudioArrangeIntent, { kind: 'actor-start' }>;
      expect(intent).toMatchObject({
        kind: 'actor-start',
        target: { kind: 'actor', id: 'gate-1' },
      });
      const next = applyStudioActorArrange(document.draft, intent);
      const [first, second] = next.room.monsterDeclarations;
      expect(first!.appearanceRef).not.toBe(
        'dnd5e:npcs:kingdom:soldier-male-01'
      );
      expect(second).toEqual(document.draft.room.monsterDeclarations[1]);
    });

    it('a placement whose stat block is missing warns, offers the cast and reassigns through one intent', () => {
      const document = placeCastMember(
        createGuardCastDocument(),
        'lost-1',
        'dnd5e:monsters:x',
        2
      );
      const session = castSession(document, 'lost-1');
      inspector(session);
      expect(castSection().getByRole('alert').textContent).toBe(
        "This placement's stat block, dnd5e:monsters:x, is not in the cast."
      );
      const pick = castSection().getByLabelText('Reassign to cast member');
      expect(
        [...pick.querySelectorAll('option')]
          .filter((option) => !option.disabled)
          .map((option) => option.value)
      ).toEqual([GUARD]);
      fireEvent.change(pick, { target: { value: GUARD } });
      fireEvent.click(castSection().getByRole('button', { name: 'Reassign' }));
      expect(session.creatures.setDefinition).toHaveBeenCalledTimes(1);
      expect(session.creatures.setDefinition).toHaveBeenCalledWith(
        'lost-1',
        GUARD
      );
    });

    it('a placement with a missing stat block still saves locally', () => {
      const document = placeCastMember(
        createGuardCastDocument(),
        'lost-1',
        'dnd5e:monsters:x',
        2
      );
      expect(
        parseRoomDocumentJson(
          stringifyRoomDraft(document.draft, document.scope)
        )
      ).toEqual(document);
    });
  });

  describe('S1 a selected cast member', () => {
    it('the inspector shows the cast member form, not a creature view', () => {
      const session = selected(
        {
          ...createFakeStudioSession(),
          document: createGuardCastDocument(),
        },
        { kind: 'cast', ref: GUARD }
      );
      expect(
        studioInspectionOf(session.arrange, session.document.draft.scene)
          .selection
      ).toEqual({ kind: 'castMember', ref: GUARD });
      inspector(session);
      const view = within(region());
      expect(
        view.getByRole('heading', { level: 2, name: 'Guard' })
      ).toBeTruthy();
      expect(
        view.getByRole('form', { name: 'Cast member Guard' })
      ).toBeTruthy();
      expect(view.queryByLabelText('Map name')).toBeNull();
      expect(view.queryByLabelText('Starting hex q')).toBeNull();
      fireEvent.click(
        view.getByRole('button', { name: 'Select placement gate-2' })
      );
      expect(session.creatures.select).toHaveBeenCalledWith('gate-2');
    });

    it('a cast target whose member is gone projects to nothing', () => {
      const document = createGuardCastDocument();
      expect(
        projectStudioArrange({
          draft: document.draft,
          scope: {},
          target: { kind: 'cast', ref: 'dnd5e:monsters:nobody' },
          selectionRevision: 1,
        })
      ).toBeNull();
    });
  });

  describe('S5 type scale and grouping', () => {
    function creatureSession(): EncounterStudioSession {
      const session = createFakeStudioSession();
      const draft = placeRoomMonster(session.document.draft, {
        id: 'guard',
        ref: 'dnd5e:monsters:skeleton',
        startingCell: { location: { q: 0, r: 0 } },
      });
      const monster = draft.room.monsterDeclarations[0]!;
      return selected(
        {
          ...session,
          document: { ...session.document, draft },
          socialControls: {
            ...session.socialControls,
            selection: (
              <CreatureOrders
                scope={{ factions: [{ id: 'garrison' }] }}
                room={draft.room}
                monster={monster}
                binding={{ faction: 'garrison' }}
                onFactionChange={vi.fn()}
                onOrdersChange={vi.fn()}
              />
            ),
          },
        },
        { kind: 'actor', id: 'guard' }
      );
    }
    const sectionTitles = (level: number): string[] =>
      within(region())
        .getAllByRole('heading', { level })
        .map((heading) => heading.textContent ?? '');

    it('a creature view has a Placement and a Behaviour section in that order', () => {
      inspector(creatureSession());
      expect(sectionTitles(3)).toEqual(['Placement', 'Behaviour']);
      const placement = within(region()).getByRole('region', {
        name: 'Placement',
      });
      expect(within(placement).getByLabelText('Map name')).toBeTruthy();
      expect(within(placement).getByLabelText('Starting facing')).toBeTruthy();
      expect(
        within(placement).getByRole('button', { name: 'Move creature' })
      ).toBeTruthy();
      const behaviour = within(region()).getByRole('region', {
        name: 'Behaviour',
      });
      expect(within(behaviour).getByLabelText('Creature faction')).toBeTruthy();
      expect(within(placement).queryByLabelText('Creature faction')).toBeNull();
    });

    it('Inherits and Overrides are subsection headings', () => {
      inspector(creatureSession());
      const behaviour = within(region()).getByRole('region', {
        name: 'Behaviour',
      });
      const titles = within(behaviour)
        .getAllByRole('heading', { level: 4 })
        .map((heading) => heading.textContent);
      expect(titles).toContain('Inherits');
      expect(titles).toContain('Overrides');
      expect(
        within(behaviour).getByRole('region', { name: 'Inherits' })
      ).toBeTruthy();
      expect(
        within(behaviour).getByRole('region', { name: 'Overrides' })
      ).toBeTruthy();
    });

    it('a prop view has Placement and Behaviour', () => {
      const session = selected(withScene(), { kind: 'scene', ids: ['barrel'] });
      inspector({
        ...session,
        socialControls: {
          ...session.socialControls,
          selection: <form aria-label="Prop orders" />,
        },
      });
      expect(sectionTitles(3)).toEqual(['Placement', 'Behaviour']);
      const placement = within(region()).getByRole('region', {
        name: 'Placement',
      });
      expect(within(placement).getByLabelText('World X')).toBeTruthy();
      const behaviour = within(region()).getByRole('region', {
        name: 'Behaviour',
      });
      expect(
        within(behaviour).getByRole('form', { name: 'Prop orders' })
      ).toBeTruthy();
    });

    it('a wall view has one section', () => {
      inspector(selected(populated(), { kind: 'wall', id: 'studio-wall' }));
      expect(sectionTitles(3)).toEqual(['Placement']);
      expect(
        within(
          within(region()).getByRole('region', { name: 'Placement' })
        ).getByLabelText('Start X')
      ).toBeTruthy();
    });
  });

  describe('S5 words, not ids', () => {
    const ID = '4cbfe6a7-d24c-4ef5-a0cc-a188b902d921';
    function unnamed(): EncounterStudioSession {
      const session = createFakeStudioSession();
      const draft = placeRoomMonster(session.document.draft, {
        id: ID,
        ref: 'dnd5e:monsters:goblin',
        startingCell: { location: { q: 0, r: 0 } },
      });
      const monster = draft.room.monsterDeclarations[0]!;
      return selected(
        {
          ...session,
          document: { ...session.document, draft },
          socialControls: {
            ...session.socialControls,
            selection: (
              <CreatureOrders
                scope={{}}
                room={draft.room}
                monster={monster}
                binding={undefined}
                onFactionChange={vi.fn()}
                onOrdersChange={vi.fn()}
                titled={false}
              />
            ),
          },
        },
        { kind: 'actor', id: ID }
      );
    }

    it('the creature view never prints the placement id as text', () => {
      inspector(unnamed());
      expect(region().textContent).not.toContain(ID);
      expect(
        within(region()).getByRole('heading', { level: 2, name: 'Goblin' })
      ).toBeTruthy();
    });

    it('Copy id copies the placement id', async () => {
      const writeText = vi.fn(() => Promise.resolve());
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
      inspector(unnamed());
      const copy = within(region()).getByRole('button', {
        name: 'Copy placement id',
      });
      expect(copy.getAttribute('title')).toBe(ID);
      fireEvent.click(copy);
      expect(writeText).toHaveBeenCalledWith(ID);
      expect(await within(region()).findByText('Copied')).toBeTruthy();
    });

    it('the kind shows its name with the ref on hover', () => {
      inspector(unnamed());
      const kind = within(region()).getByText('Kind', { selector: 'dt' })
        .nextElementSibling as HTMLElement;
      expect(kind.textContent).toBe('Goblin');
      expect(kind.getAttribute('title')).toBe('dnd5e:monsters:goblin');
      expect(region().textContent).not.toContain('Rules:');
    });
  });
});
