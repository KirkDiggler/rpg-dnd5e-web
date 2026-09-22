/**
 * Focused regressions for the authoring RPC hooks' request fencing
 * (plan §2): a stale save response — superseded by a newer save, or
 * arriving after unmount — must not replace current error/saved state or
 * report success, and a preview response after unmount or supersession
 * must not write state. Deferred promises make the interleavings exact.
 */
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AuthoringClient } from './authoringRpc';
import { usePutDungeonPreview, useSaveDungeon } from './authoringRpc';

function makeDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

interface PutAnswer {
  errors: Array<{ path: string; message: string }>;
  atlas?: GetAtlasResponse | null;
}

function okAnswer(): PutAnswer {
  return { errors: [], atlas: null };
}

/** A fake AuthoringService whose putDungeon hands out one deferred answer
 * per call, in order, recording the exact requests. */
function deferredClient(answers: Deferred<PutAnswer>[]) {
  const requests: Array<{ key: string; yaml: string; validateOnly: boolean }> =
    [];
  const client = {
    putDungeon: vi.fn(async (request: never) => {
      const deferred = makeDeferred<PutAnswer>();
      answers.push(deferred);
      // Extract the plain fields without depending on message internals.
      const record = request as unknown as {
        key: string;
        yaml: string;
        validateOnly: boolean;
      };
      requests.push({
        key: record.key,
        yaml: record.yaml,
        validateOnly: record.validateOnly,
      });
      return deferred.promise as never;
    }),
    getDungeon: vi.fn(),
    listScenarios: vi.fn(),
  } as unknown as AuthoringClient;
  return { client, requests };
}

describe('useSaveDungeon generation fencing', () => {
  it('reports a real save as successful after StrictMode effect replay', async () => {
    const answers: Deferred<PutAnswer>[] = [];
    const { client } = deferredClient(answers);
    const { result } = renderHook(() => useSaveDungeon(client), {
      wrapper: StrictMode,
    });
    let saved!: Promise<boolean>;
    act(() => {
      saved = result.current.save('room-key', 'complete-yaml');
    });
    await act(async () => {
      answers[0]!.resolve(okAnswer());
    });
    expect(await saved).toBe(true);
    expect(result.current.status).toBe('saved');
    expect(result.current.savedKey).toBe('room-key');
  });

  it('a stale success cannot replace a newer save’s error state', async () => {
    const answers: Deferred<PutAnswer>[] = [];
    const { client } = deferredClient(answers);
    const { result } = renderHook(() => useSaveDungeon(client));

    let first: boolean | undefined;
    await act(async () => {
      void result.current.save('key-a', 'yaml-a').then((ok) => {
        first = ok;
      });
    });
    let second: boolean | undefined;
    await act(async () => {
      void result.current.save('key-b', 'yaml-b').then((ok) => {
        second = ok;
      });
    });
    expect(answers).toHaveLength(2);

    // The newer save fails visibly; the older one is still in flight.
    await act(async () => {
      answers[1]!.reject(new Error('transport died'));
    });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.message).toBe('transport died');
    expect(result.current.submittedYaml).toBe('yaml-b');

    // The stale save now succeeds — it must not replace the newer error,
    // and its caller must not read success.
    await act(async () => {
      answers[0]!.resolve(okAnswer());
    });
    expect(first).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.message).toBe('transport died');
    expect(result.current.savedKey).toBeNull();
    // The second save itself genuinely failed, so it reported false —
    // what must never happen is the STALE answer reporting success.
    expect(second).toBe(false);
  });

  it('a stale failure cannot replace a newer save’s success', async () => {
    const answers: Deferred<PutAnswer>[] = [];
    const { client } = deferredClient(answers);
    const { result } = renderHook(() => useSaveDungeon(client));

    let first: boolean | undefined;
    await act(async () => {
      void result.current.save('key-a', 'yaml-a').then((ok) => {
        first = ok;
      });
    });
    await act(async () => {
      void result.current.save('key-b', 'yaml-b');
    });
    expect(answers).toHaveLength(2);

    await act(async () => {
      answers[1]!.resolve(okAnswer());
    });
    await waitFor(() => expect(result.current.status).toBe('saved'));
    expect(result.current.savedKey).toBe('key-b');

    await act(async () => {
      answers[0]!.reject(new Error('late transport failure'));
    });
    expect(first).toBe(false);
    expect(result.current.status).toBe('saved');
    expect(result.current.savedKey).toBe('key-b');
  });

  it('reports invalid provider errors for the exact submitted text', async () => {
    const answers: Deferred<PutAnswer>[] = [];
    const { client } = deferredClient(answers);
    const { result } = renderHook(() => useSaveDungeon(client));
    let ok: boolean | undefined;
    await act(async () => {
      void result.current.save('key-1', 'yaml-1').then((value) => {
        ok = value;
      });
    });
    await act(async () => {
      answers[0]!.resolve({
        errors: [
          { path: 'room.walkableHexes[3]', message: 'cell outside workspace' },
        ],
      });
    });
    await waitFor(() => expect(result.current.status).toBe('invalid'));
    expect(ok).toBe(false);
    expect(result.current.submittedYaml).toBe('yaml-1');
    expect(result.current.errors[0]?.path).toBe('room.walkableHexes[3]');
  });

  it('drops a response after unmount without acting on it', async () => {
    const answers: Deferred<PutAnswer>[] = [];
    const { client } = deferredClient(answers);
    const { result, unmount } = renderHook(() => useSaveDungeon(client));
    await act(async () => {
      void result.current.save('key-1', 'yaml-1');
    });
    unmount();
    await act(async () => {
      answers[0]!.resolve(okAnswer());
    });
    expect(answers).toHaveLength(1);
  });
});

