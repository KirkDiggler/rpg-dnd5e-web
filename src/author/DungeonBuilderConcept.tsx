/**
 * DungeonBuilderConcept — composition root for the Dungeon Builder's
 * canvas-authoring surface (rpg-project#170/#169 design gate). Owns the
 * live-vs-fixtures data source (`usePutDungeonPreview`) and mounts the
 * "New Dungeon" canvas builder directly. See CONTRACT.md for the full
 * findings writeup.
 *
 * **Kirk look-feedback (2026-08-07, rpg-project#194): the "Edit: The
 * Shrine Hall" example-editing tab retired.** Verbatim: "our dungeon
 * builder does not need the example edit shrine tab. that was before
 * straight walls." The canvas builder (formerly "New Dungeon", one of
 * two tabs) is now the ONLY surface this component mounts — with a
 * single surface left, the tab chrome is gone too. This was a SURFACE
 * removal, not a plumbing one: `dungeonYaml.ts`'s chain/room machinery
 * (parsing, `stripToV1Subset`, room-scoped placement, `buildWalkItYaml`)
 * is untouched — a room-chain document loaded via "Load .yaml" still
 * parses without crashing (verified live; see CONTRACT.md's ledger entry
 * for the exact observed behavior, since the canvas floor semantic
 * doesn't render a chain's rooms). See that same ledger entry for the
 * full removed-vs-kept-shared breakdown (`Board.tsx`, `YamlPane.tsx`,
 * `ConnectorInspector.tsx`, `WallGashExplainer.tsx` deleted outright —
 * zero other consumers; `Inspector`/`Palette`/`DraftRestoredBanner`/
 * `useSaveDungeon`/`useDraftAutosave`/`hasServerEdges` kept — genuinely
 * shared with creation mode).
 *
 * **Same round, addendum: "Play the pitch" retired.** Kirk, verbatim:
 * "play the pitch is also not needed. this is no longer the concept
 * pitch." `creation/demoScript.ts`/`creation/useDemoScript.ts` (the
 * scripted-playback machinery) and the `creationDemoActions` wrapper
 * that fed them are deleted — the REAL mutators the demo drove
 * (`placeItem`/`setStart`/`setEnd`/`setPlacementFacing`/
 * `setWallEdge`/etc., `dungeonYaml.ts`) obviously stay, since they're
 * exactly what a manual click already calls via `useBoardEditing`/the
 * handlers below. `creationGeometry.ts`'s `traceEdgeRun` also removed —
 * it existed solely to let the demo script derive a connected wall run
 * for a SCRIPTED straight drag; `nearestEdge`/`dragFamily` (which a real
 * interactive drag actually calls) are untouched.
 */
import { ErrorBoundary } from '@/components/ui/Feedback/ErrorBoundary';
import type { FloorPlan } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { BoardCrashRecovery } from './BoardCrashRecovery';
import { validateRegionFloorCandidate } from './capabilityProbe';
import { CreationConcept } from './creation/CreationConcept';
import { DEFAULT_CANVAS, emptyCanvasYaml } from './creation/emptyCanvasDoc';
import type { CornerRef } from './creation/hexCorner';
import { useRegionEditing } from './creation/useRegionEditing';
import { DraftRestoredBanner } from './DraftRestoredBanner';
import {
  discardDraft,
  draftDiffersFromFreshSeed,
  loadDraft,
} from './draftStorage';
import './DungeonBuilderConcept.css';
import {
  addWallLine,
  DungeonParseError,
  parseDungeon,
  removeWallLineAt,
  serializeDungeon,
  setEnd,
  setStart,
  setWallEdge,
  setWallLineEndpoint,
  stripToV1Subset,
  toDungeonDoc,
  toggleHole,
  toggleWallLineDoorAt,
  WallEdgeValidationError,
  type DungeonDoc,
  type WallKind,
} from './dungeonYaml';
import { hasRegionFloorIntent } from './regionFloorContract';
import { buildSpecCompatReport } from './specCompat';
import type { BoardTool } from './types';
import { useBoardEditing } from './useBoardEditing';
import { useDraftAutosave, type DraftAutosave } from './useDraftAutosave';
import {
  useCreationFloorPlanPreview,
  usePutDungeonPreview,
} from './usePutDungeonPreview';
import { useSaveDungeon, type AuthoringUnaryClient } from './useSaveDungeon';

