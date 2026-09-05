import { useEffect, useMemo, useState } from 'react';
import {
  isProviderReady,
  loadCalibrationDraft,
  mergeCatalogIntoBatch,
  normalizeYaw,
  parseCalibrationBatch,
  parseCalibrationCatalog,
  saveCalibrationDraft,
  serializeCalibrationBatch,
  validateCalibrationEntry,
  type CalibrationCatalog,
  type CalibrationEntry,
  type PropCalibrationState,
} from './model';
import { PropCalibrationScene } from './PropCalibrationScene';

const CATALOG_URL = '/models/synty/prop-calibration/catalog.json';
const THEMES = ['crypt', 'dungeon', 'library', 'cave', 'lair', 'market'];
const FACINGS = [0, 45, 90, 135, 180, 225, 270, 315] as const;

function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () =>
      reject(reader.error ?? new Error('Unable to read file'));
    reader.readAsText(file);
  });
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function replaceEntry(
  state: PropCalibrationState,
  entry: CalibrationEntry
): PropCalibrationState {
  const entries = [...state.batch.entries];
  entries[state.selectedIndex] = entry;
  return { ...state, batch: { ...state.batch, entries } };
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <span style={{ color: '#ff9c9c', fontSize: 11 }}>{message}</span>
  ) : null;
}

