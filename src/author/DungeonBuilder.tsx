/**
 * DungeonBuilder — the composition root of `/author` (design §1): three
 * columns and a top bar of verbs over ONE piece of state, the
 * `DungeonDoc`. Every edit is a document mutator (`dungeonYaml.ts`);
 * the YAML pane mirrors `emitDungeon(doc)`; `usePutDungeonPreview`
 * compiles that text on the server (`validate_only`) and hands back the
 * path-addressed errors the board highlights and the atlas the 3D tab
 * draws. `Save` is `PutDungeon` for real; `Save & Play` is `Save` then
 * the caller's `onPlay(key)` (`AuthorView` starts the lobby encounter on
 * the key and routes to the game).
 *
 * Props exist for the two other mounts: the Concepts Lab sandbox
 * (`fixtureCompile`, never calls the server) and the toolkit-contributor
 * sandbox (`authoringClient`, fixed `initialYaml`, no New/Open/file IO).
 */
import { useListDungeons } from '@/api/useListDungeons';
import { create } from '@bufbuild/protobuf';
import { GetDungeonRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  defaultAuthoringClient,
  errorMessageOf,
  staleAtlasNotice,
  usePutDungeonPreview,
  useSaveDungeon,
  type AuthoringClient,
} from './authoringRpc';
import { CreationBoard } from './creation/CreationBoard';
import {
  applyDoorDraw,
  applyReshape,
  applyWallDraw,
  applyWallErase,
} from './creation/wallGesture';
import { discardDraft, loadDraft, saveDraft } from './draftStorage';
import './DungeonBuilder.css';
import {
  addRegion,
  applyDerivedConcealment,
  deriveConcealment,
  detectConcealmentLeaks,
  DungeonParseError,
  emitDungeon,
  emptyDungeon,
  eraseCell,
  isMonsterRef,
  paintCell,
  paintRect,
  parseDungeon,
  placeAt,
  removePlacement,
  removeRegion,
  removeWalls,
  resolveErrorTargets,
  setStart,
  setWallHeights,
  toggleDoorEdge,
  toggleWall,
  updateDoor,
  updateDungeon,
  updatePlacement,
  updateRegion,
  wallEdges,
  type DungeonDoc,
} from './dungeonYaml';
import { edgeKey, type Axial, type Edge, type Orientation } from './hexOffset';
import { Inspector } from './Inspector';
import { Palette } from './Palette';
import { PALETTE_PROPS } from './paletteData';
import { DungeonPreview3D } from './preview3d/DungeonPreview3D';
import {
  nextRailWidth,
  readInspectorFolded,
  readRailWidth,
  writeInspectorFolded,
  writeRailWidth,
} from './railLayout';
import type { BoardTool, PaletteItem, Selection } from './types';
import { YamlPane } from './YamlPane';

/** The `Open` picker over `ListDungeons` (ungated server-side, so it
 * answers with authoring off too). Mounted only while open, so the list
 * is fetched when asked for, not on every builder mount. */
function OpenMenu({ onOpen }: { onOpen: (key: string) => void }) {
  const dungeons = useListDungeons();
  return (
    <span
      className="absolute left-0 top-full mt-1 flex flex-col gap-1 z-10 dg-col dg-picker"
      data-testid="dungeon-picker"
    >
      {dungeons.loading && <span className="text-xs">loading…</span>}
      {dungeons.error && (
        <span className="text-xs">{dungeons.error.message}</span>
      )}
      {dungeons.dungeons.map((d) => (
        <button
          key={d.key}
          type="button"
          className="dg-mini"
          onClick={() => onOpen(d.key)}
        >
          {d.name || d.key} <span className="opacity-60">({d.key})</span>
        </button>
      ))}
      {!dungeons.loading && dungeons.dungeons.length === 0 && (
        <span className="text-xs">no dungeons listed</span>
      )}
    </span>
  );
}

export interface DungeonBuilderProps {
  authoringClient?: AuthoringClient;
  /** Fixtures mode: answer every compile by shaping an atlas from the
   * current document with this function, never calling the server. */
  fixtureCompile?: (doc: DungeonDoc) => GetAtlasResponse;
  initialYaml?: string;
  persistDraft?: boolean;
  allowNewCanvas?: boolean;
  allowYamlFileIO?: boolean;
  onSaveSucceeded?: (key: string) => void;
  /** Save & Play: called after a successful save with the saved key.
   * Absent = the verb is not offered. */
  onPlay?: (key: string) => Promise<void>;
  /** Why Save & Play is disabled right now (no character picked, say). */
  playDisabledReason?: string | null;
}

