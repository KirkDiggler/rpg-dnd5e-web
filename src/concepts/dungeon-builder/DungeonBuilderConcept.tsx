/**
 * DungeonBuilderConcept — composition root for the /concepts port of the
 * standalone dungeon-builder HTML concept (rpg-project#170 design gate).
 * Owns the CST/doc state board clicks and YAML edits both mutate, and the
 * live-vs-fixtures data source (`usePutDungeonPreview`). See CONTRACT.md
 * for the full findings writeup — including the now-removed
 * hex-true/flattened layout toggle, explored and rejected 2026-08-02.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Document } from 'yaml';
import { Board } from './Board';
import { CollapsibleSidePanel } from './CollapsibleSidePanel';
import { ConnectorInspector } from './ConnectorInspector';
import { CreationConcept } from './creation/CreationConcept';
import type { DemoActions } from './creation/demoScript';
import { DEFAULT_CANVAS, emptyCanvasYaml } from './creation/emptyCanvasDoc';
import './DungeonBuilderConcept.css';
import {
  buildWalkItYaml,
  deletePlacement,
  DungeonParseError,
  moveBoss,
  movePlacement,
  parseDungeon,
  placeItem,
  serializeDungeon,
  setBossFacing,
  setBossTargeting,
  setConnectorLocked,
  setEnd,
  setPlacementFacing,
  setPlacementFlags,
  setPlacementMount,
  setPlacementRotationDegrees,
  setPlacementTargeting,
  setStart,
  setWallEdge,
  stripToV1Subset,
  toDungeonDoc,
  toggleHole,
  toggleWall,
  toggleWallKind,
  type DungeonDoc,
  type LockedDoc,
  type Mount,
  type WallKind,
} from './dungeonYaml';
import { SHOWCASE_YAML } from './fixtures';
import { Inspector } from './Inspector';
import { Palette } from './Palette';
import { PALETTE_PROPS } from './paletteData';
import { DungeonPreview3D } from './preview3d/DungeonPreview3D';
import { RolledContentPanel } from './RolledContentPanel';
import type { BoardTool, PaletteSelection, PlacementSelection } from './types';
import { usePutDungeonPreview } from './usePutDungeonPreview';
import { useSaveDungeon } from './useSaveDungeon';
import { WallGashExplainer } from './WallGashExplainer';
import { YamlPane } from './YamlPane';

const APPLY_DEBOUNCE_MS = 700;

type BuilderMode = 'edit' | 'create';

/** The palette/placement editing core — the part of edit mode's board
 * interaction that "New Dungeon" needs verbatim once it authors onto its
 * OWN cst/DungeonDoc instead of the bespoke CreationState (CONTRACT.md's
 * "unifying New Dungeon onto the shared CST" section). Pulled into one
 * hook, called once per mode with that mode's own `cst`/`doc`/
 * `syncFromCst`, rather than duplicated: placement selection is a `ref`
 * at a `[col,row]`, room-scoped (`roomId` a real id) or top-level
 * (`roomId: null`, TARGET-YAML.md's "top-level placement" section) —
 * `handlePlace`/`handleMove`/etc. below already generalize over both via
 * dungeonYaml.ts's own `roomId: string | null` mutators, so this hook
 * needs no special-casing per mode; only the SURROUNDING board/palette/
 * wall handling differs per mode, and stays defined separately where
 * it's called. */
