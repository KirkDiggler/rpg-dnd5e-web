/**
 * useBoardEditing — the palette/placement editing core, extracted from
 * `DungeonBuilderConcept.tsx` into its own module (graduation audit item:
 * it was already cleanly factored as a standalone hook, just living in
 * the wrong file). It's the part of edit mode's board interaction that
 * "New Dungeon" needs verbatim once it authors onto its OWN cst/
 * DungeonDoc instead of the bespoke CreationState (CONTRACT.md's
 * "unifying New Dungeon onto the shared CST" section). Called once per
 * mode with that mode's own `cst`/`doc`/`syncFromCst`, rather than
 * duplicated: placement selection is a `ref` at a `[col,row]`,
 * room-scoped (`roomId` a real id) or top-level (`roomId: null`,
 * TARGET-YAML.md's "top-level placement" section) —
 * `handlePlace`/`handleMove`/etc. below already generalize over both via
 * dungeonYaml.ts's own `roomId: string | null` mutators, so this hook
 * needs no special-casing per mode; only the SURROUNDING board/palette/
 * wall handling differs per mode, and stays defined in
 * `DungeonBuilderConcept.tsx` where it's called.
 */
import { useState } from 'react';
import type { Document } from 'yaml';
import {
  deletePlacement,
  moveBoss,
  movePlacement,
  movePlacementAcrossLists,
  placeItem,
  setBossFacing,
  setBossTargeting,
  setPlacementFacing,
  setPlacementFlags,
  setPlacementHeight,
  setPlacementMount,
  setPlacementRotationDegrees,
  setPlacementTargeting,
  type DungeonDoc,
  type Mount,
} from './dungeonYaml';
import type { PaletteSelection, PlacementSelection } from './types';

