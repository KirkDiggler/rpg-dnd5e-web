import type { StudioWallEditing } from './studioSession';

/** The same owner settings in creation and selected-wall controls. */
export function StudioWallConstraints({
  editing,
}: {
  editing: StudioWallEditing;
}): React.JSX.Element {
  return (
    <div
      className="es-wall-constraints"
      title="Endpoint snaps join exact points. Nearby perpendicular corners can trim or extend both ends in one Undo."
    >
      <label>
        <input
          type="checkbox"
          aria-label="Snap corners"
          checked={editing.endpointSnapEnabled}
          onChange={(event) => editing.setEndpointSnap(event.target.checked)}
        />
        Snap corners
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
