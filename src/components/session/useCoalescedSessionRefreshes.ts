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

/**
 * Collects a synchronous/live stream burst into one refresh pass.
 *
 * A zero-delay task is intentionally used instead of a microtask: consecutive
 * async-iterator frames may each resume in their own microtask, while still
 * belonging to the same provider burst. Scope tokens fence both a queued flush
 * and callbacks retained by an old session/member render.
 */
export function useCoalescedSessionRefreshes(
  scope: string,
  callbacks: SessionRefreshCallbacks
): (keys: readonly SessionRefreshKey[]) => void {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const pendingRef = useRef<{ scope: string; keys: Set<SessionRefreshKey> }>({
    scope,
    keys: new Set(),
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedule = useCallback(
    (keys: readonly SessionRefreshKey[]) => {
      if (scopeRef.current !== scope) return;
      if (pendingRef.current.scope !== scope) {
        pendingRef.current = { scope, keys: new Set() };
      }
      for (const key of keys) pendingRef.current.keys.add(key);
      if (timerRef.current !== null) return;

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (scopeRef.current !== scope || pendingRef.current.scope !== scope) {
          return;
        }
        const pending = [...pendingRef.current.keys];
        pendingRef.current.keys.clear();
        for (const key of pending) void callbacksRef.current[key]();
      }, 0);
    },
    [scope]
  );

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
      pendingRef.current.keys.clear();
    },
    [scope]
  );

  return schedule;
}
