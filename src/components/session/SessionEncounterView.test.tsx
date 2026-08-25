/**
 * SessionEncounterView tests — data orchestration and gating, plus the
 * click-to-walk wiring end to end.
 *
 * `SessionCanvas` wraps a real Three.js `<Canvas>`, which needs WebGL that
 * jsdom cannot provide — same reasoning `EncounterMap.test.tsx`'s own doc
 * comment gives for stubbing `HexGrid` rather than rendering it. This
 * mocks `SessionCanvas` and asserts the PROPS it would have received,
 * which is exactly the seam between "did we read the wire correctly" and
 * "can Three.js draw it" that this file owns. `SessionCanvas.test.tsx`
 * covers the other side with a real (mocked-GLB) R3F render.
 *
 * `useSessionWalk`/`useSessionEventStream`/`useSessionAfford` run FOR REAL
 * here (only `sessionClient.move`/`.streamEvents`/`.afford` are mocked, at
 * the `@/api/client` boundary — the same boundary those hooks' own
 * dedicated test files mock) rather than being replaced wholesale: this
 * file is what proves the click -> pathfind -> Move RPC -> animation-prop
 * -> MOVED-event -> refetch chain (and, slice 5a, the Afford refetch
 * triggers) is actually WIRED, not just that each link works in
 * isolation. The pure mechanics of each link (pathfinding, the RPC
 * orchestration's busy/reconcile state machine, the stream subscription
 * lifecycle, the Afford fetch/last-good state machine) have their own
 * focused coverage in atlasPath.test.ts, useSessionWalk.test.ts,
 * useSessionEventStream.test.ts and useSessionAfford.test.ts.
 */
