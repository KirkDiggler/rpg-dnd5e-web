/**
 * YamlPane — live YAML text beside the board, two-way with it. Board
 * edits update this text immediately (via the parent's CST mutations);
 * text edits here re-parse (debounced + an explicit Apply button) back
 * into the board's doc model. Also carries the FIXTURES MODE / can't-
 * reach-server badges — the concept's probe semantics made visible —
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
 *
 * Kirk's 2026-08-02 reframe adds `dialectDropped`/`v1Compilable`: the document
 * may now use target-dialect-only constructs (walls/holes/start/end/
 * lighting/facing — TARGET-YAML.md). The compile-badge strip below the
 * server badge names exactly which ones are present and not yet compiled
 * server-side, and
 * Save & Play becomes "Save the compilable subset" the moment any are —
 * both computed once in `DungeonBuilderConcept.tsx` (`stripToV1Subset`)
 * and passed down, so this component never re-derives the strip itself.
 *
 * **Capability-probed graduation (this unit, 2026-08-04)**: the compile
 * badges and Save & Play's enable/disable used to read a hardcoded
 * snapshot of "what dungeonspec compiles" — stale the moment the server
 * moved (Kirk's authoring branch started compiling authored `walls:` and
 * bare `start:` for real). `dialectDropped`/`v1Compilable` are now
 * TRUTH-DRIVEN: `capabilityProbe.ts` probes the real server once per live
 * connection, `stripToV1Subset` reads the result, and everything below
 * just renders whatever it's handed — no field name is hardcoded in this
 * file. `dialectCompiling` is the new positive half of that same split:
 * constructs present AND accepted, so the badge strip can say "compiles
 * now" instead of silently omitting them. `capabilities`/
 * `onRefreshCapabilities` drive the small "server capabilities" readout
 * beside the LIVE badge — the same probe result, surfaced honestly rather
 * than only acted on invisibly.
 *
 * **Local drafts + versioned save/load (this unit)**: `DownloadYamlButton`/
 * `LoadYamlButton`/`SpecCompatBanner` below are the three new pieces,
 * exported the same way `CompileBadgeStrip`/`SaveAndPlayButton` already
 * are so `creation/ProposedYamlPane.tsx` reuses them instead of growing a
 * second copy. Download/Load never touch the server or `stripToV1Subset`
 * — Kirk's ruling, verbatim: "compatibility stripping should happen at
 * load time not save," so a downloaded/loaded file is always the complete
 * authoring dialect (`fileIO.ts`'s own doc comment has the full
 * reasoning). `SpecCompatBanner` renders the other half of "load time":
 * `specCompat.ts`'s spec-cut inference/mismatch, computed by the parent
 * and handed down as one plain-data prop — this component still never
 * imports `DungeonDoc` itself, same "don't deep-couple" bar CONTRACT.md's
 * Operating Bar section sets. */
import type { ValidationError } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import { useRef } from 'react';
import { capabilitySummary, type ServerCapabilities } from './capabilityProbe';
import { downloadYamlFile } from './fileIO';
import type { SpecCompatReport } from './specCompat';
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
  /** What `stripToV1Subset` would drop from the CURRENT document — empty
   * when the server accepts everything present. Drives both the amber
   * half of the compile-badge summary and the Save & Play button's
   * label/behavior. */
  dialectDropped: string[];
  /** The positive mirror of `dialectDropped`: target-dialect constructs
   * present AND accepted by the live server's own probed capabilities —
   * kept in the saved subset, not dropped. Empty in fixtures mode or
   * while the probe hasn't completed yet (same conservative fallback
   * `stripToV1Subset` itself uses). */
  dialectCompiling: string[];
  /** False when the stripped result is genuinely unsavable — see
   * `v1CompilableBlockers` for the SPECIFIC reason, rather than one
   * blanket message. */
  v1Compilable: boolean;
  /** Human-readable reasons `v1Compilable` is false ("needs at least 2
   * rooms (has 1)", "needs exactly one boss-archetype room with a
   * declared boss") — empty when `v1Compilable` is true. */
  v1CompilableBlockers: string[];
  /** `null` until the capability probe completes against a live server —
   * drives the "server capabilities" readout beside the LIVE badge. */
  capabilities: ServerCapabilities | null;
  onRefreshCapabilities: () => void;
  /** Filename the Download button writes — computed by the parent
   * (`${doc.key || 'dungeon'}.yaml`) so this component still never needs
   * `doc` itself. */
  downloadFilename: string;
  /** Wired by the parent straight to `applyText` (edit mode) /
   * `applyCreationText` (creation mode) — the SAME parse/Apply pipeline
   * the Apply button and debounced typing already use. See
   * `LoadYamlButton`'s own doc comment. */
  onLoadFile: (text: string) => void;
  /** The load-time spec-compatibility report (`specCompat.ts`) — see
   * `SpecCompatBanner`'s own doc comment. */
  specCompat: SpecCompatReport;
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

