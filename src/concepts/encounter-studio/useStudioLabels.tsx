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
  view: EncounterStudioView
): {
  active: boolean;
  activate(): void;
  deactivate(): void;
  editing: LayoutLabelEditing;
  controls: ReactNode;
} {
  const [active, setActive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newText, setNewText] = useState('');
  const [placementText, setPlacementText] = useState<string | null>(null);
  const [rename, setRename] = useState('');
  const [x, setX] = useState('0');
  const [z, setZ] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const labels = session.document.draft.scene.mapLabels ?? [];
  const selected = labels.find((label) => label.id === selectedId);
  const cancel = (): void => {
    setPlacementText(null);
    setRename(selected?.text ?? '');
    setX(String(selected?.location.x ?? 0));
    setZ(String(selected?.location.z ?? 0));
    setError(null);
  };
  useEffect(() => {
    setPlacementText(null);
    setRename(selected?.text ?? '');
    setX(String(selected?.location.x ?? 0));
    setZ(String(selected?.location.z ?? 0));
    setError(null);
    if (!selected) setSelectedId(null);
  }, [session.document, selected]);
  useEffect(() => {
    setPlacementText(null);
    setActive(false);
    setSelectedId(null);
  }, [view, session.document.draft.id]);
  const select = (id: string): void => {
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
    result(session.createMapLabel(text, location));
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
      setActive(true);
      setSelectedId(null);
      cancel();
    },
    deactivate: (): void => {
      setActive(false);
      setSelectedId(null);
      cancel();
    },
    editing: {
      active,
      placementText,
      selectedId,
      onSelect: select,
      onCreate: create,
      onMove: move,
      onCancel: cancel,
    },
    controls:
      (active || selected) && view === 'layout' ? (
        <div
          className="es-label-controls es-toolbar"
          aria-label="Map label controls"
          onKeyDown={(event): void => {
            if (event.key === 'Escape') {
              event.preventDefault();
              cancel();
            }
          }}
        >
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
                session.cancelTransients();
                setActive(true);
              }
              setSelectedId(null);
              setPlacementText(newText);
              setError(null);
            }}
          >
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
          {selected && (
            <form
              className="es-buttons"
              aria-label="Rename map label"
              onSubmit={(event): void => {
                event.preventDefault();
                result(session.renameMapLabel(selected.id, rename));
              }}
            >
              <label>
                Rename label
                <input
                  aria-label="Rename label"
                  value={rename}
                  maxLength={120}
                  onChange={(event) => setRename(event.target.value)}
                />
              </label>
              <button type="submit">Apply label name</button>
              <button type="button" onClick={cancel}>
                Cancel label edit
              </button>
              <button
                type="button"
                onClick={() => result(session.deleteMapLabel(selected.id))}
              >
                Delete label
              </button>
            </form>
          )}
          <form
            className="es-buttons"
            aria-label="Map label coordinates"
            onSubmit={(event): void => {
              event.preventDefault();
              const location = coordinates();
              if (!location) return;
              if (selected) move(selected.id, location);
              else if (placementText) create(placementText, location);
              else setError('Type a name and choose Place label on map first.');
            }}
          >
            <label>
              World X
              <input
                aria-label="Label world X"
                inputMode="decimal"
                value={x}
                onChange={(event) => setX(event.target.value)}
              />
            </label>
            <label>
              World Z
              <input
                aria-label="Label world Z"
                inputMode="decimal"
                value={z}
                onChange={(event) => setZ(event.target.value)}
              />
            </label>
            <button type="submit">
              {selected ? 'Apply label position' : 'Place label at coordinates'}
            </button>
          </form>
          {placementText && (
            <>
              <p className="es-help">
                Placing “{placementText}”: click inside the map, or focus the
                map and press Enter to place at the view center. Escape cancels.
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
