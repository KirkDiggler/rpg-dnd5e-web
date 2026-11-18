/**
 * ONE STEP FROM THE LAYOUT (rpg-project#1003, slice #1006).
 *
 * While watching a run, the operator moves the seat one hex at a time from
 * the Layout. `step(cell)` sends ONE `sessionClient.move` — the game's own
 * client and RPC (`useSessionWalk`), never a second move client — with a
 * one-cell path and the world clock's empty selector: on the world clock
 * (free roam) the selector must be empty (rpg-toolkit session/move.go, and
 * `SessionEncounterView`'s `moveDeclarationId`). There is no pathfinding
 * and no animation.
 *
 * NOTHING MOVES HERE. The studio never moves a marker on its own: the map
 * changes only when the run's record says the seat moved (`foldRun`). This
 * hook holds only what the panel says about the last step: the server's
 * sentence when it refused or stopped the step, and whether the refusal
 * means a fight is on, where moves are made in the game (the turn clock
 * needs the game's Turn and Afford offers).
 *
 * A busy latch: while a step is in flight, further steps are ignored.
 *
 * THE CELL FRAME: a studio cell `{q, r}` is the record's axial `{x, y}`
 * (`studioCellOf` reads `{x, y}` through `positionToCube`, x = q, y = r),
 * so the wire path is `{x: q, y: r}` (`cubeToPosition`).
 */
import { sessionClient } from '@/api/client';
import {
  formatMoveError,
  isTurnClockMoveRefusal,
} from '@/components/session/moveErrorMessage';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomHexCell } from '../world-building/workspaceGeometry';
import type { RunView } from './runView';
import type { WatchedRun } from './runWatch';
import type { LayoutSteps } from './studioSession';

/** Said when a step is refused because a fight is on, or a step started
 * one: the studio does not drive the turn clock. */
export const FIGHT_MOVES_IN_THE_GAME = 'Moves in a fight are made in the game.';

/** Said when a step put the seat in sight of the other side and a fight
 * started. */
export const STEP_STARTED_A_FIGHT = 'A fight started.';

export interface StudioStep {
  /** Send one step to an adjacent cell; ignored while one is in flight. */
  step(cell: RoomHexCell): void;
  busy: boolean;
  /** The server's sentence for the last step's refusal or early stop. */
  refusal: string | null;
  /** The last step met the turn clock: a fight is on. */
  fight: boolean;
}

export function useStudioStep(watch: WatchedRun | null): StudioStep {
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [fight, setFight] = useState(false);
  /** The latch itself: a ref, so two clicks before a render still send
   * one move. */
  const inFlight = useRef(false);
  const key = watch ? `${watch.session}\u0000${watch.member}` : '';
  const current = useRef(key);
  current.current = key;
  useEffect(() => {
    setRefusal(null);
    setFight(false);
  }, [key]);

  const step = useCallback(
    (cell: RoomHexCell): void => {
      if (!watch || inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setRefusal(null);
      setFight(false);
      const sent = key;
      void (async () => {
        try {
          const response = await sessionClient.move({
            session: watch.session,
            member: watch.member,
            path: [{ x: cell.q, y: cell.r }],
            // The world clock's selector is empty; the turn clock refuses
            // it, and that refusal sends the operator to the game.
            declarationId: '',
          });
          if (current.current !== sent) return;
          // A short walk is an answer, not an error (MoveResponse): a
          // stopped step says why in `stopReason`.
          if (response.stopReason) setRefusal(response.stopReason);
          if (response.formed) {
            setRefusal((said) => said ?? STEP_STARTED_A_FIGHT);
            setFight(true);
          }
        } catch (err) {
          if (current.current !== sent) return;
          setRefusal(formatMoveError(err));
          setFight(isTurnClockMoveRefusal(err));
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
      })();
    },
    [watch, key]
  );

  return { step, busy, refusal, fight };
}

/** The steps the Layout offers: at the live step only (`step` null), and
 * only when the record says where the seat is. Undefined offers none. */
export function layoutStepsOf(
  watch: WatchedRun | null,
  run: { view: RunView; step: number | null },
  stepping: Pick<StudioStep, 'busy' | 'step'>
): LayoutSteps | undefined {
  if (!watch || run.step !== null) return undefined;
  const from = run.view.members[watch.member]?.cell;
  if (!from) return undefined;
  return { from, busy: stepping.busy, onStep: stepping.step };
}
