import type { CompositionSource } from '@/compositions/compositionSource';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { FactUseTarget } from '../world-building/factIndex';
import { documentPlacementNames } from '../world-building/placementNames';
import { TablesPanel } from '../world-building/TablesPanel';
import type { IdFactory, KeyValueStorage } from '../world-building/types';
import type { WorkspaceBounds } from '../world-building/workspaceGeometry';
import { WorldBuildingConcept } from '../world-building/WorldBuildingConcept';
import { WorldBuildingViewport } from '../world-building/WorldBuildingViewport';
import './encounterStudio.css';
import { AboutPanel } from './FieldHelp';
import type { LayoutPlacedEditing } from './LayoutPlacedOverlay';
import { LayoutFooter, LayoutRoomList } from './LayoutRoomList';
import { LayoutViewport } from './LayoutViewport';
import { regionOverview } from './overviewColours';
import { contentBounds } from './overviewFrame';
import { StudioCast } from './StudioCast';
import { StudioConcealments } from './StudioConcealments';
import { StudioCreaturePalette } from './StudioCreaturePalette';
import { StudioDoorControls } from './StudioDoorControls';
import { StudioDraftFile, type DraftFileKey } from './StudioDraftFile';
import { StudioEndings } from './StudioEndings';
import { StudioFacts } from './StudioFacts';
import { StudioInspector } from './StudioInspector';
import { StudioScenarios } from './StudioScenarios';
import {
  studioInspectionOf,
  type EncounterStudioSession,
  type EncounterStudioView,
  type LayoutFloorTool,
  type LayoutFrame,
  type LayoutTool,
  type StudioDoorEditing,
  type StudioHome,
  type StudioSocialSection,
  type StudioWallEditing,
} from './studioSession';
import { StudioSidebar, type StudioSidebarSection } from './StudioSidebar';
import { StudioWallControls } from './StudioWallControls';
import { useStudioLabels } from './useStudioLabels';

const ENCOUNTER_SECTIONS = {
  cast: 'Cast',
  tables: 'Tables',
  factions: 'Factions',
  dispositions: 'Dispositions',
  intel: 'Intel',
  endings: 'Endings',
  concealments: 'Concealments',
  scenarios: 'Scenarios',
  facts: 'Facts',
} as const;

/** Holds a hidden subtree still: while it stays inactive React skips it, so
 * Layout gestures never re-render the mounted 3D block. Becoming active (or
 * the render that turns it inactive) renders it with current props. */
const FrozenWhileHidden = memo(
  function FrozenWhileHidden({
    children,
  }: {
    active: boolean;
    children: ReactNode;
  }): React.JSX.Element {
    return <>{children}</>;
  },
  (previous, next) => !previous.active && !next.active
);

interface EncounterStudioWorkspaceProps {
  compositionSource: CompositionSource;
  storage?: KeyValueStorage;
  idFactory?: IdFactory;
  onBack?: () => void;
}
interface StudioSurfaceProps {
  session: EncounterStudioSession;
  home: StudioHome;
  view: EncounterStudioView;
  layoutTool: LayoutTool;
  frame: LayoutFrame;
  onHomeChange(next: StudioHome): void;
  onViewChange(next: EncounterStudioView): void;
  onLayoutToolChange(next: LayoutTool): void;
  onFrameChange(next: LayoutFrame): void;
  onBack?: () => void;
}