function useBoardEditing(
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
    } else if (roomId === sel.roomId) {
      movePlacement(cst, sel.roomId, sel.index, at);
    } else {
      // Cross-list move (room-scoped <-> top-level, or between two
      // rooms): delete + re-place, since a placement's index is scoped
      // to whichever list it's currently in (dungeonYaml.ts's own
      // movePlacement only rewrites `at` within the SAME list).
      const item = sel.roomId
        ? doc.rooms.find((r) => r.id === sel.roomId)?.place[sel.index]
        : doc.place[sel.index];
      if (!item) return;
      deletePlacement(cst, sel.roomId, sel.index);
      placeItem(cst, roomId, item.ref, at);
    }
    syncFromCst(cst);
    if (!sel.boss) {
      setSelectedPlacement({
        roomId,
        // See DungeonBuilderConcept's own git history for the
        // off-by-one this fixed: a same-room move keeps sel.index
        // (movePlacement only rewrites `at` in place); only a genuine
        // cross-room append needs the pre-mutation destination length.
        index:
          roomId === sel.roomId
            ? sel.index
            : doc.rooms.find((r) => r.id === roomId)!.place.length,
      });
    }
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
  // only place: entries do, matching Inspector.tsx's own gate.
  const handleSetMount = (mount: Mount, height: number | null) => {
    if (!selectedPlacement || selectedPlacement.boss) return;
    setPlacementMount(
      cst,
      selectedPlacement.roomId,
      selectedPlacement.index,
      mount,
      height
    );
    syncFromCst(cst);
  };

  // EXPERIMENT, not a target-dialect field (Inspector.tsx's own
  // ExperimentBadge doc comment) — same boss-excluded gate as
  // handleSetMount, since the control only ever shows for a
  // mount: 'wall' place: entry, which a boss can never be.
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
    handleSetRotationDegrees,
    handleSetTargeting,
    handleSetFacing,
  };
}

/** The `useBoardEditing` handle — exported so `CreationBoard.tsx`/
 * `CreationConcept.tsx` can type the `edit` prop they receive without
 * re-deriving the same shape. */
export type BoardEditing = ReturnType<typeof useBoardEditing>;

