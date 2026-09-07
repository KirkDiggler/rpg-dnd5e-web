/**
 * useSessionWalk — turns a floor-hex click into a `MoveRequest`, and hands
 * the server's answer to the shared move controller.
 *
 * This hook owns the COMMAND path only: pathfinding to shape the request,
 * the RPC, refusal handling, and `busy`. It no longer owns any animation
 * state. The route and its sequence belong to `moveController.ts`, which
 * holds one counter for every actor — the local player's route arriving
 * whole here, everyone else's a cell at a time off the stream
 * (rpg-dnd5e-web#961). Before that split this hook was the ONLY producer of
 * `movePath`/`moveSeq`, which is precisely why nobody but the local player
 * could ever play a walk clip.
 *
 * THE SERVER IS THE AUTHORITY, start to finish. `walkTo` computes a
 * client-side route only to shape the REQUEST (`atlasPath.ts`'s A* over
 * the atlas's own declared boundaries/doorways) — the animation that
 * actually plays is built from `MoveResponse.steps`, "what ACTUALLY
 * happened," never the requested path. A short walk (fewer steps than
 * requested) is not an error (`MoveResponse`'s own doc comment) and is
 * handled identically to a full one: animate exactly the steps returned,
 * then reconcile.
 *
 * DISPLAY POSITION IS OPTIMISTIC UNTIL RECONCILED. While idle, the
 * position shown is whatever `GetWhere` last reported. The moment a move
 * resolves, the display position jumps straight to the last returned
 * step (so `useHexMovePath`'s `entityPosition` prop already matches the
 * destination the animation is walking TO — see that hook's contract:
 * position is where the entity rests, movePath is how it got there).
 * `busy` stays true through the whole walk AND through the follow-up
 * `refetchWhere()` this hook awaits once the animation's presentation
 * callback fires — never released early — so a `GetWhere` still in flight
 * from BEFORE this move can't land afterward and snap the display back to
 * a stale position (see the effect below).
 */
import { sessionClient } from '@/api/client';
import type { CubeCoord } from '@/components/hex-grid/hexMath';
import type { Position } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AtlasPathIndex } from './atlasPath';
import { findAtlasPath } from './atlasPath';
import { isStaleDeclarationRefusal } from './combat-experience/selection';
import { formatMoveError, isNotYourTurnError } from './moveErrorMessage';
import { cubeToPosition, positionToCube } from './positionBridge';

