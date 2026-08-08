/**
 * BoardCrashRecovery — the Dungeon Builder's last line of defense (this
 * unit, rpg-project#194 authoring-robustness, "the YAML is always
 * fixable"). Kirk white-screened his entire builder hand-editing YAML:
 * `walls:` entries the parser accepted (loose shape validation, since
 * fixed — see `dungeonYaml.ts`'s `assertCellPair`) crashed the board on
 * render, autosave captured the broken text, and every reload restored +
 * re-crashed it — the only way out was manually clearing `localStorage`
 * in DevTools.
 *
 * This component is the recovery surface for BOTH ways a document can
 * still put the board in a state it can't show, even after parse-time
 * shape validation closes the known gap:
 *
 * 1. **A live render crash** — `DungeonBuilderConcept.tsx` wraps the
 *    board tree in an `ErrorBoundary`; its `onError` hands the caught
 *    error + the CURRENT `creationYamlText` (whatever produced the
 *    crash) to this component instead of the boundary's own generic
 *    fallback UI.
 * 2. **A restored draft that fails to (re-)parse** — the mount-time
 *    draft-restore path used to silently discard an unparseable draft
 *    (safe, but lossy: the author's broken text just vanished, exactly
 *    the "had to manually clear localStorage" pain this unit exists to
 *    retire). It now routes here instead, with the ORIGINAL draft text
 *    intact.
 *
 * Either way the contract is the same: nothing the author typed is ever
 * lost, the error is stated plainly, and the SAME editable-YAML +
 * explicit-Apply interaction the (non-crashed) `ProposedYamlPane`
 * offers is available here too — fixing the text and applying is always
 * enough to get back in, no DevTools required.
 */
import { AlertTriangle } from 'lucide-react';

export interface BoardCrashRecoveryProps {
  /** The caught error's own message, or the `DungeonParseError` message
   * from a failed (re-)parse — never a generic "something went wrong";
   * see this file's own doc comment on why an honest message matters
   * here specifically. */
  errorMessage: string;
  /** The exact text that produced the crash/parse-failure — NEVER the
   * fresh-seed fallback the board itself is quietly showing underneath
   * (draft-restore case) or was last showing (render-crash case). */
  yamlText: string;
  onChangeText: (text: string) => void;
  /** Re-parses `yamlText` and, on success, hands the board a fresh doc to
   * try rendering again. On failure, the caller updates `errorMessage`
   * in place — this component never guesses at success/failure itself. */
  onApply: () => void;
  /** Throws the stuck draft/document away entirely and reloads the
   * mode's fresh empty-canvas seed — the explicit escape hatch for when
   * the content itself isn't worth saving. */
  onDiscardDraft: () => void;
}

export function BoardCrashRecovery({
  errorMessage,
  yamlText,
  onChangeText,
  onApply,
  onDiscardDraft,
}: BoardCrashRecoveryProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 560,
        border: '1px solid #5a2a20',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: '#2a1512',
          borderBottom: '1px solid #5a2a20',
          color: '#ff9a8a',
          padding: '14px 18px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          <AlertTriangle size={18} />
          The board couldn't show this dungeon
        </div>
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 12.5,
            lineHeight: 1.5,
            fontFamily: 'ui-monospace, Consolas, Menlo, monospace',
          }}
        >
          {errorMessage}
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#c9a89a' }}>
          Nothing has been lost — the YAML below is exactly what caused this.
          Fix it and Apply to try again, or discard it and start from a fresh
          canvas.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            onClick={onApply}
            style={{
              background: '#5fd1c9',
              color: '#14110f',
              border: 'none',
              borderRadius: 4,
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Apply &amp; retry
          </button>
          <button
            onClick={onDiscardDraft}
            style={{
              background: 'transparent',
              color: '#ff9a8a',
              border: '1px solid #5a2a20',
              borderRadius: 4,
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Discard draft &amp; start fresh
          </button>
        </div>
      </div>
      <textarea
        aria-label="Dungeon YAML (recovery)"
        value={yamlText}
        onChange={(e) => onChangeText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            onApply();
          }
        }}
        spellCheck={false}
        style={{
          flex: 1,
          minHeight: 420,
          resize: 'vertical',
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
    </div>
  );
}
