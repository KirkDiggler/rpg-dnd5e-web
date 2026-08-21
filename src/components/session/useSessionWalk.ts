/**
 * useSessionWalk — turns a floor-hex click into a `MoveRequest`, and the
 * server's answer into what `HexEntity`'s existing `useHexMovePath`
 * machinery needs to animate it (`movePath`/`moveSeq`, unchanged from the
 * old `HexGrid` route — see `useHexMovePath.ts`'s own doc comment).
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
import { formatMoveError, isFightLockError } from './moveErrorMessage';
import { cubeToPosition, positionToCube } from './positionBridge';

function sameCube(a: CubeCoord | null, b: CubeCoord | null): boolean {
  if (a === null || b === null) return a === b;
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

export interface UseSessionWalkResult {
  /** Where the local player's entity should currently be drawn resting —
   * `null` until the first `GetWhere` answer arrives. */
  displayPosition: CubeCoord | null;
  /** The real steps of the most recent move, for `HexEntity.movePath`. */
  movePath: CubeCoord[] | undefined;
  /** Bumped once per genuine move, for `HexEntity.moveSeq`. */
  moveSeq: number | undefined;
  /** True from the moment a click dispatches a `Move` RPC through to the
   * walk animation finishing AND the follow-up `GetWhere` reconciling —
   * callers ignore clicks while this is true (this hook already does,
   * inside `walkTo`, so a caller need not gate on it separately, but it's
   * exposed for a busy indicator). */
  busy: boolean;
  /** Call with a clicked floor hex. No-ops (does not dispatch anything)
   * when already there, unreachable, or a walk is already in flight. */
  walkTo: (target: CubeCoord) => void;
  /** Wire straight to `HexEntity`'s `onMovementPresentationComplete` (via
   * a wrapper that drops the entityId argument). */
  onWalkAnimationComplete: (completedSeq: number) => void;
  /** The most recent move-RPC failure message, or `null`. Cleared at the
   * start of the next `walkTo`. */
  moveError: string | null;
  /** True exactly when `moveError` is the fight-lock refusal
   * (`session.ErrInBubble`, "member is in a fight" —
   * `moveErrorMessage.ts`'s `isFightLockError`) rather than some other
   * rejection. The move indicator (slice 4, rpg-dnd5e-web#762) reuses this
   * instead of re-parsing `moveError`'s already-friendly text or issuing a
   * probe RPC: a member can't walk anywhere while fight-locked, so every
   * hover should read as locked, not path/invalid depending on the cell.
   * Cleared at the start of the next `walkTo`, same as `moveError`. */
  fightLocked: boolean;
}

export function useSessionWalk(
  session: string,
  member: string,
  pathIndex: AtlasPathIndex | null,
  wherePosition: Position | null,
  refetchWhere: () => Promise<void>
): UseSessionWalkResult {
  const [displayPosition, setDisplayPosition] = useState<CubeCoord | null>(
    wherePosition ? positionToCube(wherePosition) : null
  );
  const [movePath, setMovePath] = useState<CubeCoord[] | undefined>(undefined);
  const [moveSeq, setMoveSeq] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [fightLocked, setFightLocked] = useState(false);
  const nextSeqRef = useRef(0);

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
      if (!pathIndex || !displayPosition || !member || busy) return;
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
      setFightLocked(false);

      void (async () => {
        try {
          const response = await sessionClient.move({
            session,
            member,
            path: requestPath,
          });
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

          nextSeqRef.current += 1;
          setDisplayPosition(steps[steps.length - 1]!);
          setMovePath(steps);
          setMoveSeq(nextSeqRef.current);
          // busy stays true — released by onWalkAnimationComplete once
          // the presentation finishes AND GetWhere reconciles.
        } catch (err) {
          // formatMoveError.ts's own doc comment: rewrites the fight-lock
          // FailedPrecondition (session.ErrInBubble) into a friendly line;
          // every other rejection passes through unchanged, same as before.
          // isFightLockError parses the SAME caught error the same way
          // (one sentinel-matching implementation, see moveErrorMessage.ts)
          // to set the boolean the move indicator reads.
          setMoveError(formatMoveError(err));
          setFightLocked(isFightLockError(err));
          setBusy(false);
        }
      })();
    },
    [pathIndex, displayPosition, member, busy, session]
  );

  const onWalkAnimationComplete = useCallback(
    (completedSeq: number) => {
      if (completedSeq !== moveSeq) return;
      void (async () => {
        try {
          await refetchWhere();
        } finally {
          setBusy(false);
        }
      })();
    },
    [moveSeq, refetchWhere]
  );

  return {
    displayPosition,
    movePath,
    moveSeq,
    busy,
    walkTo,
    onWalkAnimationComplete,
    moveError,
    fightLocked,
  };
}
