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
 *
 * **Region-brush honesty round (2026-08-06)**: Kirk, live authoring —
 * (a) an overlap rejection named neither the colliding cells nor the
 * region that owned them; (b) his own diagnosis of why: his first
 * region's brush swept up a straight wall's FOOTPRINT cells (they read as
 * "the wall," not "claimed floor"), so painting a SECOND region up to the
 * same wall from the other side collided on that band, and the generic
 * message sent him hunting blind. Two changes here:
 *
 * 1. **`setPendingCellMembership`/`setSelectedRegionCellMembership` now
 *    pre-check overlap PER CELL** (`findRegionCellOverlap`, one cell at a
 *    time — cheap, and the only shape a brush stroke ever asks) instead of
 *    silently accepting anything into `pendingCells` and only discovering
 *    the collision at a whole-set `handleCreate` call (genuinely
 *    all-or-nothing before this round — see git history). A colliding
 *    cell is never added; it's recorded into the ACTIVE stroke's
 *    accumulator (`beginStroke`/`endStroke` below) instead of flashing an
 *    immediate per-cell toast, so a drag crossing 4 owned cells doesn't
 *    flood 4 toasts (each replacing the last — `DungeonBuilderConcept.tsx`'s
 *    `flashToast` is a single-slot, no queue) and lose all but the final
 *    one. Non-overlap rejections (contiguity, disconnect-on-erase,
 *    last-cell-removal) are unaffected — still immediate, unchanged; they
 *    aren't the flood-prone case this round targets.
 * 2. **`beginStroke`/`endStroke` bracket one paint gesture** (a single
 *    click is just a 1-cell stroke — `CreationBoard.tsx` brackets both the
 *    same way) and flush ONE honest summary at the end: "painted 12,
 *    skipped 4 owned by 'entrance'". Silent when nothing was skipped —
 *    matches this concept's existing "no toast on a clean success"
 *    convention (wall/hole painting shows none either). `conflictFlash`
 *    is the visual half — the exact skipped/rejected cells, for
 *    `CreationBoard.tsx`'s own flash-highlight overlay — shared with
 *    `handleCreate`'s own all-or-nothing rejection path below, which sets
 *    the SAME state so a Create-button collision gets the identical
 *    evidence a brush-stroke skip does.
 */
import { useEffect, useRef, useState } from 'react';
import type { Document } from 'yaml';
import {
  addCellToRegion,
  connectRegions,
  createRegion,
  deleteRegion,
  findRegionCellOverlap,
  pluralCount,
  RegionValidationError,
  removeCellFromRegion,
  renameRegion,
  setRegionArchetype,
  type DungeonDoc,
} from '../dungeonYaml';
import type { Cell } from '../regionGeometry';
import { OVERLAP_SAMPLE_CELLS } from '../regionTree';

function cellIn(cells: readonly Cell[], cell: Cell): boolean {
  return cells.some((c) => c[0] === cell[0] && c[1] === cell[1]);
}

/** The evidence a rejected paint/create action surfaces on the board —
 * `CreationBoard.tsx` flash-highlights exactly `cells`, the toast (already
 * flashed by whoever set this) names `ownerName ?? ownerId` separately. */
export interface RegionConflictFlash {
  cells: Cell[];
  ownerId: string;
  ownerName?: string;
}

/** One in-progress brush stroke's tally — `painted` counts cells actually
 * applied (add OR erase, whichever this stroke's mode is), `skippedByOwner`
 * buckets add-mode overlap skips by the region that already owns them
 * (almost always one bucket; a stroke that grazes two different regions'
 * territory gets two). Erase-mode strokes never populate `skippedByOwner`
 * — removing a cell can't collide with anything — so `endStroke` is a
 * silent no-op for them, same as a fully clean add stroke. */
interface StrokeStats {
  painted: number;
  skippedByOwner: Map<string, { name?: string; count: number; cells: Cell[] }>;
}

