/**
 * useMoveIndicator — the React seam between `SessionScene`'s hover state
 * and `moveIndicator.ts`'s pure selection (rpg-dnd5e-web#762 slice 4,
 * rpg-project#249). Memoized on exactly the inputs that can change the
 * answer, so the pathfinding `selectMoveIndicator` may run stays OUT of
 * the render loop: an unrelated re-render (a camera pan, an
 * `otherMembers` refresh that doesn't touch the hovered cell) recomputes
 * nothing here.
 */
import type { CubeCoord } from '@/components/hex-grid/hexMath';
import { useMemo } from 'react';
import type { AtlasPathIndex } from './atlasPath';
import {
  selectMoveIndicator,
  type MoveIndicatorSelection,
} from './moveIndicator';

export interface UseMoveIndicatorArgs {
  hovered: CubeCoord | null;
  from: CubeCoord | null;
  pathIndex: AtlasPathIndex | null;
  locked: boolean;
  hoveredEntityId?: string | null;
  attackable?: boolean;
  /** The server's movement bound for this turn, in whole cells
   * (toolkit#1169) — see `moveIndicator.ts`'s own doc comment. */
  maxCells?: number;
}

export function useMoveIndicator({
  hovered,
  from,
  pathIndex,
  locked,
  hoveredEntityId,
  attackable,
  maxCells,
}: UseMoveIndicatorArgs): MoveIndicatorSelection | null {
  return useMemo(
    () =>
      selectMoveIndicator({
        hovered,
        from,
        pathIndex,
        locked,
        hoveredEntityId,
        attackable,
        maxCells,
      }),
    [hovered, from, pathIndex, locked, hoveredEntityId, attackable, maxCells]
  );
}
