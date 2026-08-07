/**
 * DraftRestoredBanner — the "draft restored" affordance (local-drafts
 * unit). Shown once per mount when `DungeonBuilderConcept.tsx` found a
 * local draft (`draftStorage.ts`) for the current mode and loaded it
 * instead of the mode's default seed (`SHOWCASE_YAML`/`emptyCanvasYaml`).
 * Rendered above the board (sibling to the mode tabs), not inside
 * `YamlPane`/`ProposedYamlPane` — it's a board-level fact (the whole
 * working document came from a draft, not just the text pane), same
 * reasoning `ToastBanner` in `DungeonBuilderConcept.tsx` already applies
 * to page-level, not pane-level, notices.
 *
 * Two independent actions, deliberately not conflated:
 * - **Dismiss** (`onDismiss`) — keep the restored draft as the working
 *   document, just stop showing the banner. The author's edits.
 * - **Discard draft** (`onDiscard`) — throw the local draft away and
 *   reload the mode's default seed instead, for when the restored
 *   content isn't wanted at all.
 */
export function DraftRestoredBanner({
  savedAt,
  onDismiss,
  onDiscard,
}: {
  savedAt: number;
  onDismiss: () => void;
  onDiscard: () => void;
}) {
  const when = new Date(savedAt).toLocaleString();
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 16px',
        background: '#1c2233',
        borderBottom: '1px solid #3a4a6a',
        color: '#9ac2ff',
        fontSize: 12,
      }}
    >
      <span>Draft restored from {when} (local, unsaved).</span>
      <button
        onClick={onDiscard}
        style={{
          background: 'transparent',
          color: '#9ac2ff',
          border: '1px solid #3a4a6a',
          borderRadius: 3,
          padding: '2px 8px',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        Discard draft
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss draft-restored notice"
        title="Keep the restored draft, just hide this notice"
        style={{
          marginLeft: 'auto',
          background: 'transparent',
          color: '#9ac2ff',
          border: 'none',
          fontSize: 14,
          lineHeight: 1,
          cursor: 'pointer',
          padding: '0 4px',
        }}
      >
        ×
      </button>
    </div>
  );
}