describe('usePutDungeonPreview cleanup', () => {
  it('drops an in-flight validation answer after unmount', async () => {
    const answers: Deferred<PutAnswer>[] = [];
    const { client } = deferredClient(answers);
    const { unmount } = renderHook(() =>
      usePutDungeonPreview('key-1', 'yaml: |', { client, debounceMs: 0 })
    );
    await waitFor(() => expect(answers).toHaveLength(1));
    unmount();
    await act(async () => {
      answers[0]!.resolve(okAnswer());
    });
    // The resolution was consumed without touching state; a remount starts
    // a fresh, working validation cycle.
    const answers2: Deferred<PutAnswer>[] = [];
    const { client: client2 } = deferredClient(answers2);
    const second = renderHook(() =>
      usePutDungeonPreview('key-2', 'yaml: |', {
        client: client2,
        debounceMs: 0,
      })
    );
    await waitFor(() => expect(answers2).toHaveLength(1));
    await act(async () => {
      answers2[0]!.resolve(okAnswer());
    });
    await waitFor(() => expect(second.result.current.status).toBe('compiled'));
    unmount();
  });

  it('a superseded validation answer cannot replace the newest one', async () => {
    const answers: Deferred<PutAnswer>[] = [];
    const { client } = deferredClient(answers);
    const { result, rerender } = renderHook(
      ({ key, yaml }: { key: string; yaml: string }) =>
        usePutDungeonPreview(key, yaml, { client, debounceMs: 0 }),
      { initialProps: { key: 'k', yaml: 'v1' } }
    );
    await waitFor(() => expect(answers).toHaveLength(1));
    rerender({ key: 'k', yaml: 'v2' });
    await waitFor(() => expect(answers).toHaveLength(2));

    // The NEWER answer fails transport; the OLDER one then "succeeds".
    await act(async () => {
      answers[1]!.reject(new Error('unreachable now'));
    });
    await waitFor(() => expect(result.current.status).toBe('unreachable'));
    await act(async () => {
      answers[0]!.resolve(okAnswer());
    });
    expect(result.current.status).toBe('unreachable');
    expect(result.current.message).toBe('unreachable now');
  });

  it('sends validate_only previews with the exact key and yaml', async () => {
    const answers: Deferred<PutAnswer>[] = [];
    const { client, requests } = deferredClient(answers);
    const { rerender } = renderHook(
      ({ key, yaml }: { key: string; yaml: string }) =>
        usePutDungeonPreview(key, yaml, { client, debounceMs: 0 }),
      { initialProps: { key: 'k', yaml: 'v1' } }
    );
    await waitFor(() => expect(answers).toHaveLength(1));
    rerender({ key: 'k', yaml: 'v2' });
    await waitFor(() => expect(answers).toHaveLength(2));
    await act(async () => {
      answers[0]!.resolve(okAnswer());
      answers[1]!.resolve(okAnswer());
    });
    expect(requests.every((r) => r.validateOnly === true)).toBe(true);
    expect(requests.map((r) => r.yaml)).toEqual(['v1', 'v2']);
  });
});