/** `concealment.regionIds` is `null` only when there is no start to
 * derive reachability from — the canvas has nothing to highlight either
 * way, and a shared empty set keeps that a stable reference. */
const EMPTY_REGION_IDS: ReadonlySet<string> = new Set();

const PROP_DEFAULTS = new Map(
  PALETTE_PROPS.map((p) => [
    p.ref,
    {
      blocksMovement: p.role !== 'decor',
      blocksLos: p.role === 'obstacle',
    },
  ])
);

function initialDoc(
  initialYaml: string | undefined,
  persist: boolean
): DungeonDoc {
  if (initialYaml) {
    try {
      return parseDungeon(initialYaml);
    } catch {
      return emptyDungeon();
    }
  }
  if (persist) {
    const draft = loadDraft('create');
    if (draft) {
      try {
        return parseDungeon(draft.yamlText);
      } catch {
        discardDraft('create');
      }
    }
  }
  return emptyDungeon();
}

export function DungeonBuilder({
  authoringClient = defaultAuthoringClient,
  fixtureCompile,
  initialYaml,
  persistDraft = true,
  allowNewCanvas = true,
  allowYamlFileIO = true,
  onSaveSucceeded,
  onPlay,
  playDisabledReason = null,
}: DungeonBuilderProps) {
  // The FIRST doc runs through the same derivation every later edit
  // does (rpg-dnd5e-web#893) — a loaded draft, `initialYaml`, or an old
  // file hand-authored before this existed may have a concealed door
  // whose region was never ticked (rpg-dnd5e-web#890's bug); this
  // self-heals it before the first compile rather than leaving it for
  // the next edit to fix by accident. Computed once at mount — the
  // `useMemo([])` a component-scoped one-time computation, same spirit
  // as `docGeneration` below being a ref rather than state.
  const initialDerivation = useMemo(
    () =>
      applyDerivedConcealment(initialDoc(initialYaml, persistDraft), new Set()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only: initialYaml/persistDraft are launch-time props, same assumption `initialDoc` already makes
    []
  );
  const [doc, setDoc] = useState<DungeonDoc>(() => initialDerivation.doc);
  // The ratchet's memory (rpg-dnd5e-web#893): the region ids `applyDoc`
  // itself set concealed most recently, so a region a person concealed
  // by hand — never in this set — is never stripped when the graph
  // changes. Read by `applyDoc`'s updater and kept in step by the
  // toast/derivation effect below, after each commit.
  const derivedIdsRef = useRef<Set<string>>(initialDerivation.derivedIds);
  const [tool, setTool] = useState<BoardTool>('region');
  const [selection, setSelection] = useState<Selection>({ kind: 'dungeon' });
  const [activeRegionId, setActiveRegionId] = useState<string | null>(
    () => doc.regions[0]?.id ?? null
  );
  const [armed, setArmed] = useState<PaletteItem | null>(null);
  const [tab, setTab] = useState<'board' | 'preview'>('board');
  const [newMenu, setNewMenu] = useState(false);
  const [openMenu, setOpenMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const yaml = useMemo(() => emitDungeon(doc), [doc]);
  const fixtureAtlas = useMemo(
    () => (fixtureCompile ? fixtureCompile(doc) : undefined),
    [fixtureCompile, doc]
  );
  const preview = usePutDungeonPreview(doc.key, yaml, {
    client: authoringClient,
    fixtureAtlas,
  });
  const fixtures = fixtureCompile !== undefined;
  const saver = useSaveDungeon(authoringClient);
  const [listNonce, setListNonce] = useState(0);

  useEffect(() => {
    if (persistDraft) saveDraft('create', yaml);
  }, [yaml, persistDraft]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
        toastTimer.current = null;
      }
    },
    []
  );

  // Keep the active region pointing at a region that exists.
  useEffect(() => {
    if (!doc.regions.some((r) => r.id === activeRegionId)) {
      setActiveRegionId(doc.regions[0]?.id ?? null);
    }
  }, [doc.regions, activeRegionId]);

  const errors = useMemo(
    () =>
      preview.status === 'errors'
        ? preview.errors
        : saver.status === 'invalid' && saver.submittedYaml === yaml
          ? saver.errors
          : [],
    [
      preview.status,
      preview.errors,
      saver.status,
      saver.errors,
      saver.submittedYaml,
      yaml,
    ]
  );
  const errorTargets = useMemo(
    () =>
      resolveErrorTargets(
        doc,
        errors.map((e) => e.path)
      ),
    [doc, errors]
  );
  const hasErrors = errors.length > 0;

  // The door-links-to-region derivation (rpg-dnd5e-web#893), recomputed
  // straight from the document on every render — the canvas highlight
  // and the region panel's provenance note both read this directly, no
  // ratchet needed for DISPLAY (only `applyDoc`'s write path needs to
  // remember what IT set, to know what it may take back).
  const concealment = useMemo(() => deriveConcealment(doc), [doc]);
  // Concealed doors that currently hide nothing (rpg-dnd5e-web#893's leak
  // case) — not a compiler defect, so it rides beside `errors` rather
  // than inside it; the document still compiles and Save stays enabled.
  const leaks = useMemo(() => detectConcealmentLeaks(doc), [doc]);

  // Every document mutator (`dungeonYaml.ts`) is pure and knows nothing
  // of concealment; every edit re-derives it on top, ratcheted so a
  // region a person concealed by hand is never stripped (`applyDoc`'s
  // own doc comment). This is the ONE place `setDoc` is called with a
  // raw mutator result — every handler below goes through this instead.
  const applyDoc = useCallback(
    (updater: DungeonDoc | ((d: DungeonDoc) => DungeonDoc)) => {
      setDoc((d) => {
        const raw = typeof updater === 'function' ? updater(d) : updater;
        if (raw === d) return d;
        return applyDerivedConcealment(raw, derivedIdsRef.current).doc;
      });
    },
    []
  );

  // Keeps the ratchet's memory in step with what the document now says
  // is derived, and shows the author what just went dark — "derived
  // state that appears silently is the cost of this approach, and
  // visibility is what pays it" (rpg-dnd5e-web#893). Runs after every
  // commit, so `applyDoc`'s NEXT call always reads a ref that matches
  // the document as of the previous one.
  useEffect(() => {
    const current = concealment.regionIds ?? new Set<string>();
    const newlyHidden = [...current].filter(
      (id) => !derivedIdsRef.current.has(id)
    );
    derivedIdsRef.current = current;
    if (newlyHidden.length === 0) return;
    const names = newlyHidden
      .map((id) => doc.regions.find((r) => r.id === id)?.name || id)
      .join(', ');
    showToast(`now hidden: ${names} — reachable only through a concealed door`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doc.regions is read only for names, not a reachability input
  }, [concealment, showToast]);

  // Every document replacement bumps this; a late async Open whose
  // generation is no longer current is dropped rather than overwriting a
  // newer document (New, Load, or a second Open).
  const docGeneration = useRef(0);
  const replaceDoc = (next: DungeonDoc) => {
    docGeneration.current += 1;
    // New/Open/Load self-heal the same way the first mount does (see
    // `initialDerivation` above): nothing in the incoming file is
    // presumed strippable yet, so only newly-required concealment gets
    // added here — anything the file already declared stays exactly as
    // written.
    const derived = applyDerivedConcealment(next, new Set());
    setDoc(derived.doc);
    derivedIdsRef.current = derived.derivedIds;
    setSelection({ kind: 'dungeon' });
    setActiveRegionId(derived.doc.regions[0]?.id ?? null);
  };

  const handleNew = (orientation: Orientation) => {
    replaceDoc(emptyDungeon(orientation));
    setNewMenu(false);
    setTool('region');
  };

  const handleOpen = async (key: string) => {
    setOpenMenu(false);
    const generation = docGeneration.current;
    try {
      const response = await authoringClient.getDungeon(
        create(GetDungeonRequestSchema, { key })
      );
      if (generation !== docGeneration.current) return; // superseded
      replaceDoc(parseDungeon(response.yaml));
      showToast(`Opened ${key}`);
    } catch (err) {
      showToast(
        err instanceof DungeonParseError
          ? `Could not load ${key}: ${err.message}`
          : `Open failed: ${errorMessageOf(err)}`
      );
    }
  };

  // Typed YAML (rpg-dnd5e-web#899). Goes through `applyDoc`, not
  // `replaceDoc`: replacing resets the selection and the active region, which
  // on every keystroke would yank the canvas out from under the typist. A
  // keystroke is an EDIT to the document open in front of them, exactly like
  // dragging a wall, so it takes the same path — including the concealment
  // ratchet, so hand-written YAML self-heals the way the canvas does.
  const handleEditYaml = useCallback(
    (text: string): string | null => {
      try {
        applyDoc(parseDungeon(text));
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'could not read that YAML';
      }
    },
    [applyDoc]
  );

  const handleLoadText = (text: string) => {
    try {
      replaceDoc(parseDungeon(text));
      showToast('Loaded file');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load file');
    }
  };

  const handleSave = async (): Promise<boolean> => {
    const ok = await saver.save(doc.key, yaml);
    if (ok) {
      showToast(`Saved ${doc.key}`);
      onSaveSucceeded?.(doc.key);
      setListNonce((n) => n + 1);
    }
    return ok;
  };

  const handleSaveAndPlay = async () => {
    if (!onPlay) return;
    setPlaying(true);
    try {
      const ok = await handleSave();
      if (ok) await onPlay(doc.key);
    } catch (err) {
      showToast(`Play failed: ${errorMessageOf(err)}`);
    } finally {
      setPlaying(false);
    }
  };

  const handlePaint = (cell: Axial) => {
    if (activeRegionId) applyDoc((d) => paintCell(d, activeRegionId, cell));
  };
  const handleErase = (cell: Axial) => applyDoc((d) => eraseCell(d, cell));
  // The wall drag commits its RAW taut chain; applying the same
  // mutator composition the board's live preview used (wallGesture's
  // apply*) is what makes the preview the commit (#804).
  const handleWallDraw = (chain: Edge[]) => {
    applyDoc((d) => applyWallDraw(d, chain));
  };
  const handleWallErase = (chain: Edge[]) => {
    applyDoc((d) => applyWallErase(d, chain));
  };
  // Manipulation rides selection (Kirk's walk ruling): keep the wall
  // selected through a reshape by re-selecting the edges the re-derived
  // chains produced, so its handles stay up for the next grab.
  const handleWallReshape = (oldChains: Edge[][], newChains: Edge[][]) => {
    applyDoc((d) => {
      const next = applyReshape(d, oldChains, newChains);
      if (next !== d) {
        const untouched = new Set(
          wallEdges(
            removeWalls(
              d,
              oldChains.flatMap((c) => c)
            )
          ).map(edgeKey)
        );
        setSelection({
          kind: 'wall',
          edges: wallEdges(next).filter((e) => !untouched.has(edgeKey(e))),
        });
      }
      return next;
    });
  };
  // One drag, ONE door — and select it, same as the click path does.
  const handleDoorDraw = (chain: Edge[]) => {
    applyDoc((d) => {
      const next = applyDoorDraw(d, chain);
      if (next !== d && next.doors.length > 0) {
        setSelection({
          kind: 'door',
          id: next.doors[next.doors.length - 1].id,
        });
      }
      return next;
    });
  };
  const handleEdgeClick = (edge: Edge) => {
    if (tool === 'wall') applyDoc((d) => toggleWall(d, edge));
    if (tool === 'door') {
      const doorId = selection.kind === 'door' ? selection.id : undefined;
      applyDoc((d) => {
        const next = toggleDoorEdge(d, edge, doorId);
        if (next !== d && next.doors.length > 0 && !doorId) {
          setSelection({
            kind: 'door',
            id: next.doors[next.doors.length - 1].id,
          });
        }
        return next;
      });
    }
  };
  const handleCellClick = (cell: Axial) => {
    if (tool === 'start') applyDoc((d) => setStart(d, cell));
    if (tool === 'place' && armed) {
      const defaults = isMonsterRef(armed.ref)
        ? {}
        : (PROP_DEFAULTS.get(armed.ref) ?? {
            blocksMovement: true,
            blocksLos: false,
          });
      applyDoc((d) => {
        const next = placeAt(d, { ref: armed.ref, at: cell, ...defaults });
        if (next !== d) {
          setSelection({ kind: 'placement', index: next.place.length - 1 });
        }
        return next;
      });
    }
  };

  const statusLine = (() => {
    if (fixtures) return 'fixtures mode — never calls the server';
    switch (preview.status) {
      case 'idle':
        return 'waiting for the first edit';
      case 'validating':
        return 'compiling…';
      case 'compiled':
        return `compiled — ${preview.atlas?.cells.length ?? 0} cells, ${preview.atlas?.boundaries.length ?? 0} boundaries, ${preview.atlas?.regions.length ?? 0} regions`;
      case 'errors':
        return `${preview.errors.length} problem${preview.errors.length === 1 ? '' : 's'} — Save is disabled until the file compiles`;
      case 'unreachable':
        return `authoring server unreachable: ${preview.message ?? ''}`;
    }
  })();

  const saveDisabled =
    hasErrors ||
    preview.status === 'validating' ||
    preview.status === 'unreachable' ||
    saver.status === 'saving' ||
    playing ||
    !doc.key;

  // How this author likes to look at the builder (railLayout.ts): a rail
  // width, and whether the inspector is folded away above the YAML. Neither
  // touches the document.
  const rootRef = useRef<HTMLDivElement>(null);
  const [railWidth, setRailWidth] = useState<number | null>(readRailWidth);
  const [inspectorFolded, setInspectorFolded] =
    useState<boolean>(readInspectorFolded);
  const dragRef = useRef<{ x: number; width: number } | null>(null);

  const beginRailDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const rail = e.currentTarget.parentElement;
    if (!rail) return;
    dragRef.current = {
      x: e.clientX,
      width: rail.getBoundingClientRect().width,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveRailDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const root = rootRef.current;
    if (!drag || !root) return;
    setRailWidth(
      nextRailWidth(
        drag.width,
        e.clientX - drag.x,
        root.getBoundingClientRect().width
      )
    );
  };
  const endRailDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    // RELEASE THE CAPTURE EXPLICITLY. Without this the grip keeps every
    // subsequent pointer event, so the canvas goes dead after one resize —
    // the room tool stopped previewing and the brush stopped painting, and
    // nothing about it looked like the rail's fault.
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    writeRailWidth(railWidth);
  };
  // Double-click hands the rail back to the CSS default, so a drag is never
  // a one-way door.
  const resetRail = () => {
    setRailWidth(null);
    writeRailWidth(null);
  };
  const toggleInspector = () => {
    setInspectorFolded((folded) => {
      writeInspectorFolded(!folded);
      return !folded;
    });
  };

  return (
    <div
      className="dg-root"
      data-testid="dungeon-builder"
      ref={rootRef}
      style={
        railWidth === null
          ? undefined
          : { gridTemplateColumns: `220px minmax(0, 1fr) ${railWidth}px` }
      }
    >
      <div className="dg-topbar">
        {allowNewCanvas && (
          <span className="relative">
            <button
              type="button"
              className="dg-verb"
              onClick={() => setNewMenu((v) => !v)}
            >
              New
            </button>
            {newMenu && (
              <span className="absolute left-0 top-full mt-1 flex gap-1 z-10">
                <button
                  type="button"
                  className="dg-mini"
                  onClick={() => handleNew('pointy')}
                >
                  pointy-top
                </button>
                <button
                  type="button"
                  className="dg-mini"
                  onClick={() => handleNew('flat')}
                >
                  flat-top
                </button>
              </span>
            )}
          </span>
        )}
        {allowNewCanvas && (
          <span className="relative">
            <button
              type="button"
              className="dg-verb"
              onClick={() => setOpenMenu((v) => !v)}
              disabled={fixtures}
            >
              Open
            </button>
            {openMenu && <OpenMenu key={listNonce} onOpen={handleOpen} />}
          </span>
        )}
        <button
          type="button"
          className="dg-verb"
          onClick={() => void handleSave()}
          disabled={saveDisabled || fixtures}
        >
          {saver.status === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {onPlay && (
          <button
            type="button"
            className="dg-verb dg-verb--primary"
            onClick={() => void handleSaveAndPlay()}
            disabled={saveDisabled || !!playDisabledReason || fixtures}
            title={
              playDisabledReason ??
              'Save, then start an encounter on this dungeon'
            }
          >
            {playing ? 'Starting…' : 'Save & Play'}
          </button>
        )}
        <span className="text-xs opacity-70 ml-2">
          {doc.name || doc.key} · {doc.orientation}
        </span>
        {saver.status === 'error' && (
          <span className="text-xs text-red-400 ml-2">{saver.message}</span>
        )}
      </div>

      <div className="dg-col">
        <Palette
          doc={doc}
          tool={tool}
          onTool={setTool}
          activeRegionId={activeRegionId}
          onActiveRegion={(id) => {
            setActiveRegionId(id);
            setSelection({ kind: 'region', id });
          }}
          onAddRegion={() => {
            applyDoc((d) => {
              const next = addRegion(d);
              const id = next.regions[next.regions.length - 1].id;
              setActiveRegionId(id);
              setSelection({ kind: 'region', id });
              return next;
            });
            setTool('region');
          }}
          armed={armed}
          onArm={setArmed}
        />
      </div>

      <div className="dg-center">
        <div className="dg-center-tabs">
          <button
            type="button"
            className={`dg-mini ${tab === 'board' ? 'dg-tool--on' : ''}`}
            onClick={() => setTab('board')}
          >
            Canvas
          </button>
          <button
            type="button"
            className={`dg-mini ${tab === 'preview' ? 'dg-tool--on' : ''}`}
            onClick={() => setTab('preview')}
          >
            3D preview
          </button>
        </div>
        <div className="dg-center-body">
          {tab === 'board' ? (
            <CreationBoard
              // Remount on New/Open/Load so the viewport re-centres on the
              // new floor and its grown extent resets.
              key={docGeneration.current}
              doc={doc}
              tool={tool}
              selection={selection}
              activeRegionId={activeRegionId}
              errorTargets={errorTargets}
              concealedRegionIds={concealment.regionIds ?? EMPTY_REGION_IDS}
              onPaint={handlePaint}
              onPaintRoom={(a, b) =>
                applyDoc((d) =>
                  activeRegionId ? paintRect(d, activeRegionId, a, b) : d
                )
              }
              onErase={handleErase}
              onEdgeClick={handleEdgeClick}
              onWallDraw={handleWallDraw}
              onWallErase={handleWallErase}
              onWallReshape={handleWallReshape}
              onDoorDraw={handleDoorDraw}
              onCellClick={handleCellClick}
              onSelect={setSelection}
            />
          ) : (
            <DungeonPreview3D
              atlas={preview.atlas}
              doc={doc}
              status={statusLine}
              staleNotice={staleAtlasNotice(preview)}
            />
          )}
        </div>
      </div>

      <div className="dg-right">
        <div
          className="dg-grip"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the inspector rail"
          title="Drag to resize · double-click to reset"
          onPointerDown={beginRailDrag}
          onPointerMove={moveRailDrag}
          onPointerUp={endRailDrag}
          onPointerCancel={endRailDrag}
          onDoubleClick={resetRail}
        />
        <div className="dg-col">
          <button
            type="button"
            className="dg-fold"
            onClick={toggleInspector}
            aria-expanded={!inspectorFolded}
          >
            <span aria-hidden="true">
              {inspectorFolded ? '\u25b8' : '\u25be'}
            </span>
            Inspector
          </button>
          {!inspectorFolded && (
            <Inspector
              doc={doc}
              selection={selection}
              concealment={concealment}
              onDungeon={(patch) => applyDoc((d) => updateDungeon(d, patch))}
              onRegion={(id, patch) => {
                applyDoc((d) => updateRegion(d, id, patch));
                if (patch.id !== undefined) {
                  setSelection({ kind: 'region', id: patch.id });
                  if (activeRegionId === id) setActiveRegionId(patch.id);
                }
              }}
              onRemoveRegion={(id) => {
                applyDoc((d) => removeRegion(d, id));
                setSelection({ kind: 'dungeon' });
              }}
              onDoor={(id, patch) => {
                applyDoc((d) => updateDoor(d, id, patch));
                if (patch.id !== undefined)
                  setSelection({ kind: 'door', id: patch.id });
              }}
              onRemoveWall={(edges) => {
                applyDoc((d) => removeWalls(d, edges));
                setSelection({ kind: 'dungeon' });
              }}
              onSetWallHeight={(edges, height) => {
                applyDoc((d) => setWallHeights(d, edges, height));
              }}
              onRemoveDoor={(id) => {
                applyDoc((d) => ({
                  ...d,
                  doors: d.doors.filter((x) => x.id !== id),
                }));
                setSelection({ kind: 'dungeon' });
              }}
              onPlacement={(index, patch) =>
                applyDoc((d) => updatePlacement(d, index, patch))
              }
              onRemovePlacement={(index) => {
                applyDoc((d) => removePlacement(d, index));
                setSelection({ kind: 'dungeon' });
              }}
            />
          )}
        </div>
        <div className="dg-col">
          <YamlPane
            yaml={yaml}
            filename={`${doc.key || 'dungeon'}.yaml`}
            errors={errors}
            warnings={leaks}
            statusLine={statusLine}
            allowFileIO={allowYamlFileIO}
            onLoad={handleLoadText}
            onEdit={allowYamlFileIO ? handleEditYaml : undefined}
          />
        </div>
      </div>

      {toast && (
        <div className="dg-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
