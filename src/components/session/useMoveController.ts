import { useCallback, useMemo, useRef, useState } from 'react';
import type { CubeCoord } from '../hex-grid/hexMath';
import type { MoveKind } from '../hex-grid/moveKind';
import {
  beginRoute,
  continuedWalk,
  continueRoute,
  emptyContinuations,
  emptyMovements,
  forgetRoute,
  forgetUnsighted,
  moveAnswered,
  movementPainted,
  stepArrived,
  type Continuations,
  type MoveAnswer,
  type Movements,
  type OwnWalk,
} from './moveController';

export interface UseMoveControllerResult {
  readonly movements: Movements;
  /** Returns the exact allocated sequence, even within a batched React event. */
  readonly beginRoute: (
    member: string,
    route: readonly CubeCoord[],
    kind?: MoveKind
  ) => number | undefined;
  readonly stepArrived: (member: string, to: CubeCoord) => void;
  readonly movementPainted: (
    member: string,
    seq: number,
    reached: number
  ) => void;
  readonly forgetUnsighted: (sighted: ReadonlySet<string>) => void;
  readonly forgetRoute: (member: string, seq: number) => void;
  /** A Move answer for `member` landed: records whether its walk goes on
   * after the answer (`moveController.moveAnswered`). Not rendered state. */
  readonly moveAnswered: (member: string, answer: MoveAnswer) => void;
  /** One of `member`'s own walk acts off the stream. When it continues their
   * answered walk, its new cells extend the journey (`continueRoute`) and the
   * exact sequence and route length to wait on are returned; undefined when
   * it continues nothing (rpg-project#890). */
  readonly continueOwnWalk: (
    member: string,
    walk: OwnWalk
  ) => { readonly seq: number; readonly length: number } | undefined;
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
  // Where each member's answered walk picks up on the stream. A ref, not
  // state: nothing renders from it; it only decides which own walk acts
  // extend a journey. Scoped with everything else here.
  const continuationsRef = useRef<Continuations>(emptyContinuations());
  if (stateRef.current.scope !== scope) {
    stateRef.current = { scope, movements: EMPTY_MOVEMENTS };
    sequencesRef.current = new Map();
    continuationsRef.current = emptyContinuations();
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
    (actor: string, route: readonly CubeCoord[], kind: MoveKind = 'own') => {
      if (route.length === 0) return undefined;
      return allocate(actor, (previous) =>
        beginRoute(previous, actor, route, kind)
      );
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
  const answered = useCallback(
    (actor: string, answer: MoveAnswer) => {
      if (stateRef.current.scope !== scope) return;
      continuationsRef.current = moveAnswered(
        continuationsRef.current,
        actor,
        answer
      );
    },
    [scope]
  );
  const continueOwn = useCallback(
    (actor: string, walk: OwnWalk) => {
      if (stateRef.current.scope !== scope) return undefined;
      const continued = continuedWalk(continuationsRef.current, actor, walk);
      if (!continued) return undefined;
      continuationsRef.current = continued.continuations;
      if (continued.cells.length === 0) return undefined;
      const seq = allocate(actor, (previous) =>
        continueRoute(previous, actor, continued.cells)
      );
      const movement = stateRef.current.movements.get(actor);
      if (seq === undefined || movement?.seq !== seq) return undefined;
      return { seq, length: movement.route.length };
    },
    [allocate, scope]
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
      moveAnswered: answered,
      continueOwnWalk: continueOwn,
    }),
    [movements, begin, step, painted, forget, discard, answered, continueOwn]
  );
}
