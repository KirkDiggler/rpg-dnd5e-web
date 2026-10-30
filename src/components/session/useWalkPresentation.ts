import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import type { CubeCoord } from '../hex-grid/hexMath';
import { arrivingWalk } from './arrivingWalk';
import type { PresentWalk, WalkPresentationOutcome } from './walkPresentation';

export interface UseWalkPresentationArgs {
  readonly session: string;
  readonly member: string;
  readonly liveSighted: ReadonlySet<string>;
  readonly canPresent: boolean;
  readonly beginRoute: (
    member: string,
    route: readonly CubeCoord[]
  ) => number | undefined;
  readonly forgetRoute: (member: string, seq: number) => void;
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
  });
  inputsRef.current = { liveSighted, canPresent, beginRoute, forgetRoute };

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
      const route = arrivingWalk(input.act, member);
      const inputs = inputsRef.current;
      if (
        !route ||
        !inputs.canPresent ||
        !inputs.liveSighted.has(route.member)
      ) {
        input.complete('unavailable');
        return () => {};
      }
      if (pendingRef.current) finish(pendingRef.current, 'cancelled');
      const seq = inputs.beginRoute(route.member, route.cells);
      if (seq === undefined) {
        input.complete('unavailable');
        return () => {};
      }
      const pending: Pending = {
        scope,
        actor: route.member,
        seq,
        length: route.cells.length,
        complete: input.complete,
        discard: () => inputs.forgetRoute(route.member, seq),
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
