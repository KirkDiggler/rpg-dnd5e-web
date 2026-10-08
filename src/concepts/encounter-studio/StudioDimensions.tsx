import { useEffect, useState } from 'react';
import type {
  EncounterStudioSession,
  EncounterStudioView,
  LayoutFrame,
} from './studioSession';

export function StudioDimensions({
  session,
  onFrameChange,
  view,
}: {
  session: EncounterStudioSession;
  view: EncounterStudioView;
  onFrameChange(frame: LayoutFrame): void;
}): React.JSX.Element {
  const workspace = session.document.draft.workspace;
  const width =
    workspace.kind === 'centered-odd-r' ? String(workspace.widthHexes) : '';
  const height =
    workspace.kind === 'centered-odd-r' ? String(workspace.heightHexes) : '';
  const [widthDraft, setWidthDraft] = useState(width);
  const [heightDraft, setHeightDraft] = useState(height);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setWidthDraft(width);
    setHeightDraft(height);
    setError(null);
  }, [width, height, session.document.draft.id, view]);
  const cancel = (): void => {
    setWidthDraft(width);
    setHeightDraft(height);
    setError(null);
  };
  return (
    <form
      className="es-dimensions es-buttons"
      aria-label="Workspace dimensions"
      onSubmit={(event): void => {
        event.preventDefault();
        const w = Number(widthDraft);
        const h = Number(heightDraft);
        if (
          !Number.isInteger(w) ||
          !Number.isInteger(h) ||
          w < 1 ||
          h < 1 ||
          w > 128 ||
          h > 128
        ) {
          setError(
            'Enter whole numbers from 1 to 128 hexes for both dimensions.'
          );
          return;
        }
        // Do not cancel first: that retires this render's owner intent.
        if (session.resizeWorkspace(w, h)) {
          setError(null);
          onFrameChange({ center: { x: 0, z: 0 }, zoom: 1 });
        } else {
          setError(
            'Resize refused. Keep these inputs; review the document notice, then fix the content or choose larger dimensions.'
          );
        }
      }}
      onKeyDown={(event): void => {
        if (event.key === 'Escape') {
          event.preventDefault();
          cancel();
        }
      }}
    >
      <span className="es-help">
        {workspace.kind === 'centered-odd-r'
          ? `Current: ${width} × ${height} hexes`
          : `Current: legacy hex-radius ${workspace.hexRadius} workspace (not a rectangle)`}
      </span>
      <label>
        Width (hexes)
        <input
          aria-label="Width (hexes)"
          type="text"
          inputMode="numeric"
          value={widthDraft}
          onChange={(event) => setWidthDraft(event.target.value)}
        />
      </label>
      <span aria-hidden="true">×</span>
      <label>
        Height (hexes)
        <input
          aria-label="Height (hexes)"
          type="text"
          inputMode="numeric"
          value={heightDraft}
          onChange={(event) => setHeightDraft(event.target.value)}
        />
      </label>
      <button type="submit">Apply dimensions</button>
      <button type="button" onClick={cancel}>
        Cancel dimensions
      </button>
      {error && <span role="alert">{error}</span>}
    </form>
  );
}