const APPLY_DEBOUNCE_MS = 700;

/** Crash-recovery state (this unit, rpg-project#194 authoring-robustness)
 * — non-null whenever the board can't be shown for either of the two
 * reasons `BoardCrashRecovery.tsx`'s own doc comment covers: a restored
 * draft that fails to (re-)parse, or a live render crash caught by the
 * `ErrorBoundary` around `CreationConcept` below. `yamlText` is always
 * the EXACT text responsible — never the fresh-seed fallback quietly
 * backing `creationDoc`/`creationCst` underneath while this is shown. */
interface CreationCrash {
  message: string;
  yamlText: string;
}

type RegionFloorState =
  | { kind: 'inactive' }
  | { kind: 'validating' }
  | { kind: 'blocked'; reason: string }
  | {
      kind: 'accepted';
      sourceYaml: string;
      key: string;
      yaml: string;
      floorPlan: FloorPlan;
    };

/** `draftDiffersFromFreshSeed`'s canonicalize function — the real
 * parse+serialize round trip, module-level since it needs nothing from
 * component state. */
const canonicalizeYaml = (yamlText: string): string =>
  serializeDungeon(parseDungeon(yamlText).cst);

export interface DungeonBuilderConceptProps {
  /** Graduation unit (rpg-project#194): forces `usePutDungeonPreview` into
   * fixtures mode unconditionally — see that hook's own doc comment. The
   * Concepts Lab dev sandbox mount (`ConceptsView.tsx`) sets this; the
   * real `/author` mount (`AuthorView.tsx`) leaves it unset and gets
   * today's normal live-probing behavior, unchanged. */
  forceFixtures?: boolean;
  initialYaml?: string;
  authoringClient?: AuthoringUnaryClient;
  persistDraft?: boolean;
  allowNewCanvas?: boolean;
  allowYamlFileIO?: boolean;
  onSaveSucceeded?: (key: string) => void;
  showSaveResultLink?: boolean;
}

