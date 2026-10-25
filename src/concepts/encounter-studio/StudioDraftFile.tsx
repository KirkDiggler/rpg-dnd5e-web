import { useRef, useState } from 'react';
import {
  exportDraftYaml,
  readDraftYaml,
  type DraftFileRead,
} from './draftFile';
import { FieldHelp } from './FieldHelp';
import type { EncounterStudioSession } from './studioSession';

/** A chosen file's text. FileReader rather than `Blob.text`, which some
 * embedded browsers lack. */
function readText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** The key the last import set, for the draft it set it for (S4-Q2). It is
 * studio state, never a document field. */
export interface DraftFileKey {
  key: string;
  roomId: string;
}

/** Export and import the draft as the file the decoder reads
 * (rpg-project#578, H7, H8): the panel the header's "Draft file" control
 * opens under the header. Export downloads the encoder's bytes as
 * `{key}.yaml`. Import reads a file, shows the decoder's
 * first refusal and changes nothing, or asks to replace the draft and then
 * replaces it in one undoable step.
 *
 * The key is the draft's one key (R16), held by the studio's publishing
 * hook and shared with the server save: this panel shows and edits it and
 * never keeps a copy. */
export function StudioDraftFile({
  session,
  draftKey,
  onKeyChange,
  keyRefusal,
  onFileKey,
  onOpenServer,
  onClose,
  mode = 'both',
}: {
  session: EncounterStudioSession;
  /** The draft's one key. (`key` itself is React's.) */
  draftKey: string;
  onKeyChange(next: string): void;
  /** The server's sentence for this key, shown at the field. */
  keyRefusal?: string | null;
  onFileKey(next: DraftFileKey): void;
  /** Opens the server save beside this panel. */
  onOpenServer?(): void;
  onClose?(): void;
  mode?: 'import' | 'export' | 'both';
}): React.JSX.Element {
  const document = session.document;
  const key = draftKey;
  const [pending, setPending] = useState<{
    file: string;
    read: Extract<DraftFileRead, { ok: true }>;
  } | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    refusal: boolean;
  } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const download = (): void => {
    const name = key.trim();
    let yaml: string;
    try {
      yaml = exportDraftYaml(document, name);
    } catch (error) {
      setMessage({
        text: `Could not export: ${error instanceof Error ? error.message : String(error)}`,
        refusal: true,
      });
      return;
    }
    const url = URL.createObjectURL(
      new Blob([yaml], { type: 'text/yaml;charset=utf-8' })
    );
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${name}.yaml`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage({ text: `Exported ${name}.yaml`, refusal: false });
  };

  const choose = async (file: File): Promise<void> => {
    const read = readDraftYaml(await readText(file));
    if (!read.ok) {
      setPending(null);
      setMessage({ text: read.refusal, refusal: true });
      return;
    }
    setMessage(null);
    setPending({ file: file.name, read });
  };

  const replace = (): void => {
    if (!pending) return;
    const { read, file } = pending;
    setPending(null);
    if (session.importDocument(read.draft, read.scope)) {
      onFileKey({ key: read.key, roomId: read.draft.id });
      setMessage({ text: `Imported ${file}`, refusal: false });
    } else
      setMessage({
        text: 'Could not import: the studio refused the document; the notice says why.',
        refusal: true,
      });
  };

  return (
    <section className="es-draft-file-panel" aria-label="Draft file">
      <h3>{mode === 'import' ? 'Import YAML' : 'Download YAML'}</h3>
      {mode !== 'import' && (
        <form
          aria-label="Export draft"
          className="es-buttons"
          onSubmit={(event) => {
            event.preventDefault();
            download();
          }}
        >
          <label className="es-field">
            <span>
              File key{' '}
              <FieldHelp field="File key">
                The dungeon key written into the file and its name, and the key
                Save and Play saves under: one key per draft. Lowercase letters,
                digits and dashes. An imported file&apos;s key is kept for its
                draft.
              </FieldHelp>
            </span>
            <input
              aria-label="File key"
              value={key}
              disabled={session.publishing.busy}
              onChange={(event) => onKeyChange(event.target.value)}
            />
          </label>
          <button type="submit">Download {key.trim() || '…'}.yaml</button>
          {keyRefusal && (
            <span role="alert" className="es-warning">
              {keyRefusal}
            </span>
          )}
        </form>
      )}
      <div className="es-buttons">
        {mode !== 'export' && (
          <>
            <p className="es-help">
              Open a site from a YAML file. You will confirm before replacing
              the current draft.
            </p>
            <button
              type="button"
              disabled={session.publishing.busy}
              onClick={() => input.current?.click()}
            >
              Choose YAML file
            </button>
            <input
              ref={input}
              type="file"
              accept=".yaml,.yml,text/yaml"
              aria-label="Draft file to import"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void choose(file);
              }}
            />
          </>
        )}
        {onOpenServer && (
          <button type="button" onClick={onOpenServer}>
            Save to server…
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose}>
            Close draft file
          </button>
        )}
      </div>
      {pending && (
        <div
          className="es-buttons"
          role="alertdialog"
          aria-label="Confirm import"
        >
          <span>
            Replace the current draft with “{pending.read.draft.name}” from{' '}
            {pending.file}? Undo restores the current draft.
          </span>
          <button type="button" onClick={replace}>
            Replace draft
          </button>
          <button type="button" onClick={() => setPending(null)}>
            Keep current draft
          </button>
        </div>
      )}
      {message && (
        <p
          role={message.refusal ? 'alert' : 'status'}
          className={message.refusal ? 'es-warning' : 'es-help'}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
