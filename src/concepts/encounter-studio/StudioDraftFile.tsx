import { useRef, useState } from 'react';
import {
  defaultDraftKey,
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
 * (rpg-project#578, H7, H8), beside the local save. Export downloads the
 * encoder's bytes as `{key}.yaml`. Import reads a file, shows the decoder's
 * first refusal and changes nothing, or asks to replace the draft and then
 * replaces it in one undoable step. */
export function StudioDraftFile({
  session,
  fileKey,
  onFileKey,
}: {
  session: EncounterStudioSession;
  fileKey: DraftFileKey | null;
  onFileKey(next: DraftFileKey): void;
}): React.JSX.Element {
  const document = session.document;
  const suggested =
    fileKey && fileKey.roomId === document.draft.id
      ? fileKey.key
      : defaultDraftKey(document);
  const [exporting, setExporting] = useState<string | null>(null);
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
    const key = (exporting ?? '').trim();
    let yaml: string;
    try {
      yaml = exportDraftYaml(document, key);
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
    link.download = `${key}.yaml`;
    link.click();
    URL.revokeObjectURL(url);
    setExporting(null);
    setMessage({ text: `Exported ${key}.yaml`, refusal: false });
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
    <div className="es-draft-file" role="group" aria-label="Draft file">
      <button
        type="button"
        aria-expanded={exporting !== null}
        onClick={() => {
          setMessage(null);
          setExporting(exporting === null ? suggested : null);
        }}
      >
        Export draft
      </button>
      <button type="button" onClick={() => input.current?.click()}>
        Import draft
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
      {exporting !== null && (
        <form
          className="es-buttons"
          aria-label="Export draft"
          onSubmit={(event) => {
            event.preventDefault();
            download();
          }}
        >
          <label className="es-field">
            <span>
              File key{' '}
              <FieldHelp field="File key">
                The dungeon key written into the file and its name. An imported
                file&apos;s key is kept for its draft.
              </FieldHelp>
            </span>
            <input
              aria-label="File key"
              value={exporting}
              onChange={(event) => setExporting(event.target.value)}
            />
          </label>
          <button type="submit">Download {exporting.trim() || '…'}.yaml</button>
          <button type="button" onClick={() => setExporting(null)}>
            Cancel
          </button>
        </form>
      )}
      {pending && (
        <div
          className="es-warning"
          role="alertdialog"
          aria-label="Confirm import"
        >
          <span>
            Replace the current draft with “{pending.read.draft.name}” from{' '}
            {pending.file}? Undo restores the current draft.
          </span>
          <span className="es-buttons">
            <button type="button" onClick={replace}>
              Replace draft
            </button>
            <button type="button" onClick={() => setPending(null)}>
              Keep current draft
            </button>
          </span>
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
    </div>
  );
}
