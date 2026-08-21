/**
 * useMoveIndicator — the React seam between `SessionScene`'s hover state
 * and `moveIndicator.ts`'s pure selection (rpg-dnd5e-web#762 slice 4).
 * Memoized on exactly the inputs that can change the answer, so the
 * pathfinding `selectMoveIndicator` may run stays OUT of the render loop:
 * an unrelated re-render (a camera pan, an `otherMembers` refresh that
 * doesn't touch the hovered cell) recomputes nothing here.
 */
import type { CubeCoord } from '@/components/hex-grid/hexMath';
import { useMemo } from 'react';
import type { AtlasPathIndex } from './atlasPath';
import {
  selectMoveIndicator,
  type MoveIndicatorMode,
  type MoveIndicatorSelection,
} from './moveIndicator';

export interface UseMoveIndicatorArgs {
  mode: MoveIndicatorMode;
  hovered: CubeCoord | null;
  from: CubeCoord | null;
  pathIndex: AtlasPathIndex | null;
  fightLocked: boolean;
  hoveredEntityId?: string | null;
}

export function useMoveIndicator({
  mode,
  hovered,
  from,
  pathIndex,
  fightLocked,
  hoveredEntityId,
}: UseMoveIndicatorArgs): MoveIndicatorSelection | null {
  return useMemo(
    () =>
      selectMoveIndicator({
        mode,
        hovered,
        from,
        pathIndex,
        fightLocked,
        hoveredEntityId,
      }),
    [mode, hovered, from, pathIndex, fightLocked, hoveredEntityId]
  );
}
