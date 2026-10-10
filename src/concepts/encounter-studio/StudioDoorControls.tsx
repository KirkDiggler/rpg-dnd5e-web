import type { StudioDoorEditing } from './studioSession';

/** Complete assemblies only; asset choice is separate from transient placement. */
export function StudioDoorControls({
  editing,
  onExit,
}: {
  editing: StudioDoorEditing;
  onExit(): void;
}): React.JSX.Element | null {
  if (!editing.active && (!editing.preview || editing.preview.valid))
    return null;
  return (
    <section
      className="es-context-panel es-arrange"
      aria-label="Door placement controls"
    >
      {editing.active && (
        <>
          <h2>Place door</h2>
          <label>
            Complete door appearance
            <select
              aria-label="Complete door appearance"
              value={editing.assetRef ?? ''}
              onChange={(event) => editing.setAsset(event.target.value || null)}
            >
              <option value="">Choose complete assembly</option>
              {editing.options.map((option) => (
                <option key={option.ref} value={option.ref}>
                  {option.label} · width {Number(option.width.toFixed(6))}
                </option>
              ))}
            </select>
          </label>
          <p className="es-help">
            Point at a wall to preview; click once to place a closed door.
            Escape cancels. Width fits the complete assembly, not a separate
            leaf.
          </p>
          <button type="button" onClick={onExit}>
            Cancel door placement
          </button>
        </>
      )}
      {editing.preview &&
        (editing.preview.valid ? (
          <p role="status">
            {editing.preview.clamped ? 'Clamped to wall end' : 'Preview'} ·{' '}
            {editing.preview.purpose === 'placement'
              ? 'Closed complete door'
              : 'Along-wall move'}
          </p>
        ) : (
          <p role="alert">{editing.preview.message}</p>
        ))}
    </section>
  );
}
