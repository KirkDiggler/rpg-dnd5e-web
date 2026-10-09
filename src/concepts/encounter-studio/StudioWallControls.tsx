import { useEffect, useState } from 'react';
import {
  resizeWallLength,
  rotateWall,
  setWallAppearance,
  translateWall,
  wallLength,
} from '../world-building/structuralWallEditing';
import type { EncounterStudioSession, StructuralWall } from './studioSession';

/** Presentation drafts only. Every accepted edit goes to the current owner. */
export function StudioWallControls({
  session,
  drawing,
  onDismiss,
  onExitWallTool,
}: {
  session: Pick<EncounterStudioSession, 'document' | 'wallEditing'>;
  drawing: boolean;
  onDismiss(): void;
  onExitWallTool(): void;
}): React.JSX.Element {
  const editing = session.wallEditing;
  const wall = (session.document.draft.room.walls ?? []).find(
    (entry) => entry.id === editing.selectedId
  );
  const selected = drawing ? undefined : wall;
  const [search, setSearch] = useState('');
  const [length, setLength] = useState('');
  const [lengthEdited, setLengthEdited] = useState(false);
  const [endpoint, setEndpoint] = useState<'start' | 'end'>('end');
  const [moveX, setMoveX] = useState('0');
  const [moveZ, setMoveZ] = useState('0');
  const [rotation, setRotation] = useState('0');
  const [feedback, setFeedback] = useState<string | null>(null);
  useEffect(() => {
    setLength(selected ? String(Number(wallLength(selected).toFixed(6))) : '');
    setLengthEdited(false);
    setMoveX('0');
    setMoveZ('0');
    setRotation('0');
  }, [selected, session.document]);
  useEffect(() => setFeedback(null), [selected?.id]);
  const apply = (operation: () => StructuralWall): boolean => {
    try {
      if (editing.edit(operation())) {
        setFeedback(null);
        return true;
      }
      setFeedback(
        'Wall edit refused. Review the document notice; your inputs are unchanged.'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(message);
      editing.reportRefusal(message);
    }
    return false;
  };
  const numeric = (value: string): number => {
    if (!value.trim() || !Number.isFinite(Number(value)))
      throw new Error('Enter finite numeric wall values.');
    return Number(value);
  };
  const query = search.trim().toLowerCase();
  const options = editing.options
    .filter((option) =>
      `${option.label} ${option.ref}`.toLowerCase().includes(query)
    )
    .sort((a, b) => Number(b.wallMatch) - Number(a.wallMatch));
  const assetRef = selected?.appearance.assetRef ?? editing.assetRef;
  const knownAsset = editing.options.find((option) => option.ref === assetRef);
  return (
    <section
      className="es-context-panel es-wall-controls"
      aria-label="Wall controls"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          if (drawing) onExitWallTool();
          else onDismiss();
        }
      }}
    >
      <div className="es-buttons">
        <strong>
          {selected
            ? `Selected wall: ${selected.label || selected.id}`
            : 'Wall appearance'}
        </strong>
        <button type="button" onClick={onDismiss}>
          Dismiss wall controls
        </button>
      </div>
      <p className="es-help">
        {drawing
          ? 'Choose an appearance, then drag on the map. Keep drawing successive walls · Escape exits Wall.'
          : 'Select and drag walls or their endpoints on the map. Precision values are optional.'}
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
      <p className="es-help">
        {assetRef
          ? `Appearance: ${knownAsset?.label ?? assetRef}`
          : 'No appearance armed. Choose any supported appearance below.'}
      </p>
      {assetRef && !knownAsset && (
        <p role="status">
          Unsupported imported appearance: {assetRef}. Preserved until you
          explicitly choose a replacement.
        </p>
      )}
      {selected && (
        <>
          <form
            className="es-buttons"
            aria-label="Wall exact length"
            onSubmit={(event) => {
              event.preventDefault();
              let clamped = false;
              let appliedLength = 0;
              if (
                apply(() => {
                  const result = resizeWallLength({
                    wall: selected,
                    endpoint,
                    // Display rounding is not an authoring intent. Only a
                    // field edit replaces the canonical length.
                    length: lengthEdited
                      ? numeric(length)
                      : wallLength(selected),
                  });
                  clamped = result.clamped;
                  appliedLength = result.appliedLength;
                  return result.wall;
                }) &&
                clamped
              )
                setFeedback(
                  `Clamped to preserve openings: ${appliedLength} world units.`
                );
            }}
          >
            <label>
              Length (world units)
              <input
                aria-label="Wall length"
                inputMode="decimal"
                value={length}
                onChange={(event) => {
                  setLength(event.target.value);
                  setLengthEdited(true);
                }}
              />
            </label>
            <label>
              Endpoint
              <select
                aria-label="Length endpoint"
                value={endpoint}
                onChange={(event) =>
                  setEndpoint(event.target.value as 'start' | 'end')
                }
              >
                <option value="end">End</option>
                <option value="start">Start</option>
              </select>
            </label>
            <button type="submit">Apply wall length</button>
          </form>
          <form
            className="es-buttons"
            aria-label="Wall movement"
            onSubmit={(event) => {
              event.preventDefault();
              apply(() =>
                translateWall(selected, {
                  x: numeric(moveX),
                  z: numeric(moveZ),
                })
              );
            }}
          >
            <label>
              Move X
              <input
                aria-label="Wall move X"
                inputMode="decimal"
                value={moveX}
                onChange={(event) => setMoveX(event.target.value)}
              />
            </label>
            <label>
              Move Z
              <input
                aria-label="Wall move Z"
                inputMode="decimal"
                value={moveZ}
                onChange={(event) => setMoveZ(event.target.value)}
              />
            </label>
            <button type="submit">Apply wall move</button>
          </form>
          <form
            className="es-buttons"
            aria-label="Wall rotation"
            onSubmit={(event) => {
              event.preventDefault();
              apply(() =>
                rotateWall(selected, {
                  angle: (numeric(rotation) * Math.PI) / 180,
                })
              );
            }}
          >
            <label>
              Rotate degrees
              <input
                aria-label="Wall rotate degrees"
                inputMode="decimal"
                value={rotation}
                onChange={(event) => setRotation(event.target.value)}
              />
            </label>
            <button type="submit">Apply wall rotation</button>
          </form>
          <button
            type="button"
            onClick={() => {
              if (editing.remove(selected.id)) onDismiss();
              else
                setFeedback(
                  'Wall removal refused. Review the document notice.'
                );
            }}
          >
            Remove wall
          </button>
        </>
      )}
      <label className="es-wall-search">
        Search appearances
        <input
          type="search"
          aria-label="Search wall appearances"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <p className="es-help">
        Wall matches first · All supported repeatable appearances remain
        available ({options.length})
      </p>
      {options.length === 0 && (
        <p role="status">No matching wall appearances. Try another search.</p>
      )}
      <div
        className="es-wall-options"
        role="group"
        aria-label="Wall appearance choices"
      >
        {options.map((option) => (
          <button
            type="button"
            key={option.ref}
            aria-label={`Choose appearance ${option.label}`}
            title={option.ref}
            aria-pressed={assetRef === option.ref}
            data-wall-appearance-ref={option.ref}
            onClick={() => {
              if (selected)
                apply(() =>
                  setWallAppearance(selected, {
                    ...selected.appearance,
                    assetRef: option.ref,
                  })
                );
              else editing.setAsset(option.ref);
            }}
          >
            {option.thumbnail.status === 'ready' ? (
              <img
                src={option.thumbnail.image}
                alt=""
                width={128}
                height={128}
              />
            ) : (
              <span className="es-wall-thumbnail-fallback">
                {option.thumbnail.status === 'loading'
                  ? 'Loading preview…'
                  : 'Preview unavailable'}
              </span>
            )}
            <span>{option.label}</span>
            {option.wallMatch && <small>Wall match</small>}
            {option.thumbnail.status === 'error' && (
              <small>{option.thumbnail.message}</small>
            )}
          </button>
        ))}
      </div>
      {feedback && <p role="alert">{feedback}</p>}
    </section>
  );
}
