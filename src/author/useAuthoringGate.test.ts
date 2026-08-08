import { Code, ConnectError } from '@connectrpc/connect';
import type { PutDungeonResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  putDungeonFn: vi.fn<() => Promise<PutDungeonResponse>>(),
}));

vi.mock('@/api/client', () => ({
  authoringClient: { putDungeon: hoisted.putDungeonFn },
}));

// `useAuthoringGate` keeps a module-level cache of the last terminal
// (live/gate-off) result — `vi.resetModules()` + a fresh dynamic import
// per test gives each test its own clean cache, same isolation a fresh
// page load would give the real app.
beforeEach(() => {
  hoisted.putDungeonFn.mockReset();
  vi.resetModules();
});

describe('useAuthoringGate — probe classification', () => {
  it('Unimplemented -> gate-off (button hidden)', async () => {
    hoisted.putDungeonFn.mockRejectedValue(
      new ConnectError('unknown service', Code.Unimplemented)
    );
    const { useAuthoringGate } = await import('./useAuthoringGate');

    const { result } = renderHook(() => useAuthoringGate());

    await waitFor(() => expect(result.current.state).toBe('gate-off'));
  });

  it('Unavailable -> a DISTINCT unreachable state, not collapsed into gate-off', async () => {
    hoisted.putDungeonFn.mockRejectedValue(
      new ConnectError('failed to fetch', Code.Unavailable)
    );
    const { useAuthoringGate } = await import('./useAuthoringGate');

    const { result } = renderHook(() => useAuthoringGate());

    await waitFor(() => expect(result.current.state).toBe('unreachable'));
    expect(result.current.state).not.toBe('gate-off');
  });

  it('a non-ConnectError throw (raw network failure) is also treated as unreachable', async () => {
    hoisted.putDungeonFn.mockRejectedValue(new TypeError('Failed to fetch'));
    const { useAuthoringGate } = await import('./useAuthoringGate');

    const { result } = renderHook(() => useAuthoringGate());

    await waitFor(() => expect(result.current.state).toBe('unreachable'));
  });

  it('Unknown -> unreachable (real bug fix, this unit, rpg-project#194)', async () => {
    // Live-verified against an actually-unreachable rpg-api (this unit's
    // own gate-proof step): connect-web wraps a genuine connection
    // failure as ConnectError(Code.Unknown) — ConnectError.from()'s own
    // default — never Code.Unavailable. Before this fix, Unknown fell
    // through to 'live', the opposite of what an unreachable server
    // should report — the SAME latent bug existed in
    // usePutDungeonPreview.ts's own classifyFailure (fixed alongside
    // this).
    hoisted.putDungeonFn.mockRejectedValue(
      new ConnectError('Failed to fetch', Code.Unknown)
    );
    const { useAuthoringGate } = await import('./useAuthoringGate');

    const { result } = renderHook(() => useAuthoringGate());

    await waitFor(() => expect(result.current.state).toBe('unreachable'));
  });

  it("InvalidArgument (the probe's own expected outcome) -> live", async () => {
    hoisted.putDungeonFn.mockRejectedValue(
      new ConnectError('key must match [a-z0-9-]+', Code.InvalidArgument)
    );
    const { useAuthoringGate } = await import('./useAuthoringGate');

    const { result } = renderHook(() => useAuthoringGate());

    await waitFor(() => expect(result.current.state).toBe('live'));
  });

  it('retry() re-probes and can recover from unreachable to live', async () => {
    hoisted.putDungeonFn.mockRejectedValueOnce(
      new ConnectError('failed to fetch', Code.Unavailable)
    );
    const { useAuthoringGate } = await import('./useAuthoringGate');

    const { result } = renderHook(() => useAuthoringGate());
    await waitFor(() => expect(result.current.state).toBe('unreachable'));

    hoisted.putDungeonFn.mockRejectedValueOnce(
      new ConnectError('key must match [a-z0-9-]+', Code.InvalidArgument)
    );
    result.current.retry();

    await waitFor(() => expect(result.current.state).toBe('live'));
  });
});

describe('useAuthoringGate — per-session caching', () => {
  it('caches a live result — a second mount reuses it without re-probing', async () => {
    hoisted.putDungeonFn.mockRejectedValue(
      new ConnectError('key must match [a-z0-9-]+', Code.InvalidArgument)
    );
    const { useAuthoringGate } = await import('./useAuthoringGate');

    const first = renderHook(() => useAuthoringGate());
    await waitFor(() => expect(first.result.current.state).toBe('live'));
    expect(hoisted.putDungeonFn).toHaveBeenCalledOnce();

    const second = renderHook(() => useAuthoringGate());
    // Synchronously live on first render — the cache, not a re-probe.
    expect(second.result.current.state).toBe('live');
    expect(hoisted.putDungeonFn).toHaveBeenCalledOnce();
  });

  it('caches a gate-off result the same way', async () => {
    hoisted.putDungeonFn.mockRejectedValue(
      new ConnectError('unknown service', Code.Unimplemented)
    );
    const { useAuthoringGate } = await import('./useAuthoringGate');

    const first = renderHook(() => useAuthoringGate());
    await waitFor(() => expect(first.result.current.state).toBe('gate-off'));

    const second = renderHook(() => useAuthoringGate());
    expect(second.result.current.state).toBe('gate-off');
    expect(hoisted.putDungeonFn).toHaveBeenCalledOnce();
  });

  it('does NOT cache unreachable — a second mount re-probes on its own', async () => {
    hoisted.putDungeonFn.mockRejectedValue(
      new ConnectError('failed to fetch', Code.Unavailable)
    );
    const { useAuthoringGate } = await import('./useAuthoringGate');

    const first = renderHook(() => useAuthoringGate());
    await waitFor(() => expect(first.result.current.state).toBe('unreachable'));
    expect(hoisted.putDungeonFn).toHaveBeenCalledOnce();

    const second = renderHook(() => useAuthoringGate());
    await waitFor(() =>
      expect(second.result.current.state).toBe('unreachable')
    );
    expect(hoisted.putDungeonFn).toHaveBeenCalledTimes(2);
  });
});
