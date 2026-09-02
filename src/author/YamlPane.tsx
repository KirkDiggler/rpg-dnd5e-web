/**
 * YamlPane — the read-only mirror of the canvas (design §1): the file
 * the builder will save, the compiler's path-addressed problems, and
 * Download / Load. The YAML is the artifact; the canvas is a view of it.
 */
import type { FieldError } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useRef } from 'react';
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
}

export function YamlPane({
  yaml,
  filename,
  errors,
  warnings = [],
  statusLine,
  allowFileIO = true,
  onLoad,
}: YamlPaneProps) {
  const fileRef = useRef<HTMLInputElement>(null);
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
      <pre className="dg-yaml" data-testid="yaml-text">
        {yaml}
      </pre>
    </div>
  );
}
