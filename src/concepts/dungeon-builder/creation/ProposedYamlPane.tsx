/**
 * ProposedYamlPane — renders the invented schema, styled distinctly from
 * the real YAML pane (dashed violet border, hazard-style banner) so it
 * never gets mistaken for something dungeonspec actually accepts today.
 * Carries a disabled "Save & Play" button (Kirk's 2026-08-01 ask) — honest
 * rather than half-real: this pane's schema is invented, so there is
 * nothing a real PutDungeon could persist yet.
 */
import type { CreationState } from './creationTypes';
import { serializeProposedSchema } from './proposedYaml';

export function ProposedYamlPane({ state }: { state: CreationState }) {
  const text = serializeProposedSchema(state);
  return (
    <aside
      style={{
        width: 420,
        flex: '0 0 420px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        borderLeft: '2px dashed #9b7fd6',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          background: '#241a33',
          borderBottom: '2px dashed #9b7fd6',
          color: '#c9aeff',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.04em',
          textTransform: 'uppercase',
        }}
      >
        Proposed schema — dungeonspec cannot express this today
      </div>
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px dashed #4a3a63',
        }}
      >
        <button
          disabled
          title="Proposed schema — the server can't compile this yet. Wall/shape authoring needs a real dungeonspec extension first (see CONTRACT.md)."
          style={{
            background: 'transparent',
            color: '#5a4d70',
            border: '1px solid #3a2f4d',
            borderRadius: 4,
            padding: '5px 10px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'not-allowed',
          }}
        >
          Save & Play
        </button>
      </div>
      <textarea
        readOnly
        aria-label="Proposed schema (invented, not real dungeonspec)"
        value={text}
        style={{
          flex: 1,
          minHeight: 0,
          resize: 'none',
          border: 'none',
          outline: 'none',
          background: '#170f22',
          color: '#d9c9f0',
          fontFamily: 'ui-monospace, Consolas, Menlo, monospace',
          fontSize: 12,
          lineHeight: 1.5,
          padding: '10px 12px',
          whiteSpace: 'pre',
        }}
      />
    </aside>
  );
}
