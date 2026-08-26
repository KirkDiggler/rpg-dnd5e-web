import { useCallback, useEffect, useRef } from 'react';

export type SessionRefreshKey =
  | 'characterData'
  | 'turn'
  | 'afford'
  | 'view'
  | 'where'
  | 'roster'
  | 'doors';

export type SessionRefreshCallbacks = Readonly<
  Record<SessionRefreshKey, () => Promise<void>>
>;

interface RefreshPass {
  scope: string;
  generation: number;
}

/**
 * Collects a synchronous/live stream burst into one serialized refresh pass.
 *
 * A zero-delay task is intentionally used instead of a microtask: consecutive
 * async-iterator frames may each resume in their own microtask, while still
 * belonging to the same provider burst. Only one pass may run at a time. Any
 * invalidation received while it runs is retained and drained by one immediate
 * trailing pass after the current server snapshots settle.
 *
 * Scope, lifecycle generation, and disposal checks fence queued timers,
 * in-flight trailing work, and callbacks retained by an old session/member
 * render. React StrictMode's setup-cleanup-setup probe is supported because a
 * scheduler reads the current generation when invoked rather than capturing
 * the first setup's generation forever.
 */
export function useCoalescedSessionRefreshes(
  scope: string,
  callbacks: SessionRefreshCallbacks
): (keys: readonly SessionRefreshKey[]) => void {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const pendingRef = useRef(new Set<SessionRefreshKey>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef<RefreshPass | null>(null);
  const generationRef = useRef(0);
  const disposedRef = useRef(true);

  const isCurrent = useCallback((pass: RefreshPass) => {
    return (
      !disposedRef.current &&
      scopeRef.current === pass.scope &&
      generationRef.current === pass.generation
    );
  }, []);

  const flush = useCallback(
    async (pass: RefreshPass): Promise<void> => {
      // Checked again even though the timer checks first: cleanup/key change
      // may occur between timer dispatch and this async pass beginning.
      if (!isCurrent(pass) || runningRef.current !== null) return;

      const keys = [...pendingRef.current];
      pendingRef.current.clear();
      if (keys.length === 0) return;

      runningRef.current = pass;
      await Promise.allSettled(
        keys.map((key) =>
          Promise.resolve().then(() => callbacksRef.current[key]())
        )
      );

      if (runningRef.current !== pass) return;
      runningRef.current = null;
      if (!isCurrent(pass)) return;

      // No timer here: invalidations observed during the completed snapshot
      // are a safety read, not a new debounce window. They are still coalesced
      // by the Set and serialized behind this pass.
      if (pendingRef.current.size > 0) void flush(pass);
    },
    [isCurrent]
  );

  const schedule = useCallback(
    (keys: readonly SessionRefreshKey[]) => {
      // Retained callbacks must be inert before they can enqueue either keys
      // or a timer.
      if (disposedRef.current || scopeRef.current !== scope) return;

      for (const key of keys) pendingRef.current.add(key);
      if (runningRef.current !== null || timerRef.current !== null) return;

      const pass: RefreshPass = {
        scope,
        generation: generationRef.current,
      };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        // Lifecycle fence immediately before the first flush.
        if (!isCurrent(pass)) return;
        void flush(pass);
      }, 0);
    },
    [flush, isCurrent, scope]
  );

  useEffect(() => {
    const pending = pendingRef.current;
    generationRef.current += 1;
    disposedRef.current = false;

    return () => {
      disposedRef.current = true;
      generationRef.current += 1;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
      pending.clear();
      // A late pass compares its identity before clearing or trailing, so it
      // cannot interfere with a later StrictMode setup or scope generation.
      runningRef.current = null;
    };
  }, [scope]);

  return schedule;
}
