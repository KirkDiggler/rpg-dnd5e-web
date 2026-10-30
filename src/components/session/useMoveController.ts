import { useCallback, useMemo, useRef, useState } from 'react';
import type { CubeCoord } from '../hex-grid/hexMath';
import {
  beginRoute,
  emptyMovements,
  forgetRoute,
  forgetUnsighted,
  movementPainted,
  stepArrived,
  type Movements,
} from './moveController';

export interface UseMoveControllerResult {
  readonly movements: Movements;
  /** Returns the exact allocated sequence, even within a batched React event. */
  readonly beginRoute: (
    member: string,
    route: readonly CubeCoord[]
  ) => number | undefined;
  readonly stepArrived: (member: string, to: CubeCoord) => void;
  readonly movementPainted: (
    member: string,
    seq: number,
    reached: number
  ) => void;
  readonly forgetUnsighted: (sighted: ReadonlySet<string>) => void;
  readonly forgetRoute: (member: string, seq: number) => void;
}

interface Scope {
  readonly session: string;
  readonly member: string;
}
interface ScopedMovements {
  readonly scope: Scope;
  readonly movements: Movements;
}
const EMPTY_MOVEMENTS = emptyMovements();

/** React projection of the existing pure movement owner, scoped to one view.
 * Event writes are synchronous so presentation can subscribe to an exact route
 * sequence; React still owns the published snapshot. No command waits here.
 */
export function useMoveController(
  session: string,
  member: string
): UseMoveControllerResult {
  const scope = useMemo<Scope>(() => ({ session, member }), [session, member]);
  const [state, setState] = useState<ScopedMovements>(() => ({
    scope,
    movements: EMPTY_MOVEMENTS,
  }));
  const stateRef = useRef(state);
  const sequencesRef = useRef(new Map<string, number>());
  if (stateRef.current.scope !== scope) {
    stateRef.current = { scope, movements: EMPTY_MOVEMENTS };
    sequencesRef.current = new Map();
  }
  const update = useCallback(
    (change: (current: Movements) => Movements): Movements | undefined => {
      if (stateRef.current.scope !== scope) return undefined;
      const previous = stateRef.current.movements;
      const next = change(previous);
      if (next !== previous) {
        const value = { scope, movements: next };
        stateRef.current = value;
        setState(value);
      }
      return next;
    },
    [scope]
  );
  // Keep counters after a route is discarded: an old completion must not
  // collide with a later reappearance of the same actor in the same scope.
  const allocate = useCallback(
    (actor: string, change: (current: Movements) => Movements) =>
      update((previous) => {
        const next = change(previous);
        const movement = next.get(actor);
        if (next === previous || !movement) return next;
        const seq = (sequencesRef.current.get(actor) ?? 0) + 1;
        sequencesRef.current.set(actor, seq);
        return new Map(next).set(actor, { ...movement, seq });
      })?.get(actor)?.seq,
    [update]
  );
  const begin = useCallback(
    (actor: string, route: readonly CubeCoord[]) => {
      if (route.length === 0) return undefined;
      return allocate(actor, (previous) => beginRoute(previous, actor, route));
    },
    [allocate]
  );
  const step = useCallback(
    (actor: string, to: CubeCoord) => {
      allocate(actor, (previous) => stepArrived(previous, actor, to));
    },
    [allocate]
  );
  const painted = useCallback(
    (actor: string, seq: number, reached: number) => {
      update((previous) => movementPainted(previous, actor, seq, reached));
    },
    [update]
  );
  const forget = useCallback(
    (sighted: ReadonlySet<string>) => {
      update((previous) => forgetUnsighted(previous, sighted));
    },
    [update]
  );
  const discard = useCallback(
    (actor: string, seq: number) => {
      update((previous) => forgetRoute(previous, actor, seq));
    },
    [update]
  );
  const movements = state.scope === scope ? state.movements : EMPTY_MOVEMENTS;
  return useMemo(
    () => ({
      movements,
      beginRoute: begin,
      stepArrived: step,
      movementPainted: painted,
      forgetUnsighted: forget,
      forgetRoute: discard,
    }),
    [movements, begin, step, painted, forget, discard]
  );
}
