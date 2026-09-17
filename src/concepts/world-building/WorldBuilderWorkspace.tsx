import type { CompositionSource } from '@/compositions/compositionSource';
import { useCallback, useRef, useState } from 'react';
import type { IdFactory, KeyValueStorage } from './types';
import type { RoomPublishingCapability } from './useRoomPublishing';
import { WorldBuildingConcept } from './WorldBuildingConcept';

interface WorldBuilderWorkspaceProps {
  storage?: KeyValueStorage;
  idFactory?: IdFactory;
  compositionSource: CompositionSource;
  onBack?: () => void;
  onCompositionDeleted?: () => void;
  /** The character selected on Home — the SAME identity the legacy
   * AuthorView receives from App. Publish & Play seats it in the lobby. */
  characterId?: string | null;
  /** The existing App.handlePlayAuthored route callback: after a real
   * server save and the SDK lobby sequence, App routes to the game. */
  onPlay?: (encounterId: string, characterId: string) => void;
}

/** Only one editor is live at a time. WorldBuildingConcept bootstraps
 * mode-specific state at mount, so a mode key gives each entry a clean,
 * correctly fenced history without leaving keyboard handlers or autosaves
 * from an inactive editor alive. Switching is deliberately explicit: this
 * first pass treats it as a leave, so world-origin work cannot disappear
 * silently. Local drafts are already persisted by the editor's normal saves.
 *
 * During a publishing Save & Play transaction the workspace blocks Back
 * and mode switching outright (plan §1): a route change mid-transaction
 * would either abandon a running launch or route this editor into the
 * encounter it is still creating. The existing leave confirmation is
 * untouched while idle — the block is a real guard on the request
 * handlers, not just disabled buttons. */
export function WorldBuilderWorkspace({
  storage,
  idFactory,
  compositionSource,
  onBack,
  onCompositionDeleted,
  characterId,
  onPlay,
}: WorldBuilderWorkspaceProps) {
  const [mode, setMode] = useState<'rooms' | 'props'>('rooms');
  const [pendingMode, setPendingMode] = useState<'rooms' | 'props' | null>(
    null
  );
  const [confirmLeave, setConfirmLeave] = useState(false);
  /** Publishing transactions lock navigation; the ref keeps the guard
   * synchronous with the child's first busy report. */
  const [publishingBusy, setPublishingBusy] = useState(false);
  const publishingBusyRef = useRef(false);
  const handlePublishBusy = useCallback((busy: boolean) => {
    publishingBusyRef.current = busy;
    setPublishingBusy(busy);
  }, []);
  const requestMode = (next: 'rooms' | 'props') => {
    if (publishingBusyRef.current) return;
    if (next !== mode) setPendingMode(next);
  };
  const confirmMode = () => {
    if (pendingMode) setMode(pendingMode);
    setPendingMode(null);
  };
  const requestLeave = () => {
    if (publishingBusyRef.current) return;
    setConfirmLeave(true);
  };
  const leaveWorkspace = () => {
    setConfirmLeave(false);
    onBack?.();
  };
  /** The capability is only present when the route injected a play
   * callback; ConceptsView's local-only mounts never pass one. */
  const capability: RoomPublishingCapability | undefined = onPlay
    ? { characterId: characterId ?? null, onPlay }
    : undefined;

  return (
    <section
      className="wb-workspace-route"
      aria-label="World Builder workspace"
    >
      <nav className="wb-mode-nav" aria-label="World Builder mode">
        <button
          type="button"
          aria-pressed={mode === 'rooms'}
          disabled={publishingBusy}
          title={publishingBusy ? 'Save & Play is running…' : undefined}
          className={mode === 'rooms' ? 'wb-mode-active' : undefined}
          onClick={() => requestMode('rooms')}
        >
          Rooms
        </button>
        <button
          type="button"
          aria-pressed={mode === 'props'}
          disabled={publishingBusy}
          title={publishingBusy ? 'Save & Play is running…' : undefined}
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
              Leave the World Builder? Saved rooms and autosaved local drafts
              are kept, but any change not saved or exported may be lost.
            </span>
            <button type="button" onClick={leaveWorkspace}>
              Leave World Builder
            </button>
            <button type="button" onClick={() => setConfirmLeave(false)}>
              Cancel
            </button>
          </span>
        )}
        {publishingBusy && (
          <span className="wb-mode-confirm" role="status">
            Save &amp; Play is running — Back and editor switching are locked
            until it finishes.
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
          roomPublishing={capability}
          onPublishBusyChange={handlePublishBusy}
        />
      </div>
    </section>
  );
}
