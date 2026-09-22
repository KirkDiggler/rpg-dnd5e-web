/**
 * RoomPublishingPanel — the focused room publishing control (plan §2):
 * the root `Dungeon key`, live server validation with truthful staleness,
 * explicit existing-key confirmation, canonical YAML export/import, and
 * the Save / Save & Play verbs over the shared launch flow.
 *
 * Rendered ONLY by the World Builder route's room mode: the capability
 * (selected character + App.handlePlayAuthored) is injected from the
 * route, so the prop-composition mode and the local-only concept mounts
 * render no publishing controls and make no authoring RPC. There is no
 * fixture fallback: an unreachable server is an explicit refusal.
 *
 * While a save/launch transaction mutates server state the panel reports
 * busy upward (Back, mode switching, document changes are refused there)
 * and disables its own controls.
 *
 * The site `scope` (root `factions`/`dispositions`) is forwarded verbatim to
 * the transaction: it is the editor document's own state and the emitted
 * YAML — the request identity — is a function of it (rpg-dnd5e-web#1157).
 */
import { useEffect, useRef, useState } from 'react';
import type {
  RoomPublishingCapability,
  UseRoomPublishingInput,
} from './useRoomPublishing';
import { useRoomPublishing } from './useRoomPublishing';

export type RoomPublishingPanelProps = Omit<
  UseRoomPublishingInput,
  'capability'
> & {
  capability: RoomPublishingCapability;
};

function previewLine(status: string): string | null {
  switch (status) {
    case 'validating':
      return 'Server is checking the latest edits…';
    case 'compiled':
      return 'Server validation passed for the current source.';
    case 'unreachable':
      return 'Authoring server unreachable — nothing was saved.';
    default:
      return null;
  }
}

