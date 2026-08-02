/**
 * ProposedYamlPane — the "New Dungeon" canvas's YAML, styled distinctly
 * from the real edit-mode pane (dashed violet border, hazard-style
 * banner) so it never gets mistaken for something dungeonspec accepts
 * today. As of the CST unification (CONTRACT.md), this is no longer a
 * hand-serialized approximation — it's the REAL `serializeDungeon(cst)`
 * text for creation mode's own document, editable and round-tripping
 * the same way edit mode's YamlPane is, just without that pane's
 * server/compile-badge/save chrome: creation mode still makes no server
 * calls (design.md defers wall/shape authoring to P4+; a real
 * PutDungeon for a freeform canvas needs a dungeonspec extension that
 * doesn't exist yet), so "Save & Play" stays disabled here rather than
 * pretending there's somewhere real for this to go.
 */
interface ProposedYamlPaneProps {
  yamlText: string;
  onChangeText: (text: string) => void;
  parseError: string | null;
}

export function ProposedYamlPane({
  yamlText,
  onChangeText,
  parseError,
}: ProposedYamlPaneProps) {
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
        aria-label="Proposed schema (invented, not real dungeonspec)"
        value={yamlText}
        onChange={(e) => onChangeText(e.target.value)}
        spellCheck={false}
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
      {parseError && (
        <div
          style={{
            padding: '6px 12px',
            background: '#3a1c18',
            color: '#ff9a8a',
            fontSize: 11,
            borderTop: '1px dashed #5a2a20',
          }}
        >
          {parseError}
        </div>
      )}
    </aside>
  );
}