export function DungeonBuilderConcept({
  forceFixtures = false,
  initialYaml,
  authoringClient,
  persistDraft = true,
  allowNewCanvas = true,
  allowYamlFileIO = true,
  onSaveSucceeded,
  showSaveResultLink = true,
}: DungeonBuilderConceptProps = {}) {
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Collapse state for the side panels (Kirk's 2026-08-02 ask) — kept
  // here rather than inside Palette/ProposedYamlPane/CreationConcept so
  // it survives a CreationConcept remount (this component itself can
  // still unmount/remount across an /author <-> Concepts Lab navigation,
  // or a full page reload; CreationConcept's own local state wouldn't
  // survive that). See CollapsibleSidePanel.tsx's own doc comment.
  const [createPaletteCollapsed, setCreatePaletteCollapsed] = useState(false);
  const [createYamlCollapsed, setCreateYamlCollapsed] = useState(false);
  const [createBoardDim, setCreateBoardDim] = useState<'2d' | '3d'>('2d');

  // Kirk look-feedback (2026-08-07): no edit-mode document exists anymore
  // to feed this hook's own per-edit live preview — `usePutDungeonPreview`
  // now serves purely as the shared reachability/capability probe
  // (`serverState`/`capabilities`/`refreshCapabilities`), exactly what
  // `useCreationFloorPlanPreview` below already expected of it (see that
  // hook's own doc comment on why a SECOND independent probe would double
  // real network traffic). `null`/`''` is this hook's own documented
  // no-document case — its per-edit live-preview effect no-ops entirely,
  // leaving only the mount-time reachability probe and capability suite
  // live, which is exactly what this component still needs from it.
  const preview = usePutDungeonPreview(
    null,
    '',
    forceFixtures,
    authoringClient
  );

  const flashToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  // "New Dungeon" — seeded from an empty target-dialect-only canvas
  // (creation/emptyCanvasDoc.ts — rooms: [], placements live in the
  // top-level place: field). Lazy initializer (graduation audit item) —
  // parseDungeon/serializeDungeon both do real parsing/stringification
  // work, and a bare `useState(parseDungeon(...))` evaluates that
  // argument on EVERY render (React only USES it on the first), not just
  // once on mount.
  //
  // Local drafts (this unit): before falling back to the fresh seed,
  // check for a locally-saved 'create' draft (`draftStorage.ts`) and
  // restore it instead — the author never loses a board to a refresh/
  // crash.
  //
  // Crash-proof by construction (authoring-robustness unit, rpg-project#194):
  // a draft that fails to (re-)parse used to be silently discarded here —
  // safe (nothing crashed) but LOSSY, the exact "had to manually clear
  // localStorage" failure mode Kirk hit. It's kept in storage now, the
  // WORKING doc still falls back to the fresh seed so the rest of this
  // component's state initializes normally, but the broken text + a real
  // error message are carried out as `crash` so the render below can show
  // `BoardCrashRecovery` instead of quietly losing it (`createRestoredDraftAt`
  // stays null in this branch too — nothing was actually loaded onto the
  // board, so `DraftRestoredBanner` shouldn't claim it was).
  //
  // Honesty guard (Copilot review, PR #717): a stored draft that's
  // canonically indistinguishable from the fresh seed is NOT a real
  // authored draft — announcing it as one would be dishonest.
  const [
    {
      parsed: creationInitial,
      restoredAt: createRestoredDraftAt,
      crash: creationInitialCrash,
    },
  ] = useState(() => {
    const freshCreationSeed =
      initialYaml ??
      emptyCanvasYaml(DEFAULT_CANVAS.width, DEFAULT_CANVAS.height);
    const draft = persistDraft ? loadDraft('create') : null;
    if (draft) {
      if (
        draftDiffersFromFreshSeed(
          draft.yamlText,
          freshCreationSeed,
          canonicalizeYaml
        )
      ) {
        try {
          return {
            parsed: parseDungeon(draft.yamlText),
            restoredAt: draft.savedAt,
            crash: null as CreationCrash | null,
          };
        } catch (err) {
          return {
            parsed: parseDungeon(freshCreationSeed),
            restoredAt: null as number | null,
            crash: {
              message:
                err instanceof DungeonParseError ? err.message : String(err),
              yamlText: draft.yamlText,
            } as CreationCrash | null,
          };
        }
      } else if (persistDraft) {
        discardDraft('create');
      }
    }
    return {
      parsed: parseDungeon(freshCreationSeed),
      restoredAt: null as number | null,
      crash: null as CreationCrash | null,
    };
  });
  const [createDraftBannerDismissed, setCreateDraftBannerDismissed] =
    useState(false);
  const [creationCrash, setCreationCrash] = useState<CreationCrash | null>(
    creationInitialCrash
  );
  const [creationCst, setCreationCst] = useState(creationInitial.cst);
  const [creationDoc, setCreationDoc] = useState<DungeonDoc>(
    creationInitial.doc
  );
  const [creationYamlText, setCreationYamlText] = useState(() =>
    initialYaml !== undefined && !persistDraft
      ? initialYaml
      : serializeDungeon(creationInitial.cst)
  );
  const [creationSelectedTool, setCreationSelectedTool] =
    useState<BoardTool | null>('wall');
  const [creationParseError, setCreationParseError] = useState<string | null>(
    null
  );
  const creationApplyDebounce = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const createAutosaveRef = useRef<DraftAutosave | null>(null);
  const regionFloorIntent = hasRegionFloorIntent(creationDoc);
  const [regionFloorState, setRegionFloorState] = useState<RegionFloorState>({
    kind: 'inactive',
  });

  // A region floor is accepted by its normal exact validate-only request,
  // never by the legacy per-field capability strip. Keep the request payload
  // separate from the editable source: lossless wallLines sugar may compile on
  // a fresh CST, while failures always leave the textarea byte-for-byte intact.
  useEffect(() => {
    if (!regionFloorIntent) {
      setRegionFloorState({ kind: 'inactive' });
      return;
    }
    if (preview.serverState === 'probing') {
      setRegionFloorState({ kind: 'validating' });
      return;
    }
    if (preview.serverState !== 'live') {
      setRegionFloorState({
        kind: 'blocked',
        reason:
          'canvas.floor_source: regions requires a reachable authoring provider for exact validate-only acceptance',
      });
      return;
    }

    let cancelled = false;
    setRegionFloorState({ kind: 'validating' });
    const timer = setTimeout(() => {
      validateRegionFloorCandidate(creationYamlText, {
        capabilities: preview.capabilities,
        client: authoringClient,
      }).then((result) => {
        if (cancelled) return;
        setRegionFloorState(
          result.accepted
            ? {
                kind: 'accepted',
                sourceYaml: creationYamlText,
                key: result.key,
                yaml: result.yaml,
                floorPlan: result.floorPlan,
              }
            : { kind: 'blocked', reason: result.reason }
        );
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    authoringClient,
    creationYamlText,
    preview.capabilities,
    preview.serverState,
    regionFloorIntent,
  ]);

  // Acceptance belongs to one exact editable source and request key. This
  // match is render-time safety, not effect cleanup: a source edit revokes
  // compile, preview, and save access in the same render even while the old
  // accepted state is still waiting for the passive effect above to clean up.
  const acceptedRegionFloor =
    regionFloorState.kind === 'accepted' &&
    regionFloorState.sourceYaml === creationYamlText &&
    regionFloorState.key === creationDoc.key
      ? regionFloorState
      : null;

  // Creation mode's own live FloorPlan preview (v0.3 wire consumption
  // unit, 2026-08-05) — same "reuse the shared serverState/capabilities,
  // don't re-probe" reasoning `creationV1Subset` below already documents
  // for `preview.capabilities`; see `useCreationFloorPlanPreview`'s own
  // doc comment for why this is a SECOND hook rather than a second call to
  // `usePutDungeonPreview` itself. Feeds `creation/canvasFloor.ts`'s
  // `resolveCanvasFloor` and the region tree's wire-vs-derived comparison
  // — both dormant against every live server today (no shipped producer
  // carries `floor_cells`/`regions` yet), so this is plumbing for the day
  // Wave 0/1 lands, not a behavior change against any server reachable
  // right now.
  const creationFloorPreview = useCreationFloorPlanPreview(
    regionFloorIntent ? null : creationDoc,
    creationYamlText,
    preview.serverState,
    preview.capabilities,
    authoringClient
  );

  // Creation mode's own Save & Play (capability-probed graduation unit).
  // Reuses `preview.capabilities`: capabilities describe the SERVER, not
  // which document is being viewed, so probing once (on the shared
  // `usePutDungeonPreview` instance) is correct for creation mode's own
  // strip too — no second probe needed.
  const creationSave = useSaveDungeon(authoringClient, onSaveSucceeded);
  const creationV1Subset = useMemo(() => {
    if (regionFloorIntent) {
      if (!acceptedRegionFloor) return null;
      return {
        yaml: acceptedRegionFloor.yaml,
        dropped: [],
        compiling: ['exact region floor'],
        compilable: true,
        compilableBlockers: [],
      };
    }
    try {
      return stripToV1Subset(
        creationYamlText,
        preview.capabilities ?? undefined
      );
    } catch {
      return null;
    }
  }, [
    acceptedRegionFloor,
    creationYamlText,
    preview.capabilities,
    regionFloorIntent,
  ]);

  // Local drafts + versioned save/load — creation mode's own spec-compat
  // report.
  const creationSpecCompat = useMemo(
    () => buildSpecCompatReport(creationDoc, creationV1Subset),
    [creationDoc, creationV1Subset]
  );

  const handleCreationSaveAndPlay = () => {
    if (regionFloorIntent) {
      if (!acceptedRegionFloor) return;
      creationSave.save(acceptedRegionFloor.key, acceptedRegionFloor.yaml);
      return;
    }
    creationSave.save(
      creationDoc.key,
      creationV1Subset?.yaml ?? creationYamlText
    );
  };

  const creationDownloadFilename = `${creationDoc.key || 'dungeon'}.yaml`;

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
  // Cell-authored semantic region editing (rpg-project#180) — same
  // cst/doc/syncFromCst wiring as `creationEdit` above, since regions
  // live on the SAME creation-mode CST every other creation-mode mutator
  // does.
  const regionEdit = useRegionEditing(
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
    // The creation board only ever passes real detected hex edges, so
    // this should never actually reject today — but `setWallEdge` throws
    // on any future edge-detection/geometry bug that hands it a
    // non-adjacent pair, and an uncaught throw here would crash the
    // whole concept rather than just this one stroke. Surface it through
    // the same toast seam `handleCreationToggleWallEdge`'s callers use
    // for their own "can't do that" cases, and leave the board's cst/doc
    // untouched (same as that case) rather than syncing a no-op.
    try {
      setWallEdge(creationCst, from, to, kind, on);
    } catch (err) {
      flashToast(
        err instanceof WallEdgeValidationError
          ? err.message
          : 'Could not update that wall edge.'
      );
      return;
    }
    syncFromCreationCst(creationCst);
  };

  const handleCreationAddStraightWall = (from: CornerRef, to: CornerRef) => {
    addWallLine(creationCst, from, to);
    syncFromCreationCst(creationCst);
  };

  const handleCreationRemoveStraightWallAt = (index: number) => {
    removeWallLineAt(creationCst, index);
    syncFromCreationCst(creationCst);
  };

  const handleCreationSetStraightWallEndpoint = (
    lineIndex: number,
    which: 'from' | 'to',
    corner: CornerRef
  ) => {
    setWallLineEndpoint(creationCst, lineIndex, which, corner);
    syncFromCreationCst(creationCst);
  };

  const handleCreationToggleStraightWallDoorAt = (
    lineIndex: number,
    cell: [number, number]
  ) => {
    toggleWallLineDoorAt(creationCst, lineIndex, cell);
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

  // Debounced reparse — the ProposedYamlPane textarea is a real, editable
  // view of a real CST.
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

  // Load .yaml — feeds the file's text straight into the SAME parse/Apply
  // pipeline `applyCreationText`/`handleChangeCreationText` already use,
  // so a malformed file surfaces exactly like a bad paste-and-Apply does.
  // A room-chain document (`rooms:` non-empty, no `canvas:`) parses fine
  // here too — `parseDungeon`/`DungeonDoc` are mode-agnostic — but the
  // canvas floor semantic (`canvasFloor.ts`'s `deriveCanvasFloorCells`)
  // falls back to `DEFAULT_CANVAS` bounds for a doc with no `canvas:`,
  // so the board renders an empty default-sized floor rather than the
  // chain's own rooms; nothing crashes. See CONTRACT.md's ledger entry
  // for the live-verified transcript.
  const handleLoadCreationYamlFile = (text: string) => {
    setCreationYamlText(text);
    applyCreationText(text);
  };

  const handleLoadCreationYamlFileError = (message: string) => {
    setCreationParseError(message);
  };

  useEffect(
    () => () => {
      if (creationApplyDebounce.current)
        clearTimeout(creationApplyDebounce.current);
    },
    []
  );

  const handleDiscardCreateDraft = () => {
    if (persistDraft) {
      discardDraft('create');
      createAutosaveRef.current?.skipNextTick();
    }
    const fresh = parseDungeon(
      initialYaml ??
        emptyCanvasYaml(DEFAULT_CANVAS.width, DEFAULT_CANVAS.height)
    );
    setCreationCst(fresh.cst);
    setCreationDoc(fresh.doc);
    setCreationYamlText(
      initialYaml !== undefined && !persistDraft
        ? initialYaml
        : serializeDungeon(fresh.cst)
    );
    setCreationParseError(null);
    creationEdit.setSelectedPlacement(null);
    setCreateDraftBannerDismissed(true);
    // Also the crash-recovery surface's own "start fresh" escape hatch
    // (this unit) — same reset, plus clearing whichever crash reason
    // (restore-parse-failure or live render crash) put us here.
    setCreationCrash(null);
  };

  // Crash-recovery surface (this unit, rpg-project#194 authoring-
  // robustness) — `BoardCrashRecovery.tsx`'s own doc comment has the full
  // "why this exists" writeup. Edits the crash's OWN `yamlText` (never
  // `creationYamlText`, which the board itself isn't necessarily showing
  // while crashed) and re-parses on explicit Apply, same
  // editable-text/explicit-Apply/never-lose-what-was-typed contract
  // `ProposedYamlPane`'s (non-crashed) textarea already offers.
  const handleCreationCrashTextChange = (text: string) => {
    setCreationCrash((c) => (c ? { ...c, yamlText: text } : c));
  };

  const handleCreationCrashApply = () => {
    if (!creationCrash) return;
    try {
      const parsed = parseDungeon(creationCrash.yamlText);
      setCreationCst(parsed.cst);
      setCreationDoc(parsed.doc);
      setCreationYamlText(creationCrash.yamlText);
      setCreationParseError(null);
      creationEdit.setSelectedPlacement(null);
      // Clearing this is what lets the board attempt to render again —
      // `creationCrash === null` is the render-time switch back to the
      // real `ErrorBoundary`-wrapped board below, a fresh boundary
      // instance with its own hasError reset. If the newly-applied doc
      // crashes too, `onError` sets `creationCrash` right back with the
      // new error — the loop this unit's own "apply-to-retry" ask names.
      setCreationCrash(null);
    } catch (err) {
      setCreationCrash((c) =>
        c
          ? {
              ...c,
              message:
                err instanceof DungeonParseError ? err.message : String(err),
            }
          : c
      );
    }
  };

  // Delete/Backspace removes the selected placement — creation mode's
  // own board-level keyboard shortcut (rpg-project#169's creation-3D-
  // editing unit; previously gated on which of two modes' selection was
  // live, now there's only one).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        creationEdit.selectedPlacement
      ) {
        e.preventDefault();
        if (creationEdit.selectedPlacement.boss) {
          flashToast(
            'Boss required — can’t delete (dungeonspec: "boss room must declare boss"). Drag it instead.'
          );
        } else {
          creationEdit.handleDelete();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creationEdit.selectedPlacement, creationCst]);

  // Keep draft autosave in its own child so switching persistence off
  // unmounts it and cancels any pending debounce before it can write.
  return (
    <div>
      {persistDraft && (
        <CreationDraftAutosave
          yamlText={creationYamlText}
          autosaveRef={createAutosaveRef}
        />
      )}
      {createRestoredDraftAt !== null && !createDraftBannerDismissed && (
        <DraftRestoredBanner
          savedAt={createRestoredDraftAt}
          onDismiss={() => setCreateDraftBannerDismissed(true)}
          onDiscard={handleDiscardCreateDraft}
        />
      )}
      {creationCrash ? (
        <BoardCrashRecovery
          errorMessage={creationCrash.message}
          yamlText={creationCrash.yamlText}
          onChangeText={handleCreationCrashTextChange}
          onApply={handleCreationCrashApply}
          onDiscardDraft={handleDiscardCreateDraft}
        />
      ) : (
        // Crash-proof by construction (this unit): if the board throws
        // ANYWAY — a shape `dungeonYaml.ts`'s parse-time validation
        // doesn't catch, or any other render bug — this boundary catches
        // it instead of white-screening the whole app, and hands the
        // error + the text that caused it to `creationCrash` above
        // rather than rendering its own generic fallback (`fallback={null}`:
        // the very next render swaps this whole branch for
        // `BoardCrashRecovery`, so there's nothing worth showing here).
        // A fresh `ErrorBoundary` instance mounts here every time
        // `creationCrash` goes back to `null` (Apply & retry, Discard),
        // so its own `hasError` is always reset for the next attempt.
        <ErrorBoundary
          fallback={null}
          onError={(error) =>
            setCreationCrash({
              message: error.message,
              yamlText: creationYamlText,
            })
          }
        >
          <CreationConcept
            doc={creationDoc}
            yamlText={creationYamlText}
            yamlParseError={
              creationParseError ??
              (regionFloorState.kind === 'blocked'
                ? regionFloorState.reason
                : null)
            }
            onChangeYamlText={handleChangeCreationText}
            edit={creationEdit}
            selectedTool={creationSelectedTool}
            onSelectTool={setCreationSelectedTool}
            onToggleWallEdge={handleCreationToggleWallEdge}
            onAddStraightWall={handleCreationAddStraightWall}
            onRemoveStraightWallAt={handleCreationRemoveStraightWallAt}
            onSetStraightWallEndpoint={handleCreationSetStraightWallEndpoint}
            onToggleStraightWallDoorAt={handleCreationToggleStraightWallDoorAt}
            onToggleHole={handleCreationToggleHole}
            onSetPoint={handleCreationSetPoint}
            onNewCanvas={handleNewCanvas}
            allowNewCanvas={allowNewCanvas}
            toast={flashToast}
            regionEdit={regionEdit}
            paletteCollapsed={createPaletteCollapsed}
            onTogglePalette={() => setCreatePaletteCollapsed((c) => !c)}
            yamlCollapsed={createYamlCollapsed}
            onToggleYaml={() => setCreateYamlCollapsed((c) => !c)}
            serverState={preview.serverState}
            capabilities={preview.capabilities}
            onRefreshCapabilities={preview.refreshCapabilities}
            liveFloorPlan={
              acceptedRegionFloor
                ? acceptedRegionFloor.floorPlan
                : creationFloorPreview.floorPlan
            }
            v1Subset={creationV1Subset}
            onSaveAndPlay={handleCreationSaveAndPlay}
            saveState={creationSave.state}
            savedKey={creationSave.savedKey}
            saveFieldErrors={creationSave.fieldErrors}
            saveErrorMessage={creationSave.errorMessage}
            boardDim={
              regionFloorIntent && !acceptedRegionFloor ? '2d' : createBoardDim
            }
            onSetBoardDim={(dim) => {
              if (dim === '3d' && regionFloorIntent && !acceptedRegionFloor) {
                flashToast(
                  regionFloorState.kind === 'blocked'
                    ? regionFloorState.reason
                    : 'Validating the exact region-floor candidate before preview.'
                );
                return;
              }
              setCreateBoardDim(dim);
            }}
            yamlDownloadFilename={creationDownloadFilename}
            onLoadYamlFile={handleLoadCreationYamlFile}
            onLoadYamlFileError={handleLoadCreationYamlFileError}
            allowYamlFileIO={allowYamlFileIO}
            showSaveResultLink={showSaveResultLink}
            specCompat={creationSpecCompat}
          />
        </ErrorBoundary>
      )}
      {toast && <ToastBanner message={toast} />}
    </div>
  );
}

function CreationDraftAutosave({
  yamlText,
  autosaveRef,
}: {
  yamlText: string;
  autosaveRef: MutableRefObject<DraftAutosave | null>;
}) {
  const autosave = useDraftAutosave('create', yamlText);

  useEffect(() => {
    autosaveRef.current = autosave;
    return () => {
      autosaveRef.current = null;
    };
  }, [autosave, autosaveRef]);

  return null;
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