import { Code, ConnectError } from '@connectrpc/connect';
import {
  EventKind,
  type Event as SessionEvent,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  ClockKind,
  Currency,
  DamageType,
  DissolveKind,
  GridKind,
  HexLayout,
  MemberKind,
  ShortfallReason,
  Slot,
  Standing,
  TargetKind,
  Verb,
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

vi.mock('../../api/characterHooks', () => ({
  useGetCharacter: () => ({
    getCharacter: hoisted.getCharacterFn,
    loading: false,
    error: null,
  }),
}));

vi.mock('@/api/client', () => ({
  sessionClient: {
    move: hoisted.moveFn,
    streamEvents: hoisted.streamEventsFn,
    getStory: hoisted.getStoryFn,
    getView: hoisted.getViewFn,
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

// Import AFTER vi.mock so the mocks are applied
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
    ...overrides,
  };
}

/** An async-iterable stream that yields the given events then ends — the
 * same shape `useSessionEventStream.test.ts`'s own `fakeStream` uses. */
function fakeStream(events: SessionEvent[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const event of events) {
        yield event;
      }
    },
  };
}

/** Same as `fakeStream`, but withholds every event until `release()` is
 * called — for tests that need the roster (Turn's own mount-bootstrap
 * fetch) to have landed BEFORE a stream event arrives, so a race between
 * the two microtask queues can't deliver the event against a still-empty
 * `participants` list. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function deferredStream(events: SessionEvent[]) {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    stream: {
      [Symbol.asyncIterator]: async function* () {
        await gate;
        for (const event of events) {
          yield event;
        }
      },
    },
    release,
  };
}

beforeEach(() => {
  hoisted.lastCanvasProps.current = null;
  hoisted.atlasResult.atlas = null;
  hoisted.atlasResult.loading = true;
  hoisted.atlasResult.error = null;
  hoisted.atlasResult.refetch.mockReset();
  hoisted.whereResult.position = null;
  hoisted.whereResult.loading = true;
  hoisted.whereResult.error = null;
  hoisted.whereResult.refetch.mockReset();
  hoisted.getCharacterFn.mockReset();
  hoisted.getCharacterFn.mockResolvedValue({
    character: { name: 'Toolkit Sandbox Fighter', class: 5 },
  });
  hoisted.moveFn.mockReset();
  hoisted.streamEventsFn.mockReset();
  hoisted.streamEventsFn.mockReturnValue(fakeStream([]));
  hoisted.getStoryFn.mockReset();
  // Rule 6 (rpg-dnd5e-web#779): every (re)connect now runs a GetStory
  // catch-up before trusting the live stream. Nothing in this file's own
  // scope (click -> RPC -> stream wiring) is testing rule 6 itself — that
  // lives in useSessionEventStream.test.ts — so the default here is
  // "nothing to catch up," matching the pre-rule-6 behavior every
  // existing test in this file already assumes.
  hoisted.getStoryFn.mockResolvedValue({ entries: [] });
  nextEventSeq = 1n;
  hoisted.getViewFn.mockReset();
  hoisted.getViewFn.mockResolvedValue({ sightings: [] });
  hoisted.affordFn.mockReset();
  // Free roam by default — matches a freshly-spawned member on the
  // world clock, so existing tests that don't care about the combat
  // panel keep passing unchanged.
  hoisted.affordFn.mockResolvedValue({
    clock: ClockKind.WORLD,
    declarations: [],
  });
  hoisted.turnFn.mockReset();
  hoisted.turnFn.mockResolvedValue({
    clock: ClockKind.WORLD,
    active: '',
    round: 0,
    order: [],
    participants: [],
  });
  hoisted.attackFn.mockReset();
  hoisted.endTurnFn.mockReset();
  hoisted.getCharacterDataFn.mockReset();
  hoisted.getCharacterDataFn.mockResolvedValue({ character: undefined });
  hoisted.equipItemFn.mockReset();
  hoisted.unequipItemFn.mockReset();
});

/** One `Participant` — mirrors combatPanel.test.ts's own helper. */
function participant(
  member: string,
  overrides: Partial<Participant> = {}
): Participant {
  return {
    member,
    name: member,
    kind: member === 'char-1' ? MemberKind.PLAYER : MemberKind.MONSTER,
    standing: Standing.UP,
    active: false,
    ...overrides,
  } as Participant;
}

/** Auto-incrementing, reset per test (`beforeEach` above) — rule 6
 * (rpg-dnd5e-web#779) means `useSessionEventStream` now reads `Event.seq`
 * for real (gap detection against the last one delivered), so a fixture
 * that always returned `seq: undefined` would either look like a gap on
 * the SECOND event in any multi-event array this file builds, or crash
 * outright trying `undefined + 1n`. `event()` below defaults every call
 * to the next value unless a test has a reason to pass its own — none do
 * today; seq-specific behavior is useSessionEventStream.test.ts's job. */
let nextEventSeq = 1n;

/** A realistic `Event` fixture — every stream test fixture in this file
 * used to get away with a bare `{ kind }` cast; the typed-body redesign
 * (rpg-project#249) means `handleEvent` actually reads `body.case`, so
 * these need a real (if minimal) body shape from here on. */
function event(
  kind: EventKind,
  body: SessionEvent['body'] = { case: undefined },
  seq?: bigint
): SessionEvent {
  return { kind, body, seq: seq ?? nextEventSeq++ } as SessionEvent;
}

const noop = () => {};

describe('SessionEncounterView', () => {
  it('shows a clear message instead of crashing when no character is bound', () => {
    render(
      <SessionEncounterView
        sessionId="enc-1"
        playerId="player-1"
        onBack={noop}
      />
    );
    screen.getByText(/no character selected/i);
    expect(screen.queryByTestId('session-canvas')).toBeNull();
  });

  it('shows loading while the atlas/position/character are in flight', () => {
    render(
      <SessionEncounterView
        sessionId="enc-1"
        characterId="char-1"
        playerId="player-1"
        onBack={noop}
      />
    );
    screen.getByText(/loading the tomb/i);
  });

  it('shows a blocking error from the atlas fetch instead of a blank screen', async () => {
    hoisted.atlasResult.loading = false;
    hoisted.atlasResult.error = new Error('atlas unreachable');
    hoisted.whereResult.loading = false;

    render(
      <SessionEncounterView
        sessionId="enc-1"
        characterId="char-1"
        playerId="player-1"
        onBack={noop}
      />
    );
    await waitFor(() => screen.getByText(/couldn't load the session/i));
    screen.getByText(/atlas unreachable/i);
  });

  it('shows "nothing to draw" for an atlas with zero cells instead of rendering an empty canvas (Copilot review, PR #764)', async () => {
    hoisted.atlasResult.atlas = pointyAtlas({ cells: [] });
    hoisted.atlasResult.loading = false;
    hoisted.whereResult.position = { x: 0, y: 0 };
    hoisted.whereResult.loading = false;

    render(
      <SessionEncounterView
        sessionId="enc-1"
        characterId="char-1"
        playerId="player-1"
        onBack={noop}
      />
    );
    await waitFor(() => screen.getByText(/nothing to draw/i));
    expect(screen.queryByTestId('session-canvas')).toBeNull();
  });

  /**
   * The load-bearing property this slice exists to guarantee: hexMath's 3D
   * placement is pointy-top only, so a flat-top or square atlas must be a
   * visible, named limitation — never silently guessed or dropped (the
   * "capabilities are supplied, never defaulted" rule `layoutFromWire`
   * itself enforces by throwing on UNSPECIFIED).
   */
  it('reports a flat-top atlas as an unsupported map instead of drawing it wrong', async () => {
    hoisted.atlasResult.atlas = pointyAtlas({ layout: HexLayout.FLAT_TOP });
    hoisted.atlasResult.loading = false;
    hoisted.whereResult.position = { x: 0, y: 0 };
    hoisted.whereResult.loading = false;

    render(
      <SessionEncounterView
        sessionId="enc-1"
        characterId="char-1"
        playerId="player-1"
        onBack={noop}
      />
    );
    await waitFor(() => screen.getByText(/can't draw this map yet/i));
    screen.getByText(/flat-top/i);
    expect(screen.queryByTestId('session-canvas')).toBeNull();
  });

  it('reports a hex atlas with no declared layout as a server defect, not a guess', async () => {
    hoisted.atlasResult.atlas = pointyAtlas({ layout: HexLayout.UNSPECIFIED });
    hoisted.atlasResult.loading = false;
    hoisted.whereResult.position = { x: 0, y: 0 };
    hoisted.whereResult.loading = false;

    render(
      <SessionEncounterView
        sessionId="enc-1"
        characterId="char-1"
        playerId="player-1"
        onBack={noop}
      />
    );
    await waitFor(() => screen.getByText(/can't draw this map yet/i));
    screen.getByText(/layout/i);
  });

  it('Retry also re-attempts a failed character fetch, not just atlas/where (Copilot review, PR #764)', async () => {
    hoisted.atlasResult.atlas = pointyAtlas();
    hoisted.atlasResult.loading = false;
    hoisted.whereResult.position = { x: 0, y: 0 };
    hoisted.whereResult.loading = false;
    hoisted.getCharacterFn.mockReset();
    hoisted.getCharacterFn
      .mockRejectedValueOnce(new Error('character unreachable'))
      .mockResolvedValueOnce({
        character: { name: 'Toolkit Sandbox Fighter', class: 5 },
      });

    render(
      <SessionEncounterView
        sessionId="enc-1"
        characterId="char-1"
        playerId="player-1"
        onBack={noop}
      />
    );

    await waitFor(() => screen.getByText(/couldn't load the session/i));
    screen.getByText(/character unreachable/i);

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() =>
      expect(hoisted.getCharacterFn).toHaveBeenCalledTimes(2)
    );
    await waitFor(() => screen.getByTestId('session-canvas'));
  });

  it('renders the canvas with the built scene, the resolved class, and the fetched position', async () => {
    hoisted.atlasResult.atlas = pointyAtlas();
    hoisted.atlasResult.loading = false;
    hoisted.whereResult.position = { x: 1, y: 0 };
    hoisted.whereResult.loading = false;

    render(
      <SessionEncounterView
        sessionId="enc-1"
        characterId="char-1"
        playerId="player-1"
        onBack={noop}
      />
    );

    await waitFor(() => screen.getByTestId('session-canvas'));

    expect(hoisted.getCharacterFn).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: 'char-1' })
    );

    const props = hoisted.lastCanvasProps.current!;
    expect(props.characterId).toBe('char-1');
    expect(props.characterName).toBe('Toolkit Sandbox Fighter');
    // class 5 = CLASS_FIGHTER — CLASS_TEXTURE_SUFFIXES maps it to 'fighter',
    // the same string CLASS_CHARACTER_MODELS keys its GLBs by.
    expect(props.classRefId).toBe('fighter');
    expect(props.scene.floorTiles.size).toBe(2);
    // Position {x:1, y:0} (axial q=1, r=0) bridges to cube {x:1, y:-1, z:0}.
    expect(props.myPosition).toEqual({ x: 1, y: -1, z: 0 });
  });

  describe('a background GetWhere refetch does not unmount an already-shown canvas', () => {
    // Regression coverage for a real, live-reproduced bug: a MOVED stream
    // event (fired routinely while a walk is still animating — see
    // SessionEncounterView.tsx's own `canDrawSceneNow`/`canDrawScene`
    // doc comment) calls `refetchWhere()`, which sets `useSessionWhere`'s
    // `loading` true for the round trip. Before the fix, the top-level
    // `loading` gate switched `content` back to `<LoadingOverlay>` for
    // that whole window, unmounting `SessionCanvas` (and with it,
    // HexEntity's in-progress walk animation refs and the camera's
    // frozen seed) every single time — a walk would silently restart
    // partway through and the camera-follow this slice added never got a
    // chance to run. Asserted here via DOM node IDENTITY: the mocked
    // `SessionCanvas` renders a `<div data-testid="session-canvas" />`,
    // so an unmount+remount produces a DIFFERENT DOM node even though
    // `getByTestId` would still find *a* matching element either way.

    function renderReady() {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      return render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
    }

    it('a GetWhere refetch in flight (loading=true) keeps the same canvas DOM node mounted', async () => {
      const { rerender } = renderReady();
      await waitFor(() => screen.getByTestId('session-canvas'));
      const nodeBefore = screen.getByTestId('session-canvas');

      hoisted.whereResult.loading = true;
      rerender(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );

      expect(screen.getByTestId('session-canvas')).toBe(nodeBefore);
    });

    it('a FAILED background refetch (position cleared to null) still keeps the canvas mounted, using the last known-good position', async () => {
      const { rerender } = renderReady();
      await waitFor(() => screen.getByTestId('session-canvas'));
      const nodeBefore = screen.getByTestId('session-canvas');

      // useSessionWhere's own contract: a failed fetch clears position to
      // null and sets loading back to false.
      hoisted.whereResult.position = null;
      hoisted.whereResult.loading = false;
      hoisted.whereResult.error = new Error('transient GetWhere failure');
      rerender(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );

      expect(screen.getByTestId('session-canvas')).toBe(nodeBefore);
      // Still the last known-good position, not a crash from
      // positionToCube(null). y is -0 here (positionToCube's `-q - r` at
      // q=0,r=0), mathematically 0 but distinct under toEqual.
      expect(hoisted.lastCanvasProps.current!.myPosition).toEqual({
        x: 0,
        y: -0,
        z: 0,
      });
    });
  });

  describe('click to walk', () => {
    /** pointyAtlas()'s two cells, (0,0) and (1,0), are open floor and
     * hex-adjacent — a click on the far one is a direct, unobstructed
     * walk from GetWhere's (0,0). */
    function renderReadyAtOrigin() {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      return render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
    }

    it('refuses movement when Turn resolves WORLD before Afford, then uses the known world selector once both snapshots agree', async () => {
      const afford = deferred<unknown>();
      hoisted.affordFn.mockReturnValue(afford.promise);
      hoisted.moveFn.mockReturnValue(new Promise(() => {}));
      renderReadyAtOrigin();
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(1));

      act(() => {
        hoisted.lastCanvasProps.current!.onHexClick!({ x: 1, y: -1, z: 0 });
      });
      expect(hoisted.moveFn).not.toHaveBeenCalled();

      await act(async () => {
        afford.resolve({ clock: ClockKind.WORLD, declarations: [] });
        await afford.promise;
      });
      act(() => {
        hoisted.lastCanvasProps.current!.onHexClick!({ x: 1, y: -1, z: 0 });
      });
      expect(hoisted.moveFn).toHaveBeenCalledWith(
        expect.objectContaining({ declarationId: '' })
      );
    });

    it('refuses movement when Afford resolves TURN before Turn, then echoes the unique move selector once both snapshots agree', async () => {
      const turn = deferred<unknown>();
      hoisted.turnFn.mockReturnValue(turn.promise);
      hoisted.affordFn.mockResolvedValue({
        clock: ClockKind.TURN,
        declarations: [
          {
            id: 'v1.move',
            verb: Verb.MOVE,
            available: true,
            targetKind: TargetKind.PATH,
            candidates: [],
          },
        ],
      });
      hoisted.moveFn.mockReturnValue(new Promise(() => {}));
      renderReadyAtOrigin();
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(1));

      act(() => {
        hoisted.lastCanvasProps.current!.onHexClick!({ x: 1, y: -1, z: 0 });
      });
      expect(hoisted.moveFn).not.toHaveBeenCalled();

      await act(async () => {
        turn.resolve({
          clock: ClockKind.TURN,
          active: 'char-1',
          round: 1,
          order: ['char-1'],
          participants: [participant('char-1', { active: true })],
        });
        await turn.promise;
      });
      act(() => {
        hoisted.lastCanvasProps.current!.onHexClick!({ x: 1, y: -1, z: 0 });
      });
      expect(hoisted.moveFn).toHaveBeenCalledWith(
        expect.objectContaining({ declarationId: 'v1.move' })
      );
    });

    it('a click on the reachable neighbor cell dispatches Move and shows "Walking…" while the RPC is in flight', async () => {
      hoisted.moveFn.mockReturnValue(new Promise(() => {})); // never resolves
      renderReadyAtOrigin();
      await waitFor(() => screen.getByTestId('session-canvas'));

      act(() => {
        hoisted.lastCanvasProps.current!.onHexClick!({ x: 1, y: -1, z: 0 });
      });

      expect(hoisted.moveFn).toHaveBeenCalledWith({
        session: 'enc-1',
        member: 'char-1',
        path: [{ x: 1, y: 0 }],
        declarationId: '',
      });
      await waitFor(() => screen.getByText(/walking…/i));
    });

    it('a completed walk sets movePath/moveSeq on SessionCanvas, and the presentation-complete callback reconciles via GetWhere and clears "Walking…"', async () => {
      hoisted.moveFn.mockResolvedValue({
        steps: [{ position: { x: 1, y: 0 }, seq: 9n }],
      });
      renderReadyAtOrigin();
      await waitFor(() => screen.getByTestId('session-canvas'));

      act(() => {
        hoisted.lastCanvasProps.current!.onHexClick!({ x: 1, y: -1, z: 0 });
      });

      await waitFor(() =>
        expect(hoisted.lastCanvasProps.current!.moveSeq).toBe(1)
      );
      expect(hoisted.lastCanvasProps.current!.movePath).toEqual([
        { x: 1, y: -1, z: 0 },
      ]);
      screen.getByText(/walking…/i);

      // Fire the presentation-complete callback SessionCanvas would call
      // once HexEntity's animation finishes painting movePath.
      hoisted.whereResult.refetch.mockResolvedValue(undefined);
      await act(async () => {
        hoisted.lastCanvasProps.current!.onMovementPresentationComplete!(1);
        await Promise.resolve();
      });

      expect(hoisted.whereResult.refetch).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByText(/walking…/i)).toBeNull());
    });

    it('a click on an unreachable cell does not call Move', async () => {
      renderReadyAtOrigin();
      await waitFor(() => screen.getByTestId('session-canvas'));

      act(() => {
        hoisted.lastCanvasProps.current!.onHexClick!({ x: 99, y: -99, z: 0 });
      });

      expect(hoisted.moveFn).not.toHaveBeenCalled();
    });

    it('a Move RPC rejection shows the error text once no longer walking, without crashing', async () => {
      hoisted.moveFn.mockRejectedValue(
        new Error('no doorway joins those cells')
      );
      renderReadyAtOrigin();
      await waitFor(() => screen.getByTestId('session-canvas'));

      act(() => {
        hoisted.lastCanvasProps.current!.onHexClick!({ x: 1, y: -1, z: 0 });
      });

      await waitFor(() => screen.getByText(/no doorway joins those cells/i));
    });
  });

  it("subscribes StreamEvents with the session/member and refetches GetWhere on the LOCAL PLAYER's own MOVED event, ignoring other kinds", async () => {
    hoisted.atlasResult.atlas = pointyAtlas();
    hoisted.atlasResult.loading = false;
    hoisted.whereResult.position = { x: 0, y: 0 };
    hoisted.whereResult.loading = false;
    hoisted.streamEventsFn.mockReturnValue(
      fakeStream([
        // Via the shared `event()` helper (not a raw literal) so this
        // multi-event array carries contiguous seq — rule 6's gap
        // detection would otherwise misread the second event as a gap
        // (see `event()`'s own doc comment).
        event(EventKind.STRUCK),
        event(EventKind.MOVED, {
          case: 'moved',
          value: { member: 'char-1', to: { x: 1, y: 0 } },
        } as SessionEvent['body']),
      ])
    );

    render(
      <SessionEncounterView
        sessionId="enc-1"
        characterId="char-1"
        playerId="player-1"
        onBack={noop}
      />
    );
    await waitFor(() => screen.getByTestId('session-canvas'));

    expect(hoisted.streamEventsFn).toHaveBeenCalledWith(
      { session: 'enc-1', member: 'char-1' },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    await waitFor(() =>
      expect(hoisted.whereResult.refetch).toHaveBeenCalledTimes(1)
    );
  });

  it("clears the debug combat log's buffer on a session/member change (Copilot review, PR #784)", async () => {
    hoisted.atlasResult.atlas = pointyAtlas();
    hoisted.atlasResult.loading = false;
    hoisted.whereResult.position = { x: 0, y: 0 };
    hoisted.whereResult.loading = false;
    hoisted.streamEventsFn.mockReturnValueOnce(
      fakeStream([
        event(EventKind.MOVED, {
          case: 'moved',
          value: { member: 'char-1', to: { x: 1, y: 0 } },
        } as SessionEvent['body']),
      ])
    );

    const { rerender } = render(
      <SessionEncounterView
        sessionId="enc-1"
        characterId="char-1"
        playerId="player-1"
        onBack={noop}
      />
    );
    await waitFor(() =>
      expect(screen.getAllByTestId('debug-combat-log-line')).toHaveLength(1)
    );

    // A different session for the SAME component instance (no `key`
    // change) — GameView doesn't wire this today, but the buffer must
    // not depend on that: nothing from `enc-1` may survive into `enc-2`'s
    // log, and a fresh `seq` sequence starting over must not collide
    // with the previous session's own React list keys.
    hoisted.streamEventsFn.mockReturnValueOnce(fakeStream([]));
    rerender(
      <SessionEncounterView
        sessionId="enc-2"
        characterId="char-1"
        playerId="player-1"
        onBack={noop}
      />
    );

    await waitFor(() =>
      expect(hoisted.streamEventsFn).toHaveBeenLastCalledWith(
        { session: 'enc-2', member: 'char-1' },
        expect.anything()
      )
    );
    expect(screen.queryByTestId('debug-combat-log-line')).toBeNull();
    screen.getByText('No events yet.');
  });

  describe('drawing other perceived members (rpg-dnd5e-web#762 slice 3)', () => {
    it('turns a GetView sighting into an otherMembers entry passed to SessionCanvas', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.getViewFn.mockResolvedValue({
        sightings: [
          {
            subject: 'skeleton-1',
            payload: new Uint8Array(),
            channel: 'sight',
            at: 1n,
            currentVia: ['sight'],
            status: 'live',
            name: 'skeleton-1',
            seen: { position: { x: 10, y: 3 }, standing: Standing.UP },
          },
        ],
      });

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );

      await waitFor(() =>
        expect(hoisted.lastCanvasProps.current?.otherMembers).toHaveLength(1)
      );
      expect(hoisted.lastCanvasProps.current!.otherMembers).toEqual([
        {
          subject: 'skeleton-1',
          name: 'skeleton-1',
          monsterRefId: 'skeleton',
          // positionBridge.positionToCube(q=10, r=3): x=q, y=-q-r, z=r
          position: { x: 10, y: -13, z: 3 },
          remembered: false,
          standing: Standing.UP,
        },
      ]);
    });

    it("another member's own MOVED (e.g. the skeleton itself moving, rpg-project#254) refetches GetView through the paced queue, never GetWhere", async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.turnFn.mockResolvedValue({
        clock: ClockKind.TURN,
        active: 'skeleton-1',
        round: 1,
        order: ['char-1', 'skeleton-1'],
        participants: [
          participant('char-1', { name: 'Aldric' }),
          participant('skeleton-1', { name: 'skeleton-1', active: true }),
        ],
      });
      hoisted.streamEventsFn.mockReturnValue(
        fakeStream([
          event(EventKind.MOVED, {
            case: 'moved',
            value: { member: 'skeleton-1', to: { x: 1, y: 0 } },
          } as SessionEvent['body']),
        ])
      );

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));

      // The view follows where: exactly ONE GetView for the initial
      // wherePosition (useSessionView has no mount fetch of its own).
      await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(1));

      // The queue announces the actor's turn before it touches the
      // queued `moved` beat itself (monsterBeatQueue.ts's own doc
      // comment) — this is also proof the beat reached the queue at
      // all, not the immediate path. Scoped to the beat line specifically:
      // `combat-panel-waiting-on` independently renders "skeleton-1's
      // turn." any time it isn't the local player's turn, regardless of
      // this queue, so an unscoped query matches both.
      await waitFor(() =>
        within(screen.getByTestId('combat-panel-beat-line')).getByText(
          /^skeleton-1's turn\.$/i
        )
      );

      // ... and only THEN (one pace delay later) refetches GetView
      // directly — a second call, with GetWhere never touched. Another
      // member's own move is never "where am I."
      await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(2), {
        timeout: 2000,
      });
      expect(hoisted.whereResult.refetch).not.toHaveBeenCalled();
    });

    it('a not-your-turn Move rejection (toolkit#1169 session.ErrNotYourTurn) shows the friendly status line, not raw RPC text', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.moveFn.mockRejectedValue(
        new ConnectError('not your turn', Code.FailedPrecondition)
      );

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));

      act(() => {
        hoisted.lastCanvasProps.current!.onHexClick!({ x: 1, y: -1, z: 0 });
      });

      await waitFor(() =>
        screen.getByText(/not your turn — movement is locked/i)
      );
      // SessionCanvas's own `turnLocked` prop is not sourced from this
      // attempt-driven state at all (see SessionEncounterView.tsx's
      // `turnLocked` var — computed fresh from live Turn state instead, so
      // it can't go stale). useSessionWalk's own `notYourTurn` still
      // exists, but only to drive the refetch-on-refusal effect now —
      // covered by the "combat panel wiring" describe block's own
      // dedicated refetch tests below, not here.
    });
  });

  describe('move indicator wiring (rpg-dnd5e-web#762 slice 4)', () => {
    it('passes the atlas path index to SessionCanvas once the atlas has loaded', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));

      expect(hoisted.lastCanvasProps.current!.pathIndex).not.toBeNull();
      expect(hoisted.lastCanvasProps.current!.turnLocked).toBe(false);
    });

    it('a GetAtlas refetch error after a good load keeps the indicator/path working (rpg-dnd5e-web#768 Copilot review)', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;

      // A factory, not a shared element (this file's own established
      // pattern, see the GetView-refetch test above): React bails out of
      // re-rendering when handed the identical element object, so a
      // `rerender` that's meant to pick up MUTATED hoisted state needs a
      // fresh element each time.
      const view = () => (
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      const { rerender } = render(view());
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() =>
        expect(hoisted.lastCanvasProps.current?.pathIndex).not.toBeNull()
      );
      const goodPathIndex = hoisted.lastCanvasProps.current!.pathIndex;

      // Simulate a background GetAtlas refetch that fails — useSessionAtlas
      // .ts's own doc comment: a failed refetch nulls `atlas` (and clears
      // `loading`). Before rpg-dnd5e-web#768's fix, `pathIndex` was derived
      // straight from this live (now-null) atlas, so it went null right
      // along with it even though the canvas keeps drawing the OLD
      // encounter (`lastGoodSceneRef`/`lastGoodPositionRef`, unaffected by
      // this same failure).
      hoisted.atlasResult.atlas = null;
      hoisted.atlasResult.error = new Error('GetAtlas RPC failed');
      rerender(view());

      // The atlas path index — and by extension the indicator and
      // click-to-walk — keeps working off the SAME last-good snapshot
      // (literally the same object, not just "some non-null index"),
      // rather than silently going dead over what is really just a
      // transient refetch failure. GetAtlas's own doc comment: the atlas
      // is CONSTRUCTION TRUTH, static for the whole encounter.
      expect(hoisted.lastCanvasProps.current!.pathIndex).toBe(goodPathIndex);

      // And walking still actually works: a click still dispatches a real
      // Move RPC rather than silently no-opping.
      act(() => {
        hoisted.lastCanvasProps.current!.onHexClick!({ x: 1, y: -1, z: 0 });
      });
      await waitFor(() => expect(hoisted.moveFn).toHaveBeenCalled());
    });
  });
  describe('combat panel wiring (rpg-project#249 "the combat turn on the session stack")', () => {
    // No jest-dom matchers in this repo's vitest config (see
    // TurnHud.test.tsx's own note) — disabled state reads the plain DOM
    // property.
    function isDisabled(el: HTMLElement): boolean {
      return (el as HTMLButtonElement).disabled;
    }

    /** Atlas/position ready, Turn on the fight clock with `char-1` (the
     * local player) and `skeleton-1` (a monster) as the two participants,
     * a single in-reach Attack declaration naming `skeleton-1` — the
     * "your turn, ready to swing" baseline most of these tests start
     * from. */
    function readyOnYourTurn(
      overrides: {
        active?: string;
        round?: number;
        attackAffordable?: boolean;
        shortfallText?: string;
        participants?: Participant[];
      } = {}
    ) {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      const active = overrides.active ?? 'char-1';
      const participants = overrides.participants ?? [
        participant('char-1', { name: 'Aldric', active: active === 'char-1' }),
        participant('skeleton-1', {
          name: 'skeleton-1',
          active: active === 'skeleton-1',
        }),
      ];
      hoisted.turnFn.mockResolvedValue({
        clock: ClockKind.TURN,
        active,
        round: overrides.round ?? 1,
        order: participants.map((p) => p.member),
        participants,
      });
      const affordable = overrides.attackAffordable ?? true;
      // The generated wire shape: one Attack declaration carries all
      // candidates. SessionEncounterView alone expands temporary rows for
      // the old panel while retaining these exact selector-bearing messages.
      hoisted.affordFn.mockResolvedValue({
        clock: ClockKind.TURN,
        declarations: [
          {
            id: 'v1.attack',
            verb: Verb.ATTACK,
            slot: Slot.ACTION,
            available: affordable,
            targetKind: TargetKind.MEMBER,
            candidates: [
              {
                member: 'skeleton-1',
                available: affordable,
                why: affordable
                  ? undefined
                  : {
                      reason: ShortfallReason.NO_BUDGET,
                      currency: Currency.ACTION,
                      needed: 1,
                      left: 0,
                      text: overrides.shortfallText ?? '',
                    },
              },
            ],
          },
          {
            id: 'v1.move',
            verb: Verb.MOVE,
            slot: Slot.NONE,
            available: true,
            targetKind: TargetKind.PATH,
            candidates: [],
          },
          {
            id: 'v1.end',
            verb: Verb.END_TURN,
            slot: Slot.NONE,
            available: true,
            targetKind: TargetKind.NONE,
            candidates: [],
          },
        ],
      });
    }

    it('fetches Afford AND Turn once the member is known and renders the free-roam pill (neither hook has a mount fetch of its own)', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));

      await waitFor(() =>
        expect(hoisted.affordFn).toHaveBeenCalledWith({
          session: 'enc-1',
          member: 'char-1',
        })
      );
      expect(hoisted.affordFn).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(hoisted.turnFn).toHaveBeenCalledWith({
          session: 'enc-1',
          member: 'char-1',
        })
      );
      expect(hoisted.turnFn).toHaveBeenCalledTimes(1);
      await waitFor(() => screen.getByTestId('turn-hud-free-roam-pill'));
    });

    it('the panel MODE is keyed on Turn.clock, not Afford.clock: an affordable turn-clock Afford answer alone still renders free-roam until Turn agrees', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.affordFn.mockResolvedValue({
        clock: ClockKind.TURN,
        declarations: [
          {
            verb: Verb.ATTACK,
            slot: Slot.ACTION,
            available: true,
            candidates: [{ member: 'skeleton-1', available: true }],
          },
        ],
      });
      // hoisted.turnFn keeps its beforeEach default: CLOCK_KIND_WORLD.

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => screen.getByTestId('turn-hud-free-roam-pill'));
      expect(screen.queryByTestId('combat-panel-round')).toBeNull();
    });

    it('on the turn clock, renders round + participant chips by NAME (active/you marked) + the action shape lit', async () => {
      readyOnYourTurn({ round: 2 });

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));

      await waitFor(() => screen.getByTestId('combat-panel-round'));
      screen.getByText(/round 2/i);

      const chips = screen.getAllByTestId('combat-panel-participant');
      expect(chips).toHaveLength(2);
      expect(chips[0]!.textContent).toContain('Aldric');
      expect(chips[0]!.getAttribute('data-active')).toBe('true');
      expect(chips[0]!.getAttribute('data-you')).toBe('true');
      expect(chips[1]!.textContent).toContain('skeleton-1');
      expect(chips[1]!.getAttribute('data-active')).toBe('false');
      expect(chips[1]!.getAttribute('data-you')).toBe('false');

      expect(
        screen.getByTestId('turn-hud-shape-action').getAttribute('data-lit')
      ).toBe('true');
      expect(screen.queryByTestId('combat-panel-waiting-on')).toBeNull();
    });

    it("when it is NOT your turn: shapes read dim, End Turn disabled, and a '<name>'s turn.' line — even though Afford still reports the action affordable", async () => {
      readyOnYourTurn({ active: 'skeleton-1', attackAffordable: true });

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => screen.getByTestId('combat-panel-waiting-on'));

      screen.getByText(/skeleton-1.s turn\./i);
      expect(
        screen.getByTestId('turn-hud-shape-action').getAttribute('data-lit')
      ).toBe('false');
      expect(
        isDisabled(screen.getByTestId('combat-panel-end-turn-button'))
      ).toBe(true);
      // Attack is a floor gesture now — nothing in reach is even offered
      // while it isn't your turn (combatPanel.ts's own turn-ownership gate).
      expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([]);
    });

    it('hovering an unaffordable in-reach target shows its own shortfall text, not a generic label', async () => {
      readyOnYourTurn({
        attackAffordable: false,
        shortfallText: 'action: 1 needed, 0 left',
      });

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => screen.getByTestId('combat-panel-round'));

      act(() => {
        hoisted.lastCanvasProps.current!.onHoverEntity!('skeleton-1');
      });

      await waitFor(() => screen.getByText(/action: 1 needed, 0 left/i));
    });

    it('an in-reach target is offered to SessionCanvas as attackable, and hovering it shows "Attack <name>"', async () => {
      readyOnYourTurn();

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() =>
        expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([
          'skeleton-1',
        ])
      );

      act(() => {
        hoisted.lastCanvasProps.current!.onHoverEntity!('skeleton-1');
      });

      await waitFor(() => screen.getByText(/attack skeleton-1/i));
    });

    it('clicking an attackable entity (SessionCanvas.onEntityClick) dispatches Attack immediately — no intermediate select-then-confirm step', async () => {
      readyOnYourTurn();
      hoisted.attackFn.mockResolvedValue({
        roll: 17,
        total: 20,
        against: 13,
        hit: true,
        critical: false,
        damage: 6,
        seq: 1n,
      });

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(1));

      act(() => {
        hoisted.lastCanvasProps.current!.onEntityClick!('skeleton-1');
      });

      expect(hoisted.attackFn).toHaveBeenCalledWith({
        session: 'enc-1',
        attacker: 'char-1',
        target: 'skeleton-1',
        declarationId: 'v1.attack',
      });
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2));
    });

    it('dispatches the exact valid direct-map offer when an earlier legacy row for the same subject is unavailable', async () => {
      readyOnYourTurn();
      hoisted.affordFn.mockResolvedValue({
        clock: ClockKind.TURN,
        declarations: [
          {
            id: 'v1.spent-attack',
            verb: Verb.ATTACK,
            slot: Slot.ACTION,
            available: false,
            targetKind: TargetKind.MEMBER,
            candidates: [{ member: 'skeleton-1', available: false }],
          },
          {
            id: 'v1.valid-attack',
            verb: Verb.ATTACK,
            slot: Slot.ACTION,
            available: true,
            targetKind: TargetKind.MEMBER,
            candidates: [{ member: 'skeleton-1', available: true }],
          },
        ],
      });
      hoisted.attackFn.mockResolvedValue({});

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() =>
        expect(hoisted.lastCanvasProps.current?.attackableTargets).toContain(
          'skeleton-1'
        )
      );

      act(() => {
        hoisted.lastCanvasProps.current!.onEntityClick!('skeleton-1');
      });

      expect(hoisted.attackFn).toHaveBeenCalledWith({
        session: 'enc-1',
        attacker: 'char-1',
        target: 'skeleton-1',
        declarationId: 'v1.valid-attack',
      });
    });

    it('does not dispatch a direct-map attack when multiple valid offers match the visible subject', async () => {
      readyOnYourTurn();
      hoisted.affordFn.mockResolvedValue({
        clock: ClockKind.TURN,
        declarations: [
          {
            id: 'v1.longsword',
            verb: Verb.ATTACK,
            slot: Slot.ACTION,
            available: true,
            targetKind: TargetKind.MEMBER,
            candidates: [{ member: 'skeleton-1', available: true }],
          },
          {
            id: 'v1.unarmed',
            verb: Verb.ATTACK,
            slot: Slot.ACTION,
            available: true,
            targetKind: TargetKind.MEMBER,
            candidates: [{ member: 'skeleton-1', available: true }],
          },
        ],
      });

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() =>
        expect(hoisted.lastCanvasProps.current?.attackableTargets).toContain(
          'skeleton-1'
        )
      );

      act(() => {
        hoisted.lastCanvasProps.current!.onEntityClick!('skeleton-1');
      });

      expect(hoisted.attackFn).not.toHaveBeenCalled();
    });

    it("also refetches GetView after the player's own Attack round-trip (a live-gate-found gap: sightings only refreshed on Move before this, so a just-defeated target stayed clickable until the next walk)", async () => {
      readyOnYourTurn();
      hoisted.attackFn.mockResolvedValue({
        roll: 17,
        total: 20,
        against: 13,
        hit: true,
        critical: false,
        damage: 6,
        seq: 1n,
      });

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      // Exactly ONE GetView for the initial wherePosition, same baseline
      // the MOVED test above establishes.
      await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(1));

      act(() => {
        hoisted.lastCanvasProps.current!.onEntityClick!('skeleton-1');
      });

      await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(2));
    });

    it('also refetches GetView after a REFUSED Attack round-trip -- the sighting refresh does not depend on the swing landing', async () => {
      readyOnYourTurn();
      hoisted.attackFn.mockRejectedValue(new Error('failed_precondition'));

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(1));

      act(() => {
        hoisted.lastCanvasProps.current!.onEntityClick!('skeleton-1');
      });

      await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(2));
    });

    it('clicking an entity that is not in attackableTargets never dispatches Attack', async () => {
      readyOnYourTurn({ active: 'skeleton-1' }); // not your turn -> nothing is attackable

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() =>
        expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([])
      );

      act(() => {
        hoisted.lastCanvasProps.current!.onEntityClick!('skeleton-1');
      });

      expect(hoisted.attackFn).not.toHaveBeenCalled();
    });

    it("once the Attack action is spent (in-reach target now unaffordable), attackableTargets drops it -- the floor must keep walking regardless of what's been spent (Kirk's own live-walk ruling)", async () => {
      readyOnYourTurn({
        attackAffordable: false,
        shortfallText: 'action: 1 needed, 0 left',
      });

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));

      // skeleton-1 is still IN REACH (a declaration still names it -- its
      // own shortfall text is what a hover would show) but no longer
      // AFFORDABLE, so it must not appear in the narrower list that
      // drives floor click-routing.
      await waitFor(() =>
        expect(hoisted.lastCanvasProps.current?.attackableTargets).toEqual([])
      );

      // Clicking that entity is now a pure no-op (nothing to attack)...
      act(() => {
        hoisted.lastCanvasProps.current!.onEntityClick!('skeleton-1');
      });
      expect(hoisted.attackFn).not.toHaveBeenCalled();

      // ...and, critically, the floor itself is untouched by the spent
      // action -- a walk click still dispatches Move normally.
      hoisted.moveFn.mockResolvedValue({
        steps: [{ position: { x: 1, y: 0 }, seq: 1n }],
      });
      act(() => {
        hoisted.lastCanvasProps.current!.onHexClick!({ x: 1, y: -1, z: 0 });
      });
      await waitFor(() => expect(hoisted.moveFn).toHaveBeenCalled());
    });

    it('the beat line renders ONLY from a typed Struck stream event — "You hit <name> — N vs AC M, D word." (rpg-project#249 §1, gate review: no more reading AttackResponse fields directly)', async () => {
      readyOnYourTurn();
      hoisted.streamEventsFn.mockReturnValue(
        fakeStream([
          event(EventKind.STRUCK, {
            case: 'struck',
            value: {
              attacker: 'char-1',
              target: 'skeleton-1',
              roll: 14,
              total: 17,
              against: 13,
              damage: 6,
              attack: { ref: 'longsword', name: 'Longsword', damageType: 12 },
              critical: false,
            },
          } as SessionEvent['body']),
        ])
      );

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));

      await waitFor(() =>
        screen.getByText(/you hit skeleton-1 — 17 vs ac 13, 6 slashing\./i)
      );
    });

    it('a Missed stream event renders the miss beat, no damage number', async () => {
      readyOnYourTurn();
      hoisted.streamEventsFn.mockReturnValue(
        fakeStream([
          event(EventKind.MISSED, {
            case: 'missed',
            value: {
              attacker: 'char-1',
              target: 'skeleton-1',
              roll: 3,
              total: 5,
              against: 13,
            },
          } as SessionEvent['body']),
        ])
      );

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));

      await waitFor(() =>
        screen.getByText(/you miss skeleton-1 — 5 vs ac 13\./i)
      );
    });

    it('a Downed stream event names WHO (rpg-toolkit#1137) — no anonymous placeholder anymore', async () => {
      readyOnYourTurn();
      hoisted.streamEventsFn.mockReturnValue(
        fakeStream([
          event(EventKind.DOWNED, {
            case: 'downed',
            value: { member: 'skeleton-1' },
          } as SessionEvent['body']),
        ])
      );

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));

      await waitFor(() => screen.getByTestId('combat-panel-beat-line'));
      screen.getByText(/^skeleton-1 is downed\.$/i);
    });

    it("also refetches GetView on a Downed stream event -- the just-defeated subject's sighted standing must not lag behind the beat that already announced it", async () => {
      readyOnYourTurn();
      hoisted.streamEventsFn.mockReturnValue(
        fakeStream([
          event(EventKind.DOWNED, {
            case: 'downed',
            value: { member: 'skeleton-1' },
          } as SessionEvent['body']),
        ])
      );

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => screen.getByTestId('combat-panel-beat-line'));

      // The stream delivers eagerly (`fakeStream`), so the mount's own
      // baseline GetView and the downed-triggered one can both have
      // already landed by the time we look -- assert the FINAL count
      // directly rather than an intermediate step that may already be
      // stale (same reasoning as the Struck/Missed beat tests above,
      // which never check an intermediate GetView count either).
      await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(2));
    });

    it('also refetches GetView on a FightEnded stream event', async () => {
      readyOnYourTurn();
      hoisted.streamEventsFn.mockReturnValue(
        fakeStream([
          event(EventKind.FIGHT_ENDED, {
            case: 'fightEnded',
            value: { cause: DissolveKind.BY_DEFEAT },
          } as SessionEvent['body']),
        ])
      );

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));

      // Same reasoning as the Downed test above -- assert the final
      // count, not an intermediate baseline that may already be stale.
      await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(2));
    });

    it('clicking End Turn dispatches the RPC and refetches Afford + Turn', async () => {
      readyOnYourTurn();
      hoisted.endTurnFn.mockResolvedValue({
        next: 'skeleton-1',
        roundWrapped: false,
        seq: 2n,
      });

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(1));
      expect(
        isDisabled(screen.getByTestId('combat-panel-end-turn-button'))
      ).toBe(false);

      fireEvent.click(screen.getByTestId('combat-panel-end-turn-button'));

      expect(hoisted.endTurnFn).toHaveBeenCalledWith({
        session: 'enc-1',
        member: 'char-1',
        declarationId: 'v1.end',
      });
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2));
    });

    it('clicking End Turn while disabled never dispatches the RPC', async () => {
      readyOnYourTurn({ active: 'skeleton-1' }); // not your turn
      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() =>
        expect(
          isDisabled(screen.getByTestId('combat-panel-end-turn-button'))
        ).toBe(true)
      );

      fireEvent.click(screen.getByTestId('combat-panel-end-turn-button'));

      expect(hoisted.endTurnFn).not.toHaveBeenCalled();
    });

    it("refetches Afford AND Turn on FIGHT_STARTED/FIGHT_ENDED/TURN_ENDED (the local player's own turn ending, no pacing)", async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.streamEventsFn.mockReturnValue(
        fakeStream([
          event(EventKind.FIGHT_STARTED, {
            case: 'fightStarted',
            value: { members: ['char-1', 'skeleton-1'] },
          } as SessionEvent['body']),
          event(EventKind.FIGHT_ENDED, {
            case: 'fightEnded',
            value: { cause: DissolveKind.BY_DEFEAT },
          } as SessionEvent['body']),
          event(EventKind.TURN_ENDED, {
            case: 'turnEnded',
            value: { member: 'char-1', next: 'skeleton-1' },
          } as SessionEvent['body']),
        ])
      );

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));

      // 1 mount-bootstrap call + 3 listed kinds.
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(4));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(4));
    });

    it('refetches Afford but NOT Turn on STRUCK/MISSED/ENDED — those change what you can pay, never whose turn it is', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.streamEventsFn.mockReturnValue(
        fakeStream([
          event(EventKind.STRUCK, {
            case: 'struck',
            value: {
              attacker: 'skeleton-1',
              target: 'char-1',
              roll: 10,
              total: 12,
              against: 15,
              damage: 4,
              attack: { ref: 'claw', name: 'Claw', damageType: 12 },
              critical: false,
            },
          } as SessionEvent['body']),
          event(EventKind.MISSED, {
            case: 'missed',
            value: {
              attacker: 'skeleton-1',
              target: 'char-1',
              roll: 2,
              total: 4,
              against: 15,
            },
          } as SessionEvent['body']),
          event(EventKind.ENDED),
        ])
      );

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));

      // 1 mount-bootstrap call + 3 listed kinds.
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(4));
      // Turn only ever gets its own mount-bootstrap call — none of these
      // three kinds refetch it.
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(1));
    });

    it("also refetches Turn on a Downed event -- a participant's standing changed, and Turn.participants (not Afford) is what the roster chip / isDowned display reads (rpg-project#251 web#772: without this, a just-downed member's roster entry -- and anything else keyed off Turn.participants -- stays stale until something ELSE happens to refetch Turn, e.g. End Turn)", async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.streamEventsFn.mockReturnValue(
        fakeStream([
          event(EventKind.DOWNED, {
            case: 'downed',
            value: { member: 'skeleton-1' },
          } as SessionEvent['body']),
        ])
      );

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));

      // 1 mount-bootstrap call + 1 for the Downed event.
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2));
    });

    it('a MOVED stream event refetches neither Afford nor Turn', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.streamEventsFn.mockReturnValue(
        fakeStream([
          event(EventKind.MOVED, {
            case: 'moved',
            value: { member: 'char-1', to: { x: 1, y: 0 } },
          } as SessionEvent['body']),
        ])
      );

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(1));

      await act(async () => {
        await Promise.resolve();
      });
      expect(hoisted.affordFn).toHaveBeenCalledTimes(1);
      expect(hoisted.turnFn).toHaveBeenCalledTimes(1);
    });

    it("the local player's own completed walk also refetches Afford AND Turn (own-move round-trip)", async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.moveFn.mockResolvedValue({
        steps: [{ position: { x: 1, y: 0 }, seq: 9n }],
      });

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(1));

      act(() => {
        hoisted.lastCanvasProps.current!.onHexClick!({ x: 1, y: -1, z: 0 });
      });
      await waitFor(() =>
        expect(hoisted.lastCanvasProps.current!.moveSeq).toBe(1)
      );

      hoisted.whereResult.refetch.mockResolvedValue(undefined);
      await act(async () => {
        hoisted.lastCanvasProps.current!.onMovementPresentationComplete!(1);
        await Promise.resolve();
      });

      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2));
    });

    it('a presentation-complete callback for a seq that is not the current move does not refetch Afford or Turn', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(1));

      // No walk has happened yet, so moveSeq is still undefined — this
      // mirrors useSessionWalk's own guard (completedSeq !== moveSeq).
      await act(async () => {
        hoisted.lastCanvasProps.current!.onMovementPresentationComplete!(1);
        await Promise.resolve();
      });

      expect(hoisted.affordFn).toHaveBeenCalledTimes(1);
      expect(hoisted.turnFn).toHaveBeenCalledTimes(1);
    });

    it('a not-your-turn Move rejection also refetches Afford AND Turn — without it the panel would keep showing free-roam', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.moveFn.mockRejectedValue(
        new ConnectError('not your turn', Code.FailedPrecondition)
      );

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(1));

      act(() => {
        hoisted.lastCanvasProps.current!.onHexClick!({ x: 1, y: -1, z: 0 });
      });

      await waitFor(() =>
        screen.getByText(/not your turn — movement is locked/i)
      );
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2));
    });

    it("SessionCanvas's turnLocked prop is computed from live Turn state, true the instant it is NOT your turn — no failed Move attempt needed", async () => {
      readyOnYourTurn({ active: 'skeleton-1' }); // not your turn from the start

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));

      // No onHexClick/Move attempt happened at all -- turnLocked reads
      // true purely from turnActive !== member.
      await waitFor(() =>
        expect(hoisted.lastCanvasProps.current?.turnLocked).toBe(true)
      );
      expect(hoisted.moveFn).not.toHaveBeenCalled();
    });

    it('SessionCanvas.turnLocked is false on your own turn even though useSessionWalk has never attempted a Move', async () => {
      readyOnYourTurn(); // your turn from the start

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));

      await waitFor(() =>
        expect(hoisted.lastCanvasProps.current?.turnLocked).toBe(false)
      );
    });

    it('refuses turn movement when the Move offer is missing', async () => {
      readyOnYourTurn();
      hoisted.affordFn.mockResolvedValue({
        clock: ClockKind.TURN,
        declarations: [
          {
            id: 'v1.attack',
            verb: Verb.ATTACK,
            slot: Slot.ACTION,
            available: true,
            targetKind: TargetKind.MEMBER,
            candidates: [{ member: 'skeleton-1', available: true }],
          },
        ],
      });

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(1));

      act(() => {
        hoisted.lastCanvasProps.current!.onHexClick!({ x: 1, y: -1, z: 0 });
      });

      expect(hoisted.moveFn).not.toHaveBeenCalled();
    });

    it('refuses turn movement when duplicate available Move offers are present', async () => {
      readyOnYourTurn();
      hoisted.affordFn.mockResolvedValue({
        clock: ClockKind.TURN,
        declarations: [
          {
            id: 'v1.move-a',
            verb: Verb.MOVE,
            available: true,
            targetKind: TargetKind.PATH,
            candidates: [],
          },
          {
            id: 'v1.move-b',
            verb: Verb.MOVE,
            available: true,
            targetKind: TargetKind.PATH,
            candidates: [],
          },
        ],
      });

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(1));

      act(() => {
        hoisted.lastCanvasProps.current!.onHexClick!({ x: 1, y: -1, z: 0 });
      });

      expect(hoisted.moveFn).not.toHaveBeenCalled();
    });

    it('SessionCanvas.maxCells is floor(remaining/5) from the Move declaration on your turn', async () => {
      readyOnYourTurn();
      hoisted.affordFn.mockResolvedValue({
        clock: ClockKind.TURN,
        declarations: [
          {
            verb: Verb.ATTACK,
            slot: Slot.ACTION,
            available: true,
            candidates: [{ member: 'skeleton-1', available: true }],
          },
          {
            id: 'v1.move',
            verb: Verb.MOVE,
            slot: Slot.NONE,
            available: true,
            targetKind: TargetKind.PATH,
            candidates: [],
            remaining: 17,
          },
        ],
      });

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));

      await waitFor(() =>
        expect(hoisted.lastCanvasProps.current?.maxCells).toBe(3)
      );
    });

    it('SessionCanvas.maxCells is undefined on the world clock (free roam is unbounded)', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => screen.getByTestId('turn-hud-free-roam-pill'));

      expect(hoisted.lastCanvasProps.current?.maxCells).toBeUndefined();
    });

    it('the "Your turn!" teaching banner shows when the active member first becomes you (web#533)', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      // Starts on the world clock (beforeEach default) — the view then
      // re-renders once Turn resolves the fight starting on this member.
      hoisted.streamEventsFn.mockReturnValue(
        fakeStream([
          event(EventKind.FIGHT_STARTED, {
            case: 'fightStarted',
            value: { members: ['char-1', 'skeleton-1'] },
          } as SessionEvent['body']),
        ])
      );
      hoisted.turnFn
        .mockResolvedValueOnce({
          clock: ClockKind.WORLD,
          active: '',
          round: 0,
          order: [],
          participants: [],
        })
        .mockResolvedValue({
          clock: ClockKind.TURN,
          active: 'char-1',
          round: 1,
          order: ['char-1', 'skeleton-1'],
          participants: [
            participant('char-1', { name: 'Aldric', active: true }),
            participant('skeleton-1', { name: 'skeleton-1' }),
          ],
        });

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));

      await waitFor(() => screen.getByTestId('combat-panel-turn-started'));
      screen.getByText(/your turn!/i);
    });

    it('the monster\'s turn is a paced moment: "<name>\'s turn." then "<name> does nothing." before the panel flips back (web#561)', async () => {
      readyOnYourTurn();
      // Withheld until the roster (participants) has actually landed —
      // otherwise this test races Turn's own mount-bootstrap fetch
      // against stream delivery, and the "<name>'s turn." announce step
      // (monsterBeatQueue.ts) would resolve skeleton-1's display name
      // from an empty roster.
      const { stream, release } = deferredStream([
        event(EventKind.TURN_ENDED, {
          case: 'turnEnded',
          value: { member: 'skeleton-1', next: 'char-1' },
        } as SessionEvent['body']),
      ]);
      hoisted.streamEventsFn.mockReturnValue(stream);

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      // Mount-bootstrap fetch only — the roster is now known.
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(1));
      await waitFor(() => screen.getAllByTestId('combat-panel-participant'));

      release();

      await waitFor(() => screen.getByText(/^skeleton-1.s turn\.$/i), {
        timeout: 2000,
      });
      // Still just the mount-bootstrap call — the pacing timer hasn't
      // fired yet.
      expect(hoisted.turnFn).toHaveBeenCalledTimes(1);
      await waitFor(() => screen.getByText(/^skeleton-1 does nothing\.$/i), {
        timeout: 2000,
      });
      // Only now does the pacing sequence refetch Turn/Afford.
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2), {
        timeout: 2000,
      });
    }, 10000);

    it("a monster's driven turn narrates moved x N then a swing at a readable pace, refreshing GetView per beat and holding the HUD on the monster until it finishes (rpg-project#254, design rpg-project#252)", async () => {
      readyOnYourTurn();
      const { stream, release } = deferredStream([
        event(EventKind.MOVED, {
          case: 'moved',
          value: { member: 'skeleton-1', to: { x: 1, y: 0 } },
        } as SessionEvent['body']),
        event(EventKind.MOVED, {
          case: 'moved',
          value: { member: 'skeleton-1', to: { x: 2, y: 0 } },
        } as SessionEvent['body']),
        event(EventKind.STRUCK, {
          case: 'struck',
          value: {
            attacker: 'skeleton-1',
            target: 'char-1',
            roll: 18,
            total: 23,
            against: 13,
            damage: 11,
            attack: {
              ref: 'bite',
              name: 'Bite',
              damageType: DamageType.PIERCING,
            },
            critical: false,
          },
        } as SessionEvent['body']),
        event(EventKind.TURN_ENDED, {
          case: 'turnEnded',
          value: { member: 'skeleton-1', next: 'char-1' },
        } as SessionEvent['body']),
      ]);
      hoisted.streamEventsFn.mockReturnValue(stream);

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(1));
      await waitFor(() => screen.getAllByTestId('combat-panel-participant'));
      // One GetView from the initial wherePosition landing.
      await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(1));

      release();

      await waitFor(() => screen.getByText(/^skeleton-1's turn\.$/i));

      // Each queued `moved` refetches GetView in turn — the entity must
      // be standing where the server says by the time its `struck` lands
      // (rpg-project#252 §4).
      await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(2), {
        timeout: 2000,
      });
      await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(3), {
        timeout: 2000,
      });

      // The swing reads exactly like the player's own would — the SAME
      // `formatBeat` (rpg-project#254's own "HUD" bullet).
      await waitFor(
        () => {
          expect(screen.getByTestId('combat-panel-beat-line').textContent).toBe(
            'skeleton-1 hits you — 23 vs AC 13, 11 piercing.'
          );
        },
        { timeout: 2000 }
      );
      expect(hoisted.getViewFn).toHaveBeenCalledTimes(4);

      // The turn indicator holds on the monster through every beat above
      // — only the mount-bootstrap Turn fetch has happened so far, even
      // though the swing already rendered.
      expect(hoisted.turnFn).toHaveBeenCalledTimes(1);

      // turnEnded: a real action happened this turn, so no "does
      // nothing" text — the swing's own line stands — but it still
      // refreshes GetView once more before finalizing.
      await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(5), {
        timeout: 2000,
      });
      expect(screen.queryByText(/does nothing/i)).toBeNull();

      // Only NOW (one more pace delay later) does the panel flip back —
      // the trailing refetch after the closing beat.
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2), {
        timeout: 2000,
      });
    }, 10000);

    it('a driven turn that only moves (never gets in reach) is never narrated as "does nothing" (Copilot review, PR #776)', async () => {
      readyOnYourTurn();
      const { stream, release } = deferredStream([
        event(EventKind.MOVED, {
          case: 'moved',
          value: { member: 'skeleton-1', to: { x: 1, y: 0 } },
        } as SessionEvent['body']),
        event(EventKind.MOVED, {
          case: 'moved',
          value: { member: 'skeleton-1', to: { x: 2, y: 0 } },
        } as SessionEvent['body']),
        event(EventKind.TURN_ENDED, {
          case: 'turnEnded',
          value: { member: 'skeleton-1', next: 'char-1' },
        } as SessionEvent['body']),
      ]);
      hoisted.streamEventsFn.mockReturnValue(stream);

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(1));
      await waitFor(() => screen.getAllByTestId('combat-panel-participant'));

      release();

      await waitFor(() => screen.getByText(/^skeleton-1's turn\.$/i));

      // The turn closes (both moves processed, then turnEnded) without
      // ever claiming the skeleton did nothing — it moved twice.
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2), {
        timeout: 2000,
      });
      expect(screen.queryByText(/does nothing/i)).toBeNull();
    }, 10000);
  });

  describe("a fight-start beat before Turn's own roster fetch has landed (live-gate regression)", () => {
    it('resolves the FightStarted roster from a sighted member\'s own name, not Turn.participants alone -- caught live: "A fight begins: skeleton-1, You." (the raw id) instead of "A fight begins: You, Skeleton."', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      // A live sighting already names the skeleton -- exactly what makes
      // a fight form in the first place.
      hoisted.getViewFn.mockResolvedValue({
        sightings: [
          {
            subject: 'skeleton-1',
            payload: new Uint8Array(),
            channel: 'sight',
            at: 1n,
            currentVia: ['sight'],
            status: 'live',
            name: 'Skeleton',
            seen: { position: { x: 5, y: 0 }, standing: Standing.UP },
          },
        ],
      });
      // The mount-bootstrap Turn fetch resolves with the clock already
      // on TURN (so the panel leaves free-roam and actually renders a
      // beat line) but an EMPTY participants list -- reproducing the
      // live race where the beat is computed before Turn's own roster
      // catches up. Any LATER refetch (the one FIGHT_STARTED itself
      // triggers) resolves with the real roster, but `lastBeat` is a
      // one-shot format-then-store, not a live-recomputing selector, so
      // a stale name baked in at computation time is never corrected
      // retroactively -- which is exactly what this regression pins.
      hoisted.turnFn.mockResolvedValueOnce({
        clock: ClockKind.TURN,
        active: 'char-1',
        round: 1,
        order: [],
        participants: [],
      });
      hoisted.turnFn.mockResolvedValue({
        clock: ClockKind.TURN,
        active: 'char-1',
        round: 1,
        order: ['char-1', 'skeleton-1'],
        participants: [
          participant('char-1', { name: 'Aldric', active: true }),
          participant('skeleton-1', { name: 'Skeleton' }),
        ],
      });
      // Withheld until the sighting has actually landed in otherMembers
      // -- GetView and StreamEvents are two independent fetches with no
      // ordering guarantee between them; this pins the case where the
      // sighting wins the race (the common one: GetView fires the moment
      // position is known, typically well before a monster's own
      // fight-triggering beat streams in).
      const { stream, release } = deferredStream([
        event(EventKind.FIGHT_STARTED, {
          case: 'fightStarted',
          value: { members: ['char-1', 'skeleton-1'] },
        } as SessionEvent['body']),
      ]);
      hoisted.streamEventsFn.mockReturnValue(stream);

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() =>
        expect(hoisted.lastCanvasProps.current?.otherMembers).toHaveLength(1)
      );

      release();

      await waitFor(() => screen.getByTestId('combat-panel-beat-line'));
      screen.getByText(/^a fight begins: you, skeleton\.$/i);
      expect(screen.queryByText(/skeleton-1/i)).toBeNull();
    });

    it('falls back to the raw subject id (never blank, same documented convention as participantNames.ts elsewhere) when NEITHER Turn.participants NOR a sighting has named it yet', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.getViewFn.mockResolvedValue({ sightings: [] });
      hoisted.turnFn.mockResolvedValue({
        clock: ClockKind.TURN,
        active: 'char-1',
        round: 1,
        order: [],
        participants: [],
      });
      hoisted.streamEventsFn.mockReturnValue(
        fakeStream([
          event(EventKind.FIGHT_STARTED, {
            case: 'fightStarted',
            value: { members: ['char-1', 'skeleton-1'] },
          } as SessionEvent['body']),
        ])
      );

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));

      await waitFor(() => screen.getByTestId('combat-panel-beat-line'));
      screen.getByText(/^a fight begins: you, skeleton-1\.$/i);
    });
  });

  describe('equipment screen (rpg-project#249 §4, reusing web#571)', () => {
    it('fetches GetCharacterData once the character is known', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));

      await waitFor(() =>
        expect(hoisted.getCharacterDataFn).toHaveBeenCalledWith(
          expect.objectContaining({ characterId: 'char-1' })
        )
      );
    });

    it('no entry point when GetCharacterData has not resolved any data yet', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.queryByTestId('combat-panel-equipment-button')).toBeNull();
    });

    it('shows the entry point once real CharacterData arrives, and opens the popover with the server-composed AC', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.getCharacterDataFn.mockResolvedValue({
        character: {
          classRef: undefined,
          raceRef: undefined,
          playerId: 'player-1',
          equipped: {},
          inventory: [],
          slots: [],
          armorClassDetail: { total: 16, note: 'chain shirt + shield' },
          mainHandDamage: '1d8 slashing',
        },
      });

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => screen.getByTestId('combat-panel-equipment-button'));

      fireEvent.click(screen.getByTestId('combat-panel-equipment-button'));

      await waitFor(() => screen.getByTestId('equipment-popover'));
      screen.getByText(/16/);
    });

    it('also opens mid-combat (turn mode) — Kirk\'s own live-walk report: "the equipment button does nothing" happened during a fight, not free roam', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.turnFn.mockResolvedValue({
        clock: ClockKind.TURN,
        active: 'char-1',
        round: 1,
        order: ['char-1', 'skeleton-1'],
        participants: [
          participant('char-1', { name: 'Aldric', active: true }),
          participant('skeleton-1', { name: 'skeleton-1' }),
        ],
      });
      hoisted.affordFn.mockResolvedValue({
        clock: ClockKind.TURN,
        declarations: [
          {
            verb: Verb.ATTACK,
            slot: Slot.ACTION,
            available: true,
            candidates: [{ member: 'skeleton-1', available: true }],
          },
        ],
      });
      hoisted.getCharacterDataFn.mockResolvedValue({
        character: {
          classRef: undefined,
          raceRef: undefined,
          playerId: 'player-1',
          equipped: {},
          inventory: [],
          slots: [],
          armorClassDetail: { total: 14, note: '10 + 2 DEX + 2 shield' },
          mainHandDamage: '1d8 slashing',
        },
      });

      render(
        <SessionEncounterView
          sessionId="enc-1"
          characterId="char-1"
          playerId="player-1"
          onBack={noop}
        />
      );
      await waitFor(() => screen.getByTestId('session-canvas'));
      await waitFor(() => screen.getByTestId('combat-panel-round'));
      await waitFor(() => screen.getByTestId('combat-panel-equipment-button'));

      fireEvent.click(screen.getByTestId('combat-panel-equipment-button'));

      await waitFor(() => screen.getByTestId('equipment-popover'));
      screen.getByText(/14/);
    });
  });
});