/** Presentation homes share the same mounted owner and canonical selection. */
function StudioSurface({
  session,
  home,
  view,
  layoutTool,
  frame,
  onHomeChange,
  onViewChange,
  onLayoutToolChange,
  onFrameChange,
  onBack,
}: StudioSurfaceProps): React.JSX.Element {
  const [encounterSection, setEncounterSection] =
    useState<keyof typeof ENCOUNTER_SECTIONS>('cast');
  const [mapPalette, setMapPalette] = useState<'props' | 'creatures'>('props');
  const [regionTool, setRegionTool] = useState<LayoutFloorTool>('paint');
  const selectedRegion =
    session.arrange?.kind === 'label' ? session.arrange.region : undefined;
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sections, setSections] = useState<
    Record<StudioHome, StudioSidebarSection>
  >({ build: 'inspector', encounter: 'tables' });
  const section = sections[home];
  const showSection = (next: StudioSidebarSection): void => {
    setSections((current) => ({ ...current, [home]: next }));
    setSidebarOpen(true);
  };
  // Clicking a thing opens the inspector, even when the author hid it. A
  // key that stays the same (a preview rerender) never reopens it.
  const selectionKey = session.arrange?.selectionKey ?? null;
  const shownKey = useRef(selectionKey);
  useEffect(() => {
    if (selectionKey !== null && selectionKey !== shownKey.current)
      setSidebarOpen(true);
    shownKey.current = selectionKey;
  }, [selectionKey]);
  const changeTool = (next: LayoutTool): void => {
    if (next !== layoutTool) session.cancelTransients();
    onLayoutToolChange(next);
  };
  /** Which label the Build home's label tool places: New region arms a
   * room, Note and Add a note arm a note. */
  const [labelKind, setLabelKind] = useState<'note' | 'room'>('note');
  const labels = useStudioLabels(
    session,
    view,
    layoutTool === 'label',
    () => changeTool('label'),
    () => {
      changeTool('select');
      showSection('inspector');
    },
    labelKind
  );
  const startLabel = (): void => {
    if (session.doorEditing.active) session.doorEditing.setActive(false);
    changeTool('label');
    labels.activate();
    setSidebarOpen(true);
  };
  /** Wall, Door and Note are Layout tools; their options show at the top of
   * the inspector while armed. */
  const armTool = (next: 'wall' | 'door' | 'label'): void => {
    if (next === 'label') {
      setLabelKind('note');
      startLabel();
      return;
    }
    labels.editing.onCancel();
    if (next === 'wall') {
      if (session.doorEditing.active) session.doorEditing.setActive(false);
      changeTool('wall');
    } else if (session.doorEditing.setActive(true)) onLayoutToolChange('door');
    setSidebarOpen(true);
  };
  /** New region: the room-label tool, as the retired Regions home armed it. */
  const armRoomLabel = (): void => {
    setLabelKind('room');
    startLabel();
  };
  /** A request the Layout surface fits to its own size. */
  const [frameTarget, setFrameTarget] = useState<{
    bounds: WorkspaceBounds;
    nonce: number;
    occluders(): readonly { left: number; right: number }[];
  }>();
  /** Frame world bounds in the part of the map the open inspector leaves,
   * measured when Layout applies the request, after the inspector opens. */
  const frameBounds = (bounds: WorkspaceBounds): void =>
    setFrameTarget((current) => ({
      bounds,
      nonce: (current?.nonce ?? 0) + 1,
      occluders: () => {
        const sidebar = document.getElementById('studio-sidebar');
        const rect =
          sidebar && !sidebar.hidden ? sidebar.getBoundingClientRect() : null;
        return rect && rect.width > 0 ? [rect] : [];
      },
    }));
  const overview = useMemo(
    () =>
      regionOverview(session.document.draft, session.regionEditing.resolutions),
    [session.document.draft, session.regionEditing.resolutions]
  );
  /** One 3D label per resolved region, in its overview colour (S3-T7). */
  const regionLabels = useMemo(() => {
    const scene = session.document.draft.scene;
    return (scene.authoringRegions ?? []).flatMap((region) => {
      const colour = overview.sizes.get(region.id)
        ? overview.colours.get(region.id)
        : undefined;
      const label = scene.mapLabels?.find((l) => l.id === region.labelId);
      return colour && label
        ? [
            {
              id: region.id,
              text: label.text,
              location: label.location,
              colour,
            },
          ]
        : [];
    });
  }, [session.document.draft.scene, overview]);
  const finishProjection = session.regionEditing.finishes?.projection;
  const unappliedFinishes = useMemo(
    () =>
      new Set(
        (finishProjection?.regions ?? [])
          .filter((region) => region.status === 'unresolved')
          .map((region) => region.id)
      ),
    [finishProjection]
  );
  const changeSection = (next: StudioSidebarSection): void => {
    showSection(next);
  };
  const exitDoor = (): void => {
    session.doorEditing.setActive(false);
    onLayoutToolChange('select');
  };
  const exitWall = (): void => {
    changeTool('select');
  };
  const exitRegion = (): void => {
    changeTool('select');
  };
  /** Define explicit area: the region tool in Layout, armed for the
   * selected region label, with its group at the top of the inspector. */
  const defineRegion = (): void => {
    labels.editing.onCancel();
    changeTool('region');
    setRegionTool('paint');
    setSidebarOpen(true);
  };
  const changeHome = (next: StudioHome): void => {
    if (next === home) return;
    // Explicit navigation retires map gestures, not document or selection.
    session.setPropTool('select');
    if (session.doorEditing.active) session.doorEditing.setActive(false);
    labels.editing.onCancel();
    session.cancelTransients();
    onLayoutToolChange('select');
    onHomeChange(next);
    setSidebarOpen(true);
  };
  /** Add members on the map: Build, in the view last used, with the
   * concealment armed; map clicks then toggle membership until Done or
   * Escape. A view switch disarms, as every armed gesture does. */
  const armConcealment = (id: string): void => {
    changeHome('build');
    session.concealments.armMembers(id);
  };
  const moveSelectedCreature = (): void => {
    if (session.arrange?.kind !== 'actor') return;
    changeHome('build');
    if (session.doorEditing.active) session.doorEditing.setActive(false);
    onLayoutToolChange('select');
    onViewChange('3d');
    session.setPropTool('move');
    setSidebarOpen(true);
  };
  /** Party start is placed on the 3D floor: the gesture is armed there. */
  const placePartyStart = (): void => {
    if (session.doorEditing.active) session.doorEditing.setActive(false);
    labels.editing.onCancel();
    onLayoutToolChange('select');
    onViewChange('3d');
    session.armPartyStart();
    setSidebarOpen(true);
  };
  const openDefinitions = (section: StudioSocialSection): void => {
    changeHome('encounter');
    setEncounterSection(section);
  };
  /** A fact a read-back ref named; the Facts section brings it into view. */
  const [focusFact, setFocusFact] = useState<string | null>(null);
  const openFact = (fact: string): void => {
    setFocusFact(fact);
    openDefinitions('facts');
  };
  /** A writer or reader in the fact index: select the placed thing on the
   * map, or open the home section that holds it. */
  const [focusEnding, setFocusEnding] = useState<{ id: string } | null>(null);
  const openFactUse = (target: FactUseTarget): void => {
    if ('home' in target) {
      if (target.home === 'endings') setFocusEnding({ id: target.id });
      setEncounterSection(target.home);
      return;
    }
    const selected =
      target.kind === 'creature'
        ? session.creatures.select(target.id)
        : session.selectScene([target.id]);
    if (!selected) return;
    changeHome('build');
    setSidebarOpen(true);
  };
  /** The last imported file's key, for its draft (S4-Q2). */
  const [fileKey, setFileKey] = useState<DraftFileKey | null>(null);
  const [draftFileOpen, setDraftFileOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(session.document.draft.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  useEffect(() => {
    setName(session.document.draft.name);
    setRenameError(null);
  }, [session.document]);
  const switchView = (next: EncounterStudioView): void => {
    if (next === view) return;
    if (session.doorEditing.active) session.doorEditing.setActive(false);
    if (layoutTool === 'door' || layoutTool === 'region')
      onLayoutToolChange('select');
    session.cancelTransients();
    setRenaming(false);
    onViewChange(next);
  };
  const spatial = home !== 'encounter';
  // Once per studio session: the first visit to 3D mounts the viewport.
  const [visited3d, setVisited3d] = useState(view === '3d');
  useEffect(() => {
    if (view === '3d') setVisited3d(true);
  }, [view]);
  const inspection = studioInspectionOf(
    session.arrange,
    session.document.draft.scene
  );
  const placementNames = useMemo(
    () => documentPlacementNames(session.document),
    [session.document]
  );
  const armedConcealment = session.concealments.armedId;
  /** While a concealment is armed, a Layout click on a hex, prop, door or
   * wall toggles membership instead of selecting it (rpg-project#578). */
  const pickMember = armedConcealment !== null;
  const layoutWallEditing: StudioWallEditing = pickMember
    ? {
        ...session.wallEditing,
        select: (id) => {
          if (id !== null) session.concealments.pick({ kind: 'prop', id });
          return false;
        },
      }
    : session.wallEditing;
  const layoutDoorEditing: StudioDoorEditing = pickMember
    ? {
        ...session.doorEditing,
        select: (target) => {
          if (target !== null)
            session.concealments.pick({ kind: 'prop', id: target.doorId });
          return false;
        },
      }
    : session.doorEditing;
  const concealedCells = armedConcealment
    ? session.document.scope.concealments?.[armedConcealment]?.cells
    : undefined;
  const placedEditing: LayoutPlacedEditing = pickMember
    ? {
        selected: { kind: 'nothing' },
        names: placementNames,
        selectCreature: () => false,
        selectProp: (id) =>
          void session.concealments.pick({ kind: 'prop', id }),
        selectPartyStart: () => false,
      }
    : {
        selected: inspection.selection,
        picked: inspection.pick ?? undefined,
        names: placementNames,
        selectCreature: (id) => session.creatures.select(id),
        selectProp: (id, extend) => {
          const current = session.viewportProps.selectedIds;
          session.selectScene(
            extend ? (current.includes(id) ? current : [...current, id]) : [id]
          );
        },
        selectPartyStart: () => session.selectPartyStart(),
      };
  const armedTool =
    home !== 'build' || view !== 'layout' ? null : layoutTool === 'wall' ? (
      <StudioWallControls
        session={session}
        onDismiss={() => setSidebarOpen(false)}
        onExitWallTool={exitWall}
      />
    ) : layoutTool === 'door' ? (
      <StudioDoorControls editing={session.doorEditing} onExit={exitDoor} />
    ) : layoutTool === 'label' ? (
      labels.controls
    ) : layoutTool === 'region' && selectedRegion ? (
      <div
        className="es-context-panel es-region-controls"
        aria-label="Explicit region area controls"
      >
        <h2>
          Explicit area ·{' '}
          {session.arrange?.kind === 'label' ? session.arrange.label.text : ''}
        </h2>
        <p className="es-help">
          Only region membership changes. Floor, walls and props stay untouched.
          Drag, then release to apply once. Escape cancels.
        </p>
        <div className="es-buttons">
          {(['paint', 'erase', 'rectangle'] as const).map((mode) => (
            <button
              type="button"
              key={mode}
              aria-pressed={regionTool === mode}
              onClick={() => {
                session.cancelTransients();
                setRegionTool(mode);
              }}
            >
              {mode === 'paint'
                ? 'Paint region'
                : mode === 'erase'
                  ? 'Erase region'
                  : 'Rectangle region'}
            </button>
          ))}
          <button type="button" onClick={exitRegion}>
            Done area editing
          </button>
        </div>
      </div>
    ) : null;

  return (
    <section
      className="encounter-studio"
      aria-label="Encounter Studio workspace"
      data-home={home}
    >
      <header className="es-header">
        {onBack && (
          <button type="button" onClick={() => setConfirmLeave(true)}>
            Back
          </button>
        )}
        <div className="es-title">
          <h1>Encounter Studio</h1>
          {renaming ? (
            <form
              aria-label="Rename encounter"
              className="es-buttons"
              onSubmit={(event) => {
                event.preventDefault();
                if (session.renameDocument(name)) setRenaming(false);
                else
                  setRenameError(
                    'Rename refused. Use a nonblank name of at most 120 characters; review the document notice.'
                  );
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  setRenaming(false);
                }
              }}
            >
              <input
                aria-label="Encounter name"
                value={name}
                maxLength={120}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
              <button type="submit">Apply encounter name</button>
              <button type="button" onClick={() => setRenaming(false)}>
                Cancel rename
              </button>
              {renameError && <span role="alert">{renameError}</span>}
            </form>
          ) : (
            <button
              type="button"
              aria-label={`Rename encounter ${session.document.draft.name}`}
              onClick={() => {
                setName(session.document.draft.name);
                setRenameError(null);
                setRenaming(true);
              }}
            >
              {session.document.draft.name}
            </button>
          )}
        </div>
        <nav className="es-buttons" aria-label="Studio home">
          {(['build', 'encounter'] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={home === value}
              onClick={() => changeHome(value)}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </nav>
        <nav className="es-buttons" aria-label="Studio view" hidden={!spatial}>
          <button
            type="button"
            aria-pressed={view === 'layout'}
            onClick={() => switchView('layout')}
          >
            Layout
          </button>
          <button
            type="button"
            aria-pressed={view === '3d'}
            onClick={() => switchView('3d')}
          >
            3D
          </button>
        </nav>
        <div className="es-save">
          <span className="es-local">LOCAL DRAFT</span>
          <span role="status">{session.saveStatus}</span>
          <button type="button" onClick={session.saveLocalDraft}>
            {session.autosaveBlocked
              ? 'Replace unreadable local draft'
              : 'Save local draft'}
          </button>
          <button
            type="button"
            aria-expanded={draftFileOpen}
            aria-controls="studio-draft-file"
            onClick={() => setDraftFileOpen(!draftFileOpen)}
          >
            Draft file
          </button>
        </div>
      </header>
      {session.autosaveBlocked && (
        <p className="es-warning" role="alert">
          Autosave is paused. The displayed draft is in memory. “Replace
          unreadable local draft” overwrites the unreadable stored data with
          this draft.
        </p>
      )}
      {draftFileOpen && (
        <div id="studio-draft-file">
          <StudioDraftFile
            session={session}
            fileKey={fileKey}
            onFileKey={setFileKey}
            onClose={() => setDraftFileOpen(false)}
          />
        </div>
      )}
      {session.notice !== null && (
        <div className="es-warning" role="alert">
          <span>{session.notice}</span>
          <button type="button" onClick={session.dismissNotice}>
            Dismiss notice
          </button>
        </div>
      )}
      {confirmLeave && (
        <div
          className="es-warning"
          role="alertdialog"
          aria-label="Confirm leaving Encounter Studio"
        >
          <span>
            Leave Encounter Studio? Only successfully saved local drafts are
            kept. Changes still in memory and unfinished gestures may be lost.
          </span>
          <span className="es-buttons">
            <button
              type="button"
              onClick={() => {
                session.cancelTransients();
                onBack?.();
              }}
            >
              Leave Encounter Studio
            </button>
            <button type="button" onClick={() => setConfirmLeave(false)}>
              Keep editing
            </button>
          </span>
        </div>
      )}
      <div className="es-tools-container">
        <div
          className="es-toolbar"
          role="toolbar"
          aria-label="Studio editing tools"
        >
          {session.propTool === 'move' && session.arrange?.kind === 'actor' && (
            <div className="es-buttons" role="status">
              <strong>
                Moving {session.arrange.mapName ?? session.arrange.monster.id} ·
                click the destination hex
              </strong>
              <button
                type="button"
                onClick={() => session.setPropTool('select')}
              >
                Cancel creature move
              </button>
            </div>
          )}
          {home === 'build' &&
            session.viewportProps.roomAuthoring?.tool === 'start' && (
              <div className="es-buttons" role="status">
                <strong>Placing party start · click the floor</strong>
                <button
                  type="button"
                  onClick={() => session.setPropTool('select')}
                >
                  Cancel party start
                </button>
              </div>
            )}
          {home === 'build' && armedConcealment && (
            <div className="es-buttons" role="status">
              <strong>
                Adding members to {armedConcealment} · click hexes, props, doors
                and walls
              </strong>
              <button
                type="button"
                onClick={() => session.concealments.disarm()}
              >
                Done adding members
              </button>
            </div>
          )}
          {session.creatures.placement && (
            <div className="es-buttons" role="status">
              <strong>
                Placing {session.creatures.placement.name} · click the map
              </strong>
              <button type="button" onClick={() => session.cancelTransients()}>
                Cancel creature placement
              </button>
            </div>
          )}
          {home === 'build' &&
            (view === 'layout' ? (
              <div
                className="es-buttons"
                role="group"
                aria-label="Layout tools"
              >
                {(['select', 'paint', 'erase', 'rectangle'] as const).map(
                  (tool) => (
                    <button
                      type="button"
                      key={tool}
                      aria-pressed={layoutTool === tool}
                      onClick={() => {
                        if (session.doorEditing.active)
                          session.doorEditing.setActive(false);
                        labels.editing.onCancel();
                        changeTool(tool);
                      }}
                    >
                      {tool[0].toUpperCase() + tool.slice(1)}
                    </button>
                  )
                )}
                {(
                  [
                    ['wall', 'Wall'],
                    ['door', 'Door'],
                    ['label', 'Note'],
                  ] as const
                ).map(([tool, label]) => (
                  <button
                    type="button"
                    key={tool}
                    aria-pressed={layoutTool === tool}
                    onClick={() => armTool(tool)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="es-buttons" role="group" aria-label="Prop tools">
                {(['select', 'move', 'rotate'] as const).map((tool) => (
                  <button
                    type="button"
                    key={tool}
                    aria-pressed={
                      session.viewportProps.roomAuthoring?.tool === tool
                    }
                    onClick={() => session.setPropTool(tool)}
                  >
                    {tool[0].toUpperCase() + tool.slice(1)}
                  </button>
                ))}
              </div>
            ))}
          {home === 'encounter' && (
            <strong>
              Encounter configuration · {ENCOUNTER_SECTIONS[encounterSection]}
            </strong>
          )}
          {spatial && (
            <button
              type="button"
              aria-expanded={sidebarOpen}
              aria-controls="studio-sidebar"
              aria-keyshortcuts="N"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              Inspector (N)
            </button>
          )}
          <div
            className="es-buttons"
            role="group"
            aria-label="Document history"
          >
            <button
              type="button"
              disabled={!session.canUndo}
              onClick={session.undo}
            >
              Undo
            </button>
            <button
              type="button"
              disabled={!session.canRedo}
              onClick={session.redo}
            >
              Redo
            </button>
          </div>
          {home === 'build' && view === '3d' && (
            <p className="es-help">
              {session.viewportProps.roomAuthoring?.tool === 'repeat'
                ? 'Repeat active · Drag on floor to repeat pieces · Esc / right-click cancels'
                : 'Drag assets onto ground or tabletop · Middle drag orbits · Shift-middle pans · Wheel zooms'}
            </p>
          )}
        </div>
        <div className="es-context-layer">
          <StudioSidebar
            open={spatial && sidebarOpen}
            section={section}
            onSectionChange={changeSection}
            onToggle={() => setSidebarOpen((open) => !open)}
            keyboardEnabled={spatial}
            compact={home === 'build'}
          >
            {home === 'build' && (
              <StudioInspector
                session={session}
                inspection={inspection}
                view={view}
                layoutTool={layoutTool}
                armedTool={armedTool}
                onConfigure={openDefinitions}
                onOpenFact={openFact}
                onMoveCreature={moveSelectedCreature}
                onFrameChange={onFrameChange}
                onArmTool={armTool}
                onPlacePartyStart={placePartyStart}
                onOpenCastMember={(ref) => session.cast.select(ref)}
                onOpenRegion={(labelId) => {
                  session.mapLabelSelection.select(labelId);
                }}
                onDefineRegion={view === 'layout' ? defineRegion : undefined}
              />
            )}
          </StudioSidebar>
        </div>
      </div>
      <div className="es-work-area">
        <div
          className="es-map-workspace"
          aria-hidden={!spatial}
          inert={!spatial}
          style={!spatial ? { visibility: 'hidden' } : undefined}
        >
          {view === 'layout' && (
            <div className="es-layout">
              {spatial && (
                <LayoutRoomList
                  draft={session.document.draft}
                  overview={overview}
                  selectedLabelId={session.mapLabelSelection.selectedId}
                  onSelect={(labelId, bounds) => {
                    if (!session.mapLabelSelection.select(labelId)) return;
                    setSidebarOpen(true);
                    if (bounds) frameBounds(bounds);
                  }}
                  onCreate={armRoomLabel}
                  unappliedFinishes={unappliedFinishes}
                  onShowEntire={() =>
                    frameBounds(contentBounds(session.document.draft))
                  }
                />
              )}
              <div className="es-layout-main">
                <div className="es-canvas">
                  <LayoutViewport
                    draft={session.document.draft}
                    tool={layoutTool}
                    frame={frame}
                    onFrameChange={onFrameChange}
                    onCommit={session.commitFloor}
                    labelEditing={labels.editing}
                    documentContext={session.document}
                    wallEditing={layoutWallEditing}
                    doorEditing={layoutDoorEditing}
                    regionEditing={session.regionEditing}
                    selectedRegion={selectedRegion}
                    patternStart={
                      session.regionEditing.finishes?.projection.regions.find(
                        (r) => r.id === selectedRegion?.id
                      )?.marker
                    }
                    regionTool={regionTool}
                    onExitRegionTool={exitRegion}
                    onExitDoorTool={exitDoor}
                    intentEpoch={session.intentEpoch}
                    onExitWallTool={exitWall}
                    onSelectHex={(cell) =>
                      void (pickMember
                        ? session.concealments.pick({ kind: 'cell', cell })
                        : session.selectHex(cell))
                    }
                    onClearSelection={() => void session.clearSelection()}
                    placedEditing={placedEditing}
                    exits={session.document.scope.exits}
                    concealedCells={concealedCells}
                    frameTarget={frameTarget}
                  />
                </div>
                <LayoutFooter draft={session.document.draft} />
              </div>
            </div>
          )}
          {/* The 3D canvas mounts on the first visit to 3D and then stays
              mounted, hidden while Layout is active, so a view switch is a
              visibility change, not a renderer and texture rebuild
              (rpg-dnd5e-web#1271). Hidden, its render loop is paused and the
              block is frozen; the palette and scene tree are ordinary DOM
              and render only while 3D is shown. */}
          {visited3d && (
            <FrozenWhileHidden active={view === '3d' && spatial}>
              <div
                className={`es-3d ${home !== 'build' ? 'es-3d-inspection' : ''}`}
                style={view === '3d' ? undefined : { display: 'none' }}
                aria-hidden={view !== '3d'}
                inert={view !== '3d'}
              >
                {view === '3d' && (
                  <aside
                    hidden={home !== 'build'}
                    className="es-props es-palette wb-panel"
                    aria-label="Placement palettes"
                  >
                    <nav className="es-buttons" aria-label="Placement palette">
                      <button
                        type="button"
                        aria-pressed={mapPalette === 'props'}
                        onClick={() => {
                          if (mapPalette !== 'props')
                            session.cancelTransients();
                          setMapPalette('props');
                        }}
                      >
                        Props
                      </button>
                      <button
                        type="button"
                        aria-pressed={mapPalette === 'creatures'}
                        onClick={() => {
                          if (mapPalette !== 'creatures')
                            session.cancelTransients();
                          setMapPalette('creatures');
                        }}
                      >
                        Monsters &amp; NPCs
                      </button>
                    </nav>
                    <div
                      hidden={mapPalette !== 'props'}
                      aria-label="Prop palette"
                    >
                      {session.propControls.palette}
                    </div>
                    {home === 'build' && mapPalette === 'creatures' && (
                      <StudioCreaturePalette
                        session={session}
                        onConfigure={() => {
                          changeHome('encounter');
                          setEncounterSection('cast');
                        }}
                        onPlace={(id, appearanceRef) => {
                          const accepted = session.creatures.armPlacement(
                            id,
                            appearanceRef
                          );
                          if (accepted) setSidebarOpen(true);
                          return accepted;
                        }}
                      />
                    )}
                  </aside>
                )}
                <div className="es-canvas">
                  <WorldBuildingViewport
                    {...session.viewportProps}
                    regionLabels={regionLabels}
                    active={view === '3d' && spatial}
                    studioCanvas
                  />
                </div>
                {view === '3d' && (
                  <aside
                    hidden={home !== 'build'}
                    className="es-props wb-panel"
                    aria-label="Scene and selected props"
                  >
                    {session.propControls.tree}
                  </aside>
                )}
              </div>
            </FrozenWhileHidden>
          )}
        </div>
        <section
          className="es-encounter-home"
          aria-label="Encounter configuration"
          hidden={home !== 'encounter'}
        >
          <nav className="es-buttons" aria-label="Encounter tools">
            {(
              [
                'cast',
                'tables',
                'factions',
                'dispositions',
                'intel',
                'endings',
                'concealments',
                'scenarios',
                'facts',
              ] as const
            ).map((section) => (
              <button
                key={section}
                type="button"
                aria-pressed={encounterSection === section}
                onClick={() => {
                  setFocusEnding(null);
                  setEncounterSection(section);
                }}
              >
                {ENCOUNTER_SECTIONS[section]}
              </button>
            ))}
          </nav>
          {home === 'encounter' && encounterSection === 'cast' && (
            <StudioCast
              session={session}
              onShowPlacement={(id) => {
                // The one arbiter holds the placement; Build opens the
                // inspector on it, in the view the author last used.
                if (!session.creatures.select(id)) return;
                changeHome('build');
                setSidebarOpen(true);
              }}
            />
          )}
          {home === 'encounter' &&
            (encounterSection === 'intel' ||
              encounterSection === 'factions' ||
              encounterSection === 'dispositions') && (
              <section
                aria-label={`${ENCOUNTER_SECTIONS[encounterSection]} definitions`}
                className="es-social-panel"
              >
                <h2>{ENCOUNTER_SECTIONS[encounterSection]}</h2>
                <AboutPanel>
                  <p>
                    {encounterSection === 'intel'
                      ? 'Define records and what they reveal here. Select a creature or declared prop on the map to assign the records it holds in its inspector. Record ids and revealed fact ids are different references.'
                      : encounterSection === 'factions'
                        ? 'Define factions and shared policy here. Assign individual placed creatures in their inspector on the map. A mind names a placed individual, not a reusable creature recipe.'
                        : 'Author faction relationships and conditions here. Intel can reveal named facts; whose knowledge matters and what changes are evaluated by the engine, not by this form.'}
                  </p>
                </AboutPanel>
                {session.socialControls[encounterSection]}
              </section>
            )}
          {home === 'encounter' && encounterSection === 'endings' && (
            <StudioEndings session={session} focus={focusEnding?.id} />
          )}
          {home === 'encounter' && encounterSection === 'concealments' && (
            <StudioConcealments
              session={session}
              onArmMembers={armConcealment}
              onOpenIntel={() => setEncounterSection('intel')}
            />
          )}
          {home === 'encounter' && encounterSection === 'scenarios' && (
            <StudioScenarios document={session.document} />
          )}
          {home === 'encounter' && encounterSection === 'facts' && (
            <StudioFacts
              document={session.document}
              focus={focusFact}
              onOpen={openFactUse}
            />
          )}
          <div hidden={encounterSection !== 'tables'}>
            <h2>Tables</h2>
            <AboutPanel>
              <p>
                Shared monster behavior. Define a table once; creatures and
                factions can reference it by name.
              </p>
            </AboutPanel>
            <TablesPanel
              key={session.document.draft.id}
              scope={session.document.scope}
              room={session.document.draft.room}
              placementNames={placementNames}
              collapsedEntries
              explicitRename
              onChange={(scope) => session.commitTables(scope.tables)}
            />
          </div>
        </section>
      </div>
    </section>
  );
}

export function EncounterStudioWorkspace({
  compositionSource,
  storage,
  idFactory,
  onBack,
}: EncounterStudioWorkspaceProps): React.JSX.Element {
  const [home, setHome] = useState<StudioHome>('build');
  const [view, setView] = useState<EncounterStudioView>('layout');
  const [layoutTool, setLayoutTool] = useState<LayoutTool>('select');
  const [frame, setFrame] = useState<LayoutFrame>({
    center: { x: 0, z: 0 },
    zoom: 1,
  });
  const renderPresentation = useCallback(
    (session: EncounterStudioSession): ReactNode => (
      <StudioSurface
        session={session}
        home={home}
        view={view}
        layoutTool={layoutTool}
        frame={frame}
        onHomeChange={setHome}
        onViewChange={setView}
        onLayoutToolChange={setLayoutTool}
        onFrameChange={setFrame}
        onBack={onBack}
      />
    ),
    [home, view, layoutTool, frame, onBack]
  );
  return (
    <WorldBuildingConcept
      roomMode
      compositionSource={compositionSource}
      storage={storage}
      idFactory={idFactory}
      studioPresentation={{
        home,
        view,
        escapeKeepsSelection: layoutTool === 'region',
        render: renderPresentation,
      }}
    />
  );
}
