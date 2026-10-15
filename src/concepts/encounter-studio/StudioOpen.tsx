/**
 * OPEN FROM THE SERVER (rpg-project#585, R22, R24). The header's Open sits
 * beside Save and Play and opens this panel: This world, every encounter
 * the caller's world holds with its owner and the caller's own marked
 * Mine, then References. Opening reads the file and passes it through
 * `readDraftYaml`, the reader the draft file's Import uses, so a file from
 * the server and a file from disk are refused alike; the surface does the
 * import. Only the caller's own rows offer Rename and Delete, and the
 * server still refuses anyone else's. The panel holds no file state beyond
 * the question it is asking.
 */
import type { AuthoringGateState } from '@/author/useAuthoringGate';
import type { DungeonSummary } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { useEffect, useRef, useState } from 'react';
import { readDraftYaml, type DraftFileRead } from './draftFile';
import {
  OWNERS_NOT_ON_SERVER_SENTENCE,
  type DungeonLibrary,
} from './dungeonLibrary';
import { serverUnavailableReason } from './studioPublishing';

export const EMPTY_WORLD_SENTENCE =
  'Nothing saved in this world yet. Save and Play saves here.';

export type OpenedFile = {
  read: Extract<DraftFileRead, { ok: true }>;
  key: string;
  /** `copy`: another member's file or a reference (R24). */
  source: 'mine' | 'copy';
};

/** The header control beside Save and Play. With the server not accepting
 * authoring it is disabled with the sentence Save and Play shows (R18). */
export function StudioOpenButton({
  gate,
  panelOpen,
  onPress,
}: {
  gate: AuthoringGateState;
  panelOpen: boolean;
  onPress(): void;
}): React.JSX.Element {
  const reason = serverUnavailableReason(gate);
  return (
    <button
      type="button"
      disabled={reason !== null}
      title={reason ?? undefined}
      aria-describedby={reason ? 'studio-play-reason' : undefined}
      aria-expanded={panelOpen}
      aria-controls="studio-open"
      onClick={onPress}
    >
      Open
    </button>
  );
}

export interface StudioOpenProps {
  library: DungeonLibrary;
  gate: AuthoringGateState;
  onOpen(opened: OpenedFile): void;
  onRenamed(from: string, to: string): void;
  onDeleted(key: string): void;
  onClose(): void;
}

type Asking =
  | { kind: 'replace'; summary: DungeonSummary; opened: OpenedFile }
  | { kind: 'delete'; summary: DungeonSummary };

