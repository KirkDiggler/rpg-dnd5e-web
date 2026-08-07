import { Code, ConnectError } from '@connectrpc/connect';
import type { PutDungeonResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  putDungeonFn:
    vi.fn<
      (req: {
        key: string;
        yaml: string;
        validateOnly: boolean;
      }) => Promise<PutDungeonResponse>
    >(),
}));

vi.mock('@/api/client', () => ({
  authoringClient: { putDungeon: hoisted.putDungeonFn },
}));

// Import AFTER vi.mock so the mock is applied (same pattern
// usePutDungeonPreview.test.ts uses).
import { useSaveDungeon } from './useSaveDungeon';

beforeEach(() => {
  hoisted.putDungeonFn.mockReset();
});

describe('useSaveDungeon', () => {
  it('starts idle with no saved key/errors', () => {
    const { result } = renderHook(() => useSaveDungeon());
    expect(result.current.state).toBe('idle');
    expect(result.current.savedKey).toBeNull();
    expect(result.current.fieldErrors).toEqual([]);
    expect(result.current.errorMessage).toBeNull();
  });

  it('goes to "saving" synchronously the moment save() is called, before the request resolves', () => {
    hoisted.putDungeonFn.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useSaveDungeon());

    act(() => {
      result.current.save('my-dungeon', 'version: 1\nkey: my-dungeon\n');
    });

    expect(result.current.state).toBe('saving');
  });

  it('success:true -> "saved", savedKey echoes the REQUEST key, not anything off the response (PutDungeonResponse has no key field)', async () => {
    hoisted.putDungeonFn.mockResolvedValue({
      success: true,
      fieldErrors: [],
    } as unknown as PutDungeonResponse);
    const { result } = renderHook(() => useSaveDungeon());

    act(() => {
      result.current.save('shrine-hall', 'version: 1\nkey: shrine-hall\n');
    });

    await waitFor(() => expect(result.current.state).toBe('saved'));
    expect(result.current.savedKey).toBe('shrine-hall');
    expect(result.current.errorMessage).toBeNull();

    // The request itself: a real, explicit write (validate_only: false),
    // not the live preview's debounced validate_only: true read.
    expect(hoisted.putDungeonFn).toHaveBeenCalledOnce();
    const req = hoisted.putDungeonFn.mock.calls[0][0];
    expect(req.key).toBe('shrine-hall');
    expect(req.validateOnly).toBe(false);
  });

  it('success:false -> "invalid", surfaces the real server-side field errors', async () => {
    hoisted.putDungeonFn.mockResolvedValue({
      success: false,
      fieldErrors: [{ field: '', message: 'boss room must declare a boss' }],
    } as unknown as PutDungeonResponse);
    const { result } = renderHook(() => useSaveDungeon());

    act(() => {
      result.current.save('bad-key', 'version: 1\nkey: bad-key\n');
    });

    await waitFor(() => expect(result.current.state).toBe('invalid'));
    expect(result.current.fieldErrors).toEqual([
      { field: '', message: 'boss room must declare a boss' },
    ]);
    expect(result.current.savedKey).toBeNull(); // never set on a rejected save
  });

  it('a thrown ConnectError -> "error", errorMessage is the connect error message (transport/gate-off, not author feedback)', async () => {
    hoisted.putDungeonFn.mockRejectedValue(
      new ConnectError(
        'unknown service dnd5e.api.authoring.v1alpha1.AuthoringService',
        Code.Unimplemented
      )
    );
    const { result } = renderHook(() => useSaveDungeon());

    act(() => {
      result.current.save('any-key', 'version: 1\nkey: any-key\n');
    });

    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.errorMessage).toContain('unknown service');
    expect(result.current.fieldErrors).toEqual([]);
  });

  it('a non-ConnectError throw (raw network failure) -> "error" with the generic fallback message', async () => {
    hoisted.putDungeonFn.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useSaveDungeon());

    act(() => {
      result.current.save('any-key', 'version: 1\nkey: any-key\n');
    });

    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.errorMessage).toBe('PutDungeon request failed');
  });

  it('a fresh save() clears a prior error/invalid result before the new request resolves', async () => {
    hoisted.putDungeonFn.mockRejectedValueOnce(
      new TypeError('Failed to fetch')
    );
    const { result } = renderHook(() => useSaveDungeon());

    act(() => {
      result.current.save('key-a', 'version: 1\nkey: key-a\n');
    });
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.errorMessage).not.toBeNull();

    hoisted.putDungeonFn.mockReturnValueOnce(new Promise(() => {})); // never resolves
    act(() => {
      result.current.save('key-b', 'version: 1\nkey: key-b\n');
    });

    expect(result.current.state).toBe('saving');
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.fieldErrors).toEqual([]);
  });
});