/** The "server capabilities" readout beside the LIVE badge — the
 * capability-probed graduation unit's own honesty surface: what did THIS
 * server actually say yes to, today, not what this file assumes. Renders
 * nothing outside live mode (nothing to probe) or before the probe
 * completes at all (`capabilities === null` with `serverState === 'live'`
 * reads as mid-probe, not "zero capabilities" — a blank readout, not a
 * false "0/N"). Exported so `creation/ProposedYamlPane.tsx` can show the
 * same honest readout rather than only edit mode. */
export function CapabilitiesLine({
  serverState,
  capabilities,
  onRefresh,
}: {
  serverState: ServerState;
  capabilities: ServerCapabilities | null;
  onRefresh: () => void;
}) {
  if (serverState !== 'live') return null;
  if (!capabilities) {
    return (
      <span style={{ fontSize: 10.5, color: '#8a7a5a' }}>
        probing server capabilities…
      </span>
    );
  }
  const { accepted, total } = capabilitySummary(capabilities);
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 10.5,
        color: '#8a7a5a',
      }}
    >
      server capabilities: accepts {accepted}/{total} dialect fields
      <button
        onClick={onRefresh}
        title="Re-run the per-field capability probe against this server"
        style={{
          fontSize: 10,
          background: 'none',
          border: '1px solid var(--border-primary)',
          color: '#8a7a5a',
          borderRadius: 3,
          padding: '0px 5px',
          cursor: 'pointer',
        }}
      >
        refresh
      </button>
    </span>
  );
}

/** The compile-badge summary, TARGET-YAML.md's "Compile badges" section:
 * per-feature, not per-line (the `yaml` CST doesn't cheaply give real
 * line/column spans without more plumbing than this honesty is worth).
 * Renders nothing for a document using no target-dialect construct at
 * all — the badge only appears the moment there's something real to say.
 *
 * Two halves, capability-probed graduation (this unit): `compiling`
 * (present AND accepted by the live server — a confirming, teal-toned
 * line) and `dropped` (present and NOT accepted — the original amber
 * "not yet compiled" line). A field flips from one to the other
 * automatically as `capabilities` changes; nothing here hardcodes which
 * field belongs in which bucket. Exported so `creation/ProposedYamlPane.tsx`
 * reuses the exact same badge rendering rather than a second copy. */
export function CompileBadgeStrip({
  dropped,
  compiling,
}: {
  dropped: string[];
  compiling: string[];
}) {
  if (dropped.length === 0 && compiling.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {compiling.length > 0 && (
        <div
          style={{
            fontSize: 11,
            color: '#8fe8b0',
            background: '#132018',
            border: '1px solid #2f5240',
            borderRadius: 4,
            padding: '5px 8px',
            lineHeight: 1.4,
          }}
        >
          Compiles on this server: {compiling.join(', ')}
        </div>
      )}
      {dropped.length > 0 && (
        <div
          style={{
            fontSize: 11,
            color: '#c9aeff',
            background: '#1c1526',
            border: '1px solid #3a2f52',
            borderRadius: 4,
            padding: '5px 8px',
            lineHeight: 1.4,
          }}
        >
          Uses: {dropped.join(', ')} — not yet accepted by this server
          (TARGET-YAML.md)
        </div>
      )}
    </div>
  );
}