export function StudioOpen({
  library,
  gate,
  onOpen,
  onRenamed,
  onDeleted,
  onClose,
}: StudioOpenProps): React.JSX.Element {
  const [asking, setAsking] = useState<Asking | null>(null);
  const [renaming, setRenaming] = useState<{
    key: string;
    value: string;
  } | null>(null);
  /** The server's or the reader's sentence, on the row it is about. */
  const [refusals, setRefusals] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const answerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (asking) answerRef.current?.focus();
  }, [asking]);
  const reason = serverUnavailableReason(gate);

  const refuse = (key: string, refusal: string | null): void =>
    setRefusals((current) => {
      const next = { ...current };
      if (refusal === null) delete next[key];
      else next[key] = refusal;
      return next;
    });

  const open = async (summary: DungeonSummary): Promise<void> => {
    setAsking(null);
    setBusyKey(summary.key);
    const file = await library.read(summary.key);
    setBusyKey(null);
    if (!file.ok) return refuse(summary.key, file.refusal);
    const read = readDraftYaml(file.yaml);
    if (!read.ok) return refuse(summary.key, read.refusal);
    refuse(summary.key, null);
    setAsking({
      kind: 'replace',
      summary,
      opened: {
        read,
        key: summary.key,
        source: library.isMine(summary) ? 'mine' : 'copy',
      },
    });
  };

  const rename = async (key: string, value: string): Promise<void> => {
    const newKey = value.trim();
    setBusyKey(key);
    const result = await library.rename(key, newKey);
    setBusyKey(null);
    if (!result.ok) return refuse(key, result.refusal);
    refuse(key, null);
    setRenaming(null);
    onRenamed(key, newKey);
  };

  const remove = async (key: string): Promise<void> => {
    setAsking(null);
    setBusyKey(key);
    const result = await library.remove(key);
    setBusyKey(null);
    if (!result.ok) return refuse(key, result.refusal);
    refuse(key, null);
    onDeleted(key);
  };

  const row = (summary: DungeonSummary, world: boolean): React.JSX.Element => {
    const mine = world && library.isMine(summary);
    const busy = busyKey === summary.key;
    const refusal = refusals[summary.key];
    const askingHere =
      asking !== null && asking.summary.key === summary.key ? asking : null;
    return (
      <li key={summary.key} aria-label={summary.name || summary.key}>
        <div className="es-buttons">
          <span>
            {summary.name || summary.key} <small>{summary.key}</small>
            {world && (
              <>
                {' '}
                {mine ? (
                  <strong className="es-open-mine">Mine</strong>
                ) : (
                  <small>by {summary.owner}</small>
                )}
              </>
            )}
          </span>
          <button
            type="button"
            aria-label={`Open ${summary.key}`}
            disabled={busy}
            onClick={() => void open(summary)}
          >
            Open
          </button>
          {mine && (
            <>
              <button
                type="button"
                aria-label={`Rename ${summary.key}`}
                disabled={busy}
                onClick={() => {
                  setAsking(null);
                  setRenaming({ key: summary.key, value: summary.key });
                }}
              >
                Rename
              </button>
              <button
                type="button"
                aria-label={`Delete ${summary.key}`}
                disabled={busy}
                onClick={() => {
                  setRenaming(null);
                  setAsking({ kind: 'delete', summary });
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
        {renaming?.key === summary.key && (
          <form
            className="es-buttons"
            aria-label={`Rename ${summary.key}`}
            onSubmit={(event) => {
              event.preventDefault();
              void rename(summary.key, renaming.value);
            }}
          >
            <label className="es-field">
              <span>New key</span>
              <input
                aria-label="New key"
                value={renaming.value}
                disabled={busy}
                onChange={(event) =>
                  setRenaming({ key: summary.key, value: event.target.value })
                }
              />
            </label>
            <button type="submit" disabled={busy}>
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(null);
                refuse(summary.key, null);
              }}
            >
              Cancel
            </button>
          </form>
        )}
        {askingHere?.kind === 'replace' && (
          <div
            className="es-buttons"
            role="alertdialog"
            aria-label={`Replace with ${summary.key}`}
          >
            <span>
              Replace the current draft with {summary.name || summary.key}? Undo
              brings it back.
            </span>
            <button
              type="button"
              ref={answerRef}
              onClick={() => {
                setAsking(null);
                onOpen(askingHere.opened);
              }}
            >
              Replace
            </button>
            <button type="button" onClick={() => setAsking(null)}>
              Keep
            </button>
          </div>
        )}
        {askingHere?.kind === 'delete' && (
          <div
            className="es-buttons"
            role="alertdialog"
            aria-label={`Delete ${summary.key}`}
          >
            <span>
              Delete {summary.key} from the server? This cannot be undone.
            </span>
            <button
              type="button"
              ref={answerRef}
              onClick={() => void remove(summary.key)}
            >
              Delete
            </button>
            <button type="button" onClick={() => setAsking(null)}>
              Keep
            </button>
          </div>
        )}
        {refusal && (
          <p role="alert" className="es-warning">
            {refusal}
          </p>
        )}
      </li>
    );
  };

  return (
    <section
      className="es-draft-file-panel es-open-panel"
      aria-label="Open from server"
    >
      <div className="es-buttons">
        <button type="button" onClick={onClose}>
          Close Open
        </button>
        {library.status === 'ready' && (
          <button type="button" onClick={() => void library.refetch()}>
            Refresh
          </button>
        )}
      </div>
      {reason ? (
        <p className="es-help" role="status">
          {reason}
        </p>
      ) : library.status === 'error' ? (
        <p role="alert" className="es-warning">
          Could not list encounters: {library.message}{' '}
          <button type="button" onClick={() => void library.refetch()}>
            Retry
          </button>
        </p>
      ) : library.status !== 'ready' ? (
        <p className="es-help" role="status">
          Loading encounters…
        </p>
      ) : (
        <>
          {!library.sourcesKnown && (
            <p className="es-help">{OWNERS_NOT_ON_SERVER_SENTENCE}</p>
          )}
          <h3 id="studio-open-world">This world</h3>
          {library.world.length === 0 ? (
            <p className="es-help">{EMPTY_WORLD_SENTENCE}</p>
          ) : (
            <ul className="es-open-list" aria-labelledby="studio-open-world">
              {library.world.map((summary) => row(summary, true))}
            </ul>
          )}
          <h3 id="studio-open-references">References</h3>
          <ul className="es-open-list" aria-labelledby="studio-open-references">
            {library.references.map((summary) => row(summary, false))}
          </ul>
        </>
      )}
    </section>
  );
}
