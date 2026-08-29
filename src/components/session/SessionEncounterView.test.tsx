import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import {
  EventKind,
  EventSchema,
  type Event as SessionEvent,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  AttackRefSchema,
  ClockKind,
  DamageType,
  DeclarationSchema,
  DoorState,
  GridKind,
  HexLayout,
  MemberKind,
  ShortfallReason,
  ShortfallSchema,
  Slot,
  Standing,
  TargetCandidateSchema,
  TargetKind,
  Verb,
  type Declaration,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionCanvasProps } from './SessionCanvas';

const hoisted = vi.hoisted(() => ({
  lastCanvasProps: { current: null as SessionCanvasProps | null },
  atlasResult: {
    atlas: null as unknown,
    loading: true,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  whereResult: {
    position: null as unknown,
    loading: true,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  getCharacterFn: vi.fn(),
  moveFn: vi.fn(),
  streamEventsFn: vi.fn(),
  getStoryFn: vi.fn(),
  getViewFn: vi.fn(),
  getRosterFn: vi.fn(),
  getDoorsFn: vi.fn(),
  openDoorFn: vi.fn(),
  unlockFn: vi.fn(),
  affordFn: vi.fn(),
  turnFn: vi.fn(),
  attackFn: vi.fn(),
  endTurnFn: vi.fn(),
  getCharacterDataFn: vi.fn(),
  equipItemFn: vi.fn(),
  unequipItemFn: vi.fn(),
}));

vi.mock('./SessionCanvas', () => ({
  SessionCanvas: (props: SessionCanvasProps) => {
    hoisted.lastCanvasProps.current = props;
    return <div data-testid="session-canvas" />;
  },
}));

vi.mock('../../api/useSessionAtlas', () => ({
  useSessionAtlas: () => hoisted.atlasResult,
}));

vi.mock('../../api/useSessionWhere', () => ({
  useSessionWhere: () => hoisted.whereResult,
}));

// This legacy source must remain unused by the production session route.
vi.mock('../../api/characterHooks', () => ({
  useGetCharacter: () => ({ getCharacter: hoisted.getCharacterFn }),
}));

vi.mock('@/api/client', () => ({
  sessionClient: {
    move: hoisted.moveFn,
    streamEvents: hoisted.streamEventsFn,
    getStory: hoisted.getStoryFn,
    getView: hoisted.getViewFn,
    getRoster: hoisted.getRosterFn,
    getDoors: hoisted.getDoorsFn,
    openDoor: hoisted.openDoorFn,
    unlock: hoisted.unlockFn,
    afford: hoisted.affordFn,
    turn: hoisted.turnFn,
    attack: hoisted.attackFn,
    endTurn: hoisted.endTurnFn,
  },
  characterV2Client: {
    getCharacterData: hoisted.getCharacterDataFn,
    equipItem: hoisted.equipItemFn,
    unequipItem: hoisted.unequipItemFn,
  },
}));

import { SessionEncounterView } from './SessionEncounterView';

function pointyAtlas(overrides: Record<string, unknown> = {}) {
  return {
    grid: GridKind.HEX,
    layout: HexLayout.POINTY_TOP,
    cells: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
    boundaries: [],
    doorways: [],
    props: [],
    regions: [],
    ...overrides,
  };
}

function privateCharacterData(overrides: Record<string, unknown> = {}) {
  return {
    classRef: { module: 'dnd5e', type: 'class', id: 'fighter' },
    raceRef: { module: 'dnd5e', type: 'race', id: 'human' },
    playerId: 'player-1',
    equipped: {},
    inventory: [],
    slots: [],
    armorClassDetail: { total: 16, note: 'chain shirt + shield' },
    mainHandDamage: '1d8 slashing',
    level: 3,
    hitPoints: { current: 24, max: 28, temp: 0 },
    baseSpeedFeet: 30,
    features: [],
    conditions: [],
    resources: [],
    ...overrides,
  };
}

function participant(
  member: string,
  overrides: Partial<Participant> = {}
): Participant {
  return {
    member,
    name: member === 'char-1' ? 'Aldric' : 'Skeleton',
    kind: member.startsWith('char-') ? MemberKind.PLAYER : MemberKind.MONSTER,
    standing: Standing.UP,
    active: false,
    ...overrides,
  } as Participant;
}

type DeclarationOverrides = Partial<
  Omit<Declaration, '$typeName' | '$unknown'>
>;

function attackDeclaration(overrides: DeclarationOverrides = {}): Declaration {
  return create(DeclarationSchema, {
    id: 'v1.attack.longsword',
    verb: Verb.ATTACK,
    slot: Slot.ACTION,
    available: true,
    attack: create(AttackRefSchema, {
      ref: 'dnd5e:weapons:longsword',
      name: 'Longsword',
      damageType: DamageType.SLASHING,
    }),
    targetKind: TargetKind.MEMBER,
    candidates: [
      create(TargetCandidateSchema, {
        member: 'skeleton-1',
        available: true,
      }),
    ],
    ...overrides,
  });
}

function moveDeclaration(id = 'v1.move'): Declaration {
  return create(DeclarationSchema, {
    id,
    verb: Verb.MOVE,
    slot: Slot.NONE,
    available: true,
    targetKind: TargetKind.PATH,
    candidates: [],
    remaining: 30,
  });
}

function endTurnDeclaration(id = 'v1.end'): Declaration {
  return create(DeclarationSchema, {
    id,
    verb: Verb.END_TURN,
    slot: Slot.NONE,
    available: true,
    targetKind: TargetKind.NONE,
    candidates: [],
  });
}

function fakeStream(events: SessionEvent[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const entry of events) yield entry;
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function deferredStream(events: SessionEvent[]) {
  const gate = deferred<void>();
  return {
    stream: {
      [Symbol.asyncIterator]: async function* () {
        await gate.promise;
        for (const entry of events) yield entry;
      },
    },
    release: () => gate.resolve(),
  };
}

let nextSeq = 1n;
function event(
  kind: EventKind,
  body: SessionEvent['body'] = { case: undefined },
  seq?: bigint
): SessionEvent {
  return create(EventSchema, {
    session: 'enc-1',
    seq: seq ?? nextSeq++,
    kind,
    body,
    payload: new Uint8Array(),
  });
}

function readyScene() {
  hoisted.atlasResult.atlas = pointyAtlas();
  hoisted.atlasResult.loading = false;
  hoisted.whereResult.position = { x: 0, y: 0 };
  hoisted.whereResult.loading = false;
}

function readyTurn(
  declarations: Declaration[] = [
    attackDeclaration(),
    moveDeclaration(),
    endTurnDeclaration(),
  ]
) {
  readyScene();
  hoisted.turnFn.mockResolvedValue({
    clock: ClockKind.TURN,
    active: 'char-1',
    round: 2,
    order: ['char-1', 'skeleton-1'],
    participants: [
      participant('char-1', { active: true }),
      participant('skeleton-1'),
    ],
  });
  hoisted.affordFn.mockResolvedValue({
    clock: ClockKind.TURN,
    declarations,
  });
}

function renderView(
  overrides: Partial<React.ComponentProps<typeof SessionEncounterView>> = {}
) {
  return render(
    <SessionEncounterView
      sessionId="enc-1"
      characterId="char-1"
      playerId="player-1"
      onBack={() => {}}
      {...overrides}
    />
  );
}

beforeEach(() => {
  nextSeq = 1n;
  hoisted.lastCanvasProps.current = null;
  Object.assign(hoisted.atlasResult, {
    atlas: null,
    loading: true,
    error: null,
  });
  hoisted.atlasResult.refetch.mockReset();
  Object.assign(hoisted.whereResult, {
    position: null,
    loading: true,
    error: null,
  });
  hoisted.whereResult.refetch.mockReset();

  for (const mock of [
    hoisted.getCharacterFn,
    hoisted.moveFn,
    hoisted.streamEventsFn,
    hoisted.getStoryFn,
    hoisted.getViewFn,
    hoisted.getRosterFn,
    hoisted.getDoorsFn,
    hoisted.openDoorFn,
    hoisted.unlockFn,
    hoisted.affordFn,
    hoisted.turnFn,
    hoisted.attackFn,
    hoisted.endTurnFn,
    hoisted.getCharacterDataFn,
    hoisted.equipItemFn,
    hoisted.unequipItemFn,
  ]) {
    mock.mockReset();
  }

  hoisted.streamEventsFn.mockReturnValue(fakeStream([]));
  hoisted.getStoryFn.mockResolvedValue({ entries: [] });
  hoisted.getViewFn.mockResolvedValue({ sightings: [] });
  hoisted.getRosterFn.mockResolvedValue({
    members: [
      {
        id: 'char-1',
        kind: MemberKind.PLAYER,
        name: 'Aldric',
        classRef: 'fighter',
        raceRef: 'human',
        monsterRef: '',
      },
      {
        id: 'skeleton-1',
        kind: MemberKind.MONSTER,
        name: 'Skeleton',
        classRef: '',
        raceRef: '',
        monsterRef: 'dnd5e:monsters:skeleton',
      },
    ],
  });
  hoisted.getDoorsFn.mockResolvedValue({ doors: [] });
  hoisted.affordFn.mockResolvedValue({
    clock: ClockKind.WORLD,
    declarations: [],
  });
  hoisted.turnFn.mockResolvedValue({
    clock: ClockKind.WORLD,
    active: '',
    round: 0,
    order: [],
    participants: [],
  });
  hoisted.getCharacterDataFn.mockResolvedValue({
    character: privateCharacterData(),
  });
});

const struck = () =>
  event(EventKind.STRUCK, {
    case: 'struck',
    value: {
      attacker: 'skeleton-1',
      target: 'char-1',
      roll: 16,
      total: 20,
      against: 16,
      damage: 7,
      attack: {
        ref: 'dnd5e:weapons:shortsword',
        name: 'Shortsword',
        damageType: DamageType.PIERCING,
      },
      critical: false,
    },
  } as SessionEvent['body']);

const turnEnded = () =>
  event(EventKind.TURN_ENDED, {
    case: 'turnEnded',
    value: { member: 'skeleton-1', next: 'char-1' },
  } as SessionEvent['body']);

describe('SessionEncounterView production combat integration', () => {
  it('shows a clear error when no character is bound', () => {
    renderView({ characterId: undefined });
    screen.getByText(/no character selected/i);
    expect(screen.queryByTestId('session-canvas')).toBeNull();
  });

  it('keeps loading only until the public atlas and position land', () => {
    renderView();
    screen.getByText(/loading the tomb/i);
  });

  it('explicitly opts the production portal into the fill-parent combat layout', async () => {
    readyScene();
    renderView();

    const shell = await screen.findByTestId('combat-experience-shell');
    expect(shell.parentElement?.dataset.layout).toBe('fill-parent');
    expect(shell.parentElement?.className).toContain(
      'combatExperienceFillParent'
    );
  });

  it('keeps map and declarations usable through an initial private failure and retries only the explicit dock status', async () => {
    readyTurn();
    hoisted.getCharacterDataFn
      .mockRejectedValueOnce(new Error('private status unavailable'))
      .mockResolvedValueOnce({ character: privateCharacterData() });
    hoisted.attackFn.mockReturnValue(new Promise(() => {}));
    renderView();

    await waitFor(() => screen.getByTestId('session-canvas'));
    await screen.findByText('Private status unavailable');
    expect(screen.queryByText('24/28')).toBeNull();
    expect(screen.queryByTestId('session-combat-equipment-button')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /longsword/i }));
    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([
        'skeleton-1',
      ])
    );
    act(() => {
      hoisted.lastCanvasProps.current?.onEntityClick?.('skeleton-1');
    });
    expect(hoisted.attackFn).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole('button', { name: /retry private status/i })
    );
    await waitFor(() => screen.getByText('24/28'));
    expect(hoisted.getCharacterDataFn).toHaveBeenCalledTimes(2);
  });

  it('uses public roster identity/body on the world clock and private CharacterData only for sheet status', async () => {
    readyScene();
    const rosterLoad = deferred<{
      members: Awaited<ReturnType<typeof hoisted.getRosterFn>>['members'];
    }>();
    hoisted.getRosterFn.mockReturnValueOnce(rosterLoad.promise);
    hoisted.getCharacterDataFn.mockResolvedValue({
      character: privateCharacterData({
        classRef: { module: 'private', type: 'class', id: 'wizard' },
        raceRef: { module: 'private', type: 'race', id: 'human' },
      }),
    });
    hoisted.getRosterFn.mockResolvedValue({
      members: [
        {
          id: 'char-1',
          kind: MemberKind.PLAYER,
          name: 'Aldric',
          classRef: 'fighter',
          raceRef: 'elf',
          monsterRef: '',
        },
        {
          id: 'skeleton-1',
          kind: MemberKind.MONSTER,
          name: 'Skeleton',
          classRef: '',
          raceRef: '',
          monsterRef: 'dnd5e:monsters:skeleton',
        },
      ],
    });
    renderView();

    await waitFor(() => screen.getByTestId('session-canvas'));
    expect(hoisted.getCharacterFn).not.toHaveBeenCalled();
    expect(hoisted.lastCanvasProps.current?.characterName).toBe('You');
    expect(hoisted.lastCanvasProps.current?.classRefId).toBeUndefined();
    expect(hoisted.lastCanvasProps.current?.raceRefId).toBeUndefined();

    await act(async () => {
      rosterLoad.resolve({
        members: [
          {
            id: 'char-1',
            kind: MemberKind.PLAYER,
            name: 'Aldric',
            classRef: 'fighter',
            raceRef: 'elf',
            monsterRef: '',
          },
          {
            id: 'skeleton-1',
            kind: MemberKind.MONSTER,
            name: 'Skeleton',
            classRef: '',
            raceRef: '',
            monsterRef: 'dnd5e:monsters:skeleton',
          },
        ],
      });
      await rosterLoad.promise;
    });
    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current).toMatchObject({
        characterName: 'Aldric',
        classRefId: 'fighter',
        raceRefId: 'elf',
      })
    );
    expect(hoisted.getCharacterFn).not.toHaveBeenCalled();
    const dock = screen.getByTestId('session-combat-dock');
    within(dock).getByText('Aldric');
    within(dock).getByText(/level 3 fighter/i);
    expect(within(dock).queryByText(/wizard/i)).toBeNull();
    screen.getByText('24/28');
  });

  it('derives the local downed state from the public turn participant instead of private HP state', async () => {
    readyTurn();
    hoisted.turnFn.mockResolvedValue({
      clock: ClockKind.TURN,
      active: 'char-1',
      round: 2,
      order: ['char-1'],
      participants: [
        participant('char-1', {
          active: true,
          standing: Standing.DOWNED,
          name: 'Turn Snapshot Name',
        }),
      ],
    });
    hoisted.getRosterFn.mockResolvedValue({
      members: [
        {
          id: 'char-1',
          kind: MemberKind.PLAYER,
          name: 'Aldric',
          classRef: 'fighter',
          raceRef: 'elf',
          monsterRef: '',
        },
      ],
    });
    hoisted.getCharacterDataFn.mockResolvedValue({
      character: privateCharacterData({
        hitPoints: { current: 24, max: 28, temp: 0 },
      }),
    });
    renderView();

    await waitFor(() => screen.getByTestId('session-canvas'));
    await waitFor(() => {
      const currentCanvasProps = hoisted.lastCanvasProps.current as
        | (SessionCanvasProps & { localIsDowned?: boolean })
        | null;
      expect(currentCanvasProps).toMatchObject({
        characterName: 'Aldric',
        classRefId: 'fighter',
        raceRefId: 'elf',
        localIsDowned: true,
      });
    });
  });

  it('projects owner-authoritative main_hand into the local canvas presentation', async () => {
    readyScene();
    hoisted.getCharacterDataFn.mockResolvedValue({
      character: privateCharacterData({
        equipped: {
          main_hand: { module: 'dnd5e', type: 'item', id: 'greatsword' },
        },
      }),
    });
    renderView();

    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.mainHandPresentation).toEqual({
        ref: 'dnd5e:item:greatsword',
        weaponUrl: '/models/synty/weapons/greatsword.glb',
        socket: {
          bone: 'Hand_R',
          boneUnitMeters: 0.01,
          positionMeters: [
            -0.11356871832209599, 0.0437807216160595, -0.0070717729664129085,
          ],
          rotationQuaternion: [
            -0.31717459916354807, -0.45555976264236875, 0.6828311428133312,
            0.47498148472569474,
          ],
          scale: 1,
        },
      })
    );
  });

  it('keeps dock identity on the public roster during a turn instead of Turn participants or private CharacterData', async () => {
    readyTurn();
    hoisted.turnFn.mockResolvedValue({
      clock: ClockKind.TURN,
      active: 'char-1',
      round: 2,
      order: ['char-1'],
      participants: [
        participant('char-1', { name: 'Turn Snapshot Name', active: true }),
      ],
    });
    hoisted.getCharacterDataFn.mockResolvedValue({
      character: privateCharacterData({
        classRef: { module: 'private', type: 'class', id: 'wizard' },
      }),
    });
    renderView();

    const dock = await screen.findByTestId('session-combat-dock');
    within(dock).getByText('Aldric');
    within(dock).getByText(/level 3 fighter/i);
    expect(within(dock).queryByText('Turn Snapshot Name')).toBeNull();
    expect(within(dock).queryByText(/wizard/i)).toBeNull();
  });

  it('uses honest neutral dock/body fallbacks when the viewer is absent from the public roster', async () => {
    readyTurn();
    hoisted.getRosterFn.mockResolvedValue({
      members: [
        {
          id: 'skeleton-1',
          kind: MemberKind.MONSTER,
          name: 'Skeleton',
          classRef: '',
          raceRef: '',
          monsterRef: 'dnd5e:monsters:skeleton',
        },
      ],
    });
    hoisted.turnFn.mockResolvedValue({
      clock: ClockKind.TURN,
      active: 'char-1',
      round: 2,
      order: ['char-1'],
      participants: [
        participant('char-1', { name: 'Private Turn Name', active: true }),
      ],
    });
    hoisted.getCharacterDataFn.mockResolvedValue({
      character: privateCharacterData({
        classRef: { module: 'private', type: 'class', id: 'wizard' },
      }),
    });
    renderView();

    const dock = await screen.findByTestId('session-combat-dock');
    within(dock).getByText('You');
    within(dock).getByText(/level 3 adventurer/i);
    expect(within(dock).queryByText('Private Turn Name')).toBeNull();
    expect(within(dock).queryByText(/wizard/i)).toBeNull();
    expect(hoisted.lastCanvasProps.current?.characterName).toBe('You');
    expect(hoisted.lastCanvasProps.current?.classRefId).toBeUndefined();
    expect(hoisted.lastCanvasProps.current?.raceRefId).toBeUndefined();
  });

  it('keeps an already-drawn canvas mounted through a failed background Where refresh', async () => {
    readyScene();
    const { rerender } = renderView();
    await waitFor(() => screen.getByTestId('session-canvas'));
    const original = screen.getByTestId('session-canvas');

    hoisted.whereResult.position = null;
    hoisted.whereResult.error = new Error('transient where failure');
    rerender(
      <SessionEncounterView
        sessionId="enc-1"
        characterId="char-1"
        playerId="player-1"
        onBack={() => {}}
      />
    );

    expect(screen.getByTestId('session-canvas')).toBe(original);
    expect(hoisted.lastCanvasProps.current?.myPosition).toEqual({
      x: 0,
      y: -0,
      z: 0,
    });
  });

  it('echoes the empty selector only when Turn and Afford coherently report world clock', async () => {
    readyScene();
    hoisted.moveFn.mockReturnValue(new Promise(() => {}));
    renderView();
    await waitFor(() => screen.getByTestId('session-canvas'));
    await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(1));

    act(() => {
      hoisted.lastCanvasProps.current?.onHexClick?.({ x: 1, y: -1, z: 0 });
    });
    expect(hoisted.moveFn).toHaveBeenCalledWith({
      session: 'enc-1',
      member: 'char-1',
      path: [{ x: 1, y: 0 }],
      declarationId: '',
    });
    expect(hoisted.lastCanvasProps.current?.turnLocked).toBe(false);
  });

  it('echoes one exact Move declaration on turn clock', async () => {
    readyTurn();
    hoisted.moveFn.mockReturnValue(new Promise(() => {}));
    renderView();
    await waitFor(() => screen.getByTestId('session-canvas'));
    await waitFor(() => screen.getByRole('button', { name: /move/i }));

    act(() => {
      hoisted.lastCanvasProps.current?.onHexClick?.({ x: 1, y: -1, z: 0 });
    });
    expect(hoisted.moveFn).toHaveBeenCalledWith(
      expect.objectContaining({ declarationId: 'v1.move' })
    );
  });

  it.each([
    ['missing', [attackDeclaration(), endTurnDeclaration()]],
    ['ambiguous', [moveDeclaration('v1.move-a'), moveDeclaration('v1.move-b')]],
  ])(
    'refuses turn movement when Move authority is %s',
    async (_case, declarations) => {
      readyTurn(declarations as Declaration[]);
      renderView();
      await waitFor(() => screen.getByTestId('session-canvas'));
      act(() => {
        hoisted.lastCanvasProps.current?.onHexClick?.({ x: 1, y: -1, z: 0 });
      });
      expect(hoisted.moveFn).not.toHaveBeenCalled();
      expect(hoisted.lastCanvasProps.current?.turnLocked).toBe(true);
    }
  );

  it('clears the turn Move selector when authority transitions to world clock before the next free-roam request', async () => {
    readyScene();
    const turnParticipants = [participant('char-1', { active: true })];
    const postFightTurnRefresh = deferred<unknown>();
    const postFightAffordRefresh = deferred<unknown>();
    hoisted.turnFn
      .mockResolvedValueOnce({
        clock: ClockKind.TURN,
        active: 'char-1',
        round: 1,
        order: ['char-1'],
        participants: turnParticipants,
      })
      .mockResolvedValueOnce({
        clock: ClockKind.WORLD,
        active: '',
        round: 0,
        order: [],
        participants: [],
      })
      .mockReturnValue(postFightTurnRefresh.promise);
    hoisted.affordFn
      .mockResolvedValueOnce({
        clock: ClockKind.TURN,
        declarations: [moveDeclaration()],
      })
      .mockResolvedValueOnce({ clock: ClockKind.WORLD, declarations: [] })
      .mockReturnValue(postFightAffordRefresh.promise);
    hoisted.moveFn.mockResolvedValue({ steps: [] });
    const ended = deferredStream([
      event(EventKind.FIGHT_ENDED, {
        case: 'fightEnded',
        value: { cause: 1 },
      } as SessionEvent['body']),
    ]);
    hoisted.streamEventsFn.mockReturnValue(ended.stream);
    renderView();
    await waitFor(() => screen.getByRole('button', { name: /move/i }));

    act(() => {
      hoisted.lastCanvasProps.current?.onHexClick?.({ x: 1, y: -1, z: 0 });
    });
    await waitFor(() =>
      expect(hoisted.moveFn).toHaveBeenLastCalledWith(
        expect.objectContaining({ declarationId: 'v1.move' })
      )
    );

    await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(2));
    await waitFor(() => screen.getByTestId('session-combat-free-roam'));

    ended.release();
    await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(3));
    await waitFor(() => screen.getByTestId('session-combat-free-roam'));
    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.turnLocked).toBe(true)
    );

    await act(async () => {
      postFightTurnRefresh.resolve({
        clock: ClockKind.WORLD,
        active: '',
        round: 0,
        order: [],
        participants: [],
      });
      postFightAffordRefresh.resolve({
        clock: ClockKind.WORLD,
        declarations: [],
      });
      await Promise.all([
        postFightTurnRefresh.promise,
        postFightAffordRefresh.promise,
      ]);
    });
    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.turnLocked).toBe(false)
    );
    expect(hoisted.moveFn).toHaveBeenCalledTimes(1);

    act(() => {
      hoisted.lastCanvasProps.current?.onHexClick?.({ x: 1, y: -1, z: 0 });
    });
    await waitFor(() => expect(hoisted.moveFn).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(hoisted.moveFn).toHaveBeenLastCalledWith(
        expect.objectContaining({ declarationId: '' })
      )
    );
  });

  it('revokes old authority and queues one Turn/Afford refresh as soon as Move succeeds, before animation or an event', async () => {
    readyTurn();
    const moveResponse = deferred<unknown>();
    hoisted.moveFn.mockReturnValue(moveResponse.promise);
    renderView();
    const attack = await screen.findByRole('button', { name: /longsword/i });
    const endTurn = screen.getByRole('button', { name: /end turn/i });
    fireEvent.click(attack);
    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([
        'skeleton-1',
      ])
    );
    const oldTargetClick = hoisted.lastCanvasProps.current?.onEntityClick;

    act(() => {
      hoisted.lastCanvasProps.current?.onHexClick?.({ x: 1, y: -1, z: 0 });
    });
    expect(hoisted.moveFn).toHaveBeenCalledTimes(1);

    const turnRefresh = deferred<unknown>();
    const affordRefresh = deferred<unknown>();
    hoisted.turnFn.mockReturnValue(turnRefresh.promise);
    hoisted.affordFn.mockReturnValue(affordRefresh.promise);
    await act(async () => {
      moveResponse.resolve({
        steps: [{ position: { x: 1, y: 0 }, seq: 9n }],
      });
      await moveResponse.promise;
    });

    await screen.findByText(/actions may be out of date/i);
    expect(hoisted.lastCanvasProps.current?.turnLocked).toBe(true);
    expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([]);
    expect(hoisted.lastCanvasProps.current?.moveSeq).toBe(1);
    expect(hoisted.whereResult.refetch).not.toHaveBeenCalled();
    act(() => {
      oldTargetClick?.('skeleton-1');
      hoisted.lastCanvasProps.current?.onHexClick?.({ x: 1, y: -1, z: 0 });
    });
    fireEvent.click(endTurn);
    expect(hoisted.attackFn).not.toHaveBeenCalled();
    expect(hoisted.endTurnFn).not.toHaveBeenCalled();
    expect(hoisted.moveFn).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(2));
    await act(async () => {
      turnRefresh.resolve({
        clock: ClockKind.TURN,
        active: 'char-1',
        round: 2,
        order: ['char-1', 'skeleton-1'],
        participants: [
          participant('char-1', { active: true }),
          participant('skeleton-1'),
        ],
      });
      affordRefresh.resolve({
        clock: ClockKind.TURN,
        declarations: [
          attackDeclaration(),
          moveDeclaration(),
          endTurnDeclaration(),
        ],
      });
      await Promise.all([turnRefresh.promise, affordRefresh.promise]);
    });
    await waitFor(() =>
      expect(screen.queryByText(/actions may be out of date/i)).toBeNull()
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(hoisted.turnFn).toHaveBeenCalledTimes(2);
    expect(hoisted.affordFn).toHaveBeenCalledTimes(2);
    expect(hoisted.moveFn).toHaveBeenCalledTimes(1);
    expect(hoisted.whereResult.refetch).not.toHaveBeenCalled();
  });

  it('a completed move preserves server steps and reconciles after animation', async () => {
    readyScene();
    hoisted.moveFn.mockResolvedValue({
      steps: [{ position: { x: 1, y: 0 }, seq: 9n }],
    });
    hoisted.whereResult.refetch.mockResolvedValue(undefined);
    renderView();
    await waitFor(() => screen.getByTestId('session-canvas'));
    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.turnLocked).toBe(false)
    );

    act(() => {
      hoisted.lastCanvasProps.current?.onHexClick?.({ x: 1, y: -1, z: 0 });
    });
    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.moveSeq).toBe(1)
    );
    expect(hoisted.lastCanvasProps.current?.movePath).toEqual([
      { x: 1, y: -1, z: 0 },
    ]);
    act(() => {
      hoisted.lastCanvasProps.current?.onMovementPresentationComplete?.(1);
    });
    await waitFor(() => expect(hoisted.whereResult.refetch).toHaveBeenCalled());
  });

  it('renders mismatched Turn/Afford authority as not ready with no declarations or movement dispatch', async () => {
    readyScene();
    hoisted.turnFn.mockResolvedValue({
      clock: ClockKind.TURN,
      active: 'char-1',
      round: 1,
      order: ['char-1'],
      participants: [participant('char-1', { active: true })],
    });
    hoisted.affordFn.mockResolvedValue({
      clock: ClockKind.WORLD,
      declarations: [],
    });
    renderView();

    await waitFor(() => screen.getByTestId('session-combat-synchronizing'));
    await waitFor(() => screen.getByText('Actions are not ready'));
    expect(screen.queryByText('Longsword')).toBeNull();
    act(() => {
      hoisted.lastCanvasProps.current?.onHexClick?.({ x: 1, y: -1, z: 0 });
    });
    expect(hoisted.moveFn).not.toHaveBeenCalled();
    expect(hoisted.lastCanvasProps.current?.turnLocked).toBe(true);
  });

  it('renders no combat declaration row on world clock', async () => {
    readyScene();
    renderView();
    await waitFor(() =>
      within(screen.getByTestId('session-combat-dock')).getByText('Exploration')
    );
    const dock = screen.getByTestId('session-combat-dock');
    expect(within(dock).queryByText('Longsword')).toBeNull();
    expect(
      within(dock).queryByRole('button', { name: /end turn/i })
    ).toBeNull();
  });

  it('does not dispatch Attack or draw target rings before an authored Attack is armed', async () => {
    readyTurn();
    renderView();
    await waitFor(() => screen.getByTestId('session-canvas'));
    await waitFor(() => screen.getByRole('button', { name: /longsword/i }));

    expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([]);
    act(() => {
      hoisted.lastCanvasProps.current?.onEntityClick?.('skeleton-1');
    });
    expect(hoisted.attackFn).not.toHaveBeenCalled();
  });

  it('selecting Attack arms only its available candidates and echoes exact declaration id plus target', async () => {
    readyTurn();
    hoisted.attackFn.mockResolvedValue({
      seq: 7n,
      roll: 17,
      total: 20,
      against: 13,
      hit: true,
      critical: false,
      damage: 6,
      attack: attackDeclaration().attack,
    });
    renderView();
    await waitFor(() => screen.getByRole('button', { name: /longsword/i }));

    fireEvent.click(screen.getByRole('button', { name: /longsword/i }));
    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([
        'skeleton-1',
      ])
    );
    act(() => {
      hoisted.lastCanvasProps.current?.onEntityClick?.('skeleton-1');
    });

    expect(hoisted.attackFn).toHaveBeenCalledWith({
      session: 'enc-1',
      attacker: 'char-1',
      target: 'skeleton-1',
      declarationId: 'v1.attack.longsword',
    });
  });

  it('keeps panel-first actions live through the development StrictMode setup/cleanup probe', async () => {
    readyTurn();
    hoisted.attackFn.mockReturnValue(new Promise(() => {}));
    render(
      <StrictMode>
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={() => {}}
        />
      </StrictMode>
    );
    await screen.findByRole('button', { name: /longsword/i });

    fireEvent.click(screen.getByRole('button', { name: /longsword/i }));
    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([
        'skeleton-1',
      ])
    );
    act(() => {
      hoisted.lastCanvasProps.current?.onEntityClick?.('skeleton-1');
    });
    expect(hoisted.attackFn).toHaveBeenCalledTimes(1);
  });

  it('ingests an actor Attack response/event immediately while Story stays concealed pending explicit dice release', async () => {
    readyTurn();
    const localStrike = deferredStream([
      event(
        EventKind.STRUCK,
        {
          case: 'struck',
          value: {
            attacker: 'char-1',
            target: 'skeleton-1',
            roll: 17,
            total: 20,
            against: 13,
            damage: 6,
            attack: attackDeclaration().attack,
            critical: false,
          },
        } as SessionEvent['body'],
        7n
      ),
    ]);
    hoisted.streamEventsFn.mockReturnValue(localStrike.stream);
    hoisted.attackFn.mockResolvedValue({
      seq: 7n,
      roll: 17,
      total: 20,
      against: 13,
      hit: true,
      critical: false,
      damage: 6,
      attack: attackDeclaration().attack,
    });
    renderView();
    await screen.findByRole('button', { name: /longsword/i });
    fireEvent.click(screen.getByRole('button', { name: /longsword/i }));
    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([
        'skeleton-1',
      ])
    );
    act(() => {
      hoisted.lastCanvasProps.current?.onEntityClick?.('skeleton-1');
    });

    await waitFor(() => screen.getByText(/Roll your carved iron d20/i));
    expect(screen.queryByText(/Aldric strikes Skeleton/i)).toBeNull();
    localStrike.release();
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    await waitFor(() => screen.getByText(/source=live/i));
    fireEvent.click(screen.getByRole('button', { name: 'Story' }));
    expect(screen.queryByText(/Aldric strikes Skeleton/i)).toBeNull();
  });

  it('shows an unavailable candidate provider reason and never dispatches it', async () => {
    const unavailable = attackDeclaration({
      candidates: [
        create(TargetCandidateSchema, {
          member: 'skeleton-1',
          available: false,
          why: create(ShortfallSchema, {
            reason: ShortfallReason.TARGET_OUT_OF_REACH,
            text: 'Target is beyond the Longsword reach.',
          }),
        }),
      ],
    });
    readyTurn([unavailable, moveDeclaration(), endTurnDeclaration()]);
    renderView();
    await waitFor(() => screen.getByRole('button', { name: /longsword/i }));

    fireEvent.click(screen.getByRole('button', { name: /longsword/i }));
    await waitFor(() =>
      screen.getByRole('button', {
        name: 'Skeleton: Unavailable: Target is beyond the Longsword reach.',
      })
    );
    expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([]);
    act(() => {
      hoisted.lastCanvasProps.current?.onEntityClick?.('skeleton-1');
    });
    expect(hoisted.attackFn).not.toHaveBeenCalled();
  });

  it('never auto-chooses between multiple Attack offers on a direct map click', async () => {
    const unarmed = attackDeclaration({
      id: 'v1.attack.unarmed',
      attack: create(AttackRefSchema, {
        ref: 'dnd5e:attacks:unarmed-strike',
        name: 'Unarmed Strike',
        damageType: DamageType.BLUDGEONING,
      }),
    });
    readyTurn([
      attackDeclaration(),
      unarmed,
      moveDeclaration(),
      endTurnDeclaration(),
    ]);
    renderView();
    await waitFor(() => screen.getByRole('button', { name: /longsword/i }));

    expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([]);
    act(() => {
      hoisted.lastCanvasProps.current?.onEntityClick?.('skeleton-1');
    });
    expect(hoisted.attackFn).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /longsword/i }));
    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([
        'skeleton-1',
      ])
    );
  });

  it('End Turn echoes its own exact declaration selector', async () => {
    readyTurn();
    hoisted.endTurnFn.mockResolvedValue({ next: 'skeleton-1', seq: 8n });
    renderView();
    const button = await screen.findByRole('button', { name: /end turn/i });
    fireEvent.click(button);

    expect(hoisted.endTurnFn).toHaveBeenCalledWith({
      session: 'enc-1',
      member: 'char-1',
      declarationId: 'v1.end',
    });
  });

  it('coalesces a stream burst into one CharacterData/Turn/Afford/View refresh while Debug ingests immediately', async () => {
    readyTurn();
    const burst = deferredStream([
      event(EventKind.FIGHT_STARTED, {
        case: 'fightStarted',
        value: { members: ['char-1', 'skeleton-1'] },
      } as SessionEvent['body']),
      event(EventKind.DOWNED, {
        case: 'downed',
        value: { member: 'skeleton-1' },
      } as SessionEvent['body']),
      turnEnded(),
    ]);
    hoisted.streamEventsFn.mockReturnValue(burst.stream);
    renderView();
    await waitFor(() => screen.getByTestId('session-canvas'));
    await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(hoisted.getCharacterDataFn).toHaveBeenCalledTimes(1)
    );

    const privateRefresh = new Promise(() => {});
    hoisted.getCharacterDataFn.mockReturnValue(privateRefresh);
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    burst.release();

    await waitFor(() =>
      expect(screen.getAllByText(/source=live/i)).toHaveLength(3)
    );
    await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(2));
    expect(hoisted.getCharacterDataFn).toHaveBeenCalledTimes(2);
  });

  it('paces another member Story with monsterBeatQueue semantics without delaying query reconciliation or raw Debug', async () => {
    readyTurn();
    hoisted.turnFn.mockResolvedValue({
      clock: ClockKind.TURN,
      active: 'skeleton-1',
      round: 2,
      order: ['skeleton-1', 'char-1'],
      participants: [
        participant('skeleton-1', { active: true }),
        participant('char-1'),
      ],
    });
    const burst = deferredStream([struck(), turnEnded()]);
    hoisted.streamEventsFn.mockReturnValue(burst.stream);
    const { unmount } = renderView();
    await waitFor(() => screen.getByTestId('session-canvas'));
    await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(1));

    vi.useFakeTimers();
    try {
      await act(async () => {
        burst.release();
        await vi.advanceTimersByTimeAsync(0);
      });

      screen.getByText("Skeleton's turn.");
      // Authority reconciliation is immediate, before the 300ms Story cursor.
      expect(hoisted.getViewFn).toHaveBeenCalledTimes(2);

      fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
      expect(screen.getAllByText(/source=live/i)).toHaveLength(2);
      fireEvent.click(screen.getByRole('button', { name: 'Story' }));
      expect(screen.queryByText(/Skeleton strikes Aldric/i)).toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      screen.getByText(/Skeleton strikes Aldric/i);
    } finally {
      unmount();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('renders catch-up Story immediately instead of replaying retained history slowly', async () => {
    readyTurn();
    const history = struck();
    hoisted.getStoryFn.mockResolvedValue({ entries: [history] });
    const live = deferredStream([]);
    hoisted.streamEventsFn.mockReturnValue(live.stream);
    renderView();

    await waitFor(() => screen.getByText(/Skeleton strikes Aldric/i));
  });

  it('refreshes Where for self-MOVED and View for another member MOVED', async () => {
    readyScene();
    const burst = deferredStream([
      event(EventKind.MOVED, {
        case: 'moved',
        value: { member: 'char-1', to: { x: 1, y: 0 } },
      } as SessionEvent['body']),
      event(EventKind.MOVED, {
        case: 'moved',
        value: { member: 'skeleton-1', to: { x: 0, y: 1 } },
      } as SessionEvent['body']),
    ]);
    hoisted.streamEventsFn.mockReturnValue(burst.stream);
    renderView();
    await waitFor(() => screen.getByTestId('session-canvas'));
    await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(1));

    burst.release();
    await waitFor(() =>
      expect(hoisted.whereResult.refetch).toHaveBeenCalledTimes(1)
    );
    await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(2));
  });

  it('pulls the public roster on JOINED', async () => {
    readyScene();
    const joined = deferredStream([
      event(EventKind.JOINED, {
        case: 'joined',
        value: { member: 'char-2' },
      } as SessionEvent['body']),
    ]);
    hoisted.streamEventsFn.mockReturnValue(joined.stream);
    renderView();
    await waitFor(() => expect(hoisted.getRosterFn).toHaveBeenCalledTimes(1));
    joined.release();
    await waitFor(() => expect(hoisted.getRosterFn).toHaveBeenCalledTimes(2));
  });

  it('updates the confirmed door/path snapshot after a transient private background error', async () => {
    readyScene();
    hoisted.atlasResult.atlas = pointyAtlas({
      boundaries: [
        {
          from: { x: 0, y: 0 },
          to: { x: 1, y: 0 },
          blocksMovement: true,
          blocksLineOfSight: true,
        },
      ],
      doorways: [
        {
          connection: 'crypt-door',
          from: { x: 0, y: 0 },
          to: { x: 1, y: 0 },
        },
      ],
    });
    hoisted.getDoorsFn
      .mockResolvedValueOnce({
        doors: [{ door: 'crypt-door', state: DoorState.CLOSED, dc: 0 }],
      })
      .mockResolvedValueOnce({
        doors: [{ door: 'crypt-door', state: DoorState.OPEN, dc: 0 }],
      });
    hoisted.getCharacterDataFn
      .mockResolvedValueOnce({ character: privateCharacterData() })
      .mockRejectedValueOnce(new Error('private refresh failed'));
    const updates = deferredStream([
      struck(),
      event(EventKind.DOOR, {
        case: 'door',
        value: {
          door: 'crypt-door',
          state: DoorState.OPEN,
          actor: 'char-1',
          dc: 0,
          total: 0,
          beaten: false,
        },
      } as SessionEvent['body']),
    ]);
    hoisted.streamEventsFn.mockReturnValue(updates.stream);
    renderView();

    await waitFor(() => screen.getByTestId('session-canvas'));
    await waitFor(() =>
      expect(
        hoisted.lastCanvasProps.current?.pathIndex?.shutDoorEdges.size
      ).toBe(1)
    );
    updates.release();

    await waitFor(() =>
      expect(hoisted.getCharacterDataFn).toHaveBeenCalledTimes(2)
    );
    await waitFor(() => expect(hoisted.getDoorsFn).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        hoisted.lastCanvasProps.current?.pathIndex?.shutDoorEdges.size
      ).toBe(0)
    );
    expect(
      hoisted.lastCanvasProps.current?.doors?.get('crypt-door')?.state
    ).toBe(DoorState.OPEN);
  });

  it('preserves door actions and refreshes live door state', async () => {
    readyScene();
    hoisted.getDoorsFn.mockResolvedValue({
      doors: [{ door: 'crypt-door', state: DoorState.CLOSED, dc: 0 }],
    });
    hoisted.openDoorFn.mockResolvedValue({});
    renderView();
    await waitFor(() => screen.getByTestId('session-canvas'));
    await waitFor(() =>
      expect(
        hoisted.lastCanvasProps.current?.doors?.get('crypt-door')
      ).toBeDefined()
    );

    act(() => {
      hoisted.lastCanvasProps.current?.onDoorClick?.('crypt-door');
    });
    await waitFor(() =>
      expect(hoisted.openDoorFn).toHaveBeenCalledWith({
        session: 'enc-1',
        member: 'char-1',
        door: 'crypt-door',
      })
    );
    await waitFor(() => expect(hoisted.getDoorsFn).toHaveBeenCalledTimes(2));
  });

  it('replaces private equipment state directly from UnequipItem response without a read or client recompute', async () => {
    readyScene();
    const sword = { module: 'dnd5e', type: 'item', id: 'longsword' };
    const initial = privateCharacterData({
      equipped: { main_hand: sword },
      inventory: [
        {
          ref: sword,
          name: 'Longsword',
          statLine: '1d8 slashing',
          iconKey: '',
          kind: 'weapon',
          slotKeys: ['main_hand'],
        },
      ],
      slots: [
        { key: 'main_hand', displayLabel: 'Main Hand', accepts: ['weapon'] },
      ],
    });
    hoisted.getCharacterDataFn.mockResolvedValue({ character: initial });
    hoisted.unequipItemFn.mockResolvedValue({
      character: privateCharacterData({
        equipped: {},
        inventory: initial.inventory,
        slots: initial.slots,
        armorClassDetail: { total: 11, note: 'authoritative replacement' },
        mainHandDamage: '',
      }),
    });
    renderView();
    await screen.findByTestId('session-combat-equipment-button');
    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.mainHandPresentation?.ref).toBe(
        'dnd5e:item:longsword'
      )
    );

    fireEvent.click(screen.getByTestId('session-combat-equipment-button'));
    await screen.findByTestId('equipment-popover');
    fireEvent.click(screen.getByTestId('equip-socket-main_hand'));

    await waitFor(() => expect(hoisted.unequipItemFn).toHaveBeenCalled());
    await waitFor(() =>
      within(screen.getByTestId('equipment-popover')).getByText('11')
    );
    await waitFor(() =>
      expect(
        hoisted.lastCanvasProps.current?.mainHandPresentation
      ).toBeUndefined()
    );
    expect(hoisted.getCharacterDataFn).toHaveBeenCalledTimes(1);
  });

  it('replaces the visible main hand directly from the authoritative EquipItem response', async () => {
    readyScene();
    const greatsword = {
      module: 'dnd5e',
      type: 'item',
      id: 'greatsword',
    };
    const inventory = [
      {
        ref: greatsword,
        name: 'Greatsword',
        statLine: '2d6 slashing',
        iconKey: '',
        kind: 'weapon',
        slotKeys: ['main_hand'],
      },
    ];
    const slots = [
      { key: 'main_hand', displayLabel: 'Main Hand', accepts: ['weapon'] },
    ];
    hoisted.getCharacterDataFn.mockResolvedValue({
      character: privateCharacterData({ equipped: {}, inventory, slots }),
    });
    hoisted.equipItemFn.mockResolvedValue({
      character: privateCharacterData({
        equipped: { main_hand: greatsword },
        inventory,
        slots,
        mainHandDamage: '2d6 slashing',
      }),
    });
    renderView();
    await screen.findByTestId('session-combat-equipment-button');
    expect(
      hoisted.lastCanvasProps.current?.mainHandPresentation
    ).toBeUndefined();

    fireEvent.click(screen.getByTestId('session-combat-equipment-button'));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Greatsword — equip to Main Hand',
      })
    );

    await waitFor(() => expect(hoisted.equipItemFn).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        hoisted.lastCanvasProps.current?.mainHandPresentation
      ).toMatchObject({
        ref: 'dnd5e:item:greatsword',
        weaponUrl: '/models/synty/weapons/greatsword.glb',
      })
    );
    expect(hoisted.getCharacterDataFn).toHaveBeenCalledTimes(1);
  });

  it('synchronously resets and rereads private state when authenticated owner changes with the same session and character', async () => {
    readyScene();
    const secondOwner = deferred<{
      character: ReturnType<typeof privateCharacterData>;
    }>();
    hoisted.getCharacterDataFn
      .mockResolvedValueOnce({ character: privateCharacterData() })
      .mockReturnValueOnce(secondOwner.promise);
    const { rerender } = renderView();
    await screen.findByText('24/28');

    rerender(
      <SessionEncounterView
        sessionId="enc-1"
        characterId="char-1"
        playerId="player-2"
        onBack={() => {}}
      />
    );

    expect(screen.queryByText('24/28')).toBeNull();
    await screen.findByText(/loading private status/i);
    await waitFor(() =>
      expect(hoisted.getCharacterDataFn).toHaveBeenCalledTimes(2)
    );

    await act(async () => {
      secondOwner.resolve({
        character: privateCharacterData({
          playerId: 'player-2',
          hitPoints: { current: 9, max: 12, temp: 0 },
        }),
      });
      await secondOwner.promise;
    });
    await screen.findByText('9/12');
  });

  it('resets selection, Story/Debug, and private state on member change and fences stale map callbacks', async () => {
    readyTurn();
    const live = deferredStream([]);
    hoisted.streamEventsFn.mockReturnValue(live.stream);
    const { rerender } = renderView();
    await screen.findByRole('button', { name: /longsword/i });
    fireEvent.click(screen.getByRole('button', { name: /longsword/i }));
    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([
        'skeleton-1',
      ])
    );
    const staleTargetClick = hoisted.lastCanvasProps.current?.onEntityClick;

    hoisted.getCharacterDataFn.mockResolvedValueOnce({
      character: privateCharacterData({
        playerId: 'player-2',
        level: 1,
        hitPoints: { current: 5, max: 5, temp: 0 },
      }),
    });
    hoisted.getRosterFn.mockResolvedValueOnce({
      members: [
        {
          id: 'char-2',
          kind: MemberKind.PLAYER,
          name: 'Bryn',
          classRef: 'fighter',
          raceRef: 'human',
          monsterRef: '',
        },
      ],
    });
    rerender(
      <SessionEncounterView
        sessionId="enc-1"
        characterId="char-2"
        playerId="player-2"
        onBack={() => {}}
      />
    );

    expect(screen.queryByText('24/28')).toBeNull();
    act(() => staleTargetClick?.('skeleton-1'));
    expect(hoisted.attackFn).not.toHaveBeenCalled();
    await waitFor(() => screen.getByText('5/5'));
    expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([]);
    expect(hoisted.streamEventsFn).toHaveBeenLastCalledWith(
      { session: 'enc-1', member: 'char-2' },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('keeps terminal-stream reconnect status visible while GetStory recovery remains active', async () => {
    readyScene();
    hoisted.streamEventsFn.mockReturnValue(fakeStream([]));
    renderView();
    await waitFor(() => screen.getByText('Reconnecting…'));
    expect(hoisted.getStoryFn).toHaveBeenCalledWith(
      { session: 'enc-1', member: 'char-1', fromSeq: 0n },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('isolates a run-ended modal above an open equipment panel and focuses only its primary action', async () => {
    readyTurn();
    const ended = deferredStream([
      event(EventKind.ENDED, {
        case: 'ended',
        value: { ending: 'boss-down' },
      } as SessionEvent['body']),
    ]);
    hoisted.streamEventsFn.mockReturnValue(ended.stream);
    const onBack = vi.fn();
    renderView({ onBack });
    await screen.findByTestId('session-combat-equipment-button');
    fireEvent.click(screen.getByTestId('session-combat-equipment-button'));
    await screen.findByTestId('equipment-popover');
    const underlyingEndTurn = screen.getByRole('button', { name: /end turn/i });

    ended.release();

    const dialog = await screen.findByRole('dialog', {
      name: /tomb is cleared/i,
    });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.queryByTestId('equipment-popover')).toBeNull();
    const overlay = screen.getByTestId('run-ended-overlay');
    expect(Number(overlay.style.zIndex)).toBeGreaterThan(40);
    const underlying = screen.getByTestId('session-encounter-content');
    expect(underlying.hasAttribute('inert')).toBe(true);
    expect(underlying.getAttribute('aria-hidden')).toBe('true');
    screen.getByTestId('session-canvas');

    const leave = screen.getByRole('button', { name: 'Leave' });
    await waitFor(() => expect(document.activeElement).toBe(leave));
    fireEvent.click(underlyingEndTurn);
    expect(hoisted.endTurnFn).not.toHaveBeenCalled();
    act(() => {
      hoisted.lastCanvasProps.current?.onHexClick?.({ x: 1, y: -1, z: 0 });
      hoisted.lastCanvasProps.current?.onDoorClick?.('crypt-door');
    });
    expect(hoisted.moveFn).not.toHaveBeenCalled();
    expect(hoisted.openDoorFn).not.toHaveBeenCalled();

    fireEvent.click(leave);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('synchronously disables declarations and movement preview when an event invalidates authority, then waits for both current snapshots', async () => {
    readyTurn();
    const update = deferredStream([
      event(EventKind.FIGHT_STARTED, {
        case: 'fightStarted',
        value: { members: ['char-1', 'skeleton-1'] },
      } as SessionEvent['body']),
    ]);
    hoisted.streamEventsFn.mockReturnValue(update.stream);
    renderView();
    const attack = await screen.findByRole('button', { name: /longsword/i });
    fireEvent.click(attack);
    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([
        'skeleton-1',
      ])
    );
    const staleTargetClick = hoisted.lastCanvasProps.current?.onEntityClick;

    const turnRefresh = deferred<unknown>();
    const affordRefresh = deferred<unknown>();
    hoisted.turnFn.mockReturnValue(turnRefresh.promise);
    hoisted.affordFn.mockReturnValue(affordRefresh.promise);
    update.release();

    await screen.findByText(/actions may be out of date/i);
    expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([]);
    expect(hoisted.lastCanvasProps.current?.turnLocked).toBe(true);
    act(() => staleTargetClick?.('skeleton-1'));
    expect(hoisted.attackFn).not.toHaveBeenCalled();

    await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(2));
    await act(async () => {
      affordRefresh.resolve({
        clock: ClockKind.TURN,
        declarations: [
          attackDeclaration(),
          moveDeclaration(),
          endTurnDeclaration(),
        ],
      });
      await affordRefresh.promise;
    });
    expect(screen.getByText(/actions may be out of date/i)).toBeTruthy();
    expect(hoisted.lastCanvasProps.current?.turnLocked).toBe(true);

    await act(async () => {
      turnRefresh.resolve({
        clock: ClockKind.TURN,
        active: 'char-1',
        round: 2,
        order: ['char-1', 'skeleton-1'],
        participants: [
          participant('char-1', { active: true }),
          participant('skeleton-1'),
        ],
      });
      await turnRefresh.promise;
    });
    await waitFor(() =>
      expect(screen.queryByText(/actions may be out of date/i)).toBeNull()
    );
    expect(hoisted.lastCanvasProps.current?.turnLocked).toBe(false);
  });

  it('recovers an Attack selector refusal with generic copy, refreshed provider why, cleared arm, and no retry', async () => {
    readyTurn();
    hoisted.attackFn.mockRejectedValue(
      new ConnectError('raw selector mismatch', Code.FailedPrecondition)
    );
    renderView();
    await screen.findByRole('button', { name: /longsword/i });

    hoisted.affordFn.mockResolvedValue({
      clock: ClockKind.TURN,
      declarations: [
        attackDeclaration({
          available: false,
          why: create(ShortfallSchema, {
            reason: ShortfallReason.NO_BUDGET,
            text: 'Action already spent.',
          }),
        }),
        moveDeclaration(),
        endTurnDeclaration(),
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /longsword/i }));
    act(() => {
      hoisted.lastCanvasProps.current?.onEntityClick?.('skeleton-1');
    });

    await screen.findByText(
      'That option changed; review your current actions.'
    );
    expect(screen.queryByText(/raw selector mismatch/i)).toBeNull();
    expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([]);
    await waitFor(() =>
      screen.getByText(
        'That option changed; review your current actions. Action already spent.'
      )
    );
    expect(hoisted.attackFn).toHaveBeenCalledTimes(1);
  });

  it('recovers an End Turn selector refusal instead of swallowing it and never retries', async () => {
    readyTurn();
    hoisted.endTurnFn.mockRejectedValue(
      new ConnectError('stale end selector', Code.FailedPrecondition)
    );
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /end turn/i }));

    await screen.findByText(
      'That option changed; review your current actions.'
    );
    expect(screen.queryByText(/stale end selector/i)).toBeNull();
    await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2));
    expect(hoisted.endTurnFn).toHaveBeenCalledTimes(1);
  });

  it('recovers every Move FailedPrecondition through the stale declaration path regardless of not-your-turn wording', async () => {
    readyTurn();
    hoisted.moveFn.mockRejectedValue(
      new ConnectError('selector no longer current', Code.FailedPrecondition)
    );
    renderView();
    await screen.findByRole('button', { name: /move/i });
    const turnRefresh = deferred<unknown>();
    const affordRefresh = deferred<unknown>();
    hoisted.turnFn.mockReturnValue(turnRefresh.promise);
    hoisted.affordFn.mockReturnValue(affordRefresh.promise);
    act(() => {
      hoisted.lastCanvasProps.current?.onHexClick?.({ x: 1, y: -1, z: 0 });
    });

    await screen.findByText(
      'That option changed; review your current actions.'
    );
    expect(screen.queryByText(/selector no longer current/i)).toBeNull();
    expect(hoisted.lastCanvasProps.current?.turnLocked).toBe(true);
    act(() => {
      hoisted.lastCanvasProps.current?.onHexClick?.({ x: 1, y: -1, z: 0 });
    });
    await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2));
    expect(hoisted.moveFn).toHaveBeenCalledTimes(1);
  });

  it('recovers an ambiguous Attack failure without retrying or leaving old declarations executable', async () => {
    readyTurn();
    const attackFailure = deferred<unknown>();
    hoisted.attackFn.mockReturnValue(attackFailure.promise);
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /longsword/i }));
    const oldEndTurn = screen.getByRole('button', { name: /end turn/i });
    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([
        'skeleton-1',
      ])
    );
    const oldTargetClick = hoisted.lastCanvasProps.current?.onEntityClick;
    act(() => oldTargetClick?.('skeleton-1'));

    const turnRefresh = deferred<unknown>();
    const affordRefresh = deferred<unknown>();
    hoisted.turnFn.mockReturnValue(turnRefresh.promise);
    hoisted.affordFn.mockReturnValue(affordRefresh.promise);
    await act(async () => {
      attackFailure.reject(
        new ConnectError('temporary upstream failure', Code.Unavailable)
      );
      try {
        await attackFailure.promise;
      } catch {
        // The controller owns the rejected command promise.
      }
    });

    await screen.findByText(/Attack failed:.*temporary upstream failure/i);
    expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([]);
    expect(hoisted.lastCanvasProps.current?.turnLocked).toBe(true);
    expect((oldEndTurn as HTMLButtonElement).disabled).toBe(true);
    act(() => {
      oldTargetClick?.('skeleton-1');
      hoisted.lastCanvasProps.current?.onHexClick?.({ x: 1, y: -1, z: 0 });
    });
    fireEvent.click(oldEndTurn);
    expect(hoisted.attackFn).toHaveBeenCalledTimes(1);
    expect(hoisted.moveFn).not.toHaveBeenCalled();
    expect(hoisted.endTurnFn).not.toHaveBeenCalled();
    await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(2));
  });

  it('recovers an ambiguous End Turn failure without retrying or leaving old declarations executable', async () => {
    readyTurn();
    const endTurnFailure = deferred<unknown>();
    hoisted.endTurnFn.mockReturnValue(endTurnFailure.promise);
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /longsword/i }));
    const oldEndTurn = screen.getByRole('button', { name: /end turn/i });
    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([
        'skeleton-1',
      ])
    );
    const oldTargetClick = hoisted.lastCanvasProps.current?.onEntityClick;
    fireEvent.click(oldEndTurn);

    const turnRefresh = deferred<unknown>();
    const affordRefresh = deferred<unknown>();
    hoisted.turnFn.mockReturnValue(turnRefresh.promise);
    hoisted.affordFn.mockReturnValue(affordRefresh.promise);
    await act(async () => {
      endTurnFailure.reject(new Error('unknown transport outcome'));
      try {
        await endTurnFailure.promise;
      } catch {
        // The controller owns the rejected command promise.
      }
    });

    await screen.findByText('End turn failed: unknown transport outcome');
    expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([]);
    expect(hoisted.lastCanvasProps.current?.turnLocked).toBe(true);
    expect((oldEndTurn as HTMLButtonElement).disabled).toBe(true);
    act(() => {
      oldTargetClick?.('skeleton-1');
      hoisted.lastCanvasProps.current?.onHexClick?.({ x: 1, y: -1, z: 0 });
    });
    fireEvent.click(oldEndTurn);
    expect(hoisted.endTurnFn).toHaveBeenCalledTimes(1);
    expect(hoisted.attackFn).not.toHaveBeenCalled();
    expect(hoisted.moveFn).not.toHaveBeenCalled();
    await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(2));
  });

  it('fails closed malformed provider target kinds for Attack, Move, and End Turn dispatch', async () => {
    readyTurn([
      attackDeclaration({ targetKind: TargetKind.PATH }),
      create(DeclarationSchema, {
        ...moveDeclaration(),
        targetKind: TargetKind.MEMBER,
      }),
      create(DeclarationSchema, {
        ...endTurnDeclaration(),
        targetKind: TargetKind.MEMBER,
      }),
    ]);
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /longsword/i }));
    fireEvent.click(screen.getByRole('button', { name: /end turn/i }));
    act(() => {
      hoisted.lastCanvasProps.current?.onEntityClick?.('skeleton-1');
      hoisted.lastCanvasProps.current?.onHexClick?.({ x: 1, y: -1, z: 0 });
    });

    expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([]);
    expect(hoisted.lastCanvasProps.current?.turnLocked).toBe(true);
    expect(hoisted.attackFn).not.toHaveBeenCalled();
    expect(hoisted.moveFn).not.toHaveBeenCalled();
    expect(hoisted.endTurnFn).not.toHaveBeenCalled();
  });
});