/** The Save & Play button itself, capability-aware gating and all —
 * exported so `creation/ProposedYamlPane.tsx` can grow the SAME real
 * gating this unit gave edit mode's `YamlPane`, instead of duplicating
 * the disabled-state logic or (worse) keeping its own hardcoded "proposed
 * schema, can't compile" tooltip that a probed capability could make
 * false. `labelWhenPure` lets a caller keep a mode-appropriate label for
 * the fully-v1 case (both modes currently say "Save & Play"; kept as a
 * parameter rather than hardcoded so a future caller isn't forced to
 * match). */
export function SaveAndPlayButton({
  serverState,
  saveState,
  v1Compilable,
  v1CompilableBlockers,
  dialectDropped,
  dialectCompiling,
  onSaveAndPlay,
  labelWhenPure = 'Save & Play',
}: {
  serverState: ServerState;
  saveState: SaveState;
  v1Compilable: boolean;
  v1CompilableBlockers: string[];
  dialectDropped: string[];
  dialectCompiling: string[];
  onSaveAndPlay: () => void;
  labelWhenPure?: string;
}) {
  const hasDialectFields = dialectDropped.length > 0;
  const canSave =
    serverState === 'live' && saveState !== 'saving' && v1Compilable;
  return (
    <button
      onClick={() => onSaveAndPlay()}
      disabled={!canSave}
      title={
        serverState !== 'live'
          ? 'Server unreachable or authoring disabled — nothing to save to.'
          : !v1Compilable
            ? `Nothing compilable yet — ${v1CompilableBlockers.join('; ') || 'declare at least 2 rooms (dungeonspec.Validate requires it).'}`
            : hasDialectFields
              ? `Saves the v1-expressible SUBSET (validate_only: false). Dropped: ${dialectDropped.join(', ')}.${dialectCompiling.length > 0 ? ` Compiles: ${dialectCompiling.join(', ')}.` : ''}`
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
      {saveState === 'saving'
        ? 'Saving…'
        : hasDialectFields
          ? 'Save the compilable subset'
          : labelWhenPure}
    </button>
  );
}

/** Downloads the CURRENT, full-fidelity dialect YAML text — never
 * stripped, no server round trip (`fileIO.ts`'s `downloadYamlFile`). See
 * this file's own doc comment for Kirk's "stripping happens at load, not
 * save" ruling this button exists to satisfy. */
export function DownloadYamlButton({
  yamlText,
  filename,
}: {
  yamlText: string;
  filename: string;
}) {
  return (
    <button
      onClick={() => downloadYamlFile(filename, yamlText)}
      title="Download the complete authoring-dialect YAML — never stripped, no server round trip."
      style={{
        background: 'transparent',
        color: '#8a7a5a',
        border: '1px solid var(--border-primary)',
        borderRadius: 4,
        padding: '5px 10px',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      Download .yaml
    </button>
  );
}

/** Loads a `.yaml` file from disk into the SAME parse/Apply path the
 * Apply button and debounced typing already use (`onLoad`, wired by the
 * parent to `applyText`/`applyCreationText` directly — see
 * `DungeonBuilderConcept.tsx`'s `handleLoadYamlFile`) — no separate
 * pipeline, so a parse error surfaces exactly like Apply's already does.
 * A hidden file input behind a styled button, the standard pattern for a
 * button-triggered file picker. Resets its own value after each pick so
 * selecting the SAME file twice in a row still fires `onChange` (browsers
 * dedupe on unchanged `<input>` value otherwise). */
export function LoadYamlButton({ onLoad }: { onLoad: (text: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        title="Load a .yaml file — replaces the current document, same as pasting + Apply."
        style={{
          background: 'transparent',
          color: '#8a7a5a',
          border: '1px solid var(--border-primary)',
          borderRadius: 4,
          padding: '5px 10px',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Load .yaml
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".yaml,.yml,text/yaml"
        aria-label="Load dungeon YAML file"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          void file.text().then(onLoad);
        }}
      />
    </>
  );
}

/** The load-time spec-compatibility report (`specCompat.ts`, local-drafts
 * unit) — Kirk's ask: "we could have 0.4 able to load in the concept page
 * and want to run the v0.3 version of it if possible. maybe we can check
 * compatibility." Two lines, each independently honest: the declared-vs-
 * inferred spec CUT (a document-structure fact, nothing to do with any
 * live server), and — reusing `stripToV1Subset`'s own `dropped` list
 * verbatim, never recomputed — what the CONNECTED server would actually
 * drop from this document today (a live-capability fact). Renders nothing
 * when there is truly nothing to say: no `spec:` declared, the document
 * is 0.3-clean, and the server would drop nothing — the same "only appear
 * when there's something real to report" discipline `CompileBadgeStrip`
 * already follows. */
export function SpecCompatBanner({ report }: { report: SpecCompatReport }) {
  const { declaredSpec, inferredCut, inferredReasons, specMismatch } = report;
  const hasSpecLine =
    declaredSpec !== null || inferredCut === 'draft' || specMismatch;
  if (!hasSpecLine) return null;

  const specLine = specMismatch
    ? `spec: "${declaredSpec}" declared, but this document uses draft-only constructs: ${inferredReasons.join(', ')} — needs "draft", not "0.3".`
    : declaredSpec !== null
      ? `spec: "${declaredSpec}" — ${inferredCut === declaredSpec ? 'matches' : 'declared conservatively; inferred'} ${inferredCut === declaredSpec ? 'what this document actually uses.' : `"${inferredCut}" would also be accurate.`}`
      : inferredCut === 'draft'
        ? `No spec: declared — this document requires "draft" (uses: ${inferredReasons.join(', ')}).`
        : `No spec: declared — inferred "0.3" (only ratified constructs used).`;

  return (
    <div
      style={{
        fontSize: 11,
        color: specMismatch ? '#ff9a8a' : '#8fc9e8',
        background: specMismatch ? '#2a1512' : '#101f26',
        border: `1px solid ${specMismatch ? '#5a2a20' : '#2a4a5a'}`,
        borderRadius: 4,
        padding: '5px 8px',
        lineHeight: 1.4,
      }}
    >
      {specMismatch ? '⚠ ' : ''}
      {specLine}
    </div>
  );
}

/** Shared by both Save & Play and Walk it — `honestyNote`, when given, is
 * appended to the success message (Walk it's one real caveat: the boss
 * pin survives). */
export function SaveResultPanel({
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
  dialectDropped,
  dialectCompiling,
  v1Compilable,
  v1CompilableBlockers,
  capabilities,
  onRefreshCapabilities,
  downloadFilename,
  onLoadFile,
  specCompat,
}: YamlPaneProps) {
  const hasDialectFields = dialectDropped.length > 0;
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
          <DownloadYamlButton yamlText={yamlText} filename={downloadFilename} />
          <LoadYamlButton onLoad={onLoadFile} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ServerBadge serverState={serverState} onRetryProbe={onRetryProbe} />
        </div>
        <CapabilitiesLine
          serverState={serverState}
          capabilities={capabilities}
          onRefresh={onRefreshCapabilities}
        />
        <CompileBadgeStrip
          dropped={dialectDropped}
          compiling={dialectCompiling}
        />
        <SpecCompatBanner report={specCompat} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SaveAndPlayButton
            serverState={serverState}
            saveState={saveState}
            v1Compilable={v1Compilable}
            v1CompilableBlockers={v1CompilableBlockers}
            dialectDropped={dialectDropped}
            dialectCompiling={dialectCompiling}
            onSaveAndPlay={onSaveAndPlay}
          />
          <span style={{ fontSize: 11, color: '#8a7a5a' }}>
            {hasDialectFields
              ? 'saves the v1 subset — target-dialect fields dropped, see badge above'
              : 'persists for real — plays in the lobby dungeon picker'}
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
          Request error (programming error, not author feedback): {requestError}
        </div>
      )}

      <SaveResultPanel
        saveState={saveState}
        savedKey={savedKey}
        saveFieldErrors={saveFieldErrors}
        saveErrorMessage={saveErrorMessage}
        honestyNote={
          hasDialectFields
            ? `Saved the compilable subset — dropped: ${dialectDropped.join(', ')}.${dialectCompiling.length > 0 ? ` Compiled for real: ${dialectCompiling.join(', ')}.` : ''} (see TARGET-YAML.md).`
            : undefined
        }
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
