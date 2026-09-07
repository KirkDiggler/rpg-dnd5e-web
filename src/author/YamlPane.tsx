/**
 * YamlPane — the file the builder will save, with Download / Load. The YAML
 * is the artifact; the canvas is a view of it (design §1).
 *
 * The compiler's status line and its path-addressed problems used to live
 * here. They belong to the BUILDER, not to one view of it: the rail shows
 * one pane at a time now (rpg-dnd5e-web#945), and an author on the Scenario
 * tab watching Save stay disabled has to be able to read why.
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
 *
 * The draft is the BUILDER'S state, not this component's: the rail shows one
 * pane at a time now (rpg-dnd5e-web#945), so this pane unmounts whenever the
 * author looks at the inspector, and a promise that unparsed text is never
 * discarded cannot be kept by something that stops existing. `draft === null`
 * means "showing the file"; anything else is what the typist has in flight.
 */
import { useRef } from 'react';
import { downloadYamlFile } from './fileIO';

export interface YamlPaneProps {
  yaml: string;
  filename: string;
  allowFileIO?: boolean;
  onLoad: (text: string) => void;
  /** The text in flight, or null while the pane is showing the file. */
  draft: string | null;
  /** Why that draft does not parse, or null. */
  parseError: string | null;
  /** Hand both back to the builder — `(null, null)` to go back to the
   * file. */
  onDraft: (draft: string | null, parseError: string | null) => void;
  /** Accept typed YAML. Returns the parse failure to show, or null when the
   * text was taken. Omitted leaves the pane the read-only mirror it was —
   * the Concepts mount has no document to write back to. */
  onEdit?: (text: string) => string | null;
}

export function YamlPane({
  yaml,
  filename,
  allowFileIO = true,
  onLoad,
  onEdit,
  draft,
  parseError,
  onDraft,
}: YamlPaneProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const focused = useRef(false);
  // The canvas edits this same text, so with nothing in flight the pane just
  // shows the file — no resync, and nothing to go stale.
  const shown = draft ?? yaml;
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
          value={shown}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            // Show the canonical emit again only if the draft was accepted;
            // an unparsed draft is the author's unfinished work, not junk.
            if (parseError === null) onDraft(null, null);
          }}
          onChange={(e) => {
            const text = e.target.value;
            onDraft(text, onEdit(text));
          }}
        />
      ) : (
        <pre className="dg-yaml" data-testid="yaml-text">
          {shown}
        </pre>
      )}
    </div>
  );
}
