import type { EncounterEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeStream, type FakeStream } from './fakeEncounterStream2';

function makeEvent(caseName: string, value: unknown): EncounterEvent {
  return { event: { case: caseName, value } } as unknown as EncounterEvent;
}

// vi.hoisted allows the mock factory to use these refs even though hoisting
// runs the factory before regular imports. The wrapper object is mutable so
// beforeEach can swap the underlying stream.
const hoisted = vi.hoisted(() => {
  return {
    fakeRef: { current: null as FakeStream | null },
  };
});

vi.mock('./client', () => {
  return {
    encounterClientV2: {
      streamEncounter: vi.fn(() => {
        if (!hoisted.fakeRef.current) {
          throw new Error(
            'fakeRef.current is null — test forgot to set it in beforeEach'
          );
        }
        return hoisted.fakeRef.current.iterator;
      }),
    },
  };
});

// Import the hook AFTER vi.mock so the mock is applied
import { useEncounterStream2 } from './useEncounterStream2';

let fake: FakeStream;

beforeEach(() => {
  fake = createFakeStream();
  hoisted.fakeRef.current = fake;
});

afterEach(() => {
  hoisted.fakeRef.current = null;
});

describe('useEncounterStream2', () => {
  it('transitions to connected after the first SnapshotDelivered', async () => {
    const onSnapshotDelivered = vi.fn();
    const { result } = renderHook(() =>
      useEncounterStream2('enc-1', 'alice', { onSnapshotDelivered })
    );

    expect(result.current.connectionState).toBe('connecting');

    act(() => {
      fake.push(makeEvent('snapshotDelivered', { encounter: undefined }));
    });

    await waitFor(() => {
      expect(result.current.connectionState).toBe('connected');
    });
    expect(onSnapshotDelivered).toHaveBeenCalledTimes(1);
  });

  it('dispatches subsequent events through their typed callbacks', async () => {
    const onEntityMoved = vi.fn();
    const { result } = renderHook(() =>
      useEncounterStream2('enc-1', 'alice', { onEntityMoved })
    );

    act(() => {
      fake.push(makeEvent('snapshotDelivered', {}));
    });
    await waitFor(() =>
      expect(result.current.connectionState).toBe('connected')
    );

    act(() => {
      fake.push(
        makeEvent('entityMoved', {
          entityId: 'alice',
          actualPath: [{ x: 0, y: 0, z: 0 }],
        })
      );
    });
    await waitFor(() => {
      expect(onEntityMoved).toHaveBeenCalledTimes(1);
    });
  });

  it('does not transition to connected before SnapshotDelivered arrives', async () => {
    const { result } = renderHook(() =>
      useEncounterStream2('enc-1', 'alice', {})
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.connectionState).toBe('connecting');
  });

  it('logs and continues on unknown event cases (no tear-down)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onEntityMoved = vi.fn();
    const { result } = renderHook(() =>
      useEncounterStream2('enc-1', 'alice', { onEntityMoved })
    );

    act(() => {
      fake.push(makeEvent('snapshotDelivered', {}));
      fake.push(makeEvent('totallyUnknownCase', {}));
      fake.push(makeEvent('entityMoved', { entityId: 'a', actualPath: [] }));
    });

    await waitFor(() => {
      expect(onEntityMoved).toHaveBeenCalledTimes(1);
      expect(result.current.connectionState).toBe('connected');
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('aborts cleanly on unmount', () => {
    const { unmount, result } = renderHook(() =>
      useEncounterStream2('enc-1', 'alice', {})
    );
    expect(result.current.connectionState).toBe('connecting');
    unmount();
  });

  it('handles encounterId === null by staying idle', () => {
    const { result } = renderHook(() => useEncounterStream2(null, 'alice', {}));
    expect(result.current.connectionState).toBe('idle');
  });

  it('reconnects with exponential backoff on stream error', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useEncounterStream2('enc-1', 'alice', {})
    );

    act(() => {
      fake.push(makeEvent('snapshotDelivered', {}));
    });
    await vi.waitFor(() =>
      expect(result.current.connectionState).toBe('connected')
    );

    act(() => {
      fake.error(new Error('connection lost'));
    });
    await vi.waitFor(() =>
      expect(result.current.connectionState).toBe('disconnected')
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    await vi.waitFor(() =>
      expect(result.current.connectionState).toBe('connecting')
    );

    vi.useRealTimers();
  });
});
