/**
 * useRegionEditing.test.ts — region-brush honesty round (2026-08-06).
 * Covers the two behavior changes this round made to the hook (see its
 * own header comment for the full "why"): per-cell overlap pre-checking
 * that SKIPS an already-owned cell instead of rejecting the whole
 * gesture, and the `beginStroke`/`endStroke` accumulator that flushes
 * ONE honest "painted N, skipped M owned by 'X'" summary instead of a
 * per-cell toast flood.
 *
 * `useRegionEditing` is a plain controlled hook — `cst`/`doc` are
 * arguments, not internal state — so the test drives it the same way
 * `DungeonBuilderConcept.tsx` does: a `resync()` that re-derives `doc`
 * from the (in-place-mutated) `cst`, then `rerender()` to feed the fresh
 * `doc` back in for the NEXT gesture. `commitRegion` bundles "create a
 * SETUP region directly via `createRegion`, then resync+rerender" since
 * that mutator doesn't go through the hook's own `syncFromCst`. Mid-stroke
 * calls never need a resync/rerender: the overlap check only ever looks
 * at OTHER regions' already-committed cells, which don't change within
 * one stroke.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createRegion, parseDungeon, toDungeonDoc } from '../dungeonYaml';
import type { Cell } from '../regionGeometry';
import { emptyCanvasYaml } from './emptyCanvasDoc';
import { useRegionEditing } from './useRegionEditing';

function setup() {
  const { cst, doc: initialDoc } = parseDungeon(emptyCanvasYaml(20, 20));
  let doc = initialDoc;
  const flashToast = vi.fn();
  const syncFromCst = () => {
    doc = toDungeonDoc(cst);
  };
  const view = renderHook(() =>
    useRegionEditing(cst, doc, syncFromCst, flashToast)
  );
  const resync = () => {
    doc = toDungeonDoc(cst);
  };
  /** Directly creates a region via the raw `dungeonYaml.ts` mutator (NOT
   * the hook's own `handleCreate` — this is SETUP, establishing a region
   * that already exists before the gesture under test starts) and
   * resyncs/rerenders so the hook's next call sees it. */
  const commitRegion = (
    id: string,
    archetype: string,
    cells: Cell[],
    name?: string
  ) => {
    createRegion(cst, doc, id, archetype, cells, name);
    resync();
    view.rerender();
  };
  return { cst, view, flashToast, getDoc: () => doc, commitRegion };
}

describe('useRegionEditing — pending (not-yet-created) region paint', () => {
  it('adds a legal cell to pendingCells with no toast', () => {
    const { view, flashToast } = setup();
    act(() => {
      view.result.current.setPendingCellMembership([1, 1], true);
    });
    expect(view.result.current.pendingCells).toEqual([[1, 1]]);
    expect(flashToast).not.toHaveBeenCalled();
  });

  it('a cell already owned by an existing region is SKIPPED (never enters pendingCells), not silently accepted', () => {
    const { view, commitRegion } = setup();
    commitRegion('entrance', 'entrance', [[5, 5]]);

    act(() => {
      view.result.current.setPendingCellMembership([5, 5], true);
    });

    expect(view.result.current.pendingCells).toEqual([]);
  });

  it('outside an active stroke (defensive path), a skipped cell still flashes an immediate, evidence-bearing toast + conflictFlash', () => {
    const { view, flashToast, commitRegion } = setup();
    commitRegion('entrance', 'entrance', [[5, 5]]);

    act(() => {
      view.result.current.setPendingCellMembership([5, 5], true);
    });

    expect(flashToast).toHaveBeenCalledWith(
      "cell [5,5] already belongs to 'entrance'"
    );
    expect(view.result.current.conflictFlash).toEqual({
      cells: [[5, 5]],
      ownerId: 'entrance',
      ownerName: undefined,
    });
  });

  it('a WHOLE STROKE paints every legal cell and skips owned ones, flushing ONE summary toast at endStroke — not a flood', () => {
    const { view, flashToast, commitRegion } = setup();
    commitRegion('entrance', 'entrance', [
      [5, 5],
      [6, 5],
      [7, 5],
    ]);

    act(() => {
      view.result.current.beginStroke();
      // A stroke crossing 5 cells: 2 legal, 3 already owned by 'entrance'.
      view.result.current.setPendingCellMembership([0, 0], true);
      view.result.current.setPendingCellMembership([5, 5], true);
      view.result.current.setPendingCellMembership([6, 5], true);
      view.result.current.setPendingCellMembership([7, 5], true);
      view.result.current.setPendingCellMembership([1, 0], true);
    });
    // No toast yet — the whole point is one summary at the END of the
    // stroke, not one per rejected cell.
    expect(flashToast).not.toHaveBeenCalled();

    act(() => {
      view.result.current.endStroke();
    });

    expect(view.result.current.pendingCells).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(flashToast).toHaveBeenCalledTimes(1);
    expect(flashToast).toHaveBeenCalledWith(
      "painted 2, skipped 3 cells owned by 'entrance'"
    );
    expect(view.result.current.conflictFlash?.ownerId).toBe('entrance');
    expect(view.result.current.conflictFlash?.cells).toEqual(
      expect.arrayContaining([
        [5, 5],
        [6, 5],
        [7, 5],
      ])
    );
  });

  it('a fully clean stroke (nothing skipped) ends silently — no toast, matching this concept\'s "no toast on success" convention', () => {
    const { view, flashToast } = setup();
    act(() => {
      view.result.current.beginStroke();
      view.result.current.setPendingCellMembership([0, 0], true);
      view.result.current.setPendingCellMembership([1, 0], true);
      view.result.current.endStroke();
    });
    expect(flashToast).not.toHaveBeenCalled();
    expect(view.result.current.conflictFlash).toBeNull();
  });

  it("Kirk's exact scenario: painting a second region up to a wall band the first region already claims skips the band, keeps the rest, and names the first region", () => {
    const { view, flashToast, commitRegion, getDoc } = setup();
    // Region A ("entrance") swept up a straight wall's footprint band —
    // cells [3,0]/[4,0]/[5,0] stand in for that band here (the actual
    // footprint geometry is CreationBoard.tsx's concern, not this hook's
    // — the hook only ever sees "cells," never whether they're a
    // footprint).
    commitRegion('entrance', 'entrance', [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
    ]);

    // Brushing region B up to the SAME wall from the other side: 3 new
    // legal cells, plus the 3 band cells entrance already owns.
    act(() => {
      view.result.current.beginStroke();
      view.result.current.setPendingCellMembership([3, 0], true);
      view.result.current.setPendingCellMembership([4, 0], true);
      view.result.current.setPendingCellMembership([5, 0], true);
      view.result.current.setPendingCellMembership([3, 1], true);
      view.result.current.setPendingCellMembership([4, 1], true);
      view.result.current.setPendingCellMembership([5, 1], true);
      view.result.current.endStroke();
    });

    expect(view.result.current.pendingCells).toEqual(
      expect.arrayContaining([
        [3, 1],
        [4, 1],
        [5, 1],
      ])
    );
    expect(view.result.current.pendingCells).toHaveLength(3);
    expect(flashToast).toHaveBeenCalledWith(
      "painted 3, skipped 3 cells owned by 'entrance'"
    );

    // The Create button now succeeds on the first try — the band cells
    // were never in pendingCells to begin with, so createRegion's own
    // whole-set overlap check has nothing left to reject.
    act(() => {
      view.result.current.handleCreate('hallway', 'corridor');
    });
    expect(getDoc().regions.map((r) => r.id)).toEqual(['entrance', 'hallway']);
  });
});

