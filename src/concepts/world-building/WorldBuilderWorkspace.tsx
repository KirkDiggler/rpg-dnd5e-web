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

/** The World Builder's destinations (rpg-dnd5e-web#1152, corrected model:
 * the site is the document, so there are only two screens). */
type Destination = 'site' | 'props';

const DESTINATIONS: { id: Destination; label: string }[] = [
  { id: 'site', label: 'Site' },
  { id: 'props', label: 'Prop compositions' },
];

/** Two editors, two destinations. `Prop compositions` is its own screen and is
 * deferred this wave; `Site` is the document screen that owns the rooms, the
 * props, the active site nouns and — behind the header's `Identity` control —
 * the identity, the local draft, the revision history and publishing. The two
 * destinations are different EDITORS, so a switch asks first:
 * WorldBuildingConcept bootstraps edition-specific state at mount, and the
 * confirm keeps world-origin work from disappearing silently.
 *
 * During a publishing Save & Play transaction the workspace blocks Back and
 * every destination change outright (plan §1): a route change mid-transaction
 * would either abandon a running launch or route this editor into the
 * encounter it is still creating. The block is a real guard on the request
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
  const [destination, setDestination] = useState<Destination>('site');
  const [pendingDestination, setPendingDestination] =
    useState<Destination | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  /** Publishing transactions lock navigation; the ref keeps the guard
   * synchronous with the child's first busy report. */
  const [publishingBusy, setPublishingBusy] = useState(false);
  const publishingBusyRef = useRef(false);
  const handlePublishBusy = useCallback((busy: boolean) => {
    publishingBusyRef.current = busy;
    setPublishingBusy(busy);
  }, []);
  const isComposer = (value: Destination) => value === 'props';
  const requestDestination = (next: Destination) => {
    if (publishingBusyRef.current) return;
    if (next === destination) return;
    setPendingDestination(next);
  };
  const confirmDestination = () => {
    if (pendingDestination) setDestination(pendingDestination);
    setPendingDestination(null);
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
  /** One instance per EDITOR, not per destination — Site keeps the live draft,
   * its undo history and its publishing transaction across internal changes. */
  const editorKey = isComposer(destination) ? 'props' : 'site';

  return (
    <section
      className="wb-workspace-route"
      aria-label="World Builder workspace"
    >
      <nav className="wb-mode-nav" aria-label="World Builder destination">
        {DESTINATIONS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={destination === entry.id}
            disabled={publishingBusy}
            title={publishingBusy ? 'Save & Play is running…' : undefined}
            className={destination === entry.id ? 'wb-mode-active' : undefined}
            onClick={() => requestDestination(entry.id)}
          >
            {entry.label}
          </button>
        ))}
        {pendingDestination && (
          <span
            className="wb-mode-confirm"
            role="group"
            aria-label="Confirm editor switch"
          >
            <span>Leave current editor?</span>
            <button type="button" onClick={confirmDestination}>
              Switch editor
            </button>
            <button type="button" onClick={() => setPendingDestination(null)}>
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
            Save &amp; Play is running — Back and switching are locked until it
            finishes.
          </span>
        )}
      </nav>
      <div className="wb-mode-pane">
        <WorldBuildingConcept
          key={editorKey}
          roomMode={!isComposer(destination)}
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
