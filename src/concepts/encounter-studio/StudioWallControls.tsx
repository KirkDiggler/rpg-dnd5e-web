import type { EncounterStudioSession } from './studioSession';
import { StudioWallAppearanceChoices } from './StudioWallAppearanceChoices';

/** Drawing palette only. Selected precision belongs exclusively to Arrange. */
export function StudioWallControls({
  session,
  onDismiss,
  onExitWallTool,
  onStartDrawing,
  drawing,
}: {
  session: Pick<EncounterStudioSession, 'document' | 'wallEditing'>;
  drawing: boolean;
  onDismiss(): void;
  onExitWallTool(): void;
  onStartDrawing?(): void;
}): React.JSX.Element {
  const editing = session.wallEditing;
  return (
    <section
      className="es-context-panel es-wall-controls"
      aria-label="New wall palette"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onExitWallTool();
        }
      }}
    >
      <div className="es-buttons">
        <strong>New wall appearance</strong>
        <button type="button" onClick={onDismiss}>
          Dismiss wall controls
        </button>
      </div>
      <p className="es-help">
        {drawing
          ? 'Choose an appearance, then drag on the map. Keep drawing successive walls · Escape exits Wall.'
          : 'Choose an appearance here. Draw walls in Layout; edit a selected wall in Arrange.'}
      </p>
      {onStartDrawing && (
        <button type="button" aria-pressed={drawing} onClick={onStartDrawing}>
          Draw walls
        </button>
      )}
      <label className="es-snap">
        <input
          type="checkbox"
          aria-label="Snap to hex centres, corners and side midpoints"
          checked={editing.snapEnabled}
          onChange={(event) => editing.setSnap(event.target.checked)}
        />
        Snap to hex centres, corners and side midpoints
      </label>
      <StudioWallAppearanceChoices
        options={editing.options}
        assetRef={editing.assetRef}
        onChoose={editing.setAsset}
      />
    </section>
  );
}