describe('useRegionEditing — editing an existing SELECTED region', () => {
  function selectRegionSetup() {
    const s = setup();
    s.commitRegion('owner', 'chamber', [[8, 8]]);
    s.commitRegion('target', 'chamber', [[2, 2]]);
    act(() => {
      s.view.result.current.selectRegion('target');
    });
    return s;
  }

  it('adds a legal cell via addCellToRegion, no toast', () => {
    const s = selectRegionSetup();
    act(() => {
      s.view.result.current.beginStroke();
      s.view.result.current.setSelectedRegionCellMembership([3, 2], true);
      s.view.result.current.endStroke();
    });
    expect(s.flashToast).not.toHaveBeenCalled();
    const region = s.getDoc().regions.find((r) => r.id === 'target');
    expect(region?.cells).toEqual(
      expect.arrayContaining([
        [2, 2],
        [3, 2],
      ])
    );
  });

  it('an ADD that collides with another region is skipped and accumulated into the stroke summary, not applied and not immediately toasted', () => {
    const s = selectRegionSetup();
    act(() => {
      s.view.result.current.beginStroke();
      s.view.result.current.setSelectedRegionCellMembership([8, 8], true); // owned by 'owner'
      s.view.result.current.setSelectedRegionCellMembership([3, 2], true); // legal
    });
    expect(s.flashToast).not.toHaveBeenCalled();

    act(() => {
      s.view.result.current.endStroke();
    });
    expect(s.flashToast).toHaveBeenCalledWith(
      "painted 1, skipped 1 cell owned by 'owner'"
    );
    const region = s.getDoc().regions.find((r) => r.id === 'target');
    expect(region?.cells.some((c) => c[0] === 8 && c[1] === 8)).toBe(false);
  });

  it('a non-overlap rejection (contiguity) still surfaces an IMMEDIATE toast, unchanged from before this round', () => {
    const s = selectRegionSetup();
    act(() => {
      s.view.result.current.beginStroke();
      // [19,19] is nowhere near 'target's existing cell [2,2] — a real
      // contiguity break, not an overlap.
      s.view.result.current.setSelectedRegionCellMembership([19, 19], true);
    });
    expect(s.flashToast).toHaveBeenCalledWith(
      expect.stringMatching(/contiguous/)
    );
  });
});

describe('useRegionEditing — handleCreate (all-or-nothing Create-button path)', () => {
  it('an overlap rejection from a hand-edited pendingCells set still flashes conflictFlash with the real colliding cells', () => {
    // This path is defense-in-depth (the per-cell brush pre-check means
    // pendingCells should never itself contain an owned cell in practice
    // — see this file's own header comment) — exercised here by
    // painting into pendingCells via the hook, then committing a region
    // over that SAME cell out from under it (simulating a hand-edited
    // YAML pane change) before Create is clicked.
    const { view, flashToast, commitRegion } = setup();
    act(() => {
      view.result.current.setPendingCellMembership([9, 9], true);
    });
    commitRegion('late', 'chamber', [[9, 9]]);

    act(() => {
      view.result.current.handleCreate('new-region', 'chamber');
    });

    expect(flashToast).toHaveBeenCalledWith("1 cell already belongs to 'late'");
    expect(view.result.current.conflictFlash).toEqual({
      cells: [[9, 9]],
      ownerId: 'late',
      ownerName: undefined,
    });
  });
});
