import type { CompositionSource } from '@/compositions/compositionSource';
import { useCallback, useRef, useState } from 'react';
import type { IdFactory, KeyValueStorage } from './types';
import type { RoomPublishingCapability } from './useRoomPublishing';
import {
  WorldBuildingConcept,
  type WorldBuilderSurface,
} from './WorldBuildingConcept';

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

/** The World Builder's destinations, in the design's order
 * (`ideas/site-authoring/design.md` §UI surfaces). */
type Destination = 'rooms' | 'props' | 'site' | 'library';

const DESTINATIONS: { id: Destination; label: string }[] = [
  { id: 'rooms', label: 'Rooms' },
  { id: 'props', label: 'Prop compositions' },
  { id: 'site', label: 'The site' },
  { id: 'library', label: 'Library' },
];

/** Two editors, four destinations. `Prop compositions` is its own screen; the
 * other three are surfaces of ONE rooms-editor instance, keyed `rooms`, so an
 * author can go to the Library and come back without leaving the draft and its
 * undo history behind. A switch between the two EDITORS still asks first,
 * because that one really is a leave: WorldBuildingConcept bootstraps
 * edition-specific state at mount, and the confirm keeps world-origin work
 * from disappearing silently.
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
  const [destination, setDestination] = useState<Destination>('rooms');
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
    if (isComposer(next) === isComposer(destination)) {
      // Same editor: a surface hop, not a leave. No confirm.
      setDestination(next);
      return;
    }
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
  /** One instance per EDITOR, not per destination — the point of the split. */
  const editorKey = isComposer(destination) ? 'props' : 'rooms';
  const surface: WorldBuilderSurface = isComposer(destination)
    ? 'build'
    : destination === 'rooms'
      ? 'build'
      : destination;

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
          surface={surface}
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