export function useRegionEditing(
  cst: Document,
  doc: DungeonDoc,
  syncFromCst: (cst: Document) => void,
  flashToast: (message: string) => void
) {
  const [pendingCells, setPendingCells] = useState<Cell[]>([]);
  /** Mirrors `pendingCells`, updated SYNCHRONOUSLY and manually on every
   * write (never via a `useState` updater callback) — the authoritative
   * "current membership" source for `setPendingCellMembership`'s own
   * decision-making (Copilot review, PR #714). React does not guarantee
   * a `setState(prev => ...)` updater runs synchronously the moment the
   * setter is called — under batching it can be deferred, which broke an
   * earlier attempt at this fix that tried to read a closure variable
   * assigned INSIDE the updater immediately after calling `setPendingCells`
   * (verified broken by this file's own tests: `painted` undercounted
   * every time more than one mutation landed in the same `act()`/batch).
   * A plain ref sidesteps the whole question — every mutator below reads
   * and writes `pendingCellsRef.current` directly and synchronously, then
   * mirrors the result into React state via `commitPendingCells` purely
   * for rendering; the ref is the source of truth for the NEXT mutator
   * call to reason about, drag or no drag, batch or no batch. */
  const pendingCellsRef = useRef<Cell[]>([]);
  const commitPendingCells = (next: Cell[]) => {
    pendingCellsRef.current = next;
    setPendingCells(next);
  };
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  /** The id `createRegion` just successfully created — drives
   * `RegionPanel.tsx`'s "Connect to '<previous region>'?" callout. Cleared
   * by selecting/deleting/connecting, so it never lingers past the moment
   * it's relevant. */
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  /** The board's own flash-highlight evidence for the MOST RECENT
   * rejected/partial paint or create — see this file's own header comment
   * ("Region-brush honesty round"). `null` when nothing is currently
   * flashing. */
  const [conflictFlash, setConflictFlashState] =
    useState<RegionConflictFlash | null>(null);
  const conflictFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Clears any pending auto-clear timer on unmount (Copilot review, PR
  // #714) — without this, a timer started right before the owning
  // component unmounts would still fire `setConflictFlashState` on a
  // gone component, and would keep running regardless.
  useEffect(() => {
    return () => {
      if (conflictFlashTimer.current) {
        clearTimeout(conflictFlashTimer.current);
        conflictFlashTimer.current = null;
      }
    };
  }, []);
  /** Sets `conflictFlash` and (re)starts its auto-clear timer — same
   * 3200ms window `DungeonBuilderConcept.tsx`'s `flashToast` uses for the
   * paired toast, so the highlight and the message it explains fade
   * together. */
  const flashConflict = (
    cells: Cell[],
    ownerId: string,
    ownerName?: string
  ) => {
    setConflictFlashState({ cells, ownerId, ownerName });
    if (conflictFlashTimer.current) clearTimeout(conflictFlashTimer.current);
    conflictFlashTimer.current = setTimeout(
      () => setConflictFlashState(null),
      3200
    );
  };
  /** The currently in-progress brush stroke's tally, or `null` between
   * strokes — a `useRef`, not `useState`: it's written many times per
   * stroke (every cell the drag crosses) and read only once, at
   * `endStroke`, so it never needs to drive a render itself. */
  const strokeStatsRef = useRef<StrokeStats | null>(null);

  /** Starts accumulating a new brush stroke's paint/skip tally —
   * `CreationBoard.tsx` calls this once, right before the FIRST cell's
   * own mutator call, for every region-tool paint gesture (a plain click
   * is just a 1-cell stroke, bracketed the same way). */
  const beginStroke = () => {
    strokeStatsRef.current = { painted: 0, skippedByOwner: new Map() };
  };

  /** Records one cell the active stroke couldn't paint because another
   * region already owns it. Falls back to an immediate single-cell toast
   * when called OUTSIDE an active stroke (defensive — every real caller
   * today always brackets with `beginStroke`/`endStroke`, but a future
   * direct caller still gets a truthful message instead of a silently
   * swallowed skip). */
  const recordOverlapSkip = (
    cell: Cell,
    overlap: { ownerId: string; ownerName?: string }
  ) => {
    const stats = strokeStatsRef.current;
    if (!stats) {
      const label = overlap.ownerName ?? overlap.ownerId;
      flashToast(`cell [${cell[0]},${cell[1]}] already belongs to '${label}'`);
      flashConflict([cell], overlap.ownerId, overlap.ownerName);
      return;
    }
    const entry = stats.skippedByOwner.get(overlap.ownerId) ?? {
      name: overlap.ownerName,
      count: 0,
      cells: [] as Cell[],
    };
    entry.count++;
    if (entry.cells.length < OVERLAP_SAMPLE_CELLS) entry.cells.push(cell);
    stats.skippedByOwner.set(overlap.ownerId, entry);
  };

  /** Ends the active brush stroke and, if anything was skipped, flushes
   * ONE honest summary — "painted 12, skipped 4 owned by 'entrance'" —
   * instead of the per-cell toast flood a naive "call flashToast on every
   * rejection" loop would produce (`DungeonBuilderConcept.tsx`'s
   * `flashToast` is single-slot; only the LAST of many rapid calls would
   * ever have been visible). Silent when the stroke painted cleanly — no
   * `skippedByOwner` entries — matching this concept's "no toast on a
   * clean success" convention elsewhere (wall/hole painting shows none
   * either). Safe to call with no active stroke (every tool's
   * `handlePointerUp` in `CreationBoard.tsx` is shared, so this fires on
   * every pointer-up regardless of which tool was active). */
  const endStroke = () => {
    const stats = strokeStatsRef.current;
    strokeStatsRef.current = null;
    if (!stats || stats.skippedByOwner.size === 0) return;
    const parts: string[] = [];
    const flashCells: Cell[] = [];
    let firstOwner: { ownerId: string; ownerName?: string } | null = null;
    for (const [ownerId, entry] of stats.skippedByOwner) {
      const label = entry.name ?? ownerId;
      parts.push(`${pluralCount(entry.count, 'cell')} owned by '${label}'`);
      flashCells.push(...entry.cells);
      if (!firstOwner) firstOwner = { ownerId, ownerName: entry.name };
    }
    flashToast(`painted ${stats.painted}, skipped ${parts.join('; ')}`);
    flashConflict(flashCells, firstOwner!.ownerId, firstOwner!.ownerName);
  };

  const reportError = (err: unknown) => {
    flashToast(
      err instanceof RegionValidationError ? err.message : String(err)
    );
  };

  /** Toggle a cell in the NOT-YET-CREATED region's pending set — the
   * Region tool's paint interaction before a region exists at all.
   * Deliberately does not validate contiguity on every click (that would
   * make painting a shape one cell at a time impossible the moment two
   * disconnected starting clicks land) — contiguity validation runs once,
   * at `handleCreate`, via `dungeonYaml.ts`'s own `createRegion`. Overlap
   * is a separate concern from contiguity (a single cell either belongs
   * to an existing region or it doesn't, independent of the pending set's
   * eventual shape) and is NOT deferred — see `setPendingCellMembership`
   * below, the caller every real interaction actually uses. */
  const togglePendingCell = (cell: Cell) => {
    const prev = pendingCellsRef.current;
    commitPendingCells(
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
   * behavior — it only makes the multi-cell case correct.
   *
   * **Region-brush honesty round**: an ADD that collides with an existing
   * region's cell is now rejected PER CELL, right here, instead of
   * silently entering `pendingCells` and only surfacing at a later
   * whole-set `handleCreate` call — this is what makes painting a second
   * region up against a wall a first-class-legal band NOT collide
   * invisibly (see this file's own header comment). A rejected cell is
   * recorded into the active stroke's tally (`recordOverlapSkip`), never
   * added.
   *
   * **Membership is decided against `pendingCellsRef`, never the
   * render-closure `pendingCells` state variable** (Copilot review, PR
   * #714) — a drag fires many of these calls in quick succession, and
   * reading `pendingCells` (or trying to smuggle the outcome out of a
   * `useState` updater callback via a closed-over variable — a first
   * attempt at this fix that this file's own tests caught as broken:
   * `setState` updaters are not guaranteed to run synchronously the
   * instant the setter is called, so code reading that variable
   * immediately after could observe stale `false`/`null` even though the
   * update landed correctly) risks a stale snapshot under React's
   * batching. `pendingCellsRef.current` is written manually and
   * synchronously by `commitPendingCells` on every mutation, so it is
   * ALWAYS the true current membership, independent of when React
   * chooses to re-render or flush a batch. An absent cell's erase is a
   * genuine no-op (ref left untouched, nothing counted), matching
   * `painted`'s own contract: it counts cells actually applied, not
   * cells merely touched. */
  const setPendingCellMembership = (cell: Cell, included: boolean) => {
    const prev = pendingCellsRef.current;
    if (!included) {
      const has = cellIn(prev, cell);
      if (!has) return; // already absent — true no-op, nothing to commit or count
      commitPendingCells(
        prev.filter((c) => !(c[0] === cell[0] && c[1] === cell[1]))
      );
      if (strokeStatsRef.current) strokeStatsRef.current.painted++;
      return;
    }
    if (cellIn(prev, cell)) return; // already present — true no-op
    const overlap = findRegionCellOverlap(doc, [cell]);
    if (overlap) {
      recordOverlapSkip(cell, overlap);
      return;
    }
    commitPendingCells([...prev, cell]);
    if (strokeStatsRef.current) strokeStatsRef.current.painted++;
  };

  const clearPending = () => commitPendingCells([]);

  /** Select an existing region for membership/metadata editing, or `null`
   * to deselect. Always clears any in-progress NEW-region paint session —
   * the two are mutually exclusive board states (painting a fresh region
   * vs. editing an existing one), same as every other selection-pair in
   * this concept. */
  const selectRegion = (regionId: string | null) => {
    setSelectedRegionId(regionId);
    commitPendingCells([]);
    setJustCreatedId(null);
  };

  const handleCreate = (id: string, archetype: string, name?: string) => {
    try {
      createRegion(cst, doc, id, archetype, pendingCellsRef.current, name);
      syncFromCst(cst);
      commitPendingCells([]);
      setJustCreatedId(id);
    } catch (err) {
      reportError(err);
      // The per-cell overlap pre-check in `setPendingCellMembership` means
      // `pendingCells` should never itself contain an owned cell by the
      // time Create is clicked — but a hand-edited YAML pane change to
      // `regions:` between painting and clicking Create (or a future
      // caller that bypasses the brush) could still produce this
      // rejection here, so the SAME evidence still surfaces: re-derive
      // which cells collide with which region and flash them, exactly
      // like a brush-stroke skip would.
      const overlap = findRegionCellOverlap(doc, pendingCellsRef.current);
      if (overlap) {
        flashConflict(overlap.cells, overlap.ownerId, overlap.ownerName);
      }
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
   * stroke crosses, not re-toggle each one.
   *
   * **Region-brush honesty round**: an ADD overlap is now pre-checked
   * (`findRegionCellOverlap`) and recorded into the active stroke's tally
   * (`recordOverlapSkip`) WITHOUT even attempting `addCellToRegion` — same
   * "skip silently into the summary, don't flood a toast" treatment
   * `setPendingCellMembership` gives the not-yet-created-region path.
   * Every OTHER rejection (contiguity on add; disconnect/last-cell on
   * erase) still goes through `addCellToRegion`/`removeCellFromRegion`
   * and still surfaces as an IMMEDIATE toast, unchanged from before this
   * round — those aren't the flood-prone "many already-owned cells in one
   * stroke" case this round targets. */
  const setSelectedRegionCellMembership = (cell: Cell, included: boolean) => {
    if (!selectedRegionId) return;
    const region = doc.regions.find((r) => r.id === selectedRegionId);
    if (!region) return;
    const has = cellIn(region.cells, cell);
    if (included === has) return;
    if (included) {
      const overlap = findRegionCellOverlap(doc, [cell], selectedRegionId);
      if (overlap) {
        recordOverlapSkip(cell, overlap);
        return;
      }
    }
    try {
      if (included) {
        addCellToRegion(cst, doc, selectedRegionId, cell);
      } else {
        removeCellFromRegion(cst, doc, selectedRegionId, cell);
      }
      syncFromCst(cst);
      if (strokeStatsRef.current) strokeStatsRef.current.painted++;
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
    /** Board-side evidence for the most recent rejected/partial paint or
     * create — `CreationBoard.tsx` renders `conflictFlash.cells` as a
     * flash-highlight overlay. See this file's own header comment. */
    conflictFlash,
    /** Brackets one paint gesture (drag OR a plain click, which is just a
     * 1-cell stroke) — `CreationBoard.tsx` calls `beginStroke` right
     * before the FIRST cell's own mutator call and `endStroke` from its
     * shared `handlePointerUp`. */
    beginStroke,
    endStroke,
  };
}

export type RegionEditing = ReturnType<typeof useRegionEditing>;