export function useBoardEditing(
  cst: Document,
  doc: DungeonDoc,
  syncFromCst: (cst: Document) => void,
  flashToast?: (message: string) => void
) {
  const [selectedPalette, setSelectedPalette] =
    useState<PaletteSelection | null>(null);
  const [selectedPlacement, setSelectedPlacement] =
    useState<PlacementSelection | null>(null);

  const handlePlace = (roomId: string | null, at: [number, number]) => {
    if (!selectedPalette) return;
    const isMonster = selectedPalette.kind === 'monster';
    if (selectedPalette.kind === 'boss') {
      // Boss stays room-scoped even in the target dialect (moveBoss
      // requires a real roomId) — callers arming the boss tool over a
      // roomless canvas are expected to reject before ever reaching
      // here (CreationBoard.tsx does), so this is a defensive backstop,
      // not the primary guard.
      if (roomId === null) return;
      moveBoss(cst, roomId, at);
      flashToast?.('Boss pin placed.');
    } else {
      placeItem(cst, roomId, selectedPalette.ref, at);
      if (isMonster) {
        flashToast?.(
          'Monster placed — blocks_movement/blocks_los are forced off and disabled (dungeonspec.Validate rejects both flags on monster placements).'
        );
      }
    }
    syncFromCst(cst);
  };

  const handleMove = (
    sel: PlacementSelection,
    roomId: string | null,
    at: [number, number]
  ) => {
    if (sel.boss) {
      // A boss never leaves its own room (Board.tsx's own pointer-up
      // handler already rejects a cross-room boss drop before onMove is
      // ever called) — sel.roomId is the real, non-null id to use here,
      // not the destination `roomId` parameter (which stays nullable to
      // cover the non-boss, top-level case).
      moveBoss(cst, sel.roomId, at);
      syncFromCst(cst);
      return;
    }
    if (roomId === sel.roomId) {
      movePlacement(cst, sel.roomId, sel.index, at);
      syncFromCst(cst);
      setSelectedPlacement({ roomId, index: sel.index });
      return;
    }
    // Cross-list move (room-scoped <-> top-level, or between two rooms):
    // `movePlacementAcrossLists` preserves every field (facing/mount/
    // height/rotate_degrees/targeting/blocks_*), not just ref+at — the
    // naive delete+placeItem shape this used to be silently dropped all
    // of those (2026-08-02 graduation audit finding). It also returns
    // the item's real new index directly, rather than this caller
    // re-deriving it from possibly-stale `doc` state via a
    // `.find(...)!.place.length` that used to throw outright for a
    // roomId: null destination (no room has id null to find).
    const item = sel.roomId
      ? doc.rooms.find((r) => r.id === sel.roomId)?.place[sel.index]
      : doc.place[sel.index];
    if (!item) return;
    const newIndex = movePlacementAcrossLists(
      cst,
      sel.roomId,
      sel.index,
      roomId,
      at,
      item
    );
    syncFromCst(cst);
    setSelectedPlacement({ roomId, index: newIndex });
  };

  const handleDelete = () => {
    if (!selectedPlacement || selectedPlacement.boss) return;
    deletePlacement(cst, selectedPlacement.roomId, selectedPlacement.index);
    setSelectedPlacement(null);
    syncFromCst(cst);
  };

  const handleSetFlags = (blocksMovement: boolean, blocksLos: boolean) => {
    if (!selectedPlacement || selectedPlacement.boss) return;
    setPlacementFlags(cst, selectedPlacement.roomId, selectedPlacement.index, {
      blocksMovement,
      blocksLos,
    });
    syncFromCst(cst);
  };

  // Boss entries have no mount/height (bosses aren't wall furniture) —
  // only place: entries do, matching Inspector.tsx's own gate. Two
  // separate handlers, not one — mount/height are DECOUPLED (Kirk-batch,
  // 2026-08-02: "height: decouples from mount... any placement may carry
  // height"), matching `setPlacementMount`'s/`setPlacementHeight`'s own
  // now-independent shape.
  const handleSetMount = (mount: Mount) => {
    if (!selectedPlacement || selectedPlacement.boss) return;
    setPlacementMount(
      cst,
      selectedPlacement.roomId,
      selectedPlacement.index,
      mount
    );
    syncFromCst(cst);
  };

  const handleSetHeight = (height: number | null) => {
    if (!selectedPlacement || selectedPlacement.boss) return;
    setPlacementHeight(
      cst,
      selectedPlacement.roomId,
      selectedPlacement.index,
      height
    );
    syncFromCst(cst);
  };

  // EXPERIMENT, not a target-dialect field (Inspector.tsx's own
  // ExperimentBadge doc comment) — boss-excluded, same gate as
  // handleSetMount/handleSetHeight (a boss is never wall-mounted and
  // never carries a fine-rotation nudge either). Generalized
  // (2026-08-03) to any non-monster place: entry, floor-standing
  // included — this handler itself never checked `mount`, only the
  // Inspector's render condition used to.
  const handleSetRotationDegrees = (rotationDegrees: number | null) => {
    if (!selectedPlacement || selectedPlacement.boss) return;
    setPlacementRotationDegrees(
      cst,
      selectedPlacement.roomId,
      selectedPlacement.index,
      rotationDegrees
    );
    syncFromCst(cst);
  };

  // "Snap flush to nearest wall" (fine-rotation generalization round,
  // Kirk's 2026-08-03 ask: a fine-tune slider alone makes him do
  // trigonometry by feel) — sets BOTH facing and rotationDegrees at once
  // to the pre-validated pair the Inspector already computed via
  // `boardGeometry.ts`'s `computeFlushRotation`. Two separate mutator
  // calls rather than one combined one: `setPlacementFacing`/
  // `setPlacementRotationDegrees` already exist as independent single-
  // field mutators (matching this concept's general "each field has its
  // own setter" shape — `setPlacementMount`/`setPlacementHeight` are the
  // same pair, decoupled on purpose), and both act on the SAME
  // (roomId, index) without moving the item, so calling them back to
  // back against the same live `cst` is safe — no stale-index risk the
  // way a cross-list move (`handleFlipMountSide`) has to guard against.
  const handleSnapFlush = (target: {
    facing: number;
    rotationDegrees: number;
  }) => {
    if (!selectedPlacement || selectedPlacement.boss) return;
    setPlacementFacing(
      cst,
      selectedPlacement.roomId,
      selectedPlacement.index,
      target.facing
    );
    setPlacementRotationDegrees(
      cst,
      selectedPlacement.roomId,
      selectedPlacement.index,
      target.rotationDegrees
    );
    syncFromCst(cst);
  };

  const handleSetTargeting = (targeting: string | null) => {
    if (!selectedPlacement) return;
    if (selectedPlacement.boss) {
      setBossTargeting(cst, selectedPlacement.roomId, targeting);
    } else {
      setPlacementTargeting(
        cst,
        selectedPlacement.roomId,
        selectedPlacement.index,
        targeting
      );
    }
    syncFromCst(cst);
  };

  const handleSetFacing = (facing: number | null) => {
    if (!selectedPlacement) return;
    if (selectedPlacement.boss) {
      setBossFacing(cst, selectedPlacement.roomId, facing);
    } else {
      setPlacementFacing(
        cst,
        selectedPlacement.roomId,
        selectedPlacement.index,
        facing
      );
    }
    syncFromCst(cst);
  };

  // Wall-mount edge-selection rework, part 2 (Inspector.tsx's own
  // `onFlipMountSide` doc comment) — the Inspector already validated
  // `target` against a real floor cell before ever calling this, so this
  // handler's job is purely the mutation: a cross-list move (via
  // `movePlacementAcrossLists`, which preserves every field) carrying
  // the NEW mirrored facing instead of the old one. Boss-excluded, same
  // gate every other placement-only handler here uses — a boss is never
  // wall-mounted.
  const handleFlipMountSide = (target: {
    roomId: string;
    at: [number, number];
    newFacing: number;
  }) => {
    if (!selectedPlacement || selectedPlacement.boss) return;
    const item = selectedPlacement.roomId
      ? doc.rooms.find((r) => r.id === selectedPlacement.roomId)?.place[
          selectedPlacement.index
        ]
      : doc.place[selectedPlacement.index];
    if (!item) return;
    const newIndex = movePlacementAcrossLists(
      cst,
      selectedPlacement.roomId,
      selectedPlacement.index,
      target.roomId,
      target.at,
      { ...item, facing: target.newFacing }
    );
    syncFromCst(cst);
    setSelectedPlacement({ roomId: target.roomId, index: newIndex });
  };

  return {
    selectedPalette,
    setSelectedPalette,
    selectedPlacement,
    setSelectedPlacement,
    handlePlace,
    handleMove,
    handleDelete,
    handleSetFlags,
    handleSetMount,
    handleSetHeight,
    handleSetRotationDegrees,
    handleSnapFlush,
    handleSetTargeting,
    handleSetFacing,
    handleFlipMountSide,
  };
}

/** The `useBoardEditing` handle — exported so `CreationBoard.tsx`/
 * `CreationConcept.tsx` can type the `edit` prop they receive without
 * re-deriving the same shape. */
export type BoardEditing = ReturnType<typeof useBoardEditing>;
