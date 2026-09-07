/**
 * useMoveController — the React glue over `moveController.ts`.
 *
 * Deliberately thin: every decision lives in the pure module so it stays
 * testable without a canvas, the same split `useHexMovePath` keeps between
 * `computeMoveStart`/`advanceFrame` and its hook. Nothing here decides
 * anything; it holds the map and forwards.
 */
import { useCallback, useMemo, useState } from 'react';
import type { CubeCoord } from '../hex-grid/hexMath';
import {
  beginRoute,
  emptyMovements,
  forgetUnsighted,
  movementPainted,
  stepArrived,
  type Movements,
} from './moveController';

export interface UseMoveControllerResult {
  /** Every actor's movement-in-progress, keyed by member id. */
  readonly movements: Movements;
  /** A whole route at once — the local player's own Move answer. */
  readonly beginRoute: (member: string, route: readonly CubeCoord[]) => void;
  /** One arriving cell — anyone else's step off the stream. */
  readonly stepArrived: (member: string, to: CubeCoord) => void;
  /** The presentation reporting how far it has actually painted. */
  readonly movementPainted: (
    member: string,
    seq: number,
    reached: number
  ) => void;
  /** Drop everyone the viewer is not sighting live, so an unseen actor's
   * route cannot be replayed when they come back into view. */
  readonly forgetUnsighted: (sighted: ReadonlySet<string>) => void;
}

export function useMoveController(): UseMoveControllerResult {
  const [movements, setMovements] = useState<Movements>(emptyMovements);

  const begin = useCallback(
    (member: string, route: readonly CubeCoord[]) =>
      setMovements((prev) => beginRoute(prev, member, route)),
    []
  );
  const step = useCallback(
    (member: string, to: CubeCoord) =>
      setMovements((prev) => stepArrived(prev, member, to)),
    []
  );
  const painted = useCallback(
    (member: string, seq: number, reached: number) =>
      setMovements((prev) => movementPainted(prev, member, seq, reached)),
    []
  );

  const forget = useCallback(
    (sighted: ReadonlySet<string>) =>
      setMovements((prev) => forgetUnsighted(prev, sighted)),
    []
  );

  return useMemo(
    () => ({
      movements,
      beginRoute: begin,
      stepArrived: step,
      movementPainted: painted,
      forgetUnsighted: forget,
    }),
    [movements, begin, step, painted, forget]
  );
}
