import type { StudioWallEditing } from './studioSession';

/** The same owner settings in creation and selected-wall controls. */
export function StudioWallConstraints({
  editing,
}: {
  editing: StudioWallEditing;
}): React.JSX.Element {
  return (
    <div className="es-wall-constraints">
      <label>
        <input
          type="checkbox"
          aria-label="Snap to wall endpoints"
          checked={editing.endpointSnapEnabled}
          onChange={(event) => editing.setEndpointSnap(event.target.checked)}
        />
        Snap to wall endpoints
      </label>
      <label>
        <input
          type="checkbox"
          aria-label="Right angles"
          checked={editing.rightAngleEnabled}
          onChange={(event) => editing.setRightAngle(event.target.checked)}
        />
        Right angles
      </label>
      {editing.rightAngleEnabled && (
        <p className="es-help">
          Drawing and endpoint drags follow the joined wall; free starts use
          world X/Z. Numeric entries stay explicit.
        </p>
      )}
    </div>
  );
}