describe("the run's end (rpg-project#268)", () => {
  it('an ended beat raises the outcome overlay on free roam — headline by declared key, and Leave exits', async () => {
    hoisted.atlasResult.atlas = pointyAtlas();
    hoisted.atlasResult.loading = false;
    hoisted.whereResult.position = { x: 1, y: 0 };
    hoisted.whereResult.loading = false;
    hoisted.streamEventsFn.mockReturnValue(
      fakeStream([
        event(EventKind.ENDED, {
          case: 'ended',
          value: { ending: 'boss-down' } as never,
        }),
      ])
    );

    const onBack = vi.fn();
    render(
      <SessionEncounterView
        sessionId="enc-1"
        characterId="char-1"
        playerId="player-1"
        onBack={onBack}
      />
    );

    // The overlay lands with the canvas still mounted underneath — the run
    // ends in free roam (ruling rpg-project#269 §6.6), it does not unmount
    // the world.
    await waitFor(() => screen.getByText('The tomb is cleared.'));
    screen.getByTestId('session-canvas');

    fireEvent.click(screen.getByRole('button', { name: /leave/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it('an ENDED kind with no typed body still ends the run, with the plain headline', async () => {
    hoisted.atlasResult.atlas = pointyAtlas();
    hoisted.atlasResult.loading = false;
    hoisted.whereResult.position = { x: 1, y: 0 };
    hoisted.whereResult.loading = false;
    hoisted.streamEventsFn.mockReturnValue(
      fakeStream([event(EventKind.ENDED)])
    );

    render(
      <SessionEncounterView
        sessionId="enc-1"
        characterId="char-1"
        playerId="player-1"
        onBack={noop}
      />
    );

    await waitFor(() => screen.getByText('The run has ended.'));
  });
});