export function RoomPublishingPanel({
  draft,
  scope,
  capability,
  client,
  onImportDraft,
  onBusyChange,
}: RoomPublishingPanelProps) {
  const publishing = useRoomPublishing({
    draft,
    scope,
    capability,
    client,
    onImportDraft,
    onBusyChange,
  });
  const {
    key,
    setKey,
    yaml,
    encodeError,
    validate,
    preview,
    busy,
    phase,
    error,
    setError,
    overwritePending,
    saver,
    savedFor,
    launch,
    save,
    saveAndPlay,
    confirmOverwrite,
    cancelOverwrite,
    importYaml,
  } = publishing;
  /** In-flight textarea text; null shows the encoded current source. */
  const [yamlDraft, setYamlDraft] = useState<string | null>(null);
  /** The armed overwrite confirmation takes focus when it appears, so a
   * Save click that only asked a question cannot read as a silent no-op. */
  const overwriteConfirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (overwritePending) overwriteConfirmRef.current?.focus();
  }, [overwritePending]);

  /** Save refusals describe the exact submitted text; they are truthful
   * only while the current document still is that text. The "Saved"
   * status is likewise bound to the exact request it completed — a stale
   * saved state can never present as current after an identity change. */
  const saveErrorsCurrent =
    saver.errors.length > 0 &&
    saver.submittedYaml !== null &&
    saver.submittedYaml === yaml;
  const savedCurrent =
    saver.status === 'saved' &&
    savedFor !== null &&
    savedFor.key === key.trim() &&
    savedFor.roomId === draft.id &&
    savedFor.yaml === yaml;

  return (
    <div className="wb-publish" aria-label="Publish room">
      <label>
        <span>Dungeon key</span>
        <input
          aria-label="Dungeon key"
          value={key}
          disabled={busy}
          maxLength={200}
          onChange={(event) => setKey(event.target.value)}
          placeholder="room-…"
        />
      </label>
      <p className="wb-help">
        The key names this room on the authoring server. It travels only with
        canonical YAML export/import — local room JSON and world snapshots stay
        room-only. Room-name edits never rename the key.
      </p>
      {!key.trim() && (
        <p className="wb-help" data-testid="key-request">
          This room ID cannot form a default key — enter an explicit dungeon key
          to publish.
        </p>
      )}

      {/* The strict-SHAPE layer's own refusal, verbatim: a document the
          decoder cannot represent is named here instead of leaving the server
          preview silently inert (rpg-dnd5e-web#1160). */}
      {encodeError && (
        <p className="wb-alert" role="alert" data-testid="encode-refusal">
          This document cannot be encoded yet: {encodeError}
        </p>
      )}

      {preview.status !== 'idle' && (
        <div className="wb-publish-status" aria-live="polite">
          <span data-testid="publish-validation">
            {preview.status === 'errors'
              ? `Server validation found ${preview.errors.length} problem${
                  preview.errors.length === 1 ? '' : 's'
                }`
              : previewLine(preview.status)}
            {preview.status === 'validating' &&
              saver.status !== 'idle' &&
              ' (showing the last completed result)'}
          </span>
          {preview.status === 'errors' && (
            <ul className="wb-field-errors">
              {preview.errors.map((fieldError, index) => (
                <li key={`${fieldError.path}:${index}`}>
                  <code>{fieldError.path}</code> {fieldError.message}
                </li>
              ))}
            </ul>
          )}
          {preview.status === 'unreachable' && preview.message && (
            <span>{preview.message}</span>
          )}
        </div>
      )}

      {saveErrorsCurrent && (
        <div className="wb-publish-status" role="alert">
          <span>Server refused the last save of this exact source:</span>
          <ul className="wb-field-errors">
            {saver.errors.map((fieldError, index) => (
              <li key={`${fieldError.path}:${index}`}>
                <code>{fieldError.path}</code> {fieldError.message}
              </li>
            ))}
          </ul>
          {saver.message && <span>{saver.message}</span>}
        </div>
      )}
      {saver.status === 'error' && saver.message && (
        <p className="wb-alert" role="alert">
          Save failed — the draft and local bytes were kept. {saver.message}
        </p>
      )}
      {savedCurrent && !busy && (
        <p className="wb-help" aria-live="polite">
          Saved to the authoring server as “{savedFor.key}”.
        </p>
      )}

      {overwritePending && (
        <div
          className="wb-confirm"
          role="alertdialog"
          aria-label={`Overwrite ${overwritePending.key}`}
        >
          <span>
            No save happened yet. The key “{overwritePending.key}” already names
            a dungeon on the authoring server
            {draft.name.trim() ? ` — this room is “${draft.name.trim()}”` : ''}.
            Overwrite that existing dungeon with the current source?
          </span>
          <button
            type="button"
            ref={overwriteConfirmRef}
            disabled={busy}
            onClick={() => void confirmOverwrite()}
          >
            Overwrite “{overwritePending.key}”
          </button>
          <button type="button" onClick={cancelOverwrite}>
            Cancel
          </button>
        </div>
      )}

      {error && (
        <p className="wb-alert" role="alert">
          {error}
        </p>
      )}
      {launch.error && (
        <p className="wb-alert" role="alert">
          {launch.error}
        </p>
      )}

      <div className="wb-actions">
        <button
          type="button"
          disabled={busy || !yaml}
          title={yaml ? undefined : 'Fix the document before validating it'}
          onClick={validate}
        >
          Validate with server
        </button>
        <button type="button" disabled={busy} onClick={() => void save()}>
          {busy && phase === 'checking-key'
            ? 'Checking key…'
            : busy && phase === 'saving'
              ? 'Saving…'
              : 'Save to server'}
        </button>
        <button
          type="button"
          disabled={busy || !capability.characterId}
          title={
            capability.characterId
              ? undefined
              : 'Pick a character on Home to play'
          }
          aria-describedby={
            capability.characterId ? undefined : 'wb-play-disabled-reason'
          }
          onClick={() => void saveAndPlay()}
        >
          {busy && (phase === 'launching' || launch.launching)
            ? 'Starting…'
            : 'Save & Play'}
        </button>
      </div>
      {!capability.characterId && (
        <p className="wb-help" id="wb-play-disabled-reason">
          Pick a character on Home to play. You can still save the room to the
          authoring server.
        </p>
      )}

      <details className="wb-yaml-exchange">
        <summary>Canonical YAML</summary>
        <p className="wb-help">
          Export includes the root dungeon key; importing adopts the file's key
          and room. Local room JSON and world snapshots deliberately stay
          room-only.
        </p>
        <textarea
          aria-label="Canonical YAML"
          value={yamlDraft ?? yaml ?? ''}
          maxLength={500_000}
          disabled={busy}
          onChange={(event) => setYamlDraft(event.target.value)}
          placeholder="Export appears here, or paste a canonical single-room YAML to import it."
        />
        <div className="wb-actions">
          <button
            type="button"
            disabled={busy || !yaml}
            onClick={() => {
              if (!yaml) return;
              setYamlDraft(yaml);
              const url = URL.createObjectURL(
                new Blob([yaml], { type: 'text/yaml;charset=utf-8' })
              );
              const anchor = document.createElement('a');
              anchor.href = url;
              anchor.download = 'single-room-dungeon.yaml';
              anchor.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export canonical YAML
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const text = (yamlDraft ?? '').trim();
              if (!text) {
                setError('Paste a canonical single-room YAML to import.');
                return;
              }
              if (importYaml(text)) setYamlDraft(null);
            }}
          >
            Import canonical YAML
          </button>
        </div>
      </details>
    </div>
  );
}
