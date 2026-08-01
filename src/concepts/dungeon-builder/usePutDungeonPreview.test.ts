import { Code, ConnectError } from '@connectrpc/connect';
import type { PutDungeonResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  putDungeonFn: vi.fn<() => Promise<PutDungeonResponse>>(),
}));

vi.mock('@/api/client', () => ({
  authoringClient: { putDungeon: hoisted.putDungeonFn },
}));

// Import AFTER vi.mock so the mock is applied.
import { parseDungeon } from './dungeonYaml';
import { SHOWCASE_YAML } from './fixtures';
import { usePutDungeonPreview } from './usePutDungeonPreview';

const { doc } = parseDungeon(SHOWCASE_YAML);

beforeEach(() => {
  hoisted.putDungeonFn.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('usePutDungeonPreview — mount-time probe semantics (plan.md S4a)', () => {
  it('Unimplemented -> gate-off, falls back to the local/fixture floor plan', async () => {
    hoisted.putDungeonFn.mockRejectedValue(
      new ConnectError('unknown service', Code.Unimplemented)
    );

    const { result } = renderHook(() =>
      usePutDungeonPreview(doc, SHOWCASE_YAML)
    );

    await waitFor(() => expect(result.current.serverState).toBe('gate-off'));
    expect(result.current.floorPlan).not.toBeNull();
    expect(result.current.floorPlan?.rooms.map((r) => r.startColumn)).toEqual([
      0, 7, 22,
    ]);
    // Only the probe call happened — gate-off never attempts a real edit call.
    expect(hoisted.putDungeonFn).toHaveBeenCalledOnce();
  });

  it('Unavailable -> a DISTINCT unreachable state, not collapsed into gate-off', async () => {
    hoisted.putDungeonFn.mockRejectedValue(
      new ConnectError('failed to fetch', Code.Unavailable)
    );

    const { result } = renderHook(() =>
      usePutDungeonPreview(doc, SHOWCASE_YAML)
    );

    await waitFor(() => expect(result.current.serverState).toBe('unreachable'));
    expect(result.current.serverState).not.toBe('gate-off');
    // Fixtures-mode fallback still renders something — never a blank board.
    expect(result.current.floorPlan).not.toBeNull();
  });

  it('a non-ConnectError throw (raw network failure) is also treated as unreachable', async () => {
    hoisted.putDungeonFn.mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(() =>
      usePutDungeonPreview(doc, SHOWCASE_YAML)
    );

    await waitFor(() => expect(result.current.serverState).toBe('unreachable'));
  });

  it("InvalidArgument (the probe's own expected outcome) -> live mode", async () => {
    hoisted.putDungeonFn.mockRejectedValue(
      new ConnectError('key must match [a-z0-9-]+', Code.InvalidArgument)
    );

    const { result } = renderHook(() =>
      usePutDungeonPreview(doc, SHOWCASE_YAML)
    );

    await waitFor(() => expect(result.current.serverState).toBe('live'));
  });

  it('retryProbe re-probes and can recover from unreachable to live', async () => {
    hoisted.putDungeonFn.mockRejectedValueOnce(
      new ConnectError('failed to fetch', Code.Unavailable)
    );
    const { result } = renderHook(() =>
      usePutDungeonPreview(doc, SHOWCASE_YAML)
    );
    await waitFor(() => expect(result.current.serverState).toBe('unreachable'));

    hoisted.putDungeonFn.mockRejectedValueOnce(
      new ConnectError('bad key', Code.InvalidArgument)
    );
    result.current.retryProbe();

    await waitFor(() => expect(result.current.serverState).toBe('live'));
  });
});

describe('usePutDungeonPreview — live mode per-edit preview', () => {
  it('debounces edits and renders the live response on success', async () => {
    hoisted.putDungeonFn.mockRejectedValueOnce(
      new ConnectError('bad key', Code.InvalidArgument) // probe
    );
    const { result, rerender } = renderHook(
      ({ text }) => usePutDungeonPreview(doc, text),
      { initialProps: { text: SHOWCASE_YAML } }
    );
    await waitFor(() => expect(result.current.serverState).toBe('live'));

    hoisted.putDungeonFn.mockResolvedValueOnce({
      success: true,
      fieldErrors: [],
      floorPlan: {
        rooms: [],
        connectors: [],
        height: 8,
        doorRow: 4,
        entrance: undefined,
      },
    } as unknown as PutDungeonResponse);

    rerender({ text: SHOWCASE_YAML + '\n' });

    await waitFor(() => expect(result.current.floorPlan?.rooms).toEqual([]), {
      timeout: 2000,
    });
  });

  it('success:false surfaces field_errors and keeps the board on the last-good plan', async () => {
    hoisted.putDungeonFn.mockRejectedValueOnce(
      new ConnectError('bad key', Code.InvalidArgument) // probe
    );
    const { result, rerender } = renderHook(
      ({ text }) => usePutDungeonPreview(doc, text),
      { initialProps: { text: SHOWCASE_YAML } }
    );
    await waitFor(() => expect(result.current.serverState).toBe('live'));
    const before = result.current.floorPlan;

    hoisted.putDungeonFn.mockResolvedValueOnce({
      success: false,
      fieldErrors: [
        {
          field: '',
          message: 'room "shrine": place "..." is on the reserved row',
        },
      ],
      floorPlan: undefined,
    } as unknown as PutDungeonResponse);

    rerender({ text: SHOWCASE_YAML + '\n' });

    await waitFor(() => expect(result.current.fieldErrors).toHaveLength(1), {
      timeout: 2000,
    });
    expect(result.current.floorPlan).toEqual(before); // unchanged, not blanked
  });

  it('a live InvalidArgument on an edit call is a request error, never field_errors', async () => {
    hoisted.putDungeonFn.mockRejectedValueOnce(
      new ConnectError('bad key', Code.InvalidArgument) // probe
    );
    const { result, rerender } = renderHook(
      ({ text }) => usePutDungeonPreview(doc, text),
      { initialProps: { text: SHOWCASE_YAML } }
    );
    await waitFor(() => expect(result.current.serverState).toBe('live'));

    hoisted.putDungeonFn.mockRejectedValueOnce(
      new ConnectError('key/yaml mismatch', Code.InvalidArgument)
    );
    rerender({ text: SHOWCASE_YAML + '\n' });

    await waitFor(() => expect(result.current.requestError).not.toBeNull(), {
      timeout: 2000,
    });
    expect(result.current.fieldErrors).toEqual([]);
  });
});
