/**
 * YamlPane — live YAML text beside the board, two-way with it. Board
 * edits update this text immediately (via the parent's CST mutations);
 * text edits here re-parse (debounced + an explicit Apply button) back
 * into the board's doc model. Also carries the FIXTURES MODE / can't-
 * reach-server badges — plan.md S4a's probe semantics made visible —
 * "Save & Play" (`useSaveDungeon.ts`, Kirk's 2026-08-01 ask), and "Walk it
 * (no monsters)" (Kirk's 2026-08-02 ask): a second, independent save of a
 * `<key>-walk` variant with monster `place:` entries stripped. Both
 * actions share the SAME `useSaveDungeon` hook shape (two separate
 * instances, one per action, in `DungeonBuilderConcept.tsx`) and the same
 * `SaveResultPanel` rendering, distinguished only by an `honestyNote` for
 * Walk it's one real caveat: `boss:` is NOT stripped (dungeonspec requires
 * exactly one boss per boss-archetype room — `stripMonsterPlacements`'s
 * own doc comment in `dungeonYaml.ts`), so the walk variant still has its
 * boss standing there. The UI says so rather than implying a true
 * no-encounter walkthrough that doesn't exist yet.
 */
import type { ValidationError } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import type { ServerState } from './usePutDungeonPreview';
import type { SaveState } from './useSaveDungeon';

interface YamlPaneProps {
  yamlText: string;
  onChangeText: (text: string) => void;
  onApply: () => void;
  parseError: string | null;
  serverState: ServerState;
  requestError: string | null;
  fieldErrors: ValidationError[];
  onRetryProbe: () => void;
  onSaveAndPlay: () => void;
  saveState: SaveState;
  savedKey: string | null;
  saveFieldErrors: ValidationError[];
  saveErrorMessage: string | null;
  onWalkIt: () => void;
  walkState: SaveState;
  walkSavedKey: string | null;
  walkFieldErrors: ValidationError[];
  walkErrorMessage: string | null;
}

function ServerBadge({
  serverState,
  onRetryProbe,
}: {
  serverState: ServerState;
  onRetryProbe: () => void;
}) {
  if (serverState === 'probing') {
    return (
      <span style={{ fontSize: 11, color: '#8a7a5a' }}>probing server…</span>
    );
  }
  if (serverState === 'live') {
    return (
      <span style={{ fontSize: 11, color: '#5fd1c9' }}>
        ● LIVE — PutDungeon reachable
      </span>
    );
  }
  if (serverState === 'gate-off') {
    return (
      <span
        style={{ fontSize: 11, color: '#ffb347' }}
        title="RPG_AUTHORING_ENABLED is not set on the server"
      >
        ● FIXTURES MODE — authoring disabled on this server
      </span>
    );
  }
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        color: '#ff9a8a',
      }}
    >
      ● FIXTURES MODE — can’t reach the server
      <button
        onClick={onRetryProbe}
        style={{
          fontSize: 10,
          background: 'none',
          border: '1px solid #5a2a20',
          color: '#ff9a8a',
          borderRadius: 3,
          padding: '1px 6px',
          cursor: 'pointer',
        }}
      >
        retry
      </button>
    </span>
  );
}

/** Shared by both Save & Play and Walk it — `honestyNote`, when given, is
 * appended to the success message (Walk it's one real caveat: the boss
 * pin survives). */
function SaveResultPanel({
  saveState,
  savedKey,
  saveFieldErrors,
  saveErrorMessage,
  honestyNote,
}: {
  saveState: SaveState;
  savedKey: string | null;
  saveFieldErrors: ValidationError[];
  saveErrorMessage: string | null;
  honestyNote?: string;
}) {
  if (saveState === 'saved') {
    return (
      <div
        style={{
          background: '#16261c',
          borderTop: '1px solid #3a5a45',
          color: '#8fe8b0',
          fontSize: 12,
          padding: '8px 12px',
          lineHeight: 1.5,
        }}
      >
        <strong>Saved as "{savedKey}".</strong> Open{' '}
        <a
          href="http://localhost:3001/"
          target="_blank"
          rel="noreferrer"
          style={{ color: '#5fd1c9' }}
        >
          http://localhost:3001/
        </a>{' '}
        and pick "{savedKey}" in the dungeon dropdown to play it.
        {honestyNote && (
          <div style={{ color: '#ffb347', marginTop: 4 }}>{honestyNote}</div>
        )}
      </div>
    );
  }
  if (saveState === 'invalid') {
    return (
      <div
        style={{
          background: '#2a1512',
          borderTop: '1px solid #5a2a20',
          color: '#ff9a8a',
          fontSize: 11.5,
          padding: '8px 12px',
        }}
      >
        <strong>Save rejected — dungeonspec.Validate failed:</strong>
        {saveFieldErrors.map((e, i) => (
          <div key={i}>{e.message}</div>
        ))}
      </div>
    );
  }
  if (saveState === 'error') {
    return (
      <div
        style={{
          background: '#2a1512',
          borderTop: '1px solid #5a2a20',
          color: '#ff9a8a',
          fontSize: 11.5,
          padding: '8px 12px',
        }}
      >
        Save failed: {saveErrorMessage}
      </div>
    );
  }
  return null;
}

