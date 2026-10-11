import type { CompositionSource } from '@/compositions/compositionSource';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { TablesPanel } from '../world-building/TablesPanel';
import type { IdFactory, KeyValueStorage } from '../world-building/types';
import { WorldBuildingConcept } from '../world-building/WorldBuildingConcept';
import { WorldBuildingViewport } from '../world-building/WorldBuildingViewport';
import './encounterStudio.css';
import { LayoutViewport } from './LayoutViewport';
import { StudioArrangePanel } from './StudioArrangePanel';
import { StudioDimensions } from './StudioDimensions';
import { StudioDoorControls } from './StudioDoorControls';
import { StudioRegions } from './StudioRegions';
import type {
  EncounterStudioSession,
  EncounterStudioView,
  LayoutFloorTool,
  LayoutFrame,
  LayoutTool,
  StudioHome,
} from './studioSession';
import { StudioSidebar, type StudioSidebarSection } from './StudioSidebar';
import { StudioWallControls } from './StudioWallControls';
import { useStudioLabels } from './useStudioLabels';

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
  const [regionTool, setRegionTool] = useState<LayoutFloorTool>('paint');
  const selectedRegion =
    session.arrange?.kind === 'label' ? session.arrange.region : undefined;
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sections, setSections] = useState<
    Record<StudioHome, StudioSidebarSection>
  >({ build: 'arrange', regions: 'regions', encounter: 'tables' });
  const section = sections[home];
  const [visited, setVisited] = useState<ReadonlySet<string>>(
    () => new Set(['build:arrange'])
  );
  const showSection = (next: StudioSidebarSection): void => {
    setSections((current) => ({ ...current, [home]: next }));
    setVisited((current) => new Set([...current, `${home}:${next}`]));
    setSidebarOpen(true);
  };
  const changeTool = (next: LayoutTool): void => {
    if (next !== layoutTool) session.cancelTransients();
    onLayoutToolChange(next);
  };
  const defaultSection = home === 'regions' ? 'regions' : 'arrange';
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
    showSection('labels');
  };
  const changeSection = (next: StudioSidebarSection): void => {
    if (next === 'labels') labels.show();
    showSection(next);
  };
  const exitDoor = (): void => {
    session.doorEditing.setActive(false);
    onLayoutToolChange('select');
    showSection('arrange');
  };
  const exitWall = (): void => {
    changeTool('select');
    showSection('arrange');
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
    if (['doors', 'labels', 'region', 'size'].includes(section))
      setSections((current) => ({ ...current, [home]: defaultSection }));
    setRenaming(false);
    onViewChange(next);
  };
  const spatial = home !== 'encounter';
  const arrangeVisible =
    sidebarOpen &&
    ((home === 'build' && section === 'arrange' && !selectedRegion) ||
      (home === 'regions' && section === 'regions' && !!selectedRegion));

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
                        showSection('arrange');
                      }}
                    >
                      {tool[0].toUpperCase() + tool.slice(1)}
                    </button>
                  )
                )}
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
          {home === 'build' && (
            <button
              type="button"
              aria-expanded={sidebarOpen && section === 'size'}
              onClick={() => {
                if (sidebarOpen && section === 'size') setSidebarOpen(false);
                else showSection('size');
              }}
            >
              Size
            </button>
          )}
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
            <strong>Encounter configuration · Tables</strong>
          )}
          {spatial && (
            <button
              type="button"
              aria-expanded={sidebarOpen}
              aria-controls="studio-sidebar"
              aria-keyshortcuts="N"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              Options (N)
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
            sections={
              home === 'regions'
                ? [{ id: 'regions', label: 'Regions & lighting' }]
                : undefined
            }
          >
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
            <div hidden={home !== 'build' || section !== 'size'}>
              {visited.has('build:size') && (
                <div className="es-context-panel">
                  <StudioDimensions
                    session={session}
                    view={view}
                    onFrameChange={onFrameChange}
                    onDismiss={() => setSidebarOpen(false)}
                  />
                </div>
              )}
            </div>
            <StudioArrangePanel
              session={session}
              expanded={arrangeVisible}
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
            {home === 'build' && section === 'arrange' && selectedRegion && (
              <div className="es-context-panel">
                <p>
                  This selection is a region. Its boundary and lighting settings
                  live in Regions.
                </p>
                <button type="button" onClick={() => changeHome('regions')}>
                  Edit region settings
                </button>
              </div>
            )}
            <div hidden={home !== 'build' || section !== 'walls'}>
              {visited.has('build:walls') && (
                <StudioWallControls
                  session={session}
                  drawing={view === 'layout' && layoutTool === 'wall'}
                  onDismiss={() => setSidebarOpen(false)}
                  onExitWallTool={exitWall}
                  onStartDrawing={
                    view === 'layout'
                      ? () => {
                          if (session.doorEditing.active)
                            session.doorEditing.setActive(false);
                          changeTool('wall');
                        }
                      : undefined
                  }
                />
              )}
            </div>
            <div hidden={home !== 'build' || section !== 'doors'}>
              {!session.doorEditing.active && (
                <div className="es-context-panel">
                  <h2>Doors</h2>
                  <p className="es-help">
                    Place a complete door onto a wall. Select an existing door
                    to change its placement in Arrange.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (session.doorEditing.setActive(true))
                        onLayoutToolChange('door');
                    }}
                  >
                    Place door
                  </button>
                </div>
              )}
              <StudioDoorControls
                editing={session.doorEditing}
                onExit={exitDoor}
              />
            </div>
            <div hidden={!spatial || section !== 'labels'}>
              {labels.controls}
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
          {view === 'layout' ? (
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
                regionTool={regionTool}
                onExitRegionTool={exitRegion}
                onExitDoorTool={exitDoor}
                intentEpoch={session.intentEpoch}
                onExitWallTool={exitWall}
              />
            </div>
          ) : (
            <div
              className={`es-3d ${home !== 'build' ? 'es-3d-inspection' : ''}`}
            >
              <aside
                hidden={home !== 'build'}
                className="es-props es-palette wb-panel"
                aria-label="Prop palette"
              >
                {session.propControls.palette}
              </aside>
              <div className="es-canvas">
                <WorldBuildingViewport {...session.viewportProps} />
              </div>
              <aside
                hidden={home !== 'build'}
                className="es-props wb-panel"
                aria-label="Scene and selected props"
              >
                {session.propControls.tree}
              </aside>
            </div>
          )}
        </div>
        <section
          className="es-encounter-home"
          aria-label="Encounter configuration"
          hidden={home !== 'encounter'}
        >
          <h2>Tables</h2>
          <p className="es-help">
            Shared monster behavior. Define a table once; creatures and factions
            can reference it by name.
          </p>
          <TablesPanel
            key={session.document.draft.id}
            scope={session.document.scope}
            explicitRename
            onChange={(scope) => session.commitTables(scope.tables)}
          />
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