export function DungeonBuilderConcept() {
  const [mode, setMode] = useState<BuilderMode>('edit');
  const initial = parseDungeon(SHOWCASE_YAML);
  const [cst, setCst] = useState(initial.cst);
  const [doc, setDoc] = useState<DungeonDoc>(initial.doc);
  const [yamlText, setYamlText] = useState(serializeDungeon(initial.cst));
  const [parseError, setParseError] = useState<string | null>(null);
  // Door/wall editing (Kirk's 2026-08-02 ask). Mutually exclusive with
  // selectedPalette/selectedPlacement (now owned by the `edit` =
  // useBoardEditing(...) call below) — every setter for one of
  // these four clears the other three, so only one floating panel
  // (Inspector/ConnectorInspector/WallGashExplainer) is ever open, same
  // discipline the existing palette/placement pair already followed.
  const [selectedConnectorIndex, setSelectedConnectorIndex] = useState<
    number | null
  >(null);
  const [wallGashExplainerOpen, setWallGashExplainerOpen] = useState(false);
  // Target-dialect board tools (Kirk's 2026-08-02 reframe, Structural/
  // Markers palette categories) — also mutually exclusive with everything
  // above, folded into the same clearOtherSelections below.
  const [selectedTool, setSelectedTool] = useState<BoardTool | null>(null);
  const [boardDim, setBoardDim] = useState<'2d' | '3d'>('2d');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Collapse state for the side panels (Kirk's 2026-08-02 ask), kept HERE
  // rather than inside Palette/YamlPane/CreationConcept — this component
  // never unmounts across an edit<->create tab switch (only the JSX
  // subtree it returns differs), so state living here is genuinely
  // "remembered per mode": edit's flags and create's flags are two
  // independent pairs that each survive leaving and returning to their
  // own mode. See CollapsibleSidePanel.tsx's own doc comment.
  const [editPaletteCollapsed, setEditPaletteCollapsed] = useState(false);
  const [editYamlCollapsed, setEditYamlCollapsed] = useState(false);
  const [createPaletteCollapsed, setCreatePaletteCollapsed] = useState(false);
  const [createYamlCollapsed, setCreateYamlCollapsed] = useState(false);

  const preview = usePutDungeonPreview(doc, yamlText);
  const save = useSaveDungeon();
  // Separate instance from `save` above — "Walk it" is an independent
  // save action (its own key, its own idle/saving/saved/invalid/error
  // lifecycle) that can succeed or fail without disturbing the main
  // Save & Play result already on screen, or vice versa.
  const walkSave = useSaveDungeon();

  // Kirk's reframe: the document may use target-dialect-only constructs. This is the
  // SAME strip usePutDungeonPreview already runs internally for the live
  // preview, computed here too so the YAML pane's compile-badge summary
  // and the Save & Play/"Save the compilable subset" swap can both read
  // it without re-deriving it twice. `null` while yamlText is mid-edit
  // and not even shape-parseable yet — every consumer below treats that
  // the same as "nothing to report."
  const v1Subset = useMemo(() => {
    try {
      return stripToV1Subset(yamlText);
    } catch {
      return null;
    }
  }, [yamlText]);

  const handleWalkIt = () => {
    const walkKey = `${doc.key}-walk`;
    walkSave.save(walkKey, buildWalkItYaml(yamlText, walkKey));
  };

  // Clears every OTHER selection kind — called at the start of each of the
  // five selection setters below so only one floating panel/tool is ever
  // active at once.
  const clearOtherSelections = (
    keep: 'palette' | 'placement' | 'connector' | 'wall-gash' | 'tool' | 'none'
  ) => {
    if (keep !== 'palette') edit.setSelectedPalette(null);
    if (keep !== 'placement') edit.setSelectedPlacement(null);
    if (keep !== 'connector') setSelectedConnectorIndex(null);
    if (keep !== 'wall-gash') setWallGashExplainerOpen(false);
    if (keep !== 'tool') setSelectedTool(null);
  };

  const handleSelectConnector = (index: number) => {
    clearOtherSelections('connector');
    setSelectedConnectorIndex(index);
  };

  const handleWallGashClick = () => {
    clearOtherSelections('wall-gash');
    setWallGashExplainerOpen(true);
  };

  const handleSelectTool = (tool: BoardTool | null) => {
    clearOtherSelections('tool');
    setSelectedTool(tool);
  };

  const handleToggleWall = (col: number, row: number) => {
    toggleWall(cst, col, row);
    syncFromCst(cst);
  };
  const handleToggleWallKind = (col: number, row: number) => {
    if (!toggleWallKind(cst, col, row)) {
      flashToast(
        'No wall here yet — select Wall and click to place one first.'
      );
      return;
    }
    syncFromCst(cst);
  };
  const handleToggleHole = (col: number, row: number) => {
    toggleHole(cst, col, row);
    syncFromCst(cst);
  };
  const handleSetPoint = (kind: 'start' | 'end', col: number, row: number) => {
    const current = kind === 'start' ? doc.start : doc.end;
    const alreadyHere = !!current && current[0] === col && current[1] === row;
    const setter = kind === 'start' ? setStart : setEnd;
    setter(cst, alreadyHere ? null : [col, row]);
    syncFromCst(cst);
  };

  const flashToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const applyText = (text: string) => {
    try {
      const parsed = parseDungeon(text);
      setCst(parsed.cst);
      setDoc(parsed.doc);
      setParseError(null);
      edit.setSelectedPlacement(null);
    } catch (err) {
      setParseError(
        err instanceof DungeonParseError ? err.message : String(err)
      );
    }
  };

  const handleChangeText = (text: string) => {
    setYamlText(text);
    if (applyDebounce.current) clearTimeout(applyDebounce.current);
    applyDebounce.current = setTimeout(
      () => applyText(text),
      APPLY_DEBOUNCE_MS
    );
  };

  useEffect(
    () => () => {
      if (applyDebounce.current) clearTimeout(applyDebounce.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  // After any board-driven CST mutation: re-derive doc, re-serialize text.
  const syncFromCst = (nextCst: typeof cst) => {
    setCst(nextCst);
    setDoc(toDungeonDoc(nextCst));
    setYamlText(serializeDungeon(nextCst));
    setParseError(null);
  };

  const handleSetConnectorLocked = (locked: LockedDoc | null) => {
    if (selectedConnectorIndex === null) return;
    setConnectorLocked(cst, selectedConnectorIndex, locked);
    syncFromCst(cst);
  };

  // Palette/placement selection + handlePlace/handleMove/handleDelete/
  // handleSetFlags/handleSetMount/handleSetTargeting/handleSetFacing —
  // see useBoardEditing's own doc comment for why this is a shared hook
  // rather than defined inline here (creation mode below calls it a
  // second time, against its own cst/doc).
  const edit = useBoardEditing(cst, doc, syncFromCst, flashToast);

  // "New Dungeon" — the SAME cst/DungeonDoc shape edit mode uses, seeded
  // from an empty target-dialect-only canvas (creation/emptyCanvasDoc.ts —
  // rooms: [], placements live in the top-level place: field) instead of a real
  // dungeon, and its own useBoardEditing instance so its palette/
  // placement selection is independent of edit mode's (same "remembered
  // per mode" precedent the collapse-state pairs above already set). See
  // CONTRACT.md's "unifying New Dungeon onto the shared CST" section.
  const creationInitial = parseDungeon(
    emptyCanvasYaml(DEFAULT_CANVAS.width, DEFAULT_CANVAS.height)
  );
  const [creationCst, setCreationCst] = useState(creationInitial.cst);
  const [creationDoc, setCreationDoc] = useState<DungeonDoc>(
    creationInitial.doc
  );
  const [creationYamlText, setCreationYamlText] = useState(
    serializeDungeon(creationInitial.cst)
  );
  const [creationSelectedTool, setCreationSelectedTool] =
    useState<BoardTool | null>('wall');
  const [creationParseError, setCreationParseError] = useState<string | null>(
    null
  );
  const creationApplyDebounce = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const syncFromCreationCst = (nextCst: typeof creationCst) => {
    setCreationCst(nextCst);
    setCreationDoc(toDungeonDoc(nextCst));
    setCreationYamlText(serializeDungeon(nextCst));
    setCreationParseError(null);
  };

  const creationEdit = useBoardEditing(
    creationCst,
    creationDoc,
    syncFromCreationCst,
    flashToast
  );

  const handleCreationToggleWallEdge = (
    from: [number, number],
    to: [number, number],
    kind: WallKind,
    on: boolean
  ) => {
    setWallEdge(creationCst, from, to, kind, on);
    syncFromCreationCst(creationCst);
  };

  const handleCreationToggleHole = (col: number, row: number) => {
    toggleHole(creationCst, col, row);
    syncFromCreationCst(creationCst);
  };

  const handleCreationSetPoint = (
    kind: 'start' | 'end',
    col: number,
    row: number
  ) => {
    const current = kind === 'start' ? creationDoc.start : creationDoc.end;
    const alreadyHere = !!current && current[0] === col && current[1] === row;
    const setter = kind === 'start' ? setStart : setEnd;
    setter(creationCst, alreadyHere ? null : [col, row]);
    syncFromCreationCst(creationCst);
  };

  const handleNewCanvas = (width: number, height: number) => {
    const fresh = parseDungeon(emptyCanvasYaml(width, height));
    setCreationCst(fresh.cst);
    setCreationDoc(fresh.doc);
    setCreationYamlText(serializeDungeon(fresh.cst));
    creationEdit.setSelectedPlacement(null);
    creationEdit.setSelectedPalette(null);
  };

  // Same debounced-reparse pattern edit mode's applyText/handleChangeText
  // use — the ProposedYamlPane textarea is a real, editable view of a
  // real CST now, not a read-only approximation.
  const applyCreationText = (text: string) => {
    try {
      const parsed = parseDungeon(text);
      setCreationCst(parsed.cst);
      setCreationDoc(parsed.doc);
      setCreationParseError(null);
      creationEdit.setSelectedPlacement(null);
    } catch (err) {
      setCreationParseError(
        err instanceof DungeonParseError ? err.message : String(err)
      );
    }
  };

  const handleChangeCreationText = (text: string) => {
    setCreationYamlText(text);
    if (creationApplyDebounce.current)
      clearTimeout(creationApplyDebounce.current);
    creationApplyDebounce.current = setTimeout(
      () => applyCreationText(text),
      APPLY_DEBOUNCE_MS
    );
  };

  useEffect(
    () => () => {
      if (creationApplyDebounce.current)
        clearTimeout(creationApplyDebounce.current);
    },
    []
  );

  // "Play the pitch" (Kirk's own demo script) drives these same mutators
  // a manual click would — see demoScript.ts's own doc comment. Rebuilt
  // fresh each render so every method reads the CURRENT creationCst/
  // creationDoc, not a stale closure from whenever the demo started;
  // useDemoScript.ts keeps its own ref to the latest object so this
  // doesn't churn the demo's timer identity.
  const creationDemoActions: DemoActions = {
    resetGrid: handleNewCanvas,
    toggleWallEdge: handleCreationToggleWallEdge,
    setStart: (at) => {
      setStart(creationCst, at);
      syncFromCreationCst(creationCst);
    },
    setEnd: (at) => {
      setEnd(creationCst, at);
      syncFromCreationCst(creationCst);
    },
    place: (ref, at) => {
      placeItem(creationCst, null, ref, at);
      syncFromCreationCst(creationCst);
    },
    rotateLastFacing: (delta) => {
      const lastIndex = creationDoc.place.length - 1;
      if (lastIndex < 0) return;
      const current = creationDoc.place[lastIndex].facing ?? 0;
      const next = (((current + delta) % 6) + 6) % 6;
      setPlacementFacing(creationCst, null, lastIndex, next);
      syncFromCreationCst(creationCst);
    },
  };

  const usageCounts: Record<string, number> = {};
  for (const room of doc.rooms) {
    for (const p of room.place) {
      usageCounts[p.ref] = (usageCounts[p.ref] ?? 0) + 1;
    }
  }
  // Guard against the palette silently drifting from the manifest.
  for (const p of PALETTE_PROPS) usageCounts[p.ref] ??= 0;

  const modeBannerText =
    boardDim === '3d'
      ? '3D preview — click a prop/monster to select it (the same Inspector the 2D board uses opens, rotate there); orbit/zoom with the mouse. Placing/moving/deleting still needs the palette/YAML or the 2D board.'
      : edit.selectedPalette
        ? `Palette: ${edit.selectedPalette.ref.split(':').pop()} selected — click an empty legal cell to place it.`
        : edit.selectedPlacement
          ? 'Selected a placed piece — drag to move, Delete key to remove, toggle flags in the inspector.'
          : 'Nothing selected — pick a palette item, or click a placed piece.';

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        edit.selectedPlacement
      ) {
        e.preventDefault();
        if (edit.selectedPlacement.boss) {
          flashToast(
            'Boss required — can’t delete (dungeonspec: "boss room must declare boss"). Drag it instead.'
          );
        } else {
          edit.handleDelete();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit.selectedPlacement, cst]);

  const modeTabs = (
    <div style={{ display: 'flex', gap: 6, padding: '10px 16px 0' }}>
      {(['edit', 'create'] as const).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          style={{
            padding: '6px 14px',
            borderRadius: '6px 6px 0 0',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
            border: '1px solid var(--border-primary)',
            borderBottom:
              mode === m
                ? '1px solid transparent'
                : '1px solid var(--border-primary)',
            background: mode === m ? 'var(--bg-secondary)' : 'transparent',
            color: mode === m ? '#ffd76a' : 'var(--text-primary)',
          }}
        >
          {m === 'edit' ? 'Edit: The Shrine Hall' : 'New Dungeon'}
        </button>
      ))}
    </div>
  );

  if (mode === 'create') {
    return (
      <div>
        {modeTabs}
        <CreationConcept
          doc={creationDoc}
          yamlText={creationYamlText}
          yamlParseError={creationParseError}
          onChangeYamlText={handleChangeCreationText}
          edit={creationEdit}
          selectedTool={creationSelectedTool}
          onSelectTool={setCreationSelectedTool}
          onToggleWallEdge={handleCreationToggleWallEdge}
          onToggleHole={handleCreationToggleHole}
          onSetPoint={handleCreationSetPoint}
          onNewCanvas={handleNewCanvas}
          demoActions={creationDemoActions}
          toast={flashToast}
          paletteCollapsed={createPaletteCollapsed}
          onTogglePalette={() => setCreatePaletteCollapsed((c) => !c)}
          yamlCollapsed={createYamlCollapsed}
          onToggleYaml={() => setCreateYamlCollapsed((c) => !c)}
        />
        {toast && <ToastBanner message={toast} />}
      </div>
    );
  }

  if (!preview.floorPlan) {
    return (
      <div>
        {modeTabs}
        <div style={{ padding: 20 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div>
      {modeTabs}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '80vh',
          border: '1px solid var(--border-primary)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--border-primary)',
            display: 'flex',
            alignItems: 'baseline',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <h2
            style={{
              fontSize: 16,
              margin: 0,
              color: '#ffd76a',
              fontWeight: 600,
            }}
          >
            Dungeon Builder — board
          </h2>
          <span style={{ fontSize: 12, color: '#a89e90' }}>
            rpg-project#170/#169 · The Shrine Hall
          </span>
          <div
            role="group"
            aria-label="2D or 3D board"
            style={{
              marginLeft: 'auto',
              display: 'flex',
              gap: 2,
              border: '1px solid var(--border-primary)',
              borderRadius: 5,
              padding: 2,
            }}
          >
            {(['2d', '3d'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setBoardDim(d)}
                style={{
                  padding: '3px 10px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  borderRadius: 3,
                  border: 'none',
                  cursor: 'pointer',
                  background: boardDim === d ? '#5fd1c9' : 'transparent',
                  color: boardDim === d ? '#14110f' : 'var(--text-primary)',
                }}
              >
                {d.toUpperCase()}
              </button>
            ))}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: '#ffb347',
              background: '#2a2117',
              border: '1px solid #4a3a1f',
              borderRadius: 4,
              padding: '4px 10px',
              minWidth: 260,
              textAlign: 'right',
            }}
          >
            {modeBannerText}
          </div>
        </header>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <CollapsibleSidePanel
            side="left"
            width={250}
            label="Palette"
            collapsed={editPaletteCollapsed}
            onToggle={() => setEditPaletteCollapsed((c) => !c)}
          >
            <Palette
              selected={edit.selectedPalette}
              onSelect={(sel) => {
                clearOtherSelections('palette');
                edit.setSelectedPalette(sel);
              }}
              usageCounts={usageCounts}
              selectedTool={selectedTool}
              onSelectTool={handleSelectTool}
              wallCount={doc.walls.length}
              holeCount={doc.holes.length}
            />
          </CollapsibleSidePanel>
          <main
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {boardDim === '2d' ? (
              <>
                <div
                  style={{
                    padding: '4px 16px 0',
                    fontSize: 11,
                    color: '#8a7a5a',
                  }}
                >
                  Board renders the game's actual odd-q pointy-top hex math —
                  the diagonal shear across the chain is a real property of that
                  addressing, not a rendering bug. See CONTRACT.md.
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
                  <Board
                    floorPlan={preview.floorPlan}
                    doc={doc}
                    selectedPalette={edit.selectedPalette}
                    selectedPlacement={edit.selectedPlacement}
                    selectedConnectorIndex={selectedConnectorIndex}
                    onPlace={edit.handlePlace}
                    onSelect={(sel) => {
                      clearOtherSelections('placement');
                      edit.setSelectedPlacement(sel);
                    }}
                    onMove={edit.handleMove}
                    onReject={flashToast}
                    onSelectConnector={handleSelectConnector}
                    onWallGashClick={handleWallGashClick}
                    selectedTool={selectedTool}
                    onToggleWall={handleToggleWall}
                    onToggleWallKind={handleToggleWallKind}
                    onToggleHole={handleToggleHole}
                    onSetPoint={handleSetPoint}
                  />
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    padding: '4px 16px 0',
                    fontSize: 11,
                    color: '#8a7a5a',
                  }}
                >
                  Spike: floor + props + monsters + drawn walls/doors (crude
                  boxes — not the real game's tiled/mitered wall pieces) — no
                  combat/fog. See CONTRACT.md's "3D preview spike" section.
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <DungeonPreview3D
                    floorPlan={preview.floorPlan}
                    doc={doc}
                    selectedPlacement={edit.selectedPlacement}
                    onSelect={(sel) => {
                      clearOtherSelections('placement');
                      edit.setSelectedPlacement(sel);
                    }}
                  />
                </div>
              </>
            )}
            <RolledContentPanel doc={doc} />
          </main>
          <CollapsibleSidePanel
            side="right"
            width={420}
            label="YAML"
            collapsed={editYamlCollapsed}
            onToggle={() => setEditYamlCollapsed((c) => !c)}
          >
            <YamlPane
              yamlText={yamlText}
              onChangeText={handleChangeText}
              onApply={() => applyText(yamlText)}
              parseError={parseError}
              serverState={preview.serverState}
              requestError={preview.requestError}
              fieldErrors={preview.fieldErrors}
              onRetryProbe={preview.retryProbe}
              onSaveAndPlay={() =>
                save.save(doc.key, v1Subset?.yaml ?? yamlText)
              }
              saveState={save.state}
              savedKey={save.savedKey}
              saveFieldErrors={save.fieldErrors}
              saveErrorMessage={save.errorMessage}
              onWalkIt={handleWalkIt}
              walkState={walkSave.state}
              walkSavedKey={walkSave.savedKey}
              walkFieldErrors={walkSave.fieldErrors}
              walkErrorMessage={walkSave.errorMessage}
              dialectDropped={v1Subset?.dropped ?? []}
              v1Compilable={v1Subset?.compilable ?? false}
            />
          </CollapsibleSidePanel>
        </div>

        <Inspector
          doc={doc}
          floorPlan={preview.floorPlan}
          selected={edit.selectedPlacement}
          onSetFlags={edit.handleSetFlags}
          onDelete={edit.handleDelete}
          onSetMount={edit.handleSetMount}
          onSetRotationDegrees={edit.handleSetRotationDegrees}
          onSetTargeting={edit.handleSetTargeting}
          onSetFacing={edit.handleSetFacing}
        />

        {selectedConnectorIndex !== null && (
          <ConnectorInspector
            doc={doc}
            floorPlan={preview.floorPlan}
            connectorIndex={selectedConnectorIndex}
            onSetLocked={handleSetConnectorLocked}
            onClose={() => setSelectedConnectorIndex(null)}
          />
        )}

        {wallGashExplainerOpen && (
          <WallGashExplainer onClose={() => setWallGashExplainerOpen(false)} />
        )}

        {toast && <ToastBanner message={toast} />}
      </div>
    </div>
  );
}

function ToastBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 18,
        transform: 'translateX(-50%)',
        background: '#2a2117',
        border: '1px solid #ffb347',
        color: '#ffb347',
        padding: '8px 16px',
        borderRadius: 6,
        fontSize: 12.5,
        zIndex: 30,
        maxWidth: 480,
        textAlign: 'center',
      }}
    >
      {message}
    </div>
  );
}
