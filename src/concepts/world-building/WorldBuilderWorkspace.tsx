import type { CompositionSource } from '@/compositions/compositionSource';
import { useState } from 'react';
import type { IdFactory, KeyValueStorage } from './types';
import { WorldBuildingConcept } from './WorldBuildingConcept';

interface WorldBuilderWorkspaceProps {
  storage?: KeyValueStorage;
  idFactory?: IdFactory;
  compositionSource: CompositionSource;
  onBack?: () => void;
  onCompositionDeleted?: () => void;
}

/** Only one editor is live at a time. WorldBuildingConcept bootstraps
 * mode-specific state at mount, so a mode key gives each entry a clean,
 * correctly fenced history without leaving keyboard handlers or autosaves
 * from an inactive editor alive. Switching is deliberately explicit: this
 * first pass treats it as a leave, so world-origin work cannot disappear
 * silently. Local drafts are already persisted by the editor's normal saves. */
export function WorldBuilderWorkspace({
  storage,
  idFactory,
  compositionSource,
  onBack,
  onCompositionDeleted,
}: WorldBuilderWorkspaceProps) {
  const [mode, setMode] = useState<'rooms' | 'props'>('rooms');
  const [pendingMode, setPendingMode] = useState<'rooms' | 'props' | null>(
    null
  );
  const [confirmLeave, setConfirmLeave] = useState(false);
  const requestMode = (next: 'rooms' | 'props') => {
    if (next !== mode) setPendingMode(next);
  };
  const confirmMode = () => {
    if (pendingMode) setMode(pendingMode);
    setPendingMode(null);
  };
  const requestLeave = () => setConfirmLeave(true);
  const leaveWorkspace = () => {
    setConfirmLeave(false);
    onBack?.();
  };

  return (
    <section
      className="wb-workspace-route"
      aria-label="World Builder workspace"
    >
      <nav className="wb-mode-nav" aria-label="World Builder mode">
        <button
          type="button"
          aria-pressed={mode === 'rooms'}
          className={mode === 'rooms' ? 'wb-mode-active' : undefined}
          onClick={() => requestMode('rooms')}
        >
          Rooms
        </button>
        <button
          type="button"
          aria-pressed={mode === 'props'}
          className={mode === 'props' ? 'wb-mode-active' : undefined}
          onClick={() => requestMode('props')}
        >
          Prop compositions
        </button>
        {pendingMode && (
          <span
            className="wb-mode-confirm"
            role="group"
            aria-label="Confirm editor switch"
          >
            <span>Leave current editor?</span>
            <button type="button" onClick={confirmMode}>
              Switch editor
            </button>
            <button type="button" onClick={() => setPendingMode(null)}>
              Cancel switch
            </button>
          </span>
        )}
        {confirmLeave && (
          <span
            className="wb-mode-confirm"
            role="alertdialog"
            aria-label="Confirm leaving World Builder"
          >
            <span>
              Save or export your unsaved work before discarding it. Leave the
              World Builder?
            </span>
            <button type="button" onClick={leaveWorkspace}>
              Discard and leave
            </button>
            <button type="button" onClick={() => setConfirmLeave(false)}>
              Cancel
            </button>
          </span>
        )}
      </nav>
      <div className="wb-mode-pane">
        <WorldBuildingConcept
          key={mode}
          roomMode={mode === 'rooms'}
          storage={storage}
          idFactory={idFactory}
          compositionSource={compositionSource}
          onBack={onBack ? requestLeave : undefined}
          onCompositionDeleted={onCompositionDeleted}
        />
      </div>
    </section>
  );
}
