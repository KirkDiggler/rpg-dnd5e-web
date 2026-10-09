import type { CompositionSource } from '@/compositions/compositionSource';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { IdFactory, KeyValueStorage } from '../world-building/types';
import { WorldBuildingConcept } from '../world-building/WorldBuildingConcept';
import { WorldBuildingViewport } from '../world-building/WorldBuildingViewport';
import './encounterStudio.css';
import { LayoutViewport } from './LayoutViewport';
import { StudioArrangePanel } from './StudioArrangePanel';
import { StudioDimensions } from './StudioDimensions';
import { StudioDoorControls } from './StudioDoorControls';
import type {
  EncounterStudioSession,
  EncounterStudioView,
  LayoutFrame,
  LayoutTool,
} from './studioSession';
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
  view: EncounterStudioView;
  layoutTool: LayoutTool;
  frame: LayoutFrame;
  onViewChange(next: EncounterStudioView): void;
  onLayoutToolChange(next: LayoutTool): void;
  onFrameChange(next: LayoutFrame): void;
  onThumbnailDemandChange(visible: boolean): void;
  onBack?: () => void;
}

// Keep the component type stable: owner projection/callback rerenders must not
// remount the surface or reset renderer-local and reused prop controls.
function StudioSurface({
  session,
  view,
  layoutTool,
  frame,
  onViewChange,
  onLayoutToolChange,
  onFrameChange,
  onThumbnailDemandChange,
  onBack,
}: StudioSurfaceProps): React.JSX.Element {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [sizeVisible, setSizeVisible] = useState(false);
  const [wallVisible, setWallVisible] = useState(false);
  const changeTool = (next: LayoutTool): void => {
    if (next !== layoutTool) session.cancelTransients();
    onLayoutToolChange(next);
  };
  const labels = useStudioLabels(
    session,
    view,
    layoutTool === 'label',
    () => changeTool('label'),
    () => changeTool('select')
  );
  const [arrangeVisible, setArrangeVisible] = useState(
    session.arrange !== null
  );
  const [appearanceDemand, setAppearanceDemand] = useState(false);
  const seenSelection = useRef(session.arrange?.selectionRevision);
  useEffect(() => {
    const revision = session.arrange?.selectionRevision;
    if (revision !== undefined && revision !== seenSelection.current)
      setArrangeVisible(true);
    seenSelection.current = revision;
  }, [session.arrange?.selectionRevision]);
  useEffect(() => {
    onThumbnailDemandChange(
      (view === 'layout' && wallVisible && layoutTool === 'wall') ||
        appearanceDemand
    );
    return () => onThumbnailDemandChange(false);
  }, [
    view,
    wallVisible,
    layoutTool,
    appearanceDemand,
    onThumbnailDemandChange,
  ]);
  const exitDoor = (): void => {
    session.doorEditing.setActive(false);
    onLayoutToolChange('select');
  };
  const exitWall = (): void => {
    changeTool('select');
    setWallVisible(false);
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
    if (layoutTool === 'door') onLayoutToolChange('select');
    session.cancelTransients();
    setSizeVisible(false);
    setWallVisible(false);
    setRenaming(false);
    onViewChange(next);
  };

  return (
    <section
      className="encounter-studio"
      aria-label="Encounter Studio workspace"
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
        <nav className="es-buttons" aria-label="Studio view">
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
          {view === 'layout' ? (
            <div className="es-buttons" role="group" aria-label="Layout tools">
              {(
                [
                  'select',
                  'paint',
                  'erase',
                  'rectangle',
                  'wall',
                  'door',
                  'label',
                ] as const
              ).map((tool) => (
                <button
                  key={tool}
                  type="button"
                  aria-pressed={layoutTool === tool}
                  onClick={() => {
                    if (tool === 'door') {
                      if (session.doorEditing.setActive(true))
                        onLayoutToolChange('door');
                      setWallVisible(false);
                      labels.deactivate();
                      setSizeVisible(false);
                      return;
                    }
                    if (session.doorEditing.active)
                      session.doorEditing.setActive(false);
                    changeTool(tool);
                    setSizeVisible(false);
                    if (tool === 'label') labels.activate();
                    else labels.deactivate();
                    setWallVisible(tool === 'wall');
                  }}
                >
                  {tool[0].toUpperCase() + tool.slice(1)}
                </button>
              ))}
            </div>
          ) : (
            <div className="es-buttons" role="group" aria-label="Prop tools">
              {(['select', 'move', 'rotate'] as const).map((tool) => (
                <button
                  key={tool}
                  type="button"
                  aria-pressed={
                    session.viewportProps.roomAuthoring?.tool === tool
                  }
                  onClick={() => session.setPropTool(tool)}
                >
                  {tool[0].toUpperCase() + tool.slice(1)}
                </button>
              ))}
            </div>
          )}
          {view === '3d' && (
            <button
              type="button"
              aria-pressed={session.doorEditing.active}
              onClick={() => session.doorEditing.setActive(true)}
            >
              Door
            </button>
          )}
          <button
            type="button"
            aria-expanded={sizeVisible}
            onClick={() => {
              if (!sizeVisible) session.cancelTransients();
              setSizeVisible(!sizeVisible);
            }}
          >
            Size
          </button>
          <button
            type="button"
            aria-expanded={arrangeVisible}
            aria-controls="studio-arrange-panel"
            onClick={() => setArrangeVisible(!arrangeVisible)}
          >
            Arrange
          </button>
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
          {view === '3d' && (
            <p className="es-help">
              {session.viewportProps.roomAuthoring?.tool === 'repeat'
                ? 'Repeat active · Drag on floor to repeat pieces · Esc / right-click cancels'
                : 'Drag assets onto ground or tabletop · Middle drag orbits · Shift-middle pans · Wheel zooms'}
            </p>
          )}
        </div>
        <div className="es-context-layer">
          {sizeVisible && (
            <div className="es-context-panel">
              <StudioDimensions
                session={session}
                view={view}
                onFrameChange={onFrameChange}
                onDismiss={() => setSizeVisible(false)}
              />
            </div>
          )}
          <StudioArrangePanel
            session={session}
            expanded={arrangeVisible && !session.doorEditing.active}
            onAppearanceDemandChange={setAppearanceDemand}
          />
          <StudioDoorControls editing={session.doorEditing} onExit={exitDoor} />
          {labels.controls}
          {view === 'layout' && wallVisible && layoutTool === 'wall' && (
            <StudioWallControls
              session={session}
              drawing={layoutTool === 'wall'}
              onDismiss={() => setWallVisible(false)}
              onExitWallTool={exitWall}
            />
          )}
        </div>
      </div>
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
            wallEditing={session.wallEditing}
            doorEditing={session.doorEditing}
            onExitDoorTool={exitDoor}
            intentEpoch={session.intentEpoch}
            onExitWallTool={exitWall}
          />
        </div>
      ) : (
        <div className="es-3d">
          <aside
            className="es-props es-palette wb-panel"
            aria-label="Prop palette"
          >
            {session.propControls.palette}
          </aside>
          <div className="es-canvas">
            <WorldBuildingViewport {...session.viewportProps} />
          </div>
          <aside
            className="es-props wb-panel"
            aria-label="Scene and selected props"
          >
            {session.propControls.tree}
          </aside>
        </div>
      )}
    </section>
  );
}

