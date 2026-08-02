import { useCallback, useState } from 'react';
import {
  cellKey,
  DEFAULT_GRID,
  emptyCreationState,
  hEdgeKey,
  vEdgeKey,
  type CreationGrid,
  type CreationState,
  type EdgeKey,
  type Placement,
  type WallKind,
} from './creationTypes';

let placementCounter = 0;
function nextPlacementId(): string {
  placementCounter += 1;
  return `p${placementCounter}`;
}

export interface CreationActions {
  setGrid: (grid: CreationGrid) => void;
  resetGrid: (grid: CreationGrid) => void;
  toggleWall: (key: EdgeKey, kind: WallKind, forceOn?: boolean) => void;
  toggleHole: (col: number, row: number) => void;
  setStart: (at: [number, number]) => void;
  setEnd: (at: [number, number]) => void;
  addPlacement: (
    kind: 'prop' | 'monster',
    ref: string,
    at: [number, number]
  ) => void;
  movePlacement: (id: string, at: [number, number]) => void;
  deletePlacement: (id: string) => void;
  selectPlacement: (id: string | null) => void;
  rotateFacing: (id: string, delta: 1 | -1) => void;
  replaceState: (state: CreationState) => void;
}

export function useCreationState(initialGrid: CreationGrid = DEFAULT_GRID) {
  const [state, setState] = useState<CreationState>(() =>
    emptyCreationState(initialGrid)
  );

  const setGrid = useCallback((grid: CreationGrid) => {
    setState((s) => ({ ...s, grid }));
  }, []);

  const resetGrid = useCallback((grid: CreationGrid) => {
    setState(emptyCreationState(grid));
  }, []);

  const toggleWall = useCallback(
    (key: EdgeKey, kind: WallKind, forceOn?: boolean) => {
      setState((s) => {
        const walls = new Map(s.walls);
        const has = walls.has(key);
        const shouldBeOn = forceOn ?? !has;
        if (shouldBeOn) walls.set(key, kind);
        else walls.delete(key);
        return { ...s, walls };
      });
    },
    []
  );

  const toggleHole = useCallback((col: number, row: number) => {
    setState((s) => {
      const holes = new Set(s.holes);
      const key = cellKey(col, row);
      if (holes.has(key)) holes.delete(key);
      else holes.add(key);
      return { ...s, holes };
    });
  }, []);

  const setStart = useCallback((at: [number, number]) => {
    setState((s) => ({ ...s, start: at }));
  }, []);
  const setEnd = useCallback((at: [number, number]) => {
    setState((s) => ({ ...s, end: at }));
  }, []);

  const addPlacement = useCallback(
    (kind: 'prop' | 'monster', ref: string, at: [number, number]) => {
      setState((s) => ({
        ...s,
        placements: [
          ...s.placements,
          { id: nextPlacementId(), kind, ref, at, facing: null },
        ],
        selectedPlacementId: null,
      }));
    },
    []
  );

  const movePlacement = useCallback((id: string, at: [number, number]) => {
    setState((s) => ({
      ...s,
      placements: s.placements.map((p) => (p.id === id ? { ...p, at } : p)),
    }));
  }, []);

  const deletePlacement = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      placements: s.placements.filter((p) => p.id !== id),
      selectedPlacementId:
        s.selectedPlacementId === id ? null : s.selectedPlacementId,
    }));
  }, []);

  const selectPlacement = useCallback((id: string | null) => {
    setState((s) => ({ ...s, selectedPlacementId: id }));
  }, []);

  const rotateFacing = useCallback((id: string, delta: 1 | -1) => {
    setState((s) => ({
      ...s,
      placements: s.placements.map((p) => {
        if (p.id !== id) return p;
        const current = p.facing ?? 0;
        const next = (((current + delta) % 6) + 6) % 6;
        return { ...p, facing: next };
      }),
    }));
  }, []);

  const replaceState = useCallback((next: CreationState) => {
    setState(next);
  }, []);

  const actions: CreationActions = {
    setGrid,
    resetGrid,
    toggleWall,
    toggleHole,
    setStart,
    setEnd,
    addPlacement,
    movePlacement,
    deletePlacement,
    selectPlacement,
    rotateFacing,
    replaceState,
  };

  return { state, actions };
}

// Re-export the h/vEdgeKey helpers for callers that need to compute a key
// (Board interaction code) without importing creationTypes directly too.
export { hEdgeKey, vEdgeKey };
export type { Placement };
