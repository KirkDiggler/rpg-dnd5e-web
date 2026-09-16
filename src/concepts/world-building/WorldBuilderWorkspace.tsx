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

/** The two authoring modes deliberately have independent mounted instances.
 * WorldBuildingConcept only bootstraps its histories at mount; keeping both
 * alive prevents a props-first/rooms-first switch from loading the wrong
 * storage bytes or discarding an unsaved world snapshot. */
export function WorldBuilderWorkspace({
  storage,
  idFactory,
  compositionSource,
  onBack,
  onCompositionDeleted,
}: WorldBuilderWorkspaceProps) {
  const [mode, setMode] = useState<'rooms' | 'props'>('rooms');
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
          onClick={() => setMode('rooms')}
        >
          Rooms
        </button>
        <button
          type="button"
          aria-pressed={mode === 'props'}
          className={mode === 'props' ? 'wb-mode-active' : undefined}
          onClick={() => setMode('props')}
        >
          Prop compositions
        </button>
      </nav>
      <div
        className={
          mode === 'rooms' ? 'wb-mode-pane' : 'wb-mode-pane wb-mode-pane-hidden'
        }
      >
        <WorldBuildingConcept
          key="rooms"
          roomMode
          storage={storage}
          idFactory={idFactory}
          compositionSource={compositionSource}
          onBack={onBack}
          onCompositionDeleted={onCompositionDeleted}
        />
      </div>
      <div
        className={
          mode === 'props' ? 'wb-mode-pane' : 'wb-mode-pane wb-mode-pane-hidden'
        }
      >
        <WorldBuildingConcept
          key="props"
          storage={storage}
          idFactory={idFactory}
          compositionSource={compositionSource}
          onBack={onBack}
          onCompositionDeleted={onCompositionDeleted}
        />
      </div>
    </section>
  );
}