/** View/tool/frame are presentation state. Exactly one room-mode Concept owns
 * the document, selection, history and local persistence across both renderers. */
export function EncounterStudioWorkspace({
  compositionSource,
  storage,
  idFactory,
  onBack,
}: EncounterStudioWorkspaceProps): React.JSX.Element {
  const [view, setView] = useState<EncounterStudioView>('layout');
  const [layoutTool, setLayoutTool] = useState<LayoutTool>('paint');
  const [thumbnailDemand, setThumbnailDemand] = useState(false);
  const [frame, setFrame] = useState<LayoutFrame>({
    center: { x: 0, z: 0 },
    zoom: 1,
  });
  const renderPresentation = useCallback(
    (session: EncounterStudioSession): ReactNode => (
      <StudioSurface
        session={session}
        view={view}
        layoutTool={layoutTool}
        frame={frame}
        onViewChange={setView}
        onLayoutToolChange={setLayoutTool}
        onFrameChange={setFrame}
        onThumbnailDemandChange={setThumbnailDemand}
        onBack={onBack}
      />
    ),
    [view, layoutTool, frame, onBack]
  );

  return (
    <WorldBuildingConcept
      roomMode
      compositionSource={compositionSource}
      storage={storage}
      idFactory={idFactory}
      studioPresentation={{ view, thumbnailDemand, render: renderPresentation }}
    />
  );
}
