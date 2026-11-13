import type { StudioDoorEditing } from './studioSession';

/** Asset choice and repeat snapping remain transient placement preferences. */
export function StudioDoorControls({
  editing,
  onExit,
}: {
  editing: StudioDoorEditing;
  onExit(): void;
}): React.JSX.Element | null {
  if (
    !editing.active &&
    !editing.selectedTarget &&
    (!editing.preview || editing.preview.valid)
  )
    return null;
  return (
    <section
      className="es-context-panel es-arrange"
      aria-label="Door placement controls"
    >
      <h2>{editing.active ? 'Place door' : 'Door positioning'}</h2>
      {editing.repeatSnap && (
        <label>
          <input
            type="checkbox"
            checked={editing.repeatSnap.enabled}
            onChange={(event) =>
              editing.repeatSnap!.setEnabled(event.target.checked)
            }
          />
          Snap frame start to texture repeats
        </label>
      )}
      {editing.active && (
        <>
          <label>
            Door appearance
            <select
              aria-label="Door appearance"
              value={editing.assetRef ?? ''}
              onChange={(event) => editing.setAsset(event.target.value || null)}
            >
              <option value="">Choose doorway</option>
              {editing.options.map((option) => (
                <option key={option.ref} value={option.ref}>
                  {option.label} · width {Number(option.width.toFixed(6))}
                </option>
              ))}
            </select>
          </label>
          <p className="es-help">
            Point at a wall to preview; click once to place a closed door.
            Escape cancels. Free placement is the default. Blue guides use face
            A’s finish (or B when A is unset). Aperture-fit doorways replace
            their full surround span without enlarging the gameplay opening.
          </p>
          <button type="button" onClick={onExit}>
            Cancel door placement
          </button>
        </>
      )}
      {editing.preview &&
        (editing.preview.valid ? (
          <p role="status">
            {editing.preview.snapped
              ? 'Snapped frame start'
              : editing.preview.clamped
                ? 'Clamped to wall end'
                : 'Free preview'}{' '}
            ·{' '}
            {editing.preview.purpose === 'placement'
              ? 'Closed door'
              : 'Along-wall move'}
          </p>
        ) : (
          <p role="alert">{editing.preview.message}</p>
        ))}
    </section>
  );
}
