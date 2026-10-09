import type { EncounterStudioSession } from './studioSession';
import { StudioWallAppearanceChoices } from './StudioWallAppearanceChoices';

/** Drawing palette only. Selected precision belongs exclusively to Arrange. */
export function StudioWallControls({
  session,
  onDismiss,
  onExitWallTool,
}: {
  session: Pick<EncounterStudioSession, 'document' | 'wallEditing'>;
  drawing: boolean;
  onDismiss(): void;
  onExitWallTool(): void;
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
        Choose an appearance, then drag on the map. Keep drawing successive
        walls · Escape exits Wall.
      </p>
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
