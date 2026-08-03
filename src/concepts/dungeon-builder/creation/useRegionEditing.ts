/**
 * useRegionEditing — cell-authored semantic region editing state
 * (rpg-project#180, "cell-authored semantic room regions"). Same shape as
 * `useBoardEditing.ts`: owns the UI-only state a board's Region tool needs
 * (which cells are pending for a not-yet-created region; which existing
 * region, if any, is selected for membership editing) and wraps
 * `dungeonYaml.ts`'s region mutators with `RegionValidationError`-to-toast
 * handling, so `CreationBoard.tsx`'s pointer handlers and `RegionPanel.tsx`'s
 * buttons stay thin — neither has to know dungeonspec#180's own
 * contiguity/overlap rules, only that a rejected edit surfaces as a toast.
 *
 * Creation-mode-only this round (TARGET-YAML.md's "regions:" section) —
 * there is no edit-mode equivalent of this hook yet; edit mode renders any
 * authored `regions:` read-only (`Board.tsx`), it just doesn't offer a way
 * to create/edit them.
 */
import { useState } from 'react';
import type { Document } from 'yaml';
import {
  addCellToRegion,
  connectRegions,
  createRegion,
  deleteRegion,
  RegionValidationError,
  removeCellFromRegion,
  renameRegion,
  setRegionArchetype,
  type DungeonDoc,
} from '../dungeonYaml';
import type { Cell } from '../regionGeometry';

function cellIn(cells: readonly Cell[], cell: Cell): boolean {
  return cells.some((c) => c[0] === cell[0] && c[1] === cell[1]);
}

