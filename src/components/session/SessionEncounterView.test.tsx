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
  GridKind,
  HexLayout,
  Slot,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
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
  getViewFn: vi.fn(),
  affordFn: vi.fn(),
  turnFn: vi.fn(),
  attackFn: vi.fn(),
  endTurnFn: vi.fn(),
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
    getView: hoisted.getViewFn,
    afford: hoisted.affordFn,
    turn: hoisted.turnFn,
    attack: hoisted.attackFn,
    endTurn: hoisted.endTurnFn,
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
  });
  hoisted.attackFn.mockReset();
  hoisted.endTurnFn.mockReset();
});

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

  it('subscribes StreamEvents with the session/member and refetches GetWhere on a MOVED event, ignoring other kinds', async () => {
    hoisted.atlasResult.atlas = pointyAtlas();
    hoisted.atlasResult.loading = false;
    hoisted.whereResult.position = { x: 0, y: 0 };
    hoisted.whereResult.loading = false;
    hoisted.streamEventsFn.mockReturnValue(
      fakeStream([
        { kind: EventKind.STRUCK } as SessionEvent,
        { kind: EventKind.MOVED } as SessionEvent,
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
            seen: { position: { x: 10, y: 3 } },
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
          monsterRefId: 'skeleton',
          // positionBridge.positionToCube(q=10, r=3): x=q, y=-q-r, z=r
          position: { x: 10, y: -13, z: 3 },
          remembered: false,
        },
      ]);
    });

    it('a MOVED stream event (e.g. the skeleton itself moving) also refetches GetView, not just GetWhere', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.streamEventsFn.mockReturnValue(
        fakeStream([{ kind: EventKind.MOVED } as SessionEvent])
      );

      // A factory, not a shared element: React bails out of re-rendering
      // when handed the identical element object.
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

      // The view follows where: exactly ONE GetView for the initial
      // wherePosition (useSessionView has no mount fetch of its own).
      await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(1));

      // MOVED -> GetWhere refetch requested ...
      await waitFor(() =>
        expect(hoisted.whereResult.refetch).toHaveBeenCalledTimes(1)
      );
      // ... but the mocked useSessionWhere cannot land a new position by
      // itself, so nothing else has fired yet. This is what makes the
      // assertion below discriminating: the count must MOVE from 1 to 2
      // only once the refetched position lands.
      expect(hoisted.getViewFn).toHaveBeenCalledTimes(1);

      // Simulate the GetWhere refetch landing: a FRESH position reference
      // (useSessionWhere always sets a new object, even for an unchanged
      // cell) and the re-render it causes.
      hoisted.whereResult.position = { x: 0, y: 0 };
      rerender(view());

      await waitFor(() => expect(hoisted.getViewFn).toHaveBeenCalledTimes(2));
    });

    it('a fight-lock Move rejection (session.ErrInBubble) shows the friendly status line, not raw RPC text', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.moveFn.mockRejectedValue(
        new ConnectError('member is in a fight', Code.FailedPrecondition)
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

      await waitFor(() => screen.getByText(/in a fight — movement is locked/i));
      // fightLocked (rpg-dnd5e-web#762 slice 4) flows to SessionCanvas from
      // the SAME useSessionWalk state the friendly status line reads —
      // the move indicator reuses it rather than re-parsing moveError.
      expect(hoisted.lastCanvasProps.current!.fightLocked).toBe(true);
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
      expect(hoisted.lastCanvasProps.current!.fightLocked).toBe(false);
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
  describe('combat panel wiring (rpg-dnd5e-web#762 — "grow the HUD into a panel")', () => {
    // No jest-dom matchers in this repo's vitest config (see
    // TurnHud.test.tsx's own note) — disabled state reads the plain DOM
    // property.
    function isDisabled(el: HTMLElement): boolean {
      return (el as HTMLButtonElement).disabled;
    }

    /** Atlas/position ready, Turn on the fight clock with `char-1` (the
     * local player) active and an affordable Attack declaration — the
     * "your turn, ready to swing" baseline most of these tests start
     * from. */
    function readyOnYourTurn(
      overrides: {
        active?: string;
        order?: string[];
        round?: number;
        attackAffordable?: boolean;
        shortfall?: string;
      } = {}
    ) {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.turnFn.mockResolvedValue({
        clock: ClockKind.TURN,
        active: overrides.active ?? 'char-1',
        round: overrides.round ?? 1,
        order: overrides.order ?? ['char-1', 'skeleton-1'],
      });
      hoisted.affordFn.mockResolvedValue({
        clock: ClockKind.TURN,
        declarations: [
          {
            verb: Verb.ATTACK,
            slot: Slot.ACTION,
            affordable: overrides.attackAffordable ?? true,
            shortfall: overrides.shortfall ?? '',
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
            affordable: true,
            shortfall: '',
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

    it('on the turn clock, renders round + order chips (active highlighted, you marked) + the action shape lit + "Attack — ready"', async () => {
      readyOnYourTurn({ order: ['char-1', 'skeleton-1'], round: 2 });

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

      const chips = screen.getAllByTestId('combat-panel-order-chip');
      expect(chips).toHaveLength(2);
      expect(chips[0]!.textContent).toContain('char-1');
      expect(chips[0]!.getAttribute('data-active')).toBe('true');
      expect(chips[0]!.getAttribute('data-you')).toBe('true');
      expect(chips[1]!.textContent).toContain('skeleton-1');
      expect(chips[1]!.getAttribute('data-active')).toBe('false');
      expect(chips[1]!.getAttribute('data-you')).toBe('false');

      expect(
        screen.getByTestId('turn-hud-shape-action').getAttribute('data-lit')
      ).toBe('true');
      screen.getByText(/attack — ready/i);
      expect(screen.queryByTestId('combat-panel-waiting-on')).toBeNull();
    });

    it('when it is NOT your turn: shapes read dim, End Turn disabled, and a "Waiting on skeleton-1." line — even though Afford still reports the action affordable', async () => {
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

      screen.getByText(/waiting on skeleton-1/i);
      expect(
        screen.getByTestId('turn-hud-shape-action').getAttribute('data-lit')
      ).toBe('false');
      expect(
        isDisabled(screen.getByTestId('combat-panel-end-turn-button'))
      ).toBe(true);
      expect(isDisabled(screen.getByTestId('combat-panel-attack-button'))).toBe(
        true
      );
      expect(screen.getByTestId('combat-panel-attack-button').title).toMatch(
        /not your turn/i
      );
    });

    it('Attack is disabled with the Afford shortfall verbatim when unaffordable, even on your turn with a target picked', async () => {
      readyOnYourTurn({
        attackAffordable: false,
        shortfall: 'action: 1 needed, 0 left',
      });
      hoisted.getViewFn.mockResolvedValue({
        sightings: [
          {
            subject: 'skeleton-1',
            payload: new Uint8Array(),
            channel: 'sight',
            at: 1n,
            currentVia: ['sight'],
            status: 'live',
            seen: { position: { x: 5, y: 0 } },
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
        expect(hoisted.lastCanvasProps.current?.otherMembers).toHaveLength(1)
      );

      act(() => {
        hoisted.lastCanvasProps.current!.onEntityClick!('skeleton-1');
      });
      await waitFor(() => screen.getByText(/target: skeleton-1/i));

      expect(isDisabled(screen.getByTestId('combat-panel-attack-button'))).toBe(
        true
      );
      expect(screen.getByTestId('combat-panel-attack-button').title).toBe(
        'action: 1 needed, 0 left'
      );
    });

    it('Attack is disabled with "Pick a target." when affordable and your turn but nothing selected yet', async () => {
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
      await waitFor(() => screen.getByTestId('combat-panel-attack-button'));

      expect(isDisabled(screen.getByTestId('combat-panel-attack-button'))).toBe(
        true
      );
      expect(screen.getByTestId('combat-panel-attack-button').title).toMatch(
        /pick a target/i
      );
      screen.getByText(/no target selected/i);
    });

    it("SessionCanvas enters 'target' mode exactly when it is your turn and Attack is affordable, and onEntityClick is wired", async () => {
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
        expect(hoisted.lastCanvasProps.current?.mode).toBe('target')
      );
      expect(hoisted.lastCanvasProps.current?.onEntityClick).toBeTypeOf(
        'function'
      );
    });

    it('clicking an entity in target mode selects it, enabling Attack once affordable + your turn + a target', async () => {
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
      await waitFor(() => screen.getByTestId('combat-panel-attack-button'));
      expect(isDisabled(screen.getByTestId('combat-panel-attack-button'))).toBe(
        true
      );

      act(() => {
        hoisted.lastCanvasProps.current!.onEntityClick!('skeleton-1');
      });

      await waitFor(() => screen.getByText(/target: skeleton-1/i));
      await waitFor(() =>
        expect(
          isDisabled(screen.getByTestId('combat-panel-attack-button'))
        ).toBe(false)
      );
    });

    it('clicking Attack dispatches the RPC with attacker/target, shows the hit beat line, and refetches Afford + Turn', async () => {
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
      await waitFor(() =>
        expect(
          isDisabled(screen.getByTestId('combat-panel-attack-button'))
        ).toBe(false)
      );

      fireEvent.click(screen.getByTestId('combat-panel-attack-button'));

      expect(hoisted.attackFn).toHaveBeenCalledWith({
        session: 'enc-1',
        attacker: 'char-1',
        target: 'skeleton-1',
      });
      await waitFor(() =>
        screen.getByText(/you hit skeleton-1: 17 vs ac 13 for 6/i)
      );
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2));
    });

    it('a missed Attack shows the miss beat line, no damage number', async () => {
      readyOnYourTurn();
      hoisted.attackFn.mockResolvedValue({
        roll: 4,
        total: 7,
        against: 13,
        hit: false,
        critical: false,
        damage: 0,
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

      act(() => {
        hoisted.lastCanvasProps.current!.onEntityClick!('skeleton-1');
      });
      await waitFor(() =>
        expect(
          isDisabled(screen.getByTestId('combat-panel-attack-button'))
        ).toBe(false)
      );
      fireEvent.click(screen.getByTestId('combat-panel-attack-button'));

      await waitFor(() =>
        screen.getByText(/you missed skeleton-1: 4 vs ac 13/i)
      );
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
      });
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2));
    });

    it('clicking Attack/End Turn while disabled never dispatches the RPC', async () => {
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
          isDisabled(screen.getByTestId('combat-panel-attack-button'))
        ).toBe(true)
      );

      fireEvent.click(screen.getByTestId('combat-panel-attack-button'));
      fireEvent.click(screen.getByTestId('combat-panel-end-turn-button'));

      expect(hoisted.attackFn).not.toHaveBeenCalled();
      expect(hoisted.endTurnFn).not.toHaveBeenCalled();
    });

    it("a DOWNED stream event attributes a beat line to the currently selected target (typed-data-only — see useCombatPanel's own doc comment)", async () => {
      readyOnYourTurn();
      // A gated stream: the DOWNED event only yields once this test
      // releases it, so it can be timed to arrive AFTER target selection
      // (the realistic order — the player targets, then something dies)
      // rather than racing the mount effect (fakeStream's own events
      // would otherwise land before there's any chance to interact).
      let releaseDowned: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        releaseDowned = resolve;
      });
      hoisted.streamEventsFn.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          await gate;
          yield { kind: EventKind.DOWNED } as SessionEvent;
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

      act(() => {
        hoisted.lastCanvasProps.current!.onEntityClick!('skeleton-1');
      });
      await waitFor(() => screen.getByText(/target: skeleton-1/i));

      await act(async () => {
        releaseDowned();
        await Promise.resolve();
      });

      await waitFor(() => screen.getByTestId('combat-panel-beat-line'));
      screen.getByText(/skeleton-1 is downed/i);
    });

    it('a DOWNED stream event with no target ever selected shows no beat line (nothing to attribute it to)', async () => {
      readyOnYourTurn();
      hoisted.streamEventsFn.mockReturnValue(
        fakeStream([{ kind: EventKind.DOWNED } as SessionEvent])
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
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(2)); // bootstrap + DOWNED refetch

      expect(screen.queryByTestId('combat-panel-beat-line')).toBeNull();
    });

    it('refetches Afford AND Turn on FIGHT_STARTED/FIGHT_ENDED/TURN_ENDED', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.streamEventsFn.mockReturnValue(
        fakeStream([
          { kind: EventKind.FIGHT_STARTED } as SessionEvent,
          { kind: EventKind.FIGHT_ENDED } as SessionEvent,
          { kind: EventKind.TURN_ENDED } as SessionEvent,
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

    it('refetches Afford but NOT Turn on STRUCK/MISSED/DOWNED/ENDED — those change what you can pay, never whose turn it is', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.streamEventsFn.mockReturnValue(
        fakeStream([
          { kind: EventKind.STRUCK } as SessionEvent,
          { kind: EventKind.MISSED } as SessionEvent,
          { kind: EventKind.DOWNED } as SessionEvent,
          { kind: EventKind.ENDED } as SessionEvent,
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

      // 1 mount-bootstrap call + 4 listed kinds.
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(5));
      // Turn only ever gets its own mount-bootstrap call — none of these
      // four kinds are in TURN_REFRESH_EVENT_KINDS.
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(1));
    });

    it('a MOVED stream event refetches neither Afford nor Turn', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.streamEventsFn.mockReturnValue(
        fakeStream([{ kind: EventKind.MOVED } as SessionEvent])
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

    it('a fight-lock Move rejection also refetches Afford AND Turn — without it the panel would keep showing free-roam', async () => {
      hoisted.atlasResult.atlas = pointyAtlas();
      hoisted.atlasResult.loading = false;
      hoisted.whereResult.position = { x: 0, y: 0 };
      hoisted.whereResult.loading = false;
      hoisted.moveFn.mockRejectedValue(
        new ConnectError('member is in a fight', Code.FailedPrecondition)
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

      await waitFor(() => screen.getByText(/in a fight — movement is locked/i));
      await waitFor(() => expect(hoisted.affordFn).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(hoisted.turnFn).toHaveBeenCalledTimes(2));
    });
  });
});
