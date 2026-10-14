import { useEffect, useState } from 'react';
import {
  DEFAULT_RESIZE_EDGES,
  growRoomWorkspace,
  rectangleOf,
  workspaceBounds,
  type ResizeEdges,
} from '../world-building/workspaceGeometry';
import type {
  EncounterStudioSession,
  EncounterStudioView,
  LayoutFrame,
} from './studioSession';

export function StudioDimensions({
  session,
  onFrameChange,
  view,
  onDismiss,
}: {
  session: EncounterStudioSession;
  view: EncounterStudioView;
  onFrameChange(frame: LayoutFrame): void;
  /** Absent: the form stays open after Apply (the room view). */
  onDismiss?(): void;
}): React.JSX.Element {
  const workspace = session.document.draft.workspace;
  const rect = rectangleOf(workspace);
  const width = rect ? String(rect.widthHexes) : '';
  const height = rect ? String(rect.heightHexes) : '';
  const [widthDraft, setWidthDraft] = useState(width);
  const [heightDraft, setHeightDraft] = useState(height);
  const [edges, setEdges] = useState<ResizeEdges>(DEFAULT_RESIZE_EDGES);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setWidthDraft(width);
    setHeightDraft(height);
    setError(null);
  }, [width, height, session.document, view]);
  const cancel = (): void => {
    setWidthDraft(width);
    setHeightDraft(height);
    setError(null);
    onDismiss?.();
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
        const accepted =
          edges.columns === DEFAULT_RESIZE_EDGES.columns &&
          edges.rows === DEFAULT_RESIZE_EDGES.rows
            ? session.resizeWorkspace(w, h)
            : session.resizeWorkspace(w, h, edges);
        if (accepted) {
          setError(null);
          // Frame what the author now has, wherever its edges went. The
          // owner committed exactly this workspace on this event.
          const bounds = workspaceBounds(
            growRoomWorkspace(workspace, w, h, edges)
          );
          onFrameChange({
            center: {
              x: (bounds.minX + bounds.maxX) / 2,
              z: (bounds.minZ + bounds.maxZ) / 2,
            },
            zoom: 1,
          });
          onDismiss?.();
        } else {
          setError(
            'Resize refused. Keep these inputs; review the document notice, then fix the content or choose larger dimensions.'
          );
        }
      }}
      onKeyDown={(event): void => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
    >
      <span className="es-help">
        {rect
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
      {rect && (
        <>
          <label>
            Columns change on
            <select
              aria-label="Columns change on"
              value={edges.columns}
              onChange={(event) =>
                setEdges((current) => ({
                  ...current,
                  columns: event.target.value as ResizeEdges['columns'],
                }))
              }
            >
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
          </label>
          <label>
            Rows change on
            <select
              aria-label="Rows change on"
              value={edges.rows}
              onChange={(event) =>
                setEdges((current) => ({
                  ...current,
                  rows: event.target.value as ResizeEdges['rows'],
                }))
              }
            >
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
            </select>
          </label>
          <span className="es-help">
            No cell moves, whichever side changes.
          </span>
        </>
      )}
      <button type="submit">Apply dimensions</button>
      <button type="button" onClick={cancel}>
        Cancel dimensions
      </button>
      {error && <span role="alert">{error}</span>}
    </form>
  );
}