export function useRegionEditing(
  cst: Document,
  doc: DungeonDoc,
  syncFromCst: (cst: Document) => void,
  flashToast: (message: string) => void
) {
  const [pendingCells, setPendingCells] = useState<Cell[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  /** The id `createRegion` just successfully created — drives
   * `RegionPanel.tsx`'s "Connect to '<previous region>'?" callout. Cleared
   * by selecting/deleting/connecting, so it never lingers past the moment
   * it's relevant. */
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  const reportError = (err: unknown) => {
    flashToast(
      err instanceof RegionValidationError ? err.message : String(err)
    );
  };

  /** Toggle a cell in the NOT-YET-CREATED region's pending set — the
   * Region tool's paint interaction before a region exists at all.
   * Deliberately does not validate contiguity/overlap on every click
   * (that would make painting a shape one cell at a time impossible the
   * moment two disconnected starting clicks land) — validation runs once,
   * at `handleCreate`, via `dungeonYaml.ts`'s own `createRegion`. */
  const togglePendingCell = (cell: Cell) => {
    setPendingCells((prev) =>
      cellIn(prev, cell)
        ? prev.filter((c) => !(c[0] === cell[0] && c[1] === cell[1]))
        : [...prev, cell]
    );
  };

  /** IDEMPOTENT pending-cell membership setter — `included: true` adds
   * only if absent, `false` removes only if present, a no-op otherwise.
   * Exists alongside `togglePendingCell` for a genuinely different
   * caller shape: a DRAG (`CreationBoard.tsx`'s region-brush pointer-move
   * loop, 2026-08-03 — Kirk's ask, "building a region should have us draw
   * the shape... right now we have to click every square") decides ONE
   * add-vs-erase mode for the whole stroke up front (mirroring the
   * wall-drawing stroke's own `addMode`, decided from the first edge
   * touched) and then needs to apply that SAME mode to every cell the
   * pointer passes over — a bare toggle would flip a cell back off the
   * instant the drag re-enters one it already painted, or paint the WRONG
   * direction for a cell that happened to already be a member before the
   * drag started. A single click still reads as a toggle to the author
   * (`CreationBoard.tsx` computes `included = !cellIn(pendingCells, cell)`
   * for the drag's own first cell), so this doesn't change single-click
   * behavior — it only makes the multi-cell case correct. */
  const setPendingCellMembership = (cell: Cell, included: boolean) => {
    setPendingCells((prev) => {
      const has = cellIn(prev, cell);
      if (included === has) return prev;
      return included
        ? [...prev, cell]
        : prev.filter((c) => !(c[0] === cell[0] && c[1] === cell[1]));
    });
  };

  const clearPending = () => setPendingCells([]);

  /** Select an existing region for membership/metadata editing, or `null`
   * to deselect. Always clears any in-progress NEW-region paint session —
   * the two are mutually exclusive board states (painting a fresh region
   * vs. editing an existing one), same as every other selection-pair in
   * this concept. */
  const selectRegion = (regionId: string | null) => {
    setSelectedRegionId(regionId);
    setPendingCells([]);
    setJustCreatedId(null);
  };

  const handleCreate = (id: string, archetype: string, name?: string) => {
    try {
      createRegion(cst, doc, id, archetype, pendingCells, name);
      syncFromCst(cst);
      setPendingCells([]);
      setJustCreatedId(id);
    } catch (err) {
      reportError(err);
    }
  };

  /** Toggle board-cell membership on the currently SELECTED region (edit
   * mode of the panel, not the create-new-region paint mode above) —
   * add if not a member, remove if it is. */
  const handleToggleCellOnSelected = (cell: Cell) => {
    if (!selectedRegionId) return;
    const region = doc.regions.find((r) => r.id === selectedRegionId);
    if (!region) return;
    try {
      if (cellIn(region.cells, cell)) {
        removeCellFromRegion(cst, doc, selectedRegionId, cell);
      } else {
        addCellToRegion(cst, doc, selectedRegionId, cell);
      }
      syncFromCst(cst);
    } catch (err) {
      reportError(err);
    }
  };

  /** IDEMPOTENT sibling of `handleToggleCellOnSelected`, same reason
   * `setPendingCellMembership` exists alongside `togglePendingCell` — the
   * region-brush drag needs to apply ONE decided mode across every cell a
   * stroke crosses, not re-toggle each one. A rejected `addCellToRegion`/
   * `removeCellFromRegion` (contiguity/overlap) surfaces as a toast per
   * cell, same as the single-click path — a drag that crosses into
   * another region's territory rejects THAT cell and keeps going, rather
   * than aborting the whole stroke. */
  const setSelectedRegionCellMembership = (cell: Cell, included: boolean) => {
    if (!selectedRegionId) return;
    const region = doc.regions.find((r) => r.id === selectedRegionId);
    if (!region) return;
    const has = cellIn(region.cells, cell);
    if (included === has) return;
    try {
      if (included) {
        addCellToRegion(cst, doc, selectedRegionId, cell);
      } else {
        removeCellFromRegion(cst, doc, selectedRegionId, cell);
      }
      syncFromCst(cst);
    } catch (err) {
      reportError(err);
    }
  };

  const handleRename = (name: string) => {
    if (!selectedRegionId) return;
    renameRegion(cst, selectedRegionId, name.trim() === '' ? null : name);
    syncFromCst(cst);
  };

  const handleSetArchetype = (archetype: string) => {
    if (!selectedRegionId) return;
    setRegionArchetype(cst, selectedRegionId, archetype);
    syncFromCst(cst);
  };

  const handleDelete = (regionId: string) => {
    deleteRegion(cst, regionId);
    syncFromCst(cst);
    if (selectedRegionId === regionId) setSelectedRegionId(null);
    if (justCreatedId === regionId) setJustCreatedId(null);
  };

  /** "Attach to next region" (Kirk's ask) — places a door edge on the
   * shared boundary via `dungeonYaml.ts`'s `connectRegions`. Surfaces "no
   * shared boundary" as a toast rather than a silent no-op, same
   * discipline every other board rejection in this concept follows
   * (`CreationBoard.tsx`'s own `onReject`). */
  const handleConnect = (regionAId: string, regionBId: string) => {
    let result;
    try {
      result = connectRegions(cst, doc, regionAId, regionBId);
    } catch (err) {
      reportError(err);
      return;
    }
    if (!result.edge) {
      flashToast("These regions don't share a boundary — nothing to connect.");
      return;
    }
    syncFromCst(cst);
    flashToast(
      `Connected — door placed at [${result.edge.from.join(',')}] ↔ [${result.edge.to.join(',')}].`
    );
    setJustCreatedId(null);
  };

  return {
    pendingCells,
    togglePendingCell,
    setPendingCellMembership,
    clearPending,
    selectedRegionId,
    selectRegion,
    justCreatedId,
    handleCreate,
    handleToggleCellOnSelected,
    setSelectedRegionCellMembership,
    handleRename,
    handleSetArchetype,
    handleDelete,
    handleConnect,
  };
}

export type RegionEditing = ReturnType<typeof useRegionEditing>;
