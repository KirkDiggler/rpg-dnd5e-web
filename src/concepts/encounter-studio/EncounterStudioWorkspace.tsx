import type { CompositionSource } from '@/compositions/compositionSource';
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { documentPlacementNames } from '../world-building/placementNames';
import { TablesPanel } from '../world-building/TablesPanel';
import type { IdFactory, KeyValueStorage } from '../world-building/types';
import { WorldBuildingConcept } from '../world-building/WorldBuildingConcept';
import { WorldBuildingViewport } from '../world-building/WorldBuildingViewport';
import './encounterStudio.css';
import { AboutPanel } from './FieldHelp';
import { LayoutViewport } from './LayoutViewport';
import { StudioArrangePanel } from './StudioArrangePanel';
import { StudioCast } from './StudioCast';
import { StudioCreaturePalette } from './StudioCreaturePalette';
import { StudioDoorControls } from './StudioDoorControls';
import { StudioInspector } from './StudioInspector';
import { StudioRegions } from './StudioRegions';
import {
  studioInspectionOf,
  type EncounterStudioSession,
  type EncounterStudioView,
  type LayoutFloorTool,
  type LayoutFrame,
  type LayoutTool,
  type StudioHome,
  type StudioSocialSection,
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
  >({ build: 'inspector', regions: 'regions', encounter: 'tables' });
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
  const defaultSection = home === 'regions' ? 'regions' : 'inspector';
  const labels = useStudioLabels(
    session,
    view,
    layoutTool === 'label',
    () => changeTool('label'),
    () => {
      changeTool('select');
      showSection(defaultSection);
    },
    home === 'regions' ? 'room' : 'note'
  );
  const startLabel = (): void => {
    if (session.doorEditing.active) session.doorEditing.setActive(false);
    changeTool('label');
    labels.activate();
    if (home === 'regions') showSection('labels');
    else setSidebarOpen(true);
  };
  /** Wall, Door and Note are Layout tools; their options show at the top of
   * the inspector while armed. */
  const armTool = (next: 'wall' | 'door' | 'label'): void => {
    if (next === 'label') {
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
  const changeSection = (next: StudioSidebarSection): void => {
    if (next === 'labels') labels.show();
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
    showSection('regions');
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
    if (home === 'regions' && ['labels', 'region'].includes(section))
      setSections((current) => ({ ...current, [home]: defaultSection }));
    setRenaming(false);
    onViewChange(next);
  };
  const spatial = home !== 'encounter';
  // Once per studio session: the first visit to 3D mounts the viewport.
  const [visited3d, setVisited3d] = useState(view === '3d');
  useEffect(() => {
    if (view === '3d') setVisited3d(true);
  }, [view]);
  const arrangeVisible =
    sidebarOpen &&
    home === 'regions' &&
    section === 'regions' &&
    !!selectedRegion;
  const inspection = studioInspectionOf(
    session.arrange,
    session.document.draft.scene
  );
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
          {(['build', 'regions', 'encounter'] as const).map((value) => (
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
        </div>
      </header>
      {session.autosaveBlocked && (
        <p className="es-warning" role="alert">
          Autosave is paused. The displayed draft is in memory. “Replace
          unreadable local draft” overwrites the unreadable stored data with
          this draft.
        </p>
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
          {home === 'regions' && (
            <>
              <button
                type="button"
                aria-pressed={layoutTool === 'select'}
                onClick={exitRegion}
              >
                Select
              </button>
              <p className="es-help">
                Rooms, outdoor areas, boundaries and background light
              </p>
            </>
          )}
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
              {home === 'build' ? 'Inspector (N)' : 'Options (N)'}
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
            sections={
              home === 'regions'
                ? [{ id: 'regions', label: 'Regions & lighting' }]
                : undefined
            }
          >
            {home === 'build' && (
              <StudioInspector
                session={session}
                inspection={inspection}
                view={view}
                layoutTool={layoutTool}
                armedTool={armedTool}
                onConfigure={openDefinitions}
                onMoveCreature={moveSelectedCreature}
                onFrameChange={onFrameChange}
                onArmTool={armTool}
                onPlacePartyStart={placePartyStart}
                onOpenCastMember={(ref) => session.cast.select(ref)}
                onOpenRegion={(labelId) => {
                  session.mapLabelSelection.select(labelId);
                  changeHome('regions');
                }}
              />
            )}
            <div hidden={home !== 'regions' || section !== 'regions'}>
              <StudioRegions
                session={session}
                onSelect={(id) => {
                  session.mapLabelSelection.select(id);
                  showSection('regions');
                }}
                onCreate={startLabel}
                canCreate={view === 'layout'}
              />
            </div>
            {home === 'regions' && (
              <StudioArrangePanel
                session={session}
                expanded={arrangeVisible}
                onConfigure={openDefinitions}
                onMoveCreature={moveSelectedCreature}
                onDefineRegion={
                  home === 'regions' && view === 'layout'
                    ? () => {
                        labels.editing.onCancel();
                        changeTool('region');
                        setRegionTool('paint');
                        showSection('region');
                      }
                    : undefined
                }
              />
            )}
            <div hidden={home !== 'regions' || section !== 'labels'}>
              {home === 'regions' && labels.controls}
              {view !== 'layout' && (
                <p className="es-context-panel">
                  Switch to Layout to add notes.
                </p>
              )}
            </div>
            <div hidden={home !== 'regions' || section !== 'region'}>
              {view === 'layout' &&
                layoutTool === 'region' &&
                selectedRegion && (
                  <div
                    className="es-context-panel es-region-controls"
                    aria-label="Explicit region area controls"
                  >
                    <h2>
                      Explicit area ·{' '}
                      {session.arrange?.kind === 'label'
                        ? session.arrange.label.text
                        : ''}
                    </h2>
                    <p className="es-help">
                      Only region membership changes. Floor, walls and props
                      stay untouched. Drag, then release to apply once. Escape
                      cancels.
                    </p>
                    <div className="es-buttons">
                      {(['paint', 'erase', 'rectangle'] as const).map(
                        (mode) => (
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
                        )
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          session.regionEditing.setExplicitRegionArea(
                            selectedRegion.id,
                            []
                          )
                        }
                      >
                        Clear explicit area
                      </button>
                      <button type="button" onClick={exitRegion}>
                        Done area editing
                      </button>
                    </div>
                  </div>
                )}
            </div>
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
            <div className="es-canvas">
              <LayoutViewport
                draft={session.document.draft}
                tool={layoutTool}
                frame={frame}
                onFrameChange={onFrameChange}
                onCommit={session.commitFloor}
                labelEditing={labels.editing}
                documentContext={session.document}
                wallEditing={home === 'build' ? session.wallEditing : undefined}
                doorEditing={home === 'build' ? session.doorEditing : undefined}
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
                onSelectHex={
                  home === 'build'
                    ? (cell) => void session.selectHex(cell)
                    : undefined
                }
                onClearSelection={
                  home === 'build'
                    ? () => void session.clearSelection()
                    : undefined
                }
              />
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
              ['cast', 'tables', 'factions', 'dispositions', 'intel'] as const
            ).map((section) => (
              <button
                key={section}
                type="button"
                aria-pressed={encounterSection === section}
                onClick={() => setEncounterSection(section)}
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
              placementNames={documentPlacementNames(session.document)}
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
      studioPresentation={{ home, view, render: renderPresentation }}
    />
  );
}
