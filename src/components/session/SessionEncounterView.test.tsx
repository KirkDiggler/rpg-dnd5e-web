/**
 * SessionEncounterView tests — data orchestration and gating only.
 *
 * `SessionCanvas` wraps a real Three.js `<Canvas>`, which needs WebGL that
 * jsdom cannot provide — same reasoning `EncounterMap.test.tsx`'s own doc
 * comment gives for stubbing `HexGrid` rather than rendering it. This
 * mocks `SessionCanvas` and asserts the PROPS it would have received,
 * which is exactly the seam between "did we read the wire correctly" and
 * "can Three.js draw it" that this file owns. `SessionCanvas.test.tsx`
 * covers the other side with a real (mocked-GLB) R3F render.
 */
import {
  GridKind,
  HexLayout,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

beforeEach(() => {
  hoisted.lastCanvasProps.current = null;
  hoisted.atlasResult.atlas = null;
  hoisted.atlasResult.loading = true;
  hoisted.atlasResult.error = null;
  hoisted.whereResult.position = null;
  hoisted.whereResult.loading = true;
  hoisted.whereResult.error = null;
  hoisted.getCharacterFn.mockReset();
  hoisted.getCharacterFn.mockResolvedValue({
    character: { name: 'Toolkit Sandbox Fighter', class: 5 },
  });
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
});
