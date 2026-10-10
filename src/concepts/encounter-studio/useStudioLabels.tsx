import { useEffect, useState, type ReactNode } from 'react';
import type {
  EncounterStudioSession,
  EncounterStudioView,
  LayoutLabelEditing,
  WorldPoint,
} from './studioSession';

/** UI-private staged controls. Canonical labels/IDs always come from session. */
export function useStudioLabels(
  session: EncounterStudioSession,
  view: EncounterStudioView,
  active: boolean,
  onActivate: () => void,
  onDismiss: () => void
): {
  active: boolean;
  activate(): void;
  deactivate(): void;
  editing: LayoutLabelEditing;
  controls: ReactNode;
} {
  const [visible, setVisible] = useState(false);
  const selectedId = session.mapLabelSelection.selectedId;
  const setSelectedId = session.mapLabelSelection.select;
  const [kind, setKind] = useState<'note' | 'room'>('note');
  const [placementKind, setPlacementKind] = useState<'note' | 'room'>('note');
  const [newText, setNewText] = useState('');
  const [placementText, setPlacementText] = useState<string | null>(null);
  const [x, setX] = useState('0');
  const [z, setZ] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const labels = session.document.draft.scene.mapLabels ?? [];
  const cancel = (): void => {
    setPlacementText(null);
    setX('0');
    setZ('0');
    setError(null);
  };
  useEffect(() => {
    // A new owner snapshot retires placement; clearing the previous selection
    // while arming a new label does not. Explicit selection cancels in handlers.
    setPlacementText(null);
  }, [session.document]);
  useEffect(() => {
    setPlacementText(null);
    setVisible(false);
  }, [view, session.document.draft.id]);
  const select = (id: string | null): void => {
    // Selection alone must not retire an in-flight label drag's owner intent.
    setSelectedId(id);
    setPlacementText(null);
  };
  const result = (accepted: boolean): boolean => {
    if (accepted) {
      setError(null);
      setPlacementText(null);
    } else
      setError(
        'Label edit refused. Review the document notice; use a nonblank name of at most 120 characters and a location inside the workspace.'
      );
    return accepted;
  };
  const create = (text: string, location: WorldPoint): boolean =>
    result(
      placementKind === 'room'
        ? session.regionEditing.createRoomLabel(text, location)
        : session.createMapLabel(text, location)
    );
  const move = (id: string, location: WorldPoint): boolean =>
    result(session.moveMapLabel(id, location));
  const coordinates = (): WorldPoint | null => {
    if (
      !x.trim() ||
      !z.trim() ||
      !Number.isFinite(Number(x)) ||
      !Number.isFinite(Number(z))
    ) {
      setError('Enter finite world X and Z coordinates.');
      return null;
    }
    return { x: Number(x), z: Number(z) };
  };
  return {
    active,
    activate: (): void => {
      setVisible(true);
      setSelectedId(null);
      cancel();
    },
    deactivate: (): void => {
      setVisible(false);
      setSelectedId(null);
      cancel();
    },
    editing: {
      active,
      placementText,
      placementKind,
      selectedId,
      onSelect: select,
      onCreate: create,
      onMove: move,
      onCancel: () => {
        cancel();
        setVisible(false);
        if (active || visible) onDismiss();
      },
    },
    controls:
      visible && view === 'layout' ? (
        <div
          className="es-label-controls es-context-panel"
          aria-label="Map label controls"
          onKeyDown={(event): void => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              cancel();
              setVisible(false);
              onDismiss();
            }
          }}
        >
          <button
            type="button"
            onClick={() => {
              cancel();
              setVisible(false);
              onDismiss();
            }}
          >
            Dismiss label controls
          </button>
          <form
            className="es-buttons"
            aria-label="New map label"
            onSubmit={(event): void => {
              event.preventDefault();
              if (!newText.trim() || newText.length > 120) {
                setError(
                  'Enter a nonblank label name of at most 120 characters.'
                );
                return;
              }
              if (!active) {
                onActivate();
              }
              setSelectedId(null);
              setPlacementKind(kind);
              setPlacementText(newText);
              setError(null);
            }}
          >
            <label>
              Label kind
              <select
                aria-label="Label kind"
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as 'note' | 'room');
                  setPlacementText(null);
                }}
              >
                <option value="room">Room · linked boundary</option>
                <option value="note">Note · text only</option>
              </select>
            </label>
            <label>
              Label name
              <input
                aria-label="Label name"
                value={newText}
                maxLength={120}
                onChange={(event) => setNewText(event.target.value)}
              />
            </label>
            <button type="submit">Place label on map</button>
          </form>
          <label>
            Existing label
            <select
              aria-label="Existing label"
              value={selectedId ?? ''}
              onChange={(event): void => {
                setSelectedId(event.target.value || null);
                setPlacementText(null);
              }}
            >
              <option value="">Choose label</option>
              {labels.map((label, index) => (
                <option key={label.id} value={label.id}>
                  {label.text} ({index + 1})
                </option>
              ))}
            </select>
          </label>
          <form
            className="es-buttons"
            aria-label="Map label coordinates"
            onSubmit={(event): void => {
              event.preventDefault();
              const location = coordinates();
              if (!location) return;
              if (placementText) create(placementText, location);
              else setError('Type a name and choose Place label on map first.');
            }}
          >
            <label>
              World X
              <input
                aria-label="New label world X"
                inputMode="decimal"
                value={x}
                onChange={(event) => setX(event.target.value)}
              />
            </label>
            <label>
              World Z
              <input
                aria-label="New label world Z"
                inputMode="decimal"
                value={z}
                onChange={(event) => setZ(event.target.value)}
              />
            </label>
            <button type="submit">Place label at coordinates</button>
          </form>
          {placementText && (
            <>
              <p className="es-help">
                Placing “{placementText}” (
                {placementKind === 'room' ? 'Room' : 'Note'}): click inside the
                map, or focus the map and press Enter to place at the view
                center. Escape cancels.
              </p>
              <button type="button" onClick={cancel}>
                Cancel placement
              </button>
            </>
          )}
          {error && <span role="alert">{error}</span>}
        </div>
      ) : null,
  };
}
