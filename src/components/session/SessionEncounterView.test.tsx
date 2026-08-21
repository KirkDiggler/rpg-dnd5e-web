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
 * `useSessionWalk`/`useSessionEventStream` run FOR REAL here (only
 * `sessionClient.move`/`.streamEvents` are mocked, at the `@/api/client`
 * boundary — the same boundary those two hooks' own dedicated test files
 * mock) rather than being replaced wholesale: this file is what proves
 * the click -> pathfind -> Move RPC -> animation-prop -> MOVED-event ->
 * refetch chain is actually WIRED, not just that each link works in
 * isolation. The pure mechanics of each link (pathfinding, the RPC
 * orchestration's busy/reconcile state machine, the stream subscription
 * lifecycle) have their own focused coverage in atlasPath.test.ts,
 * useSessionWalk.test.ts and useSessionEventStream.test.ts.
 */
import {
  EventKind,
  type Event as SessionEvent,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  GridKind,
  HexLayout,
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
});
