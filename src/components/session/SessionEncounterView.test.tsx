import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import {
  HairCustomizationSchema,
  StyleSelectionSchema,
  type HairCustomization,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import {
  DiceThrowPlanSchema,
  type DiceThrowPlan,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/presentation/v1alpha1/service_pb';
import {
  ActivatedSchema,
  ActivationResultSchema,
  EventKind,
  EventSchema,
  HealingAppliedSchema,
  type Event as SessionEvent,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  AbilityRefSchema,
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
import { isValidElement, StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLocalWorldDieColliders } from './local-world-die/localWorldDieColliders';
import type { LocalWorldDieCommand } from './local-world-die/localWorldDieCommand';
import type { LocalWorldDieLayerProps } from './local-world-die/LocalWorldDieLayer';
import * as localWorldDiePreSimulation from './local-world-die/localWorldDiePreSimulation';
import {
  fingerprintLocalWorldDieColliders,
  type LocalWorldDiePlanTerminal,
} from './local-world-die/localWorldDiePreSimulation';
import { localWorldDieDraft } from './local-world-die/localWorldDiePublish';
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
  getCharacterHookFn: vi.fn(),
  characterResult: {
    data: null as { appearance?: { hair?: HairCustomization } } | null,
    loading: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  moveFn: vi.fn(),
  streamEventsFn: vi.fn(),
  streamDiceThrowsFn: vi.fn(),
  publishDiceThrowFn: vi.fn(),
  getStoryFn: vi.fn(),
  getViewFn: vi.fn(),
  getRosterFn: vi.fn(),
  getDoorsFn: vi.fn(),
  openDoorFn: vi.fn(),
  unlockFn: vi.fn(),
  searchFn: vi.fn(),
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

// This imperative legacy source remains unused by the production session route.
vi.mock('../../api/characterHooks', () => ({
  useGetCharacter: () => ({ getCharacter: hoisted.getCharacterFn }),
}));

vi.mock('../../api/hooks', () => ({
  useGetCharacter: (characterId: string) => {
    hoisted.getCharacterHookFn(characterId);
    return hoisted.characterResult;
  },
}));

vi.mock('@/api/client', () => ({
  sessionPresentationClient: {
    streamDiceThrows: hoisted.streamDiceThrowsFn,
    publishDiceThrow: hoisted.publishDiceThrowFn,
  },
  sessionClient: {
    move: hoisted.moveFn,
    streamEvents: hoisted.streamEventsFn,
    getStory: hoisted.getStoryFn,
    getView: hoisted.getViewFn,
    getRoster: hoisted.getRosterFn,
    getDoors: hoisted.getDoorsFn,
    openDoor: hoisted.openDoorFn,
    unlock: hoisted.unlockFn,
    search: hoisted.searchFn,
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

function deferredDiceStream(planCount = 1) {
  const gates = Array.from({ length: planCount }, () =>
    deferred<DiceThrowPlan>()
  );
  let publishIndex = 0;
  return {
    stream: {
      [Symbol.asyncIterator]: async function* () {
        for (const gate of gates) yield await gate.promise;
      },
    },
    publish: (plan: DiceThrowPlan) => {
      gates[publishIndex++]?.resolve(plan);
    },
  };
}

function currentLocalWorldDieCommand(): LocalWorldDieCommand | undefined {
  const layer = hoisted.lastCanvasProps.current?.presentationLayer;
  return isValidElement<{ command: LocalWorldDieCommand }>(layer)
    ? layer.props.command
    : undefined;
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
  Object.assign(hoisted.characterResult, {
    data: null,
    loading: false,
    error: null,
  });
  hoisted.characterResult.refetch.mockReset();
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
    hoisted.getCharacterHookFn,
    hoisted.moveFn,
    hoisted.streamEventsFn,
    hoisted.streamDiceThrowsFn,
    hoisted.publishDiceThrowFn,
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
  hoisted.streamDiceThrowsFn.mockReturnValue(fakeStream([]));
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

const activated = () =>
  event(EventKind.ACTIVATED, {
    case: 'activated',
    value: create(ActivatedSchema, {
      actor: 'char-1',
      ability: create(AbilityRefSchema, {
        ref: 'dnd5e:features:second_wind',
        name: 'Second Wind',
      }),
      target: '',
    }),
  });

const activationResult = () =>
  event(EventKind.ACTIVATION_RESULT, {
    case: 'activationResult',
    value: create(ActivationResultSchema, {
      actor: 'char-1',
      result: {
        case: 'healingApplied',
        value: create(HealingAppliedSchema, {
          target: 'char-1',
          amount: 2,
          requested: 7,
          roll: 6,
          modifier: 1,
          sourceRef: 'dnd5e:features:second_wind',
          sourceName: 'Second Wind',
          hpBefore: 8,
          hpAfter: 10,
        }),
      },
    }),
  });

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

    fireEvent.click(
      await screen.findByRole(
        'button',
        { name: /longsword/i },
        { timeout: 5000 }
      )
    );
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

  it('passes owner Appearance.hair to SessionCanvas while peers remain roster-only with no private sheet fetch', async () => {
    readyScene();
    const hair = create(HairCustomizationSchema, {
      scalp: create(StyleSelectionSchema, {
        selection: {
          case: 'styleRef',
          value: 'modular-fantasy-hero:hair:38',
        },
      }),
      facialHair: create(StyleSelectionSchema, {
        selection: {
          case: 'styleRef',
          value: 'modular-fantasy-hero:facial-hair:01',
        },
      }),
      colorSrgb: 0xd6b26e,
      roughness: 0.55,
    });
    hoisted.characterResult.data = { appearance: { hair } };
    hoisted.getCharacterDataFn.mockResolvedValue({
      character: privateCharacterData(),
    });
    hoisted.getRosterFn.mockResolvedValue({
      members: [
        {
          id: 'char-1',
          kind: MemberKind.PLAYER,
          name: 'Owner',
          classRef: 'barbarian',
          raceRef: 'dwarf',
          monsterRef: '',
        },
        {
          id: 'char-peer',
          kind: MemberKind.PLAYER,
          name: 'Peer',
          classRef: 'rogue',
          raceRef: 'dwarf',
          monsterRef: '',
          customization: { hair },
        },
      ],
    });
    renderView();

    await waitFor(() => screen.getByTestId('session-canvas'));
    await waitFor(() => {
      const props = hoisted.lastCanvasProps.current as
        | (SessionCanvasProps & { localHair?: HairCustomization })
        | null;
      expect(props?.localHair).toEqual(hair);
      expect(props?.roster?.get('char-peer')?.customization?.hair).toEqual(
        hair
      );
    });
    expect(hoisted.getCharacterDataFn).toHaveBeenCalledTimes(1);
    expect(hoisted.getCharacterDataFn).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: 'char-1' }),
      expect.any(Object)
    );
    expect(hoisted.getCharacterHookFn).toHaveBeenCalled();
    expect(
      new Set(hoisted.getCharacterHookFn.mock.calls.map(([id]) => id))
    ).toEqual(new Set(['char-1']));
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

  it('projects owner-authoritative off_hand into the local canvas presentation', async () => {
    readyScene();
    hoisted.getCharacterDataFn.mockResolvedValue({
      character: privateCharacterData({
        equipped: {
          off_hand: { module: 'dnd5e', type: 'item', id: 'shield' },
        },
      }),
    });
    renderView();

    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.offHandPresentation).toEqual({
        ref: 'dnd5e:item:shield',
        assetUrl: '/models/synty/off-hand/shield.glb',
        assetKind: 'shield',
        socket: {
          bone: 'Hand_L',
          boneUnitMeters: 0.01,
          positionMeters: [
            0.08494041442871093, -0.02545013666152954, -0.06444666385650635,
          ],
          rotationQuaternion: [
            0.6342147588729858, 0.538684606552124, 0.31252291798591614,
            0.45817017555236816,
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
    await waitFor(() => {
      within(dock).getByText('Aldric');
      within(dock).getByText(/level 3 fighter/i);
    });
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
    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.turnLocked).toBe(false)
    );

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

    await waitFor(() => screen.getByText('Preparing die'));
    expect(screen.queryByText(/Aldric strikes Skeleton/i)).toBeNull();
    localStrike.release();
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    await waitFor(() => screen.getByText(/source=live/i));
    fireEvent.click(screen.getByRole('button', { name: 'Story' }));
    expect(screen.queryByText(/Aldric strikes Skeleton/i)).toBeNull();
  });

  it('automatically plans and publishes the actor throw without a playback selector', async () => {
    readyTurn();
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
    const doorUpdate = deferredStream([
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
    hoisted.streamEventsFn.mockReturnValue(doorUpdate.stream);
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
    hoisted.publishDiceThrowFn.mockImplementation(async (input) => {
      const draft = input.draft!;
      return {
        plan: create(DiceThrowPlanSchema, {
          schemaVersion: draft.schemaVersion,
          session: input.session,
          presentationId: draft.presentationId,
          authoritySeq: draft.authoritySeq,
          roller: input.member,
          attempt: draft.attempt,
          physicsSchema: draft.physicsSchema,
          colliderFingerprint: draft.colliderFingerprint,
          bodies: draft.bodies,
          contacts: draft.contacts,
          terminal: draft.terminal,
        }),
      };
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

    await screen.findByText('Preparing die');
    const preparingLayer = hoisted.lastCanvasProps.current?.presentationLayer;
    expect(
      isValidElement<LocalWorldDieLayerProps>(preparingLayer) &&
        preparingLayer.props.colliders.some(({ id }) => id === 'crypt-door')
    ).toBe(true);
    doorUpdate.release();
    await waitFor(() => expect(hoisted.getDoorsFn).toHaveBeenCalledTimes(2));
    const refreshedLayer = hoisted.lastCanvasProps.current?.presentationLayer;
    expect(
      isValidElement<LocalWorldDieLayerProps>(refreshedLayer) &&
        refreshedLayer.props.colliders.some(({ id }) => id === 'crypt-door')
    ).toBe(true);
    expect(
      isValidElement<LocalWorldDieLayerProps>(preparingLayer) &&
        isValidElement<LocalWorldDieLayerProps>(refreshedLayer) &&
        refreshedLayer.props.colliders
    ).toBe(
      isValidElement<LocalWorldDieLayerProps>(preparingLayer)
        ? preparingLayer.props.colliders
        : undefined
    );

    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    expect(screen.queryByText('Shared dice presentation')).toBeNull();
    act(() => {
      if (isValidElement<LocalWorldDieLayerProps>(preparingLayer)) {
        preparingLayer.props.onReadyChange(true);
      }
    });

    await screen.findByText('Shared dice presentation');
    await waitFor(() =>
      expect(hoisted.publishDiceThrowFn).toHaveBeenCalledTimes(1)
    );
    expect(hoisted.publishDiceThrowFn.mock.calls[0]?.[0]).toMatchObject({
      session: 'enc-1',
      member: 'char-1',
      draft: {
        presentationId: 'session:enc-1:7',
        authoritySeq: 7n,
        attempt: 1,
      },
    });
    await waitFor(() =>
      expect(currentLocalWorldDieCommand()).toMatchObject({
        kind: 'released',
        plannedTerminal: { step: expect.any(Number) },
      })
    );
    expect(screen.queryByRole('group', { name: /playback mode/i })).toBeNull();

    const firstAttemptLayer =
      hoisted.lastCanvasProps.current?.presentationLayer;
    act(() => {
      if (isValidElement<LocalWorldDieLayerProps>(firstAttemptLayer)) {
        firstAttemptLayer.props.onTerminal('off-table');
      }
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Roll d20' }));
    await waitFor(() =>
      expect(hoisted.publishDiceThrowFn).toHaveBeenCalledTimes(2)
    );
    expect(hoisted.publishDiceThrowFn.mock.calls[1]?.[0]?.draft?.attempt).toBe(
      2
    );

    const failedLayer = hoisted.lastCanvasProps.current?.presentationLayer;
    act(() => {
      if (isValidElement<LocalWorldDieLayerProps>(failedLayer)) {
        failedLayer.props.onTerminal('failure');
      }
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reveal result' })
    );
    await waitFor(() =>
      expect(screen.queryByTestId('local-world-die-tile')).toBeNull()
    );
  });

  it('offers explicit semantic completion when local planning fails', async () => {
    readyTurn();
    hoisted.attackFn.mockResolvedValue({
      seq: 8n,
      roll: 11,
      total: 14,
      against: 13,
      hit: true,
      critical: false,
      damage: 4,
      attack: attackDeclaration().attack,
    });
    vi.spyOn(
      localWorldDiePreSimulation,
      'preSimulateLocalWorldDie'
    ).mockRejectedValueOnce(new Error('planner unavailable'));
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
    await screen.findByText('Preparing die');
    const layer = hoisted.lastCanvasProps.current?.presentationLayer;
    act(() => {
      if (isValidElement<LocalWorldDieLayerProps>(layer)) {
        layer.props.onReadyChange(true);
      }
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Roll d20' }));

    expect(
      await screen.findByRole('button', { name: 'Reveal result' })
    ).toBeTruthy();
    expect(hoisted.publishDiceThrowFn).not.toHaveBeenCalled();
    expect(currentLocalWorldDieCommand()).toMatchObject({ kind: 'reset' });
  });

  it('mounts one noninteractive witness command for an admitted live player plan', async () => {
    readyScene();
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
          id: 'char-2',
          kind: MemberKind.PLAYER,
          name: 'Lyra',
          classRef: 'wizard',
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
    const authoritativeStrike = deferredStream([
      event(
        EventKind.STRUCK,
        {
          case: 'struck',
          value: {
            attacker: 'char-2',
            target: 'skeleton-1',
            roll: 14,
            total: 18,
            against: 13,
            damage: 5,
            attack: attackDeclaration().attack,
            critical: false,
          },
        } as SessionEvent['body'],
        42n
      ),
    ]);
    hoisted.streamEventsFn.mockReturnValue(authoritativeStrike.stream);
    const livePlans = deferredDiceStream(2);
    hoisted.streamDiceThrowsFn.mockReturnValue(livePlans.stream);
    renderView();

    await waitFor(() => expect(hoisted.lastCanvasProps.current).not.toBeNull());
    const scene = hoisted.lastCanvasProps.current!.scene;
    const fingerprint = await fingerprintLocalWorldDieColliders(
      buildLocalWorldDieColliders(scene, new Set())
    );
    const initialState = {
      position: { x: 0, y: 1.25, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 1, y: 0.8, z: 0 },
      angularVelocity: { x: 0, y: 0, z: -2 },
    };
    const terminalState = {
      position: { x: 0.5, y: 0.3, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    };
    const planned: LocalWorldDiePlanTerminal = {
      kind: 'off-table',
      step: 42,
      elapsedMs: 4,
      fingerprint,
      initialState,
      terminalState,
    };
    const draft = localWorldDieDraft({
      presentationId: 'session:enc-1:42',
      authoritySeq: 42n,
      attempt: 1,
      plan: planned,
    });
    const accepted = create(DiceThrowPlanSchema, {
      schemaVersion: draft.schemaVersion,
      session: 'enc-1',
      presentationId: draft.presentationId,
      authoritySeq: draft.authoritySeq,
      roller: 'char-2',
      attempt: draft.attempt,
      physicsSchema: draft.physicsSchema,
      colliderFingerprint: draft.colliderFingerprint,
      bodies: draft.bodies,
      contacts: draft.contacts,
      terminal: draft.terminal,
    });

    await act(async () => livePlans.publish(accepted));
    expect(currentLocalWorldDieCommand()?.kind).not.toBe('witness');

    authoritativeStrike.release();
    await screen.findByText(/Lyra strikes Skeleton/i);
    await waitFor(() =>
      expect(currentLocalWorldDieCommand()?.kind).toBe('witness')
    );
    const command = currentLocalWorldDieCommand();
    expect(command?.kind === 'witness' && command.plan).toMatchObject({
      presentationId: 'session:enc-1:42',
      roller: 'char-2',
      attempt: 1,
    });
    expect(screen.queryByTestId('local-world-die-tile')).toBeNull();

    const firstLayer = hoisted.lastCanvasProps.current?.presentationLayer;
    expect(isValidElement<LocalWorldDieLayerProps>(firstLayer)).toBe(true);
    act(() => {
      if (isValidElement<LocalWorldDieLayerProps>(firstLayer)) {
        firstLayer.props.onTerminal('off-table');
      }
    });
    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.presentationLayer).toBeNull()
    );

    const retryDraft = localWorldDieDraft({
      presentationId: 'session:enc-1:42',
      authoritySeq: 42n,
      attempt: 2,
      plan: { ...planned, kind: 'settled' },
    });
    const retryAccepted = create(DiceThrowPlanSchema, {
      schemaVersion: retryDraft.schemaVersion,
      session: 'enc-1',
      presentationId: retryDraft.presentationId,
      authoritySeq: retryDraft.authoritySeq,
      roller: 'char-2',
      attempt: retryDraft.attempt,
      physicsSchema: retryDraft.physicsSchema,
      colliderFingerprint: retryDraft.colliderFingerprint,
      bodies: retryDraft.bodies,
      contacts: retryDraft.contacts,
      terminal: retryDraft.terminal,
    });
    await act(async () => livePlans.publish(retryAccepted));
    await waitFor(() =>
      expect(currentLocalWorldDieCommand()).toMatchObject({
        kind: 'witness',
        plan: { attempt: 2, terminal: { kind: 'settled' } },
      })
    );

    const retryLayer = hoisted.lastCanvasProps.current?.presentationLayer;
    act(() => {
      if (isValidElement<LocalWorldDieLayerProps>(retryLayer)) {
        retryLayer.props.onTerminal('settled');
      }
    });
    await waitFor(() =>
      expect(hoisted.lastCanvasProps.current?.presentationLayer).toBeNull()
    );
    expect(screen.getByText(/Lyra strikes Skeleton/i)).toBeTruthy();
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

  it('uses only the unconditional Turn/Afford refresh for Activated', async () => {
    readyTurn();
    const live = deferredStream([activated()]);
    hoisted.streamEventsFn.mockReturnValue(live.stream);
    renderView();
    await waitFor(() => screen.getByTestId('session-canvas'));
    await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(hoisted.getCharacterDataFn).toHaveBeenCalledTimes(1)
    );

    live.release();

    await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2));
    expect(hoisted.getViewFn).toHaveBeenCalledTimes(1);
    expect(hoisted.getCharacterDataFn).toHaveBeenCalledTimes(1);
    await waitFor(() => screen.getByText('Aldric uses Second Wind'));
  });

  it('refreshes CharacterData, Afford, and View for ActivationResult through the unconditional funnel', async () => {
    readyTurn();
    const live = deferredStream([activationResult()]);
    hoisted.streamEventsFn.mockReturnValue(live.stream);
    renderView();
    await waitFor(() => screen.getByTestId('session-canvas'));
    await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(hoisted.getCharacterDataFn).toHaveBeenCalledTimes(1)
    );

    live.release();

    await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(hoisted.getCharacterDataFn).toHaveBeenCalledTimes(2)
    );
    await waitFor(() => screen.getByText('Aldric recovers 2 HP'));
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

  describe('concealed-door reveal wiring (rpg-project#886)', () => {
    // A member-scoped atlas whose one region claims the searcher's own
    // resting cell — `readyScene()`'s default atlas authors NO regions,
    // so the search button (gated on a resolved region) never appears
    // there. This is the fixture every test below needs to see it.
    function readySearchableScene() {
      readyScene();
      hoisted.atlasResult.atlas = pointyAtlas({
        regions: [
          {
            id: 'entrance-hall',
            name: 'Entrance Hall',
            archetype: 'crypt',
            cells: [{ x: 0, y: 0 }],
            lighting: { intensity: 1 },
          },
        ],
      });
    }

    it('a doorRevealed event refreshes both doors and atlas — the recipient patches its cached GetDoors AND GetAtlas', async () => {
      readySearchableScene();
      hoisted.getDoorsFn.mockResolvedValue({ doors: [] });
      const reveal = deferredStream([
        event(EventKind.DOOR_REVEALED, {
          case: 'doorRevealed',
          value: {},
        } as SessionEvent['body']),
      ]);
      hoisted.streamEventsFn.mockReturnValue(reveal.stream);
      renderView();
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => expect(hoisted.getDoorsFn).toHaveBeenCalledTimes(1));
      expect(hoisted.atlasResult.refetch).not.toHaveBeenCalled();

      reveal.release();
      await waitFor(() => expect(hoisted.getDoorsFn).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(hoisted.atlasResult.refetch).toHaveBeenCalledTimes(1)
      );
    });

    it('a regionRevealed event refreshes atlas alone — no door list changed', async () => {
      readySearchableScene();
      hoisted.getDoorsFn.mockResolvedValue({ doors: [] });
      const reveal = deferredStream([
        event(EventKind.REGION_REVEALED, {
          case: 'regionRevealed',
          value: {},
        } as SessionEvent['body']),
      ]);
      hoisted.streamEventsFn.mockReturnValue(reveal.stream);
      renderView();
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => expect(hoisted.getDoorsFn).toHaveBeenCalledTimes(1));

      reveal.release();
      await waitFor(() =>
        expect(hoisted.atlasResult.refetch).toHaveBeenCalledTimes(1)
      );
      expect(hoisted.getDoorsFn).toHaveBeenCalledTimes(1);
    });

    it("the search button is absent until the searcher's own region is known", async () => {
      readyScene(); // default atlas authors no regions
      hoisted.getDoorsFn.mockResolvedValue({ doors: [] });
      renderView();
      await waitFor(() => screen.getByTestId('session-canvas'));
      expect(screen.queryByTestId('session-combat-search-button')).toBeNull();
    });

    it('clicking Search sends session/member/region and shows the same notice regardless of what the response carries — the secrecy law (rpg-project#886)', async () => {
      readySearchableScene();
      hoisted.getDoorsFn.mockResolvedValue({ doors: [] });
      // Two structurally different resolved values: an outcome-carrying
      // reader would have to pick a different message for one of them.
      // This assertion is the point — see searchNotice.ts.
      hoisted.searchFn.mockResolvedValueOnce({
        saved: { ok: true },
      } as never);
      renderView();
      await waitFor(() => screen.getByTestId('session-canvas'));

      const button = await screen.findByTestId('session-combat-search-button');
      fireEvent.click(button);
      await waitFor(() =>
        expect(hoisted.searchFn).toHaveBeenCalledWith({
          session: 'enc-1',
          member: 'char-1',
          region: 'entrance-hall',
        })
      );
      const firstNotice = await screen.findByText('You search the area.');
      expect(firstNotice).toBeTruthy();

      hoisted.searchFn.mockResolvedValueOnce({} as never);
      fireEvent.click(button);
      await waitFor(() => expect(hoisted.searchFn).toHaveBeenCalledTimes(2));
      expect(await screen.findByText('You search the area.')).toBeTruthy();
    });

    it('a transport failure shows the error, not the search notice — a real RPC failure is not a check outcome', async () => {
      readySearchableScene();
      hoisted.getDoorsFn.mockResolvedValue({ doors: [] });
      hoisted.searchFn.mockRejectedValue(new Error('session not found'));
      renderView();
      await waitFor(() => screen.getByTestId('session-canvas'));

      const button = await screen.findByTestId('session-combat-search-button');
      fireEvent.click(button);
      await waitFor(() => screen.getByText('session not found'));
      expect(screen.queryByText('You search the area.')).toBeNull();
    });

    it("a doorRevealed/regionRevealed beat clears a standing search notice — matches doorNotice's own staleness reset on the 'door' case", async () => {
      readySearchableScene();
      hoisted.getDoorsFn.mockResolvedValue({ doors: [] });
      hoisted.searchFn.mockResolvedValue({} as never);
      const reveal = deferredStream([
        event(EventKind.DOOR_REVEALED, {
          case: 'doorRevealed',
          value: {},
        } as SessionEvent['body']),
      ]);
      hoisted.streamEventsFn.mockReturnValue(reveal.stream);
      renderView();
      await waitFor(() => screen.getByTestId('session-canvas'));

      const button = await screen.findByTestId('session-combat-search-button');
      fireEvent.click(button);
      await screen.findByText('You search the area.');

      reveal.release();
      await waitFor(() =>
        expect(screen.queryByText('You search the area.')).toBeNull()
      );
    });
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