export function PropCalibrationLab() {
  const [catalog, setCatalog] = useState<CalibrationCatalog>();
  const [state, setState] = useState<PropCalibrationState>();
  const [loadError, setLoadError] = useState('');
  const [importError, setImportError] = useState('');
  const [facingDegrees, setFacingDegrees] = useState(0);
  const [cameraMode, setCameraMode] = useState<'orbit' | 'play'>('orbit');
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(CATALOG_URL)
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`catalog request returned ${response.status}`);
        return parseCalibrationCatalog(await response.json());
      })
      .then((loaded) => {
        if (cancelled) return;
        const draft = loadCalibrationDraft(window.localStorage);
        const batch = mergeCatalogIntoBatch(loaded, draft);
        setCatalog(loaded);
        setState({ batch, selectedIndex: 0 });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const detail = error instanceof Error ? error.message : String(error);
        setLoadError(
          `No prepared prop catalog is available (${detail}). Run the prop preparation command, then reload this page.`
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state) saveCalibrationDraft(window.localStorage, state.batch);
  }, [state]);

  const entry = state?.batch.entries[state.selectedIndex];
  const errors = useMemo(
    () => (entry ? validateCalibrationEntry(entry) : {}),
    [entry]
  );

  if (loadError) {
    return (
      <main
        aria-label="Prop Calibration Lab"
        style={{
          minHeight: '100vh',
          padding: 32,
          background: '#071011',
          color: '#e7f5f2',
        }}
      >
        <h1>Prop Calibration Lab</h1>
        <p role="alert">{loadError}</p>
      </main>
    );
  }
  if (!state || !catalog || !entry) {
    return (
      <main
        aria-label="Prop Calibration Lab"
        style={{
          minHeight: '100vh',
          padding: 32,
          background: '#071011',
          color: '#e7f5f2',
        }}
      >
        Loading prepared props…
      </main>
    );
  }

  const update = (next: CalibrationEntry) =>
    setState(replaceEntry(state, next));
  const updateCalibration = (patch: Partial<CalibrationEntry['calibration']>) =>
    update({ ...entry, calibration: { ...entry.calibration, ...patch } });
  const offset = entry.calibration.fineOffsetMeters;
  const ready = isProviderReady(state.batch);

  const importBatch = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = parseCalibrationBatch(await readFileText(file));
      const batch = mergeCatalogIntoBatch(catalog, imported);
      setState({ batch, selectedIndex: 0 });
      setImportError('');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
  };

  const exportBatch = () =>
    download(
      `${state.batch.batchId || 'prop-calibration-draft'}.json`,
      serializeCalibrationBatch(state.batch)
    );

  return (
    <main
      aria-label="Prop Calibration Lab"
      style={{
        height: '100vh',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 430px',
        background: '#071011',
        color: '#e7f5f2',
        overflow: 'hidden',
      }}
    >
      <section
        style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}
      >
        <header
          style={{ padding: '10px 14px', borderBottom: '1px solid #31504c' }}
        >
          <strong style={{ color: '#65f1df' }}>Prop Calibration Lab</strong>
          <span style={{ marginLeft: 12, color: '#9eb5b1', fontSize: 12 }}>
            local-only · source preview · provider transform not yet baked
          </span>
        </header>
        <div style={{ flex: 1, minHeight: 0 }}>
          <PropCalibrationScene
            url={entry.url}
            scale={entry.calibration.scale}
            yawDegrees={entry.calibration.yawDegrees + facingDegrees}
            fineOffsetMeters={entry.calibration.fineOffsetMeters}
            cameraMode={cameraMode}
            showRaw={showRaw}
          />
        </div>
        <div style={{ padding: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setCameraMode('orbit')}>
            Orbit camera
          </button>
          <button type="button" onClick={() => setCameraMode('play')}>
            Play camera
          </button>
          <label>
            <input
              type="checkbox"
              checked={showRaw}
              onChange={(event) => setShowRaw(event.target.checked)}
            />{' '}
            Raw overlay
          </label>
          {FACINGS.map((degrees) => (
            <button
              key={degrees}
              type="button"
              onClick={() => setFacingDegrees(degrees)}
            >
              {degrees}°
            </button>
          ))}
        </div>
      </section>

      <aside
        style={{
          overflowY: 'auto',
          borderLeft: '1px solid #31504c',
          padding: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            aria-label="Previous prop"
            disabled={state.selectedIndex === 0}
            onClick={() =>
              setState({ ...state, selectedIndex: state.selectedIndex - 1 })
            }
          >
            ←
          </button>
          <strong>
            Prop {state.selectedIndex + 1} / {state.batch.entries.length}
          </strong>
          <button
            type="button"
            aria-label="Next prop"
            disabled={state.selectedIndex >= state.batch.entries.length - 1}
            onClick={() =>
              setState({ ...state, selectedIndex: state.selectedIndex + 1 })
            }
          >
            →
          </button>
        </div>

        <fieldset>
          <legend>Batch</legend>
          <label>
            Batch ID
            <input
              aria-label="Batch ID"
              value={state.batch.batchId}
              onChange={(event) =>
                setState({
                  ...state,
                  batch: { ...state.batch, batchId: event.target.value },
                })
              }
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Prepared source</legend>
          <label>
            Pack
            <input
              readOnly
              value={`${entry.source.packSlug}/${entry.source.packVersion}`}
            />
          </label>
          <label>
            Source path
            <input
              aria-label="Source path"
              readOnly
              value={entry.source.sourcePath}
            />
          </label>
          <label>
            GLB SHA-256
            <input
              aria-label="GLB SHA-256"
              readOnly
              value={entry.source.glbSha256}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Identity</legend>
          <label>
            Display name
            <input
              aria-label="Display name"
              value={entry.displayName}
              onChange={(event) =>
                update({ ...entry, displayName: event.target.value })
              }
            />
            <FieldError message={errors.displayName} />
          </label>
          <label>
            Family ref
            <input
              aria-label="Family ref"
              value={entry.familyRef}
              onChange={(event) =>
                update({ ...entry, familyRef: event.target.value })
              }
            />
            <FieldError message={errors.familyRef} />
          </label>
          <label>
            Exact ref
            <input
              aria-label="Exact ref"
              value={entry.ref}
              onChange={(event) =>
                update({ ...entry, ref: event.target.value })
              }
            />
            <FieldError message={errors.ref} />
          </label>
          <label>
            <input
              type="checkbox"
              checked={entry.defaultForFamily}
              onChange={(event) =>
                update({ ...entry, defaultForFamily: event.target.checked })
              }
            />{' '}
            Default for family
          </label>
        </fieldset>

        <fieldset>
          <legend>Calibration</legend>
          <label>
            Scale
            <input
              aria-label="Scale"
              type="range"
              min="0.05"
              max="5"
              step="0.01"
              value={entry.calibration.scale}
              onChange={(event) =>
                updateCalibration({ scale: Number(event.target.value) })
              }
            />
            <input
              aria-label="Scale value"
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              value={entry.calibration.scale}
              onChange={(event) =>
                updateCalibration({ scale: Number(event.target.value) })
              }
            />
            <FieldError message={errors.scale} />
          </label>
          <label>
            Base yaw
            <input
              aria-label="Base yaw"
              type="range"
              min="-180"
              max="179"
              step="1"
              value={normalizeYaw(entry.calibration.yawDegrees)}
              onChange={(event) =>
                updateCalibration({ yawDegrees: Number(event.target.value) })
              }
            />
            <input
              aria-label="Base yaw value"
              type="number"
              step="1"
              value={entry.calibration.yawDegrees}
              onChange={(event) =>
                updateCalibration({
                  yawDegrees: normalizeYaw(Number(event.target.value)),
                })
              }
            />
            <FieldError message={errors.yawDegrees} />
          </label>
          {(['X', 'Y', 'Z'] as const).map((axis, index) => (
            <label key={axis}>
              Fine offset {axis} (m)
              <input
                aria-label={`Fine offset ${axis}`}
                type="number"
                min={axis === 'Y' ? -0.1 : -0.5}
                max={axis === 'Y' ? 0.1 : 0.5}
                step="0.01"
                value={offset[index]}
                onChange={(event) => {
                  const next: [number, number, number] = [...offset];
                  next[index] = Number(event.target.value);
                  updateCalibration({ fineOffsetMeters: next });
                }}
              />
              <FieldError message={errors[`fineOffset${axis}`]} />
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Game properties</legend>
          <label>
            Placement
            <input readOnly value="floor" />
          </label>
          <label>
            Role
            <select
              aria-label="Role"
              value={entry.role}
              onChange={(event) =>
                update({
                  ...entry,
                  role: event.target.value as CalibrationEntry['role'],
                })
              }
            >
              <option value="decor">Decor</option>
              <option value="cover">Cover</option>
              <option value="obstacle">Obstacle</option>
            </select>
          </label>
          <label>
            Themes
            <input
              aria-label="Themes"
              list="prop-calibration-themes"
              value={entry.themes.join(', ')}
              onChange={(event) =>
                update({
                  ...entry,
                  themes: event.target.value
                    .split(',')
                    .map((theme) => theme.trim())
                    .filter(Boolean),
                })
              }
            />
            <datalist id="prop-calibration-themes">
              {THEMES.map((theme) => (
                <option key={theme} value={theme} />
              ))}
            </datalist>
            <FieldError message={errors.themes} />
          </label>
          <label>
            <input
              type="checkbox"
              checked={entry.blocksMovement}
              onChange={(event) =>
                update({ ...entry, blocksMovement: event.target.checked })
              }
            />{' '}
            Blocks movement
          </label>
          <label>
            <input
              type="checkbox"
              checked={entry.blocksLoS}
              onChange={(event) =>
                update({ ...entry, blocksLoS: event.target.checked })
              }
            />{' '}
            Blocks line of sight
          </label>
          <label>
            Notes
            <textarea
              aria-label="Notes"
              value={entry.notes}
              onChange={(event) =>
                update({ ...entry, notes: event.target.value })
              }
            />
          </label>
        </fieldset>

        {importError && <p role="alert">Import failed: {importError}</p>}
        <label>
          Import batch JSON
          <input
            aria-label="Import batch JSON"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importBatch(event.target.files?.[0])}
          />
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={exportBatch}>
            Export draft
          </button>
          <button type="button" disabled={!ready} onClick={exportBatch}>
            Export provider batch
          </button>
        </div>
        <p style={{ color: ready ? '#73e6a5' : '#e8be72', fontSize: 12 }}>
          {ready
            ? 'Provider-ready batch.'
            : 'Complete every required field before provider export.'}
        </p>
      </aside>
    </main>
  );
}
