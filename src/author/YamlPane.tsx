/**
 * YamlPane — the file the builder will save, the compiler's path-addressed
 * problems, and Download / Load. The YAML is the artifact; the canvas is a
 * view of it (design §1).
 *
 * With `onEdit` the pane is the SECOND way to author, not just a mirror
 * (rpg-dnd5e-web#899): the text is typed into directly and every keystroke is
 * offered to the parser. Two rules keep that from fighting the canvas, which
 * is the other author of this same text:
 *
 *   - **While the textarea has focus the typist owns it.** The emitter
 *     canonicalises — sorting entries, reflowing rows — so resyncing
 *     mid-keystroke would move the caret and rewrite the author's formatting
 *     under their hands. The canonical form lands on blur instead.
 *   - **Text that does not parse is never discarded.** A blur with an
 *     unparsed draft keeps the draft, so a half-finished edit survives a
 *     click on the canvas rather than vanishing.
 */
import type { FieldError } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useEffect, useRef, useState } from 'react';
import { downloadYamlFile } from './fileIO';

export interface YamlPaneProps {
  yaml: string;
  filename: string;
  errors: FieldError[];
  /** Concealment leaks the compiler itself never reports — a concealed
   * door whose room is already reachable another way (rpg-dnd5e-web#893).
   * Shown distinctly from `errors`: the document still compiles. */
  warnings?: { message: string }[];
  statusLine: string;
  allowFileIO?: boolean;
  onLoad: (text: string) => void;
  /** Accept typed YAML. Returns the parse failure to show, or null when the
   * text was taken. Omitted leaves the pane the read-only mirror it was —
   * the Concepts mount has no document to write back to. */
  onEdit?: (text: string) => string | null;
}

export function YamlPane({
  yaml,
  filename,
  errors,
  warnings = [],
  statusLine,
  allowFileIO = true,
  onLoad,
  onEdit,
}: YamlPaneProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(yaml);
  const [parseError, setParseError] = useState<string | null>(null);
  const focused = useRef(false);

  // The canvas edits this same text. Take its version whenever the typist is
  // not holding the caret and has nothing unparsed in flight.
  useEffect(() => {
    if (focused.current || parseError !== null) return;
    setDraft(yaml);
  }, [yaml, parseError]);
  return (
    <div className="flex flex-col gap-2 min-h-0 h-full" data-testid="yaml-pane">
      <div className="flex items-center gap-2">
        <h3 className="dg-h flex-1">YAML</h3>
        {allowFileIO && (
          <>
            <button
              type="button"
              className="dg-mini"
              onClick={() => downloadYamlFile(filename, yaml)}
            >
              Download
            </button>
            <button
              type="button"
              className="dg-mini"
              onClick={() => fileRef.current?.click()}
            >
              Load
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".yaml,.yml"
              className="hidden"
              data-testid="yaml-file-input"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) onLoad(await file.text());
                e.target.value = '';
              }}
            />
          </>
        )}
      </div>
      <div className="text-xs opacity-80" data-testid="status-line">
        {statusLine}
      </div>
      {errors.length > 0 && (
        <ul className="dg-errors" data-testid="error-list">
          {errors.map((err, i) => (
            <li key={`${err.path}-${i}`}>
              <code>{err.path}</code> {err.message}
            </li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="dg-warnings" data-testid="warning-list">
          {warnings.map((w, i) => (
            <li key={i}>{w.message}</li>
          ))}
        </ul>
      )}
      {parseError !== null && (
        <div className="dg-yaml-parse" data-testid="yaml-parse-error">
          {parseError}
        </div>
      )}
      {onEdit ? (
        <textarea
          className="dg-yaml dg-yaml--edit"
          data-testid="yaml-text"
          aria-label="Dungeon YAML"
          spellCheck={false}
          value={draft}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            // Take the canonical emit back only if the draft was accepted;
            // an unparsed draft is the author's unfinished work, not junk.
            if (parseError === null) setDraft(yaml);
          }}
          onChange={(e) => {
            const text = e.target.value;
            setDraft(text);
            setParseError(onEdit(text));
          }}
        />
      ) : (
        <pre className="dg-yaml" data-testid="yaml-text">
          {yaml}
        </pre>
      )}
    </div>
  );
}