function sameCube(a: CubeCoord | null, b: CubeCoord | null): boolean {
  if (a === null || b === null) return a === b;
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

export interface UseSessionWalkResult {
  /** Where the local player's entity should currently be drawn resting —
   * `null` until the first `GetWhere` answer arrives. */
  displayPosition: CubeCoord | null;
  /** True from the moment a click dispatches a `Move` RPC through to the
   * walk animation finishing AND the follow-up `GetWhere` reconciling —
   * callers ignore clicks while this is true (this hook already does,
   * inside `walkTo`, so a caller need not gate on it separately, but it's
   * exposed for a busy indicator). */
  busy: boolean;
  /** Call with a clicked floor hex. No-ops (does not dispatch anything)
   * when already there, unreachable, or a walk is already in flight. */
  walkTo: (target: CubeCoord) => void;
  /** Call when the local player's walk animation has finished painting.
   * Takes no sequence: `busy` already admits exactly one walk at a time,
   * so a completion arriving while busy IS this walk. The sequence itself
   * now belongs to `moveController.ts`, which keeps one counter for every
   * actor rather than one per feed. */
  onWalkAnimationComplete: () => void;
  /** The most recent non-stale move-RPC failure message, or `null`.
   * FAILED_PRECONDITION selector refusals use the shared declaration recovery
   * callback instead, so raw stale wording never reaches this field. */
  moveError: string | null;
  /** Diagnostic compatibility flag for the exact not-your-turn sentinel.
   * All FailedPrecondition Move refusals recover through the shared stale
   * declaration path regardless of wording; this flag is never execution
   * authority and clears at the next attempt. */
  notYourTurn: boolean;
}

export function useSessionWalk(
  session: string,
  member: string,
  pathIndex: AtlasPathIndex | null,
  wherePosition: Position | null,
  refetchWhere: () => Promise<void>,
  /** Exact opaque Move offer id on the turn clock; empty in known free roam.
   * Undefined means the Turn/Afford authority snapshots are not coherent yet. */
  declarationId?: string,
  onStaleDeclarationRefusal?: (declarationId: string) => void,
  isAuthorityFresh: () => boolean = () => true,
  /** Fires synchronously when Move is accepted, before response-step animation
   * state is published. The route uses this boundary to revoke stale command
   * authority and queue Turn/Afford reconciliation. */
  onMoveAccepted?: () => void,
  /** Hands the move's REAL steps to the shared move controller, which owns
   * the route and its sequence for every actor alike (rpg-dnd5e-web#961).
   * This hook keeps the command path — the RPC, refusals, `busy` — and no
   * longer owns any animation state. */
  onRouteBegan: (route: readonly CubeCoord[]) => void = () => {}
): UseSessionWalkResult {
  const [displayPosition, setDisplayPosition] = useState<CubeCoord | null>(
    wherePosition ? positionToCube(wherePosition) : null
  );
  const [busy, setBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [notYourTurn, setNotYourTurn] = useState(false);
  // Read through a ref so a caller passing an inline closure cannot churn
  // `walkTo`'s dependency list.
  const onRouteBeganRef = useRef(onRouteBegan);
  onRouteBeganRef.current = onRouteBegan;

  // GetWhere is the source of truth. While idle, the display position
  // tracks it directly; while a walk is in flight (or its follow-up
  // reconciliation hasn't landed yet), this is deliberately skipped — see
  // the module doc comment for why releasing `busy` early would let a
  // stale fetch clobber the just-finished walk's resting position.
  //
  // Compared by VALUE (`sameCube`), not reference, before calling
  // `setState`: `wherePosition` is a plain object a caller may
  // legitimately reconstruct on every render (e.g. `useSessionWhere`'s
  // own state, or a test passing a literal) even when nothing actually
  // changed. Setting state to a fresh-but-equal object on every render
  // would re-trigger this same effect via the changed prop reference,
  // forever — returning the PREVIOUS state object when the value hasn't
  // moved is what lets React bail out of that loop.
  useEffect(() => {
    if (busy) return;
    const next = wherePosition ? positionToCube(wherePosition) : null;
    setDisplayPosition((prev) => (sameCube(prev, next) ? prev : next));
  }, [wherePosition, busy]);

  const walkTo = useCallback(
    (target: CubeCoord) => {
      if (
        !pathIndex ||
        !displayPosition ||
        !member ||
        busy ||
        declarationId === undefined ||
        !isAuthorityFresh()
      )
        return;
      const path = findAtlasPath(pathIndex, displayPosition, target);
      // Empty means "nothing to walk" either way: already there, or no
      // route exists (blocked/unreachable) — both are silent no-ops, per
      // this slice's done criteria ("click an unreachable/blocked cell:
      // nothing moves, no crash").
      if (path.length === 0) return;
      // path[0] is the current cell itself (findAtlasPath's own
      // convention, matching hexMath.findPath) — MoveRequest.path wants
      // only the cells to walk THROUGH, not the starting cell.
      const requestPath = path.slice(1).map(cubeToPosition);

      setBusy(true);
      setMoveError(null);
      setNotYourTurn(false);

      void (async () => {
        try {
          const response = await sessionClient.move({
            session,
            member,
            path: requestPath,
            // Opaque server offer selector: echoed only, never parsed or built.
            declarationId,
          });
          // A successful unary response is itself command acceptance. Revoke
          // old declarations before publishing any animation state and without
          // waiting for a redundant MOVED delivery.
          onMoveAccepted?.();
          const steps = response.steps
            .filter((step) => step.position !== undefined)
            .map((step) => positionToCube(step.position!));

          if (steps.length === 0) {
            // The walk did not move at all (e.g. the very first step was
            // refused server-side for a reason this client's own index
            // didn't know about) — nothing to animate, and nothing to
            // reconcile either.
            setBusy(false);
            return;
          }

          setDisplayPosition(steps[steps.length - 1]!);
          onRouteBeganRef.current(steps);
          // busy stays true — released by onWalkAnimationComplete once
          // the presentation finishes AND GetWhere reconciles.
        } catch (err) {
          const turnRefusal = isNotYourTurnError(err);
          setNotYourTurn(turnRefusal);
          if (isStaleDeclarationRefusal(err)) {
            // Selector-bearing Move refusals share the same recovery surface as
            // Attack and EndTurn. Raw refusal text never becomes presentation.
            setMoveError(null);
            onStaleDeclarationRefusal?.(declarationId);
          } else {
            setMoveError(formatMoveError(err));
          }
          setBusy(false);
        }
      })();
    },
    [
      pathIndex,
      displayPosition,
      member,
      busy,
      session,
      declarationId,
      onStaleDeclarationRefusal,
      isAuthorityFresh,
      onMoveAccepted,
    ]
  );

  const onWalkAnimationComplete = useCallback(() => {
    if (!busy) return;
    void (async () => {
      try {
        await refetchWhere();
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, refetchWhere]);

  return {
    displayPosition,
    busy,
    walkTo,
    onWalkAnimationComplete,
    moveError,
    notYourTurn,
  };
}
