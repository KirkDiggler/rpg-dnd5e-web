import type { CompositionSource } from '@/compositions/compositionSource';
import { useCallback, useState, type ReactNode } from 'react';
import type { IdFactory, KeyValueStorage } from '../world-building/types';
import { WorldBuildingConcept } from '../world-building/WorldBuildingConcept';
import { WorldBuildingViewport } from '../world-building/WorldBuildingViewport';
import './encounterStudio.css';
import { LayoutViewport } from './LayoutViewport';
import type {
  EncounterStudioSession,
  EncounterStudioView,
  LayoutFloorTool,
  LayoutFrame,
} from './studioSession';

interface EncounterStudioWorkspaceProps {
  compositionSource: CompositionSource;
  storage?: KeyValueStorage;
  idFactory?: IdFactory;
  onBack?: () => void;
}

interface StudioSurfaceProps {
  session: EncounterStudioSession;
  view: EncounterStudioView;
  floorTool: LayoutFloorTool;
  frame: LayoutFrame;
  onViewChange(next: EncounterStudioView): void;
  onFloorToolChange(next: LayoutFloorTool): void;
  onFrameChange(next: LayoutFrame): void;
  onBack?: () => void;
}

// Keep the component type stable: owner projection/callback rerenders must not
// remount the surface or reset renderer-local and reused prop controls.
function StudioSurface({
  session,
  view,
  floorTool,
  frame,
  onViewChange,
  onFloorToolChange,
  onFrameChange,
  onBack,
}: StudioSurfaceProps): React.JSX.Element {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const switchView = (next: EncounterStudioView): void => {
    if (next === view) return;
    session.cancelTransients();
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
          <p>{session.document.draft.name}</p>
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
        <div className="es-buttons" role="group" aria-label="Document history">
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
      <div className="es-toolbar">
        {view === 'layout' ? (
          <div className="es-buttons" role="group" aria-label="Floor tools">
            {(['paint', 'erase', 'rectangle'] as const).map((tool) => (
              <button
                key={tool}
                type="button"
                aria-pressed={floorTool === tool}
                onClick={() => onFloorToolChange(tool)}
              >
                {tool === 'paint'
                  ? 'Paint'
                  : tool === 'erase'
                    ? 'Erase'
                    : 'Rectangle'}
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
                {tool === 'select'
                  ? 'Select'
                  : tool === 'move'
                    ? 'Move'
                    : 'Rotate'}
              </button>
            ))}
          </div>
        )}
        <p className="es-help">
          {view === 'layout'
            ? 'Drag to edit floor · Middle drag to pan · Wheel to zoom · Esc cancels'
            : session.viewportProps.roomAuthoring?.tool === 'repeat'
              ? 'Repeat active · Drag on floor to repeat pieces · Esc / right-click cancels'
              : 'Drag assets onto ground or tabletop · Middle drag orbits · Shift-middle pans · Wheel zooms'}
        </p>
      </div>
      {view === 'layout' ? (
        <div className="es-canvas">
          <LayoutViewport
            draft={session.document.draft}
            tool={floorTool}
            frame={frame}
            onFrameChange={onFrameChange}
            onCommit={session.commitFloor}
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
            {session.propControls.selection}
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
  const [floorTool, setFloorTool] = useState<LayoutFloorTool>('paint');
  const [frame, setFrame] = useState<LayoutFrame>({
    center: { x: 0, z: 0 },
    zoom: 1,
  });
  const renderPresentation = useCallback(
    (session: EncounterStudioSession): ReactNode => (
      <StudioSurface
        session={session}
        view={view}
        floorTool={floorTool}
        frame={frame}
        onViewChange={setView}
        onFloorToolChange={setFloorTool}
        onFrameChange={setFrame}
        onBack={onBack}
      />
    ),
    [view, floorTool, frame, onBack]
  );

  return (
    <WorldBuildingConcept
      roomMode
      compositionSource={compositionSource}
      storage={storage}
      idFactory={idFactory}
      studioPresentation={{ view, render: renderPresentation }}
    />
  );
}
