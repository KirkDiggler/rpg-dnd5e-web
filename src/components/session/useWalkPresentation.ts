import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import type { CubeCoord } from '../hex-grid/hexMath';
import type { MoveKind } from '../hex-grid/moveKind';
import { arrivingWalk, ownWalk } from './arrivingWalk';
import type { OwnWalk } from './moveController';
import type { PresentWalk, WalkPresentationOutcome } from './walkPresentation';

export interface UseWalkPresentationArgs {
  readonly session: string;
  readonly member: string;
  readonly liveSighted: ReadonlySet<string>;
  readonly canPresent: boolean;
  readonly beginRoute: (
    member: string,
    route: readonly CubeCoord[],
    kind?: MoveKind
  ) => number | undefined;
  readonly forgetRoute: (member: string, seq: number) => void;
  /** The local member's own walk act continuing their answered Move
   * (rpg-project#890): the sequence and route length to wait on, or undefined
   * when it continues nothing and so has nothing to present. Absent, own
   * walks are never presented, as before. */
  readonly continueOwnWalk?: (
    member: string,
    walk: OwnWalk
  ) => { readonly seq: number; readonly length: number } | undefined;
}
export interface UseWalkPresentationResult {
  readonly presentWalk: PresentWalk;
  readonly movementPainted: (
    member: string,
    seq: number,
    reached: number
  ) => void;
}
interface Scope {
  readonly session: string;
  readonly member: string;
}
interface Pending {
  readonly scope: Scope;
  readonly actor: string;
  readonly seq: number;
  readonly length: number;
  readonly complete: (outcome: WalkPresentationOutcome) => void;
  readonly discard: () => void;
}

/** One completion subscription, not another act queue. The cursor owns order;
 * the movement controller owns routes; this bridge correlates their identity.
 */
export function useWalkPresentation({
  session,
  member,
  liveSighted,
  canPresent,
  beginRoute,
  forgetRoute,
  continueOwnWalk,
}: UseWalkPresentationArgs): UseWalkPresentationResult {
  const scope = useMemo<Scope>(() => ({ session, member }), [session, member]);
  const activeScopeRef = useRef(scope);
  activeScopeRef.current = scope;
  const mountedRef = useRef(true);
  const pendingRef = useRef<Pending | null>(null);
  const inputsRef = useRef({
    liveSighted,
    canPresent,
    beginRoute,
    forgetRoute,
    continueOwnWalk,
  });
  inputsRef.current = {
    liveSighted,
    canPresent,
    beginRoute,
    forgetRoute,
    continueOwnWalk,
  };

  const finish = useCallback(
    (pending: Pending, outcome: WalkPresentationOutcome): void => {
      if (pendingRef.current !== pending) return;
      pendingRef.current = null;
      if (outcome !== 'painted') pending.discard();
      pending.complete(outcome);
    },
    []
  );

  const presentWalk = useCallback<PresentWalk>(
    (input) => {
      if (!mountedRef.current || activeScopeRef.current !== scope) {
        input.complete('cancelled');
        return () => {};
      }
      const inputs = inputsRef.current;
      // The local member's own walk plays only where it continues their
      // answered Move; every other walk is a journey of its own.
      const own = ownWalk(input.act, member);
      const route = own ? undefined : arrivingWalk(input.act, member);
      const actor = own ? member : route?.member;
      if (
        !actor ||
        (!own && !route) ||
        !inputs.canPresent ||
        !inputs.liveSighted.has(actor)
      ) {
        input.complete('unavailable');
        return () => {};
      }
      if (own && !inputs.continueOwnWalk) {
        input.complete('unavailable');
        return () => {};
      }
      if (pendingRef.current) finish(pendingRef.current, 'cancelled');
      let started: { seq: number; length: number } | undefined;
      if (own) started = inputs.continueOwnWalk!(member, own);
      else if (route) {
        const seq =
          route.kind !== 'own'
            ? inputs.beginRoute(route.member, route.cells, route.kind)
            : inputs.beginRoute(route.member, route.cells);
        started =
          seq === undefined ? undefined : { seq, length: route.cells.length };
      }
      if (started === undefined) {
        input.complete('unavailable');
        return () => {};
      }
      const { seq } = started;
      const pending: Pending = {
        scope,
        actor,
        seq,
        length: started.length,
        complete: input.complete,
        discard: () => inputs.forgetRoute(actor, seq),
      };
      pendingRef.current = pending;
      return () => {
        if (pendingRef.current !== pending) return;
        pendingRef.current = null;
        pending.discard();
      };
    },
    [finish, member, scope]
  );

  const movementPainted = useCallback(
    (actor: string, seq: number, reached: number): void => {
      if (!mountedRef.current || activeScopeRef.current !== scope) return;
      const pending = pendingRef.current;
      if (
        pending?.scope === scope &&
        pending.actor === actor &&
        pending.seq === seq &&
        reached >= pending.length
      )
        finish(pending, 'painted');
    },
    [finish, scope]
  );

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const pending = pendingRef.current;
      if (pending?.scope === scope) finish(pending, 'cancelled');
    };
  }, [finish, scope]);

  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (
      pending?.scope === scope &&
      (!canPresent || !liveSighted.has(pending.actor))
    )
      finish(pending, 'unavailable');
  }, [canPresent, finish, liveSighted, scope]);

  return useMemo(
    () => ({ presentWalk, movementPainted }),
    [presentWalk, movementPainted]
  );
}