export function YamlPane({
  yamlText,
  onChangeText,
  onApply,
  parseError,
  serverState,
  requestError,
  fieldErrors,
  onRetryProbe,
  onSaveAndPlay,
  saveState,
  savedKey,
  saveFieldErrors,
  saveErrorMessage,
  onWalkIt,
  walkState,
  walkSavedKey,
  walkFieldErrors,
  walkErrorMessage,
}: YamlPaneProps) {
  const canSave = serverState === 'live' && saveState !== 'saving';
  const canWalk = serverState === 'live' && walkState !== 'saving';
  return (
    <aside
      style={{
        width: 420,
        flex: '0 0 420px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        borderLeft: '1px solid var(--border-primary)',
      }}
    >
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={onApply}
            style={{
              background: '#c9a227',
              color: '#14110f',
              border: 'none',
              borderRadius: 4,
              padding: '5px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Apply YAML → Board
          </button>
          <span
            style={{ fontSize: 11, color: parseError ? '#ff9a8a' : '#8a7a5a' }}
          >
            {parseError ? 'parse error — board unchanged' : 'in sync'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ServerBadge serverState={serverState} onRetryProbe={onRetryProbe} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => onSaveAndPlay()}
            disabled={!canSave}
            title={
              serverState !== 'live'
                ? 'Server unreachable or authoring disabled — nothing to save to.'
                : 'PutDungeon(validate_only: false) — persists this dungeon for real.'
            }
            style={{
              background: canSave ? '#5fd1c9' : 'var(--bg-secondary)',
              color: canSave ? '#14110f' : '#6a6255',
              border: canSave ? 'none' : '1px solid var(--border-primary)',
              borderRadius: 4,
              padding: '5px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: canSave ? 'pointer' : 'not-allowed',
            }}
          >
            {saveState === 'saving' ? 'Saving…' : 'Save & Play'}
          </button>
          <span style={{ fontSize: 11, color: '#8a7a5a' }}>
            persists for real — plays in the lobby dungeon picker
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => onWalkIt()}
            disabled={!canWalk}
            title={
              serverState !== 'live'
                ? 'Server unreachable or authoring disabled — nothing to save to.'
                : 'Saves a "<key>-walk" variant with monster place: entries stripped. The boss pin stays — dungeonspec requires a boss in a boss-archetype room, so this is not a true no-encounter walkthrough yet.'
            }
            style={{
              background: canWalk ? 'transparent' : 'var(--bg-secondary)',
              color: canWalk ? '#c9a227' : '#6a6255',
              border: canWalk
                ? '1px solid #c9a227'
                : '1px solid var(--border-primary)',
              borderRadius: 4,
              padding: '5px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: canWalk ? 'pointer' : 'not-allowed',
            }}
          >
            {walkState === 'saving' ? 'Saving…' : 'Walk it (no monsters)'}
          </button>
          <span style={{ fontSize: 11, color: '#8a7a5a' }}>
            saves "&lt;key&gt;-walk" — boss stays (see tooltip)
          </span>
        </div>
      </div>

      <textarea
        aria-label="Dungeon YAML"
        spellCheck={false}
        value={yamlText}
        onChange={(e) => onChangeText(e.target.value)}
        style={{
          flex: 1,
          minHeight: 0,
          resize: 'none',
          border: 'none',
          outline: 'none',
          background: '#100d0b',
          color: '#d9e6d0',
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
            background: '#2a1512',
            borderTop: '1px solid #5a2a20',
            color: '#ff9a8a',
            fontSize: 11.5,
            padding: '8px 12px',
            whiteSpace: 'pre-wrap',
          }}
        >
          {parseError}
        </div>
      )}

      {fieldErrors.length > 0 && (
        <div
          style={{
            background: '#2a1512',
            borderTop: '1px solid #5a2a20',
            color: '#ff9a8a',
            fontSize: 11.5,
            padding: '8px 12px',
          }}
        >
          <strong>field_errors (live, from PutDungeon):</strong>
          {fieldErrors.map((e, i) => (
            <div key={i}>{e.message}</div>
          ))}
        </div>
      )}

      {requestError && (
        <div
          style={{
            background: '#2a1512',
            borderTop: '1px solid #5a2a20',
            color: '#ff9a8a',
            fontSize: 11.5,
            padding: '8px 12px',
          }}
        >
          Request error (programming error, not author feedback — plan.md S4c):{' '}
          {requestError}
        </div>
      )}

      <SaveResultPanel
        saveState={saveState}
        savedKey={savedKey}
        saveFieldErrors={saveFieldErrors}
        saveErrorMessage={saveErrorMessage}
      />
      <SaveResultPanel
        saveState={walkState}
        savedKey={walkSavedKey}
        saveFieldErrors={walkFieldErrors}
        saveErrorMessage={walkErrorMessage}
        honestyNote="Boss remains — real free-roam mode needs server support (see CONTRACT.md)."
      />
    </aside>
  );
}
